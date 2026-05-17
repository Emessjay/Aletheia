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
public struct Pipeline {
    public let sourceRoot: URL
    public let outputPath: String
    /// Restrict Bible/STEPBible stages to these book slugs. Empty = no filter.
    /// When non-empty, non-book-scoped stages (lexicons, cross-refs) are
    /// skipped entirely.
    public let bookFilter: Set<String>
    /// Restrict stages to these language tags. Empty = no filter. Tags must match
    /// one of the tags declared on each stage (see `stageEntries`).
    public let languageFilter: Set<String>
    public let logger = Logger(label: "aletheia.ingest")

    public init(sourceRoot: URL, outputPath: String,
                bookFilter: Set<String> = [], languageFilter: Set<String> = []) {
        self.sourceRoot = sourceRoot
        self.outputPath = outputPath
        self.bookFilter = bookFilter
        self.languageFilter = languageFilter
    }

    private var filtersActive: Bool { !bookFilter.isEmpty || !languageFilter.isEmpty }

    private struct Stage {
        let name: String
        let languages: Set<String>
        let bookScoped: Bool
        let run: () throws -> Void
    }

    public func run() throws {
        if filtersActive {
            logger.info("Updating Aletheia corpus at \(outputPath) (merge mode)")
            if !bookFilter.isEmpty { logger.info("  books: \(bookFilter.sorted().joined(separator: ","))") }
            if !languageFilter.isEmpty { logger.info("  languages: \(languageFilter.sorted().joined(separator: ","))") }
        } else {
            logger.info("Building Aletheia corpus at \(outputPath)")
        }
        let writer = try CorpusWriter(at: outputPath, clean: !filtersActive)
        let stages = stageEntries(writer: writer)

        var failed = 0
        var skippedByFilter = 0
        for stage in stages {
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
            Stage(name: "BSB", languages: ["en_bsb"], bookScoped: true,
                  run: { try ingestBSB(writer: writer) }),
            Stage(name: "KJV (Eng)", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestKJV(writer: writer) }),
            Stage(name: "Brenton LXX (Eng)", languages: ["en_brenton"], bookScoped: true,
                  run: { try ingestBrenton(writer: writer) }),
            Stage(name: "Brenton LXX (Grk)", languages: ["gk"], bookScoped: true,
                  run: { try ingestGrcbrent(writer: writer) }),
            Stage(name: "KJV Apocrypha", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestKJVApocrypha(writer: writer) }),
            Stage(name: "WEB (Eng + Apocrypha)", languages: ["en_web"], bookScoped: true,
                  run: { try ingestWEB(writer: writer) }),
            Stage(name: "STEPBible KJV+Strongs", languages: ["en_kjv"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tkjvs, language: "en_kjv") }),
            Stage(name: "STEPBible Hebrew (MT)", languages: ["he"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tahot, language: "he") }),
            Stage(name: "STEPBible Greek (LXX)", languages: ["gk"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tagot, language: "gk") }),
            Stage(name: "STEPBible Greek (NT)", languages: ["gk"], bookScoped: true,
                  run: { try ingestSTEP(writer: writer, table: .tagnt, language: "gk") }),
            // Must run after Brenton LXX (Grk) (verses) AND STEPBible Greek (NT)
            // (the surface→strongs reference data). See LXXTagger.swift for the
            // rationale on surface-form (not lemma-form) matching.
            Stage(name: "LXX surface-form tagging", languages: ["gk"], bookScoped: true,
                  run: { try tagLXXSurfaces(writer: writer) }),
            Stage(name: "Lexicon — Hebrew BDB", languages: ["he"], bookScoped: false,
                  run: { try ingestLexicon(writer: writer, source: .hebrewBDB(self.sourceRoot.appendingPathComponent("openscriptures/HebrewLexicon.xml"))) }),
            Stage(name: "Lexicon — Greek Strong's", languages: ["gk"], bookScoped: false,
                  run: { try ingestLexicon(writer: writer, source: .greekStrongs(self.sourceRoot.appendingPathComponent("openscriptures/StrongsGreek.xml"))) }),
            // Cross-refs index against en_bsb verses, so a partial book filter would
            // produce broken xrefs. Marked non-book-scoped so --books skips it.
            Stage(name: "Cross-references", languages: ["en_bsb"], bookScoped: false,
                  run: { try ingestCrossRefs(writer: writer) }),
            // Commentaries — each writes one `work` row plus per-book/chapter/comment
            // `section` rows. Language tag "en" is shared by all current commentaries;
            // it does NOT match any of the Bible-side `en_*` tags, so a `--languages en_bsb`
            // filter correctly skips these (and a bare `--languages en` runs only them).
            Stage(name: "Commentary — Matthew Henry", languages: ["en"], bookScoped: false,
                  run: { try ingestMatthewHenry(writer: writer) }),
            Stage(name: "Commentary — Calvin", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "calvin.json",
                      workSlug: "calvin",
                      workTitle: "Calvin's Commentaries",
                      author: "John Calvin") }),
            Stage(name: "Commentary — JFB", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "jfb.json",
                      workSlug: "jfb",
                      workTitle: "Commentary Critical and Explanatory on the Whole Bible",
                      author: "Jamieson, Fausset & Brown") }),
            Stage(name: "Commentary — Wesley's Notes", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "wesley.json",
                      workSlug: "wesley",
                      // The CrossWire module bundles both Wesley's NT notes
                      // (1755) and his less-famous OT notes (1765), so the
                      // umbrella "Notes on the Bible" title is accurate.
                      workTitle: "John Wesley's Notes on the Bible",
                      author: "John Wesley") }),
            Stage(name: "Commentary — Clarke", languages: ["en"], bookScoped: false,
                  run: { try ingestSwordCommentary(
                      writer: writer,
                      jsonName: "clarke.json",
                      workSlug: "clarke",
                      workTitle: "Adam Clarke's Commentary on the Bible",
                      author: "Adam Clarke") })
        ]
    }

    // MARK: - Stage implementations

    private func ingestBSB(writer: CorpusWriter) throws {
        let url = sourceRoot.appendingPathComponent("bsb/bsb.txt")
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = BSBParser()
        let rows = try parser.parse(fileURL: url)
        let filtered = bookFilter.isEmpty ? rows : rows.filter { bookFilter.contains($0.bookSlug) }
        logger.info("    parsed \(rows.count) BSB verses\(bookFilter.isEmpty ? "" : " (\(filtered.count) after book filter)")")
        try writeBibleRows(filtered.map { ($0.bookSlug, $0.chapter, $0.verse, $0.text) },
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
                ? USFMParser.Row(bookSlug: "ps151", chapter: 1, verse: row.verse, text: row.text)
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
                                  verse: row.verse, text: row.text)
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
                try writeBibleRows(filtered.map { ($0.bookSlug, $0.chapter, $0.verse, $0.text) },
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

        for bookSlug in orderedSlugs {
            let bookPath = "\(workSlug).\(bookSlug)"
            let bookID = try writer.insertSection(
                workID: workID, parentID: nil, ordinalPath: bookPath,
                kind: "book", label: bookSlug, language: "en", body: "", ordering: ordering)
            ordering += 1

            let chs = byBook[bookSlug]!.sorted { $0.chapter < $1.chapter }
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
        logger.info("    \(totalComments) verse comments across \(byBook.count) books")
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

    private func writeBibleRows(_ rows: [(bookSlug: String, chapter: Int, verse: Int, text: String)],
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
            _ = try writer.insertVerse(chapterID: cid, number: row.verse, text: row.text)
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
