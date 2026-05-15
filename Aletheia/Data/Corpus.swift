import Foundation
import Observation
import GRDB

/// Read-only access to the bundled Aletheia.sqlite corpus.
///
/// Construction is async-safe but cheap — the DatabasePool is opened lazily.
/// Use one instance per app (held by ``CorpusContainer``).
final class Corpus: Sendable {
    private let pool: DatabasePool

    init(databasePath: String) throws {
        var config = Configuration()
        config.readonly = true
        config.label = "Aletheia.corpus"
        self.pool = try DatabasePool(path: databasePath, configuration: config)
    }

    func listBibleBooks() async throws -> [BookSummary] {
        try await pool.read { db in
            try Row.fetchAll(db, sql: """
                SELECT b.slug, b.name, b.abbreviation, b.testament, COUNT(c.id) AS chapter_count
                FROM book b
                LEFT JOIN chapter c ON c.book_id = b.id
                WHERE b.language = 'en_bsb' OR b.language = 'en_kjv' OR b.language = 'en_brenton'
                GROUP BY b.slug
                ORDER BY b.order_index ASC
                """).compactMap { row in
                guard
                    let slug: String = row["slug"],
                    let name: String = row["name"],
                    let abbr: String = row["abbreviation"],
                    let test: String = row["testament"],
                    let testament = Testament(rawValue: test)
                else { return nil }
                let chapterCount: Int = row["chapter_count"] ?? 0
                return BookSummary(slug: slug, name: name, abbreviation: abbr, testament: testament, chapterCount: chapterCount)
            }
        }
    }

    func listPatristicWorks() async throws -> [WorkSummary] {
        try await pool.read { db in
            try Row.fetchAll(db, sql: """
                SELECT w.slug, w.title, w.author,
                       (SELECT ordinal_path FROM section WHERE work_id = w.id ORDER BY id ASC LIMIT 1) AS first_path
                FROM work w
                ORDER BY w.title ASC
                """).compactMap { row in
                guard
                    let slug: String = row["slug"],
                    let title: String = row["title"],
                    let author: String = row["author"]
                else { return nil }
                let firstPath: String = row["first_path"] ?? ""
                return WorkSummary(slug: slug, title: title, author: author, firstSectionPath: firstPath)
            }
        }
    }

