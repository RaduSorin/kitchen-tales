import Foundation
import SwiftUI

/// A story from the family library, like `Story` in src/lib/types.ts.
struct Story: Codable, Identifiable, Hashable, Sendable {
    enum Source: String, Codable, Sendable { case upload, recording, generated }

    let id: String
    var title: String
    var emoji: String
    var scene: Int?
    var coverKey: String?
    var collection: String?
    var source: Source
    var audioKey: String
    var durationSec: Double?
    var text: String?
    var favorite: Bool
    var createdAt: String?
    /// False for a story another space shared with every account.
    var mine: Bool
    var shared: Bool
    var spaceName: String?

    /// "Story:<id>": the row the files belong to, for the `fileUrls` check.
    var fileRef: String { "Story:\(id)" }

    var minutesLabel: String? {
        guard let durationSec, durationSec > 0 else { return nil }
        return "\(max(1, Int((durationSec / 60).rounded()))) min"
    }

    /// "Povești Disney · 10 min"
    var detailLine: String {
        [StoryLibrary.folderOf(self), minutesLabel].compactMap { $0 }.joined(separator: " · ")
    }

    /// From a GraphQL `Story` row. `mySpace` is the signed-in account's space group.
    init?(row: [String: Any], mySpace: String?) {
        guard let id = row["id"] as? String, let title = row["title"] as? String,
              let audioKey = row["audioKey"] as? String else { return nil }
        self.id = id
        self.title = title
        emoji = (row["emoji"] as? String) ?? "⭐"
        scene = row["scene"] as? Int
        coverKey = Self.nonEmpty(row["coverKey"])
        collection = Self.nonEmpty(row["collection"])
        source = Source(rawValue: (row["source"] as? String) ?? "") ?? .upload
        self.audioKey = audioKey
        durationSec = (row["durationSec"] as? NSNumber)?.doubleValue
        text = row["text"] as? String
        favorite = (row["favorite"] as? Bool) ?? false
        createdAt = row["createdAt"] as? String
        let groups = row["spaceGroups"] as? [String] ?? []
        mine = mySpace.map { groups.contains($0) } ?? false
        shared = (row["readerGroups"] as? [String] ?? []).contains("everyone")
        spaceName = row["spaceName"] as? String
    }

    init(id: String, title: String, emoji: String, scene: Int? = nil, coverKey: String? = nil, collection: String? = nil,
         source: Source = .upload, audioKey: String = "", durationSec: Double? = nil, favorite: Bool = false,
         createdAt: String? = nil, mine: Bool = true, shared: Bool = true, spaceName: String? = nil) {
        self.id = id; self.title = title; self.emoji = emoji; self.scene = scene; self.coverKey = coverKey
        self.collection = collection; self.source = source; self.audioKey = audioKey; self.durationSec = durationSec
        self.text = nil; self.favorite = favorite; self.createdAt = createdAt; self.mine = mine; self.shared = shared
        self.spaceName = spaceName
    }

    static let fields = "id title emoji scene coverKey collection source audioKey durationSec favorite createdAt spaceGroups readerGroups spaceName"

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty else { return nil }
        return s
    }
}

/// A folder the family made (stories join it through `Story.collection`).
struct StoryFolderRow: Codable, Hashable, Sendable {
    let id: String
    var name: String
    var icon: String?
    var mine: Bool
    var shared: Bool
    var spaceName: String?

    init?(row: [String: Any], mySpace: String?) {
        guard let id = row["id"] as? String, let raw = row["name"] as? String else { return nil }
        let groups = row["spaceGroups"] as? [String] ?? []
        let mine = mySpace.map { groups.contains($0) } ?? false
        let spaceName = row["spaceName"] as? String
        self.id = id
        self.name = mine ? raw : StoryLibrary.receivedFolderName(raw, spaceName)
        icon = row["icon"] as? String
        self.mine = mine
        shared = (row["readerGroups"] as? [String] ?? []).contains("everyone")
        self.spaceName = spaceName
    }

    init(id: String, name: String, icon: String?, mine: Bool, shared: Bool, spaceName: String?) {
        self.id = id; self.name = name; self.icon = icon; self.mine = mine; self.shared = shared; self.spaceName = spaceName
    }

