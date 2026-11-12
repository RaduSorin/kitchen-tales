import AppIntents
import Foundation

/// "Pune o poveste": opens the app on the player with the story asked for, or the one started
/// last. Works from Siri, the Shortcuts app, the Action button and the Lock Screen.
struct PlayStoryIntent: AppIntent {
    static let title: LocalizedStringResource = "Pune o poveste"
    static let description = IntentDescription("Pornește povestea aleasă sau, dacă nu alegi, pe cea începută ultima dată.")
    static let openAppWhenRun = true

    @Parameter(title: "Poveste")
    var story: StoryEntity?

    static var parameterSummary: some ParameterSummary { Summary("Pune povestea \(\.$story)") }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppCommands.shared.pending = .playStory(story?.id)
        return .result()
    }
}

/// Spotlight and Shortcuts open a story here (it starts playing).
struct OpenStoryIntent: OpenIntent {
    static let title: LocalizedStringResource = "Deschide povestea"

    @Parameter(title: "Poveste")
    var target: StoryEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        AppCommands.shared.pending = .playStory(target.id)
        return .result()
    }
}

/// Spotlight and Shortcuts open a recipe page here.
struct OpenRecipeIntent: OpenIntent {
    static let title: LocalizedStringResource = "Deschide rețeta"

    @Parameter(title: "Rețetă")
    var target: RecipeEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        AppCommands.shared.pending = .openRecipe(target.id)
        return .result()
    }
}

/// "Adaugă lapte pe listă": adds to the family's shopping list without opening the app.
struct AddToShoppingListIntent: AppIntent {
    static let title: LocalizedStringResource = "Adaugă pe listă"
    static let description = IntentDescription("Adaugă unul sau mai multe lucruri pe lista de cumpărături (de ex. „lapte, ouă și pâine”).")

    @Parameter(title: "Ce cumperi", requestValueDialog: "Ce adaug pe listă?")
    var item: String

    static var parameterSummary: some ParameterSummary { Summary("Adaugă \(\.$item) pe listă") }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let items = ShortcutText.items(item)
        guard !items.isEmpty else { return .result(dialog: "Nu am înțeles ce să adaug.") }
        let kitchen = try await ShortcutKitchen.open()
        var added: [String] = []
        for text in items {
            if await kitchen.store.addShoppingText(text) { added.append(text) }
        }
        if added.isEmpty { return .result(dialog: "Nu am putut adăuga acum. Verifică internetul.") }
        return .result(dialog: "Am adăugat \(ShortcutText.spokenList(added)) pe listă.")
    }
}

/// "Ce mai am de cumpărat?": reads the list out loud.
struct ReadShoppingListIntent: AppIntent {
    static let title: LocalizedStringResource = "Ce mai am de cumpărat"
    static let description = IntentDescription("Citește ce a rămas pe lista de cumpărături.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let kitchen = try await ShortcutKitchen.open(fresh: true)
        let left = kitchen.store.shopping.filter { !$0.checked }.map(\.text)
        if left.isEmpty { return .result(dialog: "Lista e goală. Ai cumpărat tot.") }
        let first = Array(left.prefix(8))
        let more = left.count > first.count ? " și încă \(left.count - first.count)" : ""
        return .result(dialog: "Mai ai de cumpărat: \(ShortcutText.spokenList(first))\(more).")
    }
}

/// "Ce gătim azi?": today's plan from Săptămâna.
struct TodayDinnerIntent: AppIntent {
    static let title: LocalizedStringResource = "Ce gătim azi"
    static let description = IntentDescription("Spune ce e planificat azi în Săptămâna.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let kitchen = try await ShortcutKitchen.open(fresh: true)
        let today = ShortcutText.planned(on: Date(), plan: kitchen.store.plan, recipes: kitchen.store.recipes)
        if today.isEmpty { return .result(dialog: "Azi nu e nimic planificat. Alege ceva în Săptămâna.") }
        return .result(dialog: "Azi gătiți \(ShortcutText.spokenList(today)).")
    }
}

/// Opens the shopping list (for a Lock Screen or Action button shortcut in the shop).
struct OpenShoppingListIntent: AppIntent {
    static let title: LocalizedStringResource = "Deschide lista de cumpărături"
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppCommands.shared.pending = .openList
        return .result()
    }
}

/// The recipes of the running app, or a fresh one from the saved sign-in when Siri runs a
/// Shortcut with the app closed.
@MainActor
struct ShortcutKitchen {
    let store: RecipeStore
    /// Keeps the sign-in alive while the Shortcut runs.
    private let auth: AuthModel?

    static func open(fresh: Bool = false) async throws -> ShortcutKitchen {
        if let live = AppCommands.shared.recipes { return ShortcutKitchen(store: live, auth: nil) }
        let auth = AuthModel()
        await auth.start()
        guard auth.account != nil else { throw ShortcutError.signedOut }
        let store = RecipeStore(auth: auth)
        if fresh { await store.refresh() }
        return ShortcutKitchen(store: store, auth: auth)
    }
}

enum ShortcutError: Error, CustomLocalizedStringResourceConvertible {
    case signedOut

    var localizedStringResource: LocalizedStringResource {
        "Deschide Bucătăria și conectează-te întâi."
    }
}

/// The ready-made Shortcuts and the phrases Siri knows. Siri has no Romanian voice, so every
/// action also has English phrases; any name works if you make your own Shortcut from it.
struct KitchenShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor { .navy }

    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: PlayStoryIntent(), phrases: [
            "Pune o poveste în \(.applicationName)",
            "Pune povestea \(\.$story) în \(.applicationName)",
            "Play a story in \(.applicationName)",
            "Play \(\.$story) in \(.applicationName)",
        ], shortTitle: "Pune o poveste", systemImageName: "moon.stars.fill")
        AppShortcut(intent: AddToShoppingListIntent(), phrases: [
            "Adaugă pe lista din \(.applicationName)",
            "Add to the \(.applicationName) list",
            "Add to my list in \(.applicationName)",
        ], shortTitle: "Adaugă pe listă", systemImageName: "cart.badge.plus")
        AppShortcut(intent: ReadShoppingListIntent(), phrases: [
            "Ce mai am de cumpărat în \(.applicationName)",
            "What's on my \(.applicationName) list",
        ], shortTitle: "Ce mai cumpăr", systemImageName: "list.bullet")
        AppShortcut(intent: TodayDinnerIntent(), phrases: [
            "Ce gătim azi în \(.applicationName)",
            "What's for dinner in \(.applicationName)",
        ], shortTitle: "Ce gătim azi", systemImageName: "fork.knife")
        AppShortcut(intent: BedtimeIntent(), phrases: [
            "Ora de culcare în \(.applicationName)",
            "Bedtime in \(.applicationName)",
        ], shortTitle: "Ora de culcare", systemImageName: "moon.zzz.fill")
        AppShortcut(intent: OpenShoppingListIntent(), phrases: [
            "Deschide lista din \(.applicationName)",
            "Open my \(.applicationName) list",
        ], shortTitle: "Lista de cumpărături", systemImageName: "cart")
    }
}
