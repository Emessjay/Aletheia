import Foundation
import SwiftData

@Model
final class Library {
    @Attribute(.unique) var id: UUID
    var name: String
    var sortOrder: Int
    var createdAt: Date
    @Relationship(deleteRule: .cascade, inverse: \Bookmark.library) var bookmarks: [Bookmark] = []

    init(id: UUID = UUID(), name: String, sortOrder: Int = 0, createdAt: Date = .now) {
        self.id = id
        self.name = name
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

@Model
final class Bookmark {
    @Attribute(.unique) var id: UUID
    var library: Library?
    // VerseRef components stored as primitives so SwiftData/CloudKit can index them
    var workSlug: String
    var bookSlug: String
    var chapter: Int
    var verse: Int
    var note: String?
    var createdAt: Date

    init(id: UUID = UUID(), library: Library? = nil, ref: VerseRef, note: String? = nil, createdAt: Date = .now) {
        self.id = id
        self.library = library
        self.workSlug = ref.workSlug
        self.bookSlug = ref.bookSlug
        self.chapter = ref.chapter
        self.verse = ref.verse
        self.note = note
        self.createdAt = createdAt
    }

    var verseRef: VerseRef {
        VerseRef(workSlug: workSlug, bookSlug: bookSlug, chapter: chapter, verse: verse)
    }
}

enum HighlightColor: String, Codable, Sendable, CaseIterable {
    case yellow, green, blue, pink, purple, orange
}

@Model
final class Highlight {
    @Attribute(.unique) var id: UUID
    var workSlug: String
    var bookSlug: String
    var chapter: Int
    var verse: Int
    var colorRaw: String
    var translationKey: String?  // nil = applies across all translations
    var createdAt: Date

    init(id: UUID = UUID(), ref: VerseRef, color: HighlightColor, translationKey: String? = nil, createdAt: Date = .now) {
        self.id = id
        self.workSlug = ref.workSlug
        self.bookSlug = ref.bookSlug
        self.chapter = ref.chapter
        self.verse = ref.verse
        self.colorRaw = color.rawValue
        self.translationKey = translationKey
        self.createdAt = createdAt
    }

    var color: HighlightColor {
        HighlightColor(rawValue: colorRaw) ?? .yellow
    }

    var verseRef: VerseRef {
        VerseRef(workSlug: workSlug, bookSlug: bookSlug, chapter: chapter, verse: verse)
    }
}

@Model
final class Note {
    @Attribute(.unique) var id: UUID
    var workSlug: String
    var bookSlug: String
    var chapter: Int
    var verse: Int
    var body: String
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(), ref: VerseRef, body: String, createdAt: Date = .now, updatedAt: Date = .now) {
        self.id = id
        self.workSlug = ref.workSlug
        self.bookSlug = ref.bookSlug
        self.chapter = ref.chapter
        self.verse = ref.verse
        self.body = body
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var verseRef: VerseRef {
        VerseRef(workSlug: workSlug, bookSlug: bookSlug, chapter: chapter, verse: verse)
    }
}
