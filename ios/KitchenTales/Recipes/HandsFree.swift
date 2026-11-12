import AVFoundation
import Foundation
import Observation

/// Hands-free cooking, like the web's lib/handsFree.ts: the phone reads each step aloud in
/// Romanian and listens for a few commands ("următorul", "înapoi", "repetă", "ingrediente",
/// "pornește timerul", "pasul 3", "nu mai asculta"), so wet or floury hands never touch the screen.
/// Listening goes through iOS speech recognition (the same as dictation in the editor).
enum CookCommand: Equatable {
    case next, prev, repeatStep, ingredients, timer, pause, stop
    case step(Int)

    /// Safe to act on while the phrase is still being said: nothing longer starts with them.
    var isQuick: Bool { [.next, .prev, .repeatStep, .ingredients].contains(self) }

    private static let numbers: [String: Int] = [
        "unu": 1, "unul": 1, "primul": 1, "doi": 2, "doilea": 2, "trei": 3, "treilea": 3, "patru": 4, "patrulea": 4,
        "cinci": 5, "cincilea": 5, "sase": 6, "saselea": 6, "sapte": 7, "saptelea": 7, "opt": 8, "optulea": 8,
        "noua": 9, "noualea": 9, "zece": 10, "zecelea": 10, "unsprezece": 11, "doisprezece": 12,
        "treisprezece": 13, "paisprezece": 14, "cincisprezece": 15,
    ]

    private static let rules: [(CookCommand, String)] = [
        (.stop, " (nu mai asculta|opreste ascultarea|gata cu vocea|stop ascultare) "),
        (.pause, " (opreste|pauza|stop) (timerul|cronometrul|alarma)? ?"),
        (.timer, " (porneste|start|da drumul la|pune) (timerul|cronometrul|alarma|minutarul)? ?|^ (timerul|timer|cronometrul|minutarul) $| continua (timerul|cronometrul|minutarul) "),
        (.ingredients, " (ingredientele|ingrediente|ce ingrediente|ce imi trebuie) "),
        (.repeatStep, " (repeta|din nou|inca o data|ce ai zis|citeste) "),
        (.prev, " (inapoi|anterior|pasul anterior|precedent) "),
        (.next, " (urmatorul|urmatoru|urmatorul pas|pasul urmator|urmatoarea|mai departe|inainte|continua|continuam|hai mai departe|next|am terminat|gata) "),
    ]

    /// Lowercase, no diacritics, only letters, digits and single spaces.
    nonisolated static func plain(_ s: String) -> String {
        let folded = s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ro")).lowercased()
        let kept = folded.unicodeScalars.map { c -> Character in (97...122).contains(c.value) || (48...57).contains(c.value) ? Character(c) : " " }
        return String(kept).split(separator: " ").joined(separator: " ")
    }

    /// The command in a phrase, or nil. The last command said wins ("nu, înapoi").
    nonisolated static func parse(_ said: String) -> CookCommand? {
        let t = " \(plain(said)) "
        let ns = t as NSString
        if let re = try? NSRegularExpression(pattern: " pasul (?:al )?(\\d+|[a-z]+) "),
           let m = re.firstMatch(in: t, range: NSRange(location: 0, length: ns.length)) {
            let w = ns.substring(with: m.range(at: 1))
            if let n = Int(w) ?? numbers[w], n > 0 { return .step(n) }
        }
        var best: (CookCommand, Int)?
        for (kind, pattern) in rules {
            guard let re = try? NSRegularExpression(pattern: pattern) else { continue }
            for m in re.matches(in: t, range: NSRange(location: 0, length: ns.length)) where m.range.length > 0 {
                if best == nil || m.range.location > best!.1 { best = (kind, m.range.location) }
            }
        }
        return best?.0
    }

    /// "10 minute", "1 minut și 30 de secunde", "45 de secunde": a timer as it is said aloud.
    nonisolated static func spokenDuration(_ sec: Int) -> String {
        func n(_ k: Int, _ one: String, _ many: String) -> String {
            k == 1 ? "1 \(one)" : "\(k)\(k % 100 >= 20 || k % 100 == 0 ? " de" : "") \(many)"
        }
        let h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60
        let parts = [h > 0 ? n(h, "oră", "ore") : nil, m > 0 ? n(m, "minut", "minute") : nil, s > 0 ? n(s, "secundă", "secunde") : nil]
        let said = parts.compactMap { $0 }.joined(separator: " și ")
        return said.isEmpty ? "0 secunde" : said
    }
}

/// Reads aloud with the phone's Romanian voice, and listens for commands between sentences.
@MainActor @Observable
final class HandsFree: NSObject, AVSpeechSynthesizerDelegate {
    private(set) var on = false
    private(set) var listening = false
    private(set) var heard = ""
    private(set) var error: String?

    @ObservationIgnored var onCommand: ((CookCommand) -> Void)?
    @ObservationIgnored private let dictation = Dictation()
    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    @ObservationIgnored private var speakingUntil = Date.distantPast
    @ObservationIgnored private var used = 0
    @ObservationIgnored private var pending: Task<Void, Never>?
    @ObservationIgnored private var loop: Task<Void, Never>?

    override init() {
        super.init()
        synth.delegate = self
    }

    private var speaking: Bool { Date() < speakingUntil }

    func start() {
        guard !on else { return }
        on = true
        error = nil
        heard = ""
        loop = Task { [weak self] in await self?.run() }
    }

    func stop() {
        on = false
        listening = false
        loop?.cancel()
        pending?.cancel()
        dictation.stop()
        synth.stopSpeaking(at: .immediate)
    }

    /// A newer sentence cuts the one being read.
    func say(_ text: String) {
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "ro-RO")
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        speakingUntil = Date().addingTimeInterval(120)
        synth.speak(u)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        // The microphone still hears the end of our own voice for a moment.
        Task { @MainActor in if !self.synth.isSpeaking { self.speakingUntil = Date().addingTimeInterval(0.6) } }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in if !self.synth.isSpeaking { self.speakingUntil = Date().addingTimeInterval(0.3) } }
    }

    /// Listens again each time recognition ends (it stops after a pause or a few minutes); three
    /// failures in a row and it gives up until the mic is tapped again.
    private func run() async {
        var failures = 0
        while on, !Task.isCancelled {
            used = 0
            await dictation.start(mode: .default) { [weak self] phrases, partial in
                self?.heard(phrases, partial)
            }
            if let message = dictation.error, !dictation.busy {
                failures += 1
                if failures >= 3 { error = message; listening = false; on = false; return }
            } else {
                listening = true
            }
            while dictation.busy, on, !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(300))
            }
            if dictation.error == nil { failures = 0 }
            try? await Task.sleep(for: .milliseconds(300))
        }
        listening = false
    }

    private func heard(_ phrases: [String], _ partial: String) {
        guard on else { return }
        let words = (phrases + [partial]).joined(separator: " ").split(separator: " ").map(String.init)
        // While the phone speaks, it hears itself: skip those words.
        if speaking || words.count < used { used = words.count; return }
        let tail = words[used...].joined(separator: " ")
        guard !tail.isEmpty else { return }
        heard = tail
        guard let command = CookCommand.parse(tail) else { return }
        pending?.cancel()
        if command.isQuick {
            fire(command, at: words.count)
        } else {
            // "pornește…" may still become "pornește timerul": wait for the pause.
            let count = words.count
            pending = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(800))
                guard !Task.isCancelled else { return }
                self?.fire(command, at: count)
            }
        }
    }

    private func fire(_ command: CookCommand, at count: Int) {
        used = count
        onCommand?(command)
    }
}
