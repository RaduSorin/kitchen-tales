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
    @State private var badges: BadgeStore
    @State private var kid = KidMode()
    @State private var kitchen = KitchenModel()
    @State private var area = AreaModel()
    private let commands = AppCommands.shared
    @Bindable private var bedtime = Bedtime.shared
    @Environment(\.scenePhase) private var scenePhase

    init(auth: AuthModel) {
        _stories = State(initialValue: StoryStore(auth: auth))
        _recipes = State(initialValue: RecipeStore(auth: auth))
        _profile = State(initialValue: ProfileStore(auth: auth))
        _badges = State(initialValue: BadgeStore(auth: auth))
    }

    var body: some View {
        ZStack {
            switch area.current {
            case .recipes: RecipesTabs().transition(.opacity)
            case .stories: StoriesTabs().transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: area.current)
        .overlay { BadgeCelebration() }
        .environment(stories)
        .environment(recipes)
        .environment(profile)
        .environment(badges)
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
        .task { await badges.start() }
        // Siri, Shortcuts and Spotlight.
        .onAppear { commands.recipes = recipes }
        .onChange(of: commands.pending, initial: true) { Task { await runCommand() } }
        .task(id: stories.allStories.count &+ recipes.recipes.count &* 7919) {
            guard LaunchOptions.demoAccount == nil else { return }
            await SpotlightIndex.update(stories: stories.allStories, recipes: recipes.recipes)
        }
        .onDisappear { Task { await SpotlightIndex.clear() } }
        // Recipes the Share card left importing in the background.
        .task { await collectShared() }
        .onChange(of: scenePhase) {
            if scenePhase == .active { Task { await collectShared() } } else { bedtime.dim(false) }
        }
        // "Ora de culcare": from the reminder, a Shortcut or Profil.
        .fullScreenCover(isPresented: $bedtime.showsNight) { BedtimeNightView() }
        .task {
            if LaunchOptions.screen == "bedtime-night" { area.current = .stories; bedtime.open() }
            await bedtime.schedule()
        }
    }

    private func collectShared() async {
        guard LaunchOptions.demoAccount == nil, !PendingImports().load().isEmpty, let share = ShareKitchen.open() else { return }
        let titles = await share.collectPending()
        guard !titles.isEmpty else { return }
        await recipes.refresh()
        kitchen.say(titles.count == 1 ? "Am salvat „\(titles[0])”" : "Am salvat \(titles.count) rețete trimise cu Share")
    }

    /// Carries out what Siri, a Shortcut or a Spotlight result asked for.
    private func runCommand() async {
        guard let command = commands.pending else { return }
        commands.pending = nil
        switch command {
        case .playStory(let id):
            area.current = .stories
            if stories.allStories.isEmpty { await stories.refresh() }
            let pool = stories.stories
            guard let story = ShortcutText.storyToPlay(id, last: PlaybackMemory.lastStoryId, stories: pool) else { return }
            let folder = StoryLibrary.folderOf(story)
            let queue = pool.filter { StoryLibrary.folderOf($0) == folder }
            StoryPlayer.shared.showsPlayer = true
            await StoryPlayer.shared.play(story, queue: queue, store: stories)
        case .openRecipe(let id):
            guard !kid.active else { return }
            area.current = .recipes
            kitchen.tab = .recipes
            kitchen.openRecipe = id
        case .bedtime:
            area.current = .stories
            Bedtime.shared.open()
        case .openList, .openWeek:
            guard !kid.active else { return }
            area.current = .recipes
            kitchen.tab = command == .openList ? .list : .week
        }
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

