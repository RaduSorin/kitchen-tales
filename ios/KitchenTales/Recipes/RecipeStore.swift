import Foundation
import Observation

/// The family's recipes with this week's plan, the shopping list and what the space remembers
/// about each recipe: the phone's copy first, then a fresh list from the server (the same
/// AppSync tables as the web app).
@MainActor @Observable
final class RecipeStore {
    enum Phase: Equatable { case idle, loading, loaded, failed(String) }

    private(set) var recipes: [Recipe] = []
    private(set) var plan: [PlanEntry] = []
    private(set) var shopping: [ShoppingLine] = []
    private(set) var logs: [RecipeLog] = []
    private(set) var phase: Phase = .idle
    /// True when the list shown is the phone's copy because the server could not be reached.
    private(set) var showingCopy = false

    let links: FileLinks?
    private let client: GraphQLClient?
    private let cache: DeviceCache
    private let mySpace: () -> String?
    private let myName: () -> String?
    private let demo: Bool

    private struct Saved: Codable {
        var recipes: [Recipe]; var plan: [PlanEntry]; var shopping: [ShoppingLine]; var logs: [RecipeLog]
    }
    private static let cacheKey = "recipes/library"

    init(auth: AuthModel, config: BackendConfig? = .fromBundle(), cache: DeviceCache = .shared) {
        demo = LaunchOptions.demoAccount != nil
        let client = config.map { config in
            GraphQLClient(config: config, token: { @Sendable in try await auth.validTokens().accessToken })
        }
        self.client = client
        links = client.map { FileLinks(client: $0) }
        self.cache = cache
        mySpace = { [weak auth] in auth?.account?.space }
        myName = { [weak auth] in auth?.account?.displayName }
        if demo {
            recipes = DemoKitchen.recipes
            plan = DemoKitchen.plan()
            logs = DemoKitchen.logs
            shopping = DemoKitchen.shopping
            phase = .loaded
        } else if let saved = cache.read(Saved.self, key: Self.cacheKey) {
            recipes = saved.recipes; plan = saved.plan; shopping = saved.shopping; logs = saved.logs
        }
    }

    func recipe(_ id: String) -> Recipe? { recipes.first { $0.id == id } }

    // MARK: What Acasă shows

    /// Newest first.
    var recent: [Recipe] { Array(recipes.prefix(10)) }

    func entries(on day: Date) -> [PlanEntry] {
        let key = RecipeText.dayKey(day)
        return plan.filter { $0.day == key && recipe($0.recipeId) != nil }
    }

    var today: [Recipe] { entries(on: Date()).compactMap { recipe($0.recipeId) } }

    /// The categories with their recipes, biggest first ("Fără categorie" last).
    var categories: [(name: String, recipes: [Recipe])] {
        let groups = Dictionary(grouping: recipes) { $0.category.isEmpty ? "Fără categorie" : $0.category }
        return groups.map { (name: $0.key, recipes: $0.value) }
            .sorted { a, b in
                if (a.name == "Fără categorie") != (b.name == "Fără categorie") { return b.name == "Fără categorie" }
                return a.recipes.count != b.recipes.count ? a.recipes.count > b.recipes.count : a.name < b.name
            }
    }

    var categoryNames: [String] { categories.map(\.name) }

    /// Recipes added in the last 7 days count as new ("2 noi" on the category card).
    func isNew(_ recipe: Recipe) -> Bool {
        guard let created = recipe.createdAt, let date = ISO8601DateFormatter.flexible.date(from: created) else { return false }
        return Date().timeIntervalSince(date) < 7 * 86400
    }

    /// The hero on Acasă: the recipe being cooked, today's plan, then the newest.
    var heroSlides: [HeroSlide] {
        var slides: [HeroSlide] = []
        func add(_ r: Recipe?, _ kind: HeroSlide.Kind) {
            guard let r, !slides.contains(where: { $0.recipe.id == r.id }), slides.count < 3 else { return }
            slides.append(HeroSlide(recipe: r, kind: kind))
        }
        if let last = CookProgress.last, let step = CookProgress.step(last), let r = recipe(last) {
            add(r, .cooking(step: step))
        }
        add(today.first, .planned)
        for r in recipes { add(r, slides.isEmpty || recipes.first?.id == r.id ? .newest : .fromBook) }
        return slides
    }

