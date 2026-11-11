import SwiftUI

/// Bibliotecă: large title, search, and three ways to look at the folders: Dosare (coloured
/// cards), Raft (a shelf of covers per folder) and Cover Flow.
struct LibraryView: View {
    enum Mode: String, CaseIterable, Hashable {
        case folders = "Dosare", shelf = "Raft", coverFlow = "Cover Flow"
    }

    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @AppStorage("library-mode") private var mode: Mode = .folders
    @State private var query = ""
    @State private var path: [StoryFolder] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("Vizualizare", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)

                    if store.showingCopy {
                        Label("Fără internet: se vede copia de pe telefon.", systemImage: "icloud.slash")
                            .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                            .padding(.horizontal, 16)
                    }

                    if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                        results
                    } else if store.stories.isEmpty && store.folderRows.isEmpty {
                        EmptyStateView(symbol: "books.vertical", title: store.phase == .loading ? "Se încarcă…" : "Biblioteca e goală",
                                       message: "Poveștile adăugate în aplicația web apar aici.")
                            .padding(.top, 60)
                    } else {
                        switch mode {
                        case .folders: folderGrid
                        case .shelf: shelves
                        case .coverFlow: CoverFlow(stories: store.stories)
                        }
                    }
                }
                .padding(.bottom, 24)
                .animation(.snappy, value: mode)
            }
            .scrollIndicators(.hidden)
            .ktNightBackground()
            .refreshable { await store.refresh() }
            .navigationTitle("Bibliotecă")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută povești")
            .navigationDestination(for: StoryFolder.self) { FolderView(folderName: $0.name) }
        }
        .onAppear {
            // Screenshots: `-screen folder` opens the first folder.
            if LaunchOptions.screen == "folder", path.isEmpty, let first = store.folders.first(where: { !$0.items.isEmpty }) {
                path = [first]
            }
        }
    }

    private var folderGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(store.folders) { folder in
                NavigationLink(value: folder) {
                    FolderCard(folder: folder).aspectRatio(1, contentMode: .fit)
                }
                .buttonStyle(PressableStyle())
                .contextMenu { FolderActions(folder: folder) }
            }
        }
        .padding(.horizontal, 16)
    }

    private var shelves: some View {
        LazyVStack(alignment: .leading, spacing: 22) {
            ForEach(store.folders.filter { !$0.items.isEmpty }) { folder in
                VStack(alignment: .leading, spacing: 10) {
                    NavigationLink(value: folder) {
                        HStack(spacing: 6) {
                            Text(folder.name).font(.ktKidsHeadline).foregroundStyle(Theme.text)
                            Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(Theme.Night.muted)
                            Spacer()
                            Text(folder.subtitle).font(.ktCaption).foregroundStyle(Theme.Night.muted)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(folder.items) { story in
                                Button { Task { await player.play(story, queue: folder.items, store: store) } } label: {
                                    CoverTile(story: story, width: 112)
                                }
                                .buttonStyle(PressableStyle())
                                .storyContextMenu(story)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .scrollIndicators(.hidden)
                    // The wooden shelf the covers stand on.
                    Capsule().fill(Color.white.opacity(0.08)).frame(height: 3).padding(.horizontal, 16)
                }
            }
        }
    }

    private var results: some View {
        let found = store.search(query)
        return LazyVStack(spacing: 0) {
            if found.isEmpty {
                Text("Nicio poveste găsită pentru „\(query.trimmingCharacters(in: .whitespaces))”.")
                    .font(.ktCallout).foregroundStyle(Theme.Night.muted)
                    .padding(.top, 40)
            }
            ForEach(found) { story in
                StoryRow(story: story, queue: found)
                Divider().overlay(Color.white.opacity(0.06)).padding(.leading, 84)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// A folder as a coloured card: the first cover tints it and up to three covers fan out on top.
struct FolderCard: View {
    let folder: StoryFolder

    var body: some View {
        let art = folder.items.filter { $0.coverKey != nil } + folder.items.filter { $0.coverKey == nil }
        let scene = art.first.map { CoverScene.of($0) } ?? CoverScene.of(title: folder.name, scene: nil)
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [Color(hex: scene.top).opacity(0.85), Color(hex: scene.bottom).opacity(0.95)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { geo in
                let side = min(geo.size.width * 0.36, 64)
                ZStack {
                    if art.isEmpty {
                        Text(folder.icon ?? "📁").font(.system(size: side * 0.6))
                    }
                    ForEach(Array(art.prefix(3).enumerated().reversed()), id: \.element.id) { pair in
                        FannedCover(story: pair.element, index: pair.offset, side: side)
                    }
                }
                .frame(width: geo.size.width - 14, height: side + 20, alignment: .trailing)
                .padding(.top, 12)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text([folder.icon, folder.name].compactMap { $0 }.joined(separator: " "))
                    .font(.custom(AppFont.storyDisplay, size: 18, relativeTo: .headline))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(folder.items.isEmpty ? "gol" : folder.subtitle)
                    .font(.ktCaption)
                    .foregroundStyle(Theme.text.opacity(0.75))
            }
            .padding(12)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).strokeBorder(.white.opacity(0.1)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(folder.name), \(folder.subtitle)")
    }
}

/// One of the covers fanned out on a folder card (0 is in front).
private struct FannedCover: View {
    let story: Story
    let index: Int
    let side: CGFloat

    var body: some View {
        let step = CGFloat(index)
        let angle: Angle = .degrees(Double(index) * -7)
        StoryCover(story: story, cornerRadius: 8)
            .frame(width: side, height: side)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.white.opacity(0.7), lineWidth: 1.5))
            .rotationEffect(angle)
            .offset(x: step * side * -0.42, y: step * 2)
            .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
    }
}

/// Long-press menu on a folder: play all, shuffle.
private struct FolderActions: View {
    let folder: StoryFolder
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        if let first = folder.items.first {
            Button { Task { await player.play(first, queue: folder.items, store: store) } } label: {
                Label("Redă tot", systemImage: "play.fill")
            }
            Button {
                let mixed = folder.items.shuffled()
                Task { await player.play(mixed[0], queue: mixed, store: store) }
            } label: { Label("Amestecă", systemImage: "shuffle") }
            let missing = folder.items.filter { !store.offline.saved.contains($0.id) }
            if !missing.isEmpty {
                Button { Task { await store.offline.download(missing, links: store.links) } } label: {
                    Label("Descarcă pentru offline", systemImage: "arrow.down.circle")
                }
            } else {
                Button(role: .destructive) { store.offline.remove(folder.items.map(\.id)) } label: {
                    Label("Șterge de pe telefon", systemImage: "trash")
                }
            }
        }
    }
}

/// One story in a list: cover, title, folder and length, the heart; tap to listen.
struct StoryRow: View {
    let story: Story
    let queue: [Story]
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        HStack(spacing: 14) {
            Button { Task { await player.play(story, queue: queue, store: store) } } label: {
                HStack(spacing: 14) {
                    StoryCover(story: story, cornerRadius: 10)
                        .frame(width: 60, height: 60)
                        .overlay(alignment: .bottomTrailing) {
                            if player.current?.id == story.id {
                                Image(systemName: player.isPlaying ? "speaker.wave.2.fill" : "pause.fill")
                                    .font(.caption2.bold()).foregroundStyle(Theme.Night.ink)
                                    .padding(4).background(Circle().fill(Theme.Night.moon)).padding(3)
                            }
                        }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(story.title).font(.ktBodyEmphasis).foregroundStyle(Theme.text).lineLimit(2)
                        HStack(spacing: 5) {
                            OfflineBadge(id: story.id)
                            Text(story.detailLine)
                                .font(.ktFootnote).foregroundStyle(Theme.Night.muted).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            FavoriteButton(story: story, size: 36)
        }
        .padding(.vertical, 8)
        .storyContextMenu(story)
    }
}

/// A folder's stories, with Redă tot and Amestecă on top.
struct FolderView: View {
    let folderName: String
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        let folder = store.folders.first { $0.name == folderName }
        let items = folder?.items ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let folder {
                    Text(folder.items.isEmpty ? "Niciun fișier încă." : folder.subtitle)
                        .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                }
                if !items.isEmpty {
                    HStack(spacing: 12) {
                        Button { Task { await player.play(items[0], queue: items, store: store) } } label: {
                            Label("Redă tot", systemImage: "play.fill")
                        }
                        .buttonStyle(.ktPrimaryWide)
                        Button {
                            let mixed = items.shuffled()
                            Task { await player.play(mixed[0], queue: mixed, store: store) }
                        } label: { Label("Amestecă", systemImage: "shuffle") }
                        .buttonStyle(.ktSecondaryWide)
                    }
                }
                LazyVStack(spacing: 0) {
                    ForEach(items) { story in
                        StoryRow(story: story, queue: items)
                        Divider().overlay(Color.white.opacity(0.06)).padding(.leading, 74)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .ktNightBackground()
        .navigationTitle(folderName)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if !items.isEmpty {
                ToolbarItem(placement: .topBarTrailing) { FolderDownloadButton(items: items) }
            }
        }
    }
}

/// Covers in a row that turn as they move away from the middle, like Cover Flow on the iPod.
struct CoverFlow: View {
    let stories: [Story]
    @State private var centered: String?
    private let side: CGFloat = 220

    var body: some View {
        VStack(spacing: 18) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: -40) {
                    ForEach(stories) { story in
                        CoverFlowItem(story: story, queue: stories, side: side).id(story.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $centered)
            .contentMargins(.horizontal, 80, for: .scrollContent)
            .scrollIndicators(.hidden)
            .frame(height: side + 30)
            caption
        }
        .padding(.top, 20)
    }

    @ViewBuilder private var caption: some View {
        let id = centered ?? stories.first?.id
        if let story = stories.first(where: { $0.id == id }) {
            CoverCaption(story: story)
                .padding(.horizontal, 24)
                .animation(.snappy, value: centered)
        }
    }
}

private struct CoverFlowItem: View {
    let story: Story
    let queue: [Story]
    let side: CGFloat
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        Button(action: play) {
            StoryCover(story: story, cornerRadius: 10)
                .frame(width: side, height: side)
                .shadow(color: .black.opacity(0.5), radius: 12, y: 8)
        }
        .buttonStyle(PressableStyle())
        .scrollTransition(.interactive, axis: .horizontal) { content, phase in
            content.coverFlowTurn(phase.value)
        }
    }

    private func play() {
        Task { await player.play(story, queue: queue, store: store) }
    }
}

private extension VisualEffect {
    /// -1 (left) ... 0 (middle) ... 1 (right): turned, smaller and dimmer away from the middle.
    func coverFlowTurn(_ value: Double) -> some VisualEffect {
        let distance: Double = abs(value)
        let angle: Angle = .degrees(value * -55)
        return self
            .rotation3DEffect(angle, axis: (x: 0, y: 1, z: 0), perspective: 0.5)
            .scaleEffect(1 - distance * 0.18)
            .opacity(1 - distance * 0.25)
    }
}

private struct CoverCaption: View {
    let story: Story

    var body: some View {
        VStack(spacing: 4) {
            Text(story.title)
                .font(.ktStoryTitle)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(story.detailLine)
                .font(.ktFootnote)
                .foregroundStyle(Theme.Night.muted)
        }
    }
}

/// Favorite: every story with a heart, as a grid of covers.
struct FavoritesView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        NavigationStack {
            ScrollView {
                let favorites = store.favorites
                if favorites.isEmpty {
                    EmptyStateView(symbol: "heart", title: "Nicio poveste favorită",
                                   message: "Apasă inima de pe o poveste și o găsești aici.")
                        .padding(.top, 80)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 14)], spacing: 18) {
                        ForEach(favorites) { story in
                            Button { Task { await player.play(story, queue: favorites, store: store) } } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    StoryCover(story: story).aspectRatio(1, contentMode: .fit)
                                        .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
                                    Text(story.title).font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                                        .foregroundStyle(Theme.text).lineLimit(1)
                                    Text(story.detailLine)
                                        .font(.ktCaption).foregroundStyle(Theme.Night.muted).lineLimit(1)
                                }
                            }
                            .buttonStyle(PressableStyle())
                            .storyContextMenu(story)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
            .scrollIndicators(.hidden)
            .ktNightBackground()
            .refreshable { await store.refresh() }
            .navigationTitle("Favorite")
        }
    }
}

/// A small arrow next to a story saved on the phone (a spinner while it downloads).
struct OfflineBadge: View {
    let id: String
    @Environment(StoryStore.self) private var store

    var body: some View {
        if store.offline.downloading.contains(id) {
            ProgressView().controlSize(.mini).tint(Theme.Night.moon)
        } else if store.offline.saved.contains(id) {
            Image(systemName: "arrow.down.circle.fill")
                .font(.caption)
                .foregroundStyle(Theme.Night.moon)
                .accessibilityLabel("Salvată pe telefon")
        }
    }
}

/// Folder page: download the whole folder, or see that it is all on the phone.
private struct FolderDownloadButton: View {
    let items: [Story]
    @Environment(StoryStore.self) private var store

    var body: some View {
        let offline = store.offline
        let missing = items.filter { !offline.saved.contains($0.id) }
        let busy = items.contains { offline.downloading.contains($0.id) }
        Button {
            Task { await offline.download(missing, links: store.links) }
        } label: {
            if busy {
                ProgressView().tint(Theme.Night.moon)
            } else {
                Image(systemName: missing.isEmpty ? "checkmark.circle.fill" : "arrow.down.circle")
            }
        }
        .disabled(missing.isEmpty || busy)
        .accessibilityLabel(missing.isEmpty ? "Tot dosarul e pe telefon" : "Descarcă dosarul pentru offline")
    }
}
