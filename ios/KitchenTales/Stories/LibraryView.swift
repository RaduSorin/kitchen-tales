import SwiftUI

/// Bibliotecă like the web: the large title, "Caută în N povești", the folders as wide collection
/// cards (tinted from their covers) and a dashed "Folder nou" card at the end. How a folder's
/// stories look (Pătrate, Listă, Raft, Cover Flow) is chosen inside the folder.
struct LibraryView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @State private var query = ""
    @State private var creating = LaunchOptions.screen == "folder-new"
    @State private var path: [StoryFolder] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if store.showingCopy {
                        Label("Fără internet: se vede copia de pe telefon.", systemImage: "icloud.slash")
                            .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                            .padding(.horizontal, 16)
                    }

                    if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                        results
                    } else if store.stories.isEmpty && store.folderRows.isEmpty {
                        EmptyStateView(symbol: "books.vertical", title: store.phase == .loading ? "Se încarcă…" : "Biblioteca e goală",
                                       message: "Poveștile pe care le adaugi din Adaugă apar aici.")
                            .padding(.top, 60)
                    } else {
                        folderList
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .ktNightBackground()
            .refreshable { await store.refresh() }
            .navigationTitle("Bibliotecă")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "Caută în \(store.stories.count == 1 ? "o poveste" : "\(store.stories.count) povești")")
            .navigationDestination(for: StoryFolder.self) { FolderView(folderName: $0.name) }
        }
        .onAppear {
            // Screenshots: `-screen folder` opens the first folder.
            if ["folder", "folder-menu", "folder-edit", "folder-delete", "folder-share", "folder-shelf", "folder-list", "folder-flow"].contains(LaunchOptions.screen ?? ""), path.isEmpty, let first = store.folders.first(where: { $0.items.count > 1 }) ?? store.folders.first(where: { !$0.items.isEmpty }) {
                path = [first]
            }
        }
    }

    private var folderList: some View {
        LazyVStack(spacing: 12) {
            ForEach(store.folders) { folder in
                NavigationLink(value: folder) { CollectionCard(folder: folder) }
                    .buttonStyle(PressableStyle())
                    .contextMenu { FolderActions(folder: folder) }
            }
            if !kid.active {
                Button { creating = true } label: { NewFolderCard() }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel("Folder nou")
            }
        }
        .padding(.horizontal, 16)
        .sheet(isPresented: $creating) { FolderSheet(folder: nil) }
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
    /// The web's Listă: a download button on each row.
    var showsDownload = false
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
            if showsDownload { DownloadButton(story: story) }
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
    @AppStorage("folder-look") private var look: Look = .squares
    @State private var search = ""
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
        let all = folder?.items ?? []
        let q = search.trimmingCharacters(in: .whitespaces)
        let items = q.isEmpty ? all : all.filter { StoryStore.fold($0.title).contains(StoryStore.fold(q)) }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(folder, all)
                if !all.isEmpty {
                    searchBar
                }
                if all.isEmpty {
                    Text("Niciun fișier încă.")
                        .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                        .padding(.horizontal, 16)
                } else if items.isEmpty {
                    Text("Nimic găsit pentru „\(q)”.")
                        .font(.ktCallout).foregroundStyle(Theme.Night.muted)
                        .padding(.horizontal, 16)
                } else {
                    stories(items)
                }
            }
            .padding(.bottom, 24)
            .animation(.snappy, value: look)
        }
        .scrollIndicators(.hidden)
        .ktNightBackground()
        .toolbar(.hidden, for: .navigationBar)
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

    /// The web's folder head: round back, the name with its icon in big serif, "4 povești" and a
    /// "Partajat" chip under it, the gold + and the ⋯ on the right.
    private func header(_ folder: StoryFolder?, _ items: [Story]) -> some View {
        HStack(alignment: .top, spacing: 10) {
            KTBackButton()
            VStack(alignment: .leading, spacing: 6) {
                Text([folder?.icon, name].compactMap { $0 }.joined(separator: " "))
                    .font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    Text(items.count == 1 ? "1 poveste" : "\(items.count) povești")
                        .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
                        .foregroundStyle(Theme.Night.muted)
                    if let folder, folder.mine, folder.shared, !folder.builtin {
                        Label("Partajat", systemImage: "person.2")
                            .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                            .foregroundStyle(Theme.Night.moon)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Theme.Night.moon.opacity(0.15)))
                    }
                }
            }
            .padding(.top, 2)
            Spacer(minLength: 0)
            if let folder, folder.mine, !folder.builtin, !kid.active {
                Menu {
                    ForEach(AddMode.allCases) { mode in
                        Button { adding = mode } label: { Label(mode.title, systemImage: mode.symbol) }
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Theme.Night.ink)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.accent))
                }
                .accessibilityLabel("Adaugă o poveste în folder")
            }
            moreMenu(folder, items)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    /// "Caută în Povești Disney" with the view button next to it.
    private var searchBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.Night.muted)
                TextField("", text: $search, prompt: Text("Caută în \(name)").foregroundStyle(Theme.Night.muted))
                    .font(.custom(AppFont.body, size: 15, relativeTo: .body))
                    .foregroundStyle(Theme.text)
                    .submitLabel(.search)
            }
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background(Capsule().fill(.white.opacity(0.08)))
            Menu {
                Picker("Vizualizare", selection: $look) {
                    ForEach(Look.allCases, id: \.self) { l in Label(l.rawValue, systemImage: l.symbol).tag(l) }
                }
            } label: {
                Image(systemName: look.symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.white.opacity(0.08)))
            }
            .accessibilityLabel("Vizualizare: \(look.rawValue)")
        }
        .padding(.horizontal, 16)
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
                    StoryRow(story: story, queue: items, showsDownload: !kid.active)
                    Divider().overlay(Color.white.opacity(0.06)).padding(.leading, 74)
                }
            }
            .padding(.horizontal, 16)
        case .shelf:
            BookShelfView(stories: items, folderName: name)
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
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 44, height: 44)
                .background(Circle().fill(.white.opacity(0.08)))
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

