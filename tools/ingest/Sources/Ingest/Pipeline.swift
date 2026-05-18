import Foundation
import Logging

/// Source layout convention. The CLI accepts `--source-root <path>` pointing at this layout:
///
///     <root>/
///       bsb/bsb.txt                              # BSB plain text
///       brenton/eng-Brenton/*.usfm               # Brenton LXX English USFM files
///       grcbrent/*.usfm                          # Brenton LXX Greek USFM files
///       kjv-apocrypha/*.usfm                     # KJV 1611 Apocrypha USFM
///       stepbible/TAHOT/*.txt                    # STEPBible TSV tables
///       stepbible/TAGOT/*.txt
///       stepbible/TAGNT/*.txt
///       stepbible/TKJVS/*.txt
///       openscriptures/HebrewLexicon.xml         # BDB + Strong's H
///       openscriptures/StrongsGreek.xml          # Strong's G + Thayer's fragments
///       openbibleinfo/cross_references.txt       # OpenBible.info cross-ref TSV
///       patristics/summa.json                    # Jacob-Gray/summa.json (English Summa)
///       patristics/anf01.xml … anf09.xml         # CCEL ThML — Ante-Nicene Fathers (Roberts & Donaldson)
///       patristics/npnf101.xml … npnf114.xml     # CCEL ThML — NPNF Series 1 (Augustine + Chrysostom)
///       patristics/npnf201.xml … npnf214.xml     # CCEL ThML — NPNF Series 2 (post-Nicene Greek + Latin fathers)
public struct Pipeline {
    public let sourceRoot: URL
    public let outputPath: String
    /// Restrict Bible/STEPBible stages to these book slugs. Empty = no filter.
    /// When non-empty, non-book-scoped stages (lexicons, cross-refs, patristics)
    /// are skipped entirely.
    public let bookFilter: Set<String>
    /// Restrict stages to these language tags. Empty = no filter. Tags must match
    /// one of the tags declared on each stage (see `stageEntries`).
    public let languageFilter: Set<String>
    /// Restrict stages to these source groups. Empty = no filter. Valid groups:
    /// "bible" | "commentary" | "summa" | "anf" | "npnf". Bible is the slow,
    /// rebuilds-everything tier; the others are each substantial enough on
    /// their own that being able to re-ingest one at a time matters.
    public let groupFilter: Set<String>
    public let logger = Logger(label: "aletheia.ingest")

    public init(sourceRoot: URL, outputPath: String,
                bookFilter: Set<String> = [],
                languageFilter: Set<String> = [],
                groupFilter: Set<String> = []) {
        self.sourceRoot = sourceRoot
        self.outputPath = outputPath
        self.bookFilter = bookFilter
        self.languageFilter = languageFilter
        self.groupFilter = groupFilter
    }

    private var filtersActive: Bool {
        !bookFilter.isEmpty || !languageFilter.isEmpty || !groupFilter.isEmpty
    }

    private struct Stage {
        let name: String
        let group: String
        let languages: Set<String>
        let bookScoped: Bool
        let run: () throws -> Void
    }

    public func run() throws {
        if filtersActive {
            logger.info("Updating Aletheia corpus at \(outputPath) (merge mode)")
            if !bookFilter.isEmpty { logger.info("  books: \(bookFilter.sorted().joined(separator: ","))") }
            if !languageFilter.isEmpty { logger.info("  languages: \(languageFilter.sorted().joined(separator: ","))") }
            if !groupFilter.isEmpty { logger.info("  groups: \(groupFilter.sorted().joined(separator: ","))") }
        } else {
            logger.info("Building Aletheia corpus at \(outputPath)")
        }
        let writer = try CorpusWriter(at: outputPath, clean: !filtersActive)
        let stages = stageEntries(writer: writer)

        var failed = 0
        var skippedByFilter = 0
        for stage in stages {
            if !groupFilter.isEmpty && !groupFilter.contains(stage.group) {
                skippedByFilter += 1
                continue
            }
            if !languageFilter.isEmpty && stage.languages.isDisjoint(with: languageFilter) {
                skippedByFilter += 1
                continue
            }
            if !bookFilter.isEmpty && !stage.bookScoped {
                skippedByFilter += 1
                continue
            }
            do {
                try stage.run()
                logger.info("  ✓ \(stage.name)")
            } catch let IngestError.sourceMissing(msg) {
                logger.warning("  – \(stage.name) skipped (\(msg))")
            } catch {
                logger.error("  ✗ \(stage.name) failed: \(error.localizedDescription)")
                failed += 1
                // Continue past failures so one bad source doesn't block the rest of the corpus.
            }
        }
        if skippedByFilter > 0 {
            logger.info("\(skippedByFilter) stage(s) skipped by filter")
        }
        if failed > 0 {
            logger.warning("\(failed) stage(s) failed; corpus is partial.")
        }

        try writer.updateChapterVerseCounts()
        logger.info("Done.")
    }

