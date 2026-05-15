import SwiftUI
import SwiftData

struct LibraryListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Library.sortOrder, order: .forward) private var libraries: [Library]
    @State private var newLibraryName: String = ""
    @State private var creating = false

    var body: some View {
        List {
            Section {
                ForEach(libraries) { lib in
                    NavigationLink(destination: LibraryDetailView(library: lib)) {
                        HStack {
                            Image(systemName: "books.vertical.fill")
                                .foregroundStyle(.tint)
                            VStack(alignment: .leading) {
                                Text(lib.name).font(.body)
                                Text("\(lib.bookmarks.count) bookmarks").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            modelContext.delete(lib)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            } header: {
                HStack {
                    Text("Libraries")
                    Spacer()
                    Button { creating = true } label: {
                        Label("New", systemImage: "plus")
                    }
                }
            }
        }
        .navigationTitle("Libraries")
        .alert("New Library", isPresented: $creating) {
            TextField("Name", text: $newLibraryName)
            Button("Create") { create() }
            Button("Cancel", role: .cancel) { newLibraryName = "" }
        }
    }

    private func create() {
        let name = newLibraryName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let next = (libraries.map(\.sortOrder).max() ?? 0) + 1
        modelContext.insert(Library(name: name, sortOrder: next))
        newLibraryName = ""
    }
}
