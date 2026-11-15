import SwiftUI
import UIKit

/// Celebrates the badges just earned, one at a time (design-polish/ios-medals/concept.jpg).
/// A stamp drops out of the Dynamic Island, then flies on an arc into its visa in the passport,
/// lands, gets its postmark and its name written by hand. A sticker pops onto a backing sheet;
/// held, it peels off, the album rises and it is dragged (with a magnet) into the place whose
/// outline glows. Shown over the whole app, never over the kid-mode lock screen.
struct BadgeCelebration: View {
    @Environment(BadgeStore.self) private var badges
    @Environment(KidMode.self) private var kid

    private var shown: Badge? {
        if LaunchOptions.demoAccount != nil {
            switch LaunchOptions.screen {
            case "badge-stamp": return BadgeCatalog.byId["c10"]
            case "badge-sticker": return BadgeCatalog.byId["k-cloud"]
            default: return nil
            }
        }
        return kid.locked ? nil : badges.pending.first
    }

    var body: some View {
        ZStack {
            if let b = shown {
                Group {
                    if b.kind == .stamp { StampMoment(badge: b) } else { StickerMoment(badge: b) }
                }
                .id(b.id)
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: shown?.id)
    }
}

// MARK: - Motion helpers

/// A flight along a curve, driven by time so it can bend: from a point to another, lifted by
/// `lift` at its middle, growing or shrinking on the way.
struct BadgeFlight: Equatable {
    var from: CGPoint
    var to: CGPoint
    var fromScale: CGFloat
    var toScale: CGFloat
    var lift: CGFloat
    var start: Date
    var duration: Double

    /// Where the badge is at a moment, and its size.
    func at(_ date: Date) -> (point: CGPoint, scale: CGFloat, t: CGFloat) {
        let raw = min(1, max(0, date.timeIntervalSince(start) / max(duration, 0.01)))
        let t = CGFloat(raw < 0.5 ? 2 * raw * raw : 1 - pow(-2 * raw + 2, 2) / 2)
        let c = CGPoint(x: (from.x + to.x) / 2, y: min(from.y, to.y) - lift)
        let a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t
        let p = CGPoint(x: a * from.x + b * c.x + d * to.x, y: a * from.y + b * c.y + d * to.y)
        return (p, fromScale + (toScale - fromScale) * t, t)
    }
}

/// The haptics of the earn moment.
@MainActor enum EarnHaptics {
    static func soft() { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
    static func land() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    /// The postmark: a heavy hit and a short rumble after it.
    static func slam() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        Task { @MainActor in
            for k in 0..<3 {
                try? await Task.sleep(for: .milliseconds(45))
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.5 - CGFloat(k) * 0.12)
            }
        }
    }
    static func peel() { UIImpactFeedbackGenerator(style: .medium).impactOccurred(intensity: 0.8) }
    static func magnet() { UISelectionFeedbackGenerator().selectionChanged() }
    static func stick() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

/// The dimmed, blurred app behind the moment.
private struct EarnBackdrop: View {
    let dim: Double

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            Color.black.opacity(dim)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// A light that sweeps once across a badge, as if it were tilted under a lamp.
private struct Sheen: View {
    let image: String
    let progress: CGFloat

