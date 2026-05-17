import Foundation

/// Canonical book metadata. Stable slugs are the join key for all parsers.
/// Ordering reflects the Protestant + Catholic deutero arrangement used in most LXX editions.
public struct CanonBook: Sendable {
    public let slug: String
    public let name: String
    public let abbreviation: String
    public let testament: String       // "old" | "deutero" | "new"
    public let canon: String           // "protestant" | "deutero"
    public let osisID: String          // e.g. "Gen" — matches USFM/OSIS book codes
    public let usfmID: String          // 3-letter USFM, e.g. "GEN"

    public init(slug: String, name: String, abbreviation: String, testament: String, canon: String, osisID: String, usfmID: String) {
        self.slug = slug; self.name = name; self.abbreviation = abbreviation
        self.testament = testament; self.canon = canon
        self.osisID = osisID; self.usfmID = usfmID
    }
}

public enum BookCatalog {
    public static let all: [CanonBook] = ot + deutero + nt

    public static let ot: [CanonBook] = [
        .init(slug: "gen",  name: "Genesis",        abbreviation: "Gen",  testament: "old", canon: "protestant", osisID: "Gen", usfmID: "GEN"),
        .init(slug: "exod", name: "Exodus",         abbreviation: "Exod", testament: "old", canon: "protestant", osisID: "Exod", usfmID: "EXO"),
        .init(slug: "lev",  name: "Leviticus",      abbreviation: "Lev",  testament: "old", canon: "protestant", osisID: "Lev", usfmID: "LEV"),
        .init(slug: "num",  name: "Numbers",        abbreviation: "Num",  testament: "old", canon: "protestant", osisID: "Num", usfmID: "NUM"),
        .init(slug: "deut", name: "Deuteronomy",    abbreviation: "Deut", testament: "old", canon: "protestant", osisID: "Deut", usfmID: "DEU"),
        .init(slug: "josh", name: "Joshua",         abbreviation: "Josh", testament: "old", canon: "protestant", osisID: "Josh", usfmID: "JOS"),
        .init(slug: "judg", name: "Judges",         abbreviation: "Judg", testament: "old", canon: "protestant", osisID: "Judg", usfmID: "JDG"),
        .init(slug: "ruth", name: "Ruth",           abbreviation: "Ruth", testament: "old", canon: "protestant", osisID: "Ruth", usfmID: "RUT"),
        .init(slug: "1sam", name: "1 Samuel",       abbreviation: "1Sam", testament: "old", canon: "protestant", osisID: "1Sam", usfmID: "1SA"),
        .init(slug: "2sam", name: "2 Samuel",       abbreviation: "2Sam", testament: "old", canon: "protestant", osisID: "2Sam", usfmID: "2SA"),
        .init(slug: "1kgs", name: "1 Kings",        abbreviation: "1Kgs", testament: "old", canon: "protestant", osisID: "1Kgs", usfmID: "1KI"),
        .init(slug: "2kgs", name: "2 Kings",        abbreviation: "2Kgs", testament: "old", canon: "protestant", osisID: "2Kgs", usfmID: "2KI"),
        .init(slug: "1chr", name: "1 Chronicles",   abbreviation: "1Chr", testament: "old", canon: "protestant", osisID: "1Chr", usfmID: "1CH"),
        .init(slug: "2chr", name: "2 Chronicles",   abbreviation: "2Chr", testament: "old", canon: "protestant", osisID: "2Chr", usfmID: "2CH"),
        .init(slug: "ezra", name: "Ezra",           abbreviation: "Ezra", testament: "old", canon: "protestant", osisID: "Ezra", usfmID: "EZR"),
        .init(slug: "neh",  name: "Nehemiah",       abbreviation: "Neh",  testament: "old", canon: "protestant", osisID: "Neh",  usfmID: "NEH"),
        .init(slug: "esth", name: "Esther",         abbreviation: "Esth", testament: "old", canon: "protestant", osisID: "Esth", usfmID: "EST"),
        .init(slug: "job",  name: "Job",            abbreviation: "Job",  testament: "old", canon: "protestant", osisID: "Job",  usfmID: "JOB"),
        .init(slug: "ps",   name: "Psalms",         abbreviation: "Ps",   testament: "old", canon: "protestant", osisID: "Ps",   usfmID: "PSA"),
        .init(slug: "prov", name: "Proverbs",       abbreviation: "Prov", testament: "old", canon: "protestant", osisID: "Prov", usfmID: "PRO"),
        .init(slug: "eccl", name: "Ecclesiastes",   abbreviation: "Eccl", testament: "old", canon: "protestant", osisID: "Eccl", usfmID: "ECC"),
        .init(slug: "song", name: "Song of Songs",  abbreviation: "Song", testament: "old", canon: "protestant", osisID: "Song", usfmID: "SNG"),
        .init(slug: "isa",  name: "Isaiah",         abbreviation: "Isa",  testament: "old", canon: "protestant", osisID: "Isa",  usfmID: "ISA"),
        .init(slug: "jer",  name: "Jeremiah",       abbreviation: "Jer",  testament: "old", canon: "protestant", osisID: "Jer",  usfmID: "JER"),
        .init(slug: "lam",  name: "Lamentations",   abbreviation: "Lam",  testament: "old", canon: "protestant", osisID: "Lam",  usfmID: "LAM"),
        .init(slug: "ezek", name: "Ezekiel",        abbreviation: "Ezek", testament: "old", canon: "protestant", osisID: "Ezek", usfmID: "EZK"),
        .init(slug: "dan",  name: "Daniel",         abbreviation: "Dan",  testament: "old", canon: "protestant", osisID: "Dan",  usfmID: "DAN"),
        .init(slug: "hos",  name: "Hosea",          abbreviation: "Hos",  testament: "old", canon: "protestant", osisID: "Hos",  usfmID: "HOS"),
        .init(slug: "joel", name: "Joel",           abbreviation: "Joel", testament: "old", canon: "protestant", osisID: "Joel", usfmID: "JOL"),
        .init(slug: "amos", name: "Amos",           abbreviation: "Amos", testament: "old", canon: "protestant", osisID: "Amos", usfmID: "AMO"),
        .init(slug: "obad", name: "Obadiah",        abbreviation: "Obad", testament: "old", canon: "protestant", osisID: "Obad", usfmID: "OBA"),
        .init(slug: "jonah", name: "Jonah",         abbreviation: "Jonah", testament: "old", canon: "protestant", osisID: "Jonah", usfmID: "JON"),
        .init(slug: "mic",  name: "Micah",          abbreviation: "Mic",  testament: "old", canon: "protestant", osisID: "Mic",  usfmID: "MIC"),
        .init(slug: "nah",  name: "Nahum",          abbreviation: "Nah",  testament: "old", canon: "protestant", osisID: "Nah",  usfmID: "NAM"),
        .init(slug: "hab",  name: "Habakkuk",       abbreviation: "Hab",  testament: "old", canon: "protestant", osisID: "Hab",  usfmID: "HAB"),
        .init(slug: "zeph", name: "Zephaniah",      abbreviation: "Zeph", testament: "old", canon: "protestant", osisID: "Zeph", usfmID: "ZEP"),
        .init(slug: "hag",  name: "Haggai",         abbreviation: "Hag",  testament: "old", canon: "protestant", osisID: "Hag",  usfmID: "HAG"),
        .init(slug: "zech", name: "Zechariah",      abbreviation: "Zech", testament: "old", canon: "protestant", osisID: "Zech", usfmID: "ZEC"),
        .init(slug: "mal",  name: "Malachi",        abbreviation: "Mal",  testament: "old", canon: "protestant", osisID: "Mal",  usfmID: "MAL")
    ]

