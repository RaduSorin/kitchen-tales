import Foundation

/// One person's progress, the same JSON as the web's BadgeState (src/lib/badges/engine.ts), so
/// the phone and the web share one BadgeBook row. Counters only grow; merging keeps the larger.
struct BadgeState: Codable, Equatable, Sendable {
    var counts: [String: Int] = [:]
    var sets: [String: [String]] = [:]
    /// Badge id → when it was earned (ISO, as JavaScript writes it).
    var earned: [String: String] = [:]
    /// Badges already celebrated (a stamp shown, a sticker stuck in the album).
    var seen: [String] = []
    /// The day (YYYY-MM-DD) the last listening sticker was given: at most one an evening.
    var listenDay: String?
    var since: String?
    var epoch: Int?

    init() { epoch = BadgeEngine.epoch }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // A counter saved as 3.0 by JavaScript still reads as 3.
        if let ints = try? c.decode([String: Int].self, forKey: .counts) { counts = ints }
        else { counts = (try? c.decode([String: Double].self, forKey: .counts))?.mapValues { Int($0) } ?? [:] }
        sets = (try? c.decode([String: [String]].self, forKey: .sets)) ?? [:]
        earned = (try? c.decode([String: String].self, forKey: .earned)) ?? [:]
        seen = (try? c.decode([String].self, forKey: .seen)) ?? []
        listenDay = try? c.decode(String.self, forKey: .listenDay)
        since = try? c.decode(String.self, forKey: .since)
        epoch = try? c.decode(Int.self, forKey: .epoch)
    }
}

/// Something the person did that a badge may count (the web's BadgeEvent).
enum BadgeEvent: Sendable {
    enum Way: String, Sendable { case written, link, video, photo, dictation, text, ai, fridge }
    enum Source: String, Sendable { case upload, recording, generated }
    case recipeAdded(way: Way, category: String?, photo: Bool)
    case cooked(recipeId: String)
    case cookOpened, cookFinished, handsFree
    case timers(running: Int)
    case cookNote, servings, weekFull, shoppingDone
    case cookbook(a4: Bool, recipes: Int)
    case invited, shared
    case storyAdded(Source)
    case storyCover, folderMade, kidMode, offlineSaved
    case storyFinished(storyId: String, folder: String, folders: [String], secs: Double?, source: Source?, offline: Bool, kid: Bool)
    case favorite, sleepStop
}

enum BadgeEngine {
    /// Badges start fresh from this version on (the web's EPOCH); older copies are dropped.
    static let epoch = 2

    nonisolated(unsafe) static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static func isoString(_ d: Date) -> String { iso.string(from: d) }
    static func date(_ s: String) -> Date? {
        iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    static func dayOf(_ d: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func isDessert(_ category: String?) -> Bool {
        guard let c = category?.lowercased() else { return false }
        return c.contains("desert") || c.contains("dulc")
    }

    /// The longest run of consecutive days in a list of YYYY-MM-DD days.
    static func longestRun(_ days: [String]) -> Int {
        let utc = TimeZone(identifier: "UTC")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = utc
        let ms = Set(days).compactMap { d -> Double? in
            let p = d.split(separator: "-").compactMap { Int($0) }
            guard p.count == 3 else { return nil }
            return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))?.timeIntervalSince1970
        }.sorted()
        var best = 0, run = 0
        for (i, t) in ms.enumerated() {
            run = i > 0 && t - ms[i - 1] == 86_400 ? run + 1 : 1
            best = max(best, run)
        }
        return best
    }

    /// [done so far, needed].
    static func goal(_ b: Badge, _ s: BadgeState, _ now: Date) -> (Int, Int) {
        switch b.goal {
        case let .count(key, need): return (s.counts[key] ?? 0, need)
        case let .size(key, need): return (s.sets[key]?.count ?? 0, need)
        case let .most(prefix, need):
            return (max(0, s.counts.filter { $0.key.hasPrefix(prefix) }.map(\.value).max() ?? 0), need)
        case .days:
            let start = s.since.flatMap(date)
            return (start.map { Int(now.timeIntervalSince($0) / 86_400) } ?? 0, 365)
        case .folders:
            let all = s.sets["allFolders"] ?? []
            let heard = Set(s.sets["folders"] ?? [])
            return (all.filter { heard.contains($0) }.count, max(2, all.count))
        case let .run(need): return (longestRun(s.sets["days"] ?? []), need)
        }
    }

    static func progress(_ b: Badge, _ s: BadgeState, _ now: Date = Date()) -> (have: Int, need: Int, done: Bool) {
        let (have, need) = goal(b, s, now)
        return (min(have, need), need, have >= need)
    }

    private static func bump(_ s: inout BadgeState, _ key: String, by n: Int = 1) { s.counts[key, default: 0] += n }
    private static func add(_ s: inout BadgeState, _ key: String, _ values: [String]) {
        var cur = s.sets[key] ?? []
        for v in values where !v.isEmpty && !cur.contains(v) { cur.append(v) }
        if cur.count != (s.sets[key]?.count ?? 0) { s.sets[key] = cur }
    }

