import Foundation
import Observation

/// Kid mode (kidMode.ts): the phone goes to the child with only the stories side, without
/// Adaugă and Profil, only the folders the parent picked, and an optional time limit that ends
/// on a lock screen. The PIN and the choices are the family's (FamilySettings); whether kid mode
/// is on, and until when, belongs to this phone only.
@MainActor @Observable
final class KidMode {
    private struct State: Codable {
        var active = false
        var endsAt: Date?
        var total: TimeInterval = 0
        var locked = false
        var wrong = 0
        var waitUntil: Date?
    }

    private var state: State { didSet { persist() } }
    private var timer: Task<Void, Never>?
    private let defaults: UserDefaults
    private static let key = "kt-kid"

    var active: Bool { state.active }
    var locked: Bool { state.active && state.locked }
    var endsAt: Date? { state.endsAt }
    var total: TimeInterval { state.total }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if LaunchOptions.screen == "kid" {
            state = State(active: true, endsAt: Date().addingTimeInterval(22 * 60), total: 30 * 60)
        } else if let data = defaults.data(forKey: Self.key), let saved = try? JSONDecoder().decode(State.self, from: data) {
            state = saved
        } else {
            state = State()
        }
        schedule()
    }

    /// Turns kid mode on for `minutes` (0 = no limit).
    func start(minutes: Int) {
        state = State(active: true, endsAt: minutes > 0 ? Date().addingTimeInterval(Double(minutes) * 60) : nil,
                      total: Double(minutes) * 60, locked: false, wrong: state.wrong, waitUntil: state.waitUntil)
        schedule()
        trackBadge(.kidMode)
    }

    /// More time: from now when the time ran out, otherwise added to what is left.
    func extend(minutes: Int) {
        let base = max(state.endsAt ?? Date(), Date())
        let end = base.addingTimeInterval(Double(minutes) * 60)
        state.active = true
        state.locked = false
        state.endsAt = end
        state.total = end.timeIntervalSinceNow
        schedule()
    }

    func exit() {
        state.active = false
        state.locked = false
        state.endsAt = nil
        timer?.cancel()
    }

    /// Seconds the PIN pad still waits after too many wrong tries (0 = can try).
    func pinWait(now: Date = Date()) -> Int {
        guard let until = state.waitUntil else { return 0 }
        return max(0, Int(until.timeIntervalSince(now).rounded(.up)))
    }

    /// Checks a PIN with `check`; after 5 wrong tries the pad waits 30 seconds, then 2 minutes
    /// after each further one (kidMode.ts).
    func tryPin(_ pin: String, check: (String) -> Bool) -> Bool {
        guard pinWait() == 0 else { return false }
        if check(pin) {
            state.wrong = 0
            state.waitUntil = nil
            return true
        }
        state.wrong += 1
        if state.wrong >= 5 { state.waitUntil = Date().addingTimeInterval(state.wrong == 5 ? 30 : 120) }
        return false
    }

    /// Minutes left, or nil without a limit.
    func left(now: Date = Date()) -> TimeInterval? {
        state.endsAt.map { max(0, $0.timeIntervalSince(now)) }
    }

    private func schedule() {
        timer?.cancel()
        guard state.active, !state.locked, let end = state.endsAt else { return }
        timer = Task { [weak self] in
            let wait = end.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, let self else { return }
            self.state.locked = true
            StoryPlayer.shared.pause()
        }
    }

    private func persist() {
        guard LaunchOptions.screen != "kid", let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: Self.key)
    }
}

extension Int {
    /// "30 min", "1 h", "1 h 30", "fără limită" for 0.
    var kidMinutesLabel: String {
        if self <= 0 { return "fără limită" }
        if self < 60 { return "\(self) min" }
        return self % 60 == 0 ? "\(self / 60) h" : "\(self / 60) h \(self % 60)"
    }
}
