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
        if !inNote, lower == "p" {
            if var section = currentSection {
                section.body += "\n\n"
                currentSection = section
            }
        }
    }

    func parserDidEndDocument(_ parser: XMLParser) {
        commitCurrentSection()
    }

    private func commitCurrentSection() {
        guard let current = currentSection else { return }
        let cleaned = current.body.replacingOccurrences(of: #"[\t ]+"#, with: " ", options: .regularExpression)
                                  .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
                                  .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleaned.isEmpty {
            sections.append(ThMLParser.Section(
                ordinalPath: current.ordinalPath,
                kind: current.kind,
                label: current.label,
                body: cleaned
            ))
        }
        currentSection = nil
    }
}
