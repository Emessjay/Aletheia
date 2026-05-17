import Foundation

/// Minimal USFM 3.0 parser sufficient for Brenton's English LXX and the KJV 1611 Apocrypha
/// distributions from eBible.org. Handles:
///   \id GEN  …                    book identifier
///   \c 1                          chapter marker
///   \v 1 In the beginning…        verse marker + body
///   \p / \m / \nb / \pi*          prose paragraph markers (recorded as the verse's `lead`)
///   \q1 / \q2 / \q3               poetry indent markers (recorded as `lead`)
///   \b                            stanza break (recorded as `lead` when nothing else intervenes)
///   \w word|strong="H1234"\w*    word with embedded Strong's (Brenton has none; KJV+Strong's does)
///   \f …\f*  / \x …\x*            footnotes / cross-refs (stripped from text)
///
/// USFM is line-oriented with backslash-tagged markers. We accumulate everything between
/// consecutive `\v` markers as verse text, stripping inline footnote/xref spans. The most
/// recent paragraph-style marker seen since the previous `\v` is attached as the next
/// verse's `lead` so the reader can render faithful paragraph/poetry spacing.
public struct USFMParser {
    public init() {}

    public struct Row {
        public let bookSlug: String
        public let chapter: Int
        public let verse: Int
        public let text: String
        public let lead: String?
    }

    public struct ParseResult {
        public let bookSlug: String
        public let rows: [Row]
    }

    public func parse(fileURL: URL) throws -> ParseResult {
        let content = try String(contentsOf: fileURL, encoding: .utf8)
        return try parse(text: content)
    }

    public func parse(text: String) throws -> ParseResult {
        var bookSlug: String?
        var chapter: Int = 0
        var verse: Int = 0
        var accum: String = ""
        var rows: [Row] = []
        // `pendingLead` collects line-leading markers between the most recent
        // \v and the next \v. On \v we move it into `currentLead`, which is
        // the lead attached to the verse currently being accumulated.
        var pendingLead: String?
        var currentLead: String?

        func flush() {
            guard let slug = bookSlug, chapter > 0, verse > 0 else { return }
            let cleaned = cleanInline(accum)
            if !cleaned.isEmpty {
                rows.append(Row(bookSlug: slug, chapter: chapter, verse: verse, text: cleaned, lead: currentLead))
            }
            accum = ""
        }

        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        for raw in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else {
                accum += " "
                continue
            }
            if line.hasPrefix("\\id ") {
                let usfm = line.dropFirst(4).split(separator: " ").first.map(String.init) ?? ""
                bookSlug = BookCatalog.byUSFM(String(usfm))?.slug
                continue
            }
            if line.hasPrefix("\\c ") {
                flush()
                pendingLead = nil
                currentLead = nil
                chapter = Int(line.dropFirst(3).trimmingCharacters(in: .whitespaces)) ?? chapter
                verse = 0
                continue
            }
            if line.hasPrefix("\\v ") {
                flush()
                let rest = line.dropFirst(3)
                let parts = rest.split(separator: " ", maxSplits: 1)
                if let vnum = parts.first.flatMap({ Int($0) }) {
                    verse = vnum
                    accum = parts.count > 1 ? String(parts[1]) : ""
                    currentLead = pendingLead
                    pendingLead = nil
                }
                continue
            }
            // Line-leading markers that introduce a paragraph or poetic line.
            // Remember the most recent one so the next \v can claim it.
            if let lead = paragraphLead(line) {
                pendingLead = lead
                if let space = line.firstIndex(of: " ") {
                    accum += " " + line[line.index(after: space)...]
                }
                continue
            }
            // Other backslash markers: append remainder after the marker (existing behavior).
            if line.hasPrefix("\\") {
                if let space = line.firstIndex(of: " ") {
                    accum += " " + line[line.index(after: space)...]
                }
                continue
            }
            accum += " " + line
        }
        flush()
        guard let slug = bookSlug else {
            throw IngestError.malformed("USFM file has no \\id marker")
        }
        return ParseResult(bookSlug: slug, rows: rows)
    }

    /// Return the marker name (without backslash) for line-leading markers
    /// that introduce a paragraph or poetic line; otherwise nil.
    /// Recognised: \p, \m, \nb, \pi, \pi1, \pi2, \q1, \q2, \q3, \b.
    /// `\b` (stanza break) is treated like a soft "blank line" lead.
    private func paragraphLead(_ line: String) -> String? {
        guard line.hasPrefix("\\") else { return nil }
        let body = line.dropFirst()
        let endIdx = body.firstIndex(where: { $0 == " " || $0 == "\t" }) ?? body.endIndex
        let marker = String(body[..<endIdx])
        switch marker {
        case "p", "m", "nb", "pi", "pi1", "pi2",
             "q", "q1", "q2", "q3", "q4",
             "b":
            return marker == "q" ? "q1" : marker
        default:
            return nil
        }
    }

    /// Strip USFM inline markup, leaving plain reading text.
    private func cleanInline(_ s: String) -> String {
        var out = s
        // Drop footnotes (\f ... \f*) and cross-refs (\x ... \x*) entirely. Their
        // bodies contain nested markers like \fr, \ft, \fq, \xo, \xt — so we cannot
        // exclude backslashes from the inner match. Use a non-greedy `.` (newlines
        // already split at the parser layer) so multiple footnotes on one verse
        // each match independently.
        out = out.replacingOccurrences(of: #"\\f\s.*?\\f\*"#, with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\\x\s.*?\\x\*"#, with: "", options: .regularExpression)
        // Unwrap \w word|strong=…\w* — and the nested-marker variant \+w word|…\+w*
        // (used inside \nd …\nd* for "LORD"). Strong's payloads are ingested
        // separately from STEPBible, since USFM Strong's encoding varies.
        out = out.replacingOccurrences(of: #"\\\+?w ([^|\\]+)\|[^\\]*\\\+?w\*"#, with: "$1", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\\\+?w ([^\\]+)\\\+?w\*"#, with: "$1", options: .regularExpression)
        // Drop any remaining USFM markers — closing forms (\nd*, \add*, \+nd*) and
        // opening forms (\nd , \add , \+nd ). Text content is preserved; only the
        // tag itself is removed.
        out = out.replacingOccurrences(of: #"\\\+?[a-z0-9]+\*"#, with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\\\+?[a-z0-9]+ "#, with: " ", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\\\+?[a-z0-9]+$"#, with: "", options: .regularExpression)
        // eBible.org's KJV uses literal ¶ / § glyphs inside verse text to mark
        // paragraph breaks (in addition to the line-level \p markers). The visual
        // pilcrow doesn't belong in reading flow — drop it.
        out = out.replacingOccurrences(of: "¶", with: "")
        out = out.replacingOccurrences(of: "§", with: "")
        // Collapse whitespace
        out = out.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
