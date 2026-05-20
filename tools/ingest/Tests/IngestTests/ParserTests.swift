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

    func testCapturesParagraphLeadOnVerseStart() throws {
        let parser = USFMParser()
        // \p before v1 → v1.lead == "p"; v2 continues → nil; \p before v3 → "p"
        let usfm = """
        \\id GEN Genesis
        \\c 1
        \\p
        \\v 1 In the beginning God created the heavens and the earth.
        \\v 2 And the earth was without form, and void.
        \\p
        \\v 3 And God said, Let there be light: and there was light.
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.rows.count, 3)
        XCTAssertEqual(result.rows[0].lead, "p")
        XCTAssertNil(result.rows[1].lead)
        XCTAssertEqual(result.rows[2].lead, "p")
    }

    func testCapturesPoetryLeadAndNormalisesBareQ() throws {
        let parser = USFMParser()
        // \q (bare) should normalise to "q1"; \q2 stays "q2".
        let usfm = """
        \\id PSA Psalms
        \\c 1
        \\q
        \\v 1 Blessed is the man.
        \\q2
        \\v 2 But his delight is in the law.
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.rows.count, 2)
        XCTAssertEqual(result.rows[0].lead, "q1")
        XCTAssertEqual(result.rows[1].lead, "q2")
    }

    func testLeadResetsAtChapterBoundary() throws {
        let parser = USFMParser()
        let usfm = """
        \\id GEN Genesis
        \\c 1
        \\p
        \\v 1 First verse.
        \\c 2
        \\v 1 First verse of chapter 2 (no \\p marker before it).
        """
        let result = try parser.parse(text: usfm)
        XCTAssertEqual(result.rows.count, 2)
        XCTAssertEqual(result.rows[0].lead, "p")
        // No paragraph marker between \c 2 and its \v 1; lead should be nil
        // even though pendingLead lingered before \c 2 cleared it.
        XCTAssertNil(result.rows[1].lead)
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

final class SwordCommentaryParserTests: XCTestCase {
    /// Regression: Clarke's Gen 1:1 SWORD entry packs the book preface and
    /// the verse-1 commentary into one body, separated by a bare "Verse 1"
    /// label (no preceding "Chapter 1" banner — that's Calvin/JFB's shape).
    /// Before this fix the parser dumped everything into the book intro and
    /// dropped the verse-1 exegesis on the floor, so clicking Gen 1:1 in
    /// the reader showed no commentary.
    func testClarkeBareVerseLabelSplitsPrefaceFromCommentary() throws {
        let body = """
            Preface to the Book of Genesis

            \(String(repeating: "Lorem ipsum dolor sit amet. ", count: 400))

            Verse 1

            God in the beginning created the heavens and the earth - the actual exegesis paragraph runs here.
            """
        let json = """
            [{"book":"Genesis","osis":"Gen","chapter":1,"verse":1,"body":\(jsonString(body))}]
            """
        let chapters = try runParse(json: json)
        XCTAssertEqual(chapters.count, 1)
        let ch = chapters[0]
        XCTAssertEqual(ch.bookSlug, "gen")
        XCTAssertEqual(ch.chapter, 1)
        XCTAssertNotNil(ch.bookIntro, "preface should land in bookIntro")
        XCTAssertTrue(ch.bookIntro!.hasPrefix("Preface to the Book of Genesis"))
        XCTAssertFalse(ch.bookIntro!.contains("the actual exegesis"),
                       "verse-1 commentary leaked into bookIntro")
        XCTAssertEqual(ch.comments.count, 1, "verse-1 commentary should be reinstated")
        let c = ch.comments[0]
        XCTAssertEqual(c.label, "Verse 1")
        XCTAssertEqual(c.verseStart, 1)
        XCTAssertTrue(c.body.hasPrefix("God in the beginning"),
                      "bare 'Verse 1' label should be consumed; got: \(c.body.prefix(40))")
    }

    private func runParse(json: String) throws -> [SwordCommentaryParser.ChapterContent] {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("sword-test-\(UUID().uuidString).json")
        try json.data(using: .utf8)!.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        return try SwordCommentaryParser().parse(fileURL: url)
    }

    private func jsonString(_ s: String) -> String {
        let data = try! JSONEncoder().encode(s)
        return String(data: data, encoding: .utf8)!
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

final class ThMLHeadingTests: XCTestCase {
    // Trypho-style: chapter heading sits in <h3> outside <p>, body label echoes it verbatim.
    func testStripsTryphoChapterHeading() {
        let label = "Chapter I.—Introduction."
        let body = "Chapter I.—Introduction.\n\nWhile I was going about one morning in the walks of the Xystus, a certain man greeted me."
        let cleaned = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: label)
        XCTAssertEqual(cleaned, "While I was going about one morning in the walks of the Xystus, a certain man greeted me.")
    }

    // Incarnation-style: §N prefix on an italic summary paragraph, then prose.
    func testStripsParagraphMarkHeading() {
        let label = "Introductory. The subject of this treatise."
        let body = "On the Incarnation of the Word.\n\n————————————\n\n§1. Introductory. The subject of this treatise.\n\nWhereas in what precedes we have drawn out a sufficient account."
        let cleaned = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: label)
        XCTAssertEqual(cleaned, "Whereas in what precedes we have drawn out a sufficient account.")
    }

    // Confessions Book: title page is the whole body, label has the description.
    func testStripsBookTitlePageEntirely() {
        let label = "Commencing with the invocation of God, Augustin relates in detail the beginning of his life."
        let body = "Book I.\n\n————————————\n\nCommencing with the invocation of God, Augustin relates in detail the beginning of his life.\n\n————————————"
        let cleaned = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: label)
        XCTAssertEqual(cleaned, "")
    }

    // Discourses-against-Arians first chapter: work title + discourse title + rule + chapter heading + body.
    func testStripsCascadedDiscourseHeadings() {
        let label = "Introduction. Reason for writing."
        let body = "Four Discourses Against the Arians.\n\nDiscourse I.\n\n————————————\n\nChapter I.—Introduction. Reason for writing.\n\n1. Of all other heresies which have departed from the truth."
        let cleaned = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: label)
        XCTAssertEqual(cleaned, "1. Of all other heresies which have departed from the truth.")
    }

    // Real body starting with a quoted dialogue (commas, internal punctuation) must not be stripped.
    func testKeepsBodyOpeningWithDialogue() {
        let label = "Chapter II.—Justin describes his studies in philosophy."
        let body = "Chapter II.—Justin describes his studies in philosophy.\n\n“I will tell you,” said I, “what seems to me; for philosophy is the greatest possession.”"
        let cleaned = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: label)
        XCTAssertEqual(cleaned, "“I will tell you,” said I, “what seems to me; for philosophy is the greatest possession.”")
    }

    func testOrdinalOnlyLabelDetection() {
        XCTAssertTrue(ThMLParser.isOrdinalOnlyLabel("Discourse IV"))
        XCTAssertTrue(ThMLParser.isOrdinalOnlyLabel("Chapter 3."))
        XCTAssertTrue(ThMLParser.isOrdinalOnlyLabel("Book II"))
        XCTAssertTrue(ThMLParser.isOrdinalOnlyLabel(nil))
        XCTAssertTrue(ThMLParser.isOrdinalOnlyLabel(""))
        XCTAssertFalse(ThMLParser.isOrdinalOnlyLabel("Conclusion."))
        XCTAssertFalse(ThMLParser.isOrdinalOnlyLabel("Chapter I.—Introduction."))
        XCTAssertFalse(ThMLParser.isOrdinalOnlyLabel("He Proclaims the Greatness of God."))
    }

    func testHeadingSnippetFromSummary() {
        // "Discourse IV" section: descriptive content lives in the §§1–5 summary paragraph.
        let body = "Discourse IV.\n\n————————————\n\n§§1–5. The substantiality of the Word proved from Scripture. If the One Origin be substantial, Its Word is substantial."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertEqual(snippet, "The substantiality of the Word proved from Scripture")
    }

    func testHeadingSnippetFallsThroughToBody() {
        // No summary paragraph: snippet falls through to first sentence of prose.
        let body = "Chapter II.\n\n————————————\n\nGreat art Thou, O Lord, and greatly to be praised."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertEqual(snippet, "Great art Thou, O Lord, and greatly to be praised")
    }

    func testHeadingSnippetHandlesSectAbbreviation() {
        // Luther's Bondage of the Will: section bodies open with "Sect. XLI.—" fused
        // to the first sentence. The earlier snippet extractor stopped at the
        // period after "Sect" and synthesised the useless label "Section XLI. — Sect".
        let body = "Sect. XLI. — AND, first of all, let us begin regularly with your definition."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertEqual(snippet, "AND, first of all, let us begin regularly with your definition")
    }

    func testHeadingSnippetDoesNotTruncateAtCitationAbbreviation() {
        // Body of Sect. XLIII opens with "as Paul shews, out of Isaiah, (1 Cor. 2:9), …".
        // The period after "Cor" is an abbreviation, not a sentence boundary —
        // the snippet must read past it. (Total length is also capped at the
        // firstSentence `maxChars` limit, so very-long opening sentences are
        // truncated with an ellipsis rather than spilling 500+ chars into the
        // synthesized label.)
        let body = "Sect. XLIII. — BUT this life or salvation is an eternal matter, as Paul shews out of Isaiah (1 Cor. 2:9), which we cannot understand."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertNotNil(snippet)
        XCTAssertTrue(snippet?.contains("1 Cor. 2:9") == true, "snippet should retain the abbreviation; got: \(snippet ?? "nil")")
        XCTAssertTrue(snippet!.count <= 110, "snippet should be clamped to ~100 chars; got \(snippet!.count)")
    }

    func testHeadingSnippetStripsScripRefTokens() {
        // The ThML parser wraps each scripRef in paired {ref:PASSAGE}…{/ref}
        // tokens; neither the opener nor the closer belongs in synthesized
        // labels (and they could otherwise be truncated mid-token).
        let body = "Sect. XLVI. — FIRST of all, we have that of {ref:Ecclesiasticus xv. 14-17}Ecclesiasticus 15:14-17{/ref}, where it is written."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertTrue(snippet?.contains("{ref") == false, "snippet should not contain ref token; got: \(snippet ?? "nil")")
        XCTAssertTrue(snippet?.contains("{/ref") == false, "snippet should not contain ref closer; got: \(snippet ?? "nil")")
        XCTAssertTrue(snippet?.hasPrefix("FIRST of all, we have that of") == true, "got: \(snippet ?? "nil")")
    }

    func testStripLeadingRubricRemovesFusedSectPrefix() {
        let body = "Sect. XLI. — AND, first of all, let us begin regularly with your definition."
        let stripped = ThMLParser.stripLeadingRubric(from: body)
        XCTAssertEqual(stripped, "AND, first of all, let us begin regularly with your definition.")
    }

    func testStripLeadingRubricLeavesPlainProseAlone() {
        let body = "Great art Thou, O Lord, and greatly to be praised."
        let stripped = ThMLParser.stripLeadingRubric(from: body)
        XCTAssertEqual(stripped, body)
    }

    func testStripLeadingRubricLeavesMigneNumeralsAlone() {
        // "1. Great art Thou, O Lord" — bare numbered Migne marker, not a
        // structural rubric, must be preserved (it's how the body is
        // partitioned in Augustine, Athanasius, Chrysostom, …).
        let body = "1. Great art Thou, O Lord, and greatly to be praised."
        let stripped = ThMLParser.stripLeadingRubric(from: body)
        XCTAssertEqual(stripped, body)
    }

    func testHeadingSnippetSkipsStandaloneRomanNumeralParagraph() {
        // Tertullian's Apologeticum: the body opens with a standalone "I."
        // paragraph (Maurist section marker), then the prose. The earlier
        // snippet extractor read the "I." as a one-letter sentence and
        // produced labels like "Chapter I. — I.".
        let body = "I.\n\nWhat are we to think of it, that most people so blindly knock their heads."
        let snippet = ThMLParser.headingSnippet(from: body)
        XCTAssertEqual(snippet, "What are we to think of it, that most people so blindly knock their heads")
    }

    func testStripLeadingHeadingParagraphsMatchesLabelCaseInsensitively() {
        // ANF series-cover pages: label is "CLEMENT OF ROME" (all caps); the
        // body opens with the same words in title case. Without case-folding,
        // the duplicated heading paragraph isn't stripped. (The "Introductory
        // Note…" sub-heading is also a single-sentence title and is stripped
        // by the title heuristic — only the prose paragraph is meant to
        // survive.)
        let body = "Clement of Rome\n\nIntroductory Note.\n\n[a.d. 30–100.] Clement was probably a Gentile and a Roman."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "CLEMENT OF ROME")
        XCTAssertEqual(stripped, "[a.d. 30–100.] Clement was probably a Gentile and a Roman.")
    }

    func testStripsETextColophon() {
        // Luther sermon front-matter: a byline plus a publication-history
        // paragraph the volunteer transcriber pasted in. Real prose follows.
        let body = "by Martin Luther (1483-1546)\n\nThe following short sermon is taken from volume II of The Sermons of Martin Luther, published by Baker Book House (Grand Rapids, MI). This e-text was scanned and edited by Shane Rosenthal; it is in the public domain and may be copied and distributed without restriction.\n\n1. The Saviour himself explained this parable."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: nil)
        XCTAssertEqual(stripped, "1. The Saviour himself explained this parable.")
    }

    func testKeepsProseEvenWhenItMentionsOneColophonKeyword() {
        // "public domain" appears in running prose — must not strip.
        let body = "He spoke of those things which belong to the public domain of every Christian, things that all may learn and use."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: nil)
        XCTAssertEqual(stripped, body)
    }

    func testStripsAllCapsFragmentTitle() {
        // Luther sermons open with an ALL-CAPS pericope title above the Scripture
        // quotation. No comma/colon/period — pure fragment heading.
        let body = "THE DISCIPLES & THE FRUITS OF GOD\u{2019}S WORD\n\nAnd when much people were gathered, he spake by a parable."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "The Parable of the Sower")
        XCTAssertEqual(stripped, "And when much people were gathered, he spake by a parable.")
    }

    func testStripsColonTerminatedSermonTitle() {
        let body = "The Twofold Use of the Law & Gospel:\n\nby Martin Luther (1483-1546)\n\n2 Corinthians 3:4-11. And such confidence have we through Christ to Godward."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "The Twofold Use of the Law and Gospel")
        XCTAssertEqual(stripped, "2 Corinthians 3:4-11. And such confidence have we through Christ to Godward.")
    }

    func testStripsLeadingHorizontalRuleInOrigenIntro() {
        // ANF Origen intro: body opens with a horizontal rule, then a
        // bracketed-dates paragraph that continues into prose.
        let body = "————————————\n\n[a.d. 185–230–254.]  The reader will remember the rise and rapid development of the great Alexandrian school."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "Origen.")
        XCTAssertTrue(stripped.hasPrefix("[a.d."), "expected to keep the bracket-prefixed prose; got: \(stripped)")
    }

    func testStripsAllCapsTitleWithInternalComma() {
        let body = "ON FAITH AND COMING TO CHRIST, AND THE TRUE BREAD OF HEAVEN:\n\nNo man can come to me, except the Father which hath sent me draw him."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: nil)
        XCTAssertEqual(stripped, "No man can come to me, except the Father which hath sent me draw him.")
    }

    func testStripsTranslatorCreditLine() {
        // Augustine City of God opens with a translator credit line then a
        // "Translator's Preface." header, then a horizontal rule, then prose.
        let body = "Rev. Marcus Dods, D.D.\n\nTranslator’s Preface.\n\n————————————\n\n“Rome having been stormed and sacked by the Goths under Alaric their king, the worshippers of false gods…"
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "City of God")
        XCTAssertTrue(stripped.hasPrefix("“Rome having been stormed"), "got: \(stripped.prefix(80))")
    }

    func testCreditLineRequiresBothHonorificAndDegree() {
        // "Dr." alone in dialogue must not strip a real prose paragraph.
        let para = "Dr. Smith said that the truth would prevail, and we believe him."
        XCTAssertFalse(ThMLParser.isCreditLine(para))
    }

    func testStripsLutherSermonFullPreambleStack() {
        // Real Luther sermon body shape: byline → preamble → pericope heading →
        // scripture quotation. The first two should strip; the heading should
        // also strip; the scripture line stays.
        let body = "by Martin Luther (1483-1546)\n\nThe following short sermon is taken from volume II of The Sermons of Martin Luther, published by Baker Book House (Grand Rapids, MI). This e-text was scanned and edited by Shane Rosenthal; it is in the public domain and may be copied and distributed without restriction.\n\nTHE DISCIPLES & THE FRUITS OF GOD\u{2019}S WORD\n\nLUKE 8:4-15: And when much people were gathered, he spake by a parable."
        let stripped = ThMLParser.stripLeadingHeadingParagraphs(from: body, label: "The Parable of the Sower")
        XCTAssertEqual(stripped, "LUKE 8:4-15: And when much people were gathered, he spake by a parable.")
    }
}

