import Foundation

/// Reads the JSON produced by `tools/sword-extract/extract.py` and turns it
/// into per-chapter records the Pipeline can write as section rows.
///
/// The JSON is a flat array of per-verse comment entries:
///
///     [{"book": "Genesis", "osis": "Gen", "chapter": 1, "verse": 1,
///       "body": "…"}, …]
///
/// SWORD commentaries are verse-keyed: each entry is the commentary anchored
/// at one verse. This parser preserves that granularity — most entries become
/// one `comment`-kind section labeled "Verse N", in canonical order.
///
/// **Book front-matter promotion.** SWORD modules conventionally anchor a
/// book's title page, translator's preface, dedication, etc. at that book's
/// first verse (Genesis 1:1, Exodus 1:1, …). Calvin's Gen 1:1 entry is
/// ~35 KB of preface, JFB's is ~80 KB; rendering that as a "Verse 1"
/// comment is misleading because none of it is actual exegesis of Genesis
/// 1:1. When a chapter-1 verse-1 entry exceeds the heuristic threshold and
/// doesn't look like prose exegesis, the parser hoists it into the
/// `bookIntro` field so the Pipeline can emit it as the book-row body
/// instead of as a comment.
public struct SwordCommentaryParser {

    public struct ChapterContent {
        public let bookSlug: String
        public let chapter: Int
        public let comments: [Comment]
        /// Only non-nil on chapter==1 of a book whose v1 entry was promoted
        /// from a misleading "Verse 1" comment into a real book introduction.
        public let bookIntro: String?
    }

    public struct Comment {
        public let label: String      // "Verse N"
        public let verseStart: Int
        public let verseEnd: Int
        public let body: String
    }

    public init() {}

    /// Heuristic threshold above which a chapter-1 / verse-1 body is treated
    /// as book front matter rather than as actual verse-1 commentary.
    /// Calibration: Wesley's Gen 1:1 (actual exegesis) is ~1.9 KB; Calvin's
    /// (full preface) is ~35 KB. 8 KB clears short modern commentary blocks
    /// while catching every SWORD module's bundled front matter that I've
    /// observed in JFB / Calvin / Clarke.
    private static let frontMatterThreshold = 8000

    public func parse(fileURL: URL) throws -> [ChapterContent] {
        let data = try Data(contentsOf: fileURL)
        let raw = try JSONDecoder().decode([Entry].self, from: data)

        struct Key: Hashable { let slug: String; let chapter: Int }
        var comments: [Key: [Comment]] = [:]
        var bookIntros: [String: String] = [:]   // bookSlug → intro body

        for e in raw {
            let trimmed = e.body.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            // Prefer the OSIS id (stable, canonical) over the English name.
            guard let book = BookCatalog.byOSIS(e.osis) ?? BookCatalog.byOSIS(e.book) else { continue }

            // Front-matter detection: only chapter 1, verse 1, large body,
            // doesn't open with a verse-number anchor, AND opens with one of
            // the prefatory markers we know (CCEL banner, "Preface to..." /
            // "Introduction to..." / "THE AUTHOR'S EPISTLE DEDICATORY" / an
            // all-caps title-page header). Without that last guard, Calvin's
            // longer first-verse commentaries (Matt 1:1, Ezek 1:1, Dan 1:1,
            // Hag 1:1) would still be misclassified as book intros — they
            // open straight into exegesis, not preface prose.
            let looksLikeFrontMatter =
                e.chapter == 1 &&
                e.verse == 1 &&
                trimmed.count > Self.frontMatterThreshold &&
                !startsWithVerseAnchor(trimmed) &&
                hasFrontMatterMarkers(trimmed)

            if looksLikeFrontMatter {
                let cleaned = stripCCELBoilerplate(trimmed)
                let split = splitChapterFromBookIntro(cleaned, verse: e.verse)
                bookIntros[book.slug] = split.intro
                if let verseBody = split.verseCommentary {
                    // Reinstate the verse-1 commentary that was bundled into
                    // the SWORD module's front-matter entry, so it lands on
                    // the chapter view instead of the book-intro page.
                    let key = Key(slug: book.slug, chapter: e.chapter)
                    comments[key, default: []].append(Comment(
                        label: "Verse \(e.verse)",
                        verseStart: e.verse,
                        verseEnd: e.verse,
                        body: stripLeadingVerseNumber(verseBody, verse: e.verse)))
                }
                continue
            }

            let key = Key(slug: book.slug, chapter: e.chapter)
            comments[key, default: []].append(Comment(
                label: "Verse \(e.verse)",
                verseStart: e.verse,
                verseEnd: e.verse,
                body: stripLeadingVerseNumber(trimmed, verse: e.verse)))
        }

        var results: [ChapterContent] = []
        for (key, list) in comments {
            let sorted = list.sorted { $0.verseStart < $1.verseStart }
            // Attach the book intro to whichever chapter row covers ch 1,
            // since that's where the book-kind ingest writes its parent.
            let intro = key.chapter == 1 ? bookIntros[key.slug] : nil
            results.append(ChapterContent(
                bookSlug: key.slug, chapter: key.chapter,
                comments: sorted, bookIntro: intro))
        }

        // Books whose ONLY content was a book-intro at v1 (highly unlikely,
        // but defensible to handle) won't have a chapter-1 row in `comments`;
        // synthesize an empty chapter-1 carrier so the intro still lands.
        for (slug, intro) in bookIntros {
            let hasCh1 = results.contains { $0.bookSlug == slug && $0.chapter == 1 }
            if !hasCh1 {
                results.append(ChapterContent(
                    bookSlug: slug, chapter: 1, comments: [], bookIntro: intro))
            }
        }

        results.sort { lhs, rhs in
            let lo = BookCatalog.orderIndex(of: lhs.bookSlug)
            let ro = BookCatalog.orderIndex(of: rhs.bookSlug)
            if lo != ro { return lo < ro }
            return lhs.chapter < rhs.chapter
        }
        return results
    }