    func search(_ text: String, category: String?) -> [Recipe] {
        recipes.filter { r in
            let inCategory = category.map { ($0 == "Fără categorie" && r.category.isEmpty) || r.category == $0 } ?? true
            return inCategory && RecipeText.matches(([r.title, r.category] + r.ingredients).joined(separator: " "), query: text)
        }
    }

    // MARK: Favourites and notes (RecipeLog)

    /// The recipe's log; two rows made offline on two phones count as one.
    func log(_ recipeId: String) -> RecipeLog? {
        let rows = logs.filter { $0.recipeId == recipeId }
        guard var first = rows.first else { return nil }
        if rows.count > 1 {
            first.favorite = rows.contains(where: \.favorite)
            first.cooked = Array(Set(rows.flatMap(\.cooked))).sorted()
            first.notes = rows.flatMap(\.notes).sorted { $0.day < $1.day }
        }
        return first
    }

    func isFavorite(_ recipeId: String) -> Bool { log(recipeId)?.favorite ?? false }

    func toggleFavorite(_ recipeId: String) async {
        await changeLog(recipeId) { $0.favorite.toggle() }
    }

    /// Counts the recipe as cooked today (once a day).
    func markCooked(_ recipeId: String) async {
        let day = RecipeText.dayKey(Date())
        guard !(log(recipeId)?.cooked.contains(day) ?? false) else { return }
        await changeLog(recipeId) { $0.cooked = ($0.cooked + [day]).sorted() }
    }

    func addNote(_ recipeId: String, text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let note = CookNote(day: RecipeText.dayKey(Date()), text: trimmed, by: myName())
        await changeLog(recipeId) { $0.notes.append(note) }
    }

    private func changeLog(_ recipeId: String, _ edit: (inout RecipeLog) -> Void) async {
        var next = log(recipeId) ?? RecipeLog(id: UUID().uuidString.lowercased(), recipeId: recipeId)
        let isNewRow = !logs.contains { $0.id == next.id }
        edit(&next)
        let before = logs
        logs.removeAll { $0.recipeId == recipeId }
        logs.append(next)
        save()
        guard !demo, let client else { return }
        do {
            var input: [String: Any] = ["id": next.id, "favorite": next.favorite, "cooked": next.cooked, "notes": next.noteStrings]
            if isNewRow {
                guard let space = mySpace() else { throw BackendError.notConfigured }
                input["recipeId"] = recipeId
                input["spaceGroups"] = [space]
                _ = try await client.run("mutation Log($input: CreateRecipeLogInput!) { createRecipeLog(input: $input) { id } }",
                                         variables: ["input": input])
            } else {
                _ = try await client.run("mutation Log($input: UpdateRecipeLogInput!) { updateRecipeLog(input: $input) { id } }",
                                         variables: ["input": input])
                // Duplicate rows were folded into this one.
                for extra in before where extra.recipeId == recipeId && extra.id != next.id {
                    _ = try? await client.run("mutation Del($input: DeleteRecipeLogInput!) { deleteRecipeLog(input: $input) { id } }",
                                              variables: ["input": ["id": extra.id]])
                }
            }
        } catch {
            logs = before
            save()
            Haptics.warning()
        }
    }

    // MARK: Week plan and shopping list

