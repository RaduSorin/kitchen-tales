import Foundation
import Observation

/// What Siri, a Shortcut or a Spotlight result asked the app to do. The intent sets `pending`
/// (the app opens for it) and the signed-in root carries it out once the stores are there.
@MainActor @Observable
final class AppCommands {
    enum Command: Equatable {
        /// A story by id, or nil for "the one started last" (else a favourite, else any).
        case playStory(String?)
        case openRecipe(String)
        case openList
        case openWeek
        /// "Ora de culcare": the night screen.
        case bedtime
    }

    static let shared = AppCommands()

    var pending: Command?
    /// The recipes of the running app, so a Shortcut run in the background changes the same list
    /// the screen shows. Nil when the app is not running.
    @ObservationIgnored weak var recipes: RecipeStore?

    private init() {}
}

/// Pure helpers behind the Shortcuts, kept apart so the tests can check them.
enum ShortcutText {
    /// "lapte, ouă și pâine" → ["lapte", "ouă", "pâine"]: one shopping line per thing said.
    nonisolated static func items(_ said: String) -> [String] {
        said.replacingOccurrences(of: " și ", with: ",")
            .replacingOccurrences(of: " si ", with: ",")
            .replacingOccurrences(of: " and ", with: ",")
            .split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "\n" })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// "ciorbă, chifle și salată": a Romanian list for Siri to read.
    nonisolated static func spokenList(_ parts: [String]) -> String {
        switch parts.count {
        case 0: return ""
        case 1: return parts[0]
        default: return parts.dropLast().joined(separator: ", ") + " și " + parts[parts.count - 1]
        }
    }

    /// The recipe titles planned for `day`, in plan order, each once.
    nonisolated static func planned(on day: Date, plan: [PlanEntry], recipes: [Recipe]) -> [String] {
        let key = RecipeText.dayKey(day)
        var seen = Set<String>()
        return plan.filter { $0.day == key }.compactMap { entry in
            guard seen.insert(entry.recipeId).inserted else { return nil }
            return recipes.first { $0.id == entry.recipeId }?.title
        }
    }

    /// Which story "pune o poveste" starts: the one asked for, else the one started last, else a
    /// favourite, else the newest.
    nonisolated static func storyToPlay(_ id: String?, last: String?, stories: [Story]) -> Story? {
        if let id, let hit = stories.first(where: { $0.id == id }) { return hit }
        if let last, let hit = stories.first(where: { $0.id == last }) { return hit }
        return stories.first(where: \.favorite) ?? stories.first
    }
}