final class SummaSubsectionTests: XCTestCase {
    func testStripsObjectionPrefix() {
        let body = "Objection 1: It seems that, besides philosophical science, we have no need of any further knowledge."
        let stripped = SummaParser.stripLeadingHeading(body, kind: "objection", number: 1)
        XCTAssertEqual(stripped, "It seems that, besides philosophical science, we have no need of any further knowledge.")
    }

    func testStripsReplyPrefix() {
        let body = "Reply to Objection 3: Although those things which are beyond man's knowledge…"
        let stripped = SummaParser.stripLeadingHeading(body, kind: "reply", number: 3)
        XCTAssertEqual(stripped, "Although those things which are beyond man's knowledge…")
    }

    func testStripsSedContraPrefix() {
        let body = "On the contrary, It is written: \"All Scripture is profitable.\""
        let stripped = SummaParser.stripLeadingHeading(body, kind: "sedcontra")
        XCTAssertEqual(stripped, "It is written: \"All Scripture is profitable.\"")
    }

    func testStripsRespondeoPrefix() {
        let body = "I answer that, It was necessary for man's salvation."
        let stripped = SummaParser.stripLeadingHeading(body, kind: "respondeo")
        XCTAssertEqual(stripped, "It was necessary for man's salvation.")
    }

    // Numbered prefixes must match the actual sub-section number, otherwise we'd
    // strip prose that happens to lead with a different objection's wording.
    func testLeavesBodyAloneWhenObjectionNumberMismatch() {
        let body = "Objection 2: Sciences are differentiated according to means."
        let stripped = SummaParser.stripLeadingHeading(body, kind: "objection", number: 1)
        XCTAssertEqual(stripped, body)
    }

    // Body without the formal opener (rare but possible) is left unchanged.
    func testLeavesBodyAloneWhenNoPrefix() {
        let body = "Sciences are differentiated according to means."
        let stripped = SummaParser.stripLeadingHeading(body, kind: "objection", number: 1)
        XCTAssertEqual(stripped, body)
    }
}