    /// Puts the recipe on a day of the week (servings only when they differ from the recipe's).
    func planRecipe(_ recipe: Recipe, on day: Date, servings: Int? = nil, leftovers: Bool = false) async -> Bool {
        var entry = PlanEntry(id: UUID().uuidString.lowercased(), day: RecipeText.dayKey(day), recipeId: recipe.id,
                              servings: servings != recipe.servings ? servings : nil)
        entry.leftovers = leftovers
        plan.append(entry)
        save()
        guard !demo, let client else { return true }
        do {
            guard let space = mySpace() else { throw BackendError.notConfigured }
            var input: [String: Any] = ["id": entry.id, "day": entry.day, "recipeId": entry.recipeId, "spaceGroups": [space]]
            if let s = entry.servings { input["servings"] = s }
            if leftovers { input["leftovers"] = true }
            _ = try await client.run("mutation Plan($input: CreateMealPlanEntryInput!) { createMealPlanEntry(input: $input) { id } }",
                                     variables: ["input": input])
            return true
        } catch {
            plan.removeAll { $0.id == entry.id }
            save()
            return false
        }
    }

    /// The ingredient without its amount, so "500 g carne" and "750 g carne" are the same line.
    nonisolated static func withoutAmount(_ line: String) -> String {
        let t = RecipeText.norm(line)
        let trimmed = t.drop { "0123456789 .,/½¼¾⅓⅔⅛-–".contains($0) }
        return trimmed.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Puts the ingredients on the list, scaled to the servings; skips lines already there and
    /// not bought; the same recipe at other servings replaces its amounts. Returns lines added,
    /// or nil when the server refused.
    func addToShopping(_ recipe: Recipe, servings: Int? = nil) async -> Int? {
        let factor = recipe.servings.flatMap { base in servings.map { Double($0) / Double(base) } } ?? 1
        let lines = recipe.ingredients.map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !RecipeText.isHeading($0) }
            .map { RecipeText.scaleIngredient($0, factor: factor) }
        var mine = shopping.filter { !$0.checked && $0.recipeId == recipe.id }
        var toRemove: [ShoppingLine] = []
        var toAdd: [ShoppingLine] = []
        for text in lines where !mine.contains(where: { $0.text == text }) {
            let key = Self.withoutAmount(text)
            for old in mine where old.text != text && Self.withoutAmount(old.text) == key {
                toRemove.append(old)
                mine.removeAll { $0.id == old.id }
            }
            let line = ShoppingLine(id: UUID().uuidString.lowercased(), text: text, recipeId: recipe.id, recipeTitle: recipe.title)
            mine.append(line)
            toAdd.append(line)
        }
        let before = shopping
        shopping.removeAll { line in toRemove.contains { $0.id == line.id } }
        shopping += toAdd
        save()
        guard !demo, let client else { return toAdd.count }
        do {
            guard let space = mySpace() else { throw BackendError.notConfigured }
            for old in toRemove {
                _ = try await client.run("mutation Del($input: DeleteShoppingItemInput!) { deleteShoppingItem(input: $input) { id } }",
                                         variables: ["input": ["id": old.id]])
            }
            for line in toAdd {
                _ = try await client.run("mutation Add($input: CreateShoppingItemInput!) { createShoppingItem(input: $input) { id } }",
                                         variables: ["input": ["id": line.id, "text": line.text, "checked": false, "recipeId": recipe.id,
                                                               "recipeTitle": recipe.title, "spaceGroups": [space]]])
            }
            return toAdd.count
        } catch {
            shopping = before
            save()
            return nil
        }
    }

    // MARK: Changing the plan

    /// One AppSync mutation (`createX`, `updateX`, `deleteX`) with its input.
    // MARK: Writing recipes (the editor)

    /// The editor's way to the server; nil in demo screenshots or without a space.
    var server: RecipeServer? {
        guard !demo, let client, let space = mySpace() else { return nil }
        return RecipeServer(client: client, space: space)
    }

    var isDemo: Bool { demo }

    /// A recipe just saved by the editor: replaces its old copy, or comes first in the list.
    func saved(_ recipe: Recipe) {
        if let i = recipes.firstIndex(where: { $0.id == recipe.id }) {
            recipes[i] = recipe
        } else {
            recipes.insert(recipe, at: 0)
        }
        save()
    }

    // MARK: Sharing (Profil → Ce partajez)