    /// Deuterocanonical books in KJV 1611 reading order, with the Eastern
    /// Orthodox additions (3 Macc, 4 Macc, Psalm 151) appended at the end.
    /// Placed after the NT in the reader (order_index 300+) — see `orderIndex(of:)`.
    public static let deutero: [CanonBook] = [
        .init(slug: "1es",   name: "1 Esdras",              abbreviation: "1Esd",  testament: "deutero", canon: "deutero", osisID: "1Esd",   usfmID: "1ES"),
        .init(slug: "2es",   name: "2 Esdras",              abbreviation: "2Esd",  testament: "deutero", canon: "deutero", osisID: "2Esd",   usfmID: "2ES"),
        .init(slug: "tob",   name: "Tobit",                 abbreviation: "Tob",   testament: "deutero", canon: "deutero", osisID: "Tob",    usfmID: "TOB"),
        .init(slug: "jdt",   name: "Judith",                abbreviation: "Jdt",   testament: "deutero", canon: "deutero", osisID: "Jdt",    usfmID: "JDT"),
        .init(slug: "wis",   name: "Wisdom of Solomon",     abbreviation: "Wis",   testament: "deutero", canon: "deutero", osisID: "Wis",    usfmID: "WIS"),
        .init(slug: "sir",   name: "Sirach",                abbreviation: "Sir",   testament: "deutero", canon: "deutero", osisID: "Sir",    usfmID: "SIR"),
        .init(slug: "bar",   name: "Baruch",                abbreviation: "Bar",   testament: "deutero", canon: "deutero", osisID: "Bar",    usfmID: "BAR"),
        .init(slug: "lje",   name: "Letter of Jeremiah",    abbreviation: "EpJer", testament: "deutero", canon: "deutero", osisID: "EpJer",  usfmID: "LJE"),
        .init(slug: "s3y",   name: "Song of the Three",     abbreviation: "S3Y",   testament: "deutero", canon: "deutero", osisID: "PrAzar", usfmID: "S3Y"),
        .init(slug: "sus",   name: "Susanna",               abbreviation: "Sus",   testament: "deutero", canon: "deutero", osisID: "Sus",    usfmID: "SUS"),
        .init(slug: "bel",   name: "Bel and the Dragon",    abbreviation: "Bel",   testament: "deutero", canon: "deutero", osisID: "Bel",    usfmID: "BEL"),
        .init(slug: "man",   name: "Prayer of Manasseh",    abbreviation: "PrMan", testament: "deutero", canon: "deutero", osisID: "PrMan",  usfmID: "MAN"),
        .init(slug: "1mac",  name: "1 Maccabees",           abbreviation: "1Mac",  testament: "deutero", canon: "deutero", osisID: "1Macc",  usfmID: "1MA"),
        .init(slug: "2mac",  name: "2 Maccabees",           abbreviation: "2Mac",  testament: "deutero", canon: "deutero", osisID: "2Macc",  usfmID: "2MA"),
        .init(slug: "3mac",  name: "3 Maccabees",           abbreviation: "3Mac",  testament: "deutero", canon: "deutero", osisID: "3Macc",  usfmID: "3MA"),
        .init(slug: "4mac",  name: "4 Maccabees",           abbreviation: "4Mac",  testament: "deutero", canon: "deutero", osisID: "4Macc",  usfmID: "4MA"),
        .init(slug: "ps151", name: "Psalm 151",             abbreviation: "Ps151", testament: "deutero", canon: "deutero", osisID: "AddPs",  usfmID: "PS2")
    ]

