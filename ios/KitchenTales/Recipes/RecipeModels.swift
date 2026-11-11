import Foundation

/// A recipe, like `Recipe` in src/lib/types.ts (the same AppSync table as the web app).
struct Recipe: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var category: String
    var servings: Int?
    var minutes: Int?
    var ingredients: [String]
    var steps: [String]
    /// A photo per step, aligned with `steps` ("" = none).
    var stepPhotoKeys: [String]
    var notes: String?
    var sourceUrl: String?
    var photoKey: String?
    var createdAt: String?
    /// False for a recipe another space shared with every account.
    var mine: Bool
    var shared: Bool
    var spaceName: String?
    /// Screenshots only: a photo bundled with the app instead of one on the server.
    var demoPhoto: String?

    /// "Recipe:<id>": the row the files belong to, for the `fileUrls` check.
    var fileRef: String { "Recipe:\(id)" }

    /// "1 h 30 · Ciorbe și supe"
    var detailLine: String {
        [minutes.map(RecipeText.formatMinutes), category.isEmpty ? nil : category].compactMap { $0 }.joined(separator: " · ")
    }

    func stepPhoto(_ index: Int) -> String? {
        guard index < stepPhotoKeys.count, !stepPhotoKeys[index].isEmpty else { return nil }
        return stepPhotoKeys[index]
    }

    /// From a GraphQL `Recipe` row. `mySpace` is the signed-in account's space group.
    init?(row: [String: Any], mySpace: String?) {
        guard let id = row["id"] as? String, let title = row["title"] as? String else { return nil }
        self.id = id
        self.title = title
        category = (row["category"] as? String) ?? ""
        servings = (row["servings"] as? NSNumber)?.intValue
        minutes = (row["minutes"] as? NSNumber)?.intValue
        ingredients = Self.lines(row["ingredients"])
        steps = Self.lines(row["steps"])
        stepPhotoKeys = (row["stepPhotoKeys"] as? [Any])?.map { ($0 as? String) ?? "" } ?? []
        notes = Self.nonEmpty(row["notes"])
        sourceUrl = Self.nonEmpty(row["sourceUrl"])
        photoKey = Self.nonEmpty(row["photoKey"])
        createdAt = row["createdAt"] as? String
        let groups = row["spaceGroups"] as? [String] ?? []
        mine = mySpace.map { groups.contains($0) } ?? false
        shared = (row["readerGroups"] as? [String] ?? []).contains("everyone")
        spaceName = row["spaceName"] as? String
        demoPhoto = nil
    }

    init(id: String, title: String, category: String, servings: Int? = nil, minutes: Int? = nil,
         ingredients: [String] = [], steps: [String] = [], notes: String? = nil, createdAt: String? = nil,
         mine: Bool = true, shared: Bool = false, spaceName: String? = nil, demoPhoto: String? = nil) {
        self.id = id; self.title = title; self.category = category; self.servings = servings; self.minutes = minutes
        self.ingredients = ingredients; self.steps = steps; stepPhotoKeys = []; self.notes = notes; sourceUrl = nil
        photoKey = nil; self.createdAt = createdAt; self.mine = mine; self.shared = shared; self.spaceName = spaceName
        self.demoPhoto = demoPhoto
    }

    static let fields = "id title category servings minutes ingredients steps stepPhotoKeys notes sourceUrl photoKey createdAt spaceGroups readerGroups spaceName"

    private static func lines(_ value: Any?) -> [String] {
        ((value as? [Any]) ?? []).compactMap { $0 as? String }.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty else { return nil }
        return s
    }
}

/// A recipe planned for a day of "Săptămâna mea" (`day` is a local YYYY-MM-DD).
struct PlanEntry: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var day: String
    var recipeId: String
    var servings: Int?
    var leftovers: Bool

    init?(row: [String: Any]) {
        guard let id = row["id"] as? String, let day = row["day"] as? String, let recipeId = row["recipeId"] as? String else { return nil }
        self.id = id; self.day = day; self.recipeId = recipeId
        servings = (row["servings"] as? NSNumber)?.intValue
        leftovers = (row["leftovers"] as? Bool) ?? false
    }

    init(id: String, day: String, recipeId: String, servings: Int? = nil) {
        self.id = id; self.day = day; self.recipeId = recipeId; self.servings = servings; leftovers = false
    }

    static let fields = "id day recipeId servings leftovers"
}

/// One line of the family shopping list.
struct ShoppingLine: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var text: String
    var checked: Bool
    var recipeId: String?
    var recipeTitle: String?

    init?(row: [String: Any]) {
        guard let id = row["id"] as? String, let text = row["text"] as? String else { return nil }
        self.id = id; self.text = text
        checked = (row["checked"] as? Bool) ?? false
        recipeId = row["recipeId"] as? String
        recipeTitle = row["recipeTitle"] as? String
    }

    init(id: String, text: String, checked: Bool = false, recipeId: String? = nil, recipeTitle: String? = nil) {
        self.id = id; self.text = text; self.checked = checked; self.recipeId = recipeId; self.recipeTitle = recipeTitle
    }

    static let fields = "id text checked recipeId recipeTitle"
}

/// A note written after cooking ("Data viitoare mai puțină sare").
struct CookNote: Codable, Hashable, Sendable {
    var day: String
    var text: String
    var by: String?
}

/// What the space remembers about a recipe: favourite, the days it was cooked and the notes.
struct RecipeLog: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var recipeId: String
    var favorite: Bool
    var cooked: [String]
    var notes: [CookNote]

    init?(row: [String: Any]) {
        guard let id = row["id"] as? String, let recipeId = row["recipeId"] as? String else { return nil }
        self.id = id; self.recipeId = recipeId
        favorite = (row["favorite"] as? Bool) ?? false
        cooked = ((row["cooked"] as? [Any]) ?? []).compactMap { $0 as? String }
        notes = ((row["notes"] as? [Any]) ?? []).compactMap { item in
            guard let text = item as? String, let data = text.data(using: .utf8) else { return nil }
            return try? JSONDecoder().decode(CookNote.self, from: data)
        }
    }

    init(id: String, recipeId: String, favorite: Bool = false, cooked: [String] = [], notes: [CookNote] = []) {
        self.id = id; self.recipeId = recipeId; self.favorite = favorite; self.cooked = cooked; self.notes = notes
    }

    /// The notes as the table stores them: one JSON string each.
    var noteStrings: [String] {
        notes.compactMap { (try? JSONEncoder().encode($0)).flatMap { String(data: $0, encoding: .utf8) } }
    }

    static let fields = "id recipeId favorite cooked notes"
}