    /// Shares a recipe of ours with every account ("everyone"), or makes it private again.
    func setShared(_ id: String, _ shared: Bool, spaceName: String?) async -> Bool {
        guard let i = recipes.firstIndex(where: { $0.id == id }) else { return false }
        recipes[i].shared = shared
        save()
        do {
            var input: [String: Any] = ["id": id, "readerGroups": shared ? ["everyone"] : [String]()]
            if let spaceName { input["spaceName"] = spaceName }
            try await mutate("updateRecipe", "UpdateRecipeInput", input)
            return true
        } catch {
            if let j = recipes.firstIndex(where: { $0.id == id }) { recipes[j].shared = !shared }
            save()
            Haptics.warning()
            return false
        }
    }

    /// Puts the space's new name on the recipes it already shares.
    func renameShared(to name: String) async {
        for r in recipes where r.mine && r.shared && r.spaceName != name {
            if let i = recipes.firstIndex(where: { $0.id == r.id }) { recipes[i].spaceName = name }
            try? await mutate("updateRecipe", "UpdateRecipeInput", ["id": r.id, "spaceName": name])
        }
        save()
    }

    private func mutate(_ field: String, _ inputType: String, _ input: [String: Any]) async throws {
        guard !demo, let client else { return }
        _ = try await client.run("mutation M($input: \(inputType)!) { \(field)(input: $input) { id } }", variables: ["input": input])
    }

    /// Runs a local change at once and sends it; on failure the old state comes back.
    private func change(_ apply: () -> Void, send: () async throws -> Void) async -> Bool {
        let before = (plan, shopping)
        apply()
        save()
        do {
            try await send()
            return true
        } catch {
            (plan, shopping) = before
            save()
            Haptics.warning()
            return false
        }
    }

    @discardableResult
    func removePlan(_ entryId: String) async -> Bool {
        await change({ plan.removeAll { $0.id == entryId } }) {
            try await mutate("deleteMealPlanEntry", "DeleteMealPlanEntryInput", ["id": entryId])
        }
    }

    @discardableResult
    func movePlan(_ entryId: String, to day: Date) async -> Bool {
        let key = RecipeText.dayKey(day)
        return await change({ if let i = plan.firstIndex(where: { $0.id == entryId }) { plan[i].day = key } }) {
            try await mutate("updateMealPlanEntry", "UpdateMealPlanEntryInput", ["id": entryId, "day": key])
        }
    }

    /// Servings for one planned cooking (nil = the recipe's own).
    @discardableResult
    func setServings(_ entryId: String, _ servings: Int) async -> Bool {
        guard let entry = plan.first(where: { $0.id == entryId }) else { return false }
        let base = recipe(entry.recipeId)?.servings
        let value: Int? = servings == base ? nil : servings
        return await change({ if let i = plan.firstIndex(where: { $0.id == entryId }) { plan[i].servings = value } }) {
            try await mutate("updateMealPlanEntry", "UpdateMealPlanEntryInput", ["id": entryId, "servings": value.map { $0 as Any } ?? NSNull()])
        }
    }

    /// The servings a planned cooking is for.
    func servings(of entry: PlanEntry) -> Int? { entry.servings ?? recipe(entry.recipeId)?.servings }

