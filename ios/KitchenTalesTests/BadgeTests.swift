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
        #expect(BadgeCatalog.stamps.count == 38)
        #expect(BadgeCatalog.stickers.count == 39)
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

    @Test func orthodoxEasterMatchesTheWeb() {
        #expect(BadgeEngine.dayOf(BadgeEngine.orthodoxEaster(2025, calendar: cal), calendar: cal) == "2025-04-20")
        #expect(BadgeEngine.dayOf(BadgeEngine.orthodoxEaster(2026, calendar: cal), calendar: cal) == "2026-04-12")
        #expect(BadgeEngine.dayOf(BadgeEngine.orthodoxEaster(2027, calendar: cal), calendar: cal) == "2027-05-02")
    }

    @Test func feastDaysAndSeasons() {
        #expect(BadgeEngine.isFeast(at(2026, 12, 24, 12), calendar: cal))
        #expect(BadgeEngine.isFeast(at(2026, 4, 8, 12), calendar: cal))
        #expect(BadgeEngine.isFeast(at(2026, 4, 12, 20), calendar: cal))
        #expect(!BadgeEngine.isFeast(at(2026, 4, 13, 12), calendar: cal))
        #expect(!BadgeEngine.isFeast(at(2026, 12, 25, 12), calendar: cal))
        let seasons = [(1, "iarna"), (4, "primavara"), (7, "vara"), (10, "toamna"), (12, "iarna")]
        for (m, name) in seasons { #expect(BadgeEngine.season(at(2026, m, 10, 12), calendar: cal) == name) }
    }

    @Test func newMedalsFromTheNativeApp() {
        var s = BadgeState()
        for e in [BadgeEvent.fromShare, .siri, .siriStory, .lockTimer] { s = BadgeEngine.apply(e, to: s, now: at(2026, 11, 10, 18), calendar: cal) }
        let fresh = BadgeEngine.evaluate(s, now: at(2026, 11, 10, 18), calendar: cal).fresh
        for id in ["safari", "siri", "ceas", "k-hedgehog"] { #expect(fresh.contains(id), "\(id)") }

        var cooked = BadgeState()
        for m in [1, 4, 7, 10] { cooked = BadgeEngine.apply(.cooked(recipeId: "a"), to: cooked, now: at(2026, m, 10, 12), calendar: cal) }
        #expect(BadgeEngine.progress(BadgeCatalog.byId["anotimpuri"]!, cooked).done)

        var bed = BadgeState()
        for d in 1...4 { bed = BadgeEngine.apply(.bedtime, to: bed, now: at(2026, 11, d, 20), calendar: cal) }
        #expect(!BadgeEngine.progress(BadgeCatalog.byId["k-firefly"]!, bed).done)
        bed = BadgeEngine.apply(.bedtime, to: bed, now: at(2026, 11, 6, 1), calendar: cal)
        #expect(BadgeEngine.progress(BadgeCatalog.byId["k-firefly"]!, bed).done)

        let easter = BadgeEngine.apply(.storyFinished(storyId: "s", folder: "a", folders: ["a"], secs: nil, source: nil, offline: false, kid: false, speaker: true),
                                       to: BadgeState(), now: at(2027, 5, 2, 19), calendar: cal)
        #expect(easter.counts["easter"] == 1)
        #expect(easter.counts["speaker"] == 1)
    }

    @Test func pagesAreSplitEvenly() {
        #expect(badgePages(Array(0..<13), max: 4).map(\.count) == [4, 3, 3, 3])
        #expect(badgePages(Array(0..<19), max: 4).map(\.count) == [4, 4, 4, 4, 3])
    }

    @Test func passportLinesHaveNoDiacritics() {
        #expect(PassportView.mrz("Ștefan Iliescu") == "STEFAN<ILIESCU")
    }
}
