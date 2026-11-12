import Foundation
import Testing
@testable import KitchenTales

struct BadgeTests {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        return c
    }
    private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    @Test func catalogMatchesTheWeb() {
        #expect(BadgeCatalog.stamps.count == 33)
        #expect(BadgeCatalog.stickers.count == 32)
        #expect(Set(BadgeCatalog.all.map(\.id)).count == BadgeCatalog.all.count)
    }

    @Test func everyBadgeHasItsPictures() {
        for b in BadgeCatalog.all {
            for earned in [true, false] {
                #expect(Bundle.main.url(forResource: b.image(earned: earned), withExtension: "png") != nil, "\(b.id)")
            }
        }
    }

    @Test func tiltIsTheSameAsOnTheWeb() {
        // Values from tiltOf in src/lib/badges/art.ts.
        #expect(badgeTilt("c10") == -2)
        #expect(badgeTilt("k-owl") == 2)
        #expect(badgeTilt("scrisa") == 4)
        #expect(badgeTilt("k-snow") == -4)
        #expect(badgeTilt("k-owl", range: 6) == 4)
    }

    @Test func longestRunOfDays() {
        #expect(BadgeEngine.longestRun(["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-03", "2026-02-01"]) == 4)
    }

    @Test func firstRecipeEarnsItsStamp() {
        let now = at(2026, 11, 12, 18)
        let s = BadgeEngine.apply(.recipeAdded(way: .link, category: "Desert", photo: true), to: BadgeState(), now: now, calendar: cal)
        #expect(s.counts["recipes"] == 1)
        #expect(s.counts["way:link"] == 1)
        #expect(s.counts["desserts"] == 1)
        #expect(s.sets["categories"] == ["desert"])
        let (next, fresh) = BadgeEngine.evaluate(s, now: now, calendar: cal)
        #expect(fresh == ["link"])
        #expect(next.earned["link"] != nil)
    }

    @Test func listeningStickersComeOneAnEvening() {
        var s = BadgeState()
        let now = at(2026, 11, 12, 21)
        s.counts["listened"] = 5
        let (next, fresh) = BadgeEngine.evaluate(s, now: now, calendar: cal)
        #expect(fresh == ["k-star"])
        #expect(next.listenDay == "2026-11-12")
        let later = BadgeEngine.evaluate(next, now: at(2026, 11, 13, 20), calendar: cal)
        #expect(later.fresh == ["k-moon"])
    }

    @Test func storyAfterMidnightCountsForTheEveningBefore() {
        let s = BadgeEngine.apply(.storyFinished(storyId: "s1", folder: "a", folders: ["a", "b"], secs: 240, source: .recording, offline: false, kid: true),
                                  to: BadgeState(), now: at(2026, 11, 13, 1), calendar: cal)
        #expect(s.sets["evenings"] == ["2026-11-12"])
        #expect(s.sets["days"] == ["2026-11-12"])
        #expect(s.counts["short"] == 1)
        #expect(s.counts["rec:s1"] == 1)
        #expect(s.counts["kidListen"] == 1)
    }

    @Test func mergeKeepsTheMostOfEach() {
        var a = BadgeState(), b = BadgeState()
        a.counts = ["recipes": 3, "cooked": 1]; b.counts = ["recipes": 2, "listened": 4]
        a.earned = ["c5": "2026-02-01T00:00:00.000Z"]; b.earned = ["c5": "2026-01-01T00:00:00.000Z", "k-star": "2026-01-05T00:00:00.000Z"]
        a.seen = ["c5"]; b.seen = ["k-star"]
        a.since = "2026-01-10T00:00:00.000Z"; b.since = "2026-01-01T00:00:00.000Z"
        let m = BadgeEngine.merge(a, b)
        #expect(m.counts == ["recipes": 3, "cooked": 1, "listened": 4])
        #expect(m.earned["c5"] == "2026-01-01T00:00:00.000Z")
        #expect(Set(m.seen) == ["c5", "k-star"])
        #expect(m.since == "2026-01-01T00:00:00.000Z")
    }

    @Test func readsTheWebsJSON() throws {
        let json = #"{"counts":{"recipes":4,"cook:abc":2},"sets":{"days":["2026-11-01"]},"earned":{"scrisa":"2026-11-01T10:00:00.000Z"},"seen":["scrisa"],"since":"2026-11-01T09:00:00.000Z","epoch":2}"#
        let s = try JSONDecoder().decode(BadgeState.self, from: Data(json.utf8))
        #expect(s.counts["cook:abc"] == 2)
        #expect(s.epoch == 2)
        #expect(BadgeEngine.date(s.earned["scrisa"]!) != nil)
    }

    @Test func pagesAreSplitEvenly() {
        #expect(badgePages(Array(0..<13), max: 4).map(\.count) == [4, 3, 3, 3])
        #expect(badgePages(Array(0..<19), max: 4).map(\.count) == [4, 4, 4, 4, 3])
    }

    @Test func passportLinesHaveNoDiacritics() {
        #expect(PassportView.mrz("Ștefan Iliescu") == "STEFAN<ILIESCU")
    }
}
