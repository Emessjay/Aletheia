import Foundation

/// Parses Jacob-Gray/summa.json's `ALL.json` consolidated dump.
///
/// Schema (verified against `https://raw.githubusercontent.com/Jacob-Gray/summa.json/master/json/ALL.json`):
///
///     {
///       "FP": {                              // First Part
///         "title": "FIRST PART",
///         "questions": {
///           "1": {
///             "id": 1, "part": "FP", "title": "...",
///             "outer": { "type": "outer", "text": ["..."], "title": [...] },
///             "article": {
///               "1": {
///                 "type": "article", "title": [...], "id": 1,
///                 "objections": { "1": {"text": [...] }, "2": ... },
///                 "counter":  ["sed contra paragraph"],     // Sed Contra (sometimes a string list, sometimes a dict)
///                 "body":     ["respondeo paragraph"],      // Respondeo
///                 "replies":  { "1": {"text": [...] }, ... }
///               }
///             }
///           }
///         }
///       },
///       "FS": …,  "SS": …, "TP": …, "X1": …, "X2": …, "XP": …
///     }
///
/// We emit one ``Section`` per leaf (objection / sed contra / respondeo / reply) plus a
/// header section per part/question/article. Ordinal paths look like:
///   `summa.FP.Q1`, `summa.FP.Q1.A1`, `summa.FP.Q1.A1.obj1`,
///   `summa.FP.Q1.A1.sedcontra`, `summa.FP.Q1.A1.respondeo`, `summa.FP.Q1.A1.rep1`
public struct SummaParser {
    public init() {}

    public struct Section {
        public let ordinalPath: String
        public let kind: String
        public let label: String?
        public let body: String
        public let parentPath: String?
    }

    public func parse(fileURL: URL) throws -> [Section] {
        let data = try Data(contentsOf: fileURL)
        return try parse(data: data)
    }

    public func parse(data: Data) throws -> [Section] {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw IngestError.malformed("summa.json: root is not an object")
        }
        var sections: [Section] = []
        let partOrder = ["FP", "FS", "SS", "TP", "X1", "X2", "XP"]

