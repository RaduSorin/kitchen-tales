import CryptoKit
import Foundation

/// One thing the family avoids (src/lib/diet.ts): `strict` is an allergy (never in a dish),
/// otherwise "we avoid it" (swap it).
struct DietRule: Codable, Hashable, Sendable {
    var key: String
    var strict: Bool
    var who: String?
}

struct Diet: Codable, Hashable, Sendable {
    var avoid: [DietRule] = []
    var dislikes: String = ""

    /// The choices offered, with the web's keys (they match the allergens the AI names).
    static let items: [(key: String, label: String)] = [
        ("gluten", "Gluten"), ("lactoza", "Lactoză"), ("oua", "Ouă"), ("nuci", "Nuci"), ("arahide", "Arahide"),
        ("peste", "Pește"), ("crustacee", "Crustacee"), ("soia", "Soia"), ("susan", "Susan"), ("telina", "Țelină"),
        ("mustar", "Muștar"), ("porc", "Porc"), ("carne", "Carne"),
    ]

    static func label(_ key: String) -> String { items.first { $0.key == key }?.label ?? key }

    /// Reads the JSON the web stores (`{"avoid":[{"key","strict","who"}],"dislikes"}`).
    static func parse(_ text: String?) -> Diet? {
        guard let text, let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        let avoid = (raw["avoid"] as? [[String: Any]] ?? []).compactMap { item -> DietRule? in
            guard let key = item["key"] as? String, !key.isEmpty else { return nil }
            let who = (item["who"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            return DietRule(key: key, strict: item["strict"] as? Bool ?? false, who: who)
        }
        return Diet(avoid: avoid, dislikes: raw["dislikes"] as? String ?? "")
    }

    var json: String {
        let avoid: [[String: Any]] = avoid.map { r in
            var item: [String: Any] = ["key": r.key, "strict": r.strict]
            if let who = r.who, !who.isEmpty { item["who"] = who }
            return item
        }
        let data = (try? JSONSerialization.data(withJSONObject: ["avoid": avoid, "dislikes": dislikes], options: [.sortedKeys])) ?? Data()
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// "de toate", "fără nuci", "fără nuci, lactoză" (Profil's summary line).
    var summary: String {
        avoid.isEmpty ? "de toate" : "fără " + avoid.map { Self.label($0.key).lowercased() }.joined(separator: ", ")
    }
}

/// The space's settings, one FamilySettings row per space (id = the space group), the same row
/// the web edits, so a change on the phone shows there too.
struct FamilySettings: Codable, Hashable, Sendable {
    var childName = ""
    var childBirthYear: Int?
    var childGender: String?
    var childCanRead = false
    var city: String?
    var kitchenTools: [String] = []
    var kidPinHash: String?
    var kidPinSalt: String?
    var kidMinutes = 30
    var kidFolders: [String] = []
    var diet = Diet()
    var narrator = ""
    var narratorName = ""
    var spaceName: String?

    static let fields = "id childName childBirthYear childGender childCanRead city kitchenTools kidPinHash kidPinSalt kidMinutes kidFolders diet narrator narratorName spaceName"

    init() {}

    init(row: [String: Any]) {
        let text = { (key: String) -> String? in (row[key] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        childName = row["childName"] as? String ?? ""
        childBirthYear = row["childBirthYear"] as? Int
        childGender = text("childGender")
        childCanRead = row["childCanRead"] as? Bool ?? false
        city = text("city")
        kitchenTools = (row["kitchenTools"] as? [Any] ?? []).compactMap { ($0 as? String).flatMap { $0.isEmpty ? nil : $0 } }
        kidPinHash = text("kidPinHash")
        kidPinSalt = text("kidPinSalt")
        kidMinutes = row["kidMinutes"] as? Int ?? 30
        kidFolders = (row["kidFolders"] as? [Any] ?? []).compactMap { $0 as? String }
        diet = Diet.parse(row["diet"] as? String) ?? Diet()
        narrator = row["narrator"] as? String ?? ""
        narratorName = row["narratorName"] as? String ?? ""
        spaceName = text("spaceName")
    }

    /// The row's fields as the server takes them; unset values are sent as null, like the web.
    var input: [String: Any] {
        [
            "childName": childName, "childBirthYear": childBirthYear ?? NSNull(), "childGender": childGender ?? NSNull(),
            "childCanRead": childCanRead, "city": city ?? NSNull(), "kitchenTools": kitchenTools,
            "kidPinHash": kidPinHash ?? NSNull(), "kidPinSalt": kidPinSalt ?? NSNull(), "kidMinutes": kidMinutes,
            "kidFolders": kidFolders, "diet": diet.json, "narrator": narrator, "narratorName": narratorName,
            "spaceName": spaceName ?? NSNull(),
        ]
    }

    /// The fields that differ from `other`, so two phones editing different settings don't
    /// overwrite each other (settingsSync.ts).
    func changedKeys(from other: FamilySettings?) -> [String] {
        guard let other else { return Array(input.keys) }
        let mine = input, theirs = other.input
        return mine.keys.filter { "\(mine[$0]!)" != "\(theirs[$0]!)" }
    }

    var hasPin: Bool { kidPinHash != nil }
    var childAge: Int? {
        guard let year = childBirthYear else { return nil }
        let age = Calendar.current.component(.year, from: Date()) - year
        return age >= 0 && age < 30 ? age : nil
    }
    /// "Carmen" when no ElevenLabs voice was picked (the stories are then read by Polly).
    var voiceName: String { narrator.isEmpty ? "Carmen" : (narratorName.isEmpty ? "Vocea aleasă" : narratorName) }
}

/// The kid mode PIN, salted SHA-256 as hex, the same as kidMode.ts, so a PIN set on the web
/// works on the phone.
enum KidPin {
    nonisolated static func hash(_ pin: String, salt: String) -> String {
        SHA256.hash(data: Data("\(salt):\(pin)".utf8)).map { String(format: "%02x", $0) }.joined()
    }

    nonisolated static func newSalt() -> String {
        (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }
}

/// An account that can sign in (only admins see the list).
struct FamilyMember: Codable, Hashable, Identifiable, Sendable {
    var email: String
    var pending: Bool
    var sameSpace: Bool
    var id: String { email }

    init?(row: [String: Any]) {
        guard let email = row["email"] as? String else { return nil }
        self.email = email
        pending = row["pending"] as? Bool ?? false
        sameSpace = row["sameSpace"] as? Bool ?? false
    }

    init(email: String, pending: Bool, sameSpace: Bool) {
        self.email = email; self.pending = pending; self.sameSpace = sameSpace
    }

    static let fields = "email pending createdAt space sameSpace"

    /// "loredana" from "loredana@…", with a capital first letter.
    var name: String {
        let part = String(email.split(separator: "@").first ?? "")
        return part.prefix(1).uppercased() + part.dropFirst()
    }
}

/// A voice from the family's ElevenLabs account, for the narrator picker.
struct NarratorVoice: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var description: String?

    init?(row: [String: Any]) {
        guard let id = row["id"] as? String, let name = row["name"] as? String else { return nil }
        self.id = id; self.name = name
        description = (row["description"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    init(id: String, name: String, description: String?) { self.id = id; self.name = name; self.description = description }

    static let fields = "id name description"
}

/// Settings that belong to this phone only.
enum PhoneSettings {
    /// A soft click when the Cover Flow moves to the next cover (web: "Clic pe raft").
    static let shelfClickKey = "kt-shelf-click"
}

/// The appliances offered in Bucătăria mea (src/lib/kitchenTools.ts); the family can add their own.
enum KitchenTools {
    static let presets = ["Thermomix", "Oală sub presiune", "Multicooker", "Air fryer", "Robot de bucătărie", "Blender",
                          "Mixer", "Slow cooker", "Mașină de pâine", "Cuptor cu microunde", "Grătar", "Sous-vide"]
}

extension Int {
    /// "1 aparat" / "4 aparate" / "21 de aparate" (Romanian plural with "de" from 20).
    func ro(_ one: String, _ many: String) -> String {
        if self == 1 { return "1 \(one)" }
        let rest = self % 100
        return self >= 20 && (rest == 0 || rest >= 20) ? "\(self) de \(many)" : "\(self) \(many)"
    }
}
