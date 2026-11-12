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
    @State private var recipes: RecipeStore
    @State private var profile: ProfileStore
    @State private var kid = KidMode()
    @State private var kitchen = KitchenModel()
    @State private var area = AreaModel()

    init(auth: AuthModel) {
        _stories = State(initialValue: StoryStore(auth: auth))
        _recipes = State(initialValue: RecipeStore(auth: auth))
        _profile = State(initialValue: ProfileStore(auth: auth))
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
        .environment(recipes)
        .environment(profile)
        .environment(kid)
        .environment(kitchen)
        .environment(StoryPlayer.shared)
        .environment(area)
        .onAppear {
            area.current = LaunchOptions.area ?? savedArea
            // Kid mode stays on after the app is closed: the child is back on the stories side.
            if kid.active {
                stories.kidFolders = profile.settings.kidFolders
                area.current = .stories
            }
        }
        .onChange(of: area.current) {
            if kid.active, area.current != .stories { area.current = .stories; return }
            savedArea = area.current
            Haptics.select()
        }
        .onChange(of: kid.active) { if !kid.active { stories.kidFolders = [] } }
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
    @Environment(KidMode.self) private var kid

    var body: some View {
        if !kid.active { picker }
    }

    private var picker: some View {
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
    @Environment(KitchenModel.self) private var kitchen
    @Environment(RecipeStore.self) private var store

    var body: some View {
        @Bindable var kitchen = kitchen
        TabView(selection: $kitchen.tab) {
            Tab("Acasă", systemImage: "circle", value: AppTab.home) { RecipesHomeView().miniPlayerInset().toolbar(.hidden, for: .tabBar) }
            Tab("Săptămâna", systemImage: "circle", value: AppTab.week) { WeekView().miniPlayerInset().toolbar(.hidden, for: .tabBar) }
            Tab("Rețete", systemImage: "circle", value: AppTab.recipes) { RecipesTabRoot().miniPlayerInset().toolbar(.hidden, for: .tabBar) }
            Tab("Listă", systemImage: "circle", value: AppTab.list) { ShoppingView().miniPlayerInset().toolbar(.hidden, for: .tabBar) }
            Tab("Profil", systemImage: "circle", value: AppTab.profile) { ProfileView().miniPlayerInset().toolbar(.hidden, for: .tabBar) }
        }
        .appTabBar([
            KTTabItem(value: AppTab.home, label: "Acasă", glyph: .home),
            KTTabItem(value: AppTab.week, label: "Săptămâna", glyph: .week),
            KTTabItem(value: AppTab.recipes, label: "Rețete", glyph: .recipes),
            KTTabItem(value: AppTab.list, label: "Listă", glyph: .list, badge: store.toBuyCount),
            KTTabItem(value: AppTab.profile, label: "Profil", glyph: .profile),
        ], selection: $kitchen.tab)
        .onChange(of: kitchen.tab) { Haptics.select() }
        .kitchenToast()
        .storyPlayerSheet()
        .fullScreenCover(item: $kitchen.cooking) { session in
            CookModeView(session: session)
                .environment(store)
        }
        .task { await store.refresh() }
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
                .ktKitchenBackground()
                .navigationTitle(title)
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

