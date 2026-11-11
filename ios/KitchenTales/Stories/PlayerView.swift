import AVKit
import MediaPlayer
import SwiftUI

/// The player as a full-screen sheet you drag down: the cover, the title with the heart, the
/// timeline, the big controls, the real volume, and Viteză, Somn, AirPlay and La rând.
struct PlayerView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @State private var scrubbing: Double?
    @State private var showsQueue = false

    var body: some View {
        if let story = player.current {
            let scene = CoverScene.of(story)
            GeometryReader { geo in
                let side = min(geo.size.width - 48, geo.size.height * 0.42)
                VStack(spacing: 0) {
                    Spacer(minLength: 20)
                    StoryCover(story: story, cornerRadius: 14)
                        .frame(width: side, height: side)
                        .shadow(color: .black.opacity(0.45), radius: 24, y: 12)
                        .scaleEffect(player.isPlaying ? 1 : 0.9)
                        .animation(.spring(duration: 0.4, bounce: 0.3), value: player.isPlaying)
                    Spacer(minLength: 20)
                    VStack(spacing: 20) {
                        titleRow(story)
                        timeline
                        controls
                        VolumeSlider().frame(height: 34)
                        options
                    }
                    .padding(.horizontal, 28)
                    .padding(.bottom, 12)
                }
                .frame(maxWidth: .infinity)
            }
            .overlay(alignment: .topTrailing) {
                // A child only listens: no deleting or moving from the player in kid mode.
                if !kid.active {
                    StoryMoreMenu(story: story).padding(.top, 14).padding(.trailing, 20)
                }
            }
            .foregroundStyle(Theme.text)
            .background {
                ZStack {
                    LinearGradient(colors: [Color(hex: scene.top), Color(hex: scene.bottom), Theme.Night.ink],
                                   startPoint: .top, endPoint: .bottom)
                    Color.black.opacity(0.35)
                }
                .ignoresSafeArea()
            }
            .environment(\.colorScheme, .dark)
            .sheet(isPresented: $showsQueue) {
                QueueView().presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
            }
            .alert("Nu se poate reda", isPresented: .constant(player.failure != nil && !showsQueue)) {
                Button("OK") { player.close() }
            } message: {
                Text(player.failure ?? "")
            }
        }
    }

    private func titleRow(_ story: Story) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(story.title)
                    .font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .title))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(StoryLibrary.folderOf(story))
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text.opacity(0.7))
            }
            Spacer()
            FavoriteButton(story: story, size: 44)
        }
    }

    private var timeline: some View {
        let shown = scrubbing ?? player.position
        let total = max(player.duration, 1)
        return VStack(spacing: 6) {
            Slider(value: Binding(get: { min(shown, total) }, set: { scrubbing = $0 }), in: 0...total) { editing in
                if !editing, let target = scrubbing {
                    player.seek(to: target)
                    scrubbing = nil
                }
            }
            .tint(Theme.text)
            .disabled(player.duration == 0)
            .accessibilityLabel("Poziția în poveste")
            .accessibilityValue("\(clockTime(shown)) din \(clockTime(player.duration))")
            HStack {
                Text(clockTime(shown))
                Spacer()
                Text(player.isLoading ? "…" : "-\(clockTime(max(0, player.duration - shown)))")
            }
            .font(.ktCaption.monospacedDigit())
            .foregroundStyle(Theme.text.opacity(0.65))
        }
    }

    private var controls: some View {
        HStack {
            control("backward.end.fill", size: 22, label: "Povestea de dinainte") { Task { await player.previous() } }
            Spacer()
            control("gobackward.15", size: 28, label: "Înapoi 15 secunde") { player.skip(-15) }
            Spacer()
            Button { Haptics.tap(); player.togglePlay() } label: {
                ZStack {
                    Circle().fill(Theme.text)
                    if player.isLoading {
                        ProgressView().tint(Theme.Night.ink)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 30, weight: .bold))
                            .foregroundStyle(Theme.Night.ink)
                            .contentTransition(.symbolEffect(.replace))
                    }
                }
                .frame(width: 76, height: 76)
            }
            .accessibilityLabel(player.isPlaying ? "Pauză" : "Redă")
            Spacer()
            control("goforward.15", size: 28, label: "Înainte 15 secunde") { player.skip(15) }
            Spacer()
            control("forward.end.fill", size: 22, label: "Povestea următoare") { Task { await player.next() } }
                .disabled(!player.hasNext)
                .opacity(player.hasNext ? 1 : 0.35)
        }
    }

    private func control(_ symbol: String, size: CGFloat, label: String, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); action() } label: {
            Image(systemName: symbol).font(.system(size: size, weight: .semibold)).frame(width: 44, height: 44)
        }
        .accessibilityLabel(label)
    }

    /// Four equal columns, so the buttons line up whatever their captions.
    private var options: some View {
        @Bindable var player = player
        return HStack(alignment: .top, spacing: 0) {
            Menu {
                Picker("Viteză", selection: $player.rate) {
                    ForEach([Float(0.75), 1, 1.25, 1.5], id: \.self) { Text(Self.rateLabel($0)).tag($0) }
                }
            } label: {
                OptionLabel(text: Self.rateLabel(player.rate), caption: "Viteză")
            }
            .frame(maxWidth: .infinity)
            Menu {
                Picker("Somn", selection: $player.sleep) {
                    ForEach(StoryPlayer.Sleep.allCases, id: \.self) { Text($0.label).tag($0) }
                }
            } label: {
                OptionLabel(symbol: player.sleep == .off ? "moon" : "moon.fill",
                            caption: player.sleep == .off ? "Somn" : player.sleep.label,
                            active: player.sleep != .off)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: 6) {
                AirPlayButton()
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.white.opacity(0.12)))
                Text("AirPlay")
                    .font(.ktCaption)
                    .foregroundStyle(Theme.text.opacity(0.75))
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity)
            Button { showsQueue = true } label: {
                OptionLabel(symbol: "list.bullet", caption: "La rând")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    static func rateLabel(_ rate: Float) -> String {
        rate == 1 ? "1×" : "\(rate.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "ro"))))×"
    }
}

