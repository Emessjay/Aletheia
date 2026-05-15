import Foundation

/// Parses the Berean Standard Bible plain-text dump available from berean.bible.
///
/// The canonical line format is:
///     Genesis 1:1\tIn the beginning God created the heavens and the earth.
///
/// (Tab-separated reference + text; UTF-8; chapter/verse zero-padding varies by release.)
/// We also tolerate `BookName 1:1 In the beginning…` with the separator being whitespace.
public struct BSBParser {
    public init() {}

    public struct Row {
        public let bookSlug: String
        public let chapter: Int
        public let verse: Int
        public let text: String
    }

    public func parse(fileURL: URL) throws -> [Row] {
        let data = try Data(contentsOf: fileURL)
        guard let content = String(data: data, encoding: .utf8) else {
            throw IngestError.encoding("BSB file is not UTF-8: \(fileURL.path)")
        }
        return parse(text: content)
    }

    public func parse(text: String) -> [Row] {
        var rows: [Row] = []
        rows.reserveCapacity(31_103)

        // Normalize CR/CRLF to LF before splitting. The official BSB plain-text dump is
        // CRLF-encoded; Swift's `String.split(separator: "\n")` does not strip CR, so without
        // this normalization the trailing `\r` would prevent reference parsing for the
        // earliest releases.
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        for rawLine in normalized.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix("#") else { continue }
            guard let (ref, body) = splitOnReferenceBoundary(line) else { continue }
            guard let parsed = parseReference(ref) else { continue }
            rows.append(Row(bookSlug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse, text: body))
        }
        return rows
    }

    private func splitOnReferenceBoundary(_ line: String) -> (String, String)? {
        if let tabIdx = line.firstIndex(of: "\t") {
            return (String(line[..<tabIdx]).trimmingCharacters(in: .whitespaces),
                    String(line[line.index(after: tabIdx)...]).trimmingCharacters(in: .whitespaces))
        }
        // Find the boundary between "Book chap:verse" and the rest. The reference ends at the digit
        // sequence after ':', so scan for the digits-then-whitespace pattern.
        let pattern = #"^(.+?\d+:\d+[a-z]?)\s+(.+)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let m = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              m.numberOfRanges >= 3,
              let r1 = Range(m.range(at: 1), in: line),
              let r2 = Range(m.range(at: 2), in: line)
        else { return nil }
        return (String(line[r1]), String(line[r2]))
    }

    private struct ParsedRef { let slug: String; let chapter: Int; let verse: Int }

    private func parseReference(_ ref: String) -> ParsedRef? {
        let pattern = #"^(.+?)\s+(\d+):(\d+)[a-z]?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let m = regex.firstMatch(in: ref, range: NSRange(ref.startIndex..., in: ref)),
              m.numberOfRanges >= 4,
              let bookRange = Range(m.range(at: 1), in: ref),
              let chapterRange = Range(m.range(at: 2), in: ref),
              let verseRange = Range(m.range(at: 3), in: ref)
        else { return nil }
        let bookName = String(ref[bookRange])
        guard let chapter = Int(ref[chapterRange]), let verse = Int(ref[verseRange]) else { return nil }
        guard let slug = bookSlug(for: bookName) else { return nil }
        return ParsedRef(slug: slug, chapter: chapter, verse: verse)
    }

    /// Map a free-text book name as it appears in BSB to our canonical slug.
    private func bookSlug(for name: String) -> String? {
        let lc = name.trimmingCharacters(in: .whitespaces).lowercased()
        if let direct = directLookup[lc] { return direct }
        // Try without leading "1 "/"2 "/"3 " digits collapsed
        let collapsed = lc.replacingOccurrences(of: " ", with: "")
        if let direct = directLookup[collapsed] { return direct }
        return nil
    }

    private static let directLookup: [String: String] = {
        var d: [String: String] = [:]
        for b in BookCatalog.all {
            d[b.name.lowercased()] = b.slug
            d[b.abbreviation.lowercased()] = b.slug
            d[b.slug] = b.slug
            d[b.name.lowercased().replacingOccurrences(of: " ", with: "")] = b.slug
        }
        // Common BSB-specific spellings
        d["song of solomon"] = "song"
        d["psalm"] = "ps"
        d["1 sm"] = "1sam"; d["2 sm"] = "2sam"
        d["1 kg"] = "1kgs"; d["2 kg"] = "2kgs"
        return d
    }()

    private var directLookup: [String: String] { Self.directLookup }
}

public enum IngestError: Error, LocalizedError {
    case encoding(String)
    case malformed(String)
    case sourceMissing(String)
    public var errorDescription: String? {
        switch self {
        case .encoding(let m), .malformed(let m), .sourceMissing(let m): return m
        }
    }
}
