import Foundation
import Testing
@testable import KitchenTales

struct BedtimeTests {
    @Test func reminderBeforeBedtimeEachDay() {
        var s = Bedtime.Settings()
        s.hour = 20; s.minute = 30; s.reminderMinutes = 15; s.days = [2, 6]
        let times = Bedtime.reminderTimes(s)
        #expect(times.map(\.weekday) == [2, 6])
        #expect(times.allSatisfy { $0.time.hour == 20 && $0.time.minute == 15 })
    }

    @Test func reminderBeforeMidnightMovesToTheDayBefore() {
        var s = Bedtime.Settings()
        s.hour = 0; s.minute = 10; s.reminderMinutes = 15; s.days = [1, 3]
        let times = Bedtime.reminderTimes(s)
        #expect(times.map(\.weekday) == [7, 2])
        #expect(times.allSatisfy { $0.time.hour == 23 && $0.time.minute == 55 })
    }

    @Test func dayLabels() {
        #expect(Bedtime.daysLabel([2, 3, 4, 5, 6]) == "L M M J V")
        #expect(Bedtime.daysLabel(Set(1...7)) == "în fiecare seară")
        #expect(Bedtime.daysLabel([]) == "nicio zi")
        var s = Bedtime.Settings(); s.hour = 9; s.minute = 5
        #expect(Bedtime.timeLabel(s) == "09:05")
    }

    @Test func tonightStartsWithTheStoryLeftHalfWay() {
        var fav = Story(id: "f", title: "Fav", emoji: "⭐", collection: "Seara", durationSec: 480); fav.favorite = true
        let a = Story(id: "a", title: "A", emoji: "⭐", collection: "Seara", durationSec: 540)
        let b = Story(id: "b", title: "B", emoji: "⭐", collection: "Seara", durationSec: 420)
        let other = Story(id: "o", title: "O", emoji: "⭐", collection: "Altul")
        let all = [fav, a, b, other]
        let night = Bedtime.tonight(all, folder: "Seara", count: 3, last: "b", played: ["f"], position: { $0 == "b" ? 130 : 0 })
        #expect(night.map(\.id) == ["b", "a", "f"])
        #expect(Bedtime.tonight(all, folder: nil, count: 3, last: nil, played: [], position: { _ in 0 }).map(\.id) == ["f"])
        #expect(Bedtime.tonight(all, folder: "Lipsă", count: 2, last: nil, played: [], position: { _ in 0 }).count == 2)
        #expect(Bedtime.lengthLabel(night) == "aproape 24 de minute")
        #expect(Bedtime.lengthLabel([b]) == "aproape 7 minute")
    }
}
