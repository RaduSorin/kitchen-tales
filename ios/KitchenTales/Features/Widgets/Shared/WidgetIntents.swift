import AppIntents
import Foundation
import WidgetKit

/// What a widget or Live Activity button asked the app to do. The buttons' intents are compiled
/// into both the app and the widget extension; the ones that change the app's state are
/// `AudioPlaybackIntent` or `LiveActivityIntent`, which iOS runs in the app's process (starting it
/// in the background if needed), where `handler` (set by the app at launch) carries them out.
@MainActor
enum WidgetActions {
    enum Action: Equatable, Sendable {
        case playStory(String)
        case planToday(String)
        case pauseTimer(Int)
        case resumeTimer(Int)
        case addMinute(Int)
    }

    static var handler: (@MainActor @Sendable (Action) async -> Void)?

    static func run(_ action: Action) async {
        // Launched in the background for this intent: give the app a moment to set the handler.
        var tries = 0
        while handler == nil, tries < 30 {
            try? await Task.sleep(for: .milliseconds(100))
            tries += 1
        }
        await handler?(action)
    }
}

/// "Ascultă" on "Povestea de diseară": starts the story without opening the app.
struct PlayTonightIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "Ascultă povestea de diseară"
    static let isDiscoverable = false

    @Parameter(title: "Povestea") var storyId: String

    init() {}
    init(storyId: String) { self.storyId = storyId }

    func perform() async throws -> some IntentResult {
        await WidgetActions.run(.playStory(storyId))
        return .result()
    }
}

/// "Pune azi în plan" on "Ce gătim azi" when nothing is planned. A `LiveActivityIntent` only so
/// that it runs in the app, which has the sign-in and the recipes.
struct PlanTodayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pune rețeta azi în plan"
    static let isDiscoverable = false

    @Parameter(title: "Rețeta") var recipeId: String

    init() {}
    init(recipeId: String) { self.recipeId = recipeId }

    func perform() async throws -> some IntentResult {
        await WidgetActions.run(.planToday(recipeId))
        return .result()
    }
}

/// "Altă idee": the next idea. Only the widget's own counter changes, so it runs in the widget.
struct NextIdeaIntent: AppIntent {
    static let title: LocalizedStringResource = "Altă idee"
    static let isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        let defaults = WidgetFiles.defaults
        defaults.set(defaults.integer(forKey: WidgetFiles.ideaRoundKey) + 1, forKey: WidgetFiles.ideaRoundKey)
        return .result()
    }
}

/// "Pauză" / "Continuă" on the cooking timer.
struct CookTimerPauseIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pauză la timer"
    static let isDiscoverable = false

    @Parameter(title: "Pasul") var step: Int
    @Parameter(title: "Continuă") var resume: Bool

    init() {}
    init(step: Int, resume: Bool) {
        self.step = step
        self.resume = resume
    }

    func perform() async throws -> some IntentResult {
        await WidgetActions.run(resume ? .resumeTimer(step) : .pauseTimer(step))
        return .result()
    }
}

/// "+1 min" on the cooking timer, also once it has rung.
struct CookTimerAddMinuteIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Încă un minut"
    static let isDiscoverable = false

    @Parameter(title: "Pasul") var step: Int

    init() {}
    init(step: Int) { self.step = step }

    func perform() async throws -> some IntentResult {
        await WidgetActions.run(.addMinute(step))
        return .result()
    }
}

/// The kinds of widget, for reloading them from the app.
enum WidgetKinds {
    nonisolated static let story = "TonightStory"
    nonisolated static let recipe = "TodayRecipe"
    nonisolated static let list = "ShoppingLeft"
}