    /// Looks for a verse-number prefix like "1. ", "1 ", or "(1)" near the
    /// start of the body. Indicates the block opens with actual exegesis of
    /// verse 1 rather than with preface prose. Conservative — false positives
    /// are fine (means we keep the entry as a v1 comment, which is the
    /// status-quo behavior for short bodies anyway).
    /// CCEL's SWORD packagings of older PD commentaries prepend a title-page
    /// banner, and in Calvin's case stack TWO translator's prefaces (King 1847,
    /// Tymme 1578) before Calvin's own dedicatory letter. None of that is the
    /// author's intro to the book — strip it.
    ///
    /// Pass 1 ("CCEL banner"): drop everything up to and including the CCEL URL
    /// or "CHRISTIAN CLASSICS ETHEREAL LIBRARY" header.
    /// Pass 2 ("translator prefaces"): if the result still leads with a
    /// translator's preface, fast-forward to "THE AUTHOR'S EPISTLE DEDICATORY"
    /// (Calvin's own header, preserved by the SWORD flattening). Curly + straight
    /// apostrophe variants both checked.
    /// Idempotent: no marker present → no change.
    /// Does the body open with one of the prefatory headers we recognize?
    /// Tested against the first ~400 chars (after trimming). Anything that
    /// passes is treated as a candidate book intro; anything that fails is
    /// treated as ordinary verse-1 exegesis even when it's substantial.
    private func hasFrontMatterMarkers(_ body: String) -> Bool {
        let head = String(body.prefix(400)).trimmingCharacters(in: .whitespaces)
        let patterns = [
            #"^Preface\s+to\b"#,
            #"^Introduction\s+to\b"#,
            #"^PREFACE\b"#,
            #"^INTRODUCTION\b"#,
            #"^Translator['\u{2019}]s\s+Preface"#,
            #"^THE\s+AUTHOR['\u{2019}]S\s+EPISTLE"#,
            #"^TRANSLATED\s+FROM\b"#,
            #"^COMMENTARIES?\s+(?:ON|UPON)\b"#,
            #"^CHRISTIAN\s+CLASSICS\b"#,
            // Generic all-caps title-page run: 20+ uppercase letters before
            // the first lowercase one. Catches things like "COMMENTARIES ON
            // THE FIRST BOOK OF MOSES BY JOHN CALVIN TRANSLATED FROM…".
            #"^[A-Z][A-Z\s,'\u{2018}\u{2019}.&]{19,}"#,
        ]
        for p in patterns {
            if head.range(of: p, options: .regularExpression) != nil {
                return true
            }
        }
        return false
    }

