import SwiftUI

/// Acasă on the stories side, "Vitrina de seară": a large cover that changes with a swipe
/// (with Continuă or Ascultă), then "Pentru diseară", Colecții and "Adăugate recent".
struct StoriesHomeView: View {
    let openLibrary: () -> Void
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @State private var heroPage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if store.stories.isEmpty {
                        emptyState
                    } else {
                        hero
                        shelf("Pentru diseară", stories: store.forTonight)
                        collections
                        shelf("Adăugate recent", stories: store.recent)
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

    private var hero: some View {
        let items = store.heroStories
        return GeometryReader { geo in
            TabView(selection: $heroPage) {
                ForEach(items) { story in
                    HeroCard(story: story, queue: items, topInset: geo.safeAreaInsets.top)
                        .tag(Optional(story.id))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .overlay(alignment: .bottom) { pageDots(items) }
        }
        .frame(height: 560)
    }

    private func pageDots(_ items: [Story]) -> some View {
        let current = heroPage ?? items.first?.id
        return HStack(spacing: 5) {
            ForEach(items) { story in
                Capsule()
                    .fill(story.id == current ? Theme.Night.moon : Color.white.opacity(0.35))
                    .frame(width: story.id == current ? 18 : 6, height: 6)
            }
        }
        .animation(.snappy, value: current)
        .padding(.bottom, 6)
        .accessibilityHidden(true)
    }

    // MARK: Shelves

    private func shelf(_ title: String, stories: [Story]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.ktStoryTitle).foregroundStyle(Theme.text)
                Spacer()
                Button("Toate", action: openLibrary)
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.Night.moon)
            }
            .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(stories) { story in
                        Button {
                            Task { await player.play(story, queue: stories, store: store) }
                        } label: {
                            CoverTile(story: story)
                        }
                        .buttonStyle(PressableStyle())
                        .storyContextMenu(story)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var collections: some View {
        let folders = store.folders.filter { !$0.items.isEmpty }
        return VStack(alignment: .leading, spacing: 12) {
            Text("Colecții").font(.ktStoryTitle).foregroundStyle(Theme.text)
                .padding(.horizontal, 20)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(folders) { folder in
                        NavigationLink(value: folder) {
                            FolderCard(folder: folder)
                                .frame(width: 168, height: 150)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
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

/// One page of the hero: the cover to the edges, fading into the night sky, with the title and buttons.
private struct HeroCard: View {
    let story: Story
    let queue: [Story]
    let topInset: CGFloat
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        let paused = PlaybackMemory.position(story.id)
        let isCurrent = player.current?.id == story.id
        let resumes = paused > 5 || isCurrent
        ZStack(alignment: .bottomLeading) {
            StoryCover(story: story, cornerRadius: 0)
            LinearGradient(stops: [
                .init(color: .clear, location: 0.35),
                .init(color: Theme.Night.top.opacity(0.75), location: 0.7),
                .init(color: Theme.Night.top, location: 1),
            ], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                Text(eyebrow(paused: paused, resumes: resumes))
                    .font(.ktLabel).tracking(1.2)
                    .foregroundStyle(Theme.Night.moon)
                Text(story.title)
                    .font(.custom(AppFont.storyDisplay, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(story.detailLine)
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text.opacity(0.8))
                HStack(spacing: 12) {
                    Button {
                        Haptics.tap()
                        if isCurrent { player.togglePlay() } else { Task { await player.play(story, queue: queue, store: store) } }
                    } label: {
                        Label(isCurrent && player.isPlaying ? "Pauză" : resumes ? "Continuă" : "Ascultă",
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

    private func eyebrow(paused: Double, resumes: Bool) -> String {
        if resumes, let d = story.durationSec, d > paused {
            let left = max(1, Int(((d - paused) / 60).rounded()))
            return "CONTINUĂ · MAI SUNT \(left) MIN"
        }
        return StoryLibrary.greeting().uppercased(with: Locale(identifier: "ro"))
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
        } preview: {
            StoryCover(story: story).frame(width: 260, height: 260)
                .environment(store)
        }
    }
}