    private func stageEntries(writer: CorpusWriter) -> [Stage] {
        [
            Stage(name: "BSB", group: "bible", languages: ["en_bsb"], bookScoped: true,
                  run: { try ingestBSB(writer: writer) }),
            Stage(name: "KJV (Eng)", group: "bible", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestKJV(writer: writer) }),
            Stage(name: "Brenton LXX (Eng)", group: "bible", languages: ["en_brenton"], bookScoped: true,
                  run: { try ingestBrenton(writer: writer) }),
            Stage(name: "Brenton LXX (Grk)", group: "bible", languages: ["gk"], bookScoped: true,
                  run: { try ingestGrcbrent(writer: writer) }),
            Stage(name: "KJV Apocrypha", group: "bible", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestKJVApocrypha(writer: writer) }),
            Stage(name: "WEB (Eng + Apocrypha)", group: "bible", languages: ["en_web"], bookScoped: true,
                  run: { try ingestWEB(writer: writer) }),
            // BSB source is plain TSV with no paragraph markup. Borrow WEB's
            // \p / \q line breaks (also PD, modern English) so BSB reads with
            // the same paragraph rhythm. Must run after both BSB and WEB.
            Stage(name: "BSB paragraph parity from WEB", group: "bible", languages: ["en_bsb", "en_web"], bookScoped: true,
                  run: { try copyLeadsFromWEBtoBSB(writer: writer) }),
            Stage(name: "STEPBible KJV+Strongs", group: "bible", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tkjvs, language: "en_kjv") }),
            Stage(name: "STEPBible Hebrew (MT)", group: "bible", languages: ["he"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tahot, language: "he") }),
            Stage(name: "STEPBible Greek (LXX)", group: "bible", languages: ["gk"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tagot, language: "gk") }),
            Stage(name: "STEPBible Greek (NT)", group: "bible", languages: ["gk"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tagnt, language: "gk") }),
            // Must run after Brenton LXX (Grk) (verses) AND STEPBible Greek (NT)
            // (the surface→strongs reference data). See LXXTagger.swift for the
            // rationale on surface-form (not lemma-form) matching.
            Stage(name: "LXX surface-form tagging", group: "bible", languages: ["gk"], bookScoped: true,
                  run: { try tagLXXSurfaces(writer: writer) }),
            Stage(name: "Lexicon — Hebrew BDB", group: "bible", languages: ["he"], bookScoped: false,
                  run: { try ingestLexicon(writer: writer, source: .hebrewBDB(self.sourceRoot.appendingPathComponent("openscriptures/HebrewLexicon.xml"))) }),
            Stage(name: "Lexicon — Greek Strong's", group: "bible", languages: ["gk"], bookScoped: false,
                  run: { try ingestLexicon(writer: writer, source: .greekStrongs(self.sourceRoot.appendingPathComponent("openscriptures/StrongsGreek.xml"))) }),
            // Cross-refs index against en_bsb verses, so a partial book filter would
            // produce broken xrefs. Marked non-book-scoped so --books skips it.
            Stage(name: "Cross-references", group: "bible", languages: ["en_bsb"], bookScoped: false,
                  run: { try ingestCrossRefs(writer: writer) }),
            // Summa Theologica (English). The Latin side was previously
            // sourced from Geremia/AquinasOperaOmnia — a 250 MB git clone
            // covering the whole Aquinas opera — which has been dropped in
            // favor of carrying the English alone. Translation can come back
            // later from a slimmer source if there's demand.
            Stage(name: "Summa Theologica (Eng)", group: "summa", languages: ["en"], bookScoped: false,
                  run: { try ingestSumma(writer: writer) }),
            // Ante-Nicene Fathers (10 volumes, Roberts & Donaldson 1885 PD).
            // Each volume's stage runs the ThML discovery pass and emits
            // one `work` per non-editorial div1 inside that volume.
        ] + anfNpnfStages(writer: writer) + reformerStages(writer: writer) + [
            // Commentaries — each writes one `work` row plus per-book/chapter/comment
            // `section` rows. Language tag "en" is shared by all current commentaries;
            // it does NOT match any of the Bible-side `en_*` tags, so a `--languages en_bsb`
            // filter correctly skips these (and a bare `--languages en` runs only them).
            Stage(name: "Commentary — Matthew Henry", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestMatthewHenry(writer: writer) }),
            Stage(name: "Commentary — Calvin", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "calvin.json",
                      workSlug: "calvin",
                      workTitle: "Calvin's Commentaries",
                      author: "John Calvin") }),
            Stage(name: "Commentary — JFB", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "jfb.json",
                      workSlug: "jfb",
                      workTitle: "Commentary Critical and Explanatory on the Whole Bible",
                      author: "Jamieson, Fausset & Brown") }),
            Stage(name: "Commentary — Wesley's Notes", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "wesley.json",
                      workSlug: "wesley",
                      // The CrossWire module bundles both Wesley's NT notes
                      // (1755) and his less-famous OT notes (1765), so the
                      // umbrella "Notes on the Bible" title is accurate.
                      workTitle: "John Wesley's Notes on the Bible",
                      author: "John Wesley") }),
            Stage(name: "Commentary — Clarke", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "clarke.json",
                      workSlug: "clarke",
                      workTitle: "Adam Clarke's Commentary on the Bible",
                      author: "Adam Clarke") }),
            // Luther covers Galatians, Genesis (1–9), 1 & 2 Peter, and Jude.
            // Built from Project Gutenberg plain text (PG #1549, #29678, #48193,
            // #27978) via tools/luther-pg-extract — non-CCEL per the commentary
            // section's strict licensing policy.
            Stage(name: "Commentary — Luther", group: "commentary", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "luther.json",
                      workSlug: "luther",
                      workTitle: "Luther's Biblical Commentaries",
                      author: "Martin Luther") })
        ]
    }

    /// One ingest stage per ANF/NPNF volume on disk. Each stage parses the
    /// volume's ThML once, enumerates non-editorial top-level divs as
    /// individual works (Confessions, Letters, On the Incarnation, …) and
    /// writes one `work` row + section tree per discovery. ANF Vol 10 is
    /// the bibliographic stub volume (67 KB, no actual text) so it's
    /// skipped at the manifest level.
    private func anfNpnfStages(writer: CorpusWriter) -> [Stage] {
        var stages: [Stage] = []
        let anf = (1...9).map { String(format: "anf%02d", $0) }
        let npnf1 = (1...14).map { String(format: "npnf1%02d", $0) }
        let npnf2 = (1...14).map { String(format: "npnf2%02d", $0) }
        for slug in anf {
            stages.append(Stage(
                name: "ANF — \(slug)",
                group: "anf",
                languages: ["en"],
                bookScoped: false,
                run: { try self.ingestThMLVolume(writer: writer, file: "patristics/\(slug).xml", volumeSlug: slug) }
            ))
        }
        for slug in (npnf1 + npnf2) {
            stages.append(Stage(
                name: "NPNF — \(slug)",
                group: "npnf",
                languages: ["en"],
                bookScoped: false,
                run: { try self.ingestThMLVolume(writer: writer, file: "patristics/\(slug).xml", volumeSlug: slug) }
            ))
        }
        return stages
    }

    /// One ingest stage per Reformer ThML file dropped into `patristics/`. Same
    /// pipeline as ANF/NPNF — ThMLParser's discoverWorks enumerates each file's
    /// top-level divs as individual works under the listed author. The slugs
    /// match the CCEL filenames fetched by scripts/fetch_sources.sh.
    private func reformerStages(writer: CorpusWriter) -> [Stage] {
        let luther = [
            "luther_bondage", "luther_tabletalk", "luther_first_prin",
            "luther_smalcald", "luther_smallcat", "luther_largecatechism",
            "luther_good_works", "luther_sermons", "luther_translating",
            // luther_prefacetoromans is omitted: ThMLParser's editorial-title
            // filter strips every div1 because they all start with "Preface" /
            // "Translator's Note" / "Title Page" / "Indexes", leaving zero
            // discoverable works. Fixing this needs a parser-side change.
        ]
        let calvin = ["calvin_institutes", "calvin_sermons", "calvin_treatise_relics"]

        var stages: [Stage] = []
        for slug in luther {
            stages.append(Stage(
                name: "Luther — \(slug.replacingOccurrences(of: "luther_", with: ""))",
                group: "reformers",
                languages: ["en"],
                bookScoped: false,
                run: { try self.ingestThMLVolume(writer: writer, file: "patristics/\(slug).xml", volumeSlug: slug) }
            ))
        }
        for slug in calvin {
            stages.append(Stage(
                name: "Calvin — \(slug.replacingOccurrences(of: "calvin_", with: ""))",
                group: "reformers",
                languages: ["en"],
                bookScoped: false,
                run: { try self.ingestThMLVolume(writer: writer, file: "patristics/\(slug).xml", volumeSlug: slug) }
            ))
        }
        return stages
    }

    // MARK: - Stage implementations

    private func ingestBSB(writer: CorpusWriter) throws {
        let url = sourceRoot.appendingPathComponent("bsb/bsb.txt")
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = BSBParser()
        let rows = try parser.parse(fileURL: url)
        let filtered = bookFilter.isEmpty ? rows : rows.filter { bookFilter.contains($0.bookSlug) }
        logger.info("    parsed \(rows.count) BSB verses\(bookFilter.isEmpty ? "" : " (\(filtered.count) after book filter)")")
        // BSB source is plain TSV with no paragraph markup; lead is always nil.
        try writeBibleRows(filtered.map { ($0.bookSlug, $0.chapter, $0.verse, $0.text, nil) },
                           language: "en_bsb", writer: writer)
    }

    private func ingestKJV(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "kjv", language: "en_kjv", writer: writer)
    }

    private func ingestBrenton(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "brenton", language: "en_brenton", writer: writer,
                                transform: { splitCombinedEzraNeh(splitPsalm151($0)) })
    }

    /// Brenton's Greek LXX (eBible.org `grcbrent`). Untagged Greek text under
    /// `language="gk"` alongside the existing Greek NT. DAG/ESG remap to
    /// dan/esth via the catalog's alias table, so Theodotion's Daniel additions
    /// and the Greek Esther additions are merged into their protocanonical
    /// counterparts on the Greek column. Psalm 151 is extracted from the end of
    /// the LXX Psalter into its own `ps151` book; Ezra+Nehemiah are split from
    /// the combined "Esdras B" — see the row transforms below.
    private func ingestGrcbrent(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "grcbrent", language: "gk", writer: writer,
                                transform: { splitCombinedEzraNeh(splitPsalm151($0)) })
    }

    private func ingestKJVApocrypha(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "kjv-apocrypha", language: "en_kjv", writer: writer)
    }

    /// World English Bible with Apocrypha (eBible.org `eng-webbe`). Proto + deutero
    /// are shipped in one flat directory; the USFM parser routes by `\id` code.
    private func ingestWEB(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "web", language: "en_web", writer: writer)
    }

    /// LXX Psalm 151 is appended to the standard Psalter as `\c 151`. Move those
    /// rows into the standalone `ps151` deuterocanonical book at chapter 1, so
    /// the Psalms book stays at the canonical 150 chapters and Psalm 151 sorts
    /// after the NT alongside the other Orthodox apocrypha.
    private func splitPsalm151(_ rows: [USFMParser.Row]) -> [USFMParser.Row] {
        rows.map { row in
            (row.bookSlug == "ps" && row.chapter == 151)
                ? USFMParser.Row(bookSlug: "ps151", chapter: 1, verse: row.verse, text: row.text, lead: row.lead)
                : row
        }
    }

    /// Brenton's LXX (both Greek and English) ships Ezra+Nehemiah as one combined
    /// book "Esdras B" under USFM id `EZR` — 23 chapters where 11-23 are Nehemiah.
    /// Other traditions (KJV, BSB, Hebrew, ESV) treat them as two separate books.
    /// To keep `book.slug` semantics consistent across languages, split the parsed
    /// rows: chs 1-10 stay as `ezra`; chs 11-23 become `neh` renumbered to 1-13.
    ///
    /// The eng-Brenton tree also ships a redundant `17-NEH` file with the same
    /// Nehemiah text; `insertVerse` is idempotent so the second ingestion is a
    /// no-op once the split has populated `neh` from the combined file.
    private func splitCombinedEzraNeh(_ rows: [USFMParser.Row]) -> [USFMParser.Row] {
        return rows.map { row in
            guard row.bookSlug == "ezra", row.chapter >= 11 else { return row }
            return USFMParser.Row(bookSlug: "neh", chapter: row.chapter - 10,
                                  verse: row.verse, text: row.text, lead: row.lead)
        }
    }

    private func ingestUSFMDirectory(named: String, language: String, writer: CorpusWriter,
                                     transform: (([USFMParser.Row]) -> [USFMParser.Row])? = nil) throws {
        let dir = sourceRoot.appendingPathComponent(named)
        guard let allFiles = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
                .filter({ ["usfm", "USFM", "sfm"].contains($0.pathExtension) }) else {
            throw IngestError.sourceMissing(dir.path)
        }
        // When --books is set, pre-filter files by the USFM 3-letter code in their
        // names (e.g. "02-GENengkjv.usfm" → "GEN"). Files without an embedded code
        // are kept so the parser's own \id detection can still skip front matter.
        let wantedUSFMCodes = usfmCodesFor(bookFilter)
        let files = wantedUSFMCodes.isEmpty ? allFiles : allFiles.filter { url in
            let name = url.lastPathComponent.uppercased()
            return wantedUSFMCodes.contains(where: { name.contains($0) })
        }
        let parser = USFMParser()
        var parsedBooks = 0
        var skipped = 0
        for file in files {
            do {
                let result = try parser.parse(fileURL: file)
                let transformed = transform.map { $0(result.rows) } ?? result.rows
                let filtered = bookFilter.isEmpty ? transformed : transformed.filter { bookFilter.contains($0.bookSlug) }
                try writeBibleRows(filtered.map { ($0.bookSlug, $0.chapter, $0.verse, $0.text, $0.lead) },
                                   language: language, writer: writer)
                parsedBooks += 1
            } catch IngestError.malformed {
                // Front matter, glossary, intros — no \id marker. Skip silently.
                skipped += 1
            }
        }
        if parsedBooks == 0 {
            throw IngestError.sourceMissing("\(named): no parseable USFM files (scanned \(files.count), skipped \(skipped))")
        }
        logger.info("    \(parsedBooks) books, \(skipped) non-book files skipped")
    }

    /// Map a set of canonical book slugs to the USFM 3-letter codes that match them,
    /// including BookCatalog's aliases (e.g. dan → {DAN, DAG}, esth → {EST, ESG}).
    private func usfmCodesFor(_ slugs: Set<String>) -> Set<String> {
        guard !slugs.isEmpty else { return [] }
        var codes: Set<String> = []
        for slug in slugs {
            if let book = BookCatalog.bySlug(slug) {
                codes.insert(book.usfmID)
            }
        }
        if slugs.contains("dan") { codes.insert("DAG") }
        if slugs.contains("esth") { codes.insert("ESG") }
        return codes
    }

    private func ingestSTEP(writer: CorpusWriter, table: STEPBibleParser.Table, language: String) throws {
        let dir = sourceRoot.appendingPathComponent("stepbible/\(tableDirName(table))")
        guard FileManager.default.fileExists(atPath: dir.path) else { throw IngestError.sourceMissing(dir.path) }
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        let candidates = files.filter { ["txt", "tsv"].contains($0.pathExtension) }
        guard !candidates.isEmpty else {
            throw IngestError.sourceMissing("\(dir.path): no .txt/.tsv files (STEPBible may not publish this table)")
        }
        let parser = STEPBibleParser(table: table)
        var totalWords = 0
        var keptWords = 0
        for file in candidates {
            let words = try parser.parse(fileURL: file)
            totalWords += words.count
            let kept = bookFilter.isEmpty ? words : words.filter { bookFilter.contains($0.bookSlug) }
            keptWords += kept.count
            try writeTaggedWords(words: kept, language: language, writer: writer)
        }
        if bookFilter.isEmpty {
            logger.info("    parsed \(totalWords) STEPBible words from \(candidates.count) file(s)")
        } else {
            logger.info("    parsed \(totalWords) STEPBible words from \(candidates.count) file(s) (\(keptWords) after book filter)")
        }
    }

    private func tagLXXSurfaces(writer: CorpusWriter) throws {
        let tagger = LXXTagger(writer: writer, logger: logger, bookFilter: bookFilter)
        try tagger.run()
    }

    /// BSB ships as plain TSV without paragraph markers, so its verses always
    /// land with `lead = NULL`. WEB is also PD modern-English and has rich
    /// USFM paragraph/poetry markup — copy its lead onto BSB by matching
    /// (book slug, chapter number, verse number). Only overwrites BSB rows
    /// whose lead is already NULL, so any future authoritative BSB source
    /// (post this stage) would not be clobbered.
    private func copyLeadsFromWEBtoBSB(writer: CorpusWriter) throws {
        try writer.queue.write { db in
            try db.execute(sql: """
                UPDATE verse
                SET lead = m.web_lead
                FROM (
                    SELECT bsb_v.id AS bsb_id, web_v.lead AS web_lead
                    FROM verse bsb_v
                    JOIN chapter bsb_c ON bsb_v.chapter_id = bsb_c.id
                    JOIN book bsb_b ON bsb_c.book_id = bsb_b.id
                    JOIN book web_b ON web_b.language = 'en_web' AND web_b.slug = bsb_b.slug
                    JOIN chapter web_c ON web_c.book_id = web_b.id AND web_c.number = bsb_c.number
                    JOIN verse web_v ON web_v.chapter_id = web_c.id AND web_v.number = bsb_v.number
                    WHERE bsb_b.language = 'en_bsb'
                      AND web_v.lead IS NOT NULL
                      AND bsb_v.lead IS NULL
                ) AS m
                WHERE verse.id = m.bsb_id;
                """)
            let changed = db.changesCount
            self.logger.info("    copied \(changed) lead markers from WEB to BSB")
        }
    }

    private func tableDirName(_ t: STEPBibleParser.Table) -> String {
        switch t {
        case .tahot: return "TAHOT"
        case .tagot: return "TAGOT"
        case .tagnt: return "TAGNT"
        case .tkjvs: return "TKJVS"
        }
    }

    private func ingestLexicon(writer: CorpusWriter, source: LexiconParser.Source) throws {
        let parser = LexiconParser()
        let entries = try parser.parse(source)
        for entry in entries { try writer.upsertStrongs(entry) }
    }

    private func ingestMatthewHenry(writer: CorpusWriter) throws {
        let root = sourceRoot.appendingPathComponent("commentaries/matthew-henry")
        guard FileManager.default.fileExists(atPath: root.path) else {
            throw IngestError.sourceMissing(root.path)
        }
        let parser = MatthewHenryParser()
        let chapters = try parser.parse(rootDirectory: root)
        guard !chapters.isEmpty else {
            throw IngestError.sourceMissing("\(root.path): no chapter files parsed")
        }

        let workSlug = "matthew-henry"
        let workID = try writer.insertWork(
            slug: workSlug,
            title: "Matthew Henry's Commentary on the Whole Bible",
            author: "Matthew Henry",
            kind: "commentary")

        // Group chapters by book so the sections form the documented tree:
        //   book → chapter → comment.
        let byBook = Dictionary(grouping: chapters, by: { $0.bookSlug })
        var ordering = 0
        var totalComments = 0

        // Iterate in canonical book order so `section.ordering` reflects the
        // canon — that's what listCommentaryBooks() depends on for sort.
        let orderedSlugs = byBook.keys.sorted {
            BookCatalog.orderIndex(of: $0) < BookCatalog.orderIndex(of: $1)
        }
        for bookSlug in orderedSlugs {
            let bookPath = "\(workSlug).\(bookSlug)"
            let bookID = try writer.insertSection(
                workID: workID,
                parentID: nil,
                ordinalPath: bookPath,
                kind: "book",
                label: bookSlug,            // queries.ts joins on this to resolve the canonical name
                language: "en",
                body: "",
                ordering: ordering)
            ordering += 1

            let chs = byBook[bookSlug]!.sorted { $0.chapter < $1.chapter }
            for ch in chs {
                let chapterPath = "\(bookPath).\(ch.chapter)"
                let chapterID = try writer.insertSection(
                    workID: workID,
                    parentID: bookID,
                    ordinalPath: chapterPath,
                    kind: "chapter",
                    label: String(ch.chapter),
                    language: "en",
                    body: ch.intro,
                    ordering: ordering)
                ordering += 1

                for (i, c) in ch.comments.enumerated() {
                    // Zero-pad sequence so lexicographic sort on ordinal_path stays
                    // numeric within a chapter — 3 digits is plenty for any chapter.
                    let seq = String(format: "%03d", i + 1)
                    _ = try writer.insertSection(
                        workID: workID,
                        parentID: chapterID,
                        ordinalPath: "\(chapterPath).\(seq)",
                        kind: "comment",
                        label: c.label,
                        language: "en",
                        body: c.body,
                        ordering: ordering)
                    ordering += 1
                    totalComments += 1
                }
            }
        }
        logger.info("    \(chapters.count) chapters, \(totalComments) comment blocks across \(byBook.count) books")
    }

    private func ingestSwordCommentary(writer: CorpusWriter,
                                        jsonName: String,
                                        workSlug: String,
                                        workTitle: String,
                                        author: String) throws {
        let url = sourceRoot.appendingPathComponent("commentaries/\(jsonName)")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw IngestError.sourceMissing(url.path)
        }
        let parser = SwordCommentaryParser()
        let chapters = try parser.parse(fileURL: url)
        guard !chapters.isEmpty else {
            throw IngestError.sourceMissing("\(url.path): no entries parsed")
        }

        let workID = try writer.insertWork(
            slug: workSlug, title: workTitle, author: author, kind: "commentary")

        let byBook = Dictionary(grouping: chapters, by: { $0.bookSlug })
        let orderedSlugs = byBook.keys.sorted {
            BookCatalog.orderIndex(of: $0) < BookCatalog.orderIndex(of: $1)
        }
        var ordering = 0
        var totalComments = 0

        var intros = 0
        for bookSlug in orderedSlugs {
            let bookPath = "\(workSlug).\(bookSlug)"
            // The book row's body holds the front-matter intro (if SWORD
            // anchored it at Genesis 1:1 etc.); empty otherwise.
            let chs = byBook[bookSlug]!.sorted { $0.chapter < $1.chapter }
            let intro = chs.first(where: { $0.chapter == 1 })?.bookIntro ?? ""
            if !intro.isEmpty { intros += 1 }
            let bookID = try writer.insertSection(
                workID: workID, parentID: nil, ordinalPath: bookPath,
                kind: "book", label: bookSlug, language: "en",
                body: intro, ordering: ordering)
            ordering += 1

            for ch in chs {
                let chapterPath = "\(bookPath).\(ch.chapter)"
                let chapterID = try writer.insertSection(
                    workID: workID, parentID: bookID, ordinalPath: chapterPath,
                    kind: "chapter", label: String(ch.chapter), language: "en",
                    body: "", ordering: ordering)
                ordering += 1

                for (i, c) in ch.comments.enumerated() {
                    let seq = String(format: "%03d", i + 1)
                    _ = try writer.insertSection(
                        workID: workID, parentID: chapterID,
                        ordinalPath: "\(chapterPath).\(seq)",
                        kind: "comment", label: c.label, language: "en",
                        body: c.body, ordering: ordering)
                    ordering += 1
                    totalComments += 1
                }
            }
        }
        logger.info("    \(totalComments) verse comments + \(intros) book intros across \(byBook.count) books")
    }

    private func ingestCrossRefs(writer: CorpusWriter) throws {
        let url = sourceRoot.appendingPathComponent("openbibleinfo/cross_references.txt")
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = CrossReferenceParser()
        let rows = try parser.parse(fileURL: url)
        // Cross-references depend on verses already existing; insert them as a final pass.
        try writer.queue.write { db in
            for row in rows {
                let fromID = try fetchVerseID(db, bookSlug: row.fromBook, language: "en_bsb",
                                              chapter: row.fromChapter, verse: row.fromVerse)
                let toStart = try fetchVerseID(db, bookSlug: row.toBook, language: "en_bsb",
                                                chapter: row.toChapter, verse: row.toVerseStart)
                let toEnd = row.toVerseStart == row.toVerseEnd ? nil :
                    try fetchVerseID(db, bookSlug: row.toBook, language: "en_bsb",
                                     chapter: row.toChapter, verse: row.toVerseEnd)
                guard let fromID, let toStart else { continue }
                try db.execute(sql: """
                    INSERT INTO xref(from_verse_id, to_verse_start, to_verse_end, weight)
                    VALUES (?, ?, ?, ?)
                    """, arguments: [fromID, toStart, toEnd, row.weight])
            }
        }
    }

    // MARK: - Helpers

    private func writeBibleRows(_ rows: [(bookSlug: String, chapter: Int, verse: Int, text: String, lead: String?)],
                                 language: String, writer: CorpusWriter) throws {
        var bookIDs: [String: Int64] = [:]
        var chapterIDs: [String: Int64] = [:]
        for row in rows {
            guard let book = BookCatalog.bySlug(row.bookSlug) else { continue }
            let bid: Int64
            if let cached = bookIDs[row.bookSlug] { bid = cached }
            else {
                bid = try writer.upsertBook(language: language, canon: book.canon, slug: book.slug,
                                            name: book.name, abbreviation: book.abbreviation,
                                            testament: book.testament,
                                            orderIndex: BookCatalog.orderIndex(of: book.slug))
                bookIDs[row.bookSlug] = bid
            }
            let chapKey = "\(language):\(row.bookSlug):\(row.chapter)"
            let cid: Int64
            if let cached = chapterIDs[chapKey] { cid = cached }
            else { cid = try writer.upsertChapter(bookID: bid, number: row.chapter); chapterIDs[chapKey] = cid }
            _ = try writer.insertVerse(chapterID: cid, number: row.verse, text: row.text, lead: row.lead)
        }
    }

    private func writeTaggedWords(words: [STEPBibleParser.Word], language: String, writer: CorpusWriter) throws {
        // Group by (book, chapter, verse) so each verse becomes one verse row + N words.
        let grouped = Dictionary(grouping: words, by: { "\($0.bookSlug):\($0.chapter):\($0.verse)" })
        var bookIDs: [String: Int64] = [:]
        var chapterIDs: [String: Int64] = [:]
        for (_, wordsInVerse) in grouped {
            guard let first = wordsInVerse.first else { continue }
            guard let book = BookCatalog.bySlug(first.bookSlug) else { continue }
            let bid: Int64
            if let cached = bookIDs[first.bookSlug] { bid = cached }
            else {
                bid = try writer.upsertBook(language: language, canon: book.canon,
                                            slug: book.slug, name: book.name,
                                            abbreviation: book.abbreviation,
                                            testament: book.testament,
                                            orderIndex: BookCatalog.orderIndex(of: book.slug))
                bookIDs[first.bookSlug] = bid
            }
            let chapKey = "\(language):\(first.bookSlug):\(first.chapter)"
            let cid: Int64
            if let cached = chapterIDs[chapKey] { cid = cached }
            else { cid = try writer.upsertChapter(bookID: bid, number: first.chapter); chapterIDs[chapKey] = cid }
            let verseText = wordsInVerse.sorted(by: { $0.position < $1.position }).map(\.surface).joined(separator: " ")
            let vid = try writer.insertVerse(chapterID: cid, number: first.verse, text: verseText)
            for w in wordsInVerse {
                try writer.insertWord(verseID: vid, position: w.position, surface: w.surface,
                                       lemma: w.lemma, strongs: w.strongs, morphology: w.morphology,
                                       baseText: w.baseText, english: w.english)
            }
        }
    }

    // MARK: - Patristic ingest helpers

    private func ingestSumma(writer: CorpusWriter) throws {
        let url = sourceRoot.appendingPathComponent("patristics/summa.json")
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = SummaParser()
        let sections = try parser.parse(fileURL: url)
        let workID = try writer.insertWork(slug: "summa", title: "Summa Theologica",
                                            author: "Thomas Aquinas", kind: "summa")
        var parentIDs: [String: Int64] = [:]
        for (i, s) in sections.enumerated() {
            let parentID = s.parentPath.flatMap { parentIDs[$0] }
            let id = try writer.insertSection(workID: workID, parentID: parentID,
                                              ordinalPath: s.ordinalPath, kind: s.kind,
                                              label: s.label, language: "en", body: s.body, ordering: i)
            parentIDs[s.ordinalPath] = id
        }
        logger.info("    \(sections.count) English sections")
    }

    /// Parse one CCEL ThML volume, run the discovery pass to enumerate
    /// non-editorial top-level works, and write a `work` row + section tree
    /// for each. `volumeSlug` (e.g. "anf01" / "npnf204") is the source-file
    /// stem; we prefix it onto work slugs to keep them globally unique
    /// even when two volumes have a work with the same auto-generated
    /// slug (e.g. multiple volumes each have a "preface").
    private func ingestThMLVolume(writer: CorpusWriter, file: String, volumeSlug: String) throws {
        let url = sourceRoot.appendingPathComponent(file)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw IngestError.sourceMissing(url.path)
        }
        let parser = ThMLParser()
        let manifest = try parser.discoverWorks(fileURL: url)
        if manifest.works.isEmpty {
            logger.info("    no works discovered in \(file)")
            return
        }
        let volumeAuthor = manifest.author.isEmpty ? "Various" : manifest.author
        let volumeAuthorList = manifest.author.components(separatedBy: " & ")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        var totalSections = 0
        for entry in manifest.works {
            let workSlug = "\(volumeSlug).\(entry.slug)"
            let result = try parser.parse(
                fileURL: url,
                workSlug: workSlug,
                containerID: entry.containerID
            )
            guard !result.sections.isEmpty else { continue }
            let normalized = normalizeWorkTitle(entry.title)
            let author = entry.author ?? resolvePerWorkAuthor(
                title: normalized,
                volumeAuthors: volumeAuthorList,
                volumeAuthor: volumeAuthor
            )
            let workID = try writer.insertWork(
                slug: workSlug,
                title: normalized,
                author: author,
                kind: "treatise"
            )
            for (i, s) in result.sections.enumerated() {
                _ = try writer.insertSection(
                    workID: workID, parentID: nil,
                    ordinalPath: s.ordinalPath, kind: s.kind,
                    label: s.label, language: "en", body: s.body, ordering: i
                )
            }
            totalSections += result.sections.count
        }
        logger.info("    \(manifest.works.count) works, \(totalSections) sections")
    }
}

