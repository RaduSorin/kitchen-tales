import Foundation
import Testing
@testable import KitchenTales

struct TodayIdeasTests {
    private func recipe(_ id: String, _ title: String, minutes: Int? = nil, created: String? = nil) -> Recipe {
        Recipe(id: id, title: title, category: "", minutes: minutes, createdAt: created)
    }

    @Test func romanianCounts() {
        #expect(TodayIdeas.sinceText(7) == "de o săptămână")
        #expect(TodayIdeas.sinceText(21) == "de 3 săptămâni")
        #expect(TodayIdeas.sinceText(70) == "de 2 luni")
        #expect(TodayIdeas.sinceText(400) == "de un an")
        #expect(TodayIdeas.count(20, "o zi", "zile") == "20 de zile")
    }

    @Test func oneIdeaPerReasonAndNothingCookedThisWeek() {
        let now = DateFormatter.dayKey.date(from: "2026-11-11")!.addingTimeInterval(10 * 3600)
        let recipes = [recipe("a", "Ciorbă", minutes: 90), recipe("b", "Omletă", minutes: 10),
                       recipe("c", "Plăcintă", created: "2026-11-01"), recipe("d", "Supă", minutes: 40)]
        let logs = ["a": RecipeLog(id: "1", recipeId: "a", favorite: false, cooked: ["2026-09-01"], notes: []),
                    "d": RecipeLog(id: "2", recipeId: "d", favorite: false, cooked: ["2026-11-09"], notes: [])]
        let ideas = TodayIdeas.ideas(recipes, logs: logs, exclude: [], now: now)
        #expect(ideas.map(\.recipe.id) == ["a", "b", "c"])
        #expect(ideas.map(\.kind) == [.demult, .rapida, .noua])
        #expect(ideas[0].why == "N-ai mai gătit-o de 10 săptămâni")
    }
}
