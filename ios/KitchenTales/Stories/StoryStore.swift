import Foundation
import Observation

/// The family's stories and folders: the copy on this phone first, then a fresh list from the
/// server (the same AppSync tables as the web app).
@MainActor @Observable
final class StoryStore {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var allStories: [Story] = []
    /// In kid mode, only the folders the parent picked (empty = all of them).
    var kidFolders: [String] = []
    /// What the app shows: every story, or in kid mode only the allowed folders.
    var stories: [Story] {
        kidFolders.isEmpty ? allStories : allStories.filter { kidFolders.contains(StoryLibrary.folderOf($0)) }
    }
    private(set) var folderRows: [StoryFolderRow] = []
    private(set) var phase: Phase = .idle
    /// True when the list shown is the phone's copy because the server could not be reached.
    private(set) var showingCopy = false

    let links: FileLinks?
    /// Stories saved on this phone for listening without internet.
    let offline = OfflineAudio()
    private let client: GraphQLClient?
    private let cache: DeviceCache
    private let mySpace: () -> String?
    private let demo: Bool

    private struct Saved: Codable { var stories: [Story]; var folders: [StoryFolderRow] }
    private static let cacheKey = "stories/library"

    init(auth: AuthModel, config: BackendConfig? = .fromBundle(), cache: DeviceCache = .shared) {
        demo = LaunchOptions.demoAccount != nil
        let client = config.map { config in
            GraphQLClient(config: config, token: { @Sendable in try await auth.validTokens().accessToken })
        }
        self.client = client
        links = client.map { FileLinks(client: $0) }
        self.cache = cache
        mySpace = { [weak auth] in auth?.account?.space }
        if demo {
            allStories = DemoLibrary.stories
            folderRows = DemoLibrary.folders
            phase = .loaded
            offline.showAsSaved(["d1", "d2", "d3"])
        } else if let saved = cache.read(Saved.self, key: Self.cacheKey) {
            allStories = saved.stories
            folderRows = saved.folders
        }
    }

    var folders: [StoryFolder] { StoryLibrary.groupFolders(stories, rows: folderRows) }
    var favorites: [Story] { stories.filter(\.favorite) }
    /// Every folder name, also in kid mode (for choosing what the child sees).
    var allFolders: [String] { StoryLibrary.groupFolders(allStories, rows: folderRows).map(\.name) }

    /// Newest first, the way the web lists them.
    var recent: [Story] { Array(stories.prefix(12)) }

    func story(_ id: String) -> Story? { allStories.first { $0.id == id } }

    /// The paused story to continue, if any, else the newest ones (for the hero carousel).
    var heroStories: [Story] {
        var list: [Story] = []
        if let id = PlaybackMemory.lastStoryId, let last = story(id), PlaybackMemory.position(id) > 5 { list.append(last) }
        for s in stories where list.count < 4 && !list.contains(where: { $0.id == s.id }) { list.append(s) }
        return list
    }

    /// Short stories for tonight: under 15 minutes, favorites first.
    var forTonight: [Story] {
        let short = stories.filter { ($0.durationSec ?? 0) > 0 && ($0.durationSec ?? 0) <= 15 * 60 }
        let pool = short.isEmpty ? stories : short
        return Array((pool.filter(\.favorite) + pool.filter { !$0.favorite }).prefix(10))
    }

    /// What adding a story needs (nil without a server or a space).
    func creator(account: Account?) -> StoryCreator? {
        guard let client, let account, let space = account.space else { return nil }
        return StoryCreator(client: client, space: space, spaceName: account.displayName)
    }

    /// A story just added on this phone: at the top of the library right away.
    func added(_ story: Story) {
        allStories.removeAll { $0.id == story.id }
        allStories.insert(story, at: 0)
        cache.write(Saved(stories: allStories, folders: folderRows), key: Self.cacheKey)
    }

    func search(_ text: String) -> [Story] {
        let q = Self.fold(text)
        guard !q.isEmpty else { return stories }
        return stories.filter { Self.fold($0.title).contains(q) || Self.fold(StoryLibrary.folderOf($0)).contains(q) }
    }