        for partKey in partOrder {
            guard let part = json[partKey] as? [String: Any] else { continue }
            let partTitle = (part["title"] as? String) ?? partKey
            let partPath = "summa.\(partKey)"
            // Container sections (part / question / article) carry their title in `label`;
            // emitting it again in `body` produced a duplicate line under the page heading.
            sections.append(.init(ordinalPath: partPath, kind: "part",
                                  label: partTitle, body: "", parentPath: nil))

            // questions is a dict keyed by string question number; sort numerically.
            let questions = (part["questions"] as? [String: Any]) ?? [:]
            let sortedQs = questions.keys.compactMap { Int($0) }.sorted()
            for qNum in sortedQs {
                guard let q = questions[String(qNum)] as? [String: Any] else { continue }
                let qPath = "\(partPath).Q\(qNum)"
                let qTitle = q["title"] as? String ?? "Question \(qNum)"
                sections.append(.init(ordinalPath: qPath, kind: "question",
                                      label: "Question \(qNum). \(qTitle)",
                                      body: "", parentPath: partPath))

                // Question-level prologue ("outer")
                if let outer = q["outer"] as? [String: Any], let text = textBody(outer) {
                    sections.append(.init(ordinalPath: "\(qPath).intro", kind: "intro",
                                          label: "Prologue",
                                          body: text, parentPath: qPath))
                }

                let articles = (q["article"] as? [String: Any]) ?? [:]
                let sortedAs = articles.keys.compactMap { Int($0) }.sorted()
                for aNum in sortedAs {
                    guard let art = articles[String(aNum)] as? [String: Any] else { continue }
                    let aPath = "\(qPath).A\(aNum)"
                    let aTitle = stringFromList(art["title"]) ?? "Article \(aNum)"
                    sections.append(.init(ordinalPath: aPath, kind: "article",
                                          label: "Article \(aNum). \(aTitle)",
                                          body: "", parentPath: qPath))

                    if let objections = art["objections"] as? [String: Any] {
                        let sortedObj = objections.keys.compactMap { Int($0) }.sorted()
                        for n in sortedObj {
                            guard let obj = objections[String(n)] as? [String: Any] else { continue }
                            if let text = textBody(obj) {
                                sections.append(.init(ordinalPath: "\(aPath).obj\(n)",
                                                       kind: "objection",
                                                       label: "Objection \(n)",
                                                       body: Self.stripLeadingHeading(text, kind: "objection", number: n),
                                                       parentPath: aPath))
                            }
                        }
                    }
                    // Sed Contra ("counter") — can be string array OR a list of dicts in some entries
                    if let counter = art["counter"] {
                        if let text = textBody(counter) {
                            sections.append(.init(ordinalPath: "\(aPath).sedcontra",
                                                   kind: "sedcontra",
                                                   label: "On the contrary",
                                                   body: Self.stripLeadingHeading(text, kind: "sedcontra"),
                                                   parentPath: aPath))
                        }
                    }
                    // Respondeo ("body")
                    if let body = art["body"], let text = textBody(body) {
                        sections.append(.init(ordinalPath: "\(aPath).respondeo",
                                               kind: "respondeo",
                                               label: "I answer that",
                                               body: Self.stripLeadingHeading(text, kind: "respondeo"),
                                               parentPath: aPath))
                    }
                    // Replies
                    if let replies = art["replies"] as? [String: Any] {
                        let sortedRep = replies.keys.compactMap { Int($0) }.sorted()
                        for n in sortedRep {
                            guard let rep = replies[String(n)] as? [String: Any] else { continue }
                            if let text = textBody(rep) {
                                sections.append(.init(ordinalPath: "\(aPath).rep\(n)",
                                                       kind: "reply",
                                                       label: "Reply to Objection \(n)",
                                                       body: Self.stripLeadingHeading(text, kind: "reply", number: n),
                                                       parentPath: aPath))
                            }
                        }
                    }
                }
            }
        }
        return sections
    }

    /// Strip the structural formula that opens each Summa sub-section in the English
    /// translation ("Objection 1: …", "On the contrary, …", "I answer that, …",
    /// "Reply to Objection 1: …"). The UI renders the kind in the heading, so the
    /// opener is redundant when the body sits under it.
    static func stripLeadingHeading(_ body: String, kind: String, number: Int? = nil) -> String {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern: String
        switch kind {
        case "objection":
            guard let n = number else { return trimmed }
            pattern = #"^Objection\s+"# + String(n) + #"\s*[:.]\s+"#
        case "reply":
            guard let n = number else { return trimmed }
            pattern = #"^Reply\s+to\s+Objection\s+"# + String(n) + #"\s*[:.]\s+"#
        case "sedcontra":
            pattern = #"^On\s+the\s+contrary\s*,\s+"#
        case "respondeo":
            pattern = #"^I\s+answer\s+that\s*,\s+"#
        default:
            return trimmed
        }
        guard let range = trimmed.range(of: pattern, options: [.regularExpression, .caseInsensitive]),
              range.lowerBound == trimmed.startIndex else {
            return trimmed
        }
        return String(trimmed[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Extract a body string from any of the shapes the schema uses:
    /// - `["paragraph1", "paragraph2"]`
    /// - `{ "text": ["paragraph"] }`
    /// - `{ "text": "string" }`
    /// - `[{ "text": ["..."] }, ...]`
    private func textBody(_ raw: Any) -> String? {
        if let dict = raw as? [String: Any] {
            if let arr = dict["text"] as? [String] {
                return arr.joined(separator: "\n\n").trimmedNonEmpty
            }
            if let s = dict["text"] as? String {
                return s.trimmedNonEmpty
            }
        }
        if let arr = raw as? [String] {
            return arr.joined(separator: "\n\n").trimmedNonEmpty
        }
        if let arr = raw as? [[String: Any]] {
            let pieces = arr.compactMap { textBody($0) }
            return pieces.joined(separator: "\n\n").trimmedNonEmpty
        }
        if let s = raw as? String {
            return s.trimmedNonEmpty
        }
        return nil
    }

    private func stringFromList(_ raw: Any?) -> String? {
        if let s = raw as? String { return s.trimmedNonEmpty }
        if let arr = raw as? [String] { return arr.joined(separator: " ").trimmedNonEmpty }
        return nil
    }
}

private extension String {
    var trimmedNonEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
