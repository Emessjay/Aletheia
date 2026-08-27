import Foundation
import GRDB
import Logging

/// Surface-form Strong's (+ English) tagger for the Greek LXX.
///
/// The NT (byztxt via STEPBible TAGNT) ships with Strong's + lemma + morph
/// tagging and per-word BSB-derived English; the LXX (Brenton's `grcbrent`)
/// does not, and no truly-PD tagged LXX exists (see CLAUDE.md's corpus
/// licensing notes). This stage links every LXX token whose normalized
/// surface form (NFC + lowercase + sigma fold + leading/trailing punctuation
/// stripped) appears in the NT to the most-frequent Strong's number — and
/// matching English undertext — for that surface in the NT.
///
/// All-caps Brenton tokens (ΕΝ, ΘΕΟΣ) casefold in the lookup key so they hit
/// lowercase NT forms; the stored `surface` stays as in the source text.
///
/// Coverage is imperfect: inflected forms unique to the LXX get no entry,
/// since "ignoring morphology" was an explicit design choice (i.e. ἄνθρωπος
/// and ἄνθρωπον are treated as distinct words). The win is that every linked
/// token is correct by construction, modulo the ~57 surface homographs where
/// we pick the dominant NT reading.
struct LXXTagger {
    let writer: CorpusWriter
    let logger: Logger
    let bookFilter: Set<String>

    private struct NTHit {
        var strongs: String
        var english: String?
    }

    func run() throws {
        let ntMap = try buildNTSurfaceMap()
        guard !ntMap.isEmpty else {
            logger.warning("    no NT word rows found — skipping (run STEPBible Greek (NT) first)")
            return
        }
        logger.info("    NT surface map: \(ntMap.count) distinct normalized forms")

        let ntSlugs = Set(BookCatalog.nt.map { $0.slug })
        let verses = try writer.queue.read { db -> [(verseID: Int64, text: String, slug: String)] in
            let cursor = try Row.fetchCursor(db, sql: """
                SELECT v.id AS id, v.text_plain AS text, b.slug AS slug
                  FROM verse v
                  JOIN chapter c ON c.id = v.chapter_id
                  JOIN book    b ON b.id = c.book_id
                 WHERE b.language = 'gk'
                """)
            var out: [(Int64, String, String)] = []
            while let row = try cursor.next() {
                let slug: String = row["slug"]
                if ntSlugs.contains(slug) { continue }
                if !bookFilter.isEmpty && !bookFilter.contains(slug) { continue }
                let id: Int64 = row["id"]
                let text: String = row["text"]
                out.append((id, text, slug))
            }
            return out
        }

        if verses.isEmpty {
            logger.info("    no LXX verses found — skipping")
            return
        }

        var totalTokens = 0
        var taggedTokens = 0
        try writer.queue.write { db in
            // Merge reingests must replace prior LXX rows — INSERT OR IGNORE
            // would keep stale strongs/english from an earlier tagging pass.
            if bookFilter.isEmpty {
                try db.execute(sql: """
                    DELETE FROM word WHERE COALESCE(base_text, '') = 'LXX'
                    """)
            } else {
                let placeholders = bookFilter.sorted().map { _ in "?" }.joined(separator: ", ")
                try db.execute(sql: """
                    DELETE FROM word WHERE verse_id IN (
                        SELECT v.id FROM verse v
                        JOIN chapter c ON v.chapter_id = c.id
                        JOIN book b ON c.book_id = b.id
                        WHERE b.language = 'gk' AND b.slug IN (\(placeholders))
                    ) AND COALESCE(base_text, '') = 'LXX'
                    """, arguments: StatementArguments(Array(bookFilter.sorted())))
            }
            for (verseID, text, _) in verses {
                let tokens = tokenize(text)
                for (i, surface) in tokens.enumerated() {
                    totalTokens += 1
                    var strongs: String? = nil
                    var english: String? = nil
                    if let key = GreekNormalize.key(surface), let hit = ntMap[key] {
                        strongs = hit.strongs
                        english = hit.english
                        taggedTokens += 1
                    }
                    try db.execute(sql: """
                        INSERT INTO word(verse_id, position, surface, lemma, strongs, morphology, base_text, english)
                        VALUES (?, ?, ?, NULL, ?, NULL, 'LXX', ?)
                        """, arguments: [verseID, i + 1, surface, strongs, english])
                }
            }
        }

        let pct = totalTokens > 0 ? Double(taggedTokens) / Double(totalTokens) * 100 : 0
        let pctStr = String(format: "%.1f", pct)
        logger.info("    tagged \(taggedTokens) / \(totalTokens) LXX tokens (\(pctStr)%) across \(verses.count) verses")
    }

