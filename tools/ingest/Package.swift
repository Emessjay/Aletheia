// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "aletheia-ingest",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "aletheia-ingest", targets: ["IngestCLI"]),
        .library(name: "Ingest", targets: ["Ingest"])
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift", from: "6.29.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.5.0"),
        .package(url: "https://github.com/apple/swift-log", from: "1.5.0")
    ],
    targets: [
        .target(
            name: "Ingest",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Logging", package: "swift-log")
            ],
            path: "Sources/Ingest"
        ),
        .executableTarget(
            name: "IngestCLI",
            dependencies: [
                "Ingest",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Logging", package: "swift-log")
            ],
            path: "Sources/IngestCLI"
        ),
        .testTarget(
            name: "IngestTests",
            dependencies: ["Ingest"],
            path: "Tests/IngestTests"
        )
    ]
)
