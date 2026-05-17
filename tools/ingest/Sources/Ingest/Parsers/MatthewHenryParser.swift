import Foundation

/// Parses Matthew Henry's Complete Commentary on the Whole Bible from the
/// CC0 lyteword/mhenry-complete repository.
///
/// On disk the corpus is laid out as
///
///     <root>/volume-N/<book-name>/chapter-N.md
///     <root>/volume-N/<book-name>/_index.md
///     <root>/volume-N/_index.md
///     <root>/volume-N/preface.md
///
/// Each `chapter-N.md` is markdown with YAML frontmatter, a `# Book N` H1,
/// some intro paragraphs, then one or more `## Section Heading` blocks. Each
/// section block is the verses-as-blockquote followed by Matthew Henry's
/// commentary prose. The parser captures the H1-level intro as the chapter
/// body, and each H2 block (heading + prose; the Bible-text blockquote is
/// dropped) as a comment block whose label is the H2 text.
///
/// The parser does NOT extract verse ranges from the section blockquotes. A
/// future enhancement can do that to populate the `citation` table.
public struct MatthewHenryParser {

    public struct ChapterContent {
        public let bookSlug: String
        public let chapter: Int
        /// Free-text introduction shown above the comment blocks. Paragraphs
        /// separated by `\n\n`. Empty when the source has no intro.
        public let intro: String
        public let comments: [Comment]
    }

    public struct Comment {
        /// Display label like "Verses 1–5" or "Verse 4". Derived from the
        /// verse markers in the H2 block's leading blockquote — the H2 heading
        /// itself is too coarse (it's repeated for every block in the pericope).
        /// Falls back to the H2 heading verbatim when no verse markers are found.
        public let label: String
        /// First verse number this block comments on, or nil if unparseable.
        public let verseStart: Int?
        /// Last verse number this block comments on, or `verseStart` for a
        /// single-verse block.
        public let verseEnd: Int?
        /// Multi-paragraph body, joined with `\n\n`. The Bible-text blockquote
        /// is stripped (it's already in the corpus's `verse` table).
        public let body: String
    }

    public init() {}

    /// Parses the entire repo. Returns one ChapterContent per chapter file
    /// found in any volume, in canonical (book, chapter) order.
    public func parse(rootDirectory root: URL) throws -> [ChapterContent] {
        var results: [ChapterContent] = []
        let fm = FileManager.default
        guard let volumes = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else {
            throw IngestError.sourceMissing(root.path)
        }
        for vol in volumes where vol.hasDirectoryPath && vol.lastPathComponent.hasPrefix("volume-") {
            guard let bookDirs = try? fm.contentsOfDirectory(at: vol, includingPropertiesForKeys: nil) else { continue }
            for bookDir in bookDirs where bookDir.hasDirectoryPath {
                let folderName = bookDir.lastPathComponent
                guard let slug = slugForFolder(folderName) else { continue }
                guard let files = try? fm.contentsOfDirectory(at: bookDir, includingPropertiesForKeys: nil) else { continue }
                for file in files {
                    let name = file.lastPathComponent
                    guard name.hasSuffix(".md"), name != "_index.md", name != "preface.md" else { continue }
                    // Accept "chapter-N.md" and "psalm-N.md" (lyteword uses
                    // the latter for the Psalter). Anything else is skipped.
                    guard let chapter = chapterNumberFor(filename: name) else { continue }
                    if let parsed = try? parseChapter(fileURL: file, bookSlug: slug, chapter: chapter) {
                        results.append(parsed)
                    }
                }
            }
        }
        results.sort { lhs, rhs in
            let lo = BookCatalog.orderIndex(of: lhs.bookSlug)
            let ro = BookCatalog.orderIndex(of: rhs.bookSlug)
            if lo != ro { return lo < ro }
            return lhs.chapter < rhs.chapter
        }
        return results
    }

    // MARK: - Chapter file

    func parseChapter(fileURL: URL, bookSlug: String, chapter: Int) throws -> ChapterContent {
        let raw = try String(contentsOf: fileURL, encoding: .utf8)
        let body = stripFrontmatter(raw)
        let blocks = splitIntoBlocks(body)

        // First block: the H1 heading line + intro paragraphs (until the first H2).
        // Remaining blocks: zero or more H2 sections.
        var intro = ""
        var comments: [Comment] = []

        for block in blocks {
            if block.isH1 {
                intro = cleanProse(block.body)
            } else if block.isH2 {
                // The block layout is:
                //   ## Pericope Title
                //   > **¹** verse 1 text
                //   > **²** verse 2 text
                //   (blank line)
                //   Commentary prose...
                // We extract the verse range from the blockquote markers,
                // then drop the blockquote (the verses are already in the
                // corpus's `verse` table) and keep only the prose.
                let (vStart, vEnd) = verseRangeFromBlockquote(block.body)
                let prose = stripBlockquotes(block.body)
                let derivedLabel = formatVerseLabel(start: vStart, end: vEnd)
                    ?? (block.heading.isEmpty ? "Commentary" : block.heading)
                comments.append(Comment(
                    label: derivedLabel,
                    verseStart: vStart,
                    verseEnd: vEnd,
                    body: cleanProse(prose)))
            }
        }

        return ChapterContent(bookSlug: bookSlug, chapter: chapter, intro: intro, comments: comments)
    }

