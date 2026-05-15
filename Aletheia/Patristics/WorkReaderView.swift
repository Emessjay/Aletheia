import SwiftUI

struct WorkReaderView: View {
    @Environment(CorpusContainer.self) private var corpus
    let workSlug: String
    let sectionPath: String

    @State private var sections: [PatristicSection] = []
    @State private var workTitle: String = ""
    @State private var language: CorpusLanguage = .bsb   // overwritten on load by availableLanguages
    @State private var availableLanguages: [CorpusLanguage] = []
    @State private var loadError: String?

    var body: some View {
        VStack(spacing: 0) {
            LanguageToggle(
                language: $language,
                available: availableLanguages.isEmpty ? [language] : availableLanguages,
                englishVariant: .constant(.bsb)
            )
            .padding(.horizontal).padding(.vertical, 8)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(sections) { section in
                        sectionBlock(section)
                    }
                    if sections.isEmpty {
                        if let loadError {
                            ContentUnavailableView("Couldn't load", systemImage: "exclamationmark.triangle", description: Text(loadError))
                        } else {
                            ProgressView()
                        }
                    }
                }
                .padding()
            }
        }
        .navigationTitle(workTitle.isEmpty ? workSlug.capitalized : workTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: workSlug) { await load() }
        .task(id: language) { await load() }
    }

    @ViewBuilder
    private func sectionBlock(_ section: PatristicSection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label = section.label {
                Text(label).font(.headline)
            }
            if let body = section.bodyByLanguage[language], !body.isEmpty {
                Text(body)
                    .font(language == .greek ? .system(size: 19) : .body)
                    .lineSpacing(4)
                    .textSelection(.enabled)
            } else {
                Text("Not available in \(language.displayName)")
                    .foregroundStyle(.secondary).italic()
            }
        }
        .id(section.ordinalPath)
    }

    private func load() async {
        do {
            let result = try await corpus.patristicSections(workSlug: workSlug)
            workTitle = result.title
            sections = result.sections
            let langs = Array(Set(result.sections.flatMap { $0.bodyByLanguage.keys })).sorted { $0.rawValue < $1.rawValue }
            availableLanguages = langs
            if !langs.contains(language), let first = langs.first { language = first }
            loadError = nil
        } catch {
            sections = []
            loadError = error.localizedDescription
        }
    }
}
