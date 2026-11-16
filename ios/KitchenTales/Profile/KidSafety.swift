import AVFoundation
import LocalAuthentication

/// Kid mode's two phone-only safety settings: the volume ceiling for stories and the Face ID exit.
/// Both are kept per phone (UserDefaults), like whether kid mode is on: Face ID knows only the
/// faces saved on this phone, and the volume belongs to its headphones.
enum KidSafety {
    static let volumeKey = "kt-kid-volume"
    static let volumeAlwaysKey = "kt-kid-volume-always"
    static let faceIDKey = "kt-kid-faceid"

    /// The ceiling offered on the page: 20 % to 100 % (100 % = no limit). 50 % by default.
    static let volumeRange: ClosedRange<Double> = 0.2...1
    static let defaultVolume = 0.5

    /// The ceiling for stories in kid mode, or nil when the parent chose 100 % (no limit).
    static func cap(_ defaults: UserDefaults = .standard) -> Double? {
        let saved = defaults.object(forKey: volumeKey) as? Double ?? defaultVolume
        let value = min(max(saved, volumeRange.lowerBound), volumeRange.upperBound)
        return value >= 0.995 ? nil : value
    }

    /// The ceiling applies in headphones only (the default) or on the speaker too.
    static func onlyInHeadphones(_ defaults: UserDefaults = .standard) -> Bool {
        !defaults.bool(forKey: volumeAlwaysKey)
    }

    /// Leaving kid mode asks for Face ID first (on by default); off = the PIN only.
    static func usesFaceID(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: faceIDKey) as? Bool ?? true
    }

    /// How loud the app plays so that the phone's volume and the app's together stay at `cap`:
    /// full until the phone's volume reaches the cap, then lowered in step with it.
    static func gain(system: Double, cap: Double?) -> Double {
        guard let cap, cap < 1, system > cap, system > 0 else { return 1 }
        return cap / system
    }

    /// Headphones of any kind: wired, USB, AirPods and other Bluetooth ones.
    static func isHeadphones(_ ports: [AVAudioSession.Port]) -> Bool {
        let kinds: [AVAudioSession.Port] = [.headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio]
        return ports.contains { kinds.contains($0) }
    }

    /// "50% · în căști", "fără limită" (the row on the child's page).
    static func volumeSummary(cap: Double?, onlyInHeadphones: Bool) -> String {
        guard let cap else { return "fără limită" }
        return "\(Int((cap * 100).rounded()))% · " + (onlyInHeadphones ? "în căști" : "mereu")
    }

    /// A word for how loud the ceiling is, under the big number.
    static func volumeWord(_ value: Double) -> String {
        if value >= 0.995 { return "fără limită" }
        if value < 0.35 { return "încet" }
        if value < 0.65 { return "potrivit pentru seară" }
        return "tare"
    }
}

/// Face ID (or Touch ID) for a parent. Only the face, never the phone's passcode: many children
/// know the passcode, so the fallback is the family's kid-mode PIN.
@MainActor
enum ParentCheck {
    enum Outcome: Equatable { case passed, usePin, cancelled }

    /// "Face ID", "Touch ID" or "Optic ID" when this phone can check a face or a finger now.
    static var biometryName: String? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return nil
        }
    }

    /// The SF Symbol for the phone's kind of check.
    static var symbol: String {
        biometryName == "Touch ID" ? "touchid" : "faceid"
    }

    /// Face ID is turned on in kid mode's settings and the phone can use it.
    static var available: Bool { KidSafety.usesFaceID() && biometryName != nil }

    static func ask() async -> Outcome {
        let context = LAContext()
        context.localizedFallbackTitle = "Folosește PIN-ul"
        context.localizedCancelTitle = "Renunță"
        do {
            let ok = try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Ieși din modul copil")
            return ok ? .passed : .usePin
        } catch let error as LAError {
            return outcome(error.code)
        } catch {
            return .usePin
        }
    }

    /// The child or the parent closed the prompt: nothing happens. Anything else (not
    /// recognised, too many tries, no face saved) goes on to the PIN.
    nonisolated static func outcome(_ code: LAError.Code) -> Outcome {
        switch code {
        case .userCancel, .systemCancel, .appCancel: return .cancelled
        default: return .usePin
        }
    }
}
