import SwiftUI

struct SidebarView: View {
    @Environment(CorpusContainer.self) private var corpus
    @Binding var selection: NavigationSelection?
    @State private var bibleBooks: [BookSummary] = []
    @State private var patristicWorks: [WorkSummary] = []

    var body: some View {
        List(selection: $selection) {
            Section("Old Testament") {
                ForEach(bibleBooks.filter { $0.testament == .old }) { book in
                    bookRow(book)
                }
            }
            Section("Apocrypha") {
                ForEach(bibleBooks.filter { $0.testament == .deutero }) { book in
                    bookRow(book)
                }
            }
            Section("New Testament") {
                ForEach(bibleBooks.filter { $0.testament == .new }) { book in
                    bookRow(book)
                }
            }
            Section("Patristics") {
                ForEach(patristicWorks) { work in
                    NavigationLink(value: NavigationSelection.patristic(workSlug: work.slug, sectionPath: work.firstSectionPath)) {
                        Text(work.title)
                    }
                }
            }
            Section {
                NavigationLink(value: NavigationSelection.libraries) {
                    Label("Libraries", systemImage: "books.vertical")
                }
                NavigationLink(value: NavigationSelection.search(query: "")) {
                    Label("Search", systemImage: "magnifyingglass")
                }
            }
        }
        .task(id: corpus.isOpen) {
            guard corpus.isOpen else { return }
            bibleBooks = (try? await corpus.listBibleBooks()) ?? []
            patristicWorks = (try? await corpus.listPatristicWorks()) ?? []
        }
    }

    @ViewBuilder
    private func bookRow(_ book: BookSummary) -> some View {
        NavigationLink(value: NavigationSelection.book(workSlug: "bsb", bookSlug: book.slug, chapter: 1)) {
            Text(book.name)
        }
    }
}
