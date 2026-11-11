import Foundation
import Observation

/// The family's stories and folders: the copy on this phone first, then a fresh list from the
/// server (the same AppSync tables as the web app).
@MainActor @Observable
final class StoryStore {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var stories: [Story] = []
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
            stories = DemoLibrary.stories
            folderRows = []
            phase = .loaded
            offline.showAsSaved(["d1", "d2", "d3"])
        } else if let saved = cache.read(Saved.self, key: Self.cacheKey) {
            stories = saved.stories
            folderRows = saved.folders
        }
    }

    var folders: [StoryFolder] { StoryLibrary.groupFolders(stories, rows: folderRows) }
    var favorites: [Story] { stories.filter(\.favorite) }

    /// Newest first, the way the web lists them.
    var recent: [Story] { Array(stories.prefix(12)) }

    func story(_ id: String) -> Story? { stories.first { $0.id == id } }

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
            stories = list
            folderRows = folderRowsRaw.compactMap { StoryFolderRow(row: $0, mySpace: space) }
            cache.write(Saved(stories: stories, folders: folderRows), key: Self.cacheKey)
            offline.prune(keeping: Set(stories.map(\.id)))
            showingCopy = false
            phase = .loaded
        } catch {
            showingCopy = !stories.isEmpty
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Nu am putut încărca poveștile.")
        }
    }

    /// Marks or unmarks a favourite: our own story keeps it on its row, another space's story
    /// through a StoryFavorite row of ours (like the web).
    func toggleFavorite(_ id: String) async {
        guard let i = stories.firstIndex(where: { $0.id == id }) else { return }
        stories[i].favorite.toggle()
        let story = stories[i]
        cache.write(Saved(stories: stories, folders: folderRows), key: Self.cacheKey)
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
            if let j = stories.firstIndex(where: { $0.id == id }) { stories[j].favorite = !story.favorite }
            Haptics.warning()
        }
    }
}

/// Made-up stories for `-demo` screenshots (no server).
enum DemoLibrary {
    static let stories: [Story] = [
        Story(id: "d1", title: "Aladdin", emoji: "🧞", collection: "Povești Disney", durationSec: 600, favorite: true, createdAt: "2026-11-10"),
        Story(id: "d2", title: "Regele Leu", emoji: "🦁", collection: "Povești Disney", durationSec: 540, favorite: true, createdAt: "2026-11-09"),
        Story(id: "d3", title: "În căutarea lui Nemo", emoji: "🐠", collection: "Povești Disney", durationSec: 480, createdAt: "2026-11-08"),
        Story(id: "d4", title: "Albă ca Zăpada", emoji: "🍎", collection: "Povești Disney", durationSec: 720, createdAt: "2026-11-07"),
        Story(id: "d5", title: "Ursulețul și luna", emoji: "🐻", source: .generated, durationSec: 360, favorite: true, createdAt: "2026-11-06"),
        Story(id: "d6", title: "Steaua căzătoare", emoji: "⭐", collection: "Povești de seară", durationSec: 420, createdAt: "2026-11-05"),
        Story(id: "d7", title: "Trenulețul curajos", emoji: "🚂", collection: "Povești de seară", durationSec: 300, createdAt: "2026-11-04"),
        Story(id: "d8", title: "Cântec de leagăn", emoji: "🌙", source: .recording, durationSec: 180, createdAt: "2026-11-03"),
        Story(id: "d9", title: "Șoricelul de la bibliotecă", emoji: "🐭", collection: "Povești Hachette", durationSec: 510, createdAt: "2026-11-02"),
        Story(id: "d10", title: "Dragonul care strănuta", emoji: "🐉", collection: "Basme", durationSec: 400,
              createdAt: "2026-11-01", mine: false, spaceName: "Ana"),
    ]
}
