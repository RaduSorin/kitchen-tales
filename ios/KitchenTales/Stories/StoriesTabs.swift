import SwiftUI

/// The stories-side tabs from the concept: Acasă, Favorite, Bibliotecă, Adaugă, Profil.
enum StoryTab: String, CaseIterable, Hashable {
    case home, favorites, library, add, profile
}

struct StoriesTabs: View {
    @State private var tab: StoryTab = LaunchOptions.tab.flatMap(StoryTab.init(rawValue:)) ?? .home
    @Environment(StoryStore.self) private var store

    var body: some View {
        TabView(selection: $tab) {
            Tab("Acasă", systemImage: "house.fill", value: StoryTab.home) {
                StoriesHomeView(openLibrary: { tab = .library })
                    .miniPlayerInset()
            }
            Tab("Favorite", systemImage: "heart", value: StoryTab.favorites) {
                FavoritesView()
                    .miniPlayerInset()
            }
            Tab("Bibliotecă", systemImage: "books.vertical", value: StoryTab.library) {
                LibraryView()
                    .miniPlayerInset()
            }
            Tab("Adaugă", systemImage: "plus", value: StoryTab.add) {
                NavigationStack {
                    EmptyStateView(symbol: "plus.circle", title: "În curând",
                                   message: "Adăugarea unei povești (fișier, înregistrare sau poveste nouă) vine într-un pas următor. Până atunci, adaug-o din aplicația web.")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .ktNightBackground()
                        .navigationTitle("Adaugă")
                }
                .miniPlayerInset()
            }
            Tab("Profil", systemImage: "person.crop.circle", value: StoryTab.profile) {
                ProfileView()
                    .miniPlayerInset()
            }
        }
        .onChange(of: tab) { Haptics.select() }
        .storyPlayerSheet()
        .task {
            if let first = store.stories.first, ["player", "mini-player"].contains(LaunchOptions.screen) {
                await StoryPlayer.shared.play(first, queue: store.stories, store: store)
                StoryPlayer.shared.showsPlayer = LaunchOptions.screen == "player"
            }
            await store.refresh()
        }
    }
}

// MARK: Mini-player

extension View {
    /// The mini-player above the tab bar while a story is open (on both sides of the app).
    func miniPlayerInset() -> some View { modifier(MiniPlayerInset()) }

    /// The full-screen player sheet.
    func storyPlayerSheet() -> some View { modifier(PlayerSheet()) }
}

private struct MiniPlayerInset: ViewModifier {
    @Environment(StoryPlayer.self) private var player

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            if player.current != nil {
                MiniPlayer()
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: player.current?.id)
    }
}

private struct PlayerSheet: ViewModifier {
    @Environment(StoryPlayer.self) private var player

    func body(content: Content) -> some View {
        @Bindable var player = player
        content.sheet(isPresented: $player.showsPlayer) {
            PlayerView()
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(Theme.Radius.sheet)
        }
    }
}

struct MiniPlayer: View {
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        if let story = player.current {
            HStack(spacing: 12) {
                StoryCover(story: story, cornerRadius: 8)
                    .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(story.title)
                        .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    Text(player.isLoading ? "Se deschide…" : player.duration > 0 ? "\(clockTime(player.remaining)) rămase" : StoryLibrary.folderOf(story))
                        .font(.ktCaption)
                        .foregroundStyle(Theme.Night.muted)
                        .monospacedDigit()
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Button { player.togglePlay(); Haptics.tap() } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                        .frame(width: 40, height: 40)
                }
                .accessibilityLabel(player.isPlaying ? "Pauză" : "Redă")
                Button { player.skip(-15); Haptics.tap() } label: {
                    Image(systemName: "gobackward.15")
                        .font(.title3)
                        .frame(width: 40, height: 40)
                }
                .accessibilityLabel("Înapoi 15 secunde")
            }
            .foregroundStyle(Theme.text)
            .padding(.leading, 8)
            .padding(.trailing, 6)
            .frame(height: 56)
            .background {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.ultraThinMaterial)
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color(hex: CoverScene.of(story).top).opacity(0.25))
                    if player.duration > 0 {
                        GeometryReader { geo in
                            Capsule().fill(Theme.Night.moon)
                                .frame(width: geo.size.width * min(1, player.position / player.duration), height: 2)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                        }
                        .padding(.horizontal, 14)
                        .padding(.bottom, 1)
                    }
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.12)))
            .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
            .contentShape(RoundedRectangle(cornerRadius: 16))
            .onTapGesture { player.showsPlayer = true }
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Deschide playerul") { player.showsPlayer = true }
            .environment(\.colorScheme, .dark)
        }
    }
}