    /// Build a `{normalized_surface → (strongs, english)}` map from Greek NT
    /// word rows. When a surface appears with multiple Strong's (≈57 cases),
    /// pick the most-frequent Strong's; tiebreak by ascending Strong's number.
    /// English is the most-frequent non-null undertext among rows that voted
    /// for that Strong's.
    private func buildNTSurfaceMap() throws -> [String: NTHit] {
        var strongsCounts: [String: [String: Int]] = [:]
        var englishCounts: [String: [String: [String: Int]]] = [:]
        try writer.queue.read { db in
            let cursor = try Row.fetchCursor(db, sql: """
                SELECT w.surface AS surface, w.strongs AS strongs, w.english AS english
                  FROM word w
                  JOIN verse v ON v.id = w.verse_id
                  JOIN chapter c ON c.id = v.chapter_id
                  JOIN book b ON b.id = c.book_id
                 WHERE b.language = 'gk'
                   AND COALESCE(w.base_text, '') != 'LXX'
                   AND w.strongs LIKE 'G%'
                   AND w.surface IS NOT NULL AND w.surface != ''
                """)
            while let row = try cursor.next() {
                let surface: String = row["surface"]
                let strongs: String = row["strongs"]
                let english: String? = row["english"]
                guard let key = GreekNormalize.key(surface) else { continue }
                strongsCounts[key, default: [:]][strongs, default: 0] += 1
                if let english, !english.isEmpty {
                    englishCounts[key, default: [:]][strongs, default: [:]][english, default: 0] += 1
                }
            }
        }
        var map: [String: NTHit] = [:]
        map.reserveCapacity(strongsCounts.count)
        for (key, byStrongs) in strongsCounts {
            guard let bestStrongs = byStrongs.max(by: { a, b in
                if a.value != b.value { return a.value < b.value }
                return a.key > b.key
            })?.key else { continue }
            var english: String? = nil
            if let byEnglish = englishCounts[key]?[bestStrongs] {
                english = byEnglish.max(by: { a, b in
                    if a.value != b.value { return a.value < b.value }
                    return a.key > b.key
                })?.key
            }
            map[key] = NTHit(strongs: bestStrongs, english: english)
        }
        return map
    }

    /// Whitespace-split, preserving the raw token (with any trailing
    /// punctuation) so the per-word renderer reproduces verse text faithfully.
    private func tokenize(_ text: String) -> [String] {
        text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }
}

/// Normalization for Greek surface-form matching. Public so tests can exercise it.
public enum GreekNormalize {
    /// Compute a comparison key for a Greek surface form. Returns nil for
    /// tokens containing no letters (pure punctuation/digits).
    public static func key(_ raw: String) -> String? {
        // NFC so precomposed and decomposed combinations compare equal.
        let nfc = raw.precomposedStringWithCanonicalMapping
        // Greek-aware lowercase (Σ → σ; ς stays ς in default lowercasing).
        // All-caps LXX / Brenton tokens (ΕΝ, ΘΕΟΣ) land on the same key as
        // lowercase NT forms — display keeps the original surface.
        let lower = nfc.lowercased()
        // Fold final-sigma onto medial-sigma so word-final ς matches the σ
        // produced by lowercasing capital Σ at word end (e.g. "ΛΟΓΟΣ" → "λογοσ").
        let folded = lower.replacingOccurrences(of: "ς", with: "σ")
        var s = Substring(folded)
        while let first = s.first, !first.isLetter { s = s.dropFirst() }
        while let last = s.last, !last.isLetter { s = s.dropLast() }
        return s.isEmpty ? nil : String(s)
    }
}
