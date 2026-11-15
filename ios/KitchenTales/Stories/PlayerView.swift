import AVKit
import MediaPlayer
import SwiftUI

/// The player as a full page, redesign "Seară de lux, curățat": ⌄ to close (or drag down), "Din
/// <folder>" on top, the cover, the title with the gold heart, a thin gold timeline, the gold play
/// button, then Viteză, După N, Text, AirPlay and Coadă as plain symbols (no circles), and what
/// plays next at the very bottom. When the chosen number of stories has played, "Noapte bună".
struct PlayerView: View {
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @AppStorage("kt-player-remaining") private var showsRemaining = true
    @State private var scrubbing: Double?
    @State private var drag: CGFloat = 0
    @State private var reading = false
    @State private var queueOpen = false

    var body: some View {
        if let story = player.current {
            Group {
                if player.ended { goodnight } else { page(story) }
            }
            .foregroundStyle(Theme.text)
            .background { PlayerBackdrop(story: story) }
            .offset(y: drag)
            .environment(\.colorScheme, .dark)
            .kidQueueChoice()
            .alert("Nu se poate reda", isPresented: .constant(player.failure != nil)) {
                Button("OK") { player.close() }
            } message: {
                Text(player.failure ?? "")
            }
        }
    }

    private func page(_ story: Story) -> some View {
        GeometryReader { geo in
            let side = min(geo.size.width - 72, 330, geo.size.height * 0.4)
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
                PlayerNextLine { queueOpen = true }
                    .padding(.top, 16)
                    .padding(.bottom, 6)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
        }
        .sheet(isPresented: $reading) { StoryTextSheet(story: story) }
        .sheet(isPresented: $queueOpen) { UpNextSheet() }
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
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Înapoi la \(StoryLibrary.folderOf(story))")
            VStack(spacing: 1) {
                Text("Din \(StoryLibrary.folderOf(story))".uppercased())
                    .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                    .tracking(1.3)
                    .foregroundStyle(Theme.Night.muted)
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
                    .font(.custom(AppFont.body, size: 15, relativeTo: .footnote))
                    .foregroundStyle(Theme.Night.muted)
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
        let hasPrev = player.hasPrevious
        return HStack {
            control("backward.end.fill", size: 18, frame: 44, label: atStart ? "Povestea anterioară" : "De la începutul poveștii") {
                Task { await player.previous() }
            }
            .disabled(!hasPrev)
            .opacity(hasPrev ? 0.6 : 0.2)
            Spacer()
            control("gobackward.15", size: 28, frame: 56, label: "Înapoi 15 secunde") { player.skip(-15) }
            Spacer()
            Button { Haptics.tap(); player.togglePlay() } label: {
                ZStack {
                    Circle().fill(Theme.Night.moon).shadow(color: Theme.Night.moon.opacity(0.25), radius: 16, y: 8)
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
                .frame(width: 76, height: 76)
            }
            .accessibilityLabel(player.isPlaying ? "Pauză" : "Pornește")
            Spacer()
            control("goforward.15", size: 28, frame: 56, label: "Înainte 15 secunde") { player.skip(15) }
            Spacer()
            control("forward.end.fill", size: 18, frame: 44, label: player.following.map { "Povestea următoare: \($0.title)" } ?? "Povestea următoare") {
                Task { await player.next() }
            }
            .disabled(!player.hasNext)
            .opacity(player.hasNext ? 0.6 : 0.2)
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

    /// Plain symbols with a word under them: tap Viteză or "După" to cycle, Text for the story's
    /// text, AirPlay, and Coadă for "Urmează" (where La rând / Amestecat now lives).
    private var options: some View {
        let n = player.stopAfter
        return HStack(alignment: .top, spacing: 0) {
            Button { Haptics.select(); player.cycleRate() } label: {
                OptionLabel(text: Self.rateLabel(player.rate), caption: "Viteză")
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Viteză \(Self.rateLabel(player.rate)). Atinge ca să schimbi.")
            Button { Haptics.select(); player.stopAfter = StoryPlayer.cycled(n) } label: {
                OptionLabel(symbol: "moon", caption: "După \(n)", active: true)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel(Self.stopLabel(n))
            Button { Haptics.tap(); reading = true } label: {
                OptionLabel(symbol: "text.bubble", caption: "Text")
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Textul poveștii")
            VStack(spacing: 6) {
                AirPlayButton()
                    .frame(width: 40, height: 30)
                Text("AirPlay")
                    .font(.custom(AppFont.bodySemibold, size: 11.5, relativeTo: .caption))
                    .foregroundStyle(Theme.text.opacity(0.85))
            }
            .frame(maxWidth: .infinity)
            Button { Haptics.tap(); queueOpen = true } label: {
                OptionLabel(symbol: "list.bullet", caption: player.shuffle ? "Amestecat" : "Coadă", active: player.shuffle)
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel(player.shuffle ? "Coada, amestecat" : "Coada")
        }
        .buttonStyle(.plain)
    }

    static func stopLabel(_ n: Int) -> String {
        let what = n == 1 ? "o poveste" : "\(n) povești"
        return "Oprește după \(what). Atinge ca să schimbi."
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
            if let waiting = player.queuedNext {
                // The moon stopped the evening before the end of "Urmează": the rest waits for next time.
                HStack(spacing: 10) {
                    StoryCover(story: waiting, cornerRadius: 6).frame(width: 34, height: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("RĂMÂNE ÎN COADĂ PENTRU DATA VIITOARE")
                            .font(.custom(AppFont.bodyBold, size: 10, relativeTo: .caption2))
                            .foregroundStyle(Theme.Night.muted)
                        Text(waiting.title).font(.ktCallout).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
            }
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

/// The gold heart, without a circle. In kid mode it only shows.
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
                .foregroundStyle(on ? Theme.Night.moon : Theme.text)
                .frame(width: 44, height: 44)
                .contentTransition(.symbolEffect(.replace))
        }
        .disabled(locked)
        .opacity(locked && !on ? 0 : 1)
        .accessibilityLabel(on ? "Scoate din favorite" : "Pune la favorite")
    }
}

/// A thin gold timeline (4 pt) with a 14 pt knob; drag anywhere on it.
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
                Capsule().fill(.white.opacity(0.2)).frame(height: 4).padding(.horizontal, 8)
                Capsule().fill(Theme.Night.moon).frame(width: 8 + w * p, height: 4)
                Circle().fill(Theme.Night.moon).frame(width: 14, height: 14).offset(x: w * p + 1)
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
                if let symbol { Image(systemName: symbol).font(.system(size: 20, weight: .medium)) }
                else if let text { Text(text).font(.custom(AppFont.bodyBold, size: 17, relativeTo: .body)) }
            }
            .frame(width: 40, height: 30)
            Text(caption)
                .font(.custom(AppFont.bodySemibold, size: 11.5, relativeTo: .caption))
                .multilineTextAlignment(.center).lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(active ? Theme.Night.moon : Theme.text.opacity(0.85))
        .contentShape(Rectangle())
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
