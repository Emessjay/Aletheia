import Foundation

/// Parses Strong's lexicon entries.
///
/// **Hebrew (openscriptures/HebrewLexicon)** — XML with `<entry id="H1">` containing
///   `<w pos="..." pron="...">אָב</w>`, `<source>...</source>`, `<meaning>...</meaning>`,
///   `<usage>...</usage>`. BDB definitions appear in `<sense level="..." ...>` children.
///
/// **Greek (openscriptures/strongs)** — XML with `<entry strongs="G1">` containing
///   `<greek unicode="Ἀαρών" translit="Aarōn"/>`, `<strongs_def>...</strongs_def>`,
///   `<kjv_def>...</kjv_def>`.
///
/// We use XMLParser (Foundation's SAX-style stream parser) for both, since the files are
/// 8-15 MB and full DOM loads are wasteful. Each parser returns ``StrongsRow`` values
/// suitable for direct upsert into the corpus.
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
        let delegate = HebrewLexiconDelegate()
        guard let parser = XMLParser(contentsOf: url) else {
            throw IngestError.sourceMissing("Could not open \(url.path)")
        }
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        if !parser.parse() {
            throw IngestError.malformed("Hebrew lexicon parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return delegate.entries
    }

    private func parseGreek(at url: URL) throws -> [StrongsRow] {
        let delegate = GreekLexiconDelegate()
        guard let parser = XMLParser(contentsOf: url) else {
            throw IngestError.sourceMissing("Could not open \(url.path)")
        }
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        if !parser.parse() {
            throw IngestError.malformed("Greek lexicon parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        return delegate.entries
    }
}

// MARK: - SAX delegates

private final class HebrewLexiconDelegate: NSObject, XMLParserDelegate {
    var entries: [StrongsRow] = []

    private var current: Current?
    private var textBuffer = ""

    private struct Current {
        var id: String
        var lemma: String = ""
        var translit: String?
        var meaning: String = ""
        var definition: String = ""
        var usage: String = ""
    }

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        textBuffer.removeAll(keepingCapacity: true)
        if element == "entry", let id = attributes["id"] ?? attributes["strongs"] {
            current = Current(id: normalizeID(id, prefix: "H"))
        }
        if element == "w" || element == "lemma" {
            // capture transliteration if present
            if let pron = attributes["pron"] ?? attributes["xlit"] {
                current?.translit = pron
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let text = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        switch element {
        case "w", "lemma":
            if current?.lemma.isEmpty == true { current?.lemma = text }
        case "meaning", "def", "definition":
            if !text.isEmpty { current?.meaning = text }
        case "source", "explanation":
            if !text.isEmpty {
                let separator = (current?.definition.isEmpty ?? true) ? "" : " "
                current?.definition += separator + text
            }
        case "usage":
            if !text.isEmpty { current?.usage = text }
        case "entry":
            if let c = current {
                entries.append(StrongsRow(
                    id: c.id, language: "he", lemma: c.lemma,
                    transliteration: c.translit,
                    gloss: c.meaning,
                    definition: c.definition.isEmpty ? c.meaning : c.definition,
                    kjvUsage: c.usage.isEmpty ? nil : c.usage
                ))
            }
            current = nil
        default: break
        }
        textBuffer.removeAll(keepingCapacity: true)
    }
}

private final class GreekLexiconDelegate: NSObject, XMLParserDelegate {
    var entries: [StrongsRow] = []

    private var current: Current?
    private var textBuffer = ""
    private var inDefinition = false

    private struct Current {
        var id: String
        var lemma: String = ""
        var translit: String?
        var strongsDef: String = ""
        var kjvDef: String = ""
    }

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        textBuffer.removeAll(keepingCapacity: true)
        if element == "entry", let id = attributes["strongs"] ?? attributes["id"] {
            current = Current(id: normalizeID(id, prefix: "G"))
        }
        if element == "greek" {
            if let unicode = attributes["unicode"] { current?.lemma = unicode }
            if let translit = attributes["translit"] { current?.translit = translit }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        textBuffer += string
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let text = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        switch element {
        case "strongs_def":
            if !text.isEmpty { current?.strongsDef = text }
        case "kjv_def":
            if !text.isEmpty { current?.kjvDef = text }
        case "entry":
            if let c = current {
                entries.append(StrongsRow(
                    id: c.id, language: "gk", lemma: c.lemma,
                    transliteration: c.translit,
                    gloss: shortGloss(from: c.strongsDef.isEmpty ? c.kjvDef : c.strongsDef),
                    definition: c.strongsDef,
                    kjvUsage: c.kjvDef.isEmpty ? nil : c.kjvDef
                ))
            }
            current = nil
        default: break
        }
        textBuffer.removeAll(keepingCapacity: true)
    }
}

private func normalizeID(_ id: String, prefix: String) -> String {
    let trimmed = id.trimmingCharacters(in: .whitespaces)
    if trimmed.first?.isLetter == true { return trimmed }
    return prefix + trimmed
}

/// Extract a short headword-style gloss from a longer definition by taking the first
/// clause before a semicolon, comma, or sentence boundary, capped at ~80 chars.
private func shortGloss(from definition: String) -> String {
    let scanned = definition
        .split(whereSeparator: { ";".contains($0) || ".".contains($0) })
        .first
        .map(String.init) ?? definition
    let trimmed = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count > 80 ? String(trimmed.prefix(77)) + "…" : trimmed
}