    var body: some View {
        GeometryReader { geo in
            LinearGradient(colors: [.clear, .white.opacity(0.6), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: geo.size.width * 0.35)
                .rotationEffect(.degrees(18))
                .offset(x: -geo.size.width * 0.5 + progress * geo.size.width * 1.6)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
        }
        .mask(Image.badgeArt(image).resizable().scaledToFit())
        .blendMode(.plusLighter)
        .allowsHitTesting(false)
    }
}

/// The postmark alone, for the moment it is slammed onto a stamp: the golden part outside the
/// stamp, the dark part over it (the same drawing as BadgeArt).
private struct PostmarkInk: View {
    let badge: Badge
    let date: Date

    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 150
            var outside = ctx
            outside.clip(to: Path(CGRect(x: 0, y: 0, width: 120 * s, height: 124 * s)), options: .inverse)
            Postmark.draw(&outside, scale: s, tilt: badgeTilt(badge.id), date: date, color: Color(red: 242 / 255, green: 200 / 255, blue: 121 / 255).opacity(0.75), clip: false)
            Postmark.draw(&ctx, scale: s, tilt: badgeTilt(badge.id), date: date, color: Color(red: 42 / 255, green: 28 / 255, blue: 12 / 255).opacity(0.8), clip: true)
        }
        .aspectRatio(150 / 124, contentMode: .fit)
        .allowsHitTesting(false)
    }
}

// MARK: - Stamp

/// "Timbru nou": the stamp drops from the Dynamic Island, then goes into the passport.
private struct StampMoment: View {
    let badge: Badge
    @Environment(BadgeStore.self) private var badges
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Stage { case drop, shown, placing, flying, landed, done }
    @State private var stage: Stage = .drop
    @State private var home: CGRect = .zero
    @State private var target: CGRect = .zero
    @State private var flight: BadgeFlight?
    @State private var sheen: CGFloat = 0
    @State private var slam = false
    @State private var bounce = false

