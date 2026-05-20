import Foundation

/// Parses CCEL's ThML (Theological Markup Language — an XML dialect built on TEI Lite).
///
/// Used for: Dialogue with Trypho (English) and On the Incarnation (English).
///
/// We pull `<div2 type="Chapter" ...>` / `<div3 type="Section" ...>` containers and capture
/// their `<p>` children's text content as the section body. Scripture references appear as
/// `<scripRef passage="John 3:16">…</scripRef>` and are preserved as inline
/// `{ref:John 3:16}…{/ref}` tokens wrapping the visible text, so the renderer can turn them
/// into a `<Link>` whose target derives from the `passage` attribute even when the visible
/// text ("Ver. 2.", "Chap. i. 1.") is not itself parseable as a scripture reference.
///
/// Structural markup that the Schaff editions carry — italics, block quotes, subheadings,
/// editor footnotes — survives as a parallel family of inline tokens that the renderer
/// parses out:
///   • `{em}…{/em}`   — `<i>` / `<em>`
///   • `{b}…{/b}`     — `<b>`
///   • `{q}…{/q}`     — `<q>` (CCEL's block-quote tag)
///   • `{h2}…{/h2}` / `{h3}…{/h3}` / `{h4}…{/h4}` — sub-headings inside a section
///   • `{fn:N}…{/fn}` — editor `<note place="end" n="N">` footnotes
/// The first heading inside a chapter container is the chapter title; it flows as plain
/// text (no `{h…}` wrapper) so the existing `stripLeadingHeadingParagraphs` cleanup still
/// drops the duplicate of `label`. Subsequent headings emit `{h…}` tokens.
public struct ThMLParser {
    public init() {}