    /// Calvin's Gen 1:1 SWORD entry actually packages three things in one
    /// blob: (1) the dedicatory epistle + author's argument (real book
    /// intro), (2) a "Chapter 1" header followed by every verse's English
    /// + Latin lemma for the whole chapter, and (3) Calvin's actual
    /// commentary on verse 1. The old code treated the whole thing as a
    /// book intro, leaving Verse 1 of Genesis with no commentary visible
    /// and the chapter-text lemmas crammed into the book-intro page.
    ///
    /// Split it: anything before a "Chapter N" line belongs in the book
    /// intro; the actual verse-N commentary is the first long paragraph
    /// inside the chapter section that starts with "N. " — the short
    /// lemma paragraphs that precede it (typically < 300 chars) are the
    /// English/Latin verse-text echoes, which we drop because the Bible
    /// reader column already carries that material.
    ///
    /// Returns `(intro, verseCommentary?)`. If no "Chapter N" header is
    /// found, the whole body stays in `intro` and `verseCommentary` is
    /// nil — same behavior as before this change.
    private func splitChapterFromBookIntro(
        _ body: String,
        verse: Int
    ) -> (intro: String, verseCommentary: String?) {
        // Find a "Chapter N" header followed by a paragraph break. The header
        // is sometimes buried at the end of a longer "byline" paragraph
        // ("…The Old Testament THE FIRST BOOK OF MOSES, CALLED GENESIS.
        // Commentary by Robert Jamieson CHAPTER 1\n\nGe 1:1, 2…") rather than
        // being on its own line, so we split at the previous paragraph
        // boundary, sending the entire byline paragraph downstream with the
        // chapter content rather than letting it leak into the book intro.
        guard let chapHeaderRange = body.range(
            of: #"(?i)\bChapter\s+\d+\.?\s*\n\n"#,
            options: .regularExpression
        ) else {
            return (body, nil)
        }
        let splitPoint: String.Index = {
            if let prevBreak = body.range(
                of: "\n\n",
                options: .backwards,
                range: body.startIndex..<chapHeaderRange.lowerBound
            ) {
                return prevBreak.upperBound
            }
            return chapHeaderRange.lowerBound
        }()
        let before = String(body[..<splitPoint])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let after = String(body[chapHeaderRange.upperBound...])
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // Step through paragraphs after the Chapter header. Two shapes we
        // need to handle:
        //
        //   Calvin: the chapter block opens with a long lemma list — every
        //   verse's English + Latin text echoed as short paragraphs ("1. In
        //   the beginning…", "1. In principio…", "2. And the earth…", …) —
        //   and Calvin's actual exegesis starts later with a long paragraph
        //   beginning with the target verse number. Skip past the lemma list.
        //
        //   JFB / Clarke: no lemma list; the chapter block dives straight
        //   into commentary, but the commentary itself is broken into short
        //   phrase-by-phrase paragraphs ("1. In the beginning--a period of
        //   remote and unknown antiquity…", "God--the name of the Supreme
        //   Being…"). There's no single long verse-N paragraph to find.
        //
        // Strategy: prefer the long-paragraph anchor; if none exists, fall
        // back to "everything after the chapter header" — which keeps the
        // JFB-style content as verse-1 commentary intact.
        let paragraphs = after.components(separatedBy: "\n\n")
        let verseHead = "\(verse)."
        let commentaryMinLen = 500
        var commentaryStartIdx: Int? = nil
        for (i, p) in paragraphs.enumerated() {
            let trimmed = p.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.hasPrefix(verseHead) && trimmed.count >= commentaryMinLen {
                commentaryStartIdx = i
                break
            }
        }
        let startIdx = commentaryStartIdx ?? skipLemmaList(paragraphs, verse: verse)
        let commentary = paragraphs[startIdx...]
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (
            before.isEmpty ? body : before,
            commentary.isEmpty ? nil : commentary
        )
    }

    /// Best-effort "where does the verse-1 commentary start" when there is
    /// no single long paragraph to anchor on. Walks paragraphs forward from
    /// the chapter header; a paragraph that is short (<200 chars) AND opens
    /// with `N.\s+` for ANY N looks like a lemma echo — skip it. The first
    /// paragraph that doesn't fit that shape begins the actual commentary.
    /// Falls back to 0 (entire chapter block) when nothing matches.
    private func skipLemmaList(_ paragraphs: [String], verse: Int) -> Int {
        let lemmaPattern = #"^\d+\.\s+\S"#
        for (i, p) in paragraphs.enumerated() {
            let trimmed = p.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count > 200 { return i }
            if trimmed.range(of: lemmaPattern, options: .regularExpression) == nil {
                return i
            }
        }
        return 0
    }

    private func stripCCELBoilerplate(_ body: String) -> String {
        var s = body
        if let r = s.range(of: "http://www.ccel.org") {
            s = String(s[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        } else if let r = s.range(of: "CHRISTIAN CLASSICS ETHEREAL LIBRARY") {
            s = String(s[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        for marker in ["THE AUTHOR\u{2019}S EPISTLE DEDICATORY", "THE AUTHOR'S EPISTLE DEDICATORY"] {
            if let r = s.range(of: marker) {
                s = String(s[r.lowerBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                break
            }
        }
        return s
    }

    /// Comments in SWORD modules customarily open with the verse number from
    /// the source's bold lemma marker: "2. And the earth was without form…"
    /// — but the UI already shows a "Verse N" label above each comment, so
    /// the bare leading number duplicates it. Strip the prefix only when the
    /// number matches the verse we know we're rendering.
    private func stripLeadingVerseNumber(_ body: String, verse: Int) -> String {
        let v = String(verse)
        for pattern in [
            #"^"# + v + #"\.\s+"#,   // "2. "
            #"^"# + v + #"\s+"#,      // "2 "
        ] {
            if let r = body.range(of: pattern, options: .regularExpression),
               r.lowerBound == body.startIndex {
                return String(body[r.upperBound...])
            }
        }
        return body
    }

    private func startsWithVerseAnchor(_ body: String) -> Bool {
        let head = body.prefix(120)
        // Examples that should match: "1. In the beginning", "1 In the…",
        // "(1) In the…", "Verse 1." Pattern: optional opener, the digit 1,
        // separator, then a capital letter starting the prose.
        let patterns = [
            #"^\s*1\.\s+[A-Z]"#,
            #"^\s*\(1\)\s+[A-Z]"#,
            #"^\s*Verse\s+1\b"#,
            #"^\s*Ver\.\s*1\b"#,
        ]
        for p in patterns {
            if head.range(of: p, options: .regularExpression) != nil {
                return true
            }
        }
        return false
    }

    private struct Entry: Decodable {
        let book: String
        let osis: String
        let chapter: Int
        let verse: Int
        let body: String
    }
}
