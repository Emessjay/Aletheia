import SwiftUI

struct DetailView: View {
    @Binding var selection: NavigationSelection?

    var body: some View {
        switch selection {
        case .book(let workSlug, let bookSlug, let chapter):
            ChapterView(workSlug: workSlug, bookSlug: bookSlug, chapter: chapter)
        case .patristic(let workSlug, let sectionPath):
            WorkReaderView(workSlug: workSlug, sectionPath: sectionPath)
        case .libraries:
            LibraryListView()
        case .search(let query):
            SearchView(initialQuery: query)
        case .none:
            ContentUnavailableView("Select a book", systemImage: "book.closed")
        }
    }
}
