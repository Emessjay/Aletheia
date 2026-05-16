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
            Without --books or --languages, the corpus is rebuilt from scratch (the
            output file is deleted first). Passing either filter switches to merge
            mode: the existing Aletheia.sqlite is kept and only the matching slice
            is re-ingested over it.

            --books takes a comma-separated list of book slugs (e.g. gen,exod,ps).
            Only Bible/STEPBible stages are book-scoped; lexicons, cross-references,
            and patristics stages are skipped when --books is set.

            --languages takes a comma-separated list of language tags. The known
            tags are:
              en_bsb, en_kjv, en_brenton            (English Bibles)
              he                                    (Hebrew MT + BDB lexicon)
              gk                                    (Greek LXX/NT + Strong's lexicon)
              en, la, gr                            (Patristics: English, Latin, Greek)

            Note: patristic section inserts are not deduped, so re-running a
            language filter that targets a patristic stage (en/la/gr) will append
            duplicate sections. Either start from a clean output for those, or
            limit re-runs to Bible/lexicon language tags.
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

    func run() throws {
        let root = URL(fileURLWithPath: sourceRoot, isDirectory: true)
        let outPath = output
        let outDir = (outPath as NSString).deletingLastPathComponent
        if !outDir.isEmpty {
            try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        }
        let bookFilter = parseCSV(books)
        let languageFilter = parseCSV(languages)
        let pipeline = Pipeline(sourceRoot: root, outputPath: outPath,
                                bookFilter: bookFilter, languageFilter: languageFilter)
        try pipeline.run()
    }

    private func parseCSV(_ raw: String?) -> Set<String> {
        guard let raw, !raw.isEmpty else { return [] }
        return Set(raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
    }
}

AletheiaIngest.main()