private struct OptionLabel: View {
    var symbol: String?
    var text: String?
    let caption: String
    var active = false

    var body: some View {
        VStack(spacing: 6) {
            Group {
                if let symbol { Image(systemName: symbol).font(.system(size: 17, weight: .semibold)) }
                else if let text { Text(text).font(.custom(AppFont.bodyBold, size: 14, relativeTo: .footnote)) }
            }
            .foregroundStyle(active ? Theme.Night.ink : Theme.text)
            .frame(width: 44, height: 44)
            .background(Circle().fill(active ? Theme.Night.moon : .white.opacity(0.12)))
            Text(caption).font(.ktCaption).foregroundStyle(Theme.text.opacity(0.75))
                .multilineTextAlignment(.center).lineLimit(2)
        }
    }
}

/// What plays next, from the folder the story was started in.
private struct QueueView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        NavigationStack {
            List(player.queue) { story in
                Button { Task { await player.play(story, queue: player.queue, store: store) } } label: {
                    HStack(spacing: 12) {
                        StoryCover(story: story, cornerRadius: 8).frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(story.title).font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                            if let m = story.minutesLabel { Text(m).font(.ktFootnote).foregroundStyle(Theme.Night.muted) }
                        }
                        Spacer()
                        if player.current?.id == story.id {
                            Image(systemName: "speaker.wave.2.fill").foregroundStyle(Theme.Night.moon)
                        }
                    }
                }
                .listRowBackground(Color.white.opacity(0.05))
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Night.ink.ignoresSafeArea())
            .navigationTitle("La rând")
            .navigationBarTitleDisplayMode(.inline)
        }
        .environment(\.colorScheme, .dark)
    }
}

/// The system volume slider (the real volume, also the hardware buttons), only on a device.
private struct VolumeSlider: UIViewRepresentable {
    func makeUIView(context: Context) -> MPVolumeView {
        let view = MPVolumeView(frame: .zero)
        view.tintColor = .white
        return view
    }
    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

/// The system AirPlay picker (speaker, TV, headphones).
private struct AirPlayButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = .white
        view.activeTintColor = UIColor(Theme.Night.moon)
        view.prioritizesVideoDevices = false
        return view
    }
    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
