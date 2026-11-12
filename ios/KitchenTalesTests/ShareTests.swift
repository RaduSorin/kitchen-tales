import Foundation
import Testing
@testable import KitchenTales

struct ShareTests {
    @Test func linkInsideTextIsTheLink() {
        #expect(ShareInput.from(text: "Uite ce rețetă! https://vm.tiktok.com/ZM123/ 😋") == .link(URL(string: "https://vm.tiktok.com/ZM123/")!))
        #expect(ShareInput.from(text: "  500 g făină, 2 ouă  ") == .text("500 g făină, 2 ouă"))
    }

    @Test(arguments: [
        ("https://www.tiktok.com/@a/video/1", "din TikTok"), ("https://www.instagram.com/reel/x", "din Instagram"),
        ("https://youtu.be/abc", "din YouTube"), ("https://www.jamilacuisine.ro/ciorba", "din jamilacuisine.ro"),
    ])
    func originNamesTheApp(link: String, origin: String) {
        #expect(ShareInput.link(URL(string: link)!).origin == origin)
    }

    @Test func keptLinkTitle() {
        let url = URL(string: "https://www.tiktok.com/@a/video/1")!
        #expect(ShareKitchen.linkTitle("  Dans nou  ", url: url) == "Dans nou")
        #expect(ShareKitchen.linkTitle(nil, url: url) == "Video TikTok de încercat")
        #expect(ShareKitchen.linkTitle(String(repeating: "a", count: 200), url: url).count == 80)
    }

    @Test func noRecipeAnswersFromTheServer() {
        #expect(ShareKitchen.isNoRecipe("Nu am găsit o rețetă aici."))
        #expect(ShareKitchen.isNoRecipe("Nu am găsit rețeta în textul videoclipului. Dacă e doar spusă în video…"))
        #expect(!ShareKitchen.isNoRecipe("Ați ajuns la limita lunii: 400 cereri AI pentru rețete."))
    }

    @Test func dayNamesForTheWeek() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        let thursday = calendar.date(from: DateComponents(year: 2026, month: 11, day: 12, hour: 10))!
        let days = ShareCardModel.nextDays(from: thursday, calendar: calendar)
        #expect(days.count == 7)
        #expect(days.map { ShareCardModel.dayName($0, today: thursday, calendar: calendar) } ==
                ["azi", "mâine", "sâmbătă", "duminică", "luni", "marți", "miercuri"])
        #expect(ShareKitchen.dayKey(days[2], calendar: calendar) == "2026-11-14")
    }

    @Test func aiCategoryFirst() {
        #expect(ShareCardView.categoryOrder("Garnituri").first == "Garnituri")
        #expect(ShareCardView.categoryOrder("Garnituri").count == ShareCategories.all.count)
        #expect(ShareCardView.categoryOrder("Ceva nou").count == ShareCategories.all.count + 1)
        #expect(ShareCardView.categoryOrder(nil) == ShareCategories.all)
        #expect(ShareCategories.all == EditorText.categories)
    }

    @Test func savedFacts() {
        let r = SharedRecipe(id: "1", title: "x", category: nil, minutes: 45, servings: 4, ingredientCount: 7)
        #expect(ShareCardView.facts(r) == "45 min · 4 porții · 7 ingrediente")
        #expect(ShareCardView.facts(SharedRecipe(id: "1", title: "x", servings: 1, ingredientCount: 1)) == "1 porție · 1 ingredient")
    }

    @Test func appLinks() {
        #expect(AppCommands.command(for: URL(string: "kitchentales://recipe/abc")!) == .openRecipe("abc"))
        #expect(AppCommands.command(for: URL(string: "kitchentales://list")!) == .openList)
        #expect(AppCommands.command(for: URL(string: "kitchentales://story")!) == .playStory(nil))
        #expect(AppCommands.command(for: URL(string: "https://example.com/recipe/abc")!) == nil)
    }
}