    // MARK: - Block splitting

    private struct Block {
        let heading: String   // text without leading `#`s, may be ""
        let level: Int        // 1 or 2 (higher levels are folded into body)
        let body: String      // everything after the heading line
        var isH1: Bool { level == 1 }
        var isH2: Bool { level == 2 }
    }

    private func splitIntoBlocks(_ body: String) -> [Block] {
        var blocks: [Block] = []
        var current: (level: Int, heading: String, lines: [String])? = nil
        for rawLine in body.components(separatedBy: "\n") {
            let line = rawLine
            if let (level, heading) = headingFor(line: line), level <= 2 {
                if let c = current {
                    blocks.append(Block(heading: c.heading, level: c.level, body: c.lines.joined(separator: "\n")))
                }
                current = (level, heading, [])
                continue
            }
            if current == nil {
                // Pre-heading content — treat as an implicit H1 block so the
                // intro paragraphs are captured even when the file omits `# Book N`.
                current = (1, "", [])
            }
            current!.lines.append(line)
        }
        if let c = current {
            blocks.append(Block(heading: c.heading, level: c.level, body: c.lines.joined(separator: "\n")))
        }
        return blocks
    }

    private func headingFor(line: String) -> (Int, String)? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("#") else { return nil }
        var level = 0
        var idx = trimmed.startIndex
        while idx < trimmed.endIndex && trimmed[idx] == "#" {
            level += 1
            idx = trimmed.index(after: idx)
        }
        guard level >= 1 else { return nil }
        let after = trimmed[idx...].trimmingCharacters(in: .whitespaces)
        return (level, after)
    }

    // MARK: - Verse marker extraction

    /// Extracts the first and last verse number from a block's leading
    /// blockquote. Verse markers in the source are Unicode superscript digits
    /// wrapped in bold, like `> **¹** In the beginning…`. ASCII digit fallback
    /// is handled too in case the source ever changes form.
    private func verseRangeFromBlockquote(_ block: String) -> (Int?, Int?) {
        var first: Int? = nil
        var last: Int? = nil
        for rawLine in block.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard line.hasPrefix(">") else { continue }
            if let n = leadingVerseNumber(in: line) {
                if first == nil { first = n }
                last = n
            }
        }
        return (first, last)
    }

    /// `> **¹** Some text` → 1. `> **¹⁰** Other` → 10. Returns nil if the
    /// line doesn't start with a bold superscript marker.
    private func leadingVerseNumber(in line: String) -> Int? {
        // Skip leading `>` and any spaces.
        var s = line
        if s.hasPrefix(">") { s.removeFirst() }
        s = s.trimmingCharacters(in: .whitespaces)
        guard s.hasPrefix("**") else { return nil }
        s.removeFirst(2)
        // Read characters until the closing `**`.
        var marker = ""
        while !s.isEmpty {
            if s.hasPrefix("**") { break }
            marker.append(s.removeFirst())
        }
        if marker.isEmpty { return nil }
        return parseVerseMarker(marker)
    }

    private func parseVerseMarker(_ s: String) -> Int? {
        var n = 0
        var any = false
        for ch in s {
            if let d = digitValue(ch) {
                n = n * 10 + d
                any = true
            } else if ch == " " || ch == "\t" {
                continue
            } else {
                // Stop at any non-digit; the marker is the leading numeric run.
                break
            }
        }
        return any ? n : nil
    }

    private func digitValue(_ c: Character) -> Int? {
        switch c {
        case "0", "⁰": return 0
        case "1", "¹": return 1
        case "2", "²": return 2
        case "3", "³": return 3
        case "4", "⁴": return 4
        case "5", "⁵": return 5
        case "6", "⁶": return 6
        case "7", "⁷": return 7
        case "8", "⁸": return 8
        case "9", "⁹": return 9
        default: return nil
        }
    }

    private func formatVerseLabel(start: Int?, end: Int?) -> String? {
        guard let s = start else { return nil }
        guard let e = end, e != s else { return "Verse \(s)" }
        return "Verses \(s)–\(e)"
    }

    // MARK: - Prose cleaning

    /// Strip lines that are fully blockquoted (`> …`). These are the Bible
    /// verse texts that precede each commentary block; we drop them because
    /// the verses are already in the corpus's `verse` table.
    private func stripBlockquotes(_ s: String) -> String {
        return s
            .components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix(">") }
            .joined(separator: "\n")
    }

    /// Normalise whitespace and collapse markdown emphasis into plain text.
    /// Keeps paragraph breaks (double newlines).
    private func cleanProse(_ s: String) -> String {
        // Normalise line endings.
        var t = s.replacingOccurrences(of: "\r\n", with: "\n")
        // Collapse runs of 3+ newlines to exactly 2 (one blank line).
        t = t.replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        // Strip markdown bold/italic markers but leave the inner text.
        t = t.replacingOccurrences(of: #"\*\*([^*]+)\*\*"#, with: "$1", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\*([^*]+)\*"#, with: "$1", options: .regularExpression)
        // Decode markdown backslash escapes. The lyteword source escapes
        // characters that markdown would otherwise interpret — e.g. "I\." so
        // a leading roman numeral doesn't start an ordered list, "1\." for
        // the same reason. We're rendering as plain text now, so unescape any
        // ASCII-punctuation backslash sequence (CommonMark §2.4) back to its
        // literal character.
        t = t.replacingOccurrences(
            of: #"\\([!-/:-@\[-`{-~])"#,
            with: "$1",
            options: .regularExpression)
        // Strip soft trailing spaces (markdown line-break trailers).
        t = t.replacingOccurrences(of: #" +\n"#, with: "\n", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - YAML frontmatter

    /// Drops `---\n…\n---\n` leading frontmatter, if present.
    private func stripFrontmatter(_ s: String) -> String {
        guard s.hasPrefix("---") else { return s }
        // Find the closing `---` on its own line.
        let lines = s.components(separatedBy: "\n")
        var endIdx = -1
        for i in 1 ..< lines.count {
            if lines[i].trimmingCharacters(in: .whitespaces) == "---" { endIdx = i; break }
        }
        if endIdx < 0 { return s }
        return lines.dropFirst(endIdx + 1).joined(separator: "\n")
    }
}

// MARK: - Filename → chapter number

/// "chapter-12.md" → 12, "psalm-119.md" → 119. Returns nil for filenames
/// that don't match `<word>-<digits>.md`.
func chapterNumberFor(filename: String) -> Int? {
    guard filename.hasSuffix(".md") else { return nil }
    let stem = String(filename.dropLast(".md".count))
    guard let dashIdx = stem.firstIndex(of: "-") else { return nil }
    let suffix = stem[stem.index(after: dashIdx)...]
    return Int(suffix)
}

// MARK: - Folder name → book slug

/// lyteword/mhenry-complete folders are lowercase, hyphen-separated. Map
/// each to the canonical BookCatalog slug. Returns nil for non-book folders
/// (prefaces, indexes, etc.) which the caller silently skips.
func slugForFolder(_ folder: String) -> String? {
    switch folder {
    case "genesis": return "gen"
    case "exodus": return "exod"
    case "leviticus": return "lev"
    case "numbers": return "num"
    case "deuteronomy": return "deut"
    case "joshua": return "josh"
    case "judges": return "judg"
    case "ruth": return "ruth"
    case "1-samuel": return "1sam"
    case "2-samuel": return "2sam"
    case "1-kings": return "1kgs"
    case "2-kings": return "2kgs"
    case "1-chronicles": return "1chr"
    case "2-chronicles": return "2chr"
    case "ezra": return "ezra"
    case "nehemiah": return "neh"
    case "esther": return "esth"
    case "job": return "job"
    case "psalms": return "ps"
    case "proverbs": return "prov"
    case "ecclesiastes": return "eccl"
    case "song-of-solomon", "song-of-songs": return "song"
    case "isaiah": return "isa"
    case "jeremiah": return "jer"
    case "lamentations": return "lam"
    case "ezekiel": return "ezek"
    case "daniel": return "dan"
    case "hosea": return "hos"
    case "joel": return "joel"
    case "amos": return "amos"
    case "obadiah": return "obad"
    case "jonah": return "jonah"
    case "micah": return "mic"
    case "nahum": return "nah"
    case "habakkuk": return "hab"
    case "zephaniah": return "zeph"
    case "haggai": return "hag"
    case "zechariah": return "zech"
    case "malachi": return "mal"
    case "matthew": return "matt"
    case "mark": return "mark"
    case "luke": return "luke"
    case "john": return "john"
    case "acts": return "acts"
    case "romans": return "rom"
    case "1-corinthians": return "1cor"
    case "2-corinthians": return "2cor"
    case "galatians": return "gal"
    case "ephesians": return "eph"
    case "philippians": return "phil"
    case "colossians": return "col"
    case "1-thessalonians": return "1thes"
    case "2-thessalonians": return "2thes"
    case "1-timothy": return "1tim"
    case "2-timothy": return "2tim"
    case "titus": return "titus"
    case "philemon": return "phlm"
    case "hebrews": return "heb"
    case "james": return "jas"
    case "1-peter": return "1pet"
    case "2-peter": return "2pet"
    case "1-john": return "1john"
    case "2-john": return "2john"
    case "3-john": return "3john"
    case "jude": return "jude"
    case "revelation": return "rev"
    default: return nil
    }
}
