import SwiftUI
import SwiftData

struct LibraryDetailView: View {
    @Environment(\.modelContext) private var modelContext
    let library: Library

    var sortedBookmarks: [Bookmark] {
        library.bookmarks.sorted { $0.createdAt < $1.createdAt }
    }

    var body: some View {
        List {
            ForEach(sortedBookmarks) { bm in
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(bm.bookSlug.capitalized) \(bm.chapter):\(bm.verse)")
                        .font(.headline)
                    if let note = bm.note, !note.isEmpty {
                        Text(note).font(.callout).foregroundStyle(.secondary)
                    }
                    Text(bm.createdAt, style: .date)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .swipeActions {
                    Button(role: .destructive) {
                        modelContext.delete(bm)
                    } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
        .navigationTitle(library.name)
        .overlay {
            if sortedBookmarks.isEmpty {
                ContentUnavailableView("No Bookmarks", systemImage: "bookmark", description: Text("Long-press a verse to add it here."))
            }
        }
    }
}
