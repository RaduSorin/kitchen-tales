import AVFoundation
import SwiftUI

/// Records the parent reading a book: AAC in an .m4a file, with the sound level for the wave.
/// Keeps recording with the screen off (iOS shows the red recording pill).
@MainActor @Observable
final class StoryRecorder {
    enum State: Equatable { case idle, recording, paused, denied, failed }

    private(set) var state: State = .idle
    private(set) var elapsed: Double = 0
    /// The last levels, 0...1, newest last.
    private(set) var levels: [Double] = Array(repeating: 0.05, count: 44)

    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private var timer: Timer?
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("recording-\(UUID().uuidString).m4a")

    var hasAudio: Bool { elapsed >= 1 }

    func start() async {
        guard await AVAudioApplication.requestRecordPermission() else { state = .denied; return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 64_000, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: file, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record() else { state = .failed; return }
            self.recorder = recorder
            state = .recording
            startTimer()
        } catch {
            state = .failed
        }
    }

    func togglePause() {
        guard let recorder else { return }
        if state == .recording {
            recorder.pause()
            state = .paused
        } else if state == .paused {
            recorder.record()
            state = .recording
        }
        Haptics.tap()
    }

    /// Stops and returns the file (nil when nothing was said).
    func finish() -> URL? {
        guard let recorder else { return nil }
        elapsed = recorder.currentTime > 0 ? recorder.currentTime : elapsed
        recorder.stop()
        stopTimer()
        state = .idle
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio, options: [])
        return hasAudio ? file : nil
    }

    func discard() {
        recorder?.stop()
        recorder = nil
        stopTimer()
        try? FileManager.default.removeItem(at: file)
        state = .idle
    }

    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        guard let recorder, state == .recording else { return }
        recorder.updateMeters()
        elapsed = recorder.currentTime
        // -50 dB (quiet room) ... 0 dB (loud), eased so speech fills the wave.
        let db = Double(recorder.averagePower(forChannel: 0))
        let level = max(0.04, min(1, pow(10, db / 40)))
        levels.removeFirst()
        levels.append(level)
    }
}

struct RecordStoryView: View {
    let onClose: () -> Void
    let onReady: (URL, Double) -> Void
    @State private var recorder = StoryRecorder()
    @State private var confirmLeave = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Ia cartea și citește cu glas tare")
                    .font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .largeTitle))
                Text("Ține telefonul aproape, pe masă sau în mână.")
                    .font(.ktCallout).foregroundStyle(Theme.Night.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            Spacer()
            Wave(levels: recorder.levels, active: recorder.state == .recording)
                .frame(height: 120)
                .padding(.horizontal, 24)
            VStack(spacing: 8) {
                Text(clockTime(recorder.elapsed))
                    .font(.system(size: 64, weight: .light).monospacedDigit())
                Text(status).font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.Night.muted)
            }
            .padding(.top, 28)
            Spacer()
            controls
                .padding(.bottom, 30)
        }
        .foregroundStyle(Theme.text)
        .background {
            ZStack {
                Theme.Night.gradient
                RadialGradient(colors: [Color(hex: 0xFF6E6E).opacity(recorder.state == .recording ? 0.22 : 0.08), .clear],
                               center: UnitPoint(x: 0.5, y: 0.45), startRadius: 10, endRadius: 320)
            }
            .ignoresSafeArea()
        }
        .animation(.easeInOut(duration: 0.4), value: recorder.state)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CloseButton { if recorder.hasAudio { confirmLeave = true } else { recorder.discard(); onClose() } }
            }
        }
        .confirmationDialog("Pleci fără să salvezi?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Pleacă și renunță", role: .destructive) { recorder.discard(); onClose() }
            Button("Rămân să o salvez", role: .cancel) {}
        } message: {
            Text("Înregistrarea ta nu e salvată încă. Dacă pleci acum, se pierde.")
        }
        .interactiveDismissDisabled(recorder.hasAudio)
    }

    private var status: String {
        switch recorder.state {
        case .idle: recorder.hasAudio ? "Gata" : "Apasă butonul roșu și începe să citești"
        case .recording: "Se înregistrează"
        case .paused: "Pauză"
        case .denied: "Aplicația nu are voie la microfon. Dă-i voie din Configurări."
        case .failed: "Înregistrarea nu a pornit. Încearcă din nou."
        }
    }

    private var controls: some View {
        let started = recorder.state == .recording || recorder.state == .paused
        return HStack(spacing: 40) {
            RoundControl(symbol: recorder.state == .paused ? "play.fill" : "pause.fill", caption: recorder.state == .paused ? "Reia" : "Pauză") {
                recorder.togglePause()
            }
            .opacity(started ? 1 : 0)
            .disabled(!started)
            Button {
                if started { save() } else { Task { await recorder.start() } }
                Haptics.tap()
            } label: {
                ZStack {
                    Circle().strokeBorder(.white, lineWidth: 4)
                    RoundedRectangle(cornerRadius: started ? 8 : 30, style: .continuous)
                        .fill(Color(hex: 0xFF5A5A))
                        .frame(width: started ? 32 : 60, height: started ? 32 : 60)
                }
                .frame(width: 84, height: 84)
                .animation(.snappy, value: started)
            }
            .accessibilityLabel(started ? "Oprește și salvează" : "Înregistrează")
            RoundControl(symbol: "checkmark", caption: "Gata", tint: Theme.accent) { save() }
                .opacity(started && recorder.hasAudio ? 1 : 0)
                .disabled(!(started && recorder.hasAudio))
        }
    }

    private func save() {
        let seconds = recorder.elapsed
        guard let file = recorder.finish() else { return }
        Haptics.success()
        onReady(file, seconds)
    }
}

private struct RoundControl: View {
    let symbol: String
    let caption: String
    var tint: Color = Theme.text
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(.white.opacity(0.12)))
                Text(caption).font(.ktCaption).foregroundStyle(Theme.Night.muted)
            }
        }
        .buttonStyle(.plain)
    }
}

/// The sound wave: one bar per level, the newest on the right.
private struct Wave: View {
    let levels: [Double]
    let active: Bool

    var body: some View {
        GeometryReader { geo in
            let count = CGFloat(levels.count)
            let gap = (geo.size.width - count * 5) / max(1, count - 1)
            HStack(alignment: .center, spacing: gap) {
                ForEach(levels.indices, id: \.self) { i in
                    Capsule()
                        .fill(Color.white.opacity(active ? 0.9 : 0.4))
                        .frame(width: 5, height: max(6, geo.size.height * CGFloat(levels[i])))
                }
            }
            .frame(maxHeight: .infinity)
            .animation(.linear(duration: 0.08), value: levels)
        }
        .accessibilityHidden(true)
    }
}
