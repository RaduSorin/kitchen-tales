import AVFoundation
import Foundation
import LocalAuthentication
import Testing
@testable import KitchenTales

@MainActor
struct KidSafetyTests {
    private func freshDefaults() -> UserDefaults {
        let name = "kid-safety-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func keepsStoriesUnderTheCeiling() {
        // Below the ceiling the app plays at full volume.
        #expect(KidSafety.gain(system: 0.3, cap: 0.5) == 1)
        #expect(KidSafety.gain(system: 0.5, cap: 0.5) == 1)
        // Above it, the phone's volume times the app's stays at the ceiling.
        #expect(abs(KidSafety.gain(system: 1, cap: 0.5) - 0.5) < 0.0001)
        #expect(abs(KidSafety.gain(system: 0.8, cap: 0.5) * 0.8 - 0.5) < 0.0001)
        // No ceiling, or 100 %.
        #expect(KidSafety.gain(system: 1, cap: nil) == 1)
        #expect(KidSafety.gain(system: 1, cap: 1) == 1)
    }

    @Test func readsTheSettingsOfThisPhone() {
        let defaults = freshDefaults()
        #expect(KidSafety.cap(defaults) == 0.5)
        #expect(KidSafety.onlyInHeadphones(defaults))
        #expect(KidSafety.usesFaceID(defaults))
        defaults.set(1.0, forKey: KidSafety.volumeKey)
        #expect(KidSafety.cap(defaults) == nil)
        defaults.set(0.05, forKey: KidSafety.volumeKey)
        #expect(KidSafety.cap(defaults) == 0.2)
        defaults.set(true, forKey: KidSafety.volumeAlwaysKey)
        defaults.set(false, forKey: KidSafety.faceIDKey)
        #expect(!KidSafety.onlyInHeadphones(defaults))
        #expect(!KidSafety.usesFaceID(defaults))
    }

    @Test func knowsHeadphonesFromTheSpeaker() {
        #expect(KidSafety.isHeadphones([.headphones]))
        #expect(KidSafety.isHeadphones([.bluetoothA2DP]))
        #expect(!KidSafety.isHeadphones([.builtInSpeaker]))
        #expect(!KidSafety.isHeadphones([.airPlay]))
        #expect(!KidSafety.isHeadphones([]))
    }

    @Test func describesTheCeiling() {
        #expect(KidSafety.volumeSummary(cap: 0.5, onlyInHeadphones: true) == "50% · în căști")
        #expect(KidSafety.volumeSummary(cap: 0.35, onlyInHeadphones: false) == "35% · mereu")
        #expect(KidSafety.volumeSummary(cap: nil, onlyInHeadphones: true) == "fără limită")
        #expect(KidSafety.volumeWord(0.5) == "potrivit pentru seară")
        #expect(KidSafety.volumeWord(1) == "fără limită")
    }

    @Test func goesToThePinWhenFaceIDDoesNotRecogniseYou() {
        #expect(ParentCheck.outcome(.userCancel) == .cancelled)
        #expect(ParentCheck.outcome(.systemCancel) == .cancelled)
        #expect(ParentCheck.outcome(.userFallback) == .usePin)
        #expect(ParentCheck.outcome(.authenticationFailed) == .usePin)
        #expect(ParentCheck.outcome(.biometryLockout) == .usePin)
    }

    @Test func kidModeTurnsTheCeilingOnAndOff() {
        let defaults = freshDefaults()
        let kid = KidMode(defaults: defaults)
        kid.start(minutes: 0)
        #expect(StoryPlayer.shared.volumeCap == 0.5)
        #expect(StoryPlayer.shared.capOnlyInHeadphones)
        kid.exit()
        #expect(StoryPlayer.shared.volumeCap == nil)
    }

    @Test func callsTheChildByName() {
        #expect(ChildView.dative("Ana") == "Anei")
        #expect(ChildView.dative("Matei") == "lui Matei")
    }
}
