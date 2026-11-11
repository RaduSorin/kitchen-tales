import SwiftUI

/// Acasă on the stories side, like the web's src/pages/StoriesHome.tsx (design A1 "Topit în
/// poză"): the cover fills the top (swipe between the story to continue, tonight's story and the
/// newest) and fades into the night, where three tabs hold the rest: Diseară (tonight's stories,
/// the newest, a peek at the kitchen), Colecții (the folders as wide cards) and Favorite.
struct StoriesHomeView: View {
    enum HomeTab: String, CaseIterable { case diseara, colectii, favorite }

    let openLibrary: () -> Void
    @Environment(StoryStore.self) private var store
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var heroPage: String?
    @SceneStorage("kt-shome-tab") private var tab: HomeTab = Self.launchTab

    private static var launchTab: HomeTab {
        switch LaunchOptions.screen {
        case "stories-colectii": .colectii
        case "stories-favorite": .favorite
        default: .diseara
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if store.stories.isEmpty {
                        emptyState
                    } else {
                        let slides = StoryHomePlan.slides(store.stories, child: profile.settings.childName)
                        hero(slides)
                        VStack(alignment: .leading, spacing: 16) {
                            HomeSegTabs(selection: $tab) { t in
                                switch t {
                                case .diseara: StoryHomePlan.evening ? "Diseară" : "Azi"
                                case .colectii: "Colecții"
                                case .favorite: "Favorite"
                                }
                            }
                            Group {
                                switch tab {
                                case .diseara: tonight(onTop: Set(slides.map(\.story.id)))
                                case .colectii: collections
                                case .favorite: favorites
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    }
                }
                .padding(.bottom, 24)
            }
            .ignoresSafeArea(edges: .top)
            .scrollIndicators(.hidden)
            .ktNightBackground()
            .refreshable { await store.refresh() }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .top) { topBar }
            .navigationDestination(for: StoryFolder.self) { FolderView(folderName: $0.name) }
        }
        .onAppear {
            // Screenshots pick the tab; a tab kept from an earlier run must not win.
            if LaunchOptions.tab != nil { tab = Self.launchTab }
        }
    }

    private var topBar: some View {
        HStack {
            AreaPicker(current: .stories)
            Spacer()
            Button(action: openLibrary) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 38, height: 38)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.12)))
            }
            .accessibilityLabel("Caută povești")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .environment(\.colorScheme, .dark)
    }

    // MARK: Hero

    private func hero(_ slides: [StoryHomePlan.Slide]) -> some View {
        let queue = slides.map(\.story)
        return GeometryReader { geo in
            TabView(selection: $heroPage) {
                ForEach(slides) { slide in
                    HeroCard(slide: slide, queue: queue, topInset: geo.safeAreaInsets.top)
                        .tag(Optional(slide.id))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .overlay(alignment: .bottom) { pageDots(slides) }
        }
        .frame(height: 560)
    }

    private func pageDots(_ slides: [StoryHomePlan.Slide]) -> some View {
        let current = heroPage ?? slides.first?.id
        return HStack(spacing: 5) {
            ForEach(slides) { slide in
                Capsule()
                    .fill(slide.id == current ? Theme.Night.moon : Color.white.opacity(0.35))
                    .frame(width: slide.id == current ? 18 : 6, height: 6)
            }
        }
        .opacity(slides.count > 1 ? 1 : 0)
        .animation(.snappy, value: current)
        .padding(.bottom, 6)
        .accessibilityHidden(true)
    }

    // MARK: Tabs

    @ViewBuilder private func tonight(onTop: Set<String>) -> some View {
        let tonightRow = StoryHomePlan.tonight(store.stories).filter { !onTop.contains($0.id) }
        let recent = store.recent.filter { !onTop.contains($0.id) }
        VStack(alignment: .leading, spacing: 22) {
            StoryCoverRow(title: StoryHomePlan.evening ? "Pentru diseară" : "Pentru azi", stories: tonightRow, openAll: openLibrary)
            StoryCoverRow(title: "Adăugate recent", stories: recent, openAll: openLibrary)
            if tonightRow.isEmpty && recent.isEmpty {
                NoteLink(text: "Toate poveștile", link: "Bibliotecă", action: openLibrary)
            }
            if !kid.active { FromTheKitchen() }
        }
    }

    @ViewBuilder private var collections: some View {
        let folders = store.folders.filter { !$0.items.isEmpty }
        if folders.isEmpty {
            NoteLink(text: "Nicio colecție încă.", link: "Bibliotecă", action: openLibrary)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(folders) { folder in
                    NavigationLink(value: folder) { CollectionCard(folder: folder) }
                        .buttonStyle(PressableStyle())
                }
                NoteLink(text: "Toată biblioteca", link: "Bibliotecă", action: openLibrary)
            }
        }
    }

    @ViewBuilder private var favorites: some View {
        let list = Array(store.favorites.prefix(10))
        if list.isEmpty {
            Text("Apasă inima de la o poveste ca să apară aici.")
                .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                .foregroundStyle(Theme.Night.muted)
        } else {
            StoryCoverRow(title: "Favorite", stories: list, openAll: openLibrary)
        }
    }

    @ViewBuilder private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 140)
            switch store.phase {
            case .loading, .idle:
                ProgressView().tint(Theme.Night.moon)
                Text("Se încarcă poveștile…").font(.ktCallout).foregroundStyle(Theme.Night.muted)
            case .failed(let message):
                EmptyStateView(symbol: "wifi.exclamationmark", title: "Nu am putut încărca", message: message)
                Button("Încearcă din nou") { Task { await store.refresh() } }.buttonStyle(.ktPrimary)
            case .loaded:
                EmptyStateView(symbol: "moon.stars", title: "Nicio poveste încă",
                               message: "Adaugă prima poveste din aplicația web și apare aici.")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
    }
}

