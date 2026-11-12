import AVKit
import MediaPlayer
import SwiftUI

/// The player as a full page, like the web's StoryPlayer: ⌄ to close (or drag down), "Din
/// <folder>" on top, the cover, the title with the heart, a thin timeline, the big white play
/// button, and Viteză, După N povești, La rând / Amestecat and AirPlay at the bottom. When the
/// chosen number of stories has played, "Noapte bună".
struct PlayerView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @AppStorage("kt-player-remaining") private var showsRemaining = true
    @State private var scrubbing: Double?
    @State private var drag: CGFloat = 0

    var body: some View {
        if let story = player.current {
            Group {
                if player.ended { goodnight } else { page(story) }
            }
            .foregroundStyle(Theme.text)
            .background { PlayerBackdrop(story: story) }
            .offset(y: drag)
            .environment(\.colorScheme, .dark)
            .alert("Nu se poate reda", isPresented: .constant(player.failure != nil)) {
                Button("OK") { player.close() }
            } message: {
                Text(player.failure ?? "")
            }
        }
    }

    private func page(_ story: Story) -> some View {
        GeometryReader { geo in
            let side = min(geo.size.width - 48, 340, geo.size.height * 0.4)
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    header(story)
                    Spacer(minLength: 12)
                    StoryCover(story: story, cornerRadius: 16)
                        .frame(width: side, height: side)
                        .shadow(color: .black.opacity(0.55), radius: 27, y: 26)
                    Spacer(minLength: 12)
                }
                .contentShape(Rectangle())
                .gesture(closeDrag)
                VStack(spacing: 14) {
                    titleRow(story)
                    timeline
                    controls
                }
                Spacer(minLength: 16)
                options
                    .padding(.bottom, 8)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: Closing

    /// Drag the top of the page down to close it, like a sheet.
    private var closeDrag: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { drag = max(0, $0.translation.height) }
            .onEnded { v in
                if v.translation.height > 140 || v.predictedEndTranslation.height > 320 {
                    player.showsPlayer = false
                } else {
                    withAnimation(.spring(duration: 0.3)) { drag = 0 }
                }
            }
    }

    private func header(_ story: Story) -> some View {
        HStack(spacing: 8) {
            Button { Haptics.tap(); player.showsPlayer = false } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.black.opacity(0.18)))
            }
            .accessibilityLabel("Înapoi la \(StoryLibrary.folderOf(story))")
            VStack(spacing: 1) {
                Text("Din \(StoryLibrary.folderOf(story))".uppercased())
                    .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                    .tracking(1.1)
                    .opacity(0.72)
                Text(story.title)
                    .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
            // A child only listens: no deleting or moving from the player in kid mode.
            if kid.active {
                Color.clear.frame(width: 40, height: 40)
            } else {
                StoryMoreMenu(story: story)
            }
        }
        .padding(.top, 8)
    }

    // MARK: Title, timeline, controls

    private func titleRow(_ story: Story) -> some View {
        let s = store.story(story.id) ?? story
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.title)
                    .font(.custom(AppFont.storyDisplay, size: 30, relativeTo: .title))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text(Self.subtitle(s))
                    .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                    .foregroundStyle(Theme.text.opacity(0.72))
            }
            Spacer()
            HeartButton(story: s, locked: kid.active)
        }
    }

    /// "Povești Disney · vocea noastră" (where it came from; "fișier audio" says nothing to the family).
    static func subtitle(_ s: Story) -> String {
        let source: String? = switch s.source {
        case .recording: "vocea noastră"
        case .generated: "poveste nouă"
        case .upload: nil
        }
        return [StoryLibrary.folderOf(s), source].compactMap { $0 }.joined(separator: " · ")
    }

    private var timeline: some View {
        let shown = scrubbing ?? player.position
        let total = player.duration
        return VStack(spacing: 4) {
            SeekBar(value: shown, total: total) { scrubbing = $0 } onCommit: { target in
                player.seek(to: target)
                scrubbing = nil
            }
            HStack {
                Text(clockTime(shown))
                Spacer()
                Button { showsRemaining.toggle() } label: {
                    Text(player.isLoading ? "…" : showsRemaining ? "-\(clockTime(max(0, total - shown)))" : clockTime(total))
                }
                .buttonStyle(.plain)
                .disabled(total == 0)
                .accessibilityLabel(showsRemaining ? "Arată durata totală" : "Arată timpul rămas")
            }
            .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .caption).monospacedDigit())
            .foregroundStyle(Theme.text.opacity(0.7))
        }
    }

    private var controls: some View {
        let atStart = player.position <= 5
        let hasPrev = !atStart || (player.queue.firstIndex { $0.id == player.current?.id } ?? 0) > 0
        return HStack {
            control("backward.end.fill", size: 20, frame: 44, label: atStart ? "Povestea anterioară" : "De la începutul poveștii") {
                Task { await player.previous() }
            }
            .disabled(!hasPrev)
            .opacity(hasPrev ? 1 : 0.3)
            Spacer()
            control("gobackward.15", size: 30, frame: 60, label: "Înapoi 15 secunde") { player.skip(-15) }
            Spacer()
            Button { Haptics.tap(); player.togglePlay() } label: {
                ZStack {
                    Circle().fill(.white).shadow(color: .black.opacity(0.35), radius: 13, y: 10)
                    if player.isLoading {
                        ProgressView().tint(Theme.Night.ink)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(Theme.Night.ink)
                            .offset(x: player.isPlaying ? 0 : 2)
                            .contentTransition(.symbolEffect(.replace))
                    }
                }
                .frame(width: 84, height: 84)
            }
            .accessibilityLabel(player.isPlaying ? "Pauză" : "Pornește")
            Spacer()
            control("goforward.15", size: 30, frame: 60, label: "Înainte 15 secunde") { player.skip(15) }
            Spacer()
            control("forward.end.fill", size: 20, frame: 44, label: player.following.map { "Povestea următoare: \($0.title)" } ?? "Povestea următoare") {
                Task { await player.next() }
            }
            .disabled(!player.hasNext)
            .opacity(player.hasNext ? 1 : 0.3)
        }
        .foregroundStyle(.white)
    }

    private func control(_ symbol: String, size: CGFloat, frame: CGFloat, label: String, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); action() } label: {
            Image(systemName: symbol).font(.system(size: size, weight: .semibold)).frame(width: frame, height: frame)
        }
        .accessibilityLabel(label)
    }

    // MARK: Options

    /// Round buttons with a caption: tap Viteză or "După" to cycle, the third to shuffle.
    private var options: some View {
        let n = player.stopAfter
        return HStack(alignment: .top, spacing: 0) {
            Button { Haptics.select(); player.cycleRate() } label: {
                OptionLabel(text: Self.rateLabel(player.rate), caption: "Viteză")
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Viteză \(Self.rateLabel(player.rate)). Atinge ca să schimbi.")
            Button { Haptics.select(); player.stopAfter = StoryPlayer.cycled(n) } label: {
                OptionLabel(symbol: "moon", caption: n == 1 ? "După 1 poveste" : "După \(n) povești")
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Oprește după \(n == 1 ? "o poveste" : "\(n) povești"). Atinge ca să schimbi.")
            Button { Haptics.select(); player.shuffle.toggle() } label: {
                OptionLabel(symbol: "shuffle", caption: player.shuffle ? "Amestecat" : "La rând", active: player.shuffle)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel(player.shuffle ? "Amestecat. Atinge pentru una după alta." : "Una după alta. Atinge ca să amesteci.")
            VStack(spacing: 6) {
                AirPlayButton()
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(.white.opacity(0.12)))
                Text("AirPlay")
                    .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                    .foregroundStyle(Theme.text.opacity(0.85))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    static func rateLabel(_ rate: Float) -> String {
        rate == 1 ? "1×" : "\(rate.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "ro"))))×"
    }

    // MARK: Goodnight

    /// The player stopped by itself: a moon, "Noapte bună, Ana", back to the stories or again.
    private var goodnight: some View {
        let name = profile.settings.childName
        return VStack(spacing: 18) {
            Spacer()
            Image(systemName: "moon.fill")
                .font(.system(size: 92))
                .foregroundStyle(Theme.Night.moon)
                .frame(width: 120, height: 120)
                .accessibilityHidden(true)
            Text(name.isEmpty ? "Noapte bună" : "Noapte bună, \(name)")
                .font(.custom(AppFont.storyDisplay, size: 34, relativeTo: .largeTitle))
                .multilineTextAlignment(.center)
            Text("Povestea s-a terminat.\nNe auzim data viitoare.")
                .font(.ktBody)
                .foregroundStyle(Theme.Night.muted)
                .multilineTextAlignment(.center)
            VStack(spacing: 12) {
                Button("Înapoi la povești") { player.showsPlayer = false }
                    .font(.ktBodyEmphasis)
                    .padding(.horizontal, 22).frame(height: 44)
                    .background(Capsule().fill(.white.opacity(0.12)))
                Button("Ascultă din nou") { player.restart() }
                    .font(.ktBodyEmphasis)
                    .foregroundStyle(Theme.accent)
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .gesture(closeDrag)
    }
}

/// The cover, blurred and darkened, behind the whole page.
private struct PlayerBackdrop: View {
    let story: Story

    var body: some View {
        let scene = CoverScene.of(story)
        ZStack {
            Theme.Night.ink
            LinearGradient(colors: [Color(hex: scene.top), Color(hex: scene.bottom)], startPoint: .top, endPoint: .bottom)
                .opacity(0.7)
            StoryCover(story: story, cornerRadius: 0)
                .scaledToFill()
                .scaleEffect(1.6)
                .blur(radius: 70)
                .opacity(0.75)
            LinearGradient(colors: [.black.opacity(0.25), .black.opacity(0.1), .black.opacity(0.55)], startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// The pink heart, without a circle. In kid mode it only shows.
private struct HeartButton: View {
    let story: Story
    let locked: Bool
    @Environment(StoryStore.self) private var store

    var body: some View {
        let on = story.favorite
        Button {
            Haptics.tap()
            Task { await store.toggleFavorite(story.id) }
        } label: {
            Image(systemName: on ? "heart.fill" : "heart")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(on ? Color(hex: 0xFF8FA3) : Theme.text)
                .frame(width: 44, height: 44)
                .contentTransition(.symbolEffect(.replace))
        }
        .disabled(locked)
        .opacity(locked && !on ? 0 : 1)
        .accessibilityLabel(on ? "Scoate din favorite" : "Pune la favorite")
    }
}

/// A thin white timeline (5 pt) with a 16 pt knob; drag anywhere on it.
private struct SeekBar: View {
    let value: Double
    let total: Double
    let onChange: (Double) -> Void
    let onCommit: (Double) -> Void

    init(value: Double, total: Double, _ onChange: @escaping (Double) -> Void, onCommit: @escaping (Double) -> Void) {
        self.value = value; self.total = total; self.onChange = onChange; self.onCommit = onCommit
    }

    var body: some View {
        GeometryReader { g in
            let w = max(1, g.size.width - 16)
            let p = total > 0 ? min(1, max(0, value / total)) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25)).frame(height: 5).padding(.horizontal, 8)
                Capsule().fill(.white).frame(width: 8 + w * p, height: 5)
                Circle().fill(.white).frame(width: 16, height: 16).offset(x: w * p)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in onChange(target(v.location.x, w)) }
                .onEnded { v in onCommit(target(v.location.x, w)) })
        }
        .frame(height: 28)
        .disabled(total == 0)
        .accessibilityElement()
        .accessibilityLabel("Unde suntem în poveste")
        .accessibilityValue("\(clockTime(value)) din \(clockTime(total))")
        .accessibilityAdjustableAction { dir in
            onCommit(value + (dir == .increment ? 15 : -15))
        }
    }

    private func target(_ x: CGFloat, _ w: CGFloat) -> Double {
        Double(min(1, max(0, (x - 8) / w))) * total
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
                if let symbol { Image(systemName: symbol).font(.system(size: 18, weight: .semibold)) }
                else if let text { Text(text).font(.custom(AppFont.bodyBold, size: 14, relativeTo: .footnote)) }
            }
            .foregroundStyle(active ? Theme.Night.ink : Theme.text)
            .frame(width: 46, height: 46)
            .background(Circle().fill(active ? Theme.accent : .white.opacity(0.12)))
            Text(caption)
                .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                .foregroundStyle(active ? Theme.accent : Theme.text.opacity(0.85))
                .multilineTextAlignment(.center).lineLimit(2)
        }
    }
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