    public static let nt: [CanonBook] = [
        .init(slug: "matt", name: "Matthew",        abbreviation: "Matt", testament: "new", canon: "protestant", osisID: "Matt", usfmID: "MAT"),
        .init(slug: "mark", name: "Mark",           abbreviation: "Mark", testament: "new", canon: "protestant", osisID: "Mark", usfmID: "MRK"),
        .init(slug: "luke", name: "Luke",           abbreviation: "Luke", testament: "new", canon: "protestant", osisID: "Luke", usfmID: "LUK"),
        .init(slug: "john", name: "John",           abbreviation: "John", testament: "new", canon: "protestant", osisID: "John", usfmID: "JHN"),
        .init(slug: "acts", name: "Acts",           abbreviation: "Acts", testament: "new", canon: "protestant", osisID: "Acts", usfmID: "ACT"),
        .init(slug: "rom",  name: "Romans",         abbreviation: "Rom",  testament: "new", canon: "protestant", osisID: "Rom",  usfmID: "ROM"),
        .init(slug: "1cor", name: "1 Corinthians",  abbreviation: "1Cor", testament: "new", canon: "protestant", osisID: "1Cor", usfmID: "1CO"),
        .init(slug: "2cor", name: "2 Corinthians",  abbreviation: "2Cor", testament: "new", canon: "protestant", osisID: "2Cor", usfmID: "2CO"),
        .init(slug: "gal",  name: "Galatians",      abbreviation: "Gal",  testament: "new", canon: "protestant", osisID: "Gal",  usfmID: "GAL"),
        .init(slug: "eph",  name: "Ephesians",      abbreviation: "Eph",  testament: "new", canon: "protestant", osisID: "Eph",  usfmID: "EPH"),
        .init(slug: "phil", name: "Philippians",    abbreviation: "Phil", testament: "new", canon: "protestant", osisID: "Phil", usfmID: "PHP"),
        .init(slug: "col",  name: "Colossians",     abbreviation: "Col",  testament: "new", canon: "protestant", osisID: "Col",  usfmID: "COL"),
        .init(slug: "1thes", name: "1 Thessalonians", abbreviation: "1Thes", testament: "new", canon: "protestant", osisID: "1Thess", usfmID: "1TH"),
        .init(slug: "2thes", name: "2 Thessalonians", abbreviation: "2Thes", testament: "new", canon: "protestant", osisID: "2Thess", usfmID: "2TH"),
        .init(slug: "1tim", name: "1 Timothy",      abbreviation: "1Tim", testament: "new", canon: "protestant", osisID: "1Tim", usfmID: "1TI"),
        .init(slug: "2tim", name: "2 Timothy",      abbreviation: "2Tim", testament: "new", canon: "protestant", osisID: "2Tim", usfmID: "2TI"),
        .init(slug: "titus", name: "Titus",         abbreviation: "Titus", testament: "new", canon: "protestant", osisID: "Titus", usfmID: "TIT"),
        .init(slug: "phlm", name: "Philemon",       abbreviation: "Phlm", testament: "new", canon: "protestant", osisID: "Phlm", usfmID: "PHM"),
        .init(slug: "heb",  name: "Hebrews",        abbreviation: "Heb",  testament: "new", canon: "protestant", osisID: "Heb",  usfmID: "HEB"),
        .init(slug: "jas",  name: "James",          abbreviation: "Jas",  testament: "new", canon: "protestant", osisID: "Jas",  usfmID: "JAS"),
        .init(slug: "1pet", name: "1 Peter",        abbreviation: "1Pet", testament: "new", canon: "protestant", osisID: "1Pet", usfmID: "1PE"),
        .init(slug: "2pet", name: "2 Peter",        abbreviation: "2Pet", testament: "new", canon: "protestant", osisID: "2Pet", usfmID: "2PE"),
        .init(slug: "1john", name: "1 John",        abbreviation: "1John", testament: "new", canon: "protestant", osisID: "1John", usfmID: "1JN"),
        .init(slug: "2john", name: "2 John",        abbreviation: "2John", testament: "new", canon: "protestant", osisID: "2John", usfmID: "2JN"),
        .init(slug: "3john", name: "3 John",        abbreviation: "3John", testament: "new", canon: "protestant", osisID: "3John", usfmID: "3JN"),
        .init(slug: "jude", name: "Jude",           abbreviation: "Jude", testament: "new", canon: "protestant", osisID: "Jude", usfmID: "JUD"),
        .init(slug: "rev",  name: "Revelation",     abbreviation: "Rev",  testament: "new", canon: "protestant", osisID: "Rev",  usfmID: "REV")
    ]

