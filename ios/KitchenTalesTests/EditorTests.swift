import Foundation
import Testing
@testable import KitchenTales

@MainActor
struct EditorTests {
    @Test func knowsALink() {
        #expect(EditorText.asLink("  https://www.jamilacuisine.ro/ciorba  ") == "https://www.jamilacuisine.ro/ciorba")
        #expect(EditorText.asLink("www.bucataras.ro/reteta/1") == "https://www.bucataras.ro/reteta/1")
        #expect(EditorText.asLink("ciorbă de perișoare\n500 g carne") == nil)
        #expect(EditorText.asLink("vezi https://x.ro/a") == nil)
        #expect(EditorText.videoSite("https://youtu.be/abc") == "YouTube")
        #expect(EditorText.videoSite("https://www.tiktok.com/@a/video/1") == "TikTok")
        #expect(EditorText.videoSite("https://www.instagram.com/reel/x") == "Instagram")
        #expect(EditorText.videoSite("https://www.jamilacuisine.ro/x") == nil)
    }

    @Test func splitsPastedTextWithHeadings() {
        let p = EditorText.parseRecipe("""
        Clătite
        Ingrediente:
        - 2 ouă
        • 500 ml lapte
        Mod de preparare
        1. Amestecă totul.
        2) Coace în tigaie.
        """)
        #expect(p.title == "Clătite")
        #expect(p.ingredients == ["2 ouă", "500 ml lapte"])
        #expect(p.steps == ["Amestecă totul.", "Coace în tigaie."])
        // "Pașii" is not the heading "Pași".
        #expect(EditorText.parseRecipe("T\nPașii sunt simpli").steps == ["Pașii sunt simpli"])
    }

    @Test func cleansDictatedIngredients() {
        #expect(EditorText.spokenIngredientLines(["Cinci sute de grame de făină, două ouă și apoi o lingură de zahăr."])
                == ["500 g făină", "2 ouă", "1 lingură zahăr"])
        #expect(EditorText.cleanSpokenIngredient("Jumătate de kilogram de cartofi") == "½ kg cartofi")
        #expect(EditorText.cleanSpokenIngredient("un sfert de lingură sare") == "¼ lingură sare")
        #expect(EditorText.splitSpoken("200 g zahăr 3 ouă") == ["200 g zahăr", "3 ouă"])
    }

    @Test func saysWhatItFound() {
        #expect(EditorText.foundLine(ingredients: ["500 g carne", "2 cepe"], steps: 3) == "Am găsit 2 ingrediente și 3 pași. Verifică și salvează.")
        #expect(EditorText.foundLine(ingredients: ["500 g carne", "sare"], steps: 1) == "Am găsit 2 ingrediente și 1 pași. Un ingredient nu are cantitate, verifică-le.")
    }

    @Test func writesTheDietLikeTheWeb() {
        let d = Diet(avoid: [DietRule(key: "nuci", strict: true, who: "Ana"), DietRule(key: "porc", strict: false)], dislikes: "ciuperci")
        #expect(EditorText.dietText(d) == "alergie, nu apar deloc: nuci (Ana); evităm, înlocuiește: carne de porc; nu ne plac: ciuperci")
        #expect(EditorText.dietRow(d) == "fără nuci (alergie, Ana) · fără porc · fără ciuperci")
        #expect(!EditorText.hasDiet(Diet()))
    }

    @Test func buildsTheIdeaBrief() {
        let x = RecipeIdea(title: "Omletă", description: "rapidă", missing: ["roșii"])
        #expect(EditorText.ideaBrief(x, fridge: " ouă, ceapă ")
                == "Omletă (rapidă). Folosește ce am în frigider: ouă, ceapă. Pe lângă asta am doar sare, piper, ulei, apă, zahăr și făină, iar pot cumpăra: roșii.")
    }

    @Test func readsAnImportedRecipe() throws {
        let x = try #require(ImportedRecipe(json: ["title": "Supă", "servings": 4, "ingredients": ["1 l apă", ""], "steps": ["Fierbe."], "photoKey": ""]))
        #expect(x.ingredients == ["1 l apă"])
        #expect(x.servings == 4)
        #expect(x.photoKey == nil)
        #expect(ImportedRecipe(json: ["title": ""]) == nil)
    }

    @Test func picksThePlateTintLikeTheWeb() {
        // hash("rețetă") with the web's 32-bit h * 31 + code point.
        var h: Int32 = 0
        for c in "Ciorbă de perișoare".unicodeScalars { h = h &* 31 &+ Int32(c.value) }
        #expect(PlateDrawing.index("Ciorbă de perișoare") == Int(h.magnitude % 6))
        #expect(PlateDrawing.index("") == 0)
    }

    @Test func groupsDictationIntoPhrases() {
        let words: [(text: String, start: TimeInterval, length: TimeInterval)] = [
            ("două", 0.1, 0.3), ("ouă", 0.45, 0.3), ("un", 1.8, 0.2), ("litru", 2.05, 0.3), ("lapte", 2.4, 0.3),
        ]
        let (phrases, partial) = Dictation.phrases(words, final: false)
        #expect(phrases == ["două ouă"])
        #expect(partial == "un litru lapte")
        #expect(Dictation.phrases(words, final: true).0 == ["două ouă", "un litru lapte"])
    }

    @Test func draftKnowsWhenSomethingChanged() {
        let r = DemoKitchen.recipes[0]
        let draft = RecipeDraft(recipe: r, server: nil)
        #expect(!draft.dirty)
        #expect(draft.steps.count == r.steps.count)
        draft.recipe.title = "Altă ciorbă"
        #expect(draft.dirty)
        draft.recipe.title = r.title
        #expect(!draft.dirty)
        let id = draft.addStep(at: 1)
        #expect(draft.steps[1].id == id)
        draft.moveStep(from: 1, to: 0)
        #expect(draft.steps[0].id == id)
        // The last step has text, so dictation starts a new one; an empty last step is reused.
        let dictated = draft.stepForDictation()
        #expect(draft.steps.last?.id == dictated)
        #expect(draft.stepForDictation() == dictated)
    }
}
