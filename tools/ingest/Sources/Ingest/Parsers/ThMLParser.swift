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

    /// A single discovered work inside a volume: its title (used for display
    /// + slug), the CCEL `id` of its top-level container, and an optional
    /// per-work author when the volume embeds one.
    public struct WorkEntry {
        public let slug: String        // slugified from title, e.g. "the-confessions"
        public let title: String       // "The Confessions"
        public let containerID: String // CCEL div id, e.g. "vi"
        public let author: String?     // nil → fall back to volume-level author
    }

    public struct VolumeManifest {
        public let title: String       // volume title from the ThML <title>
        public let author: String      // volume author (often the editor or single-author label)
        public let works: [WorkEntry]
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

    /// Enumerate the non-editorial top-level works in a ThML volume.
    /// Each NPNF/ANF volume bundles multiple discrete works (Augustine's
    /// Confessions and Letters live in NPNF1-01; Athanasius's Incarnation,
    /// Discourses, Life of Antony etc. live in NPNF2-04). Discovery walks
    /// the volume's `<div1>` entries, filters out editorial wrappers
    /// (Title Page, Preface, Contents, Indexes, Prolegomena, Translator's
    /// Preface, Chief Events…), and returns one ``WorkEntry`` per real
    /// work for the Pipeline to ingest individually.
    public func discoverWorks(fileURL: URL) throws -> VolumeManifest {
        guard let parser = XMLParser(contentsOf: fileURL) else {
            throw IngestError.sourceMissing("Could not open \(fileURL.path)")
        }
        let delegate = ThMLDiscoveryDelegate()
        parser.delegate = delegate
        parser.shouldProcessNamespaces = false
        parser.shouldResolveExternalEntities = false
        if !parser.parse() {
            throw IngestError.malformed("ThML discovery parse failed: \(parser.parserError?.localizedDescription ?? "unknown")")
        }
        // Editorial-title filter applied after we have the full list so we
        // can disambiguate across volumes consistently.
        var seenSlugs = Set<String>()
        var works: [WorkEntry] = []
        for cand in delegate.candidates {
            if isEditorialTitle(cand.title) { continue }
            var slug = slugify(cand.title)
            if slug.isEmpty { slug = cand.id.lowercased() }
            var unique = slug
            var n = 2
            while seenSlugs.contains(unique) {
                unique = "\(slug)-\(n)"
                n += 1
            }
            seenSlugs.insert(unique)
            works.append(WorkEntry(
                slug: unique,
                title: cand.title,
                containerID: cand.id,
                author: nil
            ))
        }
        return VolumeManifest(
            title: delegate.volumeTitle,
            author: delegate.volumeAuthor,
            works: works
        )
    }
}

