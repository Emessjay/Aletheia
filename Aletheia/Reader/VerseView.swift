import SwiftUI
import SwiftData

struct VerseView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var highlights: [Highlight]

    let verse: Verse
    let ref: VerseRef
    let language: CorpusLanguage
    let onStrongsTap: (String) -> Void

    init(verse: Verse, ref: VerseRef, language: CorpusLanguage, onStrongsTap: @escaping (String) -> Void) {
        self.verse = verse
        self.ref = ref
        self.language = language
        self.onStrongsTap = onStrongsTap
        // Pre-filter highlights for this verse to keep the query cheap.
        let workSlug = ref.workSlug
        let bookSlug = ref.bookSlug
        let chapter = ref.chapter
        let verseNum = verse.number
        _highlights = Query(filter: #Predicate<Highlight> { h in
            h.workSlug == workSlug && h.bookSlug == bookSlug && h.chapter == chapter && h.verse == verseNum
        })
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(verse.number)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 24, alignment: .trailing)
            attributedText
                .font(bodyFont)
                .lineSpacing(4)
                .textSelection(.enabled)
                .multilineTextAlignment(language == .hebrew ? .trailing : .leading)
                .environment(\.layoutDirection, language == .hebrew ? .rightToLeft : .leftToRight)
                .contextMenu { contextMenu }
        }
    }

    private var bodyFont: Font {
        switch language {
        case .hebrew: return .system(size: 22)
        case .greek:  return .system(size: 19)
        default:      return .body
        }
    }

    private var attributedText: Text {
        if verse.words.isEmpty {
            return highlightedText(verse.text)
        }
        // Build a tap-able run-by-run Text composition. SwiftUI Text supports + concatenation but
        // not per-run gestures; for v1 the tap target is verse-wide, and Strong's lookup happens
        // via the popover on tap-and-hold. A future iteration will use UIKit/AppKit text view.
        return highlightedText(verse.text)
    }

    private func highlightedText(_ raw: String) -> Text {
        var attr = AttributedString(raw)
        if let h = primaryHighlight {
            attr.backgroundColor = SwiftUI.Color(highlightColor: h.color).opacity(0.35)
        }
        return Text(attr)
    }

    private var primaryHighlight: Highlight? {
        // Prefer translation-specific highlights, fall back to "all translations"
        let key = language.rawValue
        return highlights.first(where: { $0.translationKey == key }) ?? highlights.first(where: { $0.translationKey == nil })
    }

    @ViewBuilder
    private var contextMenu: some View {
        Menu("Highlight") {
            ForEach(HighlightColor.allCases, id: \.self) { color in
                Button {
                    setHighlight(color: color)
                } label: {
                    Label(color.rawValue.capitalized, systemImage: primaryHighlight?.color == color ? "checkmark.circle.fill" : "circle.fill")
                }
            }
            if primaryHighlight != nil {
                Divider()
                Button(role: .destructive) {
                    removeHighlight()
                } label: {
                    Label("Remove Highlight", systemImage: "xmark")
                }
            }
        }
        Button("Add to Library…") {
            NotificationCenter.default.post(name: .addToLibraryRequested, object: ref)
        }
        Button("Copy Reference") {
            #if canImport(AppKit)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(ref.canonicalString, forType: .string)
            #elseif canImport(UIKit)
            UIPasteboard.general.string = ref.canonicalString
            #endif
        }
        ForEach(verse.words.compactMap(\.strongs).prefix(8), id: \.self) { strongs in
            Button("Lookup \(strongs)") {
                onStrongsTap(strongs)
            }
        }
    }

    private func setHighlight(color: HighlightColor) {
        if let existing = primaryHighlight {
            existing.colorRaw = color.rawValue
        } else {
            modelContext.insert(Highlight(ref: ref, color: color))
        }
    }

    private func removeHighlight() {
        guard let existing = primaryHighlight else { return }
        modelContext.delete(existing)
    }
}

extension Notification.Name {
    static let addToLibraryRequested = Notification.Name("aletheia.addToLibraryRequested")
}

extension SwiftUI.Color {
    init(highlightColor: HighlightColor) {
        switch highlightColor {
        case .yellow: self = .yellow
        case .green:  self = .green
        case .blue:   self = .blue
        case .pink:   self = .pink
        case .purple: self = .purple
        case .orange: self = .orange
        }
    }
}
