import AVFoundation
import Foundation
import Testing
@testable import KitchenTales

struct ShortcutTests {
    @Test func saidItemsBecomeLines() {
        #expect(ShortcutText.items("lapte, ouă și pâine") == ["lapte", "ouă", "pâine"])
        #expect(ShortcutText.items("milk and eggs") == ["milk", "eggs"])
        #expect(ShortcutText.items("  smântână ") == ["smântână"])
        #expect(ShortcutText.items(" , ") == [])
    }

    @Test func spokenListReadsLikeRomanian() {
        #expect(ShortcutText.spokenList([]) == "")
        #expect(ShortcutText.spokenList(["ciorbă"]) == "ciorbă")
        #expect(ShortcutText.spokenList(["ciorbă", "chifle", "salată"]) == "ciorbă, chifle și salată")
    }

    @Test func todayPlanOnceEach() {
        let today = Date()
        let key = RecipeText.dayKey(today)
        let recipes = [Recipe(id: "a", title: "Ciorbă", category: "Supe"), Recipe(id: "b", title: "Chifle", category: "Pâine")]
        let plan = [PlanEntry(id: "1", day: key, recipeId: "a"), PlanEntry(id: "2", day: key, recipeId: "a"),
                    PlanEntry(id: "3", day: key, recipeId: "b"), PlanEntry(id: "4", day: "1999-01-01", recipeId: "b"),
                    PlanEntry(id: "5", day: key, recipeId: "gone")]
        #expect(ShortcutText.planned(on: today, plan: plan, recipes: recipes) == ["Ciorbă", "Chifle"])
    }

    @Test func storyToPlayPrefersAskedThenLastThenFavourite() {
        var fav = Story(id: "f", title: "Fav", emoji: "⭐")
        fav.favorite = true
        let stories = [Story(id: "n", title: "Nou", emoji: "⭐"), fav, Story(id: "l", title: "Last", emoji: "⭐")]
        #expect(ShortcutText.storyToPlay("n", last: "l", stories: stories)?.id == "n")
        #expect(ShortcutText.storyToPlay("missing", last: "l", stories: stories)?.id == "l")
        #expect(ShortcutText.storyToPlay(nil, last: nil, stories: stories)?.id == "f")
        #expect(ShortcutText.storyToPlay(nil, last: nil, stories: [stories[0]])?.id == "n")
        #expect(ShortcutText.storyToPlay(nil, last: nil, stories: []) == nil)
    }

    @Test func callPausesAndOnlyShortInterruptionsResume() {
        let began: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue]
        let endedResume: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue,
                                               AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue]
        let ended: [AnyHashable: Any] = [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue]
        #expect(StoryPlayer.interruptionAction(began) == .pause)
        #expect(StoryPlayer.interruptionAction(endedResume) == .resume)
        #expect(StoryPlayer.interruptionAction(ended) == StoryPlayer.InterruptionAction.none)
        #expect(StoryPlayer.interruptionAction(nil) == StoryPlayer.InterruptionAction.none)
        #expect(StoryRecorder.interruptionBegan(began))
        #expect(!StoryRecorder.interruptionBegan(ended))
    }

    @Test func headphonesOutPauses() {
        let out: [AnyHashable: Any] = [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue]
        let newDevice: [AnyHashable: Any] = [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue]
        #expect(StoryPlayer.deviceRemoved(out))
        #expect(!StoryPlayer.deviceRemoved(newDevice))
    }
}