/// What the stories Acasă shows, by the web's rules (storiesOfTheDay and the slides in
/// StoriesHome.tsx).
enum StoryHomePlan {
    struct Slide: Identifiable {
        let story: Story
        let kicker: String
        let action: String
        var progress: Double?
        var id: String { story.id }
    }

    /// "Tonight" from 17:00 (the web follows the sunset over București).
    static var evening: Bool {
        let h = Calendar.current.component(.hour, from: Date())
        return h >= 17 || h < 5
    }

    /// Local days since 1970, so tonight's stories change at midnight here.
    static var day: Int {
        let now = Date()
        return Int((now.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: now))) / 86400)
    }

    static func continuing(_ stories: [Story]) -> Story? {
        guard let id = PlaybackMemory.lastStoryId, PlaybackMemory.position(id) > 5 else { return nil }
        return stories.first { $0.id == id }
    }

    /// A different set each day, starting with the story of the day, without the one to continue.
    static func tonight(_ stories: [Story], n: Int = 8) -> [Story] {
        let skip = continuing(stories)?.id
        let pool = stories.count > 1 ? stories.filter { $0.id != skip } : stories
        guard !pool.isEmpty else { return [] }
        let start = day % pool.count
        return Array((pool[start...] + pool[..<start]).prefix(n))
    }

    static func minutes(_ sec: Double) -> String { "\(max(1, Int((sec / 60).rounded()))) min" }

    static func slides(_ stories: [Story], child: String) -> [Slide] {
        var out: [Slide] = []
        func add(_ s: Slide?) { if let s, !out.contains(where: { $0.id == s.id }) { out.append(s) } }
        let forChild = child.isEmpty ? "" : " pentru \(child)"
        if let c = continuing(stories) {
            let pos = PlaybackMemory.position(c.id)
            let kicker: String
            if let d = c.durationSec, d > 0 { kicker = "Continuă · mai sunt " + minutes(max(0, d - pos)) }
            else { kicker = "Continuă · de la " + clockTime(pos) }
            add(Slide(story: c, kicker: kicker, action: "Continuă", progress: c.durationSec.map { min(1, pos / $0) }))
        }
        let night = tonight(stories)
        if let first = night.first {
            add(Slide(story: first, kicker: evening ? "Povestea de diseară" + forChild : "Povestea zilei", action: "Ascultă"))
        }
        if let newest = stories.first { add(Slide(story: newest, kicker: "Adăugată recent", action: "Ascultă")) }
        for s in night where out.count < 3 {
            add(Slide(story: s, kicker: evening ? "Tot pentru diseară" : "Tot pentru azi", action: "Ascultă"))
        }
        return out
    }
}

