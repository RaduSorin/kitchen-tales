import Testing
@testable import KitchenTales

/// The words on the redesigned stories screens (design-polish/ios-stories-redesign/).
@MainActor
struct StoryRedesignTests {
    @Test func excerptCutsAtAWord() {
        let text = String(repeating: "lampa fermecată ", count: 30)
        let cut = StoryDetailView.excerpt(text, limit: 40)
        #expect(cut?.hasSuffix("…") == true)
        #expect((cut?.count ?? 0) <= 41)
        #expect(StoryDetailView.excerpt("Scurtă.\nGata.") == "Scurtă. Gata.")
        #expect(StoryDetailView.excerpt("  \n ") == nil)
    }

    @Test func nextLineSaysWhenItStops() {
        let next = Story(id: "n", title: "Regele Leu", emoji: "🦁", durationSec: 540)
        #expect(PlayerNextLine.title(next, left: 2) == "Regele Leu")
        #expect(PlayerNextLine.tail(next, left: 2) == "")
        #expect(PlayerNextLine.tail(next, left: 1) == " · apoi se oprește")
        #expect(PlayerNextLine.title(next, left: 0) == "Se oprește după povestea asta")
        #expect(PlayerNextLine.lead(nil, left: 3) == "")
    }

    @Test func librarySearchPrompt() {
        #expect(LibraryView.prompt(1) == "Caută într-o poveste")
        #expect(LibraryView.prompt(10) == "Caută în 10 povești")
    }
}
