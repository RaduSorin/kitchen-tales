import ActivityKit
import Foundation

/// The cooking timers on the Lock Screen and in the Dynamic Island (concept
/// design-polish/ios-widgets, part 1): one Live Activity per cooking session, with a row for each
/// step whose timer is set, the one that ends first on top.
struct CookTimerAttributes: ActivityAttributes, Sendable {
    struct Clock: Codable, Hashable, Sendable {
        /// The step, from 0.
        var step: Int
        /// "Fierbe perișoarele"
        var title: String
        /// "la foc mic, cu capac", may be empty.
        var detail: String
        /// Seconds the timer counts in all (grows with "+1 min").
        var total: Int
        /// When it rings, while it runs; nil when paused or done.
        var endsAt: Date?
        /// Seconds left when paused; 0 when done.
        var left: Int

        var isRunning: Bool { endsAt != nil }
        var isDone: Bool { endsAt == nil && left == 0 }
    }

    struct ContentState: Codable, Hashable, Sendable {
        var clocks: [Clock]
    }

    var recipeId: String
    var title: String
    var stepCount: Int
    /// A small copy of the recipe photo in the shared folder, nil without one.
    var photo: String?
}

enum CookActivityText {
    /// A step's first sentence or clause as the title, what follows as the detail:
    /// "Fierbe perișoarele la foc mic, cu capac, 25 de minute." →
    /// ("Fierbe perișoarele la foc mic", "cu capac, 25 de minute").
    nonisolated static func split(_ step: String) -> (title: String, detail: String) {
        let text = step.trimmingCharacters(in: .whitespacesAndNewlines)
        let stops: [Character] = [".", ",", ";", ":", "!", "?"]
        guard let cut = text.firstIndex(where: { stops.contains($0) }) else { return (short(text), "") }
        let title = String(text[..<cut]).trimmingCharacters(in: .whitespaces)
        var rest = String(text[text.index(after: cut)...]).trimmingCharacters(in: .whitespaces)
        while let last = rest.last, stops.contains(last) { rest.removeLast() }
        return (short(title), short(rest))
    }

    /// At most 40 letters, cut at a word.
    nonisolated static func short(_ text: String, limit: Int = 40) -> String {
        guard text.count > limit else { return text }
        let head = String(text.prefix(limit))
        let words = head.split(separator: " ").dropLast()
        return (words.isEmpty ? head : words.joined(separator: " ")) + "…"
    }

    /// "Pasul 3 din 6", or "2 timere".
    nonisolated static func corner(_ clocks: [CookTimerAttributes.Clock], stepCount: Int) -> String {
        if clocks.count > 1 { return "\(clocks.count) timere" }
        guard let c = clocks.first else { return "" }
        return "Pasul \(c.step + 1) din \(stepCount)"
    }

    /// The soonest first: running by end time, then paused, then done.
    nonisolated static func ordered(_ clocks: [CookTimerAttributes.Clock]) -> [CookTimerAttributes.Clock] {
        clocks.sorted { a, b in
            switch (a.endsAt, b.endsAt) {
            case let (x?, y?): return x < y
            case (.some, nil): return true
            case (nil, .some): return false
            default: return a.left != b.left ? a.left > b.left : a.step < b.step
            }
        }
    }
}