    nonisolated static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ro"))
            .trimmingCharacters(in: .whitespaces)
    }

    func refresh() async {
        guard !demo else { return }
        guard let client else { phase = .failed(BackendError.notConfigured.localizedDescription); return }
        if phase == .loading { return }
        phase = .loading
        do {
            let space = mySpace()
            let rows = try await client.listAll("listStories", fields: Story.fields)
            let folderRowsRaw = (try? await client.listAll("listStoryFolders", fields: StoryFolderRow.fields)) ?? []
            let favoriteRows = (try? await client.listAll("listStoryFavorites", fields: "id storyId")) ?? []
            let favoriteIds = Set(favoriteRows.compactMap { $0["storyId"] as? String })
            var list = rows.compactMap { Story(row: $0, mySpace: space) }
            // Another space's story is a favourite through our own StoryFavorite row.
            for i in list.indices where !list[i].mine {
                list[i].favorite = favoriteIds.contains(list[i].id)
            }
            list.sort { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            allStories = list
            folderRows = folderRowsRaw.compactMap { StoryFolderRow(row: $0, mySpace: space) }
            cache.write(Saved(stories: allStories, folders: folderRows), key: Self.cacheKey)
            offline.prune(keeping: Set(allStories.map(\.id)))
            showingCopy = false
            phase = .loaded
        } catch {
            showingCopy = !allStories.isEmpty
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Nu am putut încărca poveștile.")
        }
    }

    private func persist() { cache.write(Saved(stories: allStories, folders: folderRows), key: Self.cacheKey) }

    private func updateStory(_ input: [String: Any]) async throws {
        guard !demo, let client else { return }
        _ = try await client.run("mutation S($input: UpdateStoryInput!) { updateStory(input: $input) { id } }", variables: ["input": input])
    }

    /// Shares a story of ours with every account, or makes it private (Profil → Ce partajez).
    func setShared(_ id: String, _ shared: Bool, spaceName: String?) async -> Bool {
        guard let i = allStories.firstIndex(where: { $0.id == id }) else { return false }
        allStories[i].shared = shared
        persist()
        do {
            var input: [String: Any] = ["id": id, "readerGroups": shared ? ["everyone"] : [String](), "sharedDirect": shared]
            if let spaceName { input["spaceName"] = spaceName }
            try await updateStory(input)
            return true
        } catch {
            if let j = allStories.firstIndex(where: { $0.id == id }) { allStories[j].shared = !shared }
            persist()
            Haptics.warning()
            return false
        }
    }

    /// Puts the space's new name on the stories and folders it already shares.
    func renameShared(to name: String) async {
        for s in allStories where s.mine && s.shared && s.spaceName != name {
            if let i = allStories.firstIndex(where: { $0.id == s.id }) { allStories[i].spaceName = name }
            try? await updateStory(["id": s.id, "spaceName": name])
        }
        for f in folderRows where f.mine && f.shared && f.spaceName != name {
            if let i = folderRows.firstIndex(where: { $0.id == f.id }) { folderRows[i].spaceName = name }
            if !demo, let client {
                _ = try? await client.run("mutation F($input: UpdateStoryFolderInput!) { updateStoryFolder(input: $input) { id } }",
                                          variables: ["input": ["id": f.id, "spaceName": name]])
            }
        }
        persist()
    }

    // MARK: Deleting, moving and folders (like src/lib/db.ts)

    private func folderMutation(_ field: String, _ type: String, _ input: [String: Any]) async throws -> [String: Any] {
        guard !demo, let client else { return [:] }
        return try await client.run("mutation F($input: \(type)!) { \(field)(input: $input) { \(StoryFolderRow.fields) } }", variables: ["input": input])
    }

    /// Deletes our story with its audio and cover, and its copy on this phone.
    func delete(_ id: String) async throws {
        guard let story = story(id) else { return }
        if !demo, let client {
            try await client.deleteWithFiles([story.audioKey, story.coverKey], ref: story.fileRef) {
                _ = try await client.run("mutation D($input: DeleteStoryInput!) { deleteStory(input: $input) { id } }", variables: ["input": ["id": id]])
            }
        }
        offline.remove([id])
        allStories.removeAll { $0.id == id }
        persist()
    }

    // MARK: Coperta and another voice (the player's ⋯, like the web)

    struct CoverCandidate: Identifiable, Hashable {
        let url: String
        let source: String
        let label: String?
        var id: String { url }
    }

    /// Covers found by title in the iTunes catalog and on Wikipedia (findCovers).
    func findCovers(_ title: String) async throws -> [CoverCandidate] {
        guard !demo, let client else { return [] }
        let body = try await client.run("query F($title: String!) { findCovers(title: $title) { url source label } }", variables: ["title": title])
        return (body["findCovers"] as? [Any] ?? []).compactMap { item in
            guard let row = item as? [String: Any], let url = row["url"] as? String, !url.isEmpty else { return nil }
            return CoverCandidate(url: url, source: row["source"] as? String ?? "", label: row["label"] as? String)
        }
    }

    /// Copies a found cover into our storage (saveCover) and returns its path.
    func saveFoundCover(_ url: String) async throws -> String {
        guard let client else { throw BackendError.notConfigured }
        let body = try await client.run("mutation C($url: String!) { saveCover(url: $url) }", variables: ["url": url])
        guard let path = body["saveCover"] as? String, !path.isEmpty else { throw BackendError.server("Nu am putut salva coperta.") }
        return path
    }

    /// Puts a picture cover on our story; the old picture file goes.
    func setCover(_ id: String, coverKey: String) async throws {
        guard let story = story(id) else { return }
        try await updateStory(["id": id, "coverKey": coverKey])
        if let old = story.coverKey, old != coverKey { await removeFiles([old], ref: story.fileRef) }
        if let i = allStories.firstIndex(where: { $0.id == id }) { allStories[i].coverKey = coverKey }
        persist()
    }

    /// The drawn cover (emoji and colours); with `dropPicture` the picture goes so the drawing shows.
    func setDrawing(_ id: String, emoji: String, scene: Int, dropPicture: Bool) async throws {
        guard let story = story(id) else { return }
        var input: [String: Any] = ["id": id, "emoji": emoji, "scene": scene]
        if dropPicture { input["coverKey"] = NSNull() }
        try await updateStory(input)
        if dropPicture, let old = story.coverKey { await removeFiles([old], ref: story.fileRef) }
        if let i = allStories.firstIndex(where: { $0.id == id }) {
            allStories[i].emoji = emoji
            allStories[i].scene = scene
            if dropPicture { allStories[i].coverKey = nil }
        }
        persist()
    }

    /// After "Recitește cu altă voce": the new audio on the story, the old file and offline copy gone.
    func replaceAudio(_ id: String, audioKey: String, durationSec: Double?) async throws {
        guard let story = story(id) else { return }
        try await updateStory(["id": id, "audioKey": audioKey, "durationSec": durationSec.map { Int($0.rounded()) as Any } ?? NSNull()])
        offline.remove([id])
        if story.audioKey != audioKey { await removeFiles([story.audioKey], ref: story.fileRef) }
        if let i = allStories.firstIndex(where: { $0.id == id }) {
            allStories[i].audioKey = audioKey
            allStories[i].durationSec = durationSec
        }
        persist()
    }

    private func removeFiles(_ paths: [String], ref: String) async {
        guard !demo, let client else { return }
        _ = try? await client.run("mutation Del($paths: [String]!) { deleteFiles(paths: $paths) }", variables: ["paths": paths])
    }

    /// The story's text (read when asked: the list leaves it out, it can be long).
    func text(of id: String) async -> String? {
        if let t = story(id)?.text, !t.isEmpty { return t }
        if demo { return id == "d5" ? DemoLibrary.text : nil }
        guard let client, let body = try? await client.run("query T($id: ID!) { getStory(id: $id) { text } }", variables: ["id": id]),
              let row = body["getStory"] as? [String: Any], let t = row["text"] as? String, !t.isEmpty else { return nil }
        if let i = allStories.firstIndex(where: { $0.id == id }) { allStories[i].text = t }
        return t
    }

    /// Moves our story into a folder (nil: back to its own folder). Moving into one of our folders
    /// takes the folder's sharing. Returns whether the sharing changed.
    @discardableResult
    func move(_ id: String, to collection: String?, spaceName: String?) async throws -> Bool {
        guard let story = story(id) else { return false }
        let folder = collection.flatMap { name in folderRows.first { $0.mine && $0.name == name } }
        let shared = folder?.shared ?? story.shared
        var input: [String: Any] = ["id": id, "collection": collection ?? NSNull()]
        if folder != nil {
            input["readerGroups"] = shared ? ["everyone"] : [String]()
            input["sharedDirect"] = shared
            if let spaceName { input["spaceName"] = spaceName }
        }
        try await updateStory(input)
        if let i = allStories.firstIndex(where: { $0.id == id }) {
            allStories[i].collection = collection
            allStories[i].shared = shared
        }
        persist()
        return shared != story.shared
    }

    /// A new folder of ours; it starts shared, like stories, unless `shared` says otherwise.
    func createFolder(_ name: String, icon: String?, shared: Bool = true, spaceName: String?) async throws {
        guard let space = mySpace() ?? (demo ? "space-demo" : nil) else { throw BackendError.notConfigured }
        var input: [String: Any] = ["name": name, "icon": icon ?? NSNull(), "spaceGroups": [space], "readerGroups": shared ? ["everyone"] : [String]()]
        if let spaceName { input["spaceName"] = spaceName }
        let body = try await folderMutation("createStoryFolder", "CreateStoryFolderInput", input)
        let row = (body["createStoryFolder"] as? [String: Any]).flatMap { StoryFolderRow(row: $0, mySpace: space) }
            ?? StoryFolderRow(id: UUID().uuidString.lowercased(), name: name, icon: icon, mine: true, shared: shared, spaceName: spaceName)
        folderRows.append(row)
        persist()
    }

    /// Renames a folder and/or changes its icon, moving its stories along.
    func saveFolder(_ folder: StoryFolder, name: String, icon: String?, spaceName: String?) async throws {
        if let rowId = folder.rowId {
            _ = try await folderMutation("updateStoryFolder", "UpdateStoryFolderInput", ["id": rowId, "name": name, "icon": icon ?? NSNull()])
            if let i = folderRows.firstIndex(where: { $0.id == rowId }) { folderRows[i].name = name; folderRows[i].icon = icon }
        } else {
            try await createFolder(name, icon: icon, spaceName: spaceName)
        }
        if name != folder.name {
            for s in allStories where s.mine && s.collection == folder.name {
                try await updateStory(["id": s.id, "collection": name])
                if let i = allStories.firstIndex(where: { $0.id == s.id }) { allStories[i].collection = name }
            }
        }
        persist()
    }

    /// Removes a folder; its stories stay and go back to their own folders.
    func deleteFolder(_ folder: StoryFolder) async throws {
        for s in allStories where s.mine && s.collection == folder.name {
            try await updateStory(["id": s.id, "collection": NSNull()])
            if let i = allStories.firstIndex(where: { $0.id == s.id }) { allStories[i].collection = nil }
        }
        if let rowId = folder.rowId {
            _ = try await folderMutation("deleteStoryFolder", "DeleteStoryFolderInput", ["id": rowId])
        }
        folderRows.removeAll { $0.name == folder.name && $0.mine }
        persist()
    }

    /// Shares a whole folder (and every story of ours in it) with every account, or makes it all private.
    func setFolderShared(_ folder: StoryFolder, _ shared: Bool, spaceName: String?) async throws {
        let groups: [String] = shared ? ["everyone"] : []
        for s in folder.items where s.mine {
            var input: [String: Any] = ["id": s.id, "readerGroups": groups, "sharedDirect": shared]
            if let spaceName { input["spaceName"] = spaceName }
            try await updateStory(input)
            if let i = allStories.firstIndex(where: { $0.id == s.id }) { allStories[i].shared = shared }
        }
        if let rowId = folder.rowId {
            var input: [String: Any] = ["id": rowId, "readerGroups": groups]
            if let spaceName { input["spaceName"] = spaceName }
            _ = try await folderMutation("updateStoryFolder", "UpdateStoryFolderInput", input)
            if let i = folderRows.firstIndex(where: { $0.id == rowId }) { folderRows[i].shared = shared }
        } else if !folder.builtin {
            // A folder that existed only through its stories gets a row, so it keeps its sharing.
            try await createFolder(folder.name, icon: nil, shared: shared, spaceName: spaceName)
        }
        persist()
    }

    /// Marks or unmarks a favourite: our own story keeps it on its row, another space's story
    /// through a StoryFavorite row of ours (like the web).
    func toggleFavorite(_ id: String) async {
        guard let i = allStories.firstIndex(where: { $0.id == id }) else { return }
        allStories[i].favorite.toggle()
        let story = allStories[i]
        cache.write(Saved(stories: allStories, folders: folderRows), key: Self.cacheKey)
        guard !demo, let client else { return }
        do {
            if story.mine {
                _ = try await client.run("mutation Fav($input: UpdateStoryInput!) { updateStory(input: $input) { id } }",
                                         variables: ["input": ["id": story.id, "favorite": story.favorite]])
            } else if let space = mySpace() {
                let favId = "\(space):\(story.id)"
                if story.favorite {
                    _ = try await client.run("mutation Fav($input: CreateStoryFavoriteInput!) { createStoryFavorite(input: $input) { id } }",
                                             variables: ["input": ["id": favId, "storyId": story.id, "spaceGroups": [space]]])
                } else {
                    _ = try await client.run("mutation Unfav($input: DeleteStoryFavoriteInput!) { deleteStoryFavorite(input: $input) { id } }",
                                             variables: ["input": ["id": favId]])
                }
            }
        } catch {
            if let j = allStories.firstIndex(where: { $0.id == id }) { allStories[j].favorite = !story.favorite }
            Haptics.warning()
        }
    }
}

