import Foundation

/// Parses Berean Bible **Translation Tables** (`bsb_tables.tsv`).
///
/// Each row aligns one English surface word (BSB reading order) with its
/// underlying Hebrew or Greek original. The first row of a verse carries
/// `VerseId` (`Genesis 1:1`); continuation rows leave that cell blank and
/// inherit the previous verse reference.
///
/// For English-primary interlinear we store these on `en_bsb` `word` rows with
/// English in `surface` and the original language in `english` (mirroring the
/// inverted layout of `he`/`gk` STEPBible rows).
public struct BSBTablesParser {
    public init() {}

    public struct Word {
        public let bookSlug: String
        public let chapter: Int
        public let verse: Int
        /// 1-based position within the verse, sorted by global BSB Sort.
        public let position: Int
        /// English surface (BSB version column).
        public let english: String
        /// Original-language surface (WLC / Nestle column).
        public let original: String
        public let strongs: String?
        public let morphology: String?
    }

    private enum Col {
        static let bsbSort = 2
        static let language = 4
        static let original = 5
        static let morphology = 8
        static let strHeb = 10
        static let strGrk = 11
        static let verseId = 12
        static let bsbEnglish = 18
    }

    public func parse(fileURL: URL) throws -> [Word] {
        let data = try Data(contentsOf: fileURL)
        guard let content = String(data: data, encoding: .utf8) else {
            throw IngestError.encoding("BSB tables file is not UTF-8: \(fileURL.path)")
        }
        return parse(text: content)
    }

    public func parse(text: String) -> [Word] {
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        var rows: [Word] = []
        rows.reserveCapacity(500_000)

        var currentRef: ParsedRef?
        var nextPosition = 1

        for rawLine in normalized.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine)
            if line.isEmpty { continue }
            if line.hasPrefix("Heb Sort\t") { continue } // header

            let cells = line.components(separatedBy: "\t")
            guard cells.count > Col.bsbEnglish else { continue }

            if let verseId = cellAt(cells, Col.verseId), !verseId.isEmpty {
                guard let parsed = parseReference(verseId) else { continue }
                if parsed.slug != currentRef?.slug
                    || parsed.chapter != currentRef?.chapter
                    || parsed.verse != currentRef?.verse {
                    currentRef = parsed
                    nextPosition = 1
                }
            }
            guard let ref = currentRef else { continue }

            let english = cellAt(cells, Col.bsbEnglish)?.trimmingCharacters(in: .whitespaces) ?? ""
            let original = cellAt(cells, Col.original)?.trimmingCharacters(in: .whitespaces) ?? ""
            if english.isEmpty && original.isEmpty { continue }

            let lang = cellAt(cells, Col.language) ?? ""
            let strongs = normalizeStrongs(
                heb: cellAt(cells, Col.strHeb),
                grk: cellAt(cells, Col.strGrk),
                language: lang
            )
            let morph = cellAt(cells, Col.morphology)

            rows.append(Word(
                bookSlug: ref.slug,
                chapter: ref.chapter,
                verse: ref.verse,
                position: nextPosition,
                english: english,
                original: original,
                strongs: strongs,
                morphology: morph
            ))
            nextPosition += 1
        }
        return rows
    }

    private struct ParsedRef { let slug: String; let chapter: Int; let verse: Int }

    private func parseReference(_ ref: String) -> ParsedRef? {
        // Strip HTML heading fragments that occasionally leak into VerseId.
        let cleaned = ref
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"^(.+?)\s+(\d+):(\d+)[a-z]?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let m = regex.firstMatch(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned)),
              m.numberOfRanges >= 4,
              let bookRange = Range(m.range(at: 1), in: cleaned),
              let chapterRange = Range(m.range(at: 2), in: cleaned),
              let verseRange = Range(m.range(at: 3), in: cleaned)
        else { return nil }
        let bookName = String(cleaned[bookRange])
        guard let chapter = Int(cleaned[chapterRange]),
              let verse = Int(cleaned[verseRange]),
              let slug = bookSlug(for: bookName)
        else { return nil }
        return ParsedRef(slug: slug, chapter: chapter, verse: verse)
    }

    private func bookSlug(for name: String) -> String? {
        BSBTablesParser.bookLookup[name.trimmingCharacters(in: .whitespaces).lowercased()]
    }

    private static let bookLookup: [String: String] = {
        var d: [String: String] = [:]
        for b in BookCatalog.all {
            d[b.name.lowercased()] = b.slug
            d[b.abbreviation.lowercased()] = b.slug
            d[b.slug] = b.slug
            d[b.name.lowercased().replacingOccurrences(of: " ", with: "")] = b.slug
        }
        d["song of solomon"] = "song"
        d["psalm"] = "ps"
        d["1 sm"] = "1sam"; d["2 sm"] = "2sam"
        d["1 kg"] = "1kgs"; d["2 kg"] = "2kgs"
        return d
    }()

    private func cellAt(_ cells: [String], _ index: Int) -> String? {
        guard index >= 0, index < cells.count else { return nil }
        let v = cells[index]
        return v.isEmpty ? nil : v
    }

    private func normalizeStrongs(heb: String?, grk: String?, language: String) -> String? {
        let raw: String?
        if language.lowercased().hasPrefix("heb") {
            raw = heb
        } else if language.lowercased().hasPrefix("greek") {
            raw = grk
        } else if let h = heb, !h.isEmpty {
            raw = h
        } else {
            raw = grk
        }
        guard var trimmed = raw?.trimmingCharacters(in: .whitespaces), !trimmed.isEmpty else {
            return nil
        }
        trimmed = trimmed.replacingOccurrences(of: "{", with: "").replacingOccurrences(of: "}", with: "")
        if let slash = trimmed.firstIndex(of: "/") { trimmed = String(trimmed[..<slash]) }
        if trimmed.first == "H" || trimmed.first == "G" {
            let prefix = trimmed.first!
            let digits = trimmed.dropFirst().prefix(while: { $0.isNumber })
            guard !digits.isEmpty else { return nil }
            let stripped = digits.drop(while: { $0 == "0" })
            return String(prefix) + (stripped.isEmpty ? "0" : String(stripped))
        }
        if let n = Int(trimmed) {
            let prefix: Character = language.lowercased().hasPrefix("greek") ? "G" : "H"
            return "\(prefix)\(n)"
        }
        return nil
    }
}