    /// What the next 7 days need, on the list: each planned cooking counts (twice planned, twice
    /// the amounts), scaled to its servings; a recipe's open lines are replaced by the new totals.
    /// Returns the lines added, or nil when the server refused.
    func addPlanToShopping(from start: Date = Date()) async -> Int? {
        let first = Calendar.current.startOfDay(for: start)
        let days = Set((0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: first) }.map { RecipeText.dayKey($0) })
        var factors: [String: Double] = [:]
        for e in plan where days.contains(e.day) && !e.leftovers {
            guard let r = recipe(e.recipeId) else { continue }
            let one = r.servings.flatMap { base in e.servings.map { Double($0) / Double(base) } } ?? 1
            factors[r.id, default: 0] += one
        }
        var toRemove: [ShoppingLine] = []
        var toAdd: [ShoppingLine] = []
        for (id, factor) in factors.sorted(by: { $0.key < $1.key }) {
            guard let r = recipe(id) else { continue }
            var want: [String] = []
            for line in r.ingredients.map({ $0.trimmingCharacters(in: .whitespaces) }) where !line.isEmpty && !RecipeText.isHeading(line) {
                let text = RecipeText.scaleIngredient(line, factor: factor)
                if !want.contains(text) { want.append(text) }
            }
            let open = shopping.filter { !$0.checked && $0.recipeId == id }
            toRemove += open.filter { !want.contains($0.text) }
            for text in want where !open.contains(where: { $0.text == text }) {
                toAdd.append(ShoppingLine(id: UUID().uuidString.lowercased(), text: text, recipeId: id, recipeTitle: r.title))
            }
        }
        let space = mySpace()
        let ok = await change({
            shopping.removeAll { line in toRemove.contains { $0.id == line.id } }
            shopping += toAdd
        }) {
            for old in toRemove { try await mutate("deleteShoppingItem", "DeleteShoppingItemInput", ["id": old.id]) }
            for line in toAdd {
                guard let space else { throw BackendError.notConfigured }
                try await mutate("createShoppingItem", "CreateShoppingItemInput",
                                 ["id": line.id, "text": line.text, "checked": false, "recipeId": line.recipeId ?? "",
                                  "recipeTitle": line.recipeTitle ?? "", "spaceGroups": [space]])
            }
        }
        return ok ? toAdd.count : nil
    }

    // MARK: Changing the shopping list

    @discardableResult
    func addShoppingText(_ text: String) async -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let line = ShoppingLine(id: UUID().uuidString.lowercased(), text: trimmed)
        let space = mySpace()
        return await change({ shopping.insert(line, at: 0) }) {
            guard let space else { throw BackendError.notConfigured }
            try await mutate("createShoppingItem", "CreateShoppingItemInput",
                             ["id": line.id, "text": line.text, "checked": false, "spaceGroups": [space]])
        }
    }

    @discardableResult
    func toggleChecked(_ lineId: String) async -> Bool {
        guard let line = shopping.first(where: { $0.id == lineId }) else { return false }
        let checked = !line.checked
        return await change({ if let i = shopping.firstIndex(where: { $0.id == lineId }) { shopping[i].checked = checked } }) {
            try await mutate("updateShoppingItem", "UpdateShoppingItemInput", ["id": lineId, "text": line.text, "checked": checked])
        }
    }

    @discardableResult
    func removeShopping(_ ids: [String]) async -> Bool {
        guard !ids.isEmpty else { return true }
        return await change({ shopping.removeAll { ids.contains($0.id) } }) {
            for id in ids { try await mutate("deleteShoppingItem", "DeleteShoppingItemInput", ["id": id]) }
        }
    }

    /// The last day each recipe was cooked ("gătită acum 2 săpt.").
    func lastCooked(_ recipeId: String) -> String? { log(recipeId)?.cooked.max() }

    // MARK: Loading

    func refresh() async {
        guard !demo else { return }
        guard let client else { phase = .failed(BackendError.notConfigured.localizedDescription); return }
        if phase == .loading { return }
        phase = .loading
        do {
            let space = mySpace()
            let rows = try await client.listAll("listRecipes", fields: Recipe.fields)
            let planRows = (try? await client.listAll("listMealPlanEntries", fields: PlanEntry.fields)) ?? []
            let logRows = (try? await client.listAll("listRecipeLogs", fields: RecipeLog.fields)) ?? []
            let shopRows = (try? await client.listAll("listShoppingItems", fields: ShoppingLine.fields)) ?? []
            recipes = rows.compactMap { Recipe(row: $0, mySpace: space) }.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            plan = planRows.compactMap(PlanEntry.init(row:))
            logs = logRows.compactMap(RecipeLog.init(row:))
            shopping = shopRows.compactMap(ShoppingLine.init(row:))
            save()
            showingCopy = false
            phase = .loaded
        } catch {
            showingCopy = !recipes.isEmpty
            phase = .failed((error as? LocalizedError)?.errorDescription ?? "Nu am putut încărca rețetele.")
        }
    }

    private func save() {
        guard !demo else { return }
        cache.write(Saved(recipes: recipes, plan: plan, shopping: shopping, logs: logs), key: Self.cacheKey)
    }
}

