import Testing
@testable import KitchenTales

struct CookModeTests {
    @Test func voiceCommandsInRomanian() {
        #expect(CookCommand.parse("Următorul") == .next)
        #expect(CookCommand.parse("hai mai departe") == .next)
        #expect(CookCommand.parse("nu, înapoi") == .prev)
        #expect(CookCommand.parse("repetă te rog") == .repeatStep)
        #expect(CookCommand.parse("ce ingrediente îmi trebuie") == .ingredients)
        #expect(CookCommand.parse("pornește timerul") == .timer)
        #expect(CookCommand.parse("oprește timerul") == .pause)
        #expect(CookCommand.parse("pasul trei") == .step(3))
        #expect(CookCommand.parse("pasul 5") == .step(5))
        #expect(CookCommand.parse("nu mai asculta") == .stop)
        #expect(CookCommand.parse("ce frumos miroase") == nil)
    }

    @Test func timersSaidAloud() {
        #expect(CookCommand.spokenDuration(600) == "10 minute")
        #expect(CookCommand.spokenDuration(90) == "1 minut și 30 de secunde")
        #expect(CookCommand.spokenDuration(45) == "45 de secunde")
        #expect(CookCommand.spokenDuration(3600) == "1 oră")
    }

    @Test func ingredientsAStepMentions() {
        let ingredients = ["500 g carne tocată", "1 ceapă mare", "1 lingură sare", "Pentru dresat:", "200 ml smântână"]
        #expect(RecipeText.ingredientsForStep("Toacă ceapa și călește 5 minute.", ingredients) == ["1 ceapă mare"])
        #expect(RecipeText.ingredientsForStep("Amestecă carnea cu sare.", ingredients) == ["500 g carne tocată", "1 lingură sare"])
    }
}
