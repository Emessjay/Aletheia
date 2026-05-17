import Foundation

/// Reads the JSON produced by `tools/sword-extract/extract.py` and turns it
/// into ChapterContent records the Pipeline can write as section rows.
///
/// The JSON is a flat array of per-verse comment entries:
///
///     [{"book": "Genesis", "osis": "Gen", "chapter": 1, "verse": 1,
///       "body": "…"}, …]
///
/// SWORD commentaries are verse-keyed: each entry is the commentary anchored
/// at one verse. This parser preserves that granularity — every entry becomes
/// one `comment`-kind section labeled "Verse N", in canonical order.
public struct SwordCommentaryParser {

    public struct ChapterContent {
        public let bookSlug: String
        public let chapter: Int
        public let comments: [Comment]
    }

    public struct Comment {
        public let label: String      // "Verse N"
        public let verseStart: Int
        public let verseEnd: Int
        public let body: String
    }

    public init() {}

    public func parse(fileURL: URL) throws -> [ChapterContent] {
        let data = try Data(contentsOf: fileURL)
        let raw = try JSONDecoder().decode([Entry].self, from: data)

        // Group by (bookSlug, chapter), preserving canonical sort order.
        struct Key: Hashable { let slug: String; let chapter: Int }
        var grouped: [Key: [Comment]] = [:]
        for e in raw {
            let trimmed = e.body.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            // Prefer the OSIS id (stable, canonical) over the English name.
            guard let book = BookCatalog.byOSIS(e.osis) ?? BookCatalog.byOSIS(e.book) else { continue }
            let key = Key(slug: book.slug, chapter: e.chapter)
            grouped[key, default: []].append(Comment(
                label: "Verse \(e.verse)",
                verseStart: e.verse,
                verseEnd: e.verse,
                body: trimmed))
        }

        // Sort within each chapter by verse, then sort chapters by canonical
        // (book order_index, chapter number).
        var results: [ChapterContent] = []
        for (key, comments) in grouped {
            let sorted = comments.sorted { $0.verseStart < $1.verseStart }
            results.append(ChapterContent(bookSlug: key.slug, chapter: key.chapter, comments: sorted))
        }
        results.sort { lhs, rhs in
            let lo = BookCatalog.orderIndex(of: lhs.bookSlug)
            let ro = BookCatalog.orderIndex(of: rhs.bookSlug)
            if lo != ro { return lo < ro }
            return lhs.chapter < rhs.chapter
        }
        return results
    }

    private struct Entry: Decodable {
        let book: String
        let osis: String
        let chapter: Int
        let verse: Int
        let body: String
    }
}