    private static let size: CGFloat = 200

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                EarnBackdrop(dim: 0.5)
                    .onTapGesture { if stage == .done { finish() } }
                card
                    .opacity(stage == .drop || stage == .shown ? 1 : 0)
                    .offset(y: stage == .drop || stage == .shown ? 0 : -40)
                    .frame(width: w, height: h)
                passportPanel(width: w, height: h)
                    .offset(y: stage == .drop || stage == .shown ? h : 0)
                floatingStamp(island: CGPoint(x: w / 2, y: max(22, geo.safeAreaInsets.top * 0.5)))
            }
            .coordinateSpace(.named(BadgeEarnSpace.name))
        }
        .ignoresSafeArea()
        .task { await intro() }
    }

    // The card in the middle: the place for the stamp, its name, what earned it, the buttons.
    private var card: some View {
        let next = badge.lvl.flatMap { lvl in BadgeCatalog.stamps.first { $0.art == badge.art && ($0.lvl ?? 0) > lvl } }
        return VStack(spacing: 10) {
            Text("TIMBRU NOU")
                .font(.custom(AppFont.bodyBold, size: 13, relativeTo: .caption)).tracking(2)
                .foregroundStyle(Color(hex: 0xF2C879))
            Color.clear
                .frame(width: Self.size, height: Self.size * 124 / 120)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(BadgeEarnSpace.name)) } action: { home = $0 }
            Text(badge.name)
                .font(.custom(AppFont.displaySemibold, size: 28, relativeTo: .title))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(Self.howText(badge, next: next))
                .font(.ktCallout).foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Pune în pașaport") { place() }
                .buttonStyle(.ktPrimaryWide)
                .padding(.top, 10)
            Button("Gata") { finish() }
                .font(.ktButton).foregroundStyle(.white.opacity(0.7))
                .frame(minHeight: 44)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: 420)
        .opacity(stage == .drop ? 0 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Timbru nou: \(badge.name)")
    }

    private static func howText(_ b: Badge, next: Badge?) -> String {
        guard let next else { return b.how }
        return b.how + " Următorul timbru: " + next.name + "."
    }

    private func passportPanel(width w: CGFloat, height h: CGFloat) -> some View {
        let visa = PassportVisa.all.first { $0.badges.contains(badge) }
        let number = PassportVisa.pageNumber(of: badge.id) ?? 2
        let pageW = min(w - 80, (h * 0.7 - 150) * 282 / 470, 360)
        let have = badges.count(BadgeCatalog.stamps) - (stage == .landed || stage == .done ? 0 : 1)
        let since = badges.state.since.flatMap(BadgeEngine.date) ?? Date()
        return VStack(spacing: 14) {
            Capsule().fill(.white.opacity(0.3)).frame(width: 40, height: 5).padding(.top, 10)
            VStack(spacing: 2) {
                Text("Pașaportul culinar")
                    .font(.custom(AppFont.displaySemibold, size: 20, relativeTo: .title3))
                    .foregroundStyle(Color(hex: 0xF4DFA2))
                Text("Vize: \(have) din \(BadgeCatalog.stamps.count)")
                    .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
                    .foregroundStyle(.white.opacity(0.7))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(have)))
            }
            if let visa {
                PassportVisaPage(visa: visa, number: number, ymd: PassportView.ymd(since),
                                 hiding: stage == .done ? nil : badge.id, landed: stage == .landed,
                                 target: { target = $0 }, onTap: { _ in })
                    .frame(width: pageW, height: pageW * 470 / 282)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .shadow(color: .black.opacity(0.4), radius: 10, y: 6)
                    .allowsHitTesting(false)
            }
            Button("Gata") { finish() }
                .buttonStyle(.ktPrimaryWide)
                .padding(.horizontal, 32)
                .opacity(stage == .done ? 1 : 0)
                .disabled(stage != .done)
            Spacer(minLength: 0)
        }
        .frame(width: w, height: h * 0.86)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                .fill(LinearGradient(colors: [PassportView.leather, Color(hex: 0x3A1019)], startPoint: .top, endPoint: .bottom))
                .shadow(color: .black.opacity(0.5), radius: 24, y: -6)
        )
        .frame(width: w, height: h, alignment: .bottom)
    }

    @ViewBuilder
    private func floatingStamp(island: CGPoint) -> some View {
        let earned = badges.earnedDate(badge) ?? Date()
        let tilt = Self.tilt(for: badge)
        let homePoint = CGPoint(x: home.midX, y: home.midY)
        if stage != .done {
            TimelineView(.animation(minimumInterval: nil, paused: flight == nil)) { tl in
                let place = position(at: tl.date, island: island, home: homePoint)
                let s = place.scale * (bounce ? 1.1 : 1)
                // The picture's box is 150×124: the stamp is its left 120, the postmark sticks out.
                let stampW = Self.size * s
                let boxW = stampW * 150 / 120
                let boxH = stampW * 124 / 120
                ZStack(alignment: .topLeading) {
                    BadgeArt(badge: badge, earned: nil, plain: true)
                        .frame(width: stampW, height: boxH)
                        .overlay { Sheen(image: badge.image(earned: true), progress: sheen) }
                    if stage == .landed {
                        PostmarkInk(badge: badge, date: earned)
                            .frame(width: boxW, height: boxH)
                            .scaleEffect(slam ? 1 : 1.6, anchor: UnitPoint(x: 0.64, y: 0.21))
                            .opacity(slam ? 1 : 0)
                    }
                }
                .frame(width: boxW, height: boxH, alignment: .topLeading)
                .rotationEffect(.degrees(stage == .landed ? tilt : 0))
                .blendMode(stage == .landed ? .multiply : .normal)
                .shadow(color: .black.opacity(stage == .landed ? 0 : 0.45), radius: 14, y: 10)
                .position(x: place.point.x - stampW / 2 + boxW / 2, y: place.point.y)
                .opacity(home == .zero ? 0 : 1)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// The centre of the stamp, and its size against the card's (1 on the card).
    private func position(at date: Date, island: CGPoint, home: CGPoint) -> (point: CGPoint, scale: CGFloat) {
        if let flight {
            let f = flight.at(date)
            return (f.point, f.scale)
        }
        switch stage {
        case .drop: return (island, 0.12)
        case .shown, .placing: return (home, 1)
        case .flying, .landed, .done: return (targetPoint, targetScale)
        }
    }

    /// Where the stamp sits in its visa: the centre of the picture's stamp part (120 of 150).
    private var targetPoint: CGPoint {
        let stampW = target.width * 120 / 150
        return CGPoint(x: target.minX + stampW / 2, y: target.midY)
    }

    private var targetScale: CGFloat { max(0.05, target.width * 120 / 150 / Self.size) }

    private static func tilt(for b: Badge) -> Double {
        guard let visa = PassportVisa.all.first(where: { $0.badges.contains(b) }),
              let k = visa.badges.firstIndex(of: b) else { return 0 }
        return PassportVisaPage.tilts[k]
    }

    // MARK: Steps

    private func intro() async {
        // Wait for the card to be laid out, so the stamp knows where to land.
        try? await Task.sleep(for: .milliseconds(60))
        EarnHaptics.soft()
        if reduceMotion {
            stage = .shown
            return
        }
        withAnimation(.spring(response: 0.6, dampingFraction: 0.68)) { stage = .shown }
        try? await Task.sleep(for: .milliseconds(420))
        EarnHaptics.land()
        withAnimation(.easeInOut(duration: 0.9)) { sheen = 1 }
    }

    private func place() {
        Haptics.tap()
        if reduceMotion {
            stage = .landed
            slam = true
            Task {
                try? await Task.sleep(for: .milliseconds(600))
                stage = .done
            }
            return
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.86)) { stage = .placing }
        Task {
            // The passport has risen and laid out its page.
            try? await Task.sleep(for: .milliseconds(520))
            let from = CGPoint(x: home.midX, y: home.midY)
            flight = BadgeFlight(from: from, to: targetPoint, fromScale: 1, toScale: targetScale, lift: 140, start: Date(), duration: 0.8)
            stage = .flying
            try? await Task.sleep(for: .milliseconds(800))
            flight = nil
            stage = .landed
            EarnHaptics.land()
            withAnimation(.spring(response: 0.18, dampingFraction: 0.5)) { bounce = true }
            try? await Task.sleep(for: .milliseconds(160))
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { bounce = false }
            try? await Task.sleep(for: .milliseconds(260))
            withAnimation(.spring(response: 0.22, dampingFraction: 0.55)) { slam = true }
            EarnHaptics.slam()
            try? await Task.sleep(for: .milliseconds(1100))
            withAnimation(.easeInOut(duration: 0.25)) { stage = .done }
        }
    }

    private func finish() {
        badges.markSeen(badge.id)
    }
}

// MARK: - Sticker

/// "Ura!": the sticker pops onto its backing sheet; held, it peels off and goes into the album.
private struct StickerMoment: View {
    let badge: Badge
    @Environment(BadgeStore.self) private var badges
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Stage { case pop, shown, peeled, flying, stuck, leaving }
    @State private var stage: Stage = .pop
    @State private var home: CGRect = .zero
    @State private var target: CGRect = .zero
    @State private var drag: CGSize?
    @State private var inMagnet = false
    @State private var flight: BadgeFlight?
    @State private var burst: Date?
    @State private var awayTo: CGPoint = .zero

    private static let size: CGFloat = 170
    private static let gold = Color(hex: 0xFFD76A)
    private static let cream = Color(hex: 0xFFF6E4)

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                EarnBackdrop(dim: 0.72)
                card
                    .opacity(stage == .pop || stage == .shown ? 1 : 0)
                    .frame(width: w, height: h)
                albumPanel(width: w, height: h)
                    .offset(y: stage == .pop || stage == .shown || stage == .leaving ? h : 0)
                if stage == .stuck {
                    Text("Lipit!")
                        .font(.custom(AppFont.storyDisplay, size: 40, relativeTo: .largeTitle))
                        .foregroundStyle(Self.gold)
                        .shadow(color: Self.gold.opacity(0.6), radius: 14)
                        .position(x: w / 2, y: max(90, h * 0.13))
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
                floatingSticker(width: w)
                    .onAppear { awayTo = CGPoint(x: w - 40, y: max(60, geo.safeAreaInsets.top + 26)) }
            }
            .coordinateSpace(.named(BadgeEarnSpace.name))
        }
        .ignoresSafeArea()
        .task { await intro() }
    }

    private var card: some View {
        VStack(spacing: 12) {
            Text("Ura!")
                .font(.custom(AppFont.storyDisplay, size: 52, relativeTo: .largeTitle))
                .foregroundStyle(Self.gold)
                .shadow(color: Self.gold.opacity(0.5), radius: 12)
            backingSheet
            Text(badge.name)
                .font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .title))
                .foregroundStyle(Self.cream)
            Text(badge.how)
                .font(.custom(AppFont.body, size: 17, relativeTo: .body))
                .foregroundStyle(Self.cream.opacity(0.78))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Ține-l apăsat ca să-l dezlipești")
                .font(.custom(AppFont.hand, size: 21, relativeTo: .callout))
                .foregroundStyle(Self.gold.opacity(0.85))
                .accessibilityHidden(true)
            Button { stickByButton() } label: {
                Text("Lipește în album")
                    .font(.custom(AppFont.bodyBold, size: 18, relativeTo: .title3))
                    .foregroundStyle(Color(hex: 0x171A45))
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(Capsule().fill(Self.gold))
            }
            .buttonStyle(PressableStyle())
            .padding(.top, 4)
            Button { later() } label: {
                Text("Mai târziu")
                    .font(.custom(AppFont.bodySemibold, size: 17, relativeTo: .body))
                    .foregroundStyle(Self.cream)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Capsule().fill(.white.opacity(0.12)))
            }
            .buttonStyle(PressableStyle())
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 420)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Abțibild nou: \(badge.name)")
    }

    /// The cream backing sheet the sticker comes on; once peeled, its die-cut shape stays.
    private var backingSheet: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(hex: 0xF6EEDC))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color(hex: 0xD9CBAE), style: StrokeStyle(lineWidth: 1.2, dash: [4, 4])).padding(8))
                .shadow(color: .black.opacity(0.35), radius: 16, y: 8)
            Image.badgeArt(badge.image(earned: true)).resizable().renderingMode(.template).scaledToFit()
                .foregroundStyle(Color(hex: 0xE6DAC0).shadow(.inner(color: .black.opacity(0.18), radius: 2, x: 1, y: 1)))
                .frame(width: Self.size, height: Self.size)
                .opacity(stage == .pop ? 0 : 1)
            sparkles
        }
        .frame(width: Self.size + 50, height: Self.size + 50)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(BadgeEarnSpace.name)) } action: { home = $0 }
    }

    /// A burst of sparks when the sticker lands on the sheet.
    private var sparkles: some View {
        TimelineView(.animation(minimumInterval: nil, paused: burst == nil)) { tl in
            Canvas { ctx, size in
                guard let burst else { return }
                let t = tl.date.timeIntervalSince(burst)
                guard t < 1.3 else { return }
                var noise = BookNoise(seed: 5)
                let centre = CGPoint(x: size.width / 2, y: size.height / 2)
                for _ in 0..<22 {
                    let angle = noise.next() * 2 * .pi
                    let speed = 90 + noise.next() * 120
                    let d = CGFloat(t) * speed * (1 - CGFloat(t) * 0.35)
                    let r = (2 + noise.next() * 3) * CGFloat(max(0, 1 - t / 1.3))
                    let p = CGPoint(x: centre.x + cos(angle) * d, y: centre.y + sin(angle) * d)
                    let star = Path { s in
                        s.move(to: CGPoint(x: p.x, y: p.y - r * 2))
                        s.addQuadCurve(to: CGPoint(x: p.x + r * 2, y: p.y), control: p)
                        s.addQuadCurve(to: CGPoint(x: p.x, y: p.y + r * 2), control: p)
                        s.addQuadCurve(to: CGPoint(x: p.x - r * 2, y: p.y), control: p)
                        s.addQuadCurve(to: CGPoint(x: p.x, y: p.y - r * 2), control: p)
                    }
                    ctx.fill(star, with: .color(Self.gold.opacity(max(0, 1 - t / 1.3))))
                }
            }
        }
        .frame(width: Self.size + 160, height: Self.size + 160)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func albumPanel(width w: CGFloat, height h: CGFloat) -> some View {
        let sheet = AlbumSheet.all.first { $0.badges.contains(badge) }
        let number = AlbumSheet.pageNumber(of: badge.id) ?? 1
        let pageW = min(w - 80, (h * 0.66 - 110) * 282 / 470, 360)
        let have = badges.count(BadgeCatalog.stickers) - (stage == .stuck ? 0 : 1)
        return VStack(spacing: 12) {
            Capsule().fill(.white.opacity(0.3)).frame(width: 40, height: 5).padding(.top, 10)
            VStack(spacing: 2) {
                Text("Albumul meu")
                    .font(.custom(AppFont.storyDisplay, size: 20, relativeTo: .title3))
                    .foregroundStyle(Self.cream)
                Text("\(have) din \(BadgeCatalog.stickers.count) abțibilduri")
                    .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
                    .foregroundStyle(.white.opacity(0.7))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(have)))
            }
            if let sheet {
                AlbumSheetPage(sheet: sheet, number: number, stuck: stage == .stuck ? badge.id : nil,
                               hiding: stage == .stuck ? nil : badge.id, target: { target = $0 }, onTap: { _ in })
                    .frame(width: pageW, height: pageW * 470 / 282)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 4, bottomTrailingRadius: 12, topTrailingRadius: 12, style: .continuous))
                    .overlay(alignment: .leading) {
                        WireSpiral(page: CGSize(width: pageW, height: pageW * 470 / 282)).offset(x: -pageW * 0.06)
                    }
                    .shadow(color: .black.opacity(0.45), radius: 12, y: 6)
                    .allowsHitTesting(false)
            }
            Spacer(minLength: 0)
        }
        .frame(width: w, height: h * 0.8)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: 0x262A66), Color(hex: 0x141634)], startPoint: .top, endPoint: .bottom))
                .shadow(color: .black.opacity(0.5), radius: 24, y: -6)
        )
        .frame(width: w, height: h, alignment: .bottom)
    }

    // MARK: The sticker itself

    @ViewBuilder
    private func floatingSticker(width w: CGFloat) -> some View {
        if stage != .stuck {
            TimelineView(.animation(minimumInterval: nil, paused: flight == nil)) { tl in
                let place = position(at: tl.date)
                let lifted = stage == .peeled || stage == .flying
                BadgeArt(badge: badge, earned: Date())
                    .frame(width: Self.size * place.scale, height: Self.size * place.scale)
                    .rotation3DEffect(.degrees(lifted && drag == nil ? 10 : 0), axis: (x: 1, y: -1, z: 0), anchor: .topTrailing, perspective: 0.5)
                    .shadow(color: .black.opacity(lifted ? 0.5 : 0.3), radius: lifted ? 18 : 4, y: lifted ? 14 : 3)
                    .rotationEffect(.degrees(stage == .pop ? -20 : 0))
                    .contentShape(Rectangle())
                    .gesture(peelAndDrag)
                    .position(place.point)
                    .opacity(stage == .leaving || home == .zero ? 0 : 1)
            }
            .accessibilityHidden(true)
        }
    }

    private func position(at date: Date) -> (point: CGPoint, scale: CGFloat) {
        if let flight {
            let f = flight.at(date)
            return (f.point, f.scale)
        }
        let homePoint = CGPoint(x: home.midX, y: home.midY)
        switch stage {
        case .pop: return (homePoint, 0.3)
        case .shown: return (homePoint, 1)
        case .peeled:
            guard let drag else { return (homePoint, 1.08) }
            let finger = CGPoint(x: homePoint.x + drag.width, y: homePoint.y + drag.height)
            let goal = targetPoint
            let distance = hypot(finger.x - goal.x, finger.y - goal.y)
            // Near its place, the magnet pulls it in and it shrinks to fit.
            let pull = max(0, min(1, (110 - distance) / 80))
            let p = CGPoint(x: finger.x + (goal.x - finger.x) * pull * 0.7, y: finger.y + (goal.y - finger.y) * pull * 0.7)
            return (p, 1.08 + (targetScale - 1.08) * pull * 0.8)
        case .flying, .stuck: return (targetPoint, targetScale)
        case .leaving: return (awayTo, 0.15)
        }
    }

    private var targetPoint: CGPoint { CGPoint(x: target.midX, y: target.midY) }
    private var targetScale: CGFloat { max(0.05, target.width / Self.size) }

    private var peelAndDrag: some Gesture {
        LongPressGesture(minimumDuration: 0.28)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(BadgeEarnSpace.name)))
            .onChanged { value in
                guard stage == .shown || stage == .peeled else { return }
                switch value {
                case .first(true):
                    break
                case .second(true, let d):
                    if stage == .shown { peel() }
                    drag = d?.translation
                    let near = isNear(d?.translation)
                    if near != inMagnet {
                        inMagnet = near
                        if near { EarnHaptics.magnet() }
                    }
                default:
                    break
                }
            }
            .onEnded { value in
                guard stage == .peeled else { return }
                if case .second(true, let d) = value, isNear(d?.translation) {
                    flyIn(from: dragPoint(d?.translation))
                } else {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { drag = nil }
                    inMagnet = false
                }
            }
    }

    private func dragPoint(_ t: CGSize?) -> CGPoint {
        let t = t ?? .zero
        return CGPoint(x: home.midX + t.width, y: home.midY + t.height)
    }

    private func isNear(_ t: CGSize?) -> Bool {
        guard t != nil else { return false }
        let p = dragPoint(t)
        return hypot(p.x - targetPoint.x, p.y - targetPoint.y) < 90
    }

    // MARK: Steps

    private func intro() async {
        try? await Task.sleep(for: .milliseconds(60))
        if reduceMotion {
            stage = .shown
            return
        }
        burst = Date()
        EarnHaptics.soft()
        withAnimation(.spring(response: 0.55, dampingFraction: 0.5)) { stage = .shown }
        try? await Task.sleep(for: .milliseconds(1400))
        burst = nil
    }

    private func peel() {
        EarnHaptics.peel()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) { stage = .peeled }
    }

    /// "Lipește în album": peels it and lays it in its place without dragging.
    private func stickByButton() {
        Haptics.tap()
        if reduceMotion {
            stage = .peeled
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                stick()
            }
            return
        }
        peel()
        Task {
            try? await Task.sleep(for: .milliseconds(650))
            flyIn(from: CGPoint(x: home.midX, y: home.midY))
        }
    }

    private func flyIn(from start: CGPoint) {
        let from = drag == nil ? start : position(at: Date()).point
        let scale = drag == nil ? 1.08 : position(at: Date()).scale
        flight = BadgeFlight(from: from, to: targetPoint, fromScale: scale, toScale: targetScale, lift: drag == nil ? 120 : 20, start: Date(), duration: drag == nil ? 0.7 : 0.28)
        let ms = drag == nil ? 700 : 280
        drag = nil
        stage = .flying
        Task {
            try? await Task.sleep(for: .milliseconds(ms))
            stick()
        }
    }

    private func stick() {
        flight = nil
        EarnHaptics.stick()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { stage = .stuck }
        Task {
            try? await Task.sleep(for: .milliseconds(1700))
            badges.markSeen(badge.id)
        }
    }

    /// "Mai târziu": it flies off to the album button and waits there.
    private func later() {
        Haptics.tap()
        if reduceMotion {
            badges.putOff(badge.id)
            return
        }
        withAnimation(.easeIn(duration: 0.45)) { stage = .leaving }
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            badges.putOff(badge.id)
        }
    }
}