/// A story as a square cover with its title and length under it ("Pătrate"): a heart on the
/// cover for a favourite and the length in its corner, like the web.
private struct SquareTile: View {
    let story: Story

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            StoryCover(story: story, cornerRadius: 16)
                .aspectRatio(1, contentMode: .fit)
                .overlay(alignment: .topLeading) {
                    if story.favorite {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: 0xFF6F91))
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(.white.opacity(0.92)))
                            .padding(8)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if let time = story.minutesLabel {
                        Text(time)
                            .font(.custom(AppFont.bodyBold, size: 11.5, relativeTo: .caption2))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(.black.opacity(0.5)))
                            .padding(7)
                    }
                }
                .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
            Text(story.title).font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline)).foregroundStyle(Theme.text).lineLimit(1)
                .padding(.top, 4)
            if let time = story.minutesLabel {
                Text(time).font(.custom(AppFont.body, size: 13, relativeTo: .footnote)).foregroundStyle(Theme.Night.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Listă: save the story on the phone, or take it off (a spinner while it downloads).
private struct DownloadButton: View {
    let story: Story
    @Environment(StoryStore.self) private var store

    var body: some View {
        let saved = store.offline.saved.contains(story.id)
        Button {
            Haptics.tap()
            if saved { store.offline.remove([story.id]) } else { Task { await store.offline.download(story, links: store.links) } }
        } label: {
            Group {
                if store.offline.downloading.contains(story.id) {
                    ProgressView().controlSize(.small).tint(Theme.Night.moon)
                } else {
                    Image(systemName: saved ? "checkmark.circle.fill" : "arrow.down.circle")
                        .font(.system(size: 20))
                        .foregroundStyle(saved ? Theme.Night.moon : Theme.text.opacity(0.8))
                }
            }
            .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(saved ? "Șterge de pe telefon" : "Salvează pentru offline")
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
    @Environment(ProfileStore.self) private var profile

    var body: some View {
        NavigationStack {
            ScrollView {
                let favorites = store.favorites
                let child = profile.settings.childName
                VStack(alignment: .leading, spacing: 4) {
                    Text("Favorite")
                        .font(.custom(AppFont.displaySemibold, size: 34, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("Poveștile preferate\(child.isEmpty ? "" : " ale lui \(child)")")
                        .font(.ktCallout).foregroundStyle(Theme.Night.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 14)
                if favorites.isEmpty {
                    EmptyStateView(symbol: "heart", title: "Nicio poveste favorită",
                                   message: "Apasă inima de pe o poveste și o găsești aici.")
                        .padding(.top, 60)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 14)], spacing: 18) {
                        ForEach(favorites) { story in
                            Button { Task { await player.play(story, queue: favorites, store: store) } } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    StoryCover(story: story).aspectRatio(1, contentMode: .fit)
                                        .overlay(alignment: .bottomTrailing) {
                                            if let m = story.minutesLabel {
                                                Text(m)
                                                    .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                                                    .foregroundStyle(.white)
                                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                                    .background(Capsule().fill(.black.opacity(0.55)))
                                                    .padding(8)
                                            }
                                        }
                                        .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
                                    Text(story.title).font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                                        .foregroundStyle(Theme.text).lineLimit(1)
                                    Text(StoryLibrary.folderOf(story))
                                        .font(.ktCaption).foregroundStyle(Theme.Night.muted).lineLimit(1)
                                }
                            }
                            .buttonStyle(PressableStyle())
                            .storyContextMenu(story)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, KTTabBarMetrics.height + 24)
                }
            }
            .scrollIndicators(.hidden)
            .ktNightBackground()
            .refreshable { await store.refresh() }
            .toolbar(.hidden, for: .navigationBar)
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