/// One page of the hero on Acasă.
struct HeroSlide: Identifiable, Hashable {
    enum Kind: Hashable { case cooking(step: Int), planned, newest, fromBook }
    let recipe: Recipe
    let kind: Kind
    var id: String { recipe.id }

    var eyebrow: String {
        let time = recipe.minutes.map { " · " + RecipeText.formatMinutes($0) } ?? ""
        switch kind {
        case .cooking(let step): return "Ați rămas la pasul \(step + 1)"
        case .planned: return "Azi în plan" + time
        case .newest: return "Adăugată recent" + time
        case .fromBook: return "Din caietul tău" + time
        }
    }

    var primary: String {
        if case .cooking = kind { return "Continuă" }
        return "Gătește pas cu pas"
    }
}

/// Where cooking mode stopped, per recipe, so Acasă can offer "Continuă" (like the web's
/// kt-cook-progress keys, kept on this phone).
enum CookProgress {
    private static let lastKey = "kt-cook-last"
    private static func key(_ id: String) -> String { "kt-cook-progress-\(id)" }

    static var last: String? { UserDefaults.standard.string(forKey: lastKey) }

    static func step(_ id: String) -> Int? {
        UserDefaults.standard.object(forKey: key(id)) as? Int
    }

    static func set(_ id: String, step: Int?) {
        if let step {
            UserDefaults.standard.set(step, forKey: key(id))
            UserDefaults.standard.set(id, forKey: lastKey)
        } else {
            UserDefaults.standard.removeObject(forKey: key(id))
            if last == id { UserDefaults.standard.removeObject(forKey: lastKey) }
        }
    }
}

extension ISO8601DateFormatter {
    /// AppSync dates come with fractional seconds ("2026-11-11T09:12:33.120Z").
    nonisolated(unsafe) static let flexible: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

/// Made-up recipes for `-demo` screenshots (no server).
enum DemoKitchen {
    static let recipes: [Recipe] = [
        Recipe(id: "r1", title: "Ciorbă de perișoare", category: "Ciorbe și supe", servings: 4, minutes: 90,
               ingredients: ["500 g carne tocată", "2 cepe", "1 morcov", "3 linguri orez", "1 ou", "1 legătură leuștean", "2 l apă", "Sare și piper"],
               steps: ["Toacă ceapa și morcovul mărunt.", "Amestecă carnea cu orezul, oul și jumătate din ceapă, apoi formează perișoare mici.",
                       "Pune perișoarele în ciorba care fierbe și lasă-le 15 minute la foc mic.", "Adaugă legumele și mai fierbe 20 de minute.",
                       "Acrește cu borș și potrivește de sare.", "Presară leuștean tocat și servește."],
               notes: "Merge și cu smântână.", createdAt: "2026-11-10T10:00:00.000Z", shared: true, demoPhoto: "ciorba"),
        Recipe(id: "r2", title: "Cartofi cu ardei la tigaie", category: "Feluri principale", servings: 2, minutes: 35,
               ingredients: ["4 cartofi", "1 ardei roșu", "1 ceapă", "2 linguri ulei"], steps: ["Taie cartofii cuburi.", "Prăjește-i 20 de minute."],
               createdAt: "2026-11-09T10:00:00.000Z", demoPhoto: "ardei"),
        Recipe(id: "r3", title: "Cartofi țărănești", category: "Feluri principale", servings: 4, minutes: 50,
               ingredients: ["1 kg cartofi", "150 g bacon", "1 ceapă"], steps: ["Fierbe cartofii 10 minute.", "Rumenește-i cu baconul."],
               createdAt: "2026-11-08T10:00:00.000Z", demoPhoto: "bacon"),
        Recipe(id: "r4", title: "Plăcinta Anei", category: "Deserturi", servings: 8, minutes: 45,
               ingredients: ["500 g făină", "4 mere"], steps: ["Coace 35 de minute."],
               createdAt: "2026-11-07T10:00:00.000Z", mine: false, shared: true, spaceName: "Ana"),
        Recipe(id: "r5", title: "Chifle de casă", category: "Patiserie", servings: 12, minutes: 40,
               ingredients: ["500 g făină", "25 g drojdie", "300 ml lapte"], steps: ["Frământă aluatul.", "Coace 20 de minute."],
               createdAt: "2026-11-06T10:00:00.000Z", demoPhoto: "chifle"),
        Recipe(id: "r6", title: "Suc de portocale", category: "Băuturi", servings: 2, minutes: 5,
               ingredients: ["6 portocale"], steps: ["Stoarce portocalele."], createdAt: "2026-11-05T10:00:00.000Z", demoPhoto: "suc"),
        Recipe(id: "r7", title: "Roșii umplute", category: "Feluri principale", servings: 4, minutes: 60,
               ingredients: ["8 roșii", "200 g orez"], steps: ["Umple roșiile.", "Coace 40 de minute."],
               createdAt: "2026-11-04T10:00:00.000Z", demoPhoto: "rosii"),
        Recipe(id: "r8", title: "Supă cremă de cartofi", category: "Ciorbe și supe", servings: 4, minutes: 40,
               ingredients: ["6 cartofi", "1 ceapă"], steps: ["Fierbe 25 de minute.", "Pasează."],
               createdAt: "2026-11-03T10:00:00.000Z", demoPhoto: "cartofi"),
    ]

