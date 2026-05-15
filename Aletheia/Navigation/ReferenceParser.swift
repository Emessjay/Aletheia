import Foundation

/// Parses freeform Scripture references like "Gen 1:1", "john 3:16", "1 mac 2", "ps 23".
/// Returns nil for free-text queries that don't look like a reference.
struct ReferenceParser {
    struct Hit: Hashable {
        var bookSlug: String
        var bookName: String
        var chapter: Int
        var verse: Int?
    }

    static func parse(_ input: String, books: [BookSummary]) -> Hit? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Regex captures: optional leading numeric (1/2/3 for "1 Maccabees", "2 Kings"), book name, chapter, optional verse.
        let pattern = #"^([1-3]\s?)?([A-Za-zͰ-Ͽא-ת\.\s']+?)\s*(\d+)\s*[:\.]?\s*(\d+)?\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return nil }
        let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
        guard let m = regex.firstMatch(in: trimmed, range: range), m.numberOfRanges >= 4 else { return nil }

        func captured(_ idx: Int) -> String? {
            let r = m.range(at: idx)
            guard r.location != NSNotFound, let swiftRange = Range(r, in: trimmed) else { return nil }
            return String(trimmed[swiftRange])
        }

        let numericPrefix = captured(1)?.trimmingCharacters(in: .whitespaces) ?? ""
        let rawName = captured(2)?.trimmingCharacters(in: .whitespacesAndPunctuation) ?? ""
        guard let chapterStr = captured(3), let chapter = Int(chapterStr), chapter > 0 else { return nil }
        let verse = (captured(4)).flatMap(Int.init)

        let fullName = (numericPrefix.isEmpty ? rawName : "\(numericPrefix) \(rawName)").trimmingCharacters(in: .whitespaces)
        guard let match = matchBook(fullName, books: books) else { return nil }
        guard chapter <= max(match.chapterCount, 200) else { return nil }
        return Hit(bookSlug: match.slug, bookName: match.name, chapter: chapter, verse: verse)
    }

    /// Fuzzy book matching — tries exact slug, exact name, abbreviation, then prefix.
    private static func matchBook(_ input: String, books: [BookSummary]) -> BookSummary? {
        let needle = input.lowercased().replacingOccurrences(of: ".", with: "").trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return nil }

        // Exact slug
        if let exact = books.first(where: { $0.slug.lowercased() == needle }) { return exact }
        // Exact name / abbreviation
        if let exact = books.first(where: { $0.name.lowercased() == needle || $0.abbreviation.lowercased() == needle }) { return exact }
        // Prefix
        let candidates = books.filter { book in
            book.name.lowercased().hasPrefix(needle)
                || book.slug.lowercased().hasPrefix(needle)
                || book.abbreviation.lowercased().hasPrefix(needle)
        }
        if candidates.count == 1 { return candidates.first }
        // If multiple prefix matches, prefer shortest name (Genesis beats "Genesis"+other on tie-break: Gen→Genesis wins single).
        if let best = candidates.min(by: { $0.name.count < $1.name.count }) {
            return best
        }
        return nil
    }
}

private extension CharacterSet {
    static let whitespacesAndPunctuation: CharacterSet = .whitespaces.union(.punctuationCharacters)
}
