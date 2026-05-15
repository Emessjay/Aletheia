import SwiftUI

struct RootView: View {
    @Environment(CorpusContainer.self) private var corpus
    @State private var selection: NavigationSelection? = .book(workSlug: "bsb", bookSlug: "gen", chapter: 1)
    @State private var commandPaletteOpen = false

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $selection)
                .navigationTitle("Aletheia")
        } detail: {
            DetailView(selection: $selection)
        }
        .sheet(isPresented: $commandPaletteOpen) {
            CommandPaletteView(selection: $selection, isPresented: $commandPaletteOpen)
        }
        .onReceive(NotificationCenter.default.publisher(for: .openCommandPalette)) { _ in
            commandPaletteOpen = true
        }
        .task {
            await corpus.openIfNeeded()
        }
    }
}

enum NavigationSelection: Hashable, Sendable {
    case book(workSlug: String, bookSlug: String, chapter: Int)
    case patristic(workSlug: String, sectionPath: String)
    case libraries
    case search(query: String)
}