/// CCEL's ANF volumes store div1 titles in all-caps (`JUSTIN MARTYR`,
/// `THE PASTOR OF HERMAS`); NPNF volumes use mixed case with trailing
/// periods (`The Confessions.`). Normalize:
///   • drop trailing periods (semantically nothing — it's typographic)
///   • title-case anything that's predominantly uppercase (treating each
///     word independently so prepositions / Roman numerals survive)
///   • rewrite a bare author-name title to "Writings of <Father>" so the
///     reader doesn't see an entry whose title is just a name
func normalizeWorkTitle(_ raw: String) -> String {
    var t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    while t.hasSuffix(".") || t.hasSuffix(",") || t.hasSuffix(";") {
        t.removeLast()
    }
    t = t.trimmingCharacters(in: .whitespacesAndNewlines)

    // Predominantly-uppercase test: at least 70% of the letters in the
    // string are uppercase. Skips strings without lowercase letters at all
    // (i.e. all-caps source titles).
    let letters = t.unicodeScalars.filter { CharacterSet.letters.contains($0) }
    let uppers = letters.filter { CharacterSet.uppercaseLetters.contains($0) }
    let mostlyUpper = !letters.isEmpty && Double(uppers.count) / Double(letters.count) >= 0.7
    if mostlyUpper {
        t = titleCaseEachWord(t)
    }

    // Bare-author-name detection: if the title (after diacritic folding +
    // case folding) matches a known father display name, retitle as
    // "Writings of <Father>" — entries like "JUSTIN MARTYR" / "Barnabas"
    // are then readable as compilations rather than puzzling one-word
    // works in the index.
    let folded = foldName(t)
    if let father = knownFatherByDisplayName(folded) {
        t = "Writings of \(father)"
    }

    return t
}

