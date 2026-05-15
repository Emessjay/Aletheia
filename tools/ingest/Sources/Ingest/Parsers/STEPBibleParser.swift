import Foundation

/// Parses STEPBible TSV tables. STEPBible's current public release ships:
///   • **TAHOT** — Translators Amalgamated Hebrew OT (with Strong's + Grammar)
///   • **TAGNT** — Translators Amalgamated Greek NT (with Strong's + Grammar + base-text flags)
///
/// TAGOT (Greek LXX) and TKJVS (KJV English with Strong's) are not currently published as
/// standalone CC-BY tables in the upstream repo. The pipeline will skip them gracefully.
///
/// Column layouts differ between tables, so each gets a static column map indexed by
/// position. This is more robust than name-matching because the upstream files have
/// non-standard column titles and TAGNT has no explicit header row at all.
public struct STEPBibleParser {
    public enum Table {
        case tahot    // Hebrew OT
        case tagot    // Greek OT (LXX) — placeholder; not currently published in this format
        case tagnt    // Greek NT
        case tkjvs    // KJV with Strong's — placeholder

        var language: String {
            switch self {
            case .tahot: return "he"
            case .tagot, .tagnt: return "gk"
            case .tkjvs: return "en_kjv"
            }
        }
    }

    public let table: Table
    public init(table: Table) { self.table = table }

    public struct Word {
        public let bookSlug: String
        public let chapter: Int
        public let verse: Int
        public let position: Int
        public let surface: String
        public let lemma: String?
        public let strongs: String?       // 'H6268' or 'G2316'
        public let morphology: String?
        public let baseText: String?      // TAGNT only
    }

    /// Per-table column index map. Indices are 0-based positions in the tab-delimited row.
    private struct ColumnMap {
        let reference: Int
        let surface: Int
        let strongs: Int
        let morphology: Int
        let lemma: Int?
        let sourceFlags: Int?     // TAGNT base-text variant column
    }

    private var columnMap: ColumnMap {
        switch table {
        case .tahot:
            // Header (line 82 in Gen-Deu file):
            // Eng (Heb) Ref & Type | Hebrew | Transliteration | Translation | dStrongs | Grammar |
            //   Meaning Variants | Spelling Variants | Root dStrong+Instance | …
            return ColumnMap(reference: 0, surface: 1, strongs: 4, morphology: 5, lemma: 8, sourceFlags: nil)
        case .tagnt:
            // No header row in the data section; columns observed in the wild:
            // 0: NN_Book.Chap.Verse  (e.g. 41_Mat.001.001)
            // 1: variant flag (e.g. "=NA same TR ~~")
            // 2: Greek surface
            // 3: English translation
            // 4: Strong's (e.g. G0976)
            // 5: morphology code (e.g. N-NSF)
            // 6: lemma
            // 7: gloss
            // 8: source flags (NA28+Tyn+SBL+WH+Treg+TR+Byz+NIV)
            return ColumnMap(reference: 0, surface: 2, strongs: 4, morphology: 5, lemma: 6, sourceFlags: 8)
        case .tagot, .tkjvs:
            // Not currently published. Sensible defaults so the parser is callable.
            return ColumnMap(reference: 0, surface: 1, strongs: 4, morphology: 5, lemma: 8, sourceFlags: nil)
        }
    }

    public func parse(fileURL: URL) throws -> [Word] {
        let content = try String(contentsOf: fileURL, encoding: .utf8)
        return parse(text: content)
    }

