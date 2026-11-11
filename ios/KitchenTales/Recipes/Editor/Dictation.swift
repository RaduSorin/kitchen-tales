import AVFoundation
import Speech
import SwiftUI

/// Dictation in Romanian with iOS speech recognition, like the web's MicButton: tap to talk, tap
/// again to stop; the words go after what is already in the box, live, and can be corrected by
/// hand afterwards. The text comes as phrases (split where you pause) plus the phrase being said.
@MainActor @Observable
final class Dictation {
    enum State { case idle, starting, on, finishing }

    private(set) var state: State = .idle
    private(set) var seconds = 0
    private(set) var level: Double = 0
    private(set) var error: String?

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var clock: Task<Void, Never>?
    @ObservationIgnored private var onText: (([String], String) -> Void)?

    static let maxSeconds = 5 * 60

    var busy: Bool { state != .idle }

    func start(onText: @escaping (_ phrases: [String], _ partial: String) -> Void) async {
        guard state == .idle else { return }
        error = nil
        seconds = 0
        state = .starting
        self.onText = onText
        guard await Self.allowed() else {
            fail("Dă voie la microfon și la dictare din Configurări → Bucătăria.")
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ro-RO")), recognizer.isAvailable else {
            fail("Dictarea nu merge acum. Verifică internetul.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let engine = AVAudioEngine()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            try Self.listen(engine: engine, request: request) { [weak self] level in
                Task { @MainActor in self?.level = level }
            }
            engine.prepare()
            try engine.start()
            self.engine = engine
            self.request = request
            task = Self.recognize(recognizer, request) { [weak self] phrases, partial, final, failed in
                Task { @MainActor in self?.heard(phrases, partial, final: final, failed: failed) }
            }
            state = .on
            Haptics.tap()
            clock = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    guard let self, self.state == .on else { return }
                    self.seconds += 1
                    if self.seconds >= Self.maxSeconds { self.stop() }
                }
            }
        } catch {
            fail("Nu am putut porni microfonul.")
        }
    }

    func stop() {
        guard state == .on || state == .starting else { return }
        state = .finishing
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        // The last words arrive with the final result; if it never comes, finish anyway.
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            self?.finish()
        }
    }

    private func heard(_ phrases: [String], _ partial: String, final: Bool, failed: Bool) {
        if !phrases.isEmpty || !partial.isEmpty { onText?(phrases, partial) }
        if final || failed {
            if failed && phrases.isEmpty && partial.isEmpty && state == .on { error = "Nu am auzit nimic. Încearcă din nou." }
            finish()
        }
    }

    private func finish() {
        guard state != .idle else { return }
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        task?.cancel()
        clock?.cancel()
        engine = nil; request = nil; task = nil; onText = nil
        state = .idle
        level = 0
        // Back to playing stories.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func fail(_ message: String) {
        error = message
        Haptics.warning()
        finish()
        state = .idle
    }

    // MARK: Off the main actor (the audio and speech callbacks run on their own threads)

    private nonisolated static func allowed() async -> Bool {
        let speech = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    private nonisolated static func listen(engine: AVAudioEngine, request: SFSpeechAudioBufferRecognitionRequest,
                                           level: @escaping @Sendable (Double) -> Void) throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { throw BackendError.server("Nu e microfon.") }
        nonisolated(unsafe) let request = request
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
            guard let data = buffer.floatChannelData?[0] else { return }
            let n = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<n { sum += data[i] * data[i] }
            let rms = n > 0 ? sqrt(sum / Float(n)) : 0
            let db = 20 * log10(max(rms, 0.000_01))
            level(Double(min(1, max(0, (db + 50) / 50))))
        }
    }

    private nonisolated static func recognize(_ recognizer: SFSpeechRecognizer, _ request: SFSpeechAudioBufferRecognitionRequest,
                                              update: @escaping @Sendable ([String], String, Bool, Bool) -> Void) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            if let result {
                let (phrases, partial) = Self.phrases(result.bestTranscription.segments.map { (text: $0.substring, start: $0.timestamp, length: $0.duration) },
                                                      final: result.isFinal)
                update(phrases, partial, result.isFinal, false)
            } else if error != nil {
                update([], "", false, true)
            }
        }
    }

    /// Groups the words into phrases where the speaker paused (more than 0.6 s); while still
    /// listening, the last phrase is the one being said.
    nonisolated static func phrases(_ words: [(text: String, start: TimeInterval, length: TimeInterval)], final: Bool) -> ([String], String) {
        var groups: [[String]] = []
        var lastEnd: TimeInterval?
        for w in words {
            // Before the result settles, timestamps can be 0: one phrase then.
            if let end = lastEnd, w.start > 0, w.start - end > 0.6 { groups.append([]) }
            if groups.isEmpty { groups.append([]) }
            groups[groups.count - 1].append(w.text)
            lastEnd = w.start + w.length
        }
        var texts = groups.map { $0.joined(separator: " ") }.filter { !$0.isEmpty }
        if final || texts.isEmpty { return (texts, "") }
        let partial = texts.removeLast()
        return (texts, partial)
    }
}

