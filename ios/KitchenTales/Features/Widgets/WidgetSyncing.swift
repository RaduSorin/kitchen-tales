import SwiftUI

/// Writes the widgets' copy when anything they show changes, and when the app goes away.
struct WidgetSyncing: ViewModifier {
    let recipes: RecipeStore
    let stories: StoryStore
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .task(id: signature) { WidgetSync.update(recipes: recipes, stories: stories) }
            .onChange(of: scenePhase) {
                if scenePhase == .background { WidgetSync.update(recipes: recipes, stories: stories) }
            }
    }

    private var signature: Int {
        let bedtime = Bedtime.shared.settings
        var h = Hasher()
        h.combine(stories.stories.map(\.id))
        h.combine(recipes.recipes.count)
        h.combine(recipes.plan)
        h.combine(recipes.shopping.filter { !$0.checked }.count)
        h.combine(bedtime.enabled)
        h.combine(bedtime.hour * 60 + bedtime.minute)
        h.combine(bedtime.folder)
        return h.finalize()
    }
}
