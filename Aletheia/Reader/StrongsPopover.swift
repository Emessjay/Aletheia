import SwiftUI

struct StrongsPopover: View {
    @Environment(CorpusContainer.self) private var corpus
    let strongsId: String
    @State private var entry: StrongsEntry?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let entry {
                        Text(entry.lemma)
                            .font(.system(size: 28, weight: .semibold))
                        if let trans = entry.transliteration, !trans.isEmpty {
                            Text(trans).font(.title3).foregroundStyle(.secondary)
                        }
                        Text(strongsId).font(.caption.monospaced()).foregroundStyle(.tertiary)
                        Divider()
                        if !entry.gloss.isEmpty {
                            Text(entry.gloss).font(.headline)
                        }
                        if !entry.definition.isEmpty {
                            Text(entry.definition)
                                .font(.body)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let usage = entry.kjvUsage, !usage.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("KJV Usage").font(.caption).foregroundStyle(.secondary)
                                Text(usage).font(.callout)
                            }
                            .padding(.top, 8)
                        }
                    } else if loading {
                        ProgressView()
                    } else {
                        ContentUnavailableView("No entry", systemImage: "questionmark.circle")
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle(strongsId)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
        .frame(idealWidth: 420, idealHeight: 520)
        .task {
            do {
                entry = try await corpus.strongs(id: strongsId)
            } catch {
                entry = nil
            }
            loading = false
        }
    }
}
