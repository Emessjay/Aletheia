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
///
/// For KJV English-primary reverse interlinear, `Row.tokens` preserves English reading
/// order including untagged glue words ("In", "the") with optional normalized Strong's.
public struct USFMParser {
    public init() {}

    /// One English surface token from a verse body, optionally linked to a Strong's id.
    public struct WordToken: Equatable {
        public let surface: String
        public let strongs: String?

        public init(surface: String, strongs: String?) {
            self.surface = surface
            self.strongs = strongs
        }
    }

    public struct Row {
        public let bookSlug: String
        public let chapter: Int
        public let verse: Int
        public let text: String
        public let lead: String?
        /// English-order tokens extracted from USFM `\w` / `\+w` markup (and untagged glue).
        /// Empty when the verse body had no word-like content after cleaning.
        public let tokens: [WordToken]

        public init(bookSlug: String, chapter: Int, verse: Int, text: String,
                    lead: String?, tokens: [WordToken] = []) {
            self.bookSlug = bookSlug
            self.chapter = chapter
            self.verse = verse
            self.text = text
            self.lead = lead
            self.tokens = tokens
        }
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
                let tokens = extractWordTokens(accum)
                rows.append(Row(bookSlug: slug, chapter: chapter, verse: verse,
                                text: cleaned, lead: currentLead, tokens: tokens))
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
        // separately via extractWordTokens for English-primary reverse IL.
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

    /// Extract English-order word tokens from a raw verse body (before cleanInline).
    /// Preserves untagged glue words and normalized Strong's from `\w` / `\+w`.
    public func extractWordTokens(_ raw: String) -> [WordToken] {
        var s = raw
        s = s.replacingOccurrences(of: #"\\f\s.*?\\f\*"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\\x\s.*?\\x\*"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "¶", with: "")
        s = s.replacingOccurrences(of: "§", with: "")

        var tokens: [WordToken] = []
        var i = s.startIndex

        func flushPlain(_ plain: inout String) {
            let trimmed = plain.trimmingCharacters(in: .whitespacesAndNewlines)
            plain = ""
            guard !trimmed.isEmpty else { return }
            for piece in trimmed.split(whereSeparator: { $0.isWhitespace }) {
                let surface = String(piece)
                guard !surface.isEmpty else { continue }
                tokens.append(WordToken(surface: surface, strongs: nil))
            }
        }

        var plain = ""
        while i < s.endIndex {
            if s[i] == "\\" {
                let rest = s[i...]
                // \w / \+w word markers (optionally with |attrs)
                if rest.hasPrefix("\\w ") || rest.hasPrefix("\\+w ") {
                    flushPlain(&plain)
                    let nested = rest.hasPrefix("\\+w ")
                    let openLen = nested ? 4 : 3 // "\+w " or "\w "
                    var j = s.index(i, offsetBy: openLen)
                    // Body until | or closing marker
                    var body = ""
                    while j < s.endIndex {
                        if s[j] == "|" { break }
                        let close = nested ? "\\+w*" : "\\w*"
                        if s[j...].hasPrefix(close) { break }
                        if s[j] == "\\" { break }
                        body.append(s[j])
                        j = s.index(after: j)
                    }
                    var strongs: String? = nil
                    if j < s.endIndex, s[j] == "|" {
                        j = s.index(after: j)
                        var attrs = ""
                        let close = nested ? "\\+w*" : "\\w*"
                        while j < s.endIndex, !s[j...].hasPrefix(close) {
                            if s[j] == "\\" && !s[j...].hasPrefix(close) {
                                // Unexpected nested marker — stop attrs
                                break
                            }
                            attrs.append(s[j])
                            j = s.index(after: j)
                        }
                        if let range = attrs.range(of: #"strong="([^"]+)""#, options: .regularExpression) {
                            let matched = String(attrs[range])
                            if let q1 = matched.firstIndex(of: "\""),
                               let q2 = matched.lastIndex(of: "\""),
                               q1 < q2 {
                                let rawId = String(matched[matched.index(after: q1)..<q2])
                                strongs = Self.normalizeStrongs(rawId)
                            }
                        }
                    }
                    let close = nested ? "\\+w*" : "\\w*"
                    if j < s.endIndex, s[j...].hasPrefix(close) {
                        j = s.index(j, offsetBy: close.count)
                    }
                    // Trailing punctuation after \w* (e.g. "earth." / "Joshua,") stays
                    // on the tagged surface so English-primary flow reads naturally.
                    var surface = body.trimmingCharacters(in: .whitespacesAndNewlines)
                    while j < s.endIndex {
                        let ch = s[j]
                        if ch.isWhitespace { break }
                        if ch == "\\" { break }
                        if ch.isLetter || ch.isNumber { break }
                        surface.append(ch)
                        j = s.index(after: j)
                    }
                    if !surface.isEmpty {
                        tokens.append(WordToken(surface: surface, strongs: strongs))
                    }
                    i = j
                    continue
                }

                // Closing marker \foo* or \+foo*
                if let m = rest.range(of: #"^\\\+?[a-z0-9]+\*"#, options: .regularExpression) {
                    i = m.upperBound
                    continue
                }
                // Opening marker \foo or \+foo (optional trailing space)
                if let m = rest.range(of: #"^\\\+?[a-z0-9]+ ?"#, options: .regularExpression) {
                    i = m.upperBound
                    continue
                }
                // Lone backslash — skip
                i = s.index(after: i)
                continue
            }

            plain.append(s[i])
            i = s.index(after: i)
        }
        flushPlain(&plain)
        return tokens
    }

    /// Same digit-strip logic as STEPBibleParser.normalizeStrongs (H0430 → H430).
    static func normalizeStrongs(_ raw: String) -> String? {
        var trimmed = raw.trimmingCharacters(in: .whitespaces)
        if let slash = trimmed.firstIndex(of: "/") {
            trimmed = String(trimmed[trimmed.index(after: slash)...])
        }
        trimmed = trimmed.replacingOccurrences(of: "{", with: "").replacingOccurrences(of: "}", with: "")
        guard let first = trimmed.first(where: { $0 == "H" || $0 == "G" }) else { return nil }
        let prefixIdx = trimmed.firstIndex(of: first)!
        let after = trimmed[trimmed.index(after: prefixIdx)...]
        let digits = after.prefix(while: { $0.isNumber })
        guard !digits.isEmpty else { return nil }
        let stripped = String(digits).drop(while: { $0 == "0" })
        return String(first) + (stripped.isEmpty ? "0" : String(stripped))
    }
}
