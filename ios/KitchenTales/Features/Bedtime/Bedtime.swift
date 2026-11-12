import Foundation
import Observation
import UIKit
import UserNotifications

/// "Ora de culcare" (concept design-polish/ios-native, part B): a reminder before the child's
/// bedtime on the chosen days, then the night screen with a few stories in a row, the light down
/// and a gentle stop. The choices belong to this phone (the reminders are this phone's too).
@MainActor @Observable
final class Bedtime {
    struct Settings: Codable, Equatable {
        var enabled = false
        var hour = 20
        var minute = 30
        /// Calendar weekdays, 1 = Sunday … 7 = Saturday. Default: Sunday to Thursday (school nights).
        var days: Set<Int> = [1, 2, 3, 4, 5]
        var reminderMinutes = 15
        var stories = 3
        /// The folder the stories come from; nil = favourites (or all, when there are none).
        var folder: String?
        var kidMode = true
        var withSleepFocus = true
    }

    static let shared = Bedtime()
    nonisolated static let storyChoices = [1, 2, 3, 5]
    nonisolated static let reminderChoices = [0, 5, 10, 15, 30]
    private static let key = "kt-bedtime"

    var settings: Settings { didSet { if settings != oldValue { persist(); Task { await schedule() } } } }
    /// The night screen is showing.
    var showsNight = false
    /// The steps the child ticked tonight (pijama, dinți, în pat).
    var ticked: Set<Int> = []

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key), let saved = try? JSONDecoder().decode(Settings.self, from: data) {
            settings = saved
        } else {
            settings = Settings()
        }
        if LaunchOptions.screen == "bedtime-settings" { settings.enabled = true }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(settings) { defaults.set(data, forKey: Self.key) }
    }

    func open() {
        ticked = []
        showsNight = true
    }

    // MARK: Reminders

    nonisolated static let category = "BEDTIME"
    nonisolated static let startAction = "BEDTIME_START"
    nonisolated static let snoozeAction = "BEDTIME_SNOOZE"
    private nonisolated static let prefix = "bedtime-"

    /// Asks for notifications the first time the routine is turned on.
    func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// One repeating reminder per chosen weekday, `reminderMinutes` before bedtime.
    func schedule(center: UNUserNotificationCenter = .current()) async {
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard settings.enabled, LaunchOptions.demoAccount == nil else { return }
        for (weekday, time) in Self.reminderTimes(settings) {
            let content = UNMutableNotificationContent()
            content.title = "E aproape ora de culcare"
            content.body = reminderText()
            content.sound = .default
            content.categoryIdentifier = Self.category
            content.interruptionLevel = .timeSensitive
            var when = DateComponents()
            when.weekday = weekday; when.hour = time.hour; when.minute = time.minute
            let request = UNNotificationRequest(identifier: "\(Self.prefix)\(weekday)", content: content,
                                                trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true))
            try? await center.add(request)
        }
    }

    /// "Peste 10 min".
    func snooze(center: UNUserNotificationCenter = .current()) async {
        let content = UNMutableNotificationContent()
        content.title = "Ora de culcare"
        content.body = "Gata? Poveștile vă așteaptă."
        content.sound = .default
        content.categoryIdentifier = Self.category
        try? await center.add(UNNotificationRequest(identifier: "\(Self.prefix)snooze", content: content,
                                                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 10 * 60, repeats: false)))
    }

    /// When the iPhone's Sleep Focus starts (Focus filter): the reminder right away.
    func remindNow(center: UNUserNotificationCenter = .current()) async {
        guard settings.enabled else { return }
        let content = UNMutableNotificationContent()
        content.title = "Ora de culcare"
        content.body = reminderText()
        content.sound = .default
        content.categoryIdentifier = Self.category
        try? await center.add(UNNotificationRequest(identifier: "\(Self.prefix)focus", content: content, trigger: nil))
    }

    private func reminderText() -> String {
        let n = settings.stories
        return n == 1 ? "În seara asta: o poveste, apoi noapte bună." : "În seara asta: \(n) povești la rând, apoi noapte bună."
    }

    /// The reminder's weekday and time for each chosen day (moving to the day before when the
    /// reminder falls before midnight of a bedtime just after it).
    nonisolated static func reminderTimes(_ s: Settings) -> [(weekday: Int, time: (hour: Int, minute: Int))] {
        s.days.sorted().map { day in
            var total = s.hour * 60 + s.minute - s.reminderMinutes
            var weekday = day
            if total < 0 { total += 24 * 60; weekday = day == 1 ? 7 : day - 1 }
            return (weekday, (total / 60, total % 60))
        }
    }

    /// "L M M J V S D" with the chosen days.
    nonisolated static let dayLetters: [(weekday: Int, letter: String, name: String)] = [
        (2, "L", "luni"), (3, "M", "marți"), (4, "M", "miercuri"), (5, "J", "joi"), (6, "V", "vineri"), (7, "S", "sâmbătă"), (1, "D", "duminică"),
    ]

    nonisolated static func daysLabel(_ days: Set<Int>) -> String {
        if days.count == 7 { return "în fiecare seară" }
        if days.isEmpty { return "nicio zi" }
        return dayLetters.filter { days.contains($0.weekday) }.map(\.letter).joined(separator: " ")
    }

    nonisolated static func timeLabel(_ s: Settings) -> String { String(format: "%02d:%02d", s.hour, s.minute) }

    // MARK: Tonight's stories

    /// The stories for tonight: the one left half-way first, then the ones not heard yet, then
    /// the rest, from the chosen folder (or the favourites, or everything).
    nonisolated static func tonight(_ stories: [Story], folder: String?, count: Int, last: String?,
                                    played: Set<String>, position: (String) -> Double) -> [Story] {
        var pool: [Story]
        if let folder {
            pool = stories.filter { StoryLibrary.folderOf($0) == folder }
        } else {
            let favorites = stories.filter(\.favorite)
            pool = favorites.isEmpty ? stories : favorites
        }
        if pool.isEmpty { pool = stories }
        var out: [Story] = []
        if let last, let started = pool.first(where: { $0.id == last }), position(last) > 5 { out.append(started) }
        out += pool.filter { !played.contains($0.id) && !out.contains($0) }
        out += pool.filter { !out.contains($0) }
        return Array(out.prefix(max(1, count)))
    }

    /// "aproape 25 de minute".
    nonisolated static func lengthLabel(_ stories: [Story]) -> String {
        let minutes = Int((stories.compactMap(\.durationSec).reduce(0, +) / 60).rounded())
        guard minutes > 0 else { return "" }
        if minutes < 20 { return "aproape \(minutes) minute" }
        return "aproape \(minutes) de minute"
    }

    // MARK: Light

    /// The brightness before the night screen dimmed it. Kept on the phone too: if the app is
    /// closed while dim, the next launch puts the light back (iOS keeps an app's brightness).
    private var savedBrightness: CGFloat? {
        get { (defaults.object(forKey: Self.brightnessKey) as? Double).map { CGFloat($0) } }
        set { if let newValue { defaults.set(Double(newValue), forKey: Self.brightnessKey) } else { defaults.removeObject(forKey: Self.brightnessKey) } }
    }
    private static let brightnessKey = "kt-bedtime-brightness"

    /// The screen goes dim while the night screen and the stories play, and back after.
    func dim(_ on: Bool, screen: UIScreen? = nil) {
        guard let screen = screen ?? (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.screen else { return }
        if on {
            if savedBrightness == nil { savedBrightness = screen.brightness }
            screen.brightness = min(screen.brightness, 0.25)
        } else if let saved = savedBrightness {
            screen.brightness = saved
            savedBrightness = nil
        }
    }

    /// On launch: the app was closed while the night screen had dimmed the phone.
    func restoreBrightnessIfLeftDim() {
        if savedBrightness != nil, !showsNight { dim(false) }
    }
}

/// Local notifications: the bedtime reminder's buttons and "your story is ready".
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = NotificationRouter()

    @MainActor func install() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let start = UNNotificationAction(identifier: Bedtime.startAction, title: "Începe acum", options: [.foreground])
        let snooze = UNNotificationAction(identifier: Bedtime.snoozeAction, title: "Peste 10 min", options: [])
        center.setNotificationCategories([UNNotificationCategory(identifier: Bedtime.category, actions: [start, snooze], intentIdentifiers: [])])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let category = response.notification.request.content.categoryIdentifier
        let action = response.actionIdentifier
        guard category == Bedtime.category else { return }
        await MainActor.run {
            if action == Bedtime.snoozeAction { Task { await Bedtime.shared.snooze() } } else { AppCommands.shared.pending = .bedtime }
        }
    }

    /// Shows reminders also while the app is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    /// "Povestea „…” e gata": when a story finishes while the app is in the background.
    @MainActor static func storyReady(title: String) {
        guard UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = "Povestea e gata"
        content.body = "„\(title)” e scrisă și citită. Deschide aplicația ca s-o pui pe raft."
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "story-ready-\(UUID().uuidString)", content: content, trigger: nil))
    }
}
