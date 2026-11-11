import Foundation
import Testing
@testable import KitchenTales

/// The recipe text helpers must give the same answers as the web app (src/lib/scale.ts,
/// cooking.ts, format.ts), so a recipe reads the same in both apps.
@MainActor
struct RecipeTests {
    @Test(arguments: [
        ("500 g carne tocată", 1.5, "750 g carne tocată"),
        ("2 cepe", 0.5, "1 ceapă"),
        ("1 ou", 2.0, "2 ouă"),
        ("1 lingură zahăr", 3.0, "3 linguri zahăr"),
        ("600 g făină", 2.0, "1,2 kg făină"),
        ("2-3 căței usturoi", 2.0, "4-6 căței usturoi"),
        ("½ ceapă mare", 3.0, "1 ½ cepe mari"),
        ("Sare și piper", 2.0, "Sare și piper"),
        ("1 1/2 cană lapte", 2.0, "3 căni lapte"),
    ])
    func scalesLikeTheWeb(_ line: String, _ factor: Double, _ expected: String) {
        #expect(RecipeText.scaleIngredient(line, factor: factor) == expected)
    }

    @Test func formatsQuantitiesInKitchenFractions() {
        #expect(RecipeText.formatQuantity(0.5) == "½")
        #expect(RecipeText.formatQuantity(2.0 / 3 * 4) == "2 ⅔")
        #expect(RecipeText.formatQuantity(1.1) == "1")
        #expect(RecipeText.formatQuantity(12.4) == "12")
    }

    @Test(arguments: [
        ("Lasă-le 15 minute la foc mic.", 900),
        ("Fierbe 5-7 min.", 420),
        ("Coace o oră și 30 de minute.", 5400),
        ("Lasă la dospit jumătate de oră.", 1800),
        ("Amestecă bine.", 0),
    ])
    func findsTheTimerInAStep(_ step: String, _ seconds: Int) {
        #expect(RecipeText.detectDuration(step) == seconds)
    }

    @Test func searchFindsOtherFormsOfAWord() {
        #expect(RecipeText.matches("2 cepe, 1 morcov", query: "ceapa"))
        #expect(RecipeText.matches("Ciorbă de perișoare", query: "ciorba"))
        #expect(!RecipeText.matches("Suc de portocale", query: "carne"))
        #expect(RecipeText.matches("orice", query: "  "))
    }

    @Test func formatsMinutesAndClock() {
        #expect(RecipeText.formatMinutes(45) == "45 min")
        #expect(RecipeText.formatMinutes(90) == "1 h 30")
        #expect(RecipeText.formatMinutes(120) == "2 h")
        #expect(RecipeText.clock(702) == "11:42")
        #expect(RecipeText.clock(3725) == "1:02:05")
    }

    @Test func weekStartsOnMonday() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        let wednesday = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 11, hour: 15)))
        let days = RecipeText.weekDays(of: wednesday, calendar: calendar)
        #expect(days.count == 7)
        #expect(RecipeText.dayKey(days[0], calendar: calendar) == "2026-11-09")
        #expect(RecipeText.dayKey(days[6], calendar: calendar) == "2026-11-15")
    }

    @Test func shoppingTreatsOtherAmountsAsTheSameLine() {
        #expect(RecipeStore.withoutAmount("500 g carne") == RecipeStore.withoutAmount("750 g carne"))
        #expect(RecipeStore.withoutAmount("2 cepe") != RecipeStore.withoutAmount("2 morcovi"))
    }

    @Test func readsARecipeRow() throws {
        let row: [String: Any] = ["id": "r", "title": "Supă", "category": NSNull(), "servings": 4, "ingredients": ["1 ceapă", "", NSNull()],
                                  "steps": ["Fierbe 10 minute."], "spaceGroups": ["space-a"], "readerGroups": ["everyone"]]
        let r = try #require(Recipe(row: row, mySpace: "space-a"))
        #expect(r.ingredients == ["1 ceapă"])
        #expect(r.category == "")
        #expect(r.mine && r.shared)
        #expect(r.detailLine == "")
    }

    @Test func readsANoteFromItsJSON() throws {
        let log = try #require(RecipeLog(row: ["id": "l", "recipeId": "r", "notes": [#"{"day":"2026-11-11","text":"Bună","by":"Lori"}"#]]))
        #expect(log.notes.first?.text == "Bună")
        #expect(log.noteStrings.count == 1)
    }
}
