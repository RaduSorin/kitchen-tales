import Foundation

/// One story the family chose to hear next, and whether the child chose it in kid mode.
struct QueuedStory: Codable, Equatable, Sendable {
    let id: String
    var byKid = false
}

/// "Urmează": the stories the family picked to play next, in their order. They play before the
/// folder goes on by itself. The list is this phone's only and stays after the app is closed.
/// The rules (no story twice, "Redă următoarea" moves a story to the front, the child's limit)
/// live here so they can be tested without a player.
struct UpNext: Codable, Equatable, Sendable {
    /// In kid mode the child may choose this many stories ahead (so it is not "one more" forever).
    static let kidLimit = 3

    private(set) var items: [QueuedStory] = []

    var isEmpty: Bool { items.isEmpty }
    var count: Int { items.count }
    var ids: [String] { items.map(\.id) }
    var kidCount: Int { items.filter(\.byKid).count }
    /// The child can still choose one more.
    var kidHasRoom: Bool { kidCount < Self.kidLimit }

    func contains(_ id: String) -> Bool { items.contains { $0.id == id } }

    /// 1 for the first story to come, nil when the story is not in the list.
    func place(of id: String) -> Int? { items.firstIndex { $0.id == id }.map { $0 + 1 } }

    /// "Redă următoarea": right after the story playing now. A story already in the list moves up.
    mutating func playNext(_ id: String, byKid: Bool = false) {
        let kept = items.first { $0.id == id }
        items.removeAll { $0.id == id }
        items.insert(QueuedStory(id: id, byKid: kept?.byKid ?? byKid), at: 0)
    }

    /// "Adaugă la coadă": at the end. False when it was already there (it stays where it was) or
    /// the child has no room left.
    @discardableResult
    mutating func add(_ id: String, byKid: Bool = false) -> Bool {
        guard !contains(id), !byKid || kidHasRoom else { return false }
        items.append(QueuedStory(id: id, byKid: byKid))
        return true
    }

    mutating func remove(_ id: String) { items.removeAll { $0.id == id } }

    /// Takes the stories at `offsets` out and puts them back before `destination` (the index in the
    /// list as it was, like SwiftUI's `onMove`).
    mutating func move(from offsets: IndexSet, to destination: Int) {
        let moving = offsets.sorted().filter { $0 < items.count }.map { items[$0] }
        let before = offsets.filter { $0 < destination }.count
        var rest = items.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)
        rest.insert(contentsOf: moving, at: min(max(0, destination - before), rest.count))
        items = rest
    }

    mutating func clear() { items = [] }

    /// Drops stories that were deleted (or moved where this phone cannot see them).
    mutating func keep(only known: Set<String>) { items.removeAll { !known.contains($0.id) } }

    /// With "După N povești" and `played` stories already finished in this run: how many of the
    /// stories still to come play before the player stops by itself (the moon line goes there).
    /// The story playing now is number `played + 1`.
    static func untilStop(stopAfter: Int, played: Int) -> Int { max(0, stopAfter - played - 1) }

    // MARK: Saved on the phone

    private static let key = "kt-up-next"

    static func saved(_ defaults: UserDefaults = .standard) -> UpNext {
        guard let data = defaults.data(forKey: key), let list = try? JSONDecoder().decode(UpNext.self, from: data) else { return UpNext() }
        return list
    }

    func save(_ defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.key) }
    }
}
