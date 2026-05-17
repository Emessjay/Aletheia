import Foundation

/// Parses CCEL's ThML (Theological Markup Language — an XML dialect built on TEI Lite).
///
/// Used for: Dialogue with Trypho (English) and On the Incarnation (English).
///
/// We pull `<div2 type="Chapter" ...>` / `<div3 type="Section" ...>` containers and capture
/// their `<p>` children's text content as the section body. Scripture references appear as
/// `<scripRef passage="John 3:16">…</scripRef>` and are preserved as inline `{ref:John.3.16}`
/// tokens so the app's reader can link them.
public struct ThMLParser {
    public init() {}

    public struct Section {
        public let ordinalPath: String     // 'trypho.31' or 'incarnation.32'
        public let kind: String            // 'chapter' / 'section'
        public let label: String?          // 'Chapter 31'
        public let body: String            // body text with inline {ref:} tokens
    }

    public struct ParseResult {
        public let title: String
        public let author: String
        public let sections: [Section]
    }

    /// Parse a ThML file. CCEL frequently bundles multiple works in one XML file (e.g.
    /// `anf01.xml` covers an entire ANF volume). Pass ``containerID`` to scope parsing to
    /// the div whose `id` attribute matches — sections are only emitted while we're inside
    /// that container.
    public func parse(fileURL: URL, workSlug: String, containerID: String? = nil) throws -> ParseResult {
        guard let parser = XMLParser(contentsOf: fileURL) else {
            throw IngestError.sourceMissing("Could not open \(fileURL.path)")
        }
        let delegate = ThMLDelegate(workSlug: workSlug, containerID: containerID)
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        if !parser.parse() {
            throw IngestError.malformed("ThML parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return ParseResult(title: delegate.title, author: delegate.author, sections: delegate.sections)
    }
}

private final class ThMLDelegate: NSObject, XMLParserDelegate {
    let workSlug: String
    let containerID: String?
    var title: String = ""
    var author: String = ""
    var sections: [ThMLParser.Section] = []

    private var depth: Int = 0
    private var currentSection: SectionInProgress?
    private var inTitle = false
    private var inAuthor = false
    private var textBuffer = ""
    private var sectionCounter = 0

    /// Tracks how deep we are inside the matching ``containerID`` div. nil container → always emit.
    private var containerStackDepth = 0
    /// Stack of `(element, isContainerMatch)` for every open `<div…>` so we can
    /// decrement `containerStackDepth` on the right closing tag.
    private var divIdStack: [Bool] = []
    private var inContainer: Bool { containerID == nil || containerStackDepth > 0 }

    /// CCEL marks footnotes as `<note place="end">…</note>` embedded inline
    /// in the prose. Their body text would otherwise stream through
    /// foundCharacters straight into the section body, e.g.
    /// "end of his sentence.Ps. cxlv. 3 And man, ..." — the footnote
    /// reference fused with the surrounding sentence. We track note depth
    /// and silence character capture (and `</p>` paragraph breaks) while
    /// inside one, so the body reads as the source prose alone.
    private var noteDepth: Int = 0
    private var inNote: Bool { noteDepth > 0 }

    init(workSlug: String, containerID: String? = nil) {
        self.workSlug = workSlug
        self.containerID = containerID
    }

    private struct SectionInProgress {
        var ordinalPath: String
        var kind: String
        var label: String?
        var body: String = ""
    }

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        let lower = element.lowercased()
        if !inNote, textBuffer.contains(where: { !$0.isWhitespace }), var section = currentSection {
            section.body += textBuffer
            currentSection = section
        }
        textBuffer.removeAll(keepingCapacity: true)

        if lower == "note" { noteDepth += 1 }
        if lower == "title" { inTitle = true }
        if lower == "author" { inAuthor = true }

        // Track entry into the work-scoping container, if one was requested. Every opening
        // `<div…>` pushes onto `divIdStack`; the boolean records whether *this* div was the
        // container match, so the corresponding `</div>` decrements the counter exactly once.
        if lower.hasPrefix("div") {
            let isMatch = containerID != nil && attributes["id"] == containerID
            if isMatch { containerStackDepth += 1 }
            divIdStack.append(isMatch)
        }

        // Section-defining containers in ThML.
        //
        // Conventionally these are `div1/div2/div3` with a `type` attribute like "chapter" /
        // "book" / "discourse". But CCEL is inconsistent — Justin Martyr's *Dialogue with
        // Trypho* leaves its `<div3>` chapter elements without a `type` attribute and signals
        // chapter-ness only through `shorttitle="Chapter I.—…"`. So we accept either:
        //   • a recognized `type` attribute, OR
        //   • a `shorttitle` (or `title`) that begins with a known structural prefix.
        //
        // The strict signal matters because CCEL volumes wrap each work in a pile of editorial
        // divs — Translator's Preface, Introductory Notice, Argument, Excursus — that look like
        // sections by depth alone. Requiring a positive signal filters those out.
        //
        // ThML divs always carry a globally-unique `id` attribute (e.g. "viii.iv.iii");
        // that becomes our ordinal_path so chapter numbers can repeat across works
        // within the same volume without colliding.
        let typeAttr = attributes["type"]?.lowercased()
        let structuralTypes: Set<String> = [
            "chapter", "section", "subsection", "article",
            "book", "discourse", "letter", "treatise", "part", "homily"
        ]
        let recognizedType = typeAttr.map { structuralTypes.contains($0) } ?? false
        let labelText = attributes["shorttitle"] ?? attributes["title"] ?? ""
        let structuralPrefixes = [
            "Chapter ", "Book ", "Discourse ", "Letter ", "Treatise ",
            "Section ", "Part ", "Article ", "Homily "
        ]
        let prefixMatch = structuralPrefixes.contains(where: { labelText.hasPrefix($0) })
        let isSectionDiv = (lower == "div2" || lower == "div3" || lower == "div4" || lower == "div5")
        if inContainer, isSectionDiv, recognizedType || prefixMatch {
            commitCurrentSection()
            sectionCounter += 1
            let identifier = attributes["id"] ?? attributes["n"] ?? String(sectionCounter)
            let n = attributes["n"]
            let kind = typeAttr ?? "chapter"
            currentSection = SectionInProgress(
                ordinalPath: "\(workSlug).\(identifier)",
                kind: kind,
                label: attributes["title"] ?? attributes["shorttitle"] ?? n.map { "Chapter \($0)" }
            )
        }

        if !inNote, lower == "scripref", let passage = attributes["passage"] {
            // Embed an inline token the app can post-process into a tappable link.
            // ScripRefs nested inside <note> are footnote-only and skipped along
            // with the rest of the note body.
            if var s = currentSection {
                s.body += "{ref:\(passage)}"
                currentSection = s
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let lower = element.lowercased()
        let text = textBuffer
        if inTitle, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.isEmpty {
            title = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if inAuthor, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, author.isEmpty {
            author = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if lower == "title" { inTitle = false }
        if lower == "author" { inAuthor = false }

        if !inNote, var section = currentSection {
            section.body += text
            currentSection = section
        }
        textBuffer.removeAll(keepingCapacity: true)

        if lower == "note" { noteDepth = max(0, noteDepth - 1) }

        if lower.hasPrefix("div") {
            if let wasMatch = divIdStack.popLast(), wasMatch {
                containerStackDepth = max(0, containerStackDepth - 1)
                // Flush any in-progress section now that we're leaving the work container.
                commitCurrentSection()
            }
        }
        if !inNote, lower == "p" || isHeadingTag(lower) {
            // Heading tags (h1-h6) get the same paragraph break as <p>. Trypho marks
            // chapter titles with bare <h3> outside any <p>, and without a break the
            // heading text fuses onto the first body sentence — "Chapter I.—Introduction.While
            // I was going about…". The break lets `commitCurrentSection` see the heading
            // as its own paragraph and strip it.
            if var section = currentSection {
                section.body += "\n\n"
                currentSection = section
            }
        }
    }

    private func isHeadingTag(_ lower: String) -> Bool {
        guard lower.count == 2, lower.first == "h" else { return false }
        return ("1"..."6").contains(String(lower.last!))
    }

    func parserDidEndDocument(_ parser: XMLParser) {
        commitCurrentSection()
    }

    private func commitCurrentSection() {
        guard let current = currentSection else { return }
        let normalized = current.body
            .replacingOccurrences(of: #"[\t ]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // If the label is just an ordinal ("Discourse IV") or missing, derive a
        // descriptive snippet from the heading/body *before* we strip — the heading
        // paragraph that we're about to discard often is the chapter summary.
        var finalLabel = current.label
        if ThMLParser.isOrdinalOnlyLabel(finalLabel) {
            if let snippet = ThMLParser.headingSnippet(from: normalized) {
                let base = finalLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                finalLabel = base.isEmpty ? snippet : "\(base) — \(snippet)"
            }
        }

        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: normalized, label: current.label)

        // Container-only sections (e.g. confessions Books) end up with an empty body once
        // their title-page contents are stripped. Still emit them — the UI navigates by
        // label and renders just the heading.
        let labelText = finalLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !stripped.isEmpty || !labelText.isEmpty {
            sections.append(ThMLParser.Section(
                ordinalPath: current.ordinalPath,
                kind: current.kind,
                label: finalLabel,
                body: stripped
            ))
        }
        currentSection = nil
    }

}

// MARK: - Heading detection / cleanup (file-scope so tests can exercise it)

extension ThMLParser {
    /// Structural prefixes that can stand in for a chapter title in the source.
    /// Match must be case-insensitive (e.g. "CHAPTER I" appears in some volumes).
    fileprivate static let structuralPrefixPattern =
        #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily)\b"#

    /// True if `label` is missing or only carries an ordinal (e.g. "Discourse IV",
    /// "Chapter 3.") with no descriptive content — meaning we should synthesize a
    /// better label from the body.
    static func isOrdinalOnlyLabel(_ label: String?) -> Bool {
        let trimmed = label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty { return true }
        return trimmed.range(
            of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily)\s+[ivxlcdm0-9]+\.?$"#,
            options: .regularExpression
        ) != nil
    }

    /// Strip leading heading / preface paragraphs from a section body. The first
    /// paragraph that doesn't look like a heading stops the loop, so real prose at
    /// the top of the body is preserved.
    static func stripLeadingHeadingParagraphs(from body: String, label: String?) -> String {
        var paragraphs = body.components(separatedBy: "\n\n")
        let labelNorm = label.map(normalizeWhitespace).flatMap { $0.isEmpty ? nil : $0 }
        var stripped = 0
        let maxStrip = 6
        // The "looks like a volume title" heuristic — short / no-comma / single-sentence —
        // can false-positive on a body opener (e.g. "Whereas in what precedes we have drawn
        // out a sufficient account."). It only fires before any explicit chapter / § / label
        // strike, since work titles always precede those in CCEL volumes.
        var sawStructural = false
        while let first = paragraphs.first, stripped < maxStrip {
            let para = normalizeWhitespace(first)
            if para.isEmpty {
                paragraphs.removeFirst()
                continue
            }
            let outcome = classifyHeadingParagraph(para, labelNorm: labelNorm, allowTitleHeuristic: !sawStructural)
            switch outcome {
            case .keep:
                return paragraphs.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
            case .strip(let structural):
                paragraphs.removeFirst()
                stripped += 1
                if structural { sawStructural = true }
            }
        }
        return paragraphs.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Look through the first few paragraphs for a descriptive heading (e.g.
    /// "§§1–5. The substantiality of the Word…") and return its first sentence
    /// with any structural prefix stripped — used to synthesize a label when the
    /// source provides only an ordinal.
    static func headingSnippet(from body: String) -> String? {
        for raw in body.components(separatedBy: "\n\n").prefix(6) {
            var para = normalizeWhitespace(raw)
            if para.isEmpty { continue }
            if para.range(of: #"^[—–\-_·•\s]+$"#, options: .regularExpression) != nil { continue }
            // Skip bare ordinals ("Discourse IV.", "Book I."); the descriptive
            // text is in a later paragraph.
            if para.range(
                of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily)\s+[ivxlcdm0-9]+\.?$"#,
                options: .regularExpression
            ) != nil { continue }
            // Pull off a "Chapter X.—" / "§N." / "§§1–5." prefix to get the description.
            para = para.replacingOccurrences(
                of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily)\s+[ivxlcdm0-9]+\.?\s*[—–-]?\s*"#,
                with: "",
                options: .regularExpression
            )
            para = para.replacingOccurrences(
                of: #"^§{1,2}\s*\d+(?:\s*[–\-—]\s*\d+)?\.?\s*"#,
                with: "",
                options: .regularExpression
            ).trimmingCharacters(in: .whitespacesAndNewlines)
            if para.isEmpty { continue }
            let sentence = firstSentence(of: para, maxChars: 100)
            if !sentence.isEmpty { return sentence }
        }
        return nil
    }

    fileprivate enum HeadingOutcome {
        /// Paragraph is not a heading; stop stripping and keep it.
        case keep
        /// Paragraph is a heading; drop it. `structural` is true for explicit chapter /
        /// section / § / label-match markers — once we've seen one, the looser
        /// "looks like a volume title" rule must not fire again, otherwise it eats prose.
        case strip(structural: Bool)
    }

    fileprivate static func classifyHeadingParagraph(_ para: String, labelNorm: String?, allowTitleHeuristic: Bool) -> HeadingOutcome {
        // Horizontal rule (em-dash / en-dash / hyphen / underscore / bullet).
        if para.range(of: #"^[—–\-_·•\s]+$"#, options: .regularExpression) != nil {
            return .strip(structural: false)
        }
        // "Chapter I.—…", "Book II.", "Discourse IV", "Section 3 — …"
        if para.range(of: structuralPrefixPattern + #"\s+([ivxlcdm]+|\d+)\b"#, options: .regularExpression) != nil {
            return .strip(structural: true)
        }
        // §-prefixed summary line: "§1.", "§§1–5.", "§ 12 …"
        if para.range(of: #"^§{1,2}\s*\d"#, options: .regularExpression) != nil {
            return .strip(structural: true)
        }
        // Body paragraph that exactly reproduces the recorded label (confessions Books).
        if let lbl = labelNorm, para == lbl { return .strip(structural: true) }
        // Stand-alone work / volume title — short, single-sentence, no comma, ends with '.'
        // ("Four Discourses Against the Arians.", "On the Incarnation of the Word."). Gated
        // by `allowTitleHeuristic` because the same shape matches some body openers.
        if allowTitleHeuristic,
           para.count <= 80,
           para.hasSuffix("."),
           !para.dropLast().contains(". "),
           !para.contains(","),
           para.contains(where: \.isLetter) {
            return .strip(structural: false)
        }
        return .keep
    }

    fileprivate static func firstSentence(of text: String, maxChars: Int) -> String {
        var idx = text.startIndex
        while idx < text.endIndex {
            let ch = text[idx]
            if ch == "." || ch == "?" || ch == "!" {
                let next = text.index(after: idx)
                if next == text.endIndex || text[next].isWhitespace {
                    return String(text[..<idx]).trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            idx = text.index(after: idx)
        }
        if text.count <= maxChars { return text }
        let prefix = text.prefix(maxChars)
        if let space = prefix.lastIndex(of: " ") {
            return String(prefix[..<space]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
        }
        return String(prefix) + "…"
    }

    fileprivate static func normalizeWhitespace(_ s: String) -> String {
        s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
         .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