/// Slugify a work title for use as a URL-friendly identifier. Lowercases,
/// strips diacritics, collapses runs of non-alphanumeric characters into a
/// single dash, and trims leading/trailing dashes.
/// Friendly names for the CCEL author IDs (lowercase machine slugs) we
/// expect to encounter in the ANF/NPNF volume headers. Anything not in the
/// table falls through to a titlecased rendering of the slug itself.
private let ccelAuthorDisplay: [String: String] = [
    "augustine": "Augustine of Hippo",
    "chrysostom": "John Chrysostom",
    "athanasius": "Athanasius of Alexandria",
    "irenaeus": "Irenaeus",
    "tertullian": "Tertullian",
    "origen": "Origen",
    "jerome": "Jerome",
    "ambrose": "Ambrose",
    "basil": "Basil of Caesarea",
    "gregory_nyssa": "Gregory of Nyssa",
    "gregory_naz": "Gregory of Nazianzus",
    "gregory_nazianzus": "Gregory of Nazianzus",
    "gregory_great": "Gregory the Great",
    "cyprian": "Cyprian of Carthage",
    "cyril_jerusalem": "Cyril of Jerusalem",
    "cyril_alexandria": "Cyril of Alexandria",
    "leo_great": "Leo the Great",
    "leo": "Leo the Great",
    "eusebius": "Eusebius of Caesarea",
    "socrates": "Socrates Scholasticus",
    "sozomen": "Sozomen",
    "theodoret": "Theodoret of Cyrus",
    "hilary_poitiers": "Hilary of Poitiers",
    "hilary_poit": "Hilary of Poitiers",
    "hilary": "Hilary of Poitiers",
    "john_damascene": "John of Damascus",
    "damascene": "John of Damascus",
    "justin": "Justin Martyr",
    "clement_alexandria": "Clement of Alexandria",
    "clement_rome": "Clement of Rome",
    "hippolytus": "Hippolytus of Rome",
    "lactantius": "Lactantius",
    "methodius": "Methodius of Olympus",
    "novatian": "Novatian",
    "sulpicius": "Sulpicius Severus",
    "vincent_lerins": "Vincent of Lérins",
    "cassian": "John Cassian",
    "ephraem_syrus": "Ephrem the Syrian",
    "ephrem": "Ephrem the Syrian",
    "aphrahat": "Aphrahat",
    "minucius": "Minucius Felix",
    "rufinus": "Rufinus of Aquileia",
    "ignatius": "Ignatius of Antioch",
    "polycarp": "Polycarp of Smyrna",
    "barnabas": "Barnabas",
    "hermas": "Hermas",
    "tatian": "Tatian",
    "athenagoras": "Athenagoras",
    "theophilus": "Theophilus of Antioch",
    "mathetes": "Mathetes",
    "commodian": "Commodian",
    "thaumaturgus": "Gregory Thaumaturgus",
    "dionysius": "Dionysius of Alexandria",
    "anatolius": "Anatolius of Laodicea",
    "arnobius": "Arnobius of Sicca",
    "venantius": "Venantius Fortunatus",
    "asterius": "Asterius of Amasea",
    "victorinus": "Victorinus of Pettau",
    "julius_africanus": "Julius Africanus",
    "juliusafricanus": "Julius Africanus",
    "gregory_thau": "Gregory Thaumaturgus",
    "dionysius_gr": "Dionysius of Alexandria",
    "dionysius_rome": "Dionysius of Rome",
    "alexander_lyc": "Alexander of Lycopolis",
    "alexander_alexandria": "Alexander of Alexandria",
    "peter_alexandria": "Peter of Alexandria",
    "archelaus": "Archelaus of Carrhae",
    "clement_alex": "Clement of Alexandria",
    "cyril_jer": "Cyril of Jerusalem",
    "theodotus": "Theodotus",
    "sulpiciusseverus": "Sulpicius Severus",
    "ephraim": "Ephrem the Syrian",
    "ephraem": "Ephrem the Syrian",
    "damascus": "John of Damascus",
    "gennadius": "Gennadius of Marseilles",
    "gregory": "Gregory the Great", // ambiguous; NPNF2-12/13 context
    "schaff": "Various", // Editor falling through as Author in a few stubs
]

/// Convert a CCEL machine slug (e.g. "sulpiciusseverus", "gregory_naz") to a
/// rough display name. Used as a last-resort fallback when the slug isn't in
/// our hand-maintained dictionary above.
private func humanizeSlug(_ slug: String) -> String {
    slug.replacingOccurrences(of: "_", with: " ")
        .split(separator: " ")
        .map { $0.capitalized }
        .joined(separator: " ")
}

extension Array {
    fileprivate subscript(safe i: Int) -> Element? {
        return (i >= 0 && i < count) ? self[i] : nil
    }
}

private func slugify(_ s: String) -> String {
    let folded = s
        .folding(options: .diacriticInsensitive, locale: .current)
        .lowercased()
    var out = ""
    var lastWasDash = true
    for ch in folded {
        if ch.isLetter || ch.isNumber {
            out.append(ch)
            lastWasDash = false
        } else if !lastWasDash {
            out.append("-")
            lastWasDash = true
        }
    }
    while out.hasSuffix("-") { out.removeLast() }
    return out
}

