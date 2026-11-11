import SwiftUI

/// The recipes-side tabs, as in the plan: Acasă, Săptămâna, Rețete, Listă, Profil.
/// (Povești gets its own bar in Phase 2.)
enum AppTab: String, CaseIterable, Hashable {
    case home, week, recipes, list, profile
}

struct RootView: View {
    @State private var tab: AppTab = LaunchOptions.tab ?? .home

    var body: some View {
        TabView(selection: $tab) {
            Tab("Acasă", systemImage: "house.fill", value: AppTab.home) {
                HomePlaceholderView()
            }
            Tab("Săptămâna", systemImage: "calendar", value: AppTab.week) {
                PlaceholderScreen(title: "Săptămâna", symbol: "calendar",
                                  message: "Planul săptămânii vine în faza Rețete.")
            }
            Tab("Rețete", systemImage: "book.closed.fill", value: AppTab.recipes) {
                PlaceholderScreen(title: "Rețete", symbol: "book.closed",
                                  message: "Lista și căutarea rețetelor vin în faza Rețete.")
            }
            Tab("Listă", systemImage: "checklist", value: AppTab.list) {
                PlaceholderScreen(title: "Listă", symbol: "cart",
                                  message: "Lista de cumpărături vine în faza Rețete.")
            }
            Tab("Profil", systemImage: "person.crop.circle.fill", value: AppTab.profile) {
                ProfileView()
            }
        }
        .onChange(of: tab) { Haptics.select() }
    }
}

/// Acasă keeps the web structure: the Rețete / Povești switch on top. The content arrives in
/// Phase 2 (Povești) and Phase 3 (Rețete).
struct HomePlaceholderView: View {
    enum Area: String, CaseIterable { case recipes = "Rețete", stories = "Povești" }
    @State private var area: Area = .recipes

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Picker("Zona", selection: $area) {
                        ForEach(Area.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 12) {
                        SectionLabel(area == .recipes ? "De gătit" : "Povești de seară")
                        EmptyStateView(symbol: area == .recipes ? "fork.knife" : "moon.stars",
                                       title: "În curând",
                                       message: "Aplicația nativă se construiește pas cu pas. Până atunci, folosește aplicația web.")
                            .frame(maxWidth: .infinity)
                            .ktCard(padding: 8)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background {
                if area == .stories { Theme.Night.gradient.ignoresSafeArea() } else { Theme.background.ignoresSafeArea() }
            }
            .animation(.easeInOut(duration: 0.3), value: area)
            .navigationTitle("Bucătăria")
        }
    }
}

struct PlaceholderScreen: View {
    let title: String
    let symbol: String
    let message: String

    var body: some View {
        NavigationStack {
            EmptyStateView(symbol: symbol, title: "În curând", message: message)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ktBackground()
                .navigationTitle(title)
        }
    }
}

struct ProfileView: View {
    @State private var path: [String] = LaunchOptions.screen == "catalog" ? ["catalog"] : []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    NavigationLink(value: "catalog") {
                        Label("Componente de design", systemImage: "paintpalette")
                    }
                } header: {
                    Text("Dezvoltare")
                }
                .listRowBackground(Theme.surface)
                Section {
                    LabeledContent("Versiune", value: AppInfo.version)
                }
                .listRowBackground(Theme.surface)
            }
            .ktBackground()
            .navigationTitle("Profil")
            .navigationDestination(for: String.self) { _ in DesignCatalogView() }
        }
    }
}

enum AppInfo {
    static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