    /// Canonical order index — OT then NT then deuterocanon, with the
    /// deuterocanonical books appearing after Revelation so the reader treats
    /// them as an appendix in KJV 1611 reading order.
    public static func orderIndex(of slug: String) -> Int {
        if let i = ot.firstIndex(where: { $0.slug == slug }) { return i }
        if let i = nt.firstIndex(where: { $0.slug == slug }) { return 200 + i }
        if let i = deutero.firstIndex(where: { $0.slug == slug }) { return 300 + i }
        return 999
    }

    private static let osisIndex: [String: CanonBook] = Dictionary(uniqueKeysWithValues: all.map { ($0.osisID, $0) })
    private static let usfmIndex: [String: CanonBook] = Dictionary(uniqueKeysWithValues: all.map { ($0.usfmID, $0) })
    private static let slugIndex: [String: CanonBook] = Dictionary(uniqueKeysWithValues: all.map { ($0.slug, $0) })

    // USFM aliases for LXX-only book codes that map onto Hebrew-canon slugs.
    // Brenton's Greek LXX uses DAG (Theodotion Daniel + additions) and ESG
    // (Greek Esther); both should land under the same slug as their Hebrew
    // counterparts so the reader shows the LXX text in the Greek column.
    private static let usfmAliases: [String: String] = [
        "DAG": "DAN",
        "ESG": "EST",
    ]

    public static func byOSIS(_ id: String) -> CanonBook? { osisIndex[id] }
    public static func byUSFM(_ id: String) -> CanonBook? {
        if let b = usfmIndex[id] { return b }
        if let target = usfmAliases[id] { return usfmIndex[target] }
        return nil
    }
    public static func bySlug(_ slug: String) -> CanonBook? { slugIndex[slug] }
}
