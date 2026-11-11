import Foundation
import Testing
@testable import KitchenTales

@MainActor
struct ProfileTests {
    @Test func hashesThePinLikeTheWeb() {
        // sha256("abc:1234") as hex, the same as kidMode.ts hashPin.
        #expect(KidPin.hash("1234", salt: "abc") == "1755a2d5b309d75bede226f2b6cf858bb14287b917e76ad3b943de0dda4683fb")
        #expect(KidPin.newSalt().count == 32)
    }

    @Test func readsAndWritesTheDietJSON() throws {
        let diet = try #require(Diet.parse(#"{"avoid":[{"key":"nuci","strict":true,"who":"Ana"},{"key":"lactoza","strict":false,"who":""}],"dislikes":"ciuperci"}"#))
        #expect(diet.avoid.count == 2)
        #expect(diet.avoid[0] == DietRule(key: "nuci", strict: true, who: "Ana"))
        #expect(diet.avoid[1].who == nil)
        #expect(diet.dislikes == "ciuperci")
        #expect(Diet.parse(diet.json) == diet)
        #expect(diet.summary == "fără nuci, lactoză")
        #expect(Diet().summary == "de toate")
    }

    @Test func readsASettingsRow() {
        let s = FamilySettings(row: ["childName": "Ana", "childBirthYear": 2021, "childGender": "girl", "kitchenTools": ["Air fryer", ""],
                                     "kidMinutes": NSNull(), "narrator": NSNull(), "diet": NSNull()])
        #expect(s.childName == "Ana")
        #expect(s.kitchenTools == ["Air fryer"])
        #expect(s.kidMinutes == 30)
        #expect(s.voiceName == "Carmen")
        #expect(!s.hasPin)
    }

    @Test func sendsOnlyWhatChanged() {
        var a = FamilySettings()
        a.childName = "Ana"
        var b = a
        b.kitchenTools = ["Blender"]
        #expect(b.changedKeys(from: a) == ["kitchenTools"])
        #expect(a.changedKeys(from: a).isEmpty)
    }

    @Test func saysCountsInRomanian() {
        #expect(1.ro("aparat", "aparate") == "1 aparat")
        #expect(4.ro("aparat", "aparate") == "4 aparate")
        #expect(21.ro("aparat", "aparate") == "21 de aparate")
        #expect(30.kidMinutesLabel == "30 min")
        #expect(90.kidMinutesLabel == "1 h 30")
        #expect(0.kidMinutesLabel == "fără limită")
    }
}
