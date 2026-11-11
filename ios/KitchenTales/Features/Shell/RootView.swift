import SwiftUI

/// The two halves of the app. Acasă on each side has the Rețete / Povești switch, like the web;
/// each half has its own tab bar.
enum AppArea: String, CaseIterable, Hashable {
    case recipes, stories
    var label: String { self == .recipes ? "Rețete" : "Povești" }
}

/// The recipes-side tabs, as in the plan: Acasă, Săptămâna, Rețete, Listă, Profil.
enum AppTab: String, CaseIterable, Hashable {
    case home, week, recipes, list, profile
}

/// Signed in: the side last used (remembered on the phone), with the stories library and the
/// player shared by both sides, so a story keeps playing while you look at a recipe.
struct RootView: View {
    @Environment(AuthModel.self) private var auth

    var body: some View {
        SignedInRoot(auth: auth)
    }
}

private struct SignedInRoot: View {
    @AppStorage("area") private var savedArea: AppArea = .recipes
    @State private var stories: StoryStore
    @State private var area = AreaModel()

    init(auth: AuthModel) {
        _stories = State(initialValue: StoryStore(auth: auth))
    }

    var body: some View {
        ZStack {
            switch area.current {
            case .recipes: RecipesTabs().transition(.opacity)
            case .stories: StoriesTabs().transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: area.current)
        .environment(stories)
        .environment(StoryPlayer.shared)
        .environment(area)
        .onAppear { area.current = LaunchOptions.area ?? savedArea }
        .onChange(of: area.current) { savedArea = area.current; Haptics.select() }
    }
}

/// Which side is showing; Acasă on either side switches it.
@MainActor @Observable
final class AreaModel {
    var current: AppArea = LaunchOptions.area ?? .recipes
}

/// The Rețete / Povești capsule at the top of Acasă.
struct AreaPicker: View {
    let current: AppArea
    @Environment(AreaModel.self) private var area

    var body: some View {
        HStack(spacing: 2) {
            ForEach(AppArea.allCases, id: \.self) { item in
                Button {
                    if item != current { area.current = item }
                } label: {
                    Text(item.label)
                        .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
                        .foregroundStyle(item == current ? Theme.text : Theme.text.opacity(0.75))
                        .padding(.horizontal, 14)
                        .frame(height: 32)
                        .background(Capsule().fill(item == current ? Color.white.opacity(0.22) : .clear))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(item == current ? .isSelected : [])
            }
        }
        .padding(3)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
        .environment(\.colorScheme, .dark)
    }
}

struct RecipesTabs: View {
    @State private var tab: AppTab = LaunchOptions.tab.flatMap(AppTab.init(rawValue:)) ?? .home

    var body: some View {
        TabView(selection: $tab) {
            Tab("Acasă", systemImage: "house.fill", value: AppTab.home) {
                HomePlaceholderView()
                    .miniPlayerInset()
            }
            Tab("Săptămâna", systemImage: "calendar", value: AppTab.week) {
                PlaceholderScreen(title: "Săptămâna", symbol: "calendar",
                                  message: "Planul săptămânii vine în faza Rețete.")
                    .miniPlayerInset()
            }
            Tab("Rețete", systemImage: "book.closed.fill", value: AppTab.recipes) {
                PlaceholderScreen(title: "Rețete", symbol: "book.closed",
                                  message: "Lista și căutarea rețetelor vin în faza Rețete.")
                    .miniPlayerInset()
            }
            Tab("Listă", systemImage: "checklist", value: AppTab.list) {
                PlaceholderScreen(title: "Listă", symbol: "cart",
                                  message: "Lista de cumpărături vine în faza Rețete.")
                    .miniPlayerInset()
            }
            Tab("Profil", systemImage: "person.crop.circle.fill", value: AppTab.profile) {
                ProfileView()
                    .miniPlayerInset()
            }
        }
        .onChange(of: tab) { Haptics.select() }
        .storyPlayerSheet()
    }
}

/// Acasă on the recipes side: the switch on top; the recipes themselves arrive in Phase 3.
struct HomePlaceholderView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    AreaPicker(current: .recipes)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(spacing: 12) {
                        SectionLabel("De gătit")
                        EmptyStateView(symbol: "fork.knife", title: "În curând",
                                       message: "Rețetele native vin în faza următoare. Până atunci, folosește aplicația web.")
                            .frame(maxWidth: .infinity)
                            .ktCard(padding: 8)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .ktBackground()
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
