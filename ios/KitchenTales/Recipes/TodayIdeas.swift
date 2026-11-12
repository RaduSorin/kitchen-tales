import Foundation

/// Acasă › Azi when nothing is planned today: three dishes from the notebook, each with the
/// reason it is suggested, like the web's src/lib/todayIdeas.ts. Only what the app already has
/// (cook log, favourites, minutes), so it works offline and without AI.
struct TodayIdea: Hashable, Identifiable {
    enum Kind: String, Hashable { case demult, favorita, rapida, noua }
    let recipe: Recipe
    let kind: Kind
    let why: String
    let meta: String
    var id: String { recipe.id }
}

enum TodayIdeas {
    /// Romanian counts: "o săptămână" / "2 săptămâni" / "20 de săptămâni".
    nonisolated static func count(_ n: Int, _ one: String, _ many: String) -> String {
        n == 1 ? one : "\(n) \(n % 100 >= 20 || n % 100 == 0 ? "de " : "")\(many)"
    }

    /// "de 3 săptămâni", "de 2 luni", "de un an".
    nonisolated static func sinceText(_ days: Int) -> String {
        let weeks = days / 7
        if weeks < 9 { return "de \(count(weeks, "o săptămână", "săptămâni"))" }
        let months = days / 30
        if months < 12 { return "de \(count(months, "o lună", "luni"))" }
        return "de \(count(days / 365, "un an", "ani"))"
    }

    nonisolated static func days(from key: String, to now: Date, calendar: Calendar = .current) -> Int {
        let p = key.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let then = calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return 0 }
        return Int((now.timeIntervalSince(then) / 86400).rounded())
    }

    nonisolated static func addedOn(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.flexible.date(from: iso) ?? DateFormatter.dayKey.date(from: String(iso.prefix(10))) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "d MMMM"
        return f.string(from: date)
    }

    /// Up to three ideas, each for a different reason where the notebook allows it. `exclude`
    /// holds the recipes already planned this week; nothing cooked in the last 7 days comes back.
    /// `round` is how many times "Alte idei" was tapped. After 17:00 the quick dish comes first.
    nonisolated static func ideas(_ recipes: [Recipe], logs: [String: RecipeLog], exclude: Set<String>,
                                  now: Date = Date(), round: Int = 0) -> [TodayIdea] {
        struct Item { let r: Recipe; let last: String?; let days: Int; let times: Int; let fav: Bool }
        let items = recipes.filter { $0.mine && !exclude.contains($0.id) }.map { r -> Item in
            let log = logs[r.id]
            let last = log?.cooked.max()
            return Item(r: r, last: last, days: last.map { days(from: $0, to: now) } ?? .max,
                        times: log?.cooked.count ?? 0, fav: log?.favorite ?? false)
        }.filter { $0.days >= 7 }
        let byTitle: (Item, Item) -> Bool = { $0.r.title.compare($1.r.title, locale: Locale(identifier: "ro")) == .orderedAscending }
        func line(_ parts: String?...) -> String { parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }
        let mins: (Recipe) -> String? = { $0.minutes.map(RecipeText.formatMinutes) }
        let portions: (Recipe) -> String? = { $0.servings.map { "\($0) porții" } }

        var pools: [TodayIdea.Kind: [TodayIdea]] = [:]
        pools[.demult] = items.filter { $0.last != nil }
            .sorted { $0.days != $1.days ? $0.days > $1.days : byTitle($0, $1) }
            .map { TodayIdea(recipe: $0.r, kind: .demult, why: "N-ai mai gătit-o \(sinceText($0.days))", meta: line(mins($0.r), portions($0.r))) }
        pools[.favorita] = items.filter { $0.fav && $0.days >= 14 }
            .sorted { $0.days != $1.days ? $0.days > $1.days : byTitle($0, $1) }
            .map { x in
                TodayIdea(recipe: x.r, kind: .favorita, why: x.r.minutes.map { "Favorită · gata în \(RecipeText.formatMinutes($0))" } ?? "Favorită",
                          meta: x.times == 1 ? "gătită o dată" : x.times > 0 ? "gătită de \(count(x.times, "", "ori"))" : "")
            }
        pools[.rapida] = items.filter { ($0.r.minutes ?? 0) > 0 && ($0.r.minutes ?? 0) <= 30 }
            .sorted { a, b in
                if a.days != b.days { return a.days > b.days }
                if a.r.minutes != b.r.minutes { return (a.r.minutes ?? 0) < (b.r.minutes ?? 0) }
                return byTitle(a, b)
            }
            .map { TodayIdea(recipe: $0.r, kind: .rapida, why: "Gata în \(RecipeText.formatMinutes($0.r.minutes ?? 0))", meta: portions($0.r) ?? "") }
        pools[.noua] = items.filter { $0.last == nil }
            .sorted { a, b in (a.r.createdAt ?? "") != (b.r.createdAt ?? "") ? (a.r.createdAt ?? "") > (b.r.createdAt ?? "") : byTitle(a, b) }
            .map { TodayIdea(recipe: $0.r, kind: .noua, why: "Încă negătită", meta: line($0.r.createdAt.map { "adăugată pe \(addedOn($0))" }, mins($0.r))) }

        let hour = Calendar.current.component(.hour, from: now)
        let order: [TodayIdea.Kind] = hour >= 17 ? [.rapida, .demult, .favorita, .noua] : [.demult, .favorita, .rapida, .noua]
        func rotate(_ a: [TodayIdea]) -> [TodayIdea] {
            guard !a.isEmpty else { return a }
            let k = round % a.count
            return Array(a[k...] + a[..<k])
        }
        var picked: [TodayIdea] = []
        for pass in 0..<3 {
            for kind in order where picked.count < 3 {
                if pass == 0 && picked.contains(where: { $0.kind == kind }) { continue }
                if let next = rotate(pools[kind] ?? []).first(where: { idea in !picked.contains { $0.recipe.id == idea.recipe.id } }) {
                    picked.append(next)
                }
            }
        }
        return picked
    }
}

extension DateFormatter {
    /// "2026-11-11".
    nonisolated(unsafe) static let dayKey: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
