import SwiftUI
import SwiftData

struct ChapterView: View {
    @Environment(CorpusContainer.self) private var corpus
    let workSlug: String
    let bookSlug: String
    let chapter: Int

    @State private var verses: [Verse] = []
    @State private var language: CorpusLanguage = .bsb
    @State private var englishVariant: CorpusLanguage = .bsb
    @State private var bookMeta: BookSummary?
    @State private var selectedStrongs: String?
    @State private var loadError: String?
    @State private var navigateTo: NavigationSelection?
    @State private var chapterPickerOpen = false

    var availableLanguages: [CorpusLanguage] {
        guard let bookMeta else { return [.bsb] }
        switch bookMeta.testament {
        case .old:     return [.hebrew, .greek, englishVariant]
        case .deutero: return [.greek, .brenton, .kjv]
        case .new:     return [.greek, englishVariant]
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            LanguageToggle(language: $language, available: availableLanguages, englishVariant: $englishVariant)
                .padding(.horizontal)
                .padding(.vertical, 8)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(verses) { verse in
                        VerseView(
                            verse: verse,
                            ref: VerseRef(workSlug: "bible", bookSlug: bookSlug, chapter: chapter, verse: verse.number),
                            language: language,
                            onStrongsTap: { selectedStrongs = $0 }
                        )
                    }
                    if verses.isEmpty, let loadError {
                        ContentUnavailableView {
                            Label("No verses", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(loadError)
                        }
                        .padding(.top, 40)
                    } else if verses.isEmpty {
                        ProgressView().padding(.top, 40)
                    }
                }
                .padding()
            }
        }
        .navigationTitle(navigationTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            chapterNavToolbar
        }
        .sheet(item: Binding(get: {
            selectedStrongs.map { StrongsID(id: $0) }
        }, set: { selectedStrongs = $0?.id })) { strongsID in
            StrongsPopover(strongsId: strongsID.id)
        }
        // SwiftUI's `NavigationLink(value:)` is the canonical way to push selection updates;
        // we drive it via state so the toolbar buttons (which don't have access to the parent
        // selection binding) can move the user to a different chapter.
        .navigationDestination(item: $navigateTo) { sel in
            chapterDestination(for: sel)
        }
        .task(id: TaskKey(book: bookSlug, chapter: chapter, language: language)) {
            await load()
        }
    }

    @ToolbarContentBuilder
    private var chapterNavToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                go(to: chapter - 1)
            } label: {
                Label("Previous Chapter", systemImage: "chevron.left")
            }
            .disabled(chapter <= 1)
            .keyboardShortcut(.leftArrow, modifiers: .command)
            .help("Previous chapter (⌘←)")

            Button {
                chapterPickerOpen = true
            } label: {
                Text("\(chapter)")
                    .font(.body.monospacedDigit())
                    .frame(minWidth: 30)
            }
            .help("Pick chapter")
            .popover(isPresented: $chapterPickerOpen, arrowEdge: .top) {
                ChapterPicker(
                    totalChapters: bookMeta?.chapterCount ?? max(chapter, 1),
                    current: chapter
                ) { picked in
                    chapterPickerOpen = false
                    go(to: picked)
                }
                .frame(idealWidth: 280, idealHeight: 240)
            }

            Button {
                go(to: chapter + 1)
            } label: {
                Label("Next Chapter", systemImage: "chevron.right")
            }
            .disabled(bookMeta.map { chapter >= $0.chapterCount } ?? false)
            .keyboardShortcut(.rightArrow, modifiers: .command)
            .help("Next chapter (⌘→)")
        }
    }

    @ViewBuilder
    private func chapterDestination(for sel: NavigationSelection) -> some View {
        if case let .book(workSlug, bookSlug, chapter) = sel {
            ChapterView(workSlug: workSlug, bookSlug: bookSlug, chapter: chapter)
        } else {
            EmptyView()
        }
    }

    private func go(to newChapter: Int) {
        guard newChapter >= 1 else { return }
        if let count = bookMeta?.chapterCount, newChapter > count { return }
        navigateTo = .book(workSlug: workSlug, bookSlug: bookSlug, chapter: newChapter)
    }

    private var navigationTitle: String {
        guard let bookMeta else { return "\(bookSlug.capitalized) \(chapter)" }
        return "\(bookMeta.name) \(chapter)"
    }

    private func load() async {
        loadError = nil
        do {
            verses = try await corpus.chapter(bookSlug: bookSlug, chapter: chapter, language: language)
            if bookMeta == nil {
                let books = try await corpus.listBibleBooks()
                bookMeta = books.first { $0.slug == bookSlug }
            }
        } catch {
            verses = []
            loadError = error.localizedDescription
        }
    }
}

private struct TaskKey: Hashable {
    let book: String
    let chapter: Int
    let language: CorpusLanguage
}

private struct StrongsID: Identifiable, Hashable {
    let id: String
}

/// Grid of chapter numbers shown in a popover. Tapping a cell hands the choice back to the
/// caller so it can update navigation state.
private struct ChapterPicker: View {
    let totalChapters: Int
    let current: Int
    let onPick: (Int) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 6)

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(1...max(totalChapters, 1), id: \.self) { n in
                    Button {
                        onPick(n)
                    } label: {
                        Text("\(n)")
                            .font(.body.monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(n == current ? Color.accentColor.opacity(0.2) : Color.gray.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
        }
    }
}
