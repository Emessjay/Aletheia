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
        abstract: "Build Aletheia.sqlite from raw source data."
    )

    @Option(name: [.short, .long], help: "Root directory containing source files. See Pipeline.swift docs for expected layout.")
    var sourceRoot: String

    @Option(name: [.short, .long], help: "Output path for the built SQLite corpus.")
    var output: String = "data/Aletheia.sqlite"

    func run() throws {
        let root = URL(fileURLWithPath: sourceRoot, isDirectory: true)
        let outPath = output
        // Make sure the output directory exists
        let outDir = (outPath as NSString).deletingLastPathComponent
        if !outDir.isEmpty {
            try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        }
        let pipeline = Pipeline(sourceRoot: root, outputPath: outPath)
        try pipeline.run()
    }
}

AletheiaIngest.main()
