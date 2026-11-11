import Foundation
import Testing
@testable import KitchenTales

/// Recipe values and allergens read and shown like the web (src/lib/diet.ts).
@MainActor
struct FactsTests {
    @Test(arguments: [(22.4, "22 g"), (1.8, "1,8 g"), (3.0, "3 g"), (0.04, "0 g"), (10.0, "10 g")])
    func gramsLikeTheWeb(_ value: Double, _ expected: String) {
        #expect(RecipeFactsText.grams(value) == expected)
    }

    @Test func readsTheJSONOnTheRow() {
        let n = Nutrition.parse(#"{"kcal":410,"protein":26,"carbs":38,"fat":16,"salt":1.8}"#)
        #expect(n?.kcal == 410)
        #expect(n?.salt == 1.8)
        #expect(n?.fiber == nil)
        #expect(Nutrition.parse(#"{"protein":3}"#) == nil)
        let a = AllergenHit.parse(#"[{"key":"oua","from":["ou"]},{"key":""}]"#)
        #expect(a == [AllergenHit(key: "oua", from: ["ou"])])
    }

    @Test func vegetarianCatchesFishAndAllergiesComeFirst() {
        let hits = [AllergenHit(key: "peste", from: ["somon"]), AllergenHit(key: "lactoza", from: ["smântână"])]
        let diet = Diet(avoid: [DietRule(key: "lactoza", strict: false), DietRule(key: "carne", strict: true, who: "Ana")])
        let found = RecipeFactsText.conflicts(hits, diet)
        #expect(found.map { $0.rule.key } == ["carne", "lactoza"])
        #expect(found.first?.from == ["somon"])
    }
}
