import SwiftUI

/// Acasă on the stories side, redesign "Seară de lux, curățat" (design-polish/ios-stories-redesign/):
/// the "Povești  Rețete" switch, the cover in the middle with a glow from its colours (swipe
/// between the story to continue, tonight's story and the newest, with dots under it), then three
/// text tabs with a gold line: Diseară, În curs and Colecții. Favorite has its own tab at the bottom.
struct StoriesHomeView: View {
    enum HomeTab: String, CaseIterable { case diseara, incurs, colectii }

    let openLibrary: () -> Void
    @Environment(StoryStore.self) private var store
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var heroPage: String?
    @SceneStorage("kt-shome-tab2") private var tab: HomeTab = Self.launchTab

    private static var launchTab: HomeTab {
        switch LaunchOptions.screen {
        case "stories-colectii": .colectii
        case "stories-incurs", "stories-favorite": .incurs
        default: .diseara
        }
    }

    static func tabLabel(_ t: HomeTab) -> String {
        switch t {
        case .diseara: StoryHomePlan.evening ? "Diseară" : "Azi"
        case .incurs: "În curs"
        case .colectii: "Colecții"
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
                        VStack(alignment: .leading, spacing: 18) {
                            UnderlineTabs(selection: $tab, label: Self.tabLabel)
                            Group {
                                switch tab {
                                case .diseara: tonight(onTop: Set(slides.map(\.story.id)))
                                case .incurs: started
                                case .colectii: collections
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 4)
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
            .storyDetailDestination()
        }
        .onAppear {
            // Screenshots pick the tab; a tab kept from an earlier run must not win.
            if LaunchOptions.tab != nil { tab = Self.launchTab }
        }
    }

    private var topBar: some View {
        HStack(spacing: 14) {
            AreaPicker(current: .stories)
            Spacer()
            AlbumButton()
            Button(action: openLibrary) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Caută povești")
        }
        .padding(.leading, 20)
        .padding(.trailing, 12)
        .padding(.top, 2)
        .environment(\.colorScheme, .dark)
    }

    // MARK: Hero

    private func hero(_ slides: [StoryHomePlan.Slide]) -> some View {
        let queue = slides.map(\.story)
        let current = slides.first { $0.id == heroPage } ?? slides.first
        return GeometryReader { geo in
            let top = geo.safeAreaInsets.top + 58
            ZStack(alignment: .top) {
                if let current { HomeCoverGlow(story: current.story).id(current.id) }
                TabView(selection: $heroPage) {
                    ForEach(slides) { slide in
                        HeroCard(slide: slide, queue: queue, top: top)
                            .tag(Optional(slide.id))
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                pageDots(slides)
                    .padding(.top, top + HeroCard.coverSide + 12)
            }
        }
        .frame(height: 500)
        .animation(.easeInOut(duration: 0.35), value: heroPage)
    }

    private func pageDots(_ slides: [StoryHomePlan.Slide]) -> some View {
        let current = heroPage ?? slides.first?.id
        return HStack(spacing: 5) {
            ForEach(slides) { slide in
                Capsule()
                    .fill(slide.id == current ? Theme.Night.moon : Color.white.opacity(0.3))
                    .frame(width: slide.id == current ? 16 : 5, height: 5)
            }
        }
        .opacity(slides.count > 1 ? 1 : 0)
        .animation(.snappy, value: current)
        .accessibilityHidden(true)
    }

    // MARK: Tabs

    @ViewBuilder private func tonight(onTop: Set<String>) -> some View {
        let tonightRow = StoryHomePlan.tonight(store.stories).filter { !onTop.contains($0.id) }
        let recent = store.recent.filter { !onTop.contains($0.id) }
        VStack(alignment: .leading, spacing: 22) {
            QueueTonightCard()
            StoryCoverRow(title: StoryHomePlan.evening ? "Pentru diseară" : "Pentru azi", stories: tonightRow, openAll: openLibrary)
            StoryCoverRow(title: "Adăugate recent", stories: recent, openAll: openLibrary)
            if tonightRow.isEmpty && recent.isEmpty {
                NoteLink(text: "Toate poveștile", link: "Bibliotecă", action: openLibrary)
            }
            if !kid.active { FromTheKitchen() }
        }
    }

    @ViewBuilder private var started: some View {
        let list = StoryProgress.started(store.stories)
        if list.isEmpty {
            Text("Nimic început. Poveștile oprite la jumătate apar aici, cu cât a mai rămas.")
                .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                .foregroundStyle(Theme.Night.muted)
        } else {
            StoryCoverRow(title: "Începute", stories: list, openAll: openLibrary)
        }
    }

    @ViewBuilder private var collections: some View {
        let folders = store.folders.filter { !$0.items.isEmpty }
        if folders.isEmpty {
            NoteLink(text: "Nicio colecție încă.", link: "Bibliotecă", action: openLibrary)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(folders) { folder in
                    NavigationLink(value: folder) { CollectionCard(folder: folder) }
                        .buttonStyle(PressableStyle())
                }
                NoteLink(text: "Toată biblioteca", link: "Bibliotecă", action: openLibrary)
            }
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
                               message: "Din Adaugă poți crea o poveste, o citești tu sau încarci un fișier audio.")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
    }
}

/// Text tabs with a thin gold line under the chosen one, on a faint rule.
struct UnderlineTabs<T: Hashable & CaseIterable>: View where T.AllCases: RandomAccessCollection {
    @Binding var selection: T
    let label: (T) -> String

    var body: some View {
        HStack(spacing: 26) {
            ForEach(Array(T.allCases), id: \.self) { t in
                let on = t == selection
                Button {
                    Haptics.select()
                    withAnimation(.easeOut(duration: 0.2)) { selection = t }
                } label: {
                    VStack(spacing: 9) {
                        Text(label(t))
                            .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .subheadline))
                            .foregroundStyle(on ? Theme.text : Theme.Night.muted)
                        Capsule().fill(on ? Theme.Night.moon : .clear).frame(height: 2)
                    }
                    .fixedSize(horizontal: true, vertical: false)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.1)).frame(height: 1) }
    }
}

/// The hero's cover, blurred, as a coloured light behind the top of Acasă.
private struct HomeCoverGlow: View {
    let story: Story