/// The round mic in the corner of a text box (or a small tool under a step), with the time
/// while it listens and the hint or the error under the box.
struct MicButton: View {
    @Binding var text: String
    var label = "Dictează"
    var hint: String?
    /// Turns the phrases into lines (one ingredient per line); default: one running text.
    var asLines: (([String]) -> [String])?
    /// Called on the tap that starts listening, before any text arrives.
    var onStart: (() -> Void)?
    /// Called each time text came from the microphone.
    var onDictated: (() -> Void)?
    /// When set, the words go here instead of into `text` (for "Dictează un pas").
    var write: ((String) -> Void)?
    /// The session, when the box around shows its hint (MicField); otherwise the button's own.
    var shared: Dictation?
    @State private var own = Dictation()

    private var dictation: Dictation { shared ?? own }

    var body: some View {
        HStack(spacing: 8) {
            if dictation.state == .on {
                Text(Self.clock(dictation.seconds))
                    .font(.system(.footnote, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(Theme.danger)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Capsule().fill(Theme.surface))
            }
            Button(action: toggle) {
                ZStack {
                    Circle().fill(dictation.busy ? Theme.danger : Theme.accent.opacity(0.16))
                        .scaleEffect(dictation.state == .on ? 1 + dictation.level * 0.25 : 1)
                    switch dictation.state {
                    case .idle: Image(systemName: "mic").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.accent)
                    case .on: RoundedRectangle(cornerRadius: 3).fill(Theme.onAccent).frame(width: 12, height: 12)
                    default: ProgressView().tint(Theme.onAccent).controlSize(.small)
                    }
                }
                .frame(width: 36, height: 36)
                .animation(.easeOut(duration: 0.1), value: dictation.level)
            }
            .buttonStyle(.plain)
            .disabled(dictation.state == .starting || dictation.state == .finishing)
            .accessibilityLabel(dictation.busy ? "Oprește dictarea" : label)
        }
        .onDisappear { dictation.stop() }
    }

    private func toggle() {
        if dictation.busy { dictation.stop(); return }
        let base = text.trimmingCharacters(in: .whitespacesAndNewlines)
        onStart?()
        let lines = asLines
        Task {
            await dictation.start { phrases, partial in
                let said = lines.map { ($0(phrases) + [partial]).filter { !$0.isEmpty }.joined(separator: "\n") }
                    ?? (phrases + [partial]).filter { !$0.isEmpty }.joined(separator: " ")
                guard !said.isEmpty else { return }
                if let write { write(said) } else { text = base.isEmpty ? said : "\(base)\n\(said)" }
                onDictated?()
            }
        }
    }

    static func clock(_ s: Int) -> String { "\(s / 60):" + String(format: "%02d", s % 60) }
}

/// A text box with the mic in its bottom right corner, like the iPhone keyboard's, and the
/// mic's hint under it.
struct MicField: View {
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 120
    var hint: String?
    var asLines: (([String]) -> [String])?
    var onDictated: (() -> Void)?
    var focused: FocusState<Bool>.Binding?
    var gold = true
    @State private var dictation = Dictation()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .bottomTrailing) {
                editor
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .padding(.trailing, 36)
                    .frame(minHeight: minHeight, alignment: .topLeading)
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            Text(placeholder).font(.ktCallout).foregroundStyle(Theme.muted.opacity(0.8))
                                .padding(.horizontal, 15).padding(.vertical, 16).allowsHitTesting(false)
                        }
                    }
                MicButton(text: $text, hint: hint, asLines: asLines, onDictated: onDictated, shared: dictation)
                    .padding(8)
            }
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.25)))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(gold ? Theme.accent : Theme.border, lineWidth: gold ? 1.5 : 1))
            if let line = dictation.error ?? (dictation.state == .on ? hint : nil) {
                Text(line).font(.ktFootnote).foregroundStyle(dictation.error != nil ? Theme.danger : Theme.muted)
            }
        }
    }

    @ViewBuilder private var editor: some View {
        if let focused {
            TextEditor(text: $text).focused(focused)
        } else {
            TextEditor(text: $text)
        }
    }
}
