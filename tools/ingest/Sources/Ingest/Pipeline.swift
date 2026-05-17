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
///       patristics/summa.json                    # Jacob-Gray/summa.json
///       patristics/summa-latin.txt               # Corpus Thomisticum dump
///       patristics/trypho-en.xml                 # CCEL ThML
///       patristics/trypho-gr.xml                 # OpenGreekAndLatin TEI
///       patristics/incarnation-en.xml
///       patristics/incarnation-gr.xml
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
            Stage(name: "Patristics — Summa (Eng)", languages: ["en"], bookScoped: false,
                  run: { try ingestSumma(writer: writer) }),
            Stage(name: "Patristics — Summa (Lat)", languages: ["la"], bookScoped: false,
                  run: { try ingestSummaLatin(writer: writer) }),
            // anf01.xml is the full ANF Vol. 1; scope to Justin Martyr's div2 "viii.iv" (Dialogue with Trypho).
            Stage(name: "Patristics — Trypho (Eng)", languages: ["en"], bookScoped: false,
                  run: { try ingestThML(writer: writer, file: "patristics/trypho-en.xml", workSlug: "trypho", language: "en", containerID: "viii.iv") }),
            Stage(name: "Patristics — Trypho (Grk)", languages: ["gr"], bookScoped: false,
                  run: { try ingestTEI(writer: writer, file: "patristics/trypho-gr.xml", workSlug: "trypho", language: "gr") }),
            // npnf204.xml is the full NPNF2-04; scope to Athanasius's div2 "vii.ii" (On the Incarnation).
            Stage(name: "Patristics — Incarnation (Eng)", languages: ["en"], bookScoped: false,
                  run: { try ingestThML(writer: writer, file: "patristics/incarnation-en.xml", workSlug: "incarnation", language: "en", containerID: "vii.ii") }),
            Stage(name: "Patristics — Incarnation (Grk)", languages: ["gr"], bookScoped: false,
                  run: { try ingestTEI(writer: writer, file: "patristics/incarnation-gr.xml", workSlug: "incarnation", language: "gr") })
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
                                transformRows: splitCombinedEzraNeh)
    }

    /// Brenton's Greek LXX (eBible.org `grcbrent`). Untagged Greek text under
    /// `language="gk"` alongside the existing Greek NT, so the reader's Greek
    /// column resolves for OT chapters. Books not present in [[BookCatalog]]
    /// (LJE, SUS, BEL, MAN, 1ES, 3MA, 4MA) are silently skipped by the USFM
    /// parser; DAG/ESG are remapped to dan/esth via the catalog's alias table.
    private func ingestGrcbrent(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "grcbrent", language: "gk", writer: writer,
                                transformRows: splitCombinedEzraNeh)
    }

    private func ingestKJVApocrypha(writer: CorpusWriter) throws {
        try ingestUSFMDirectory(named: "kjv-apocrypha", language: "en_kjv", writer: writer)
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
                                     transformRows: (([USFMParser.Row]) -> [USFMParser.Row])? = nil) throws {
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
                let rows = transformRows?(result.rows) ?? result.rows
                let filtered = bookFilter.isEmpty ? rows : rows.filter { bookFilter.contains($0.bookSlug) }
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
    }

    private func ingestSummaLatin(writer: CorpusWriter) throws {
        // Geremia/AquinasOperaOmnia clone is laid out as <root>/summa/<PART>/<file>.html
        let root = sourceRoot.appendingPathComponent("summa-latin/summa")
        guard FileManager.default.fileExists(atPath: root.path) else {
            throw IngestError.sourceMissing(root.path)
        }
        let parser = SummaLatinParser()
        let sections = try parser.parse(rootDirectory: root)
        let workID = try writer.insertWork(slug: "summa", title: "Summa Theologica",
                                            author: "Thomas Aquinas", kind: "summa")
        for (i, s) in sections.enumerated() {
            _ = try writer.insertSection(workID: workID, parentID: nil,
                                         ordinalPath: s.ordinalPath, kind: "respondeo",
                                         label: nil, language: "la", body: s.body, ordering: i)
        }
        logger.info("    \(sections.count) Latin sections")
    }

    private func ingestThML(writer: CorpusWriter, file: String, workSlug: String, language: String, containerID: String? = nil) throws {
        let url = sourceRoot.appendingPathComponent(file)
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = ThMLParser()
        let result = try parser.parse(fileURL: url, workSlug: workSlug, containerID: containerID)
        let workID = try writer.insertWork(slug: workSlug, title: result.title.isEmpty ? workSlug.capitalized : result.title,
                                            author: result.author, kind: "treatise")
        for (i, s) in result.sections.enumerated() {
            _ = try writer.insertSection(workID: workID, parentID: nil,
                                         ordinalPath: s.ordinalPath, kind: s.kind,
                                         label: s.label, language: language, body: s.body, ordering: i)
        }
        logger.info("    \(result.sections.count) sections")
    }

    private func ingestTEI(writer: CorpusWriter, file: String, workSlug: String, language: String) throws {
        let url = sourceRoot.appendingPathComponent(file)
        guard FileManager.default.fileExists(atPath: url.path) else { throw IngestError.sourceMissing(url.path) }
        let parser = TEIGreekParser()
        let result = try parser.parse(fileURL: url, workSlug: workSlug)
        let workID = try writer.insertWork(slug: workSlug,
                                            title: result.title.isEmpty ? workSlug.capitalized : result.title,
                                            author: workSlug == "trypho" ? "Justin Martyr" : "Athanasius",
                                            kind: "treatise")
        for (i, s) in result.sections.enumerated() {
            _ = try writer.insertSection(workID: workID, parentID: nil,
                                         ordinalPath: s.ordinalPath, kind: s.kind,
                                         label: s.label, language: language, body: s.body, ordering: i)
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
                                       baseText: w.baseText)
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
