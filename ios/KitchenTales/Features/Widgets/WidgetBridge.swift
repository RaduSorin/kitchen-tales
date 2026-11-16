import Foundation
import WidgetKit

/// Carries out the widget and Live Activity buttons in the app (see `WidgetActions`).
@MainActor
enum WidgetBridge {
    /// Keeps a sign-in and a story list alive when a widget starts a story with the app closed.
    private static var background: (auth: AuthModel, stories: StoryStore)?

    static func install() {
        WidgetActions.handler = { action in await run(action) }
    }

    static func run(_ action: WidgetActions.Action) async {
        switch action {
        case .pauseTimer(let step):
            guard let timers = CookTimers.live else { CookLiveActivity.end(); return }
            timers.pause(step)
        case .resumeTimer(let step):
            guard let timers = CookTimers.live else { CookLiveActivity.end(); return }
            timers.start(step)
        case .addMinute(let step):
            guard let timers = CookTimers.live else { CookLiveActivity.end(); return }
            timers.addMinute(step)
        case .playStory(let id):
            await play(id)
        case .planToday(let id):
            guard let kitchen = try? await ShortcutKitchen.open(), let recipe = kitchen.store.recipe(id) else { return }
            if await kitchen.store.planRecipe(recipe, on: Date()) {
                await WidgetSync.write(recipes: kitchen.store, stories: nil)
            }
        }
    }

    private static func play(_ id: String) async {
        let store: StoryStore
        if let live = AppCommands.shared.stories {
            store = live
        } else if let kept = background {
            store = kept.stories
        } else {
            let auth = AuthModel()
            await auth.start()
            guard auth.account != nil else { return }
            let stories = StoryStore(auth: auth)
            background = (auth, stories)
            store = stories
        }
        if store.allStories.isEmpty { await store.refresh() }
        let pool = store.stories
        guard let story = pool.first(where: { $0.id == id }) else { return }
        let folder = StoryLibrary.folderOf(story)
        await StoryPlayer.shared.play(story, queue: pool.filter { StoryLibrary.folderOf($0) == folder }, store: store)
    }
}
