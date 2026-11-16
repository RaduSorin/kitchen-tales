import Foundation
import Testing
@testable import KitchenTales

struct WidgetTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    private func recipe(_ id: String, _ title: String, minutes: String? = nil, why: String? = nil) -> WidgetSnapshot.RecipeItem {
        .init(id: id, title: title, category: "", minutes: minutes, meta: "", why: why, image: nil)
    }

    @Test func tonightKickerOnlyOnBedtimeEvenings() {
        var s = WidgetSnapshot()
        s.bedtime = "20:30"
        s.bedtimeDays = [2] // Monday
        #expect(WidgetRules.tonightKicker(s, now: date(2026, 11, 16), calendar: calendar) == "Diseară · 20:30")
        #expect(WidgetRules.tonightKicker(s, now: date(2026, 11, 17), calendar: calendar) == "Diseară")
        #expect(WidgetRules.bedtimeToday(s, now: date(2026, 11, 17), calendar: calendar) == nil)
        s.bedtime = nil
        #expect(WidgetRules.tonightKicker(s, now: date(2026, 11, 16), calendar: calendar) == "Diseară")
    }

    @Test func todayAndTomorrowFromThePlan() {
        var s = WidgetSnapshot()
        s.days = ["2026-11-16": [recipe("a", "Ciorbă de perișoare")], "2026-11-17": [recipe("b", "Plăcinta Anei")]]
        let now = date(2026, 11, 16, 23)
        #expect(WidgetRules.today(s, now: now, calendar: calendar).map(\.title) == ["Ciorbă de perișoare"])
        #expect(WidgetRules.tomorrow(s, now: now, calendar: calendar).map(\.title) == ["Plăcinta Anei"])
        #expect(WidgetRules.today(s, now: date(2026, 11, 18), calendar: calendar).isEmpty)
    }

    @Test func otherIdeaGoesRound() {
        var s = WidgetSnapshot()
        #expect(WidgetRules.idea(s, round: 0) == nil)
        s.ideas = [recipe("a", "A"), recipe("b", "B"), recipe("c", "C")]
        #expect(WidgetRules.idea(s, round: 0)?.id == "a")
        #expect(WidgetRules.idea(s, round: 4)?.id == "b")
    }

    @Test func ideaLineAndKicker() {
        let idea = recipe("a", "Cartofi cu ardei la tigaie", minutes: "35 min", why: "N-ai mai gătit-o de 3 săptămâni")
        #expect(WidgetRules.ideaLine(idea) == "n-ai mai gătit-o de 3 săptămâni · 35 min")
        #expect(WidgetRules.todayKicker(idea) == "Azi · 35 min")
        #expect(WidgetRules.todayKicker(recipe("b", "B")) == "Azi")
    }

    @Test func imageNamesAreStable() {
        #expect(WidgetRules.fileName("covers/a.jpg") == WidgetRules.fileName("covers/a.jpg"))
        #expect(WidgetRules.fileName("covers/a.jpg") != WidgetRules.fileName("covers/b.jpg"))
        #expect(WidgetRules.fileName("x").hasPrefix("img-"))
    }

    @Test func clockLikeCookMode() {
        #expect(WidgetRules.clock(702) == "11:42")
        #expect(WidgetRules.clock(3725) == "1:02:05")
        #expect(WidgetRules.clock(-3) == "0:00")
    }

    @Test func stepSplitsIntoTitleAndDetail() {
        let parts = CookActivityText.split("Fierbe perișoarele la foc mic, cu capac, 25 de minute.")
        #expect(parts.title == "Fierbe perișoarele la foc mic")
        #expect(parts.detail == "cu capac, 25 de minute")
        #expect(CookActivityText.split("Lasă la cuptor").detail == "")
        #expect(CookActivityText.short(String(repeating: "abc ", count: 20)).hasSuffix("…"))
    }

    @Test func timersSoonestFirst() {
        let now = Date()
        typealias C = CookTimerAttributes.Clock
        let late = C(step: 2, title: "", detail: "", total: 600, endsAt: now.addingTimeInterval(500), left: 0)
        let soon = C(step: 4, title: "", detail: "", total: 300, endsAt: now.addingTimeInterval(100), left: 0)
        let paused = C(step: 1, title: "", detail: "", total: 300, endsAt: nil, left: 120)
        let done = C(step: 0, title: "", detail: "", total: 300, endsAt: nil, left: 0)
        #expect(CookActivityText.ordered([done, paused, late, soon]).map(\.step) == [4, 2, 1, 0])
        #expect(CookActivityText.corner([soon], stepCount: 6) == "Pasul 5 din 6")
        #expect(CookActivityText.corner([soon, late], stepCount: 6) == "2 timere")
        #expect(done.isDone && !paused.isDone && soon.isRunning)
    }

    @Test func snapshotRoundTrips() throws {
        var s = WidgetSnapshot()
        s.signedIn = true
        s.shoppingLeft = 7
        s.tonight = [.init(id: "1", title: "Regele Leu", detail: "Povești Disney · 9 min", minutes: "9 min", image: nil, progress: 0.4)]
        let back = try JSONDecoder().decode(WidgetSnapshot.self, from: JSONEncoder().encode(s))
        #expect(back == s)
    }
}
