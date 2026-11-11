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
    @Environment(AuthModel.self) private var auth
    @State private var path: [String] = LaunchOptions.screen == "catalog" ? ["catalog"] : []
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let account = auth.account {
                    Section {
                        HStack(spacing: 14) {
                            Text(String(account.displayName.prefix(1)).uppercased())
                                .font(.ktTitle2)
                                .foregroundStyle(Theme.onAccent)
                                .frame(width: 52, height: 52)
                                .background(Circle().fill(Theme.accent))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(account.displayName).font(.ktTitle3).foregroundStyle(Theme.text)
                                if let email = account.email {
                                    Text(email).font(.ktFootnote).foregroundStyle(Theme.muted)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                        if account.space == nil {
                            Label("Contul nu are încă un spațiu. Ieși din cont și intră din nou.", systemImage: "exclamationmark.triangle")
                                .font(.ktFootnote).foregroundStyle(Theme.danger)
                        }
                        if auth.isOffline {
                            Label("Fără internet: folosești copia de pe telefon.", systemImage: "wifi.slash")
                                .font(.ktFootnote).foregroundStyle(Theme.muted)
                        }
                    }
                    .listRowBackground(Theme.surface)
                }
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
                Section {
                    Button("Ieși din cont", role: .destructive) { confirmSignOut = true }
                        .foregroundStyle(Theme.danger)
                }
                .listRowBackground(Theme.surface)
            }
            .confirmationDialog("Ieși din cont?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Ieși din cont", role: .destructive) { Task { await auth.signOut() } }
            } message: {
                Text("Pe acest telefon va trebui să intri din nou cu e-mailul și parola.")
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
