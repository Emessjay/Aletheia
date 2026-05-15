import Foundation

enum Testament: String, Codable, Sendable {
    case old, deutero, new
}

enum CorpusLanguage: String, Codable, Sendable, CaseIterable {
    case hebrew = "he"
    case greek = "gk"
    case bsb = "en_bsb"
    case kjv = "en_kjv"
    case brenton = "en_brenton"
    case latin = "la"

    var displayName: String {
        switch self {
        case .hebrew:  return "Hebrew"
        case .greek:   return "Greek"
        case .bsb:     return "BSB"
        case .kjv:     return "KJV"
        case .brenton: return "Brenton"
        case .latin:   return "Latin"
        }
    }

    var isEnglish: Bool {
        switch self {
        case .bsb, .kjv, .brenton: return true
        default: return false
        }
    }
}

/// A stable, value-type pointer into the read-only corpus that survives DB rebuilds.
/// Used by SwiftData/CloudKit user records so highlights/bookmarks aren't tied to integer PKs.
struct VerseRef: Codable, Hashable, Sendable {
    var workSlug: String   // "bible" for all Scripture; patristic works use their own slug
    var bookSlug: String   // e.g. "gen", "john", "1mac"; for patristics this is the section ordinal path
    var chapter: Int
    var verse: Int

    var canonicalString: String {
        "\(workSlug):\(bookSlug):\(chapter):\(verse)"
    }
}

struct BookSummary: Identifiable, Hashable, Sendable {
    var slug: String           // "gen", "john"
    var name: String           // "Genesis"
    var abbreviation: String   // "Gen"
    var testament: Testament
    var chapterCount: Int

    var id: String { slug }
}

struct WorkSummary: Identifiable, Hashable, Sendable {
    var slug: String           // "summa", "trypho", "incarnation"
    var title: String
    var author: String
    var firstSectionPath: String

    var id: String { slug }
}

struct Verse: Identifiable, Sendable {
    var id: Int64
    var number: Int
    var text: String                        // may contain markup tokens (e.g. {strongs:G2316})
    var words: [WordToken]
}

struct WordToken: Sendable {
    var position: Int
    var surface: String           // visible token (Hebrew/Greek glyph or English word)
    var lemma: String?
    var strongs: String?          // "H6268" or "G2316"
    var morphology: String?
}

struct StrongsEntry: Identifiable, Sendable {
    var id: String                // "H6268" or "G2316"
    var lemma: String
    var transliteration: String?
    var gloss: String
    var definition: String        // full BDB / Thayer's-style definition (Markdown-ish or HTML)
    var kjvUsage: String?
}

struct CrossReference: Sendable {
    var fromRef: VerseRef
    var toRefStart: VerseRef
    var toRefEnd: VerseRef?
    var weight: Double            // OpenBible.info "votes"-derived score
}

struct PatristicSection: Identifiable, Sendable {
    var id: Int64
    var workSlug: String
    var ordinalPath: String       // e.g. "1.Q1.A1.respondeo", "trypho.31", "incarnation.32"
    var parentPath: String?
    var kind: String              // "part", "question", "article", "objection", "reply", "respondeo", "sedcontra", "chapter", "section"
    var label: String?            // human label, e.g. "Article 1", "Chapter 31"
    var bodyByLanguage: [CorpusLanguage: String]
}
