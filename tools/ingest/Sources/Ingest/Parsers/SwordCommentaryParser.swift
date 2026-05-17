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

            // Front-matter detection: only chapter 1, verse 1, large body
            // that doesn't open with a verse-number anchor like "1. ".
            let looksLikeFrontMatter =
                e.chapter == 1 &&
                e.verse == 1 &&
                trimmed.count > Self.frontMatterThreshold &&
                !startsWithVerseAnchor(trimmed)

            if looksLikeFrontMatter {
                bookIntros[book.slug] = stripCCELBoilerplate(trimmed)
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
