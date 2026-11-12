import Testing
@testable import KitchenTales

struct ShoppingMergeTests {
    private func line(_ id: String, _ text: String, _ recipe: String? = nil) -> ShoppingLine {
        ShoppingLine(id: id, text: text, recipeId: recipe.map { "r-\($0)" }, recipeTitle: recipe)
    }

    @Test func sameIngredientFromTwoRecipesIsOneLine() {
        let rows = ShoppingMerge.rows([line("1", "2 cepe mari", "Ciorbă"), line("2", "1 ceapă", "Tocăniță"), line("3", "pâine")])
        #expect(rows.count == 2)
        #expect(rows[0].text == "3 cepe mari")
        #expect(rows[0].ids == ["1", "2"])
        #expect(rows[0].sources == ["Ciorbă", "Tocăniță"])
        #expect(rows[1].text == "pâine")
    }

    @Test func gramsAndKilosAddUp() {
        let rows = ShoppingMerge.rows([line("1", "500 g cartofi", "A"), line("2", "1 kg cartofi", "B")])
        #expect(rows.count == 1)
        #expect(rows[0].text == "1 ½ kg cartofi")
    }

    @Test func rangesStayOnTheirOwn() {
        let rows = ShoppingMerge.rows([line("1", "2-3 căței usturoi", "A"), line("2", "2 căței usturoi", "B")])
        #expect(rows.count == 2)
    }
}

struct PlanWeekTests {
    @Test func whatIsAtHomeIsLeftOffTheList() {
        let home = PlanPrefs.atHome("2 dovlecei, piept de pui, smântână")
        #expect(home("1 dovlecel mare"))
        #expect(home("500 g piept de pui"))
        #expect(home("200 ml smântână"))
        #expect(!home("1 kg cartofi"))
    }
}
