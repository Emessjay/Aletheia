import SwiftUI

/// Three-way language picker (Hebrew / Greek / English) with a secondary English-variant
/// picker (BSB / KJV / Brenton) that only appears when English is selected.
///
/// Internally, our corpus has three "English" language codes (`en_bsb`, `en_kjv`,
/// `en_brenton`). To users that's still just *English*, so the top-level toggle shows
/// "Hebrew | Greek | English" and the sub-picker lets them swap variants.
struct LanguageToggle: View {
    @Binding var language: CorpusLanguage
    let available: [CorpusLanguage]
    @Binding var englishVariant: CorpusLanguage  // .bsb / .kjv / .brenton

    enum DisplayTab: Hashable {
        case hebrew, greek, latin, english
    }

    private var displayTabs: [DisplayTab] {
        var tabs: [DisplayTab] = []
        if available.contains(.hebrew) { tabs.append(.hebrew) }
        if available.contains(.greek)  { tabs.append(.greek) }
        if available.contains(.latin)  { tabs.append(.latin) }
        if available.contains(where: { $0.isEnglish }) { tabs.append(.english) }
        return tabs
    }

    private var availableEnglishVariants: [CorpusLanguage] {
        [.bsb, .kjv, .brenton].filter { available.contains($0) }
    }

    private var currentTab: DisplayTab {
        switch language {
        case .hebrew: return .hebrew
        case .greek: return .greek
        case .latin: return .latin
        case .bsb, .kjv, .brenton: return .english
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Picker("Language", selection: tabBinding) {
                ForEach(displayTabs, id: \.self) { tab in
                    Text(label(for: tab)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if currentTab == .english, availableEnglishVariants.count > 1 {
                Picker("Translation", selection: $englishVariant) {
                    ForEach(availableEnglishVariants, id: \.self) { v in
                        Text(v.displayName).tag(v)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .onChange(of: englishVariant) { _, new in
                    language = new
                }
                .fixedSize()
            }
        }
    }

    private func label(for tab: DisplayTab) -> String {
        switch tab {
        case .hebrew:  return "Hebrew"
        case .greek:   return "Greek"
        case .latin:   return "Latin"
        case .english: return "English"
        }
    }

    private var tabBinding: Binding<DisplayTab> {
        Binding(
            get: { currentTab },
            set: { newTab in
                switch newTab {
                case .hebrew:  language = .hebrew
                case .greek:   language = .greek
                case .latin:   language = .latin
                case .english:
                    // Pick the previously chosen English variant if it's available; else fall back.
                    if availableEnglishVariants.contains(englishVariant) {
                        language = englishVariant
                    } else if let first = availableEnglishVariants.first {
                        language = first
                        englishVariant = first
                    }
                }
            }
        )
    }
}