/// Made-up stories for `-demo` screenshots (no server). Some have painted covers bundled in
/// Resources/Demo (`demo:` keys), the rest the drawn ones, so both kinds show up.
enum DemoLibrary {
    static let text = "A fost odată un ursuleț care nu putea să adoarmă. În fiecare seară se uita pe fereastră la lună și o întreba unde merge noaptea.\n\nÎntr-o seară, luna i-a răspuns: „Vino cu mine și îți arăt.” Și ursulețul a pornit, pas cu pas, pe o rază de lumină…"

    static let stories: [Story] = [
        Story(id: "d1", title: "Aladdin", emoji: "🧞", coverKey: "demo:cover-lamp", collection: "Povești Disney", durationSec: 600, favorite: true, createdAt: "2026-11-10"),
        Story(id: "d2", title: "Regele Leu", emoji: "🦁", coverKey: "demo:cover-sun", collection: "Povești Disney", durationSec: 540, favorite: true, createdAt: "2026-11-09"),
        Story(id: "d3", title: "În căutarea lui Nemo", emoji: "🐠", coverKey: "demo:cover-sea", collection: "Povești Disney", durationSec: 480, createdAt: "2026-11-08"),
        Story(id: "d4", title: "Albă ca Zăpada", emoji: "🍎", coverKey: "demo:cover-forest", collection: "Povești Disney", durationSec: 720, createdAt: "2026-11-07"),
        Story(id: "d5", title: "Ursulețul și luna", emoji: "🐻", source: .generated, durationSec: 360, favorite: true, createdAt: "2026-11-06"),
        Story(id: "d6", title: "Steaua căzătoare", emoji: "⭐", coverKey: "demo:cover-stars", collection: "Povești de seară", durationSec: 420, createdAt: "2026-11-05"),
        Story(id: "d7", title: "Trenulețul curajos", emoji: "🚂", collection: "Povești de seară", durationSec: 300, createdAt: "2026-11-04", shared: false),
        Story(id: "d8", title: "Cântec de leagăn", emoji: "🌙", source: .recording, durationSec: 180, createdAt: "2026-11-03"),
        Story(id: "d9", title: "Șoricelul de la bibliotecă", emoji: "🐭", coverKey: "demo:cover-room", collection: "Povești Hachette", durationSec: 510, createdAt: "2026-11-02"),
        Story(id: "d10", title: "Dragonul care strănuta", emoji: "🐉", collection: "Basme", durationSec: 400,
              createdAt: "2026-11-01", mine: false, spaceName: "Ana"),
    ]

    static let folders: [StoryFolderRow] = [
        StoryFolderRow(id: "f1", name: "Povești de seară", icon: "🌙", mine: true, shared: true, spaceName: "Sorin"),
        StoryFolderRow(id: "f2", name: "Cântece", icon: "🎵", mine: true, shared: false, spaceName: "Sorin"),
    ]
}
