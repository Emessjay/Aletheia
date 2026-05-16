import Foundation

/// Parses Strong's lexicon entries.
///
/// **Hebrew (openscriptures/HebrewLexicon)** — XML with `<entry id="H1">` containing
///   `<w pos="..." pron="...">אָב</w>`, `<source>...</source>`, `<meaning>...</meaning>`,
///   `<usage>...</usage>`. Inline children of `<source>`/`<meaning>` (`<w>`, `<def>`,
///   `<foreign>`, etc.) hold prose that needs to be preserved in the parent text.
///
/// **Greek (openscriptures/strongs)** — XML with `<entry strongs="G1">` containing
///   `<greek unicode="Ἀαρών" translit="Aarōn"/>`, `<strongs_derivation>...</strongs_derivation>`,
///   `<strongs_def>...</strongs_def>`, `<kjv_def>...</kjv_def>`. `<strongs_derivation>` holds
///   the etymology + core sense and must be captured.
///
/// SAX-style parsing keyed on a per-element text accumulator stack: each
/// `didStartElement` pushes a fresh accumulator, `foundCharacters` appends to
/// the top, and `didEndElement` either claims the accumulated text (for
/// entry-level fields) or propagates it up to its parent (for inline children).
/// This is what handles the nested-markup case — earlier versions used a
/// single shared buffer that got wiped on every `didStartElement`, so any text
/// before a nested element was lost (e.g. H1961's source/meaning collapsed to
/// `);` / `(always emphatic, ...)`).
public struct LexiconParser {
    public enum Source {
        case hebrewBDB(URL)
        case greekStrongs(URL)
    }

    public init() {}

    public func parse(_ source: Source) throws -> [StrongsRow] {
        switch source {
        case .hebrewBDB(let url):
            return try parseHebrew(at: url)
        case .greekStrongs(let url):
            return try parseGreek(at: url)
        }
    }

    private func parseHebrew(at url: URL) throws -> [StrongsRow] {
        guard let parser = XMLParser(contentsOf: url) else {
            throw IngestError.sourceMissing("Could not open \(url.path)")
        }
        return try runHebrew(parser: parser)
    }

    private func parseGreek(at url: URL) throws -> [StrongsRow] {
        guard let parser = XMLParser(contentsOf: url) else {
            throw IngestError.sourceMissing("Could not open \(url.path)")
        }
        return try runGreek(parser: parser)
    }

    /// Test hook: parse a Hebrew lexicon fragment from a string.
    public func parseHebrew(text: String) throws -> [StrongsRow] {
        let parser = XMLParser(data: Data(text.utf8))
        return try runHebrew(parser: parser)
    }

    /// Test hook: parse a Greek lexicon fragment from a string.
    public func parseGreek(text: String) throws -> [StrongsRow] {
        let parser = XMLParser(data: Data(text.utf8))
        return try runGreek(parser: parser)
    }