/// Indexes of `ccelAuthorDisplay.values` for substring lookups. We need
/// two: the full lowercased display name (so "Polycarp of Smyrna" matches)
/// AND just the personal-name portion before " of " (so "Polycarp" alone
/// matches "Polycarp of Smyrna"). Both keys are diacritic-and-ligature
/// folded so "Irenæus" / "Cyprian" / "Lerins" / "Lérins" all line up.
private let knownFatherIndex: [String: String] = {
    var map: [String: String] = [:]
    for name in Set(ccelAuthorDisplay.values) {
        let key = foldName(name)
        map[key] = name
        if let personal = key.components(separatedBy: " of ").first, personal != key {
            map[personal] = name
        }
    }
    return map
}()

private func foldName(_ s: String) -> String {
    s.replacingOccurrences(of: "æ", with: "ae")
     .replacingOccurrences(of: "Æ", with: "Ae")
     .replacingOccurrences(of: "œ", with: "oe")
     .replacingOccurrences(of: "Œ", with: "Oe")
     .folding(options: .diacriticInsensitive, locale: .current)
     .lowercased()
}

private func knownFatherByDisplayName(_ folded: String) -> String? {
    if let direct = knownFatherIndex[folded] { return direct }
    // Allow "Polycarp" to match "Polycarp of Smyrna" by trimming a
    // descriptive suffix.
    let trimmed = folded
        .components(separatedBy: " of ").first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        ?? folded
    if trimmed != folded, let m = knownFatherIndex[trimmed] { return m }
    return nil
}

