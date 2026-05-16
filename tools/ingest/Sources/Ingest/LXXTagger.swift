import Foundation
import GRDB
import Logging

/// Surface-form Strong's tagger for the Greek LXX.
///
/// The NT (byztxt via STEPBible TAGNT) ships with Strong's + lemma + morph
/// tagging; the LXX (Brenton's `grcbrent`) does not, and no truly-PD tagged
/// LXX exists (see CLAUDE.md's corpus licensing notes). This stage links
/// every LXX token whose normalized surface form (NFC + lowercase + sigma
/// fold + leading/trailing punctuation stripped) appears in the NT to the
/// most-frequent Strong's number for that surface in the NT.
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
            for (verseID, text, _) in verses {
                let tokens = tokenize(text)
                for (i, surface) in tokens.enumerated() {
                    totalTokens += 1
                    var strongs: String? = nil
                    if let key = GreekNormalize.key(surface), let hit = ntMap[key] {
                        strongs = hit
                        taggedTokens += 1
                    }
                    try db.execute(sql: """
                        INSERT OR IGNORE INTO word(verse_id, position, surface, lemma, strongs, morphology, base_text)
                        VALUES (?, ?, ?, NULL, ?, NULL, 'LXX')
                        """, arguments: [verseID, i + 1, surface, strongs])
                }
            }
        }

        let pct = totalTokens > 0 ? Double(taggedTokens) / Double(totalTokens) * 100 : 0
        let pctStr = String(format: "%.1f", pct)
        logger.info("    tagged \(taggedTokens) / \(totalTokens) LXX tokens (\(pctStr)%) across \(verses.count) verses")
    }

    /// Build a `{normalized_surface → strongs}` map from the NT word rows.
    /// When a surface appears with multiple Strong's (≈57 cases out of ~24.5k
    /// distinct surfaces, almost all function words like τοῦ / αὐτοῦ), pick the
    /// most-frequent Strong's; tiebreak by ascending Strong's number so the
    /// build is deterministic.
    private func buildNTSurfaceMap() throws -> [String: String] {
        var counts: [String: [String: Int]] = [:]
        try writer.queue.read { db in
            let cursor = try Row.fetchCursor(db, sql: """
                SELECT surface, strongs FROM word
                 WHERE strongs LIKE 'G%' AND surface IS NOT NULL AND surface != ''
                """)
            while let row = try cursor.next() {
                let surface: String = row["surface"]
                let strongs: String = row["strongs"]
                guard let key = GreekNormalize.key(surface) else { continue }
                counts[key, default: [:]][strongs, default: 0] += 1
            }
        }
        var map: [String: String] = [:]
        map.reserveCapacity(counts.count)
        for (key, byStrongs) in counts {
            // max() returns the element for which the closure considers other
            // elements "less than" it. We want highest count; ties broken by
            // ascending strongs number (alphabetically smallest wins).
            if let best = byStrongs.max(by: { a, b in
                if a.value != b.value { return a.value < b.value }
                return a.key > b.key
            }) {
                map[key] = best.key
            }
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
