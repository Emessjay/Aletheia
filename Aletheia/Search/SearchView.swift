import SwiftUI

struct SearchView: View {
    @Environment(CorpusContainer.self) private var corpus
    let initialQuery: String

    @State private var query: String = ""
    @State private var hits: [Corpus.SearchHit] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search Scripture & patristics", text: $query)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await run() } }
            }
            .padding(8)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            .padding()

            if loading {
                ProgressView().padding()
            }
            if let error {
                Text(error).foregroundStyle(.red).padding(.horizontal)
            }

            if hits.isEmpty, !loading {
                ContentUnavailableView(
                    query.isEmpty ? "Type to search" : "No matches for ‘\(query)’",
                    systemImage: "magnifyingglass"
                )
                .frame(maxHeight: .infinity)
            } else {
                List {
                    Section("Bible") { ForEach(hits.filter { $0.kind == .bible }) { hit in row(hit) } }
                    Section("Patristics") { ForEach(hits.filter { $0.kind == .patristic }) { hit in row(hit) } }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Search")
        .task {
            if !initialQuery.isEmpty {
                query = initialQuery
                await run()
            }
        }
    }

    @ViewBuilder
    private func row(_ hit: Corpus.SearchHit) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(hit.ref).font(.headline)
            Text(highlight(hit.snippet))
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
    }

    /// Convert FTS5 snippet markers (`**word**`) into an AttributedString with bold runs.
    private func highlight(_ snippet: String) -> AttributedString {
        var result = AttributedString()
        var rest = snippet[...]
        while let openRange = rest.range(of: "**") {
            result += AttributedString(rest[..<openRange.lowerBound])
            rest = rest[openRange.upperBound...]
            guard let closeRange = rest.range(of: "**") else {
                result += AttributedString(rest)
                return result
            }
            var token = AttributedString(rest[..<closeRange.lowerBound])
            token.font = .body.bold()
            result += token
            rest = rest[closeRange.upperBound...]
        }
        result += AttributedString(rest)
        return result
    }

    private func run() async {
        loading = true
        defer { loading = false }
        do {
            hits = try await corpus.search(query)
            error = nil
        } catch {
            hits = []
            self.error = error.localizedDescription
        }
    }
}
