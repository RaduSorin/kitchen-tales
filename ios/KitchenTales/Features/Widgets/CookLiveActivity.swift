import ActivityKit
import UIKit

/// Starts, updates and ends the cooking timers' Live Activity from `CookTimers`.
@MainActor
enum CookLiveActivity {
    /// Each change waits for the one before, so a quick Pauză then Continuă arrive in order.
    private static var last: Task<Void, Never>?

    static func sync(recipe: Recipe, clocks: [CookTimerAttributes.Clock]) {
        let ordered = CookActivityText.ordered(clocks)
        guard !ordered.isEmpty else { end(); return }
        let content = ActivityContent(state: CookTimerAttributes.ContentState(clocks: ordered),
                                      staleDate: ordered.compactMap(\.endsAt).min())
        let attributes = CookTimerAttributes(recipeId: recipe.id, title: recipe.title,
                                             stepCount: recipe.steps.count, photo: photo(recipe))
        let previous = last
        last = Task {
            await previous?.value
            await apply(attributes, content)
        }
    }

    static func end() {
        let previous = last
        last = Task {
            await previous?.value
            await endAll()
        }
    }

    nonisolated private static func apply(_ attributes: CookTimerAttributes,
                                          _ content: ActivityContent<CookTimerAttributes.ContentState>) async {
        var found = false
        for activity in Activity<CookTimerAttributes>.activities {
            if !found, activity.attributes.recipeId == attributes.recipeId {
                found = true
                await activity.update(content)
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        guard !found, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        _ = try? Activity<CookTimerAttributes>.request(attributes: attributes, content: content, pushType: nil)
    }

    nonisolated private static func endAll() async {
        for activity in Activity<CookTimerAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// A small copy of the photo Modul de gătit already loaded, in the shared folder.
    private static func photo(_ recipe: Recipe) -> String? {
        guard let key = recipe.photoKey, !key.isEmpty else { return nil }
        let name = "cook-" + WidgetRules.fileName(key)
        if FileManager.default.fileExists(atPath: WidgetFiles.imageURL(name).path) { return name }
        guard let image = CoverImages.shared.image(key),
              let data = WidgetImages.jpeg(image, side: 120) else { return nil }
        try? data.write(to: WidgetFiles.imageURL(name), options: .atomic)
        return name
    }
}
