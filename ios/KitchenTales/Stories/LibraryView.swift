import SwiftUI

/// Bibliotecă: large title, search, and three ways to look at the folders: Dosare (coloured
/// cards), Raft (a shelf of covers per folder) and Cover Flow.
struct LibraryView: View {
    enum Mode: String, CaseIterable, Hashable {
        case folders = "Dosare", shelf = "Raft", coverFlow = "Cover Flow"
    }

    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @AppStorage("library-mode") private var mode: Mode = .folders
    @State private var query = ""
    @State private var creating = LaunchOptions.screen == "folder-new"
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
            if ["folder", "folder-menu", "folder-edit", "folder-delete", "folder-share"].contains(LaunchOptions.screen ?? ""), path.isEmpty, let first = store.folders.first(where: { !$0.items.isEmpty }) {
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
            if !kid.active {
                Button { creating = true } label: { NewFolderCard().aspectRatio(1, contentMode: .fit) }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel("Folder nou")
            }
        }
        .padding(.horizontal, 16)
        .sheet(isPresented: $creating) { FolderSheet(folder: nil) }
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
                                    CoverTile(story: story, width: 112, showsFolder: false)
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
                    Label("Șterge de pe dispozitiv", systemImage: "trash")
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

/// A folder's stories, shown as Pătrate, Listă, Raft or Cover Flow, with the folder's ⋯ menu.
struct FolderView: View {
    enum Look: String, CaseIterable {
        case squares = "Pătrate", list = "Listă", shelf = "Raft", coverFlow = "Cover Flow"
        var symbol: String {
            switch self {
            case .squares: "square.grid.2x2"
            case .list: "list.bullet"
            case .shelf: "books.vertical"
            case .coverFlow: "rectangle.stack"
            }
        }
    }

    let folderName: String
    @State private var name: String
    @State private var adding: AddMode?
    @State private var editing = LaunchOptions.screen == "folder-edit" || LaunchOptions.screen == "folder-delete"
    @State private var askShare = LaunchOptions.screen == "folder-share"
    @AppStorage("folder-look") private var look: Look = .list
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KitchenModel.self) private var kitchen
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss

    init(folderName: String) {
        self.folderName = folderName
        _name = State(initialValue: folderName)
    }