/// A section of covers: the title with "Toate", then a row of 124-point covers with the length
/// and "Nou" on them and the folder under the title.
struct StoryCoverRow: View {
    let title: String
    let stories: [Story]
    var openAll: (() -> Void)?
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        if !stories.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).font(.ktStoryTitle).foregroundStyle(Theme.text)
                    Spacer()
                    if let openAll {
                        Button("Toate", action: openAll)
                            .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .subheadline))
                            .foregroundStyle(Theme.Night.moon)
                    }
                }
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(stories) { story in
                            Button {
                                Task { await player.play(story, queue: stories, store: store) }
                                player.showsPlayer = true
                            } label: {
                                CoverTile(story: story, width: 124)
                            }
                            .buttonStyle(PressableStyle())
                            .storyContextMenu(story)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
                .padding(.horizontal, -20)
            }
        }
    }
}

/// "Toată biblioteca Bibliotecă": a muted line with a gold link.
struct NoteLink: View {
    let text: String
    let link: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            (Text(text + " ").foregroundStyle(Theme.Night.muted) + Text(link).foregroundStyle(Theme.Night.moon).bold())
                .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
        }
        .buttonStyle(.plain)
    }
}

/// "Din bucătărie": today's dishes (or the newest recipe), one tap from the recipes side.
private struct FromTheKitchen: View {
    @Environment(RecipeStore.self) private var recipes
    @Environment(KitchenModel.self) private var kitchen
    @Environment(AreaModel.self) private var area

    var body: some View {
        let today = recipes.entries(on: Date()).filter { !$0.leftovers }.compactMap { recipes.recipe($0.recipeId) }
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Din bucătărie").font(.ktStoryTitle).foregroundStyle(Theme.text)
                Spacer()
                Button("Săptămâna") { go(.week) }
                    .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .subheadline))
                    .foregroundStyle(Theme.Night.moon)
            }
            if !today.isEmpty {
                ForEach(Array(today.prefix(2).enumerated()), id: \.offset) { _, r in peek(r, label: "Azi în meniu") }
            } else if let r = recipes.recipes.first {
                peek(r, label: "Rețetă recentă")
            }
        }
    }

    private func go(_ tab: AppTab) {
        kitchen.tab = tab
        area.current = .recipes
    }

    private func peek(_ r: Recipe, label: String) -> some View {
        Button { go(.home) } label: {
            HStack(spacing: 12) {
                RecipePhoto(recipe: r, cornerRadius: 14).frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(.custom(AppFont.body, size: 12.5, relativeTo: .caption)).foregroundStyle(Theme.Night.muted)
                    Text(r.title).font(.custom(AppFont.storyDisplay, size: 17, relativeTo: .headline)).foregroundStyle(Theme.text).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .heavy)).foregroundStyle(Theme.Night.muted)
            }
            .padding(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 12))
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.06)))
        }
        .buttonStyle(PressableStyle())
    }
}

/// A folder as the web's collection card: tinted from its covers (blurred), the name with its
/// icon, "4 povești · 36 min", the Nou / în curs tags, and three covers fanned on the right.
struct CollectionCard: View {
    let folder: StoryFolder

    var body: some View {
        let art = folder.items.filter { $0.coverKey != nil } + folder.items.filter { $0.coverKey == nil }
        let fresh = folder.items.filter { PlaybackMemory.isNew($0) }.count
        let started = folder.items.filter { PlaybackMemory.position($0.id) > 5 }.count
        ZStack(alignment: .topLeading) {
            Group {
                if let first = art.first {
                    StoryCover(story: first, cornerRadius: 0, showsEmoji: false)
                        .scaleEffect(1.6)
                        .blur(radius: 24)
                        .saturation(1.5)
                        .brightness(-0.25)
                } else {
                    Color.white.opacity(0.06)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()

            VStack(alignment: .leading, spacing: 3) {
                Text([folder.icon, folder.name].compactMap { $0 }.joined(separator: " "))
                    .font(.custom(AppFont.storyDisplay, size: 19, relativeTo: .headline))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(folder.items.isEmpty ? "gol" : folder.subtitle)
                    .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                    .foregroundStyle(.white.opacity(0.78))
                Spacer(minLength: 0)
                if fresh > 0 || started > 0 {
                    HStack(spacing: 6) {
                        if fresh > 0 { tag(fresh == 1 ? "1 nouă" : "\(fresh) noi", gold: true) }
                        if started > 0 { tag("\(started) în curs", gold: false) }
                    }
                }
            }
            .padding(.leading, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.trailing, 170)

            if art.isEmpty {
                Text(folder.icon ?? "📁").font(.system(size: 44))
                    .frame(width: 86, height: 86)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.08)))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .padding(.trailing, 14)
            }
            HStack(spacing: -54) {
                ForEach(Array(art.prefix(3).reversed().enumerated()), id: \.offset) { _, s in
                    StoryCover(story: s, cornerRadius: 9)
                        .frame(width: 86, height: 86)
                        .shadow(color: .black.opacity(0.5), radius: 9, x: -6, y: 8)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, 14)
        }
        .frame(height: 132)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 14, y: 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(folder.name), \(folder.subtitle)")
    }

