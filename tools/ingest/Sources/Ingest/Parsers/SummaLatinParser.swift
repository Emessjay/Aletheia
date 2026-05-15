import Foundation

/// Parses Geremia/AquinasOperaOmnia's bilingual Latin-English Summa Theologica.
///
/// Source: https://github.com/Geremia/AquinasOperaOmnia (mirror of dhspriory.org/thomas/)
///
/// Layout per file (e.g. `FP/FP001.html`):
///   - One file per Question
///   - Each Article begins with an `<h3>` containing the question text
///   - Each Article body is a `<table>` whose rows have two cells:
///       left `<td>`  = Latin paragraph
///       right `<td>` = English paragraph
///   - Paragraphs within an article are conventionally: Objections, Sed Contra,
///     Respondeo, Replies. We split by recognizable Latin opening phrases.
///
/// Output keys this against the same ordinal_path scheme produced by
/// ``SummaParser`` (Jacob-Gray/summa.json), so language toggling works at the
/// article-paragraph level for the leaf sections that align reliably:
///     summa.FP.Q1.A1.obj1, summa.FP.Q1.A1.sedcontra,
///     summa.FP.Q1.A1.respondeo, summa.FP.Q1.A1.rep1, …
public struct SummaLatinParser {
    public init() {}

    public struct Section {
        public let ordinalPath: String
        public let body: String
    }