/// Titles that mark editorial / front-matter divs we don't want to surface
/// as their own "works" (they're either volume apparatus or an editor's
/// introduction to a real work that follows).
/// Anchored at the start of the trimmed title (with optional leading "The ").
/// Trailing punctuation is allowed since CCEL sometimes emits `Title Page.` /
/// `Preface:` etc. — that's why these patterns deliberately don't pin `$`.
private let editorialTitlePatterns: [String] = [
    #"^Title Page\b"#,
    #"^Preface\b"#,
    #"^Contents\b"#,
    #"^Editor['\u{2019}]s Preface"#,
    #"^Translator['\u{2019}]s Preface"#,
    #"^Introductory Notice"#,
    #"^Introductory Essay"#,
    #"^Prolegomena"#,
    #"^Chief Events"#,
    #"^Bibliograph"#,
    #"^Index(?:es|ices)?\b"#,
    #"^Greek Words"#,
    #"^Hebrew Words"#,
    #"^German Words"#,
    #"^French Words"#,
    #"^Latin Words"#,
    #"^Index of\b"#,
    #"^Pages of the Print Edition"#,
    #"^Front Matter"#,
    #"^Errata"#,
    #"^Addenda"#,
    #"^Publishers?['\u{2019}']?\s"#,
    #"^Brief Notice"#,
    #"^Dedication of\b"#,
    #"^Dedication to\b"#,
    #"^Genealogical Tables?\b"#,
    #"^Map\b"#,
    #"^Maps\b"#,
]

private func isEditorialTitle(_ title: String) -> Bool {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return true }
    for p in editorialTitlePatterns {
        if trimmed.range(of: p, options: [.regularExpression, .caseInsensitive]) != nil {
            return true
        }
    }
    return false
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
            if isMatch {
                containerStackDepth += 1
                // Short works (single homilies, single letters) tuck their
                // prose directly under div1 with no structural div2/3
                // children. Start a default work-body section as soon as
                // we enter the container so that direct <p> children
                // accumulate somewhere. If a structural sub-div appears
                // later it'll commit this section and start its own.
                if currentSection == nil, let cid = attributes["id"] {
                    sectionCounter += 1
                    let label = attributes["title"] ?? attributes["shorttitle"]
                    currentSection = SectionInProgress(
                        ordinalPath: "\(workSlug).\(cid)",
                        kind: "section",
                        label: (label?.isEmpty == false) ? label : nil
                    )
                }
            }
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
        // CCEL frequently emits `shorttitle=""` (empty) on real chapter/book
        // divs whose long title is supplied via `title="…"`. Treat an empty
        // shorttitle as absent so the title fallback wins.
        let nonEmptyShortTitle = (attributes["shorttitle"]?.isEmpty == false)
            ? attributes["shorttitle"] : nil
        let labelText = nonEmptyShortTitle ?? attributes["title"] ?? ""
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

/// Lightweight first-pass parser that walks a ThML file and records every
/// `<div1>` element's id + title. The Pipeline filters editorial entries and
/// turns the remainder into separate work-ingest passes. We deliberately do
/// not capture body text here — a second `parse` call (with the discovered
/// containerID) does that — because the whole-volume body is too large to
/// hold in memory all at once for some of the bigger NPNF volumes.
private final class ThMLDiscoveryDelegate: NSObject, XMLParserDelegate {
    struct Candidate {
        let id: String
        let title: String
    }