    var body: some View {
        StoryCover(story: story, cornerRadius: 0, showsEmoji: false)
            .frame(width: 300, height: 300)
            .scaleEffect(1.7)
            .blur(radius: 70)
            .saturation(1.4)
            .opacity(0.6)
            .frame(maxWidth: .infinity)
            .frame(height: 520, alignment: .top)
            .padding(.top, 40)
            .mask(LinearGradient(colors: [.black, .black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .transition(.opacity)
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

/// A section of covers: the title with "Toate", then a row of 132-point covers with the length,
/// "Nou" and a gold progress line, the folder (or what is left) under the title. A tap opens the
/// story's page.
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
                            StoryOpenLink(story: story, queue: stories) {
                                CoverTile(story: story, width: 132)
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

/// A folder as a calm collection card: a faint neutral card, the name in serif, "4 povești ·
/// 36 min" with "2 noi" or "1 în curs" in gold text, and three covers fanned on the right.
struct CollectionCard: View {
    let folder: StoryFolder
    /// 104 points at the default text size, taller with bigger text so the title fits.
    @ScaledMetric(relativeTo: .headline) private var height: CGFloat = 104

    var body: some View {
        let art = folder.items.filter { $0.coverKey != nil } + folder.items.filter { $0.coverKey == nil }
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.title(folder))
                    .font(.custom(AppFont.storyDisplay, size: 20, relativeTo: .headline))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                (Text(folder.items.isEmpty ? "gol" : folder.subtitle).foregroundStyle(Theme.Night.muted)
                    + Text(Self.tags(folder)).foregroundStyle(Theme.Night.moon).bold())
                    .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if art.isEmpty {
                Text(folder.icon ?? "📁").font(.system(size: 40))
                    .frame(width: 76, height: 76)
            } else {
                HStack(spacing: -50) {
                    ForEach(Array(art.prefix(3).reversed().enumerated()), id: \.offset) { _, s in
                        StoryCover(story: s, cornerRadius: 9)
                            .frame(width: 76, height: 76)
                            .shadow(color: .black.opacity(0.5), radius: 8, x: -6, y: 6)
                    }
                }
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: height)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.055)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.07)))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(folder.name), \(folder.subtitle)")
    }

    static func title(_ folder: StoryFolder) -> String {
        [folder.icon, folder.name].compactMap { $0 }.joined(separator: " ")
    }

    /// " · 2 noi · 1 în curs" (empty when there is nothing new or started).
    static func tags(_ folder: StoryFolder) -> String {
        let fresh = folder.items.filter { PlaybackMemory.isNew($0) }.count
        let started = folder.items.filter { PlaybackMemory.position($0.id) > 5 }.count
        var out = ""
        if fresh > 0 { out += fresh == 1 ? " · 1 nouă" : " · \(fresh) noi" }
        if started > 0 { out += " · \(started) în curs" }
        return out
    }
}

/// One page of the hero: the whole cover in the middle (tap it for the story's page), the kicker,
/// the title in serif, the folder and length, then the gold Ascultă / Continuă and a plain heart.
private struct HeroCard: View {
    let slide: StoryHomePlan.Slide
    let queue: [Story]
    let top: CGFloat
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    static let coverSide: CGFloat = 188