    /// Parse every HTML file in the given root (which should contain `FP/`, `FS/`, etc.).
    public func parse(rootDirectory: URL) throws -> [Section] {
        let partDirs = ["FP", "FS", "SS", "TP", "X1", "X2", "XP"]
        var all: [Section] = []
        for part in partDirs {
            let dir = rootDirectory.appendingPathComponent(part)
            guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
                    .filter({ $0.pathExtension == "html" })
                    .sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) else { continue }
            for file in files {
                if let qNum = extractQuestionNumber(from: file.lastPathComponent) {
                    let content = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
                    let sections = parseQuestion(html: content, part: part, question: qNum)
                    all.append(contentsOf: sections)
                }
            }
        }
        return all
    }

    /// Convenience for when only one HTML file is being tested.
    public func parseQuestion(html: String, part: String, question: Int) -> [Section] {
        // Split the HTML into per-article chunks at each `<h3 ...>...</h3>` heading.
        // Article numbering within a question starts at 1 in document order.
        let articleChunks = splitArticles(html: html)
        var sections: [Section] = []
        for (idx, chunk) in articleChunks.enumerated() {
            let articleNum = idx + 1
            let articlePath = "summa.\(part).Q\(question).A\(articleNum)"
            let paragraphs = extractLatinParagraphs(chunk: chunk)

            // Classify each paragraph by its opening Latin words.
            var objectionIndex = 0
            var replyIndex = 0
            var sawSedContra = false
            var sawRespondeo = false

            for para in paragraphs {
                let trimmed = para.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }

                let kind = classify(latin: trimmed)
                let leafKey: String
                switch kind {
                case .objection:
                    objectionIndex += 1
                    leafKey = "obj\(objectionIndex)"
                case .sedContra:
                    leafKey = "sedcontra"
                    sawSedContra = true
                case .respondeo:
                    leafKey = "respondeo"
                    sawRespondeo = true
                case .reply(let n):
                    if let n {
                        replyIndex = n
                        leafKey = "rep\(n)"
                    } else {
                        replyIndex += 1
                        leafKey = "rep\(replyIndex)"
                    }
                case .other:
                    // Pre-respondeo "other" rows belong to an objection; post-respondeo to a reply.
                    if sawRespondeo {
                        leafKey = replyIndex > 0 ? "rep\(replyIndex)" : "respondeo"
                    } else if sawSedContra {
                        leafKey = "respondeo"
                    } else if objectionIndex > 0 {
                        leafKey = "obj\(objectionIndex)"
                    } else {
                        continue   // dangling preamble; skip
                    }
                }
                sections.append(Section(ordinalPath: "\(articlePath).\(leafKey)", body: trimmed))
            }
        }
        return sections
    }

    // MARK: - Helpers

    private func extractQuestionNumber(from filename: String) -> Int? {
        // Strip 2-letter part prefix + ".html"
        let stem = filename.split(separator: ".").first.map(String.init) ?? filename
        let digits = stem.drop(while: { !$0.isNumber })
        guard let n = Int(digits) else { return nil }
        return n
    }

    private func splitArticles(html: String) -> [String] {
        // Geremia's first `<h3>` in a file is the Question header (PRIMA PARS QUAESTIO 1).
        // Subsequent `<h3>`s mark Articles. The first article begins after the second `<h3>`.
        let parts = html.components(separatedBy: "<h3")
        guard parts.count >= 3 else { return [] }
        return Array(parts.dropFirst(2))
    }

    /// Pull every left-column `<td>` from the table rows in an article chunk.
    ///
    /// Geremia's HTML omits closing `</td>` and `</tr>` tags — they're inferred per HTML5
    /// rules. So we can't use a balanced-tag regex; instead we split on `<tr` and `<td`
    /// boundaries and treat the second `<td>` of each `<tr>` as the English column (skip).
    private func extractLatinParagraphs(chunk: String) -> [String] {
        var latins: [String] = []
        // Each row chunk starts at "<tr" (after the first preamble piece is dropped).
        let rowChunks = chunk.components(separatedBy: "<tr").dropFirst()
        for row in rowChunks {
            // Within a row, split on "<td" — pieces[1] is the first cell (Latin),
            // pieces[2] is the second cell (English).
            let cells = row.components(separatedBy: "<td")
            guard cells.count >= 2 else { continue }
            // Strip the leading "valign=..." etc. and stop at the next `<td` boundary.
            // After splitting, cells[1] is "...Latin text..." up to the next `<td`.
            let latinRaw = cells[1]
            // Drop any leading attributes (everything up to the first `>`).
            guard let gtIdx = latinRaw.firstIndex(of: ">") else { continue }
            let bodyAndTail = String(latinRaw[latinRaw.index(after: gtIdx)...])
            let text = stripHTML(bodyAndTail)
            if !text.isEmpty {
                latins.append(text)
            }
        }
        return latins
    }

    private func stripHTML(_ raw: String) -> String {
        var s = raw
        s = s.replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "&nbsp;", with: " ")
        s = s.replacingOccurrences(of: "&amp;", with: "&")
        s = s.replacingOccurrences(of: "&lt;", with: "<")
        s = s.replacingOccurrences(of: "&gt;", with: ">")
        s = s.replacingOccurrences(of: "&quot;", with: "\"")
        s = s.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private enum LatinKind {
        case objection, sedContra, respondeo, reply(Int?), other
    }

    /// Classify a Latin paragraph by its opening words. The Benziger edition is consistent
    /// enough that these phrase tests work reliably across thousands of articles.
    private func classify(latin: String) -> LatinKind {
        let lower = latin.lowercased()
        if lower.hasPrefix("videtur quod") || lower.hasPrefix("ad ") && (lower.hasPrefix("ad primum sic")  || lower.hasPrefix("ad secundum sic") || lower.hasPrefix("ad tertium sic")) {
            return .objection
        }
        if lower.hasPrefix("sed contra") {
            return .sedContra
        }
        if lower.hasPrefix("respondeo") {
            return .respondeo
        }
        // "Ad primum ergo dicendum" / "Ad secundum dicendum" / "Ad tertium dicendum" — replies
        if lower.hasPrefix("ad ") {
            let ordinals: [(String, Int)] = [
                ("ad primum",  1), ("ad secundum", 2), ("ad tertium", 3),
                ("ad quartum", 4), ("ad quintum",  5), ("ad sextum",  6),
                ("ad septimum", 7), ("ad octavum", 8), ("ad nonum",   9), ("ad decimum", 10)
            ]
            for (phrase, n) in ordinals {
                if lower.hasPrefix(phrase) { return .reply(n) }
            }
            return .reply(nil)
        }
        // Pre-Benziger Objection 1 sometimes lacks "Videtur quod" — starts with "Ad primum sic
        // proceditur. Videtur quod…". Handled above by the .hasPrefix("ad primum sic") branch.
        return .other
    }
}