// MARK: - Album button

/// The round button on the stories home: the newest sticker on it and a dot while one waits to
/// be stuck. It opens "Insigne"; in kid mode, the album straight away.
struct AlbumButton: View {
    @Environment(BadgeStore.self) private var badges
    @Environment(KidMode.self) private var kid
    @State private var open = false

    var body: some View {
        let latest = badges.latest(BadgeCatalog.stickers, 1).first
        let waiting = BadgeCatalog.stickers.contains(where: badges.waiting)
        Button { open = true } label: {
            BadgeArt(badge: latest ?? BadgeCatalog.stickers[0], earned: latest.flatMap(badges.earnedDate))
                .padding(5)
                .frame(width: 38, height: 38)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.12)))
                .overlay(alignment: .topTrailing) {
                    if waiting { Circle().fill(Color(hex: 0xFF5F6D)).frame(width: 10, height: 10).overlay(Circle().strokeBorder(.black.opacity(0.4))) }
                }
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(waiting ? "Albumul meu: ai un abțibild de lipit" : "Insigne")
        .fullScreenCover(isPresented: $open) {
            Group {
                if kid.active {
                    AlbumView()
                } else {
                    NavigationStack { InsigneView() }
                }
            }
            .environment(\.colorScheme, .dark)
        }
    }
}