private func titleCaseEachWord(_ s: String) -> String {
    // Words to keep lowercase when they aren't at the start. Title-case
    // everything else by uppercasing the first letter only.
    let lowercaseWords: Set<String> = [
        "of", "the", "and", "or", "in", "on", "to", "for", "from",
        "with", "by", "a", "an", "but", "at", "as", "&", "vs",
    ]
    let words = s.components(separatedBy: " ")
    var out: [String] = []
    for (i, w) in words.enumerated() {
        if w.isEmpty { out.append(w); continue }
        // Preserve Roman numerals + words that already contain a mix.
        let alphaOnly = w.unicodeScalars.allSatisfy { CharacterSet.letters.contains($0) || CharacterSet.punctuationCharacters.contains($0) }
        if !alphaOnly {
            out.append(w)
            continue
        }
        let lower = w.lowercased()
        if i > 0 && lowercaseWords.contains(lower) {
            out.append(lower)
        } else {
            let chars = Array(lower)
            out.append(String(chars.first!).uppercased() + String(chars.dropFirst()))
        }
    }
    return out.joined(separator: " ")
}

/// Pick the most specific author for a work. Both single-author and
/// multi-author volumes can have works that name a different father in
/// their title — CCEL's ANF Vol 1 declares only Irenaeus as its
/// DC.Creator-Author even though the volume bundles Clement of Rome,
/// Mathetes, Polycarp, Ignatius, Barnabas, and Justin Martyr.
///
/// Strategy: walk every known father in `ccelAuthorDisplay`, check if the
/// title contains their personal-name token (the part before "of <Place>").
/// If exactly one father matches, attribute to them. Otherwise fall back
/// to the volume-level string.
private func resolvePerWorkAuthor(
    title: String,
    volumeAuthors: [String],
    volumeAuthor: String
) -> String {
    let folded = foldName(title)
    let fathers = Set(ccelAuthorDisplay.values)

    // Collect every father the title plausibly references — by full
    // display name, by alias phrase (CCEL slug), or by personal-name (the
    // part before " of "). All hits go in a single bucket.
    var candidates = Set<String>()
    for father in fathers {
        let foldedFather = foldName(father)
        if matchesAsPhrase(foldedFather, in: folded) {
            candidates.insert(father)
            continue
        }
        let personalName: String = {
            if let beforeOf = foldedFather.components(separatedBy: " of ").first,
               beforeOf != foldedFather {
                return beforeOf.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return foldedFather
                .components(separatedBy: " ").first?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? foldedFather
        }()
        if personalName.count >= 4, matchesAsPhrase(personalName, in: folded) {
            candidates.insert(father)
        }
    }
    for (key, canonical) in ccelAuthorDisplay {
        // CCEL slug as phrase trigger. Only multi-word ("leo_great") or
        // long single words ("nazianzen", "sulpitius") qualify — shorter
        // forms like "gregory" / "cyril" / "dionysius" are ambiguous and
        // would over-match.
        let phrase = key.replacingOccurrences(of: "_", with: " ")
        let isMultiWord = phrase.contains(" ")
        let isLongUnique = key.count >= 8
        guard isMultiWord || isLongUnique else { continue }
        if matchesAsPhrase(foldName(phrase), in: folded) {
            candidates.insert(canonical)
        }
    }

    // Disambiguate via the volume's declared author list. If exactly one
    // of the title-candidates is also declared in the volume, that's the
    // answer — solves the "Dionysius" problem (ANF6 ships Dionysius of
    // Alexandria; ANF7 ships Dionysius of Rome) and many like it.
    let volSet = Set(volumeAuthors)
    let inVolume = candidates.intersection(volSet)
    if inVolume.count == 1 { return inVolume.first! }
    if candidates.count == 1 { return candidates.first! }

    // No clean per-work resolution. Anything with more than one declared
    // author flattens to "Various" — even the apparently-friendly
    // "Clement of Rome & Theodotus" pair is misleading on a work that's
    // actually anonymous apocrypha bundled into the same volume.
    if volumeAuthors.count > 1 { return "Various" }
    return volumeAuthor
}

private func matchesAsPhrase(_ phrase: String, in folded: String) -> Bool {
    let pattern = "\\b\(NSRegularExpression.escapedPattern(for: phrase))\\b"
    return folded.range(of: pattern, options: .regularExpression) != nil
}

import GRDB
private func fetchVerseID(_ db: Database, bookSlug: String, language: String,
                          chapter: Int, verse: Int) throws -> Int64? {
    try Int64.fetchOne(db, sql: """
        SELECT v.id FROM verse v
        JOIN chapter c ON v.chapter_id = c.id
        JOIN book b ON c.book_id = b.id
        WHERE b.slug = ? AND b.language = ? AND c.number = ? AND v.number = ?
        """, arguments: [bookSlug, language, chapter, verse])
}
