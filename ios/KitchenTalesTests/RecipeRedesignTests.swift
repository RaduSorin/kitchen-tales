import Testing
@testable import KitchenTales

/// The redesigned recipe screens (design-polish/ios-recipes-redesign/, option A "Etichetă").
@MainActor
struct RecipeRedesignTests {
    @Test func labelDrawingFollowsTheCategory() {
        #expect(RecipeLabel.kind("Ciorbe și supe") == .bowl)
        #expect(RecipeLabel.kind("Supe") == .bowl)
        #expect(RecipeLabel.kind("Patiserie") == .bread)
        #expect(RecipeLabel.kind("Deserturi") == .bread)
        #expect(RecipeLabel.kind("Pâine") == .bread)
        #expect(RecipeLabel.kind("Băuturi") == .glass)
        #expect(RecipeLabel.kind("Feluri principale") == .pan)
        #expect(RecipeLabel.kind("") == .pan)
    }

    @Test func photoOnlyWhenThereIsOne() {
        var r = Recipe(id: "a", title: "Plăcinta Anei", category: "Patiserie")
        #expect(!r.hasPhoto)
        r.photoKey = ""
        #expect(!r.hasPhoto)
        r.photoKey = "photos/a.jpg"
        #expect(r.hasPhoto)
        #expect(Recipe(id: "b", title: "x", category: "", demoPhoto: "ciorba").hasPhoto)
    }

    @Test func tileLineUnderThePhoto() {
        #expect(RecipeTile.meta(Recipe(id: "a", title: "x", category: "", servings: 4, minutes: 90)) == "1 h 30 · 4 porții")
        #expect(RecipeTile.meta(Recipe(id: "b", title: "x", category: "", servings: 8, minutes: 45, mine: false, spaceName: "Ana")) == "45 min · de la Ana")
        #expect(RecipeTile.meta(Recipe(id: "c", title: "x", category: "")) == "")
    }

    @Test func longStepsGetSmaller() {
        #expect(CookModeView.stepSize("Toacă ceapa și morcovul mărunt.") == 34)
        #expect(CookModeView.stepSize(String(repeating: "a", count: 400)) == 20)
        #expect(CookModeView.needs(["2 cepe", "1 morcov"], factor: 1) == "2 cepe, 1 morcov")
    }
}