    var candidates: [Candidate] = []
    var volumeTitle: String = ""
    /// Joined display string of all DC.Creator authors in the volume
    /// header, deduped. CCEL emits Authors in three schemes — short-form
    /// (human display), file-as ("Augustine, Aurelius"), and ccel
    /// (lowercase machine slug). Some volumes carry only the ccel slug;
    /// we fall back through them and map known slugs to friendly names.
    var volumeAuthor: String {
        var resolved: [String] = []
        var seen = Set<String>()
        // For each unique author identified by ccel slug, prefer the
        // short-form entry, then file-as, then a mapped/titlecased ccel.
        let slugs = authorsByScheme.ccel.isEmpty
            ? Array(repeating: "", count: max(authorsByScheme.shortForm.count, authorsByScheme.fileAs.count))
            : authorsByScheme.ccel
        for (i, slug) in slugs.enumerated() {
            let display: String
            // Canonical name from the slug dict wins when available so a
            // given father reads identically across volumes (CCEL is
            // inconsistent: some headers say "St. Chrysostom", others
            // give only the ccel slug "chrysostom" which we map to
            // "John Chrysostom"). Fall back to the volume's short-form,
            // then file-as, then a titlecased slug.
            let normalizedSlug = slug.lowercased()
            if let mapped = ccelAuthorDisplay[normalizedSlug] {
                display = mapped
            } else if let s = authorsByScheme.shortForm[safe: i] {
                display = s
            } else if let f = authorsByScheme.fileAs[safe: i] {
                display = f.components(separatedBy: ",").first?.trimmingCharacters(in: CharacterSet.whitespaces) ?? f
            } else if !slug.isEmpty {
                display = humanizeSlug(slug)
            } else {
                continue
            }
            if seen.insert(display).inserted { resolved.append(display) }
        }
        // No ccel slugs at all? Use whichever short-form/file-as we have.
        if resolved.isEmpty {
            for name in authorsByScheme.shortForm + authorsByScheme.fileAs {
                if seen.insert(name).inserted { resolved.append(name) }
            }
        }
        return resolved.joined(separator: " & ")
    }

    private struct AuthorsByScheme {
        var shortForm: [String] = []
        var fileAs: [String] = []
        var ccel: [String] = []
    }
    private var authorsByScheme = AuthorsByScheme()
    private var currentAuthorScheme: String? = nil
    private var inVolumeTitle = false
    private var textBuffer = ""
    private var titleDepth = 0

    func parser(_ parser: XMLParser, didStartElement element: String, namespaceURI: String?, qualifiedName: String?, attributes: [String : String] = [:]) {
        let lower = element.lowercased()
        // Reset whatever's buffered when we descend into a new element so
        // mixed-text quirks of ThML don't bleed prior text into ours.
        textBuffer.removeAll(keepingCapacity: true)

        if lower == "title", titleDepth == 0, volumeTitle.isEmpty {
            inVolumeTitle = true
        }
        if lower == "title" { titleDepth += 1 }

        if lower == "dc.creator", attributes["sub"]?.lowercased() == "author" {
            currentAuthorScheme = attributes["scheme"]?.lowercased()
        }

        if lower == "div1" {
            let id = attributes["id"] ?? ""
            let titleAttr = attributes["title"]
            let shortAttr = attributes["shorttitle"]
            // Prefer the longer "title" attribute; fall back to shorttitle
            // only when title is missing or empty. CCEL emits empty
            // shorttitles for nearly every real work, which would otherwise
            // win over the descriptive title.
            let title = (titleAttr?.isEmpty == false ? titleAttr : shortAttr) ?? ""
            guard !id.isEmpty else { return }
            candidates.append(Candidate(id: id, title: title))
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inVolumeTitle || currentAuthorScheme != nil {
            textBuffer += string
        }
    }

    func parser(_ parser: XMLParser, didEndElement element: String, namespaceURI: String?, qualifiedName: String?) {
        let lower = element.lowercased()
        if lower == "title" {
            if inVolumeTitle {
                volumeTitle = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
                inVolumeTitle = false
                textBuffer.removeAll(keepingCapacity: true)
            }
            titleDepth = max(0, titleDepth - 1)
        }
        if lower == "dc.creator", let scheme = currentAuthorScheme {
            let name = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty {
                switch scheme {
                case "short-form": authorsByScheme.shortForm.append(name)
                case "file-as":    authorsByScheme.fileAs.append(name)
                case "ccel":       authorsByScheme.ccel.append(name)
                default: break
                }
            }
            currentAuthorScheme = nil
            textBuffer.removeAll(keepingCapacity: true)
        }
    }
}
