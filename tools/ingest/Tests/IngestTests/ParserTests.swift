import XCTest
@testable import Ingest

final class BSBParserTests: XCTestCase {
    func testTabDelimited() {
        let parser = BSBParser()
        let text = "Genesis 1:1\tIn the beginning God created the heavens and the earth.\nGenesis 1:2\tNow the earth was formless and empty."
        let rows = parser.parse(text: text)
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].bookSlug, "gen")
        XCTAssertEqual(rows[0].chapter, 1)
        XCTAssertEqual(rows[0].verse, 1)
        XCTAssertEqual(rows[1].verse, 2)
    }

    func testWhitespaceDelimited() {
        let parser = BSBParser()
        let text = "John 3:16 For God so loved the world that he gave his one and only Son."
        let rows = parser.parse(text: text)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].bookSlug, "john")
        XCTAssertEqual(rows[0].chapter, 3)
        XCTAssertEqual(rows[0].verse, 16)
    }

    func testNumberedBook() {
        let parser = BSBParser()
        let rows = parser.parse(text: "1 Corinthians 13:4\tLove is patient, love is kind.")
        XCTAssertEqual(rows.first?.bookSlug, "1cor")
    }
}

final class USFMParserTests: XCTestCase {
    func testMinimalParse() throws {
        let parser = USFMParser()
        let usfm = """
        \\id GEN Genesis
        \\c 1
        \\p
        \\v 1 In the beginning God created the heavens and the earth.
        \\v 2 And the earth was without form, and void.
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.bookSlug, "gen")
        XCTAssertEqual(result.rows.count, 2)
        XCTAssertTrue(result.rows[0].text.contains("In the beginning"))
    }

    func testStripsFootnotes() throws {
        let parser = USFMParser()
        let usfm = """
        \\id JHN John
        \\c 1
        \\v 1 In the beginning was the Word\\f + \\fr 1.1 \\ft John's prologue.\\f* and the Word was with God.
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.rows.count, 1)
        XCTAssertFalse(result.rows[0].text.contains("prologue"))
    }
}

final class CrossReferenceParserTests: XCTestCase {
    func testParse() {
        let parser = CrossReferenceParser()
        let text = """
        From Verse\tTo Verse\tVotes
        Gen.1.1\tJohn.1.1\t100
        Gen.1.1\tHeb.1.10-Heb.1.12\t40
        """
        let rows = parser.parse(text: text)
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].fromBook, "gen")
        XCTAssertEqual(rows[0].toBook, "john")
        XCTAssertEqual(rows[1].toVerseStart, 10)
        XCTAssertEqual(rows[1].toVerseEnd, 12)
    }
}
