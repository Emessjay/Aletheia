import Foundation

/// Parses Open Greek and Latin / Perseus Digital Library TEI XML files.
///
/// Used for: Dialogue with Trypho (`tlg0645.tlg003`) and On the Incarnation (`tlg2035.tlg002`).
///
/// Structure (First1KGreek convention):
///
///     <div type="edition" n="urn:...">
///       <div type="textpart" subtype="chapter" n="1">
///         <div type="textpart" subtype="section" n="1">…</div>
///         <div type="textpart" subtype="section" n="2">…</div>
///       </div>
///       <div type="textpart" subtype="chapter" n="2">…</div>
///     </div>
///
/// We walk a stack of (subtype, n) tuples and build ordinal_paths that include every
/// containing chapter — so `workSlug.1.1` is "chapter 1 section 1", distinct from
/// `workSlug.2.1` ("chapter 2 section 1"). Each leaf section becomes its own row.
public struct TEIGreekParser {
    public init() {}

    public struct Section {
        public let ordinalPath: String
        public let kind: String
        public let label: String?
        public let body: String
    }

    public struct ParseResult {
        public let title: String
        public let sections: [Section]
    }

    public func parse(fileURL: URL, workSlug: String) throws -> ParseResult {
        guard let parser = XMLParser(contentsOf: fileURL) else {
            throw IngestError.sourceMissing("Could not open \(fileURL.path)")
        }
        let delegate = TEIDelegate(workSlug: workSlug)
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        if !parser.parse() {
            throw IngestError.malformed("TEI parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return ParseResult(title: delegate.title, sections: delegate.sections)
    }
}

private final class TEIDelegate: NSObject, XMLParserDelegate {
    let workSlug: String
    var title: String = ""
    var sections: [TEIGreekParser.Section] = []

    private var titleText = ""
    private var inTitle = false
    private var inBody = false

    /// Stack of (subtype, n) for every open `<div type="textpart">` we're currently inside.
    private var divStack: [(subtype: String, n: String)] = []

    /// Body text accumulator per open div, keyed by stack depth. Closing a div folds its
    /// body up into its parent and emits a Section when appropriate.
    private var bodyStack: [String] = []
    private var textBuffer = ""

    init(workSlug: String) { self.workSlug = workSlug }

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        let lower = element.lowercased()
        flushBuffer()

        if lower == "title" && title.isEmpty { inTitle = true }
        if lower == "body" || lower == "text" { inBody = true }

        if lower == "div" && inBody {
            let type = (attributes["type"] ?? "").lowercased()
            let subtype = (attributes["subtype"] ?? "").lowercased()
            let n = attributes["n"] ?? ""
            if type == "textpart" {
                divStack.append((subtype: subtype, n: n))
                bodyStack.append("")
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let lower = element.lowercased()
        if inTitle {
            titleText += textBuffer
            if lower == "title" {
                title = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
                inTitle = false; titleText = ""
            }
        }
        if inBody {
            appendToTop(textBuffer)
            if lower == "p" || lower == "seg" || lower == "l" { appendToTop("\n\n") }
            if lower == "div" && !divStack.isEmpty {
                let closing = divStack.removeLast()
                let body = bodyStack.removeLast()
                // Only emit "section"-level (or "chapter"-level if no inner sections existed) leaves.
                // A chapter that contains sections gets its body folded into its sections.
                let isLeaf = closing.subtype == "section"
                    || (closing.subtype == "chapter" && !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        && (lastEmittedParent != pathPrefix()))
                if isLeaf {
                    let path = pathPrefix() + (pathPrefix().isEmpty ? "" : ".") + closing.n
                    let fullPath = "\(workSlug).\(path)"
                    let cleaned = body
                        .replacingOccurrences(of: #"[\t ]+"#, with: " ", options: .regularExpression)
                        .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !cleaned.isEmpty {
                        sections.append(.init(
                            ordinalPath: fullPath,
                            kind: closing.subtype.isEmpty ? "section" : closing.subtype,
                            label: makeLabel(for: closing, stack: divStack),
                            body: cleaned
                        ))
                        lastEmittedParent = pathPrefix()
                    }
                } else {
                    // Fold this body up into the parent if any
                    if !bodyStack.isEmpty {
                        bodyStack[bodyStack.count - 1] += body
                    }
                }
            }
        }
        textBuffer.removeAll(keepingCapacity: true)
    }

    private var lastEmittedParent: String = ""

    private func pathPrefix() -> String {
        divStack.map(\.n).joined(separator: ".")
    }

    private func appendToTop(_ s: String) {
        guard !bodyStack.isEmpty else { return }
        bodyStack[bodyStack.count - 1] += s
    }

    private func flushBuffer() {
        if inTitle { titleText += textBuffer }
        if inBody { appendToTop(textBuffer) }
        textBuffer.removeAll(keepingCapacity: true)
    }

    private func makeLabel(for closing: (subtype: String, n: String), stack: [(subtype: String, n: String)]) -> String? {
        // "Chapter 1, Section 2" — include each ancestor's label
        let parts = stack.map { "\($0.subtype.capitalized) \($0.n)" } + ["\(closing.subtype.capitalized) \(closing.n)"]
        return parts.joined(separator: ", ")
    }
}
