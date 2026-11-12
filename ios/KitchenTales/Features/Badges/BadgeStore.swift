import Foundation
import Observation

/// One person's stamps and stickers on this phone (the web's src/lib/badges/store.ts):
/// `track` counts what they just did, new badges wait to be celebrated, and everything is kept
/// on the phone and in the cloud (one BadgeBook row per account, merged with the phone's copy).
@MainActor @Observable
final class BadgeStore {
    private(set) var state = BadgeState()
    /// Put off with "Mai târziu" in this session: they wait in the album, not shown again now.
    private(set) var later: Set<String> = []

    private let client: GraphQLClient?
    private let cache: DeviceCache
    private let userId: () -> String?
    private let demo: Bool
    private var cloudExists: Bool?
    private var started = false
    private var saveTask: Task<Void, Never>?
    private static let cacheKey = "badges"

    /// The signed-in person's collection, for `trackBadge` from anywhere in the app.
    static weak var current: BadgeStore?

    init(auth: AuthModel, config: BackendConfig? = .fromBundle(), cache: DeviceCache = .shared) {
        demo = LaunchOptions.demoAccount != nil
        client = config.map { config in
            GraphQLClient(config: config, token: { @Sendable in try await auth.validTokens().accessToken })
        }
        self.cache = cache
        userId = { [weak auth] in auth?.account?.user }
        if demo {
            state = DemoBadges.state
        } else if let saved = cache.read(BadgeState.self, key: Self.cacheKey), saved.epoch == BadgeEngine.epoch {
            state = saved
        }
        Self.current = self
    }

    /// For previews and tests.
    init(state: BadgeState) {
        demo = true; client = nil; cache = .shared; userId = { nil }
        self.state = state
    }

    // MARK: Reading

    func earned(_ b: Badge) -> Bool { state.earned[b.id] != nil }
    func earnedDate(_ b: Badge) -> Date? { state.earned[b.id].flatMap(BadgeEngine.date) }
    func count(_ list: [Badge]) -> Int { list.filter(earned).count }

    /// The newest earned first.
    func latest(_ list: [Badge], _ n: Int) -> [Badge] {
        Array(list.filter(earned).sorted { state.earned[$0.id]! > state.earned[$1.id]! }.prefix(n))
    }

    /// Earned but not yet celebrated, oldest first.
    var pending: [Badge] {
        let seen = Set(state.seen)
        return state.earned.filter { !seen.contains($0.key) && !later.contains($0.key) }
            .sorted { $0.value < $1.value }
            .compactMap { BadgeCatalog.byId[$0.key] }
    }

    /// A sticker earned and not yet stuck in the album.
    func waiting(_ b: Badge) -> Bool { earned(b) && !state.seen.contains(b.id) }

    // MARK: Changing

    /// Counts something the person just did, and gives the badges it completes.
    func track(_ e: BadgeEvent) {
        let now = Date()
        let next = BadgeEngine.evaluate(BadgeEngine.apply(e, to: state, now: now), now: now).state
        if next != state { set(next) }
    }

    func markSeen(_ id: String) {
        guard !state.seen.contains(id) else { return }
        later.remove(id)
        var next = state
        next.seen.append(id)
        set(next)
    }

    func putOff(_ id: String) { later.insert(id) }

    private func set(_ next: BadgeState, save: Bool = true) {
        state = next
        if !demo { cache.write(state, key: Self.cacheKey) }
        if save { scheduleSave() }
    }

    // MARK: Cloud

    /// Loads the cloud copy and starts the collection if it is new. Once per app start.
    func start() async {
        guard !started else { return }
        started = true
        guard !demo, let client, let id = userId() else { return }
        if let row = try? await fetch(client, id) {
            cloudExists = row.exists
            if let cloud = row.state { set(BadgeEngine.merge(state, cloud), save: false) }
            // The cloud still holds badges from before the fresh start: replace them.
            else if row.exists { scheduleSave() }
        }
        if state.since == nil {
            var next = state
            next.since = BadgeEngine.isoString(Date())
            set(next)
        }
        let checked = BadgeEngine.evaluate(state, now: Date())
        if !checked.fresh.isEmpty { set(checked.state) }
    }

    /// The cloud's row: whether there is one, and its copy (nil when it is from an older start).
    private func fetch(_ client: GraphQLClient, _ id: String) async throws -> (exists: Bool, state: BadgeState?) {
        let body = try await client.run("query G($id: ID!) { getBadgeBook(id: $id) { id state } }", variables: ["id": id])
        guard let row = body["getBadgeBook"] as? [String: Any] else { return (false, nil) }
        guard let text = row["state"] as? String, let data = text.data(using: .utf8),
              let parsed = try? JSONDecoder().decode(BadgeState.self, from: data), parsed.epoch == BadgeEngine.epoch else {
            return (true, nil)
        }
        return (true, parsed)
    }

    private func scheduleSave() {
        guard !demo else { return }
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            await self?.saveNow()
        }
    }

    private func saveNow() async {
        guard let client, let id = userId() else { return }
        do {
            // Another phone (or the web) may have saved since: merge with the cloud's copy first.
            let row = try await fetch(client, id)
            cloudExists = row.exists
            if let cloud = row.state {
                let merged = BadgeEngine.merge(state, cloud)
                if merged != state { set(merged, save: false) }
            }
            guard let data = try? JSONEncoder().encode(state), let text = String(data: data, encoding: .utf8) else { return }
            let field = cloudExists == true ? "updateBadgeBook" : "createBadgeBook"
            let type = cloudExists == true ? "UpdateBadgeBookInput" : "CreateBadgeBookInput"
            _ = try await client.run("mutation M($input: \(type)!) { \(field)(input: $input) { id } }", variables: ["input": ["id": id, "state": text]])
            cloudExists = true
        } catch {
            // Offline: tried again with the next change.
        }
    }
}

/// Counts something the person just did toward their stamps and stickers.
@MainActor func trackBadge(_ e: BadgeEvent) {
    BadgeStore.current?.track(e)
}

/// The demo account's collection, for screenshots.
enum DemoBadges {
    static var state: BadgeState {
        var s = BadgeState()
        let base = Date().addingTimeInterval(-40 * 86_400)
        s.since = BadgeEngine.isoString(base)
        let earned = ["scrisa", "link", "poza", "c5", "c10", "prima", "pas", "dubla", "cos", "impartim",
                      "k-star", "k-moon", "k-book", "k-heart", "k-wand", "k-house", "k-cat", "k-key", "k-teddy", "k-cloud"]
        for (i, id) in earned.enumerated() {
            s.earned[id] = BadgeEngine.isoString(base.addingTimeInterval(Double(i) * 2 * 86_400))
        }
        // The album's screenshot shows one sticker waiting to be stuck.
        s.seen = earned.filter { $0 != "k-cloud" || LaunchOptions.screen != "album" }
        s.counts = ["recipes": 12, "cooked": 7, "listened": 14, "stories": 6, "photos": 4]
        return s
    }
}
