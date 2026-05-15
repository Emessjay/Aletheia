import SwiftUI

struct CommandPaletteView: View {
    @Environment(CorpusContainer.self) private var corpus
    @Binding var selection: NavigationSelection?
    @Binding var isPresented: Bool

    @State private var query: String = ""
    @State private var books: [BookSummary] = []
    @State private var refHit: ReferenceParser.Hit?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                TextField("Go to reference (e.g. Gen 1:1)", text: $query)
                    .textFieldStyle(.plain)
                    .font(.title2)
                    .padding()
                    .onSubmit { commit() }
                    .onChange(of: query) { _, new in
                        refHit = ReferenceParser.parse(new, books: books)
                    }
                Divider()
                if let hit = refHit {
                    Button {
                        commit()
                    } label: {
                        HStack {
                            Image(systemName: "arrow.right.circle.fill")
                                .foregroundStyle(.tint)
                            VStack(alignment: .leading) {
                                Text("\(hit.bookName) \(hit.chapter)\(hit.verse.map { ":\($0)" } ?? "")")
                                    .font(.body)
                                Text("Open in reader").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding()
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else if !query.isEmpty {
                    Text("Press return to search for ‘\(query)’")
                        .foregroundStyle(.secondary)
                        .padding()
                }
                Spacer()
            }
            .frame(minWidth: 480, minHeight: 280)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { isPresented = false }
                }
            }
        }
        .task {
            if books.isEmpty {
                books = (try? await corpus.listBibleBooks()) ?? []
            }
        }
    }

    private func commit() {
        if let hit = refHit {
            selection = .book(workSlug: "bsb", bookSlug: hit.bookSlug, chapter: hit.chapter)
            isPresented = false
            return
        }
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        selection = .search(query: query)
        isPresented = false
    }
}
