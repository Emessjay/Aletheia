import Foundation
import GRDB

/// Write-side wrapper around the corpus DB. Keeps a `BookID` map across parsers
/// so each book is inserted once and reused by every translation that ships it.
public final class CorpusWriter {
    public let queue: DatabaseQueue
    public init(at path: String) throws {
        // Always start with a clean file — the corpus is rebuilt from scratch.
        try? FileManager.default.removeItem(atPath: path)
        var config = Configuration()
        config.label = "Aletheia.writer"
        self.queue = try DatabaseQueue(path: path, configuration: config)
        try queue.write(Schema.create)
    }

    // MARK: - Books

    public struct BookKey: Hashable {
        public let language: String
        public let slug: String
        public init(language: String, slug: String) {
            self.language = language; self.slug = slug
        }
    }

    public func upsertBook(
        language: String,
        canon: String,
        slug: String,
        name: String,
        abbreviation: String,
        testament: String,
        orderIndex: Int
    ) throws -> Int64 {
        try queue.write { db in
            if let id = try Int64.fetchOne(db, sql: "SELECT id FROM book WHERE language = ? AND slug = ?", arguments: [language, slug]) {
                return id
            }
            try db.execute(sql: """
                INSERT INTO book(language, canon, slug, name, abbreviation, testament, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, arguments: [language, canon, slug, name, abbreviation, testament, orderIndex])
            return db.lastInsertedRowID
        }
    }

    public func upsertChapter(bookID: Int64, number: Int) throws -> Int64 {
        try queue.write { db in
            if let id = try Int64.fetchOne(db, sql: "SELECT id FROM chapter WHERE book_id = ? AND number = ?", arguments: [bookID, number]) {
                return id
            }
            try db.execute(sql: "INSERT INTO chapter(book_id, number) VALUES (?, ?)", arguments: [bookID, number])
            return db.lastInsertedRowID
        }
    }

    /// Insert a verse, or return the existing row's ID if `(chapter_id, number)` already exists.
    /// Idempotent so the pipeline can rerun parts of the build, and tolerant of source-text
    /// quirks (e.g. Brenton's Daniel 3 additions split across two `\c 3` markers).
    public func insertVerse(chapterID: Int64, number: Int, text: String, plain: String? = nil) throws -> Int64 {
        try queue.write { db in
            if let existing = try Int64.fetchOne(db, sql: "SELECT id FROM verse WHERE chapter_id = ? AND number = ?", arguments: [chapterID, number]) {
                return existing
            }
            let plain = plain ?? stripMarkup(text)
            try db.execute(sql: """
                INSERT INTO verse(chapter_id, number, text, text_plain) VALUES (?, ?, ?, ?)
                """, arguments: [chapterID, number, text, plain])
            return db.lastInsertedRowID
        }
    }

    public func insertWord(verseID: Int64, position: Int, surface: String, lemma: String?, strongs: String?, morphology: String?, baseText: String?) throws {
        try queue.write { db in
            try db.execute(sql: """
                INSERT OR IGNORE INTO word(verse_id, position, surface, lemma, strongs, morphology, base_text)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, arguments: [verseID, position, surface, lemma, strongs, morphology, baseText])
        }
    }

    public func upsertStrongs(_ entry: StrongsRow) throws {
        try queue.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO strongs(id, language, lemma, transliteration, gloss, definition, kjv_usage, lemma_lower)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, arguments: [entry.id, entry.language, entry.lemma, entry.transliteration, entry.gloss, entry.definition, entry.kjvUsage, entry.lemma.lowercased()])
        }
    }

    public func updateChapterVerseCounts() throws {
        try queue.write { db in
            try db.execute(sql: """
                UPDATE chapter SET verse_count = (
                    SELECT COUNT(*) FROM verse WHERE verse.chapter_id = chapter.id
                );
                """)
        }
    }

    // MARK: - Patristic

    public func insertWork(slug: String, title: String, author: String, kind: String) throws -> Int64 {
        try queue.write { db in
            try db.execute(sql: """
                INSERT OR IGNORE INTO work(slug, title, author, kind) VALUES (?, ?, ?, ?)
                """, arguments: [slug, title, author, kind])
            return try Int64.fetchOne(db, sql: "SELECT id FROM work WHERE slug = ?", arguments: [slug]) ?? 0
        }
    }

    public func insertSection(workID: Int64, parentID: Int64?, ordinalPath: String, kind: String, label: String?, language: String, body: String, ordering: Int) throws -> Int64 {
        try queue.write { db in
            if let existing = try Int64.fetchOne(db, sql: "SELECT id FROM section WHERE work_id = ? AND ordinal_path = ? AND language = ?", arguments: [workID, ordinalPath, language]) {
                // Update the body to the newer one but keep the row ID stable.
                try db.execute(sql: "UPDATE section SET body = ?, label = COALESCE(label, ?) WHERE id = ?",
                               arguments: [body, label, existing])
                return existing
            }
            try db.execute(sql: """
                INSERT INTO section(work_id, parent_id, ordinal_path, kind, label, language, body, ordering)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, arguments: [workID, parentID, ordinalPath, kind, label, language, body, ordering])
            return db.lastInsertedRowID
        }
    }
}

public struct StrongsRow {
    public var id: String
    public var language: String   // "he" | "gk"
    public var lemma: String
    public var transliteration: String?
    public var gloss: String
    public var definition: String
    public var kjvUsage: String?
    public init(id: String, language: String, lemma: String, transliteration: String? = nil, gloss: String, definition: String, kjvUsage: String? = nil) {
        self.id = id; self.language = language; self.lemma = lemma
        self.transliteration = transliteration; self.gloss = gloss
        self.definition = definition; self.kjvUsage = kjvUsage
    }
}

/// Strip minimal markup so FTS gets clean text.
func stripMarkup(_ text: String) -> String {
    // Remove anything between { } (used for inline strongs/refs) and any literal HTML tags.
    var t = text.replacingOccurrences(of: #"\{[^}]*\}"#, with: "", options: .regularExpression)
    t = t.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
    return t.trimmingCharacters(in: .whitespacesAndNewlines)
}