    /// Fetch a chapter's verses in a given language. Falls back to BSB for English if the requested
    /// translation doesn't have the book (e.g. asking for KJV on a LXX-only book).
    func chapter(bookSlug: String, chapter: Int, language: CorpusLanguage) async throws -> [Verse] {
        try await pool.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT v.id, v.number, v.text
                FROM verse v
                JOIN chapter c ON v.chapter_id = c.id
                JOIN book b ON c.book_id = b.id
                WHERE b.slug = ? AND c.number = ? AND b.language = ?
                ORDER BY v.number ASC
                """, arguments: [bookSlug, chapter, language.rawValue])

            return try rows.map { row in
                let verseId: Int64 = row["id"]
                let number: Int = row["number"]
                let text: String = row["text"] ?? ""
                let words = try Row.fetchAll(db, sql: """
                    SELECT position, surface, lemma, strongs, morphology
                    FROM word
                    WHERE verse_id = ?
                    ORDER BY position ASC
                    """, arguments: [verseId]).map { wrow in
                    WordToken(
                        position: wrow["position"] ?? 0,
                        surface: wrow["surface"] ?? "",
                        lemma: wrow["lemma"],
                        strongs: wrow["strongs"],
                        morphology: wrow["morphology"]
                    )
                }
                return Verse(id: verseId, number: number, text: text, words: words)
            }
        }
    }

    func strongs(id: String) async throws -> StrongsEntry? {
        try await pool.read { db in
            try Row.fetchOne(db, sql: """
                SELECT id, lemma, transliteration, gloss, definition, kjv_usage
                FROM strongs WHERE id = ?
                """, arguments: [id]).map { row in
                StrongsEntry(
                    id: row["id"],
                    lemma: row["lemma"] ?? "",
                    transliteration: row["transliteration"],
                    gloss: row["gloss"] ?? "",
                    definition: row["definition"] ?? "",
                    kjvUsage: row["kjv_usage"]
                )
            }
        }
    }

    struct PatristicLoad: Sendable {
        var title: String
        var sections: [PatristicSection]
    }

    /// Load every section of a patristic work, grouped by ordinal_path so multi-language
    /// versions of the same logical section appear together.
    func patristicSections(workSlug: String) async throws -> PatristicLoad {
        try await pool.read { db in
            let title: String = (try Row.fetchOne(db, sql: "SELECT title FROM work WHERE slug = ?", arguments: [workSlug]))?["title"] ?? ""
            let rows = try Row.fetchAll(db, sql: """
                SELECT s.id, s.ordinal_path, s.parent_id, s.kind, s.label, s.language, s.body, s.ordering
                FROM section s
                JOIN work w ON s.work_id = w.id
                WHERE w.slug = ?
                ORDER BY s.ordering ASC, s.id ASC
                """, arguments: [workSlug])

            // Group rows by ordinal_path to merge language variants.
            var orderByPath: [String: Int] = [:]
            var grouped: [String: PatristicSection] = [:]
            for (idx, row) in rows.enumerated() {
                let path: String = row["ordinal_path"]
                let langRaw: String = row["language"]
                let lang: CorpusLanguage = {
                    switch langRaw {
                    case "he": return .hebrew
                    case "gr", "gk": return .greek
                    case "la": return .latin
                    case "en_kjv": return .kjv
                    case "en_brenton": return .brenton
                    default: return .bsb
                    }
                }()
                let body: String = row["body"] ?? ""
                if var existing = grouped[path] {
                    existing.bodyByLanguage[lang] = body
                    grouped[path] = existing
                } else {
                    orderByPath[path] = idx
                    grouped[path] = PatristicSection(
                        id: row["id"],
                        workSlug: workSlug,
                        ordinalPath: path,
                        parentPath: nil,
                        kind: row["kind"] ?? "section",
                        label: row["label"],
                        bodyByLanguage: [lang: body]
                    )
                }
            }
            let sections = grouped.values.sorted { (a, b) in
                (orderByPath[a.ordinalPath] ?? 0) < (orderByPath[b.ordinalPath] ?? 0)
            }
            return PatristicLoad(title: title, sections: sections)
        }
    }

    struct SearchHit: Identifiable, Sendable, Hashable {
        var id: String { "\(kind):\(ref)" }
        var kind: Kind
        var ref: String           // human readable: "John 3:16" or "Summa I.Q1.A1.respondeo"
        var snippet: String       // FTS5 snippet with **bold** markers around matches
        var verseRef: VerseRef?   // populated for Bible hits

        enum Kind: String, Sendable { case bible, patristic }
    }

    func search(_ rawQuery: String, limit: Int = 100) async throws -> [SearchHit] {
        let q = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return [] }
        // Escape FTS5 special chars by quoting; this gives a phrase search which is what users mostly want.
        let phraseQuery = "\"\(q.replacingOccurrences(of: "\"", with: ""))\""
        return try await pool.read { db in
            var hits: [SearchHit] = []

            // Bible hits (BSB only for v1 — extend to per-language search later)
            let verseRows = try Row.fetchAll(db, sql: """
                SELECT b.slug AS book_slug, b.name AS book_name, c.number AS chapter, v.number AS verse,
                       snippet(verse_fts, 0, '**', '**', '…', 12) AS snip
                FROM verse_fts
                JOIN verse v ON v.id = verse_fts.rowid
                JOIN chapter c ON v.chapter_id = c.id
                JOIN book b ON c.book_id = b.id
                WHERE verse_fts MATCH ? AND b.language = 'en_bsb'
                LIMIT ?
                """, arguments: [phraseQuery, limit])

            for row in verseRows {
                let bookSlug: String = row["book_slug"]
                let bookName: String = row["book_name"]
                let chapter: Int = row["chapter"]
                let verse: Int = row["verse"]
                hits.append(SearchHit(
                    kind: .bible,
                    ref: "\(bookName) \(chapter):\(verse)",
                    snippet: row["snip"] ?? "",
                    verseRef: VerseRef(workSlug: "bible", bookSlug: bookSlug, chapter: chapter, verse: verse)
                ))
            }

            // Patristic hits
            let sectionRows = try Row.fetchAll(db, sql: """
                SELECT w.slug AS work_slug, w.title AS work_title, s.ordinal_path, s.label,
                       snippet(section_fts, 0, '**', '**', '…', 12) AS snip
                FROM section_fts
                JOIN section s ON s.id = section_fts.rowid
                JOIN work w ON s.work_id = w.id
                WHERE section_fts MATCH ?
                LIMIT ?
                """, arguments: [phraseQuery, limit])

            for row in sectionRows {
                let workTitle: String = row["work_title"] ?? ""
                let label: String = row["label"] ?? row["ordinal_path"] ?? ""
                hits.append(SearchHit(
                    kind: .patristic,
                    ref: "\(workTitle) — \(label)",
                    snippet: row["snip"] ?? "",
                    verseRef: nil
                ))
            }

            return hits
        }
    }
}

/// Holds the lazily-opened Corpus and exposes it to SwiftUI views.
@Observable
final class CorpusContainer {
    private(set) var corpus: Corpus?
    private(set) var isOpen: Bool = false
    private(set) var openError: String?

    func openIfNeeded() async {
        guard corpus == nil else { return }
        do {
            let path = try Self.bundledDatabasePath()
            corpus = try Corpus(databasePath: path)
            isOpen = true
        } catch {
            openError = "Could not open corpus: \(error.localizedDescription)"
        }
    }

    // Auto-opens the corpus on first query so views don't have to coordinate with the
    // top-level `.task { await corpus.openIfNeeded() }`. Without this, a child view's task
    // could fire before the container's open completes and silently return an empty result.
    private func corpusReady() async throws -> Corpus {
        if corpus == nil { await openIfNeeded() }
        guard let c = corpus else {
            throw CorpusError.bundleMissing
        }
        return c
    }

    func listBibleBooks() async throws -> [BookSummary] {
        try await corpusReady().listBibleBooks()
    }
    func listPatristicWorks() async throws -> [WorkSummary] {
        try await corpusReady().listPatristicWorks()
    }
    func chapter(bookSlug: String, chapter: Int, language: CorpusLanguage) async throws -> [Verse] {
        try await corpusReady().chapter(bookSlug: bookSlug, chapter: chapter, language: language)
    }
    func strongs(id: String) async throws -> StrongsEntry? {
        try await corpusReady().strongs(id: id)
    }
    func patristicSections(workSlug: String) async throws -> Corpus.PatristicLoad {
        try await corpusReady().patristicSections(workSlug: workSlug)
    }
    func search(_ q: String, limit: Int = 100) async throws -> [Corpus.SearchHit] {
        try await corpusReady().search(q, limit: limit)
    }

    private static func bundledDatabasePath() throws -> String {
        if let url = Bundle.main.url(forResource: "Aletheia", withExtension: "sqlite") {
            return url.path
        }
        throw CorpusError.bundleMissing
    }
}

enum CorpusError: Error, LocalizedError {
    case bundleMissing
    var errorDescription: String? {
        switch self {
        case .bundleMissing:
            return "Aletheia.sqlite is not bundled with the app. Run `swift run aletheia-ingest` to build the corpus."
        }
    }
}