    private func tag(_ text: String, gold: Bool) -> some View {
        Text(text)
            .font(.custom(AppFont.bodyHeavy, size: 11.5, relativeTo: .caption2))
            .foregroundStyle(gold ? Theme.Night.ink : .white)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(Capsule().fill(gold ? Theme.Night.gold : .white.opacity(0.18)))
    }
}

/// One page of the hero: the cover to the edges, fading into the night sky, with the title and buttons.
private struct HeroCard: View {
    let slide: StoryHomePlan.Slide
    let queue: [Story]
    let topInset: CGFloat
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        let story = slide.story
        let isCurrent = player.current?.id == story.id
        ZStack(alignment: .bottomLeading) {
            StoryCover(story: story, cornerRadius: 0)
            LinearGradient(stops: [
                .init(color: .clear, location: 0.35),
                .init(color: Theme.Night.top.opacity(0.75), location: 0.7),
                .init(color: Theme.Night.top, location: 1),
            ], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                Text(slide.kicker.uppercased(with: Locale(identifier: "ro")))
                    .font(.ktLabel).tracking(1.2)
                    .foregroundStyle(Theme.Night.moon)
                    .lineLimit(1)
                Text(story.title)
                    .font(.custom(AppFont.storyDisplay, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(story.detailLine)
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text.opacity(0.8))
                if let p = slide.progress {
                    Capsule().fill(.white.opacity(0.2)).frame(width: 160, height: 4)
                        .overlay(alignment: .leading) { Capsule().fill(Theme.Night.moon).frame(width: 160 * p, height: 4) }
                        .padding(.top, 2)
                }
                HStack(spacing: 12) {
                    Button {
                        Haptics.tap()
                        if isCurrent { player.togglePlay() } else {
                            Task { await player.play(story, queue: queue, store: store) }
                            player.showsPlayer = true
                        }
                    } label: {
                        Label(isCurrent && player.isPlaying ? "Pauză" : slide.action,
                              systemImage: isCurrent && player.isPlaying ? "pause.fill" : "play.fill")
                    }
                    .buttonStyle(.ktPrimary)
                    FavoriteButton(story: story)
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 34)
        }
        .clipped()
    }
}

/// The round heart button, gold when the story is a favourite.
struct FavoriteButton: View {
    let story: Story
    var size: CGFloat = 48
    @Environment(StoryStore.self) private var store

    var body: some View {
        let favorite = store.story(story.id)?.favorite ?? story.favorite
        Button {
            Haptics.tap()
            Task { await store.toggleFavorite(story.id) }
        } label: {
            Image(systemName: favorite ? "heart.fill" : "heart")
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(favorite ? Theme.Night.moon : Theme.text)
                .frame(width: size, height: size)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.14)))
                .contentTransition(.symbolEffect(.replace))
        }
        .accessibilityLabel(favorite ? "Scoate de la favorite" : "Adaugă la favorite")
    }
}

/// A light press: the tile shrinks a little while held.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

extension View {
    /// Long press on a story: play, favourite.
    func storyContextMenu(_ story: Story) -> some View { modifier(StoryContextMenu(story: story)) }
}

private struct StoryContextMenu: ViewModifier {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    func body(content: Content) -> some View {
        content.contextMenu {
            Button { Task { await player.play(story, store: store) } } label: { Label("Ascultă", systemImage: "play.fill") }
            let favorite = store.story(story.id)?.favorite ?? story.favorite
            Button { Task { await store.toggleFavorite(story.id) } } label: {
                Label(favorite ? "Scoate de la favorite" : "Adaugă la favorite", systemImage: favorite ? "heart.slash" : "heart")
            }
            if store.offline.saved.contains(story.id) {
                Button(role: .destructive) { store.offline.remove([story.id]) } label: {
                    Label("Șterge de pe telefon", systemImage: "trash")
                }
            } else {
                Button { Task { await store.offline.download(story, links: store.links) } } label: {
                    Label("Descarcă pentru offline", systemImage: "arrow.down.circle")
                }
            }
        } preview: {
            StoryCover(story: story).frame(width: 260, height: 260)
                .environment(store)
        }
    }
}
