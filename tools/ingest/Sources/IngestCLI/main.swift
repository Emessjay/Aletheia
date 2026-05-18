import Foundation
import ArgumentParser
import Ingest
import Logging

LoggingSystem.bootstrap { label in
    var handler = StreamLogHandler.standardOutput(label: label)
    handler.logLevel = .info
    return handler
}

struct AletheiaIngest: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "aletheia-ingest",
        abstract: "Build Aletheia.sqlite from raw source data.",
        discussion: """
            Without --books, --languages, or --groups, the corpus is rebuilt from
            scratch (the output file is deleted first). Passing any filter switches
            to merge mode: the existing Aletheia.sqlite is kept and only the
            matching slice is re-ingested over it.

            --books takes a comma-separated list of book slugs (e.g. gen,exod,ps).
            Only Bible/STEPBible stages are book-scoped; lexicons, cross-references,
            commentaries, and patristics are skipped when --books is set.

            --languages takes a comma-separated list of language tags. The known
            tags are:
              en_bsb, en_kjv, en_brenton, en_web    (English Bibles)
              he                                    (Hebrew MT + BDB lexicon)
              gk                                    (Greek LXX/NT + Strong's lexicon)
              en, la                                (commentaries + patristics)

            --groups takes a comma-separated list of source groups, useful when you
            want to re-ingest one slice of the corpus without rerunning everything
            else (each is bulky on its own). The known groups are:
              bible       — every Bible/STEPBible/lexicon/xref stage
              commentary  — Matthew Henry, Calvin, JFB, Wesley, Clarke, Luther
              summa       — Summa Theologica (English + Latin)
              anf         — Ante-Nicene Fathers (Trypho, ...)
              npnf        — Nicene & Post-Nicene Fathers (Athanasius, Augustine, ...)
              reformers   — Luther, Calvin, Knox, Latimer non-commentary works
              creeds      — Schaff's Creeds of Christendom (3 vols, PD confessions)
            """
    )

    @Option(name: [.short, .long], help: "Root directory containing source files. See Pipeline.swift docs for expected layout.")
    var sourceRoot: String

    @Option(name: [.short, .long], help: "Output path for the built SQLite corpus.")
    var output: String = "data/Aletheia.sqlite"

    @Option(name: [.customShort("b"), .long], help: ArgumentHelp("Restrict Bible/STEPBible stages to these book slugs (comma-separated).", valueName: "slugs"))
    var books: String?

    @Option(name: [.customShort("l"), .long], help: ArgumentHelp("Restrict stages to these language tags (comma-separated).", valueName: "tags"))
    var languages: String?

    @Option(name: [.customShort("g"), .long], help: ArgumentHelp("Restrict stages to these source groups (comma-separated): bible | commentary | summa | anf | npnf.", valueName: "groups"))
    var groups: String?

    func run() throws {
        let root = URL(fileURLWithPath: sourceRoot, isDirectory: true)
        let outPath = output
        let outDir = (outPath as NSString).deletingLastPathComponent
        if !outDir.isEmpty {
            try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        }
        let bookFilter = parseCSV(books)
        let languageFilter = parseCSV(languages)
        let groupFilter = parseCSV(groups)
        let pipeline = Pipeline(sourceRoot: root, outputPath: outPath,
                                bookFilter: bookFilter,
                                languageFilter: languageFilter,
                                groupFilter: groupFilter)
        try pipeline.run()
    }

    private func parseCSV(_ raw: String?) -> Set<String> {
        guard let raw, !raw.isEmpty else { return [] }
        return Set(raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
    }
}

AletheiaIngest.main()