    private func runHebrew(parser: XMLParser) throws -> [StrongsRow] {
        let delegate = HebrewLexiconDelegate()
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        if !parser.parse() {
            throw IngestError.malformed("Hebrew lexicon parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return delegate.entries
    }

    private func runGreek(parser: XMLParser) throws -> [StrongsRow] {
        let delegate = GreekLexiconDelegate()
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        if !parser.parse() {
            throw IngestError.malformed("Greek lexicon parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return delegate.entries
    }
}

// MARK: - SAX delegates

/// Common scaffolding for an XML parser delegate that needs to preserve text
/// across nested inline elements.
private class StackedTextDelegate: NSObject, XMLParserDelegate {
    /// Parallel stacks of element names and their accumulated text content.
    var elementStack: [String] = []
    var textStack: [String] = []

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        elementStack.append(element)
        textStack.append("")
        onStart(element: element, attributes: attributes)
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if !textStack.isEmpty {
            textStack[textStack.count - 1] += string
        }
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let text = textStack.popLast() ?? ""
        elementStack.popLast()
        let parent = elementStack.last
        if !onEnd(element: element, parent: parent, text: text) {
            // Default: propagate inline-child text up to the parent accumulator.
            if !textStack.isEmpty {
                textStack[textStack.count - 1] += text
            }
        }
    }

    /// Subclass hook called on each opening tag.
    func onStart(element: String, attributes: [String: String]) {}

    /// Subclass hook called on each closing tag. Return `true` if the
    /// subclass has consumed this element's text (no parent propagation
    /// needed); `false` to let the base class propagate text up to the
    /// parent accumulator (for inline children like `<def>`, `<foreign>`).
    func onEnd(element: String, parent: String?, text: String) -> Bool {
        return false
    }
}

private final class HebrewLexiconDelegate: StackedTextDelegate {
    var entries: [StrongsRow] = []
    private var current: Current?

    private struct Current {
        var id: String
        var lemma: String = ""
        var translit: String?
        var meaning: String = ""
        var source: String = ""
        var usage: String = ""
    }

    override func onStart(element: String, attributes: [String: String]) {
        if element == "entry", let id = attributes["id"] ?? attributes["strongs"] {
            current = Current(id: normalizeID(id, prefix: "H"))
        }
        if element == "w" || element == "lemma" {
            // Only the entry-level <w> (direct child of <entry>) carries the
            // transliteration attribute we want; nested <w> inside <source>/
            // <meaning> are cross-references.
            if elementStack.count == 2 /* entry + this element */ {
                if let pron = attributes["pron"] ?? attributes["xlit"] {
                    current?.translit = pron
                }
            }
        }
    }

    override func onEnd(element: String, parent: String?, text: String) -> Bool {
        let trimmed = collapseWhitespace(text)
        switch element {
        case "w", "lemma":
            // Direct child of <entry> → the headword. Otherwise this is a
            // cross-reference inside <source>/<meaning>; let the base class
            // propagate its visible text up.
            if parent == "entry" && current?.lemma.isEmpty == true {
                current?.lemma = trimmed
                return true
            }
            return false
        case "meaning":
            current?.meaning = trimmed
            return true
        case "source":
            current?.source = trimmed
            return true
        case "usage":
            current?.usage = trimmed
            return true
        case "entry":
            if let c = current {
                let definition: String
                if !c.source.isEmpty && !c.meaning.isEmpty {
                    definition = c.source + " " + c.meaning
                } else if !c.meaning.isEmpty {
                    definition = c.meaning
                } else {
                    definition = c.source
                }
                entries.append(StrongsRow(
                    id: c.id, language: "he", lemma: c.lemma,
                    transliteration: c.translit,
                    gloss: shortGloss(from: c.meaning.isEmpty ? definition : c.meaning),
                    definition: definition,
                    kjvUsage: c.usage.isEmpty ? nil : c.usage
                ))
            }
            current = nil
            return true
        default:
            // Inline child (def, foreign, em, source-style …): propagate text.
            return false
        }
    }
}

private final class GreekLexiconDelegate: StackedTextDelegate {
    var entries: [StrongsRow] = []
    private var current: Current?

    private struct Current {
        var id: String
        var lemma: String = ""
        var translit: String?
        var derivation: String = ""
        var strongsDef: String = ""
        var kjvDef: String = ""
    }

    override func onStart(element: String, attributes: [String: String]) {
        if element == "entry", let id = attributes["strongs"] ?? attributes["id"] {
            current = Current(id: normalizeID(id, prefix: "G"))
        }
        if element == "greek" {
            if let unicode = attributes["unicode"] { current?.lemma = unicode }
            if let translit = attributes["translit"] { current?.translit = translit }
        }
        // <strongsref/> is a self-closing cross-reference with no inner text;
        // without help it would leave behind "(with )" / "(from )" in the
        // surrounding prose. Seed its text accumulator with the canonical
        // Strong's ID so the surrounding text reads "(with G3588)".
        if element == "strongsref", let s = attributes["strongs"] {
            let prefix = (attributes["language"]?.uppercased() == "HEBREW") ? "H" : "G"
            let id = normalizeID(s, prefix: prefix)
            if !textStack.isEmpty {
                textStack[textStack.count - 1] = id
            }
        }
    }

    override func onEnd(element: String, parent: String?, text: String) -> Bool {
        let trimmed = collapseWhitespace(text)
        switch element {
        case "strongs_derivation":
            current?.derivation = trimmed
            return true
        case "strongs_def":
            current?.strongsDef = trimmed
            return true
        case "kjv_def":
            // kjv_def in this source starts with ":--" — strip the artifact.
            var t = trimmed
            if t.hasPrefix(":--") { t = String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces) }
            else if t.hasPrefix(":-") { t = String(t.dropFirst(2)).trimmingCharacters(in: .whitespaces) }
            current?.kjvDef = t
            return true
        case "entry":
            if let c = current {
                // Combine derivation + strongs_def for a full Strong's definition.
                var pieces: [String] = []
                if !c.derivation.isEmpty { pieces.append(c.derivation) }
                if !c.strongsDef.isEmpty { pieces.append(c.strongsDef) }
                let definition = pieces.joined(separator: " ")
                entries.append(StrongsRow(
                    id: c.id, language: "gk", lemma: c.lemma,
                    transliteration: c.translit,
                    gloss: shortGloss(from: definition),
                    definition: definition,
                    kjvUsage: c.kjvDef.isEmpty ? nil : c.kjvDef
                ))
            }
            current = nil
            return true
        default:
            // Inline children: <strongsref/>, <pronunciation/>, <greek/>,
            // <latin/>. The self-closing ones have no text. <latin> and
            // <greek> nested in definitions hold visible glosses — let those
            // propagate via the default.
            return false
        }
    }
}

/// Canonical Strong's ID: `H`/`G` prefix + decimal digits with no leading
/// zeros (matches STEPBibleParser.normalizeStrongs). The lexicon source uses
/// inconsistent padding (`H1961` unpadded vs Greek `02316` zero-padded);
/// canonicalising here means word.strongs joins lexicon.id without surprises.
private func normalizeID(_ id: String, prefix: String) -> String {
    let trimmed = id.trimmingCharacters(in: .whitespaces)
    let withoutPrefix: Substring
    if let first = trimmed.first, first == "H" || first == "G" {
        withoutPrefix = trimmed.dropFirst()
    } else {
        withoutPrefix = Substring(trimmed)
    }
    let digits = String(withoutPrefix).drop(while: { $0 == "0" })
    let effectivePrefix: String = {
        if let f = trimmed.first, f == "H" || f == "G" { return String(f) }
        return prefix
    }()
    return effectivePrefix + (digits.isEmpty ? "0" : String(digits))
}

/// Squash any run of whitespace/newlines into single spaces, then trim ends.
private func collapseWhitespace(_ s: String) -> String {
    s.replacingOccurrences(
        of: #"\s+"#, with: " ", options: .regularExpression
    ).trimmingCharacters(in: .whitespaces)
}

/// Extract a short headword-style gloss from a longer definition by taking
/// the first clause before a semicolon (top-level only), capped at ~80 chars.
/// We deliberately do NOT split on `.` — many entries contain "i.e." or
/// "e.g." which an over-eager split mangles into "i" / "e".
private func shortGloss(from definition: String) -> String {
    if definition.isEmpty { return "" }
    let scanned = definition
        .split(whereSeparator: { $0 == ";" })
        .first
        .map(String.init) ?? definition
    let trimmed = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count > 80 ? String(trimmed.prefix(77)) + "…" : trimmed
}