    /// Today: the soup, rolls and juice; a few other days of this week planned, two empty.
    static func plan() -> [PlanEntry] {
        let days = RecipeText.weekDays(of: Date())
        let todayIndex = days.firstIndex { Calendar.current.isDateInToday($0) } ?? 0
        var entries = ["r1", "r5", "r6"].map { PlanEntry(id: "p-\($0)", day: RecipeText.dayKey(days[todayIndex]), recipeId: $0) }
        for (i, id) in ["r3", "r2", "", "r7", "r8", "", ""].enumerated() where i != todayIndex && !id.isEmpty {
            entries.append(PlanEntry(id: "p\(i)", day: RecipeText.dayKey(days[i]), recipeId: id))
        }
        return entries
    }

    static let shopping: [ShoppingLine] = [
        ShoppingLine(id: "s1", text: "2 cepe", recipeId: "r1", recipeTitle: "Ciorbă de perișoare"),
        ShoppingLine(id: "s2", text: "1 morcov", recipeId: "r1", recipeTitle: "Ciorbă de perișoare"),
        ShoppingLine(id: "s3", text: "8 roșii", recipeId: "r7", recipeTitle: "Roșii umplute"),
        ShoppingLine(id: "s4", text: "500 g carne tocată", recipeId: "r1", recipeTitle: "Ciorbă de perișoare"),
        ShoppingLine(id: "s5", text: "1 ou", recipeId: "r1", recipeTitle: "Ciorbă de perișoare"),
        ShoppingLine(id: "s6", text: "300 ml lapte", recipeId: "r5", recipeTitle: "Chifle de casă"),
        ShoppingLine(id: "s7", text: "Detergent de vase"),
        ShoppingLine(id: "s8", text: "500 g făină", checked: true, recipeId: "r5", recipeTitle: "Chifle de casă"),
        ShoppingLine(id: "s9", text: "25 g drojdie", checked: true, recipeId: "r5", recipeTitle: "Chifle de casă"),
    ]

    static let logs: [RecipeLog] = [
        RecipeLog(id: "l1", recipeId: "r1", favorite: true, cooked: ["2026-10-20"],
                  notes: [CookNote(day: "2026-10-20", text: "Data viitoare mai mult leuștean.", by: "Loredana")]),
    ]
}
