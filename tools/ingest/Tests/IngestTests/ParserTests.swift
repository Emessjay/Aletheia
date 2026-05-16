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
        XCTAssertFalse(result.rows[0].text.contains("1.1"))
        XCTAssertFalse(result.rows[0].text.contains("+"))
    }

    /// Regression test for Joshua 5:2 in the KJV: pilcrow, nested \+w marker
    /// inside \nd, and a footnote whose body uses inner \fr / \ft markers.
    func testKJVJoshua52Shape() throws {
        let parser = USFMParser()
        let usfm = """
        \\id JOS Joshua
        \\c 5
        \\p
        \\v 2 ¶ At that \\w time|strong="H6256"\\w* the \\nd \\+w LORD|strong="H3068"\\+w*\\nd* \\w said|strong="H0559"\\w* unto \\w Joshua|strong="H3091"\\w*, \\w Make|strong="H6213"\\w* thee \\w sharp|strong="H6697"\\w* \\w knives|strong="H2719"\\w*.\\f + \\fr 5.2 \\ft sharp…: or, knives of flints\\f*
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.rows.count, 1)
        let text = result.rows[0].text
        XCTAssertEqual(
            text,
            "At that time the LORD said unto Joshua, Make thee sharp knives."
        )
    }
}

final class LexiconParserTests: XCTestCase {
    /// Regression: nested inline children inside <source>/<meaning> used to
    /// wipe the text accumulator, leaving H1961's definition as just `);`
    /// and the meaning as just `(always emphatic, and not a mere copula or
    /// auxiliary)`. The full text should now survive.
    func testHebrewPreservesTextAroundNestedChildren() throws {
        let parser = LexiconParser()
        let xml = """
        <lexicon>
        <entry id="H1961">
            <w pos="v" pron="haw-yaw" xlit="hâyâh" xml:lang="heb">הָיָה</w>
            <source>a primitive root (compare <w src="H1933">1933</w>);</source>
            <meaning>to <def>exist</def>, i.e. <def>be</def> or <def>become</def>, <def>come to pass</def> (always emphatic, and not a mere copula or auxiliary)</meaning>
            <usage>beacon, be(-come), come (to pass)</usage>
        </entry>
        </lexicon>
        """
        let entries = try parser.parseHebrew(text: xml)
        XCTAssertEqual(entries.count, 1)
        let e = entries[0]
        XCTAssertEqual(e.id, "H1961")
        XCTAssertEqual(e.lemma, "הָיָה")
        // Meaning should retain the leading "to exist, i.e. ..." prose.
        XCTAssertTrue(e.gloss.contains("exist"), "got gloss: \(e.gloss)")
        XCTAssertTrue(e.definition.contains("primitive root"))
        XCTAssertTrue(e.definition.contains("exist"))
        // The empty `);` artifact must not be the entire definition.
        XCTAssertFalse(e.definition == ");")
    }

    /// Regression: Greek lexicon was capturing only <strongs_def> and
    /// dropping <strongs_derivation>, so G2316 read "figuratively, a
    /// magistrate" instead of "of uncertain affinity; a deity ... ".
    func testGreekIncludesDerivation() throws {
        let parser = LexiconParser()
        let xml = """
        <strongsdictionary>
        <entry strongs="02316">
            <strongs>2316</strongs>
            <greek BETA="QEO/S" unicode="θεός" translit="theós"/>
            <strongs_derivation>of uncertain affinity; a deity, especially (with <strongsref language="GREEK" strongs="3588"/>) the supreme Divinity;</strongs_derivation>
            <strongs_def> figuratively, a magistrate; by Hebraism, very</strongs_def>
            <kjv_def>:--X exceeding, God, god(-ly, -ward).</kjv_def>
        </entry>
        </strongsdictionary>
        """
        let entries = try parser.parseGreek(text: xml)
        XCTAssertEqual(entries.count, 1)
        let e = entries[0]
        XCTAssertEqual(e.id, "G2316")
        XCTAssertEqual(e.lemma, "θεός")
        XCTAssertTrue(e.definition.contains("a deity"), "got definition: \(e.definition)")
        XCTAssertTrue(e.definition.contains("figuratively"))
        // The `:--` prefix on kjv_def should be stripped.
        XCTAssertNotNil(e.kjvUsage)
        XCTAssertFalse(e.kjvUsage!.hasPrefix(":"), "got kjvUsage: \(e.kjvUsage ?? "nil")")
    }

    /// shortGloss must not split on `.` — that breaks "i.e." into "i".
    func testShortGlossDoesNotSplitAbbreviations() throws {
        let parser = LexiconParser()
        let xml = """
        <strongsdictionary>
        <entry strongs="00026">
            <greek unicode="ἀγάπη" translit="agápē"/>
            <strongs_def>love, i.e. affection or benevolence</strongs_def>
            <kjv_def>:--charity, love.</kjv_def>
        </entry>
        </strongsdictionary>
        """
        let entries = try parser.parseGreek(text: xml)
        XCTAssertEqual(entries.first?.gloss, "love, i.e. affection or benevolence")
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
