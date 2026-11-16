import SwiftUI
import WidgetKit

/// The widget extension (concept design-polish/ios-widgets): "Povestea de diseară",
/// "Ce gătim azi", the shopping list count on the Lock Screen and the cooking timers' Live Activity.
@main
struct KitchenWidgets: WidgetBundle {
    var body: some Widget {
        TonightStoryWidget()
        TodayRecipeWidget()
        ShoppingLeftWidget()
        CookTimerActivityWidget()
    }
}

/// One timeline for every widget: the app's last copy, again just after midnight (when "today"
/// changes) and at least every hour. The app also reloads the widgets whenever its data changes.
struct KitchenEntry: TimelineEntry, Sendable {
    let date: Date
    let snapshot: WidgetSnapshot
    let ideaRound: Int
}

struct KitchenProvider: TimelineProvider {
    func placeholder(in context: Context) -> KitchenEntry {
        KitchenEntry(date: Date(), snapshot: WidgetSamples.snapshot, ideaRound: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (KitchenEntry) -> Void) {
        let saved = WidgetFiles.read()
        let snapshot = context.isPreview && !saved.signedIn ? WidgetSamples.snapshot : saved
        completion(KitchenEntry(date: Date(), snapshot: snapshot, ideaRound: WidgetFiles.defaults.integer(forKey: WidgetFiles.ideaRoundKey)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KitchenEntry>) -> Void) {
        let now = Date()
        let snapshot = WidgetFiles.read()
        let round = WidgetFiles.defaults.integer(forKey: WidgetFiles.ideaRoundKey)
        let calendar = Calendar.current
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))?.addingTimeInterval(60)
            ?? now.addingTimeInterval(3600)
        let entries = [KitchenEntry(date: now, snapshot: snapshot, ideaRound: round),
                       KitchenEntry(date: midnight, snapshot: snapshot, ideaRound: round)]
        completion(Timeline(entries: entries, policy: .after(min(midnight, now.addingTimeInterval(3600)))))
    }
}

/// What the widget gallery shows before the app has written anything.
enum WidgetSamples {
    nonisolated static let snapshot: WidgetSnapshot = {
        var s = WidgetSnapshot()
        s.signedIn = true
        s.tonight = [
            .init(id: "", title: "Regele Leu", detail: "Povești Disney · 9 min", minutes: "9 min", image: nil, progress: nil),
            .init(id: "", title: "Aladdin", detail: "Povești Disney · 10 min", minutes: "10 min", image: nil, progress: nil),
        ]
        s.bedtime = "20:30"
        s.bedtimeDays = Array(1...7)
        s.days[WidgetRules.dayKey(Date())] = [
            .init(id: "", title: "Ciorbă de perișoare", category: "Ciorbe și supe", minutes: "1 h 30", meta: "1 h 30 · 4 porții", why: nil, image: nil),
        ]
        s.shoppingLeft = 7
        return s
    }()
}
