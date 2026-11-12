import AppIntents
import CoreSpotlight
import Foundation

/// A story as Siri, Shortcuts and Spotlight see it ("Pune povestea Aladdin").
struct StoryEntity: AppEntity, IndexedEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Poveste")
    static let defaultQuery = StoryEntityQuery()

    let id: String
    let title: String
    let folder: String
    let minutes: String?

    init(_ story: Story) {
        id = story.id
        title = story.title
        folder = StoryLibrary.folderOf(story)
        minutes = story.minutesLabel
    }

    var displayRepresentation: DisplayRepresentation {
        let detail = [folder, minutes].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(title)", subtitle: "\(detail)", image: .init(systemName: "moon.stars.fill"))
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let set = CSSearchableItemAttributeSet(contentType: .audio)
        set.title = title
        set.contentDescription = [folder, minutes].compactMap { $0 }.joined(separator: " · ")
        set.keywords = ["poveste", "povești", folder]
        return set
    }
}

struct StoryEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [StoryEntity] {
        StoryStore.savedStories().filter { identifiers.contains($0.id) }.map(StoryEntity.init)
    }

    func entities(matching string: String) async throws -> [StoryEntity] {
        let needle = string.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "ro"))
        return StoryStore.savedStories().filter {
            $0.title.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "ro")).contains(needle)
        }.map(StoryEntity.init)
    }

    func suggestedEntities() async throws -> [StoryEntity] {
        let stories = StoryStore.savedStories()
        let favorites = stories.filter(\.favorite)
        return Array((favorites.isEmpty ? stories : favorites).prefix(30)).map(StoryEntity.init)
    }
}

/// A recipe as Shortcuts and Spotlight see it.
struct RecipeEntity: AppEntity, IndexedEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Rețetă")
    static let defaultQuery = RecipeEntityQuery()

    let id: String
    let title: String
    let category: String
    let ingredients: [String]

    init(_ recipe: Recipe) {
        id = recipe.id
        title = recipe.title
        category = recipe.category
        ingredients = recipe.ingredients
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(category)", image: .init(systemName: "fork.knife"))
    }

    /// Spotlight finds a recipe by its name and by what is in it ("smântână").
    var attributeSet: CSSearchableItemAttributeSet {
        let set = CSSearchableItemAttributeSet(contentType: .text)
        set.title = title
        set.contentDescription = category
        set.keywords = ["rețetă", category] + ingredients.prefix(20).map { String($0.prefix(40)) }
        return set
    }
}

struct RecipeEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [RecipeEntity] {
        RecipeStore.savedKitchen().recipes.filter { identifiers.contains($0.id) }.map(RecipeEntity.init)
    }

    func entities(matching string: String) async throws -> [RecipeEntity] {
        let needle = string.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "ro"))
        return RecipeStore.savedKitchen().recipes.filter {
            $0.title.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "ro")).contains(needle)
        }.map(RecipeEntity.init)
    }

    func suggestedEntities() async throws -> [RecipeEntity] {
        Array(RecipeStore.savedKitchen().recipes.prefix(30)).map(RecipeEntity.init)
    }
}

/// Puts the family's stories and recipes into Spotlight (swipe down on the Home Screen, type
/// "ciorbă"), and tells Siri the story names for "Pune povestea …".
enum SpotlightIndex {
    @MainActor private static var lastSignature = ""

    @MainActor
    static func update(stories: [Story], recipes: [Recipe]) async {
        let signature = (stories.map { $0.id + $0.title } + recipes.map { $0.id + $0.title }).joined()
        guard signature != lastSignature, !(stories.isEmpty && recipes.isEmpty) else { return }
        lastSignature = signature
        let index = CSSearchableIndex.default()
        try? await index.deleteAllSearchableItems()
        try? await index.indexAppEntities(stories.map(StoryEntity.init))
        try? await index.indexAppEntities(recipes.map(RecipeEntity.init))
        KitchenShortcuts.updateAppShortcutParameters()
    }

    /// After signing out nothing of the family stays searchable on the phone.
    @MainActor
    static func clear() async {
        lastSignature = ""
        try? await CSSearchableIndex.default().deleteAllSearchableItems()
    }
}