    static let fields = "id name icon spaceGroups readerGroups spaceName"
}

/// A shelf folder with its stories, in shelf order (see `groupFolders` in src/lib/stories.ts).
struct StoryFolder: Identifiable, Hashable, Sendable {
    var id: String { name }
    let name: String
    var items: [Story]
    var icon: String?
    var builtin: Bool
    var mine: Bool
    /// The StoryFolder row (nil for a folder that exists only through its stories).
    var rowId: String? = nil
    var rowShared = false

    /// Our stories in it that every account sees.
    var sharedCount: Int { items.filter { $0.mine && $0.shared }.count }
    /// Shared with every account: all of its stories are (an empty folder: its row is).
    var shared: Bool {
        let own = items.filter(\.mine)
        return own.isEmpty ? rowShared : own.allSatisfy(\.shared)
    }

    var subtitle: String {
        let count = items.count == 1 ? "1 poveste" : "\(items.count) povești"
        let time = StoryLibrary.folderTime(items)
        return time.isEmpty ? count : "\(count) · \(time)"
    }
}

/// The library's rules, ported from src/lib/stories.ts so both apps sort and name things alike.
enum StoryLibrary {
    static let sourceFolder: [Story.Source: String] = [
        .generated: "Povești create de noi", .recording: "Vocea noastră", .upload: "Fișierele mele",
    ]

    static func receivedFolderName(_ collection: String?, _ spaceName: String?) -> String {
        let who = (spaceName?.isEmpty == false ? spaceName : nil) ?? "alt cont"
        if let collection, !collection.isEmpty { return "\(collection) · \(who)" }
        return "Primite de la \(who)"
    }

    static func folderOf(_ s: Story) -> String {
        if !s.mine { return receivedFolderName(s.collection, s.spaceName) }
        return s.collection ?? sourceFolder[s.source] ?? "Fișierele mele"
    }

    static func groupFolders(_ stories: [Story], rows: [StoryFolderRow] = []) -> [StoryFolder] {
        var order: [String] = []
        var map: [String: [Story]] = [:]
        for r in rows where map[r.name] == nil { map[r.name] = []; order.append(r.name) }
        for s in stories {
            let name = folderOf(s)
            if map[name] == nil { map[name] = []; order.append(name) }
            map[name]?.append(s)
        }
        let builtins = Set(sourceFolder.values)
        let folders = order.map { name -> StoryFolder in
            let items = map[name] ?? []
            let row = rows.first { $0.name == name }
            let mine = row?.mine ?? items.allSatisfy(\.mine)
            return StoryFolder(name: name, items: items, icon: row?.icon, builtin: mine && builtins.contains(name), mine: mine,
                               rowId: row?.id, rowShared: row?.shared ?? false)
        }
        return folders.sorted { a, b in
            if a.mine != b.mine { return a.mine }
            if a.builtin != b.builtin { return !a.builtin }
            return a.name.compare(b.name, locale: Locale(identifier: "ro")) == .orderedAscending
        }
    }

    /// The emojis offered for a folder (FOLDER_ICONS).
    static let folderIcons = ["🎵", "📚", "🌙", "⭐", "🐻", "🚗", "🦄", "🎄", "🌊", "🏰"]

    /// What is wrong with a folder name, or nil (folderNameProblem in src/lib/stories.ts).
    static func folderNameProblem(_ name: String, taken: [String], current: String? = nil) -> String? {
        let n = StoryStore.fold(name)
        if n.isEmpty { return "Scrie un nume pentru folder." }
        if name.trimmingCharacters(in: .whitespaces).count > 40 { return "Numele e prea lung (cel mult 40 de litere)." }
        if (taken + Array(sourceFolder.values)).contains(where: { $0 != current && StoryStore.fold($0) == n }) {
            return "Există deja un folder cu acest nume."
        }
        return nil
    }

    /// Total listening time: "45 min", "2 h", "1 h 30".
    static func folderTime(_ items: [Story]) -> String {
        let seconds = items.reduce(0.0) { $0 + ($1.durationSec ?? 0) }
        let minutes = Int((seconds / 60).rounded())
        if minutes == 0 { return "" }
        if minutes < 60 { return "\(minutes) min" }
        let h = minutes / 60, m = minutes % 60
        return m != 0 && h < 10 ? "\(h) h \(m)" : "\(h) h"
    }