    public func parse(text: String) -> [Word] {
        let map = columnMap
        var rows: [Word] = []
        rows.reserveCapacity(50_000)

        // STEPBible publishes some files with CRLF (e.g. TAGNT Act-Rev). Normalize so the
        // `\n` split doesn't leave a trailing `\r` on every cell.
        let normalized = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        for rawLine in normalized.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
            // Skip preamble, blanks, comments, and re-listed header rows.
            if line.isEmpty { continue }
            if line.hasPrefix("#") { continue }
            if line.hasPrefix("Eng ") { continue }
            if line.hasPrefix("Translators") { continue }
            if line.hasPrefix("TAHOT") || line.hasPrefix("TAGNT") { continue }
            // Quick reject: a data row must contain a tab plus a reference-like pattern.
            guard line.contains("\t") else { continue }

            let cells = line.components(separatedBy: "\t")
            guard cells.count > map.surface else { continue }
            guard let parsed = parseReference(cells[map.reference]) else { continue }
            let surface = cellAt(cells, map.surface)
            let strongs = cellAt(cells, map.strongs).flatMap(normalizeStrongs)
            let morph = cellAt(cells, map.morphology)
            let lemma = map.lemma.flatMap { cellAt(cells, $0) }
            let baseText = map.sourceFlags.flatMap { cellAt(cells, $0) }

            rows.append(Word(
                bookSlug: parsed.slug, chapter: parsed.chapter, verse: parsed.verse,
                position: parsed.position,
                surface: surface ?? "",
                lemma: (lemma?.isEmpty == false) ? lemma : nil,
                strongs: strongs,
                morphology: (morph?.isEmpty == false) ? morph : nil,
                baseText: (baseText?.isEmpty == false) ? baseText : nil
            ))
        }
        return rows
    }

    private func cellAt(_ cells: [String], _ idx: Int) -> String? {
        guard cells.indices.contains(idx) else { return nil }
        let v = cells[idx].trimmingCharacters(in: .whitespaces)
        return v.isEmpty ? nil : v
    }

    /// Parses STEPBible-style references in either format:
    ///   - TAHOT:  `Gen.1.1#01=L`           — bare OSIS, optional `#NN` word index, `=L/=Q/=K` variant suffix
    ///   - TAGNT:  `41_Mat.001.001`         — prefixed with book number, zero-padded
    private struct ParsedRef { let slug: String; let chapter: Int; let verse: Int; let position: Int }

    private func parseReference(_ raw: String) -> ParsedRef? {
        // Strip variant suffix (`=L`, `=NA same TR`, etc.) by splitting at the first `=`.
        let beforeEq = raw.split(separator: "=", maxSplits: 1).first.map(String.init) ?? raw
        // Strip the `#NN` word-position marker, but capture it.
        let parts = beforeEq.split(separator: "#", maxSplits: 1)
        let refCore = String(parts[0])
        let position: Int = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0

        // Normalize TAGNT prefix `41_Mat.001.001` → `Mat.1.1`
        var refClean = refCore
        if let underscore = refClean.firstIndex(of: "_"), refClean.prefix(upTo: underscore).allSatisfy(\.isNumber) {
            refClean = String(refClean[refClean.index(after: underscore)...])
        }

        let dotParts = refClean.split(separator: ".")
        guard dotParts.count >= 3 else { return nil }
        let osisRaw = String(dotParts[0])
        let osis = osisToCatalogID(osisRaw)
        guard let chapter = Int(dotParts[1]), let verse = Int(dotParts[2]) else { return nil }
        guard let book = BookCatalog.byOSIS(osis) else { return nil }
        return ParsedRef(slug: book.slug, chapter: chapter, verse: verse, position: position)
    }

    /// Map STEPBible's OSIS-ish codes to the codes in our BookCatalog. STEPBible uses several
    /// codes that differ from canonical OSIS (e.g. "Mat" rather than "Matt"; "Sng" not "Song";
    /// "Phm" not "Phlm"). Extend this as we encounter more.
    private func osisToCatalogID(_ s: String) -> String {
        // STEPBible's 3-letter codes vs our 4-letter OSIS catalog IDs.
        // Built from the actual codes observed in TAHOT (OT) and TAGNT (NT).
        switch s {
        // Pentateuch
        case "Gen": return "Gen"
        case "Exo": return "Exod"
        case "Lev": return "Lev"
        case "Num": return "Num"
        case "Deu": return "Deut"
        // Historical
        case "Jos": return "Josh"
        case "Jdg": return "Judg"
        case "Rut": return "Ruth"
        case "1Sa": return "1Sam"
        case "2Sa": return "2Sam"
        case "1Ki": return "1Kgs"
        case "2Ki": return "2Kgs"
        case "1Ch": return "1Chr"
        case "2Ch": return "2Chr"
        case "Ezr": return "Ezra"
        case "Neh": return "Neh"
        case "Est": return "Esth"
        // Wisdom
        case "Job": return "Job"
        case "Psa": return "Ps"
        case "Pro": return "Prov"
        case "Ecc": return "Eccl"
        case "Sng": return "Song"
        // Prophets
        case "Isa": return "Isa"
        case "Jer": return "Jer"
        case "Lam": return "Lam"
        case "Ezk": return "Ezek"
        case "Dan": return "Dan"
        // Minor prophets
        case "Hos": return "Hos"
        case "Jol", "Joe": return "Joel"
        case "Amo": return "Amos"
        case "Oba": return "Obad"
        case "Jon": return "Jonah"
        case "Mic": return "Mic"
        case "Nam": return "Nah"
        case "Hab": return "Hab"
        case "Zep": return "Zeph"
        case "Hag": return "Hag"
        case "Zec": return "Zech"
        case "Mal": return "Mal"
        // NT — gospels & Acts
        case "Mat": return "Matt"
        case "Mrk": return "Mark"
        case "Luk": return "Luke"
        case "Jhn": return "John"
        case "Act": return "Acts"
        // Paulines
        case "Rom": return "Rom"
        case "1Co": return "1Cor"
        case "2Co": return "2Cor"
        case "Gal": return "Gal"
        case "Eph": return "Eph"
        case "Php": return "Phil"
        case "Col": return "Col"
        case "1Th": return "1Thess"
        case "2Th": return "2Thess"
        case "1Ti": return "1Tim"
        case "2Ti": return "2Tim"
        case "Tit": return "Titus"
        case "Phm": return "Phlm"
        case "Heb": return "Heb"
        // General
        case "Jas": return "Jas"
        case "1Pe": return "1Pet"
        case "2Pe": return "2Pet"
        case "1Jn": return "1John"
        case "2Jn": return "2John"
        case "3Jn": return "3John"
        case "Jud": return "Jude"
        case "Rev": return "Rev"
        default: return s
        }
    }

    private func normalizeStrongs(_ raw: String) -> String? {
        // Strong's in STEPBible can be a slash-separated list or wrapped in {}: e.g. `H9003/{H7225G}`.
        // Take the first H/G + digits run we encounter.
        var trimmed = raw.replacingOccurrences(of: "{", with: "").replacingOccurrences(of: "}", with: "")
        if let slash = trimmed.firstIndex(of: "/") { trimmed = String(trimmed[..<slash]) }
        guard let first = trimmed.first(where: { $0 == "H" || $0 == "G" }) else { return nil }
        let prefixIdx = trimmed.firstIndex(of: first)!
        let after = trimmed[trimmed.index(after: prefixIdx)...]
        let digits = after.prefix(while: { $0.isNumber })
        guard !digits.isEmpty else { return nil }
        return String(first) + String(digits)
    }
}
