import SwiftUI
import SwiftData

@main
struct AletheiaApp: App {
    @State private var corpus = CorpusContainer()
    private let userModelContainer: ModelContainer = AletheiaApp.makeUserModelContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(corpus)
                .modelContainer(userModelContainer)
        }
        #if os(macOS)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .toolbar) {
                Button("Go to Reference…") {
                    NotificationCenter.default.post(name: .openCommandPalette, object: nil)
                }
                .keyboardShortcut("o", modifiers: [.command])
            }
        }
        #endif
    }

    private static func makeUserModelContainer() -> ModelContainer {
        let schema = Schema([
            Library.self,
            Bookmark.self,
            Highlight.self,
            Note.self
        ])
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .private("iCloud.org.jackporter.aletheia")
        )
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            // Fall back to local-only if CloudKit isn't available (simulator without iCloud, dev runs)
            let local = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false, cloudKitDatabase: .none)
            do {
                return try ModelContainer(for: schema, configurations: [local])
            } catch {
                fatalError("Failed to initialize ModelContainer: \(error)")
            }
        }
    }
}

extension Notification.Name {
    static let openCommandPalette = Notification.Name("aletheia.openCommandPalette")
}