    static func greeting(_ now: Date = Date()) -> String {
        let h = Calendar.current.component(.hour, from: now)
        return h < 11 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara"
    }
}

/// The drawn cover of a story without a picture: a sky, a glow behind the emoji and two hills
/// (SCENES in src/lib/stories.ts, same order, same pick from the title).
struct CoverScene: Sendable, Equatable {
    let top: UInt32, bottom: UInt32, glow: UInt32, hill: UInt32

    static let all: [CoverScene] = [
        CoverScene(top: 0xC8324A, bottom: 0x5A1630, glow: 0xFF9FB0, hill: 0x3A0F22),
        CoverScene(top: 0x3F7FD0, bottom: 0x16245E, glow: 0xBFE3FF, hill: 0x0E1A44),
        CoverScene(top: 0xE08A3A, bottom: 0x7A3415, glow: 0xFFD9A0, hill: 0x4A1F0C),
        CoverScene(top: 0x4C9A6A, bottom: 0x164A3A, glow: 0xD3F5C9, hill: 0x0B2E24),
        CoverScene(top: 0xD9759A, bottom: 0x5E2A6E, glow: 0xFFD1E3, hill: 0x3A1745),
        CoverScene(top: 0x5A54C8, bottom: 0x151248, glow: 0xFFF1A8, hill: 0x0B0A2E),
        CoverScene(top: 0xD3A63A, bottom: 0x6E4A12, glow: 0xFFF0B8, hill: 0x3E2808),
        CoverScene(top: 0x7FB5D9, bottom: 0x2F4F8A, glow: 0xE6F6FF, hill: 0x1B2E5A),
    ]

    static func of(_ story: Story) -> CoverScene { of(title: story.title, scene: story.scene) }

    static func of(title: String, scene: Int?) -> CoverScene {
        if let scene, all.indices.contains(scene) { return all[scene] }
        return all[index(title)]
    }

    /// Same as the web: h = (h * 31 + code point) | 0 over the title, then |h| % 8.
    static func index(_ title: String) -> Int {
        var h: Int32 = 0
        for scalar in title.unicodeScalars {
            h = h &* 31 &+ Int32(bitPattern: scalar.value)
        }
        let magnitude = h == Int32.min ? Int(Int32.max) + 1 : Int(abs(h))
        return magnitude % all.count
    }
}

/// Where each story was paused and which one played last (this phone only), like the web.
enum PlaybackMemory {
    private static func key(_ id: String) -> String { "kt-story-pos-\(id)" }

    static func position(_ id: String) -> Double { UserDefaults.standard.double(forKey: key(id)) }

    static func setPosition(_ id: String, _ seconds: Double?) {
        if let seconds, seconds >= 1 {
            UserDefaults.standard.set(seconds.rounded(.down), forKey: key(id))
        } else {
            UserDefaults.standard.removeObject(forKey: key(id))
        }
        UserDefaults.standard.set(id, forKey: "kt-last-story")
    }

    static var lastStoryId: String? { UserDefaults.standard.string(forKey: "kt-last-story") }

    /// Stories started on this phone (the web's kt-played-stories), so "Nou" goes away.
    static var played: Set<String> { Set(UserDefaults.standard.stringArray(forKey: "kt-played-stories") ?? []) }

    static func markPlayed(_ id: String) {
        var list = UserDefaults.standard.stringArray(forKey: "kt-played-stories") ?? []
        guard !list.contains(id) else { return }
        list.append(id)
        UserDefaults.standard.set(Array(list.suffix(2000)), forKey: "kt-played-stories")
    }

    /// Added in the last two weeks and never started on this phone (isNewStory in stories.ts).
    static func isNew(_ s: Story, now: Date = Date()) -> Bool {
        guard let created = s.createdAt,
              let date = ISO8601DateFormatter.flexible.date(from: created) ?? DateFormatter.dayKey.date(from: String(created.prefix(10))),
              now.timeIntervalSince(date) <= 14 * 86400 else { return false }
        return !played.contains(s.id) && position(s.id) == 0
    }
}
