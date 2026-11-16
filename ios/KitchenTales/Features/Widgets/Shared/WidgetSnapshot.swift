import Foundation

/// What the widgets show, written by the app into the App Group container (with small copies of
/// the covers and photos next to it) and read by the widget extension. The widgets never talk to
/// the server: they show what the app last saw, so they work without internet and need no sign-in.
struct WidgetSnapshot: Codable, Equatable, Sendable {
    struct StoryItem: Codable, Equatable, Hashable, Sendable {
        var id: String
        var title: String
        /// "Povești Disney · 9 min"
        var detail: String
        /// "9 min", nil without a length.
        var minutes: String?
        /// Image file name in the shared folder, nil without a cover.
        var image: String?
        /// How far it was heard (0…1), nil when not started.
        var progress: Double?
    }

    struct RecipeItem: Codable, Equatable, Hashable, Sendable {
        var id: String
        var title: String
        var category: String
        /// "1 h 30", nil without a time.
        var minutes: String?
        /// "1 h 30 · 4 porții"
        var meta: String
        /// For an idea: why it is suggested ("N-ai mai gătit-o de 3 săptămâni").
        var why: String?
        var image: String?
    }

    /// Tonight's stories, as "Ora de culcare" would pick them (the half-heard one first).
    var tonight: [StoryItem] = []
    /// "20:30" when "Ora de culcare" is on, else nil.
    var bedtime: String?
    /// Calendar weekdays (1 = Sunday) of the bedtime, so the widget knows if tonight is one.
    var bedtimeDays: [Int] = []
    /// The plan of the next days, by "2026-11-16" day key.
    var days: [String: [RecipeItem]] = [:]
    /// "Idei pentru azi", for a day with nothing planned.
    var ideas: [RecipeItem] = []
    /// Lines left on the shopping list.
    var shoppingLeft = 0
    var signedIn = false

    static let empty = WidgetSnapshot()
}

/// The pure rules behind the widgets, shared by the app (and its tests) and the extension.
enum WidgetRules {
    /// "2026-11-16" for the phone's calendar day.
    nonisolated static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The kicker over tonight's story: "Diseară · 20:30" on a bedtime evening, "Diseară" otherwise.
    nonisolated static func tonightKicker(_ s: WidgetSnapshot, now: Date, calendar: Calendar = .current) -> String {
        guard let time = s.bedtime, s.bedtimeDays.contains(calendar.component(.weekday, from: now)) else { return "Diseară" }
        return "Diseară · \(time)"
    }

    /// The bedtime for today, if tonight is a bedtime evening.
    nonisolated static func bedtimeToday(_ s: WidgetSnapshot, now: Date, calendar: Calendar = .current) -> String? {
        guard let time = s.bedtime, s.bedtimeDays.contains(calendar.component(.weekday, from: now)) else { return nil }
        return time
    }

    nonisolated static func today(_ s: WidgetSnapshot, now: Date, calendar: Calendar = .current) -> [WidgetSnapshot.RecipeItem] {
        s.days[dayKey(now, calendar: calendar)] ?? []
    }

    nonisolated static func tomorrow(_ s: WidgetSnapshot, now: Date, calendar: Calendar = .current) -> [WidgetSnapshot.RecipeItem] {
        guard let next = calendar.date(byAdding: .day, value: 1, to: now) else { return [] }
        return s.days[dayKey(next, calendar: calendar)] ?? []
    }

    /// The idea shown after "Altă idee" was tapped `round` times.
    nonisolated static func idea(_ s: WidgetSnapshot, round: Int) -> WidgetSnapshot.RecipeItem? {
        guard !s.ideas.isEmpty else { return nil }
        return s.ideas[((round % s.ideas.count) + s.ideas.count) % s.ideas.count]
    }

    /// "n-ai mai gătit-o de 3 săptămâni · 35 min": the reason, starting small, and the time.
    nonisolated static func ideaLine(_ r: WidgetSnapshot.RecipeItem) -> String {
        var why = r.why ?? ""
        if let first = why.first { why = first.lowercased() + why.dropFirst() }
        return [why, r.minutes ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "Azi · 1 h 30", or just "Azi".
    nonisolated static func todayKicker(_ r: WidgetSnapshot.RecipeItem) -> String {
        r.minutes.map { "Azi · \($0)" } ?? "Azi"
    }

    /// A stable file name for an image key (Swift's own hash changes every launch).
    nonisolated static func fileName(_ key: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in key.utf8 { h = (h ^ UInt64(b)) &* 0x100000001b3 }
        return String(format: "img-%016llx.jpg", h)
    }

    /// 702 → "11:42", 3725 → "1:02:05", like the timer in Modul de gătit.
    nonisolated static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
}

/// The App Group folder both the app and the widget extension can read.
enum WidgetFiles {
    nonisolated static let group = "group.app.kitchentales"
    nonisolated static let ideaRoundKey = "kt-widget-idea-round"

    /// The shared folder, or (in an unsigned simulator build, which has no App Group) a folder of
    /// the app's own, so the app and its tests still work.
    nonisolated static var folder: URL {
        let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("widgets", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    nonisolated static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    nonisolated static func read() -> WidgetSnapshot {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("snapshot.json")),
              let s = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return .empty }
        return s
    }

    /// Writes the snapshot; false when it is the same as the one already there.
    @discardableResult
    nonisolated static func write(_ s: WidgetSnapshot) -> Bool {
        guard s != read(), let data = try? JSONEncoder().encode(s) else { return false }
        try? data.write(to: folder.appendingPathComponent("snapshot.json"), options: .atomic)
        return true
    }

    nonisolated static func imageURL(_ name: String) -> URL { folder.appendingPathComponent(name) }
}
