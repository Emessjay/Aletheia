import XCTest
@testable import Ingest

final class GreekNormalizeTests: XCTestCase {
    func testLowercases() {
        XCTAssertEqual(GreekNormalize.key("ΘΕΟΣ"), GreekNormalize.key("θεος"))
    }

    func testStripsTrailingPunctuation() {
        XCTAssertEqual(GreekNormalize.key("γῆν."), GreekNormalize.key("γῆν"))
        XCTAssertEqual(GreekNormalize.key("αὐτοῦ,"), GreekNormalize.key("αὐτοῦ"))
        XCTAssertEqual(GreekNormalize.key("ἀνθρώπου·"), GreekNormalize.key("ἀνθρώπου"))
    }

    func testStripsLeadingPunctuation() {
        XCTAssertEqual(GreekNormalize.key("«λόγος"), GreekNormalize.key("λόγος"))
    }

    func testCollapsesFinalSigma() {
        // Capital Σ at word end lowercases to σ (medial); we want it to match the
        // canonical ς form on the lowercase side. Diacritics are preserved on
        // both sides for the comparison to be meaningful.
        XCTAssertEqual(GreekNormalize.key("λόγος"), GreekNormalize.key("λόγοσ"))
        XCTAssertEqual(GreekNormalize.key("ΛΌΓΟΣ"), GreekNormalize.key("λόγος"))
    }

    func testNFCEqualsNFD() {
        // Pre-composed ά (U+03AC) vs decomposed α + ́ (U+03B1 + U+0301).
        let composed = "\u{03AC}"
        let decomposed = "\u{03B1}\u{0301}"
        XCTAssertEqual(GreekNormalize.key(composed), GreekNormalize.key(decomposed))
    }

    func testEmptyAndPunctOnlyReturnNil() {
        XCTAssertNil(GreekNormalize.key(""))
        XCTAssertNil(GreekNormalize.key("."))
        XCTAssertNil(GreekNormalize.key("·—,"))
        XCTAssertNil(GreekNormalize.key("123"))
    }

    func testKeepsInternalDiacritics() {
        // Accents and breathings are part of the surface identity per the design:
        // "ignoring morphology" doesn't mean "ignoring accent" — ἄνθρωπος and
        // ἀνθρώπου are different surface forms.
        XCTAssertNotEqual(GreekNormalize.key("ἄνθρωπος"), GreekNormalize.key("ἀνθρώπου"))
    }
}