    public struct Section {
        public let ordinalPath: String     // 'trypho.31' or 'incarnation.32'
        public let kind: String            // 'chapter' / 'section'
        public let label: String?          // 'Chapter 31'
        public let body: String            // body text with inline {ref:…}{/ref}, {em}, {fn:N}, … tokens
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
let ccelAuthorDisplay: [String: String] = [
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
    "papias": "Papias of Hierapolis",
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
    "sulpitius": "Sulpicius Severus",
    "nazianzen": "Gregory of Nazianzus",
    "aristides": "Aristides of Athens",
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
/// Patterns matched against the start of the (trimmed) title. Trailing
/// punctuation isn't pinned with `$` because CCEL routinely emits
/// `Title Page.` / `Preface:`. The apostrophe class `['’]` covers both
/// straight + curly forms — Swift's raw-string syntax doesn't expand
/// `\u{2019}` escapes, so the curly apostrophe is included literally.
private let editorialTitlePatterns: [String] = [
    #"^(?:Second|Series|Half|Original|Additional|Front)?\s*Title Pages?\b"#,
    #"^Series Title\b"#,
    #":\s*Index of (?:Subjects|Names|Passages|Scripture|Pages)"#,
    #"^Preface\b(?!s)"#,           // "Preface" / "Preface." but not "Prefaces"
    #"^Contents\b"#,
    #"^Table of Contents\b"#,
    #"^Editor(?:ial|['’]s)\s+Preface\b"#,
    #"^Editor['’]s\s+Note\b"#,
    #"^Editorial Note\b"#,
    #"^Editorial Notice\b"#,
    #"^Translator['’]s\s+Preface\b"#,
    #"^Translator['’]s\s+Introduction\b"#,
    #"^Translator['’]s\s+Note\b"#,
    #"^Introductory Notice\b"#,
    #"^Introductory Essay\b"#,
    #"^Prolegomena\b"#,
    #"^Chief Events\b"#,
    #"^Bibliograph"#,                 // Bibliography / Bibliographical Note
    #"^Index(?:es|ices)?\b"#,
    #"^Index of\b"#,
    #"^Subject Index"#,
    #"^Subject Indexes"#,
    #"^General Index"#,
    #"^General Introduction\b"#,
    #"^Greek Words"#,
    #"^Hebrew Words"#,
    #"^German Words"#,
    #"^French Words"#,
    #"^Latin Words"#,
    #"^Pages of the Print Edition"#,
    #"^Front Matter"#,
    #"^Errata"#,
    #"^Addenda"#,
    #"^Publishers?['’]?\s"#,
    #"^Brief Notice"#,
    #"^Dedication of\b"#,
    #"^Dedication to\b"#,
    #"^Genealogical Tables?\b"#,
    #"^Chronological Tables?\b"#,
    #"^Comparative Tables?\b"#,
    #"^Map\b"#,
    #"^Maps\b"#,
    #"^Credits\b"#,
    #"^Acknowledg(?:e?)ments?\b"#,
    #"^Appended Note\b"#,
    #"^Dates of Treatises\b"#,
    #"^Note on the\b"#,
    #"^Notes on the\b"#,
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
    /// to wrap their content in `{fn:N}…{/fn}` tokens and to suppress
    /// `</p>` paragraph breaks while inside a note (notes are inline
    /// even when the source pretty-printer breaks them across lines).
    private var noteDepth: Int = 0
    private var inNote: Bool { noteDepth > 0 }

    /// Count of headings already emitted inside the current section. The
    /// first heading is the chapter / section title — its text duplicates
    /// `label` (or is captured into `label` by the synthesizer) and gets
    /// stripped by `stripLeadingHeadingParagraphs`, so we leave it untokenized.
    /// Subsequent headings inside the same section are real sub-headings
    /// (Eusebius's "§ 1. Sources and Literature", etc.) and are wrapped in
    /// `{h2}…{/h2}` tokens so the renderer can show them visibly.
    private var headingsSeenInSection: Int = 0
    /// HTML level of the heading we're currently inside (2/3/4) — captured at the
    /// start tag so the matching end tag can close the right token.
    private var headingLevelStack: [Int] = []
    /// True when we've already emitted the opening `{h…}` token for the heading
    /// at the top of `headingLevelStack`. Suppressed for the first heading per
    /// section (which is the chapter title).
    private var headingTokenOpenStack: [Bool] = []
    /// Depth inside an untokenised heading (the first heading per section, used
    /// only to feed `stripLeadingHeadingParagraphs`). Inline em/b/q markup
    /// inside that heading would defeat the strip-pass's regex on the body
    /// (e.g. `{em}Chapter I.{/em}—Salutation`), so we suppress nested tokens
    /// while this is non-zero.
    private var inUntokenisedHeadingDepth: Int = 0
    /// Per-scripRef record of whether we emitted an opening `{ref:passage}`
    /// token. ScripRefs nested inside `<note>` (or the suppressed chapter
    /// title) emit no token; the matching close also emits no token. A
    /// stack keeps the open/close pairs straight even when scripRefs
    /// nest (rare but legal in ThML).
    private var refTokenOpenStack: [Bool] = []

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
        // Flush pending characters into the body before the tag boundary changes
        // the markup state. Inside a `<note>` the characters still belong to the
        // note body, so flush them too — the closing `</note>` will wrap the
        // whole accumulated run.
        if textBuffer.contains(where: { !$0.isWhitespace }), var section = currentSection {
            section.body += textBuffer
            currentSection = section
        }
        textBuffer.removeAll(keepingCapacity: true)

        let suppressTokens = inUntokenisedHeadingDepth > 0
        if lower == "note" {
            noteDepth += 1
            // Open a footnote token. `n` carries the editor's note number; fall
            // back to a sequential counter so unnumbered notes still anchor.
            let n = (attributes["n"]?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
                ?? attributes["id"]
                ?? ""
            if !suppressTokens, var section = currentSection {
                section.body += "{fn:\(sanitizeTokenArg(n))}"
                currentSection = section
            }
        }
        if lower == "title" { inTitle = true }
        if lower == "author" { inAuthor = true }

        // Inline emphasis. `<i>` is by far the most common; `<em>` is the
        // semantic spelling some CCEL volunteers used; `<b>` is rare but
        // worth preserving for the few places it appears.
        if !suppressTokens, lower == "i" || lower == "em" {
            if var section = currentSection {
                section.body += "{em}"
                currentSection = section
            }
        }
        if !suppressTokens, lower == "b" {
            if var section = currentSection {
                section.body += "{b}"
                currentSection = section
            }
        }
        // Block quote — CCEL's `<q>` element wraps both inline-style and
        // block-style quotations. The renderer decides which presentation
        // applies based on context (an entire paragraph wrapped in `{q}` is
        // rendered as `<blockquote>`).
        if !suppressTokens, lower == "q" || lower == "quote" {
            if var section = currentSection {
                section.body += "{q}"
                currentSection = section
            }
        }

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
                    headingsSeenInSection = 0
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
            "book", "discourse", "letter", "letters", "treatise", "part",
            "homily", "oration", "division", "sermon", "lecture",
            "tractate", "epistle", "demonstration", "canon", "hymn",
            "dialogue", "commentary"
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
            "Section ", "Part ", "Article ", "Homily ", "Oration ",
            "Division ", "Sermon ", "Lecture ", "Tractate ", "Epistle ",
            "Demonstration ", "Canon ", "Hymn ", "Dialogue ", "Commentary "
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
            // New section → first heading inside it is the chapter title (which
            // stays untokenised so the heading-strip pass can drop it as a
            // duplicate of `label`); reset the counter for that detection.
            headingsSeenInSection = 0
        }

        if lower == "scripref" {
            // CCEL wraps each scripture-citation marker in `<scripRef passage="…">…</scripRef>`.
            // The visible text often isn't itself a recognizable reference (a bare
            // "Ver. 2." or "Chap. i. 1." inside a verse-by-verse commentary), so we
            // can't rely on prose-level detection to linkify it. Emit paired
            // `{ref:passage}…{/ref}` tokens that wrap the visible text — the
            // renderer turns them into a `<Link>` whose href derives from the
            // `passage` attribute regardless of the visible text shape.
            //
            // ScripRefs nested inside a `<note>` are folded into the footnote text
            // (which gets its own ref-detection pass in the renderer); ScripRefs
            // inside the untokenised chapter title are likewise suppressed so the
            // `stripLeadingHeadingParagraphs` regex still matches the plain text.
            // In both cases we still push onto the stack so the matching closer
            // pops the right frame.
            let shouldEmit = !inNote && !suppressTokens && attributes["passage"] != nil
            if shouldEmit, var s = currentSection, let passage = attributes["passage"] {
                s.body += "{ref:\(sanitizeTokenArg(passage))}"
                currentSection = s
            }
            refTokenOpenStack.append(shouldEmit)
        }

        // Heading tags inside body content. The first heading per section is the
        // chapter title (its text duplicates `label` and the heading-strip pass
        // drops it from the body); emit no token for that one. Subsequent
        // headings are real sub-divisions — wrap them in `{h2}…{/h2}` etc. so
        // the renderer can promote them back to visible `<h2>` / `<h3>` headings.
        if isHeadingTag(lower), let level = headingLevel(lower) {
            headingLevelStack.append(level)
            if currentSection != nil, headingsSeenInSection > 0 {
                if var section = currentSection {
                    let outLevel = clampHeadingLevel(level)
                    section.body += "{h\(outLevel)}"
                    currentSection = section
                }
                headingTokenOpenStack.append(true)
            } else {
                headingTokenOpenStack.append(false)
                // Suppress inline tokens inside the chapter title so the
                // strip-heading regex can still recognise the plain text.
                inUntokenisedHeadingDepth += 1
            }
            headingsSeenInSection += 1
        }
    }

    /// Headings in CCEL ThML appear at HTML levels 1-4 for series/work/chapter/
    /// subheading; we collapse to a {h2…h4} render range so the page's chapter
    /// `<h1>` keeps its prominence and in-body headings are visibly subordinate.
    private func clampHeadingLevel(_ raw: Int) -> Int {
        if raw <= 2 { return 2 }
        if raw >= 4 { return 4 }
        return raw
    }

    private func headingLevel(_ lower: String) -> Int? {
        guard lower.count == 2, lower.first == "h" else { return nil }
        return Int(String(lower.last!))
    }

    /// Curly braces in note `n=` / `id=` values would close our token early.
    /// Replace any with a benign substitute so the renderer's regex stays simple.
    private func sanitizeTokenArg(_ s: String) -> String {
        var out = ""
        for c in s {
            if c == "{" || c == "}" { out.append("_") } else { out.append(c) }
        }
        return out
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

        // Flush characters (including any inside a `<note>`) before applying
        // closing-tag markup so the `{/em}`, `{/q}`, `{/fn}` etc. wrap the text
        // that actually belongs to the element being closed.
        if var section = currentSection {
            section.body += text
            currentSection = section
        }
        textBuffer.removeAll(keepingCapacity: true)

        let suppressTokens = inUntokenisedHeadingDepth > 0
        if !suppressTokens, lower == "i" || lower == "em" {
            if var section = currentSection {
                section.body += "{/em}"
                currentSection = section
            }
        }
        if !suppressTokens, lower == "b" {
            if var section = currentSection {
                section.body += "{/b}"
                currentSection = section
            }
        }
        if !suppressTokens, lower == "q" || lower == "quote" {
            if var section = currentSection {
                section.body += "{/q}"
                currentSection = section
            }
        }
        if isHeadingTag(lower) {
            // Pop the matching `{h…}` opening (if one was actually emitted) and
            // close it with `{/h}`. We use a uniform closer (rather than
            // `{/hN}`) so the renderer's stack-pop is independent of the
            // level — the level was carried by the opener.
            let _ = headingLevelStack.popLast()
            let wasOpen = headingTokenOpenStack.popLast() ?? false
            if wasOpen, var section = currentSection {
                section.body += "{/h}"
                currentSection = section
            } else {
                // We were inside the untokenised chapter title — leave it.
                inUntokenisedHeadingDepth = max(0, inUntokenisedHeadingDepth - 1)
            }
        }
        if lower == "note" {
            noteDepth = max(0, noteDepth - 1)
            if !suppressTokens, var section = currentSection {
                section.body += "{/fn}"
                currentSection = section
            }
        }
        if lower == "scripref" {
            let wasOpen = refTokenOpenStack.popLast() ?? false
            if wasOpen, var section = currentSection {
                section.body += "{/ref}"
                currentSection = section
            }
        }

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

        var stripped = ThMLParser.stripLeadingHeadingParagraphs(from: normalized, label: current.label)
        // Body openers in some volumes (notably Luther's Bondage) fuse the
        // structural rubric and the first prose sentence into one paragraph:
        // "Sect. XLI.—AND, first of all, let us begin…". The rubric is purely
        // presentational — its information lives in the section's label — so
        // strip it from the body to keep the page from repeating itself.
        stripped = ThMLParser.stripLeadingRubric(from: stripped)

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
        // ANF intro pages can pile up a dozen front-matter paragraphs before
        // the prose proper (work title, translator note, dated bracket, HR,
        // section sub-heading, …). A tighter cap leaves the HR and pseudo-
        // headings on the page.
        let maxStrip = 12
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
        // 12 (up from 6) so we can see past the front-matter clusters that
        // some volumes pile up before the first prose paragraph: bare ordinal
        // markers, work title, translator note, dated bracket, horizontal
        // rule, chapter ordinal, …
        for raw in body.components(separatedBy: "\n\n").prefix(12) {
            // Strip inline tokens before any further work — they're either
            // editorial annotations (scripRef) or structural markup (em / q /
            // h / fn) and they leak through to the synthesized label
            // otherwise ("…we have that of {ref:Ecclesiasticus xv" / "{em}On
            // the Soul{/em}"). The token format mirrors the renderer's
            // stripping regexes; keep them in sync with `SectionBody.tsx`.
            let cleaned = raw
                .replacingOccurrences(
                    of: #"\{ref:[^}]*\}"#,
                    with: "",
                    options: .regularExpression
                )
                .replacingOccurrences(
                    of: #"\{(?:em|b|q|h2|h3|h4|fn(?::[^}]*)?)\}"#,
                    with: "",
                    options: .regularExpression
                )
                .replacingOccurrences(
                    of: #"\{/(?:em|b|q|h|fn|ref)\}"#,
                    with: "",
                    options: .regularExpression
                )
            var para = normalizeWhitespace(cleaned)
            if para.isEmpty { continue }
            if para.range(of: #"^[—–\-_·•\s]+$"#, options: .regularExpression) != nil { continue }
            // Skip bare ordinals ("Discourse IV.", "Book I.", "Sect. IX.");
            // the descriptive text is in a later paragraph. Accepts both the
            // long forms (Chapter, Section) and CCEL's common abbreviations
            // (Sect., Cap., Bk.) followed by a roman or arabic numeral.
            if para.range(
                of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily|sect|cap|bk|vol)\b\.?\s+[ivxlcdm0-9]+\.?$"#,
                options: .regularExpression
            ) != nil { continue }
            // Also skip a paragraph that is *only* a numeral/ordinal — Maurist
            // editions sometimes float "I.", "1.", or "§ 1" out as their own
            // paragraph above the section text. Treating that as a snippet
            // yields useless labels like "Chapter I. — I.".
            if para.range(
                of: #"^(?:[IVXLCDM]+|\d{1,3}|§\s*\d{1,3})\.?$"#,
                options: .regularExpression
            ) != nil { continue }
            // Skip a short single-sentence "title" paragraph (e.g. "Apology.",
            // "The Apology.", "Introduction.") — these reproduce the work or
            // chapter title and don't summarise the contents. The same shape
            // is recognised by the title-strip heuristic in
            // classifyHeadingParagraph.
            if para.count <= 80,
               para.hasSuffix("."),
               !para.dropLast().contains("."),
               !para.contains(","),
               !para.contains(":"),
               para.contains(where: \.isLetter) {
                continue
            }
            // Editorial bracketed front-matter ("[Translated by …]") should
            // not become the synthesized label either.
            if para.hasPrefix("[") && para.hasSuffix("]") &&
               para.range(of: #"(?i)\b(translated|translation|edited|edition|a\.d\.|b\.c\.|circa|fl\.|copyright)\b"#, options: .regularExpression) != nil {
                continue
            }
            // Pull off a "Chapter X.—" / "Sect. XLI.—" / "§N." / "§§1–5."
            // prefix to get the description. The structural word may be the
            // full form ("Section") or an abbreviation followed by a period
            // ("Sect.", "Cap."), and the connector may be a long dash, hyphen,
            // or just whitespace.
            para = para.replacingOccurrences(
                of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily|sect|cap|bk|vol)\b\.?\s*[ivxlcdm0-9]+\.?\s*[—–-]?\s*"#,
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
        // A paragraph that opens with a sub-heading token (`{h2}` / `{h3}` /
        // `{h4}`) is itself the renderable heading the source wants us to
        // show — keep it intact so the stripping pass stops here.
        if para.range(of: #"^\{h[234]\}"#, options: .regularExpression) != nil {
            return .keep
        }
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
        // Editorial framing paragraph wholly enclosed in square brackets:
        // "[Translated by the Rev. S. Thelwall, …]", "[Edited from the original
        // by …]", "[a.d. 110–165.]". Common in ANF/NPNF chapter openers; reads
        // as front-matter noise rather than prose, and blocks downstream
        // stripping when left in place.
        if para.hasPrefix("[") && para.hasSuffix("]") &&
           para.range(of: #"(?i)\b(translated|translation|edited|edition|a\.d\.|b\.c\.|circa|fl\.|d\.\s*\d|copyright)\b"#, options: .regularExpression) != nil {
            return .strip(structural: false)
        }
        // Publication / e-text metadata paragraph — "by Martin Luther (1483-1546)",
        // "This e-text was scanned…", "published by Baker Book House…", "in the
        // public domain". These are colophon-style frontmatter that some PD
        // editions paste at the top of every section. Heuristic: short-ish
        // paragraph (≤ ~600 chars) containing one of a small set of
        // unmistakable metadata markers AND no Bible-verse-like reference.
        if isEditorialColophon(para) {
            return .strip(structural: false)
        }
        // Author byline "by Author Name (1483-1546)" — distinct from running
        // prose because of the leading "by " plus a parenthesised year range.
        if para.count <= 120,
           para.range(of: #"(?i)^by\s+\p{Lu}.*\(\d{3,4}\s*[–\-]\s*\d{3,4}\)"#, options: .regularExpression) != nil {
            return .strip(structural: false)
        }
        // Translator / editor credit line: short, contains both an honorific
        // prefix (Rev., Dr., Prof.) and a degree suffix (D.D., M.A., Ph.D., …).
        // Common shapes:
        //   "Rev. Marcus Dods, D.D."
        //   "Dr. John King, M.A., Of Queen's College, Cambridge"
        //   "Translated by Rev. S. Thelwall."
        if para.count <= 120,
           isCreditLine(para) {
            return .strip(structural: false)
        }
        // Body paragraph that exactly reproduces the recorded label (confessions
        // Books, ANF series-cover pages where the work title is repeated as
        // running prose). Case-insensitive so that an all-caps label like
        // "CLEMENT OF ROME" still matches the body's "Clement of Rome".
        //
        // Tagged `structural: false` deliberately — a duplicate-of-label is
        // still inside the heading area, so we want the title-fragment
        // heuristic to keep firing on subsequent paragraphs (a pericope title
        // is another heading, not body prose).
        if let lbl = labelNorm, para.lowercased() == lbl.lowercased() {
            return .strip(structural: false)
        }
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
        // Same heuristic, but without the trailing period — for fragment-style
        // titles ("Introduction to the Treatise", "Contra Gentes"). Still gated
        // by allowTitleHeuristic; still no commas, colons, or sentence-final
        // punctuation. Real body openers almost always contain at least one of
        // those within their first 80 chars.
        if allowTitleHeuristic,
           para.count <= 80,
           !para.contains(","),
           !para.contains(":"),
           !para.contains("."),
           !para.contains("?"),
           !para.contains("!"),
           para.contains(where: \.isLetter) {
            return .strip(structural: false)
        }
        // Pericope / sermon title that ends with a trailing ':' to introduce
        // the Scripture passage that follows. "The Twofold Use of the Law &
        // Gospel:", "On Faith & Coming to Christ:". Stripped only when the
        // colon is at the end and there's no other sentence punctuation —
        // running prose with an internal colon (e.g. "He said: come unto me.")
        // is excluded.
        if allowTitleHeuristic,
           para.count <= 120,
           para.hasSuffix(":"),
           !para.dropLast().contains(":"),
           !para.contains("."),
           !para.contains("?"),
           !para.contains("!"),
           para.contains(where: \.isLetter) {
            return .strip(structural: false)
        }
        // ALL-CAPS title fragment — the volunteer transcribers who prepared
        // some of the CCEL Reformer volumes lay out pericope headings as
        // shouty headers ("ON FAITH AND COMING TO CHRIST, AND THE TRUE BREAD
        // OF HEAVEN:"). Recognise these by the fraction of uppercase letters
        // rather than punctuation, so an internal comma is tolerated.
        if allowTitleHeuristic,
           para.count <= 140,
           !para.contains("."),
           !para.contains("?"),
           !para.contains("!"),
           isMostlyUppercase(para) {
            return .strip(structural: false)
        }
        return .keep
    }

    /// True iff the paragraph looks like a translator / editor credit line.
    /// Requires both an honorific (Rev., Dr., …) AND a degree (D.D., M.A., …)
    /// — either alone is too easy to false-match in running prose ("Dr." can
    /// abbreviate "Doctor" in dialogue, "M.A." can appear in citations).
    static func isCreditLine(_ para: String) -> Bool {
        let honorific = #"(?i)\b(rev|dr|mr|mrs|fr|prof|sr|st)\.?\b"#
        let degree = #"(?i)\b(d\.?d|m\.?a|ph\.?d|s\.?t\.?d|s\.?t\.?l|ll\.?d|d\.?litt|s\.?j|o\.?p|o\.?s\.?b|d\.?phil)\.?\b"#
        return para.range(of: honorific, options: .regularExpression) != nil
            && para.range(of: degree, options: .regularExpression) != nil
    }

    /// True iff the paragraph reads as ALL-CAPS — at least 70% of its
    /// alphabetic characters are uppercase and there are at least 8 letters
    /// overall (so single words like "Amen." don't trip the rule).
    fileprivate static func isMostlyUppercase(_ s: String) -> Bool {
        var letters = 0
        var upper = 0
        for c in s {
            if c.isLetter {
                letters += 1
                if c.isUppercase { upper += 1 }
            }
        }
        guard letters >= 8 else { return false }
        return Double(upper) / Double(letters) >= 0.7
    }

    fileprivate static func firstSentence(of text: String, maxChars: Int) -> String {
        var idx = text.startIndex
        while idx < text.endIndex {
            let ch = text[idx]
            if ch == "." || ch == "?" || ch == "!" {
                let next = text.index(after: idx)
                if next == text.endIndex || text[next].isWhitespace {
                    // Don't accept this terminator if it follows an
                    // abbreviation rather than a complete word — common
                    // patristic abbreviations like "1 Cor.", "Sect.", "St.",
                    // "Mr.", "etc.", "viz." would otherwise truncate the
                    // snippet mid-thought. The heuristic: scan back to the
                    // previous space (or string start) and treat the
                    // intervening run as a "word"; if it's shorter than 5
                    // chars (with at least one letter), assume abbreviation
                    // and keep scanning.
                    if !isSentenceEndAfter(text, periodAt: idx) {
                        idx = text.index(after: idx)
                        continue
                    }
                    let sentence = String(text[..<idx]).trimmingCharacters(in: .whitespacesAndNewlines)
                    return clampToMaxChars(sentence, maxChars: maxChars)
                }
            }
            idx = text.index(after: idx)
        }
        return clampToMaxChars(text, maxChars: maxChars)
    }

    /// Trim a string to at most `maxChars`, breaking on the last space inside
    /// the window so we don't cut a word in half. Adds an ellipsis when
    /// content is truncated. (Used by `firstSentence`, which can otherwise
    /// emit 500-character "labels" when a section's opening sentence is a
    /// run-on with no period for many lines.)
    fileprivate static func clampToMaxChars(_ text: String, maxChars: Int) -> String {
        if text.count <= maxChars { return text }
        let prefix = text.prefix(maxChars)
        if let space = prefix.lastIndex(of: " ") {
            return String(prefix[..<space]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
        }
        return String(prefix) + "…"
    }

    /// True iff the paragraph reads like an e-text colophon / publication
    /// metadata blob (not running prose). Used to strip preambles that
    /// volunteer transcribers paste at the top of CCEL section bodies.
    fileprivate static func isEditorialColophon(_ para: String) -> Bool {
        guard para.count <= 800 else { return false }
        // Two or more colophon keywords pushes confidence high enough that
        // we strip regardless. (One keyword would over-match on real prose.)
        let keywords = [
            #"public\s+domain"#,
            #"this\s+e-?text"#,
            #"originally\s+published"#,
            #"published\s+by\s+\p{Lu}"#,
            #"scanned\s+(by|and|from)"#,
            #"may\s+be\s+(copied|distributed|reproduced)"#,
            #"all\s+rights\s+reserved"#,
            #"copyright\s+(©|\(c\)|\d{4})"#,
            #"original\s+pagination"#,
            #"electronic\s+(text|edition)"#,
        ]
        var hits = 0
        for kw in keywords {
            if para.range(of: kw, options: [.regularExpression, .caseInsensitive]) != nil {
                hits += 1
                if hits >= 2 { return true }
            }
        }
        return false
    }

    /// Strip a structural rubric prefix from the start of the body. Same
    /// shape as the one recognised by `headingSnippet` — the rubric there is
    /// captured into the label, so leaving it in the body too would just
    /// echo the heading.
    static func stripLeadingRubric(from body: String) -> String {
        guard !body.isEmpty else { return body }
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return body }
        // Operate on the first paragraph only — never reach across a \n\n.
        let parts = trimmed.components(separatedBy: "\n\n")
        let first = parts[0]
        let rest = parts.dropFirst()
        let stripped = first.replacingOccurrences(
            of: #"^(?i)(chapter|book|discourse|section|letter|treatise|part|article|homily|sect|cap|bk|vol)\b\.?\s*[ivxlcdm0-9]+\.?\s*[—–-]\s*"#,
            with: "",
            options: .regularExpression
        )
        if stripped == first { return body }
        let joined = ([stripped] + Array(rest)).joined(separator: "\n\n")
        return joined.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// True iff the `.` at `periodAt` ends a real sentence (vs. an abbreviation).
    /// "Sect.", "1 Cor.", "etc.", "St." → false. "definition.", "Christ." → true.
    fileprivate static func isSentenceEndAfter(_ text: String, periodAt: String.Index) -> Bool {
        var start = periodAt
        var letterCount = 0
        while start > text.startIndex {
            let prev = text.index(before: start)
            let c = text[prev]
            if c.isWhitespace { break }
            if c == "." { break } // chained abbreviations like "e.g."
            if c.isLetter { letterCount += 1 }
            start = prev
        }
        // Word with fewer than 5 letters is treated as an abbreviation.
        // (Real sentences ending in 3-4 letter words like "And." are rare
        //  enough that the trade-off favors fewer false truncations.)
        return letterCount >= 5
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