    var body: some View {
        let story = slide.story
        let isCurrent = player.current?.id == story.id
        let playing = isCurrent && player.isPlaying
        VStack(spacing: 0) {
            StoryOpenLink(story: story, queue: queue) {
                StoryCover(story: story, cornerRadius: 14)
                    .frame(width: Self.coverSide, height: Self.coverSide)
                    .shadow(color: .black.opacity(0.55), radius: 26, y: 20)
            }
            .buttonStyle(PressableStyle())
            .accessibilityLabel(story.title)
            Text(slide.kicker.uppercased(with: Locale(identifier: "ro")))
                .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2)).tracking(1.5)
                .foregroundStyle(Theme.Night.moon)
                .lineLimit(1)
                .padding(.top, 30)
            Text(story.title)
                .font(.custom(AppFont.storyDisplay, size: 30, relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, 6)
            Text(story.detailLine)
                .font(.custom(AppFont.body, size: 14.5, relativeTo: .subheadline))
                .foregroundStyle(Theme.Night.muted)
                .padding(.top, 3)
            HStack(spacing: 22) {
                Button {
                    Haptics.tap()
                    if isCurrent { player.togglePlay() } else {
                        Task { await player.play(story, queue: queue, store: store) }
                        player.showsPlayer = true
                    }
                } label: {
                    Label(playing ? "Pauză" : slide.action, systemImage: playing ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.ktPrimary)
                FavoriteButton(story: story, size: 44)
            }
            .padding(.top, 18)
            .padding(.leading, 44)
            Spacer(minLength: 0)
        }
        .padding(.top, top)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
    }
}

/// A plain heart (no circle), gold when the story is a favourite.
struct FavoriteButton: View {
    let story: Story
    var size: CGFloat = 44
    @Environment(StoryStore.self) private var store

    var body: some View {
        let favorite = store.story(story.id)?.favorite ?? story.favorite
        Button {
            Haptics.tap()
            Task { await store.toggleFavorite(story.id) }
        } label: {
            Image(systemName: favorite ? "heart.fill" : "heart")
                .font(.system(size: size * 0.56, weight: .medium))
                .foregroundStyle(favorite ? Theme.Night.moon : Theme.text)
                .frame(width: size, height: size)
                .contentShape(Rectangle())
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
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
    /// Long press on a story: play next, add to the queue, play, favourite.
    func storyContextMenu(_ story: Story) -> some View { modifier(StoryContextMenu(story: story)) }
}

private struct StoryContextMenu: ViewModifier {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    func body(content: Content) -> some View {
        content.contextMenu {
            Section { QueueMenuItems(story: story) }
            Button { Task { await player.play(story, store: store) } } label: { Label("Ascultă acum", systemImage: "play.fill") }
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