    /// Counts what the person just did (the web's applyEvent).
    static func apply(_ e: BadgeEvent, to state: BadgeState, now: Date, calendar: Calendar = .current) -> BadgeState {
        var x = state
        if x.since == nil { x.since = isoString(now) }
        let hour = calendar.component(.hour, from: now)
        switch e {
        case let .recipeAdded(way, category, photo):
            bump(&x, "recipes"); bump(&x, "way:\(way.rawValue)")
            if let c = category?.trimmingCharacters(in: .whitespaces).lowercased(), !c.isEmpty { add(&x, "categories", [c]) }
            if photo { bump(&x, "photos") }
            if isDessert(category) { bump(&x, "desserts") }
        case let .cooked(id):
            bump(&x, "cooked"); bump(&x, "cook:\(id)")
            if calendar.component(.weekday, from: now) == 1, hour < 11 { bump(&x, "brunch") }
        case .cookOpened:
            if hour >= 23 || hour < 4 { bump(&x, "night") } else { return state.since == nil ? x : state }
        case .cookFinished: bump(&x, "cookmode")
        case .handsFree: bump(&x, "handsfree")
        case let .timers(running): if (x.counts["timers"] ?? 0) < running { x.counts["timers"] = running }
        case .cookNote: bump(&x, "notes")
        case .servings: bump(&x, "servings")
        case .weekFull: bump(&x, "week")
        case .shoppingDone: bump(&x, "shopping")
        case let .cookbook(a4, recipes):
            bump(&x, "cookbook")
            if a4 && recipes >= 20 { bump(&x, "print") }
        case .invited: bump(&x, "invited")
        case .shared: bump(&x, "shared")
        case let .storyAdded(source): bump(&x, "stories"); bump(&x, "source:\(source.rawValue)")
        case .storyCover: bump(&x, "covers")
        case .folderMade: bump(&x, "folders")
        case .kidMode: bump(&x, "kid")
        case .offlineSaved: bump(&x, "offline")
        case let .storyFinished(id, folder, folders, secs, source, offline, kid):
            bump(&x, "listened"); bump(&x, "listen:\(id)")
            add(&x, "folders", [folder])
            x.sets["allFolders"] = Array(NSOrderedSet(array: folders.filter { !$0.isEmpty })) as? [String] ?? []
            // Past midnight still counts as the evening before.
            let evening = dayOf(hour < 4 ? now.addingTimeInterval(-5 * 3600) : now, calendar: calendar)
            if hour >= 21 || hour < 4 { add(&x, "evenings", [evening]) }
            add(&x, "days", [evening])
            if hour >= 4 && hour < 9 { bump(&x, "morning") }
            if let secs, secs >= 20 * 60 { bump(&x, "long") }
            if let secs, secs > 0, secs < 5 * 60 { bump(&x, "short") }
            if source == .recording { bump(&x, "rec:\(id)") }
            if offline { bump(&x, "offlineListen") }
            if kid { bump(&x, "kidListen") }
            let m = calendar.component(.month, from: now), d = calendar.component(.day, from: now)
            if m == 12 && (24...26).contains(d) { bump(&x, "xmas") }
            if m == 10 && d == 31 { bump(&x, "halloween") }
        case .favorite: bump(&x, "favorite")
        case .sleepStop: bump(&x, "sleepstop")
        }
        return x
    }

    /// Gives every badge whose goal is reached; listening stickers at most one an evening.
    static func evaluate(_ s: BadgeState, now: Date, calendar: Calendar = .current) -> (state: BadgeState, fresh: [String]) {
        let today = dayOf(now, calendar: calendar)
        var x = s
        var fresh: [String] = []
        for b in BadgeCatalog.all where x.earned[b.id] == nil {
            guard progress(b, s, now).done else { continue }
            if b.listen {
                if x.listenDay == today { continue }
                x.listenDay = today
            }
            x.earned[b.id] = isoString(now)
            fresh.append(b.id)
        }
        return fresh.isEmpty ? (s, []) : (x, fresh)
    }

    /// Two copies of the same person's progress (this phone and the cloud) as one.
    static func merge(_ a: BadgeState, _ b: BadgeState) -> BadgeState {
        var x = a
        for (k, v) in b.counts { x.counts[k] = max(x.counts[k] ?? 0, v) }
        for (k, v) in b.sets {
            if k == "allFolders" {
                if v.count >= (x.sets[k]?.count ?? 0) { x.sets[k] = v }
            } else {
                var cur = x.sets[k] ?? []
                for item in v where !cur.contains(item) { cur.append(item) }
                x.sets[k] = cur
            }
        }
        for (k, v) in b.earned { if let mine = x.earned[k], mine < v { continue }; x.earned[k] = v }
        for id in b.seen where !x.seen.contains(id) { x.seen.append(id) }
        x.listenDay = [a.listenDay, b.listenDay].compactMap { $0 }.max()
        x.since = [a.since, b.since].compactMap { $0 }.min()
        x.epoch = max(a.epoch ?? 0, b.epoch ?? 0)
        return x
    }
}
