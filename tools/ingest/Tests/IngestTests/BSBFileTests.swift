import XCTest
@testable import Ingest

final class BSBFileTests: XCTestCase {
    /// Run only when the actual bsb.txt is present locally; CI may not have it.
    func testParsesRealFile() throws {
        let url = URL(fileURLWithPath: "/Users/jackporter/Programs/Aletheia/data/sources/bsb/bsb.txt")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw XCTSkip("bsb.txt not present at expected path")
        }
        let parser = BSBParser()
        let rows = try parser.parse(fileURL: url)
        print("Parsed \(rows.count) rows")
        if let first = rows.first {
            print("First: \(first.bookSlug) \(first.chapter):\(first.verse) — \(first.text.prefix(80))")
        }
        if let last = rows.last {
            print("Last: \(last.bookSlug) \(last.chapter):\(last.verse) — \(last.text.prefix(80))")
        }
        XCTAssertGreaterThan(rows.count, 30_000, "BSB should have ~31,103 verses")
    }

    func testCRLFLineEndings() {
        let parser = BSBParser()
        let text = "Genesis 1:1\tIn the beginning.\r\nGenesis 1:2\tNow the earth.\r\n"
        let rows = parser.parse(text: text)
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].verse, 1)
    }
}
