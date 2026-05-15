import Foundation

/// Parses OpenBible.info's cross-reference CSV — ~340k rows in three columns:
///   from_ref,to_ref,votes
///
/// Refs are formatted as OSIS book code + chapter + verse, e.g. `Gen.1.1` → `John.1.1`.
/// A "to" range can appear as `Gen.1.1-Gen.1.5`. We split that into start/end OSIS refs.
public struct CrossReferenceParser {
    public init() {}

    public struct Row {
        public let fromBook: String  // slug
        public let fromChapter: Int
        public let fromVerse: Int
        public let toBook: String    // slug
        public let toChapter: Int
        public let toVerseStart: Int
        public let toVerseEnd: Int   // == start when single verse
        public let weight: Double    // votes count, scaled to 0..1
    }

    public func parse(fileURL: URL) throws -> [Row] {
        let content = try String(contentsOf: fileURL, encoding: .utf8)
        return parse(text: content)
    }

    public func parse(text: String) -> [Row] {
        var rows: [Row] = []
        rows.reserveCapacity(340_000)
        var maxVotes: Double = 1

        // First pass: find max votes for normalization.
        for line in text.split(separator: "\n") {
            let cells = line.split(separator: "\t")
            if cells.count >= 3, let v = Double(cells[2]) { maxVotes = max(maxVotes, v) }
        }

        for line in text.split(separator: "\n") {
            if line.hasPrefix("From") || line.hasPrefix("#") { continue }
            let cells = line.split(separator: "\t")
            guard cells.count >= 3 else { continue }
            let from = String(cells[0])
            let to = String(cells[1])
            let votes = Double(cells[2]) ?? 0
            guard let fr = parseSingleRef(from) else { continue }
            guard let (toStart, toEnd) = parseRefRange(to) else { continue }
            guard toStart.book == toEnd.book, toStart.chapter == toEnd.chapter else { continue }
            rows.append(Row(
                fromBook: fr.book, fromChapter: fr.chapter, fromVerse: fr.verse,
                toBook: toStart.book, toChapter: toStart.chapter,
                toVerseStart: toStart.verse, toVerseEnd: toEnd.verse,
                weight: votes / maxVotes
            ))
        }
        return rows
    }

    private struct OSISRef { let book: String; let chapter: Int; let verse: Int }

    private func parseSingleRef(_ raw: String) -> OSISRef? {
        let parts = raw.split(separator: ".")
        guard parts.count >= 3 else { return nil }
        guard let book = BookCatalog.byOSIS(String(parts[0])) else { return nil }
        guard let chapter = Int(parts[1]), let verse = Int(parts[2]) else { return nil }
        return OSISRef(book: book.slug, chapter: chapter, verse: verse)
    }

    private func parseRefRange(_ raw: String) -> (OSISRef, OSISRef)? {
        if raw.contains("-") {
            let halves = raw.split(separator: "-", maxSplits: 1)
            guard halves.count == 2,
                  let start = parseSingleRef(String(halves[0])),
                  let end = parseSingleRef(String(halves[1])) else { return nil }
            return (start, end)
        }
        guard let single = parseSingleRef(raw) else { return nil }
        return (single, single)
    }
}