    var body: some View {
        let folder = store.folders.first { $0.name == name }
        let items = folder?.items ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let folder {
                    Text(folder.items.isEmpty ? "Niciun fișier încă." : folder.subtitle)
                        .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                        .padding(.horizontal, 16)
                }
                if !items.isEmpty {
                    HStack(spacing: 12) {
                        Button { play(items) } label: { Label("Redă tot", systemImage: "play.fill") }
                            .buttonStyle(.ktPrimaryWide)
                        Button { play(items.shuffled()) } label: { Label("Amestecă", systemImage: "shuffle") }
                            .buttonStyle(.ktSecondaryWide)
                    }
                    .padding(.horizontal, 16)
                    stories(items)
                }
            }
            .padding(.bottom, 24)
            .animation(.snappy, value: look)
        }
        .ktNightBackground()
        .navigationTitle([folder?.icon, name].compactMap { $0 }.joined(separator: " "))
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if let folder, folder.mine, !folder.builtin, !kid.active {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ForEach(AddMode.allCases) { mode in
                            Button { adding = mode } label: { Label(mode.title, systemImage: mode.symbol) }
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill").foregroundStyle(Theme.accent)
                    }
                    .accessibilityLabel("Adaugă o poveste în folder")
                }
            }
            ToolbarItem(placement: .topBarTrailing) { moreMenu(folder, items) }
        }
        .fullScreenCover(item: $adding) { mode in
            AddFlow(mode: mode, folder: name)
        }
        .sheet(isPresented: $editing) {
            if let folder {
                FolderSheet(folder: folder, onDeleted: { dismiss() }, onRenamed: { name = $0 })
            }
        }
        .confirmationDialog("Cine vede folderul?", isPresented: $askShare, titleVisibility: .visible) {
            if let folder { shareButtons(folder) }
        } message: {
            if let folder { Text(Self.shareText(folder)) }
        }
    }

    @ViewBuilder private func stories(_ items: [Story]) -> some View {
        switch look {
        case .squares:
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], alignment: .leading, spacing: 16) {
                ForEach(items) { story in
                    Button { play(items, from: story) } label: { SquareTile(story: story) }
                        .buttonStyle(PressableStyle())
                        .storyContextMenu(story)
                }
            }
            .padding(.horizontal, 16)
        case .list:
            LazyVStack(spacing: 0) {
                ForEach(items) { story in
                    StoryRow(story: story, queue: items)
                    Divider().overlay(Color.white.opacity(0.06)).padding(.leading, 74)
                }
            }
            .padding(.horizontal, 16)
        case .shelf:
            // Rows of three covers, each standing on its shelf.
            let rows = stride(from: 0, to: items.count, by: 3).map { Array(items[$0..<min($0 + 3, items.count)]) }
            LazyVStack(alignment: .leading, spacing: 18) {
                ForEach(rows, id: \.first!.id) { row in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(row) { story in
                                Button { play(items, from: story) } label: { CoverTile(story: story, width: 104, showsFolder: false) }
                                    .buttonStyle(PressableStyle())
                                    .storyContextMenu(story)
                            }
                        }
                        Capsule().fill(Color.white.opacity(0.08)).frame(height: 3)
                    }
                }
            }
            .padding(.horizontal, 16)
        case .coverFlow:
            CoverFlow(stories: items)
        }
    }

    private func moreMenu(_ folder: StoryFolder?, _ items: [Story]) -> some View {
        let missing = items.filter { !store.offline.saved.contains($0.id) }
        return Menu {
            Section("Vizualizare") {
                ControlGroup {
                    ForEach(Look.allCases, id: \.self) { l in
                        Button { Haptics.select(); look = l } label: {
                            Label(l.rawValue, systemImage: l == look ? "checkmark.circle.fill" : l.symbol)
                        }
                    }
                }
            }
            if !items.isEmpty {
                Section {
                    Button { play(items) } label: { Label("Redă tot", systemImage: "play.fill") }
                    Button { play(items.shuffled()) } label: { Label("Amestecă", systemImage: "shuffle") }
                }
            }
            if let folder, !kid.active {
                Section {
                    if folder.mine && !folder.builtin {
                        Button { askShare = true } label: { Label("Partajează folderul", systemImage: folder.shared ? "person.2.fill" : "person.2") }
                    }
                    if !items.isEmpty {
                        if missing.isEmpty {
                            Button { store.offline.remove(items.map(\.id)) } label: { Label("Șterge de pe dispozitiv", systemImage: "iphone.slash") }
                        } else {
                            Button { Task { await store.offline.download(missing, links: store.links) } } label: {
                                Label("Salvează pentru offline (\(missing.count))", systemImage: "arrow.down.circle")
                            }
                        }
                    }
                    if folder.mine && !folder.builtin {
                        Button { editing = true } label: { Label("Redenumește", systemImage: "pencil") }
                    }
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("Mai multe")
    }

    @ViewBuilder private func shareButtons(_ folder: StoryFolder) -> some View {
        let total = folder.items.filter(\.mine).count
        let privateCount = total - folder.sharedCount
        if !folder.shared {
            Button("Partajează cu toate conturile" + (privateCount > 0 && folder.sharedCount > 0 ? " (încă \(Self.many(privateCount)))" : "")) {
                share(folder, true)
            }
        }
        if folder.sharedCount > 0 || (total == 0 && folder.rowShared) {
            Button("Doar în spațiul nostru") { share(folder, false) }
        }
        Button("Renunță", role: .cancel) {}
    }

    static func many(_ n: Int) -> String { n == 1 ? "o poveste" : "\(n) povești" }

    /// What the web's "Cine vede folderul?" says about the folder now.
    static func shareText(_ folder: StoryFolder) -> String {
        let total = folder.items.filter(\.mine).count
        let privateCount = total - folder.sharedCount
        let state: String
        if total == 0 {
            state = folder.rowShared ? "Folderul e partajat cu toate conturile." : "Folderul e doar în spațiul nostru."
        } else if folder.shared {
            state = "Toate cele \(many(total)) sunt partajate cu toate conturile."
        } else if folder.sharedCount > 0 {
            state = "\(folder.sharedCount) din \(total) povești sunt partajate cu toate conturile, \(privateCount == 1 ? "una e" : "\(privateCount) sunt") doar în spațiul nostru."
        } else {
            state = total == 1 ? "Povestea e doar în spațiul nostru." : "Toate cele \(total) povești sunt doar în spațiul nostru."
        }
        return state + "\n\nPartajarea se aplică folderului și fiecărei povești din el. Poveștile adăugate apoi în folder îi iau partajarea."
    }

    private func share(_ folder: StoryFolder, _ on: Bool) {
        Task {
            do {
                try await store.setFolderShared(folder, on, spaceName: mySpaceName(profile, auth))
                Haptics.success()
                kitchen.say(on ? "Folderul e partajat cu toate conturile" : "Folderul e acum doar în spațiul nostru")
            } catch {
                kitchen.say("Nu am putut schimba partajarea. Verifică internetul.")
            }
        }
    }

    private func play(_ queue: [Story], from story: Story? = nil) {
        guard let first = story ?? queue.first else { return }
        Task { await player.play(first, queue: queue, store: store) }
    }
}

/// A story as a square cover with its title and length under it ("Pătrate").
private struct SquareTile: View {
    let story: Story

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            StoryCover(story: story, cornerRadius: 16)
                .aspectRatio(1, contentMode: .fit)
            Text(story.title).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.text).lineLimit(1)
            if let time = story.minutesLabel {
                Text(time).font(.system(size: 12)).foregroundStyle(Theme.Night.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Covers in a row that turn as they move away from the middle, like Cover Flow on the iPod.
struct CoverFlow: View {
    let stories: [Story]
    @State private var centered: String?
    @AppStorage(PhoneSettings.shelfClickKey) private var shelfClick = true
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
            .onChange(of: centered) { old, _ in if old != nil, shelfClick { Haptics.select() } }
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

