import SwiftUI

/// A small, steady tilt per badge (the web's tiltOf), so the album looks stuck by hand.
func badgeTilt(_ id: String, range: Int = 4) -> Double {
    var h = 0
    for unit in id.utf16 { h = (h * 31 + Int(unit)) % 997 }
    let t = h % (2 * range + 1) - range
    return Double(t != 0 ? t : (h % 2 == 1 ? 2 : -2))
}

/// The drawing of a badge, the web's own picture. A stamp sits in a 150×124 box (its postmark
/// sticks out on the right once earned), so a grid of stamps lines up; a sticker is square.
struct BadgeArt: View {
    let badge: Badge
    var earned: Date?
    /// A stamp without its postmark (small rows).
    var plain = false
    /// Missing stamps drawn for the passport's light paper.
    var onPaper = false

    var body: some View {
        if badge.kind == .sticker {
            Image(badge.image(earned: earned != nil))
                .resizable().scaledToFit()
        } else if plain {
            Image(badge.image(earned: true))
                .resizable().aspectRatio(120 / 124, contentMode: .fit)
        } else {
            Canvas { ctx, size in
                let s = size.width / 150
                let stamp = ctx.resolve(Image(badge.image(earned: earned != nil, onPaper: onPaper)))
                if let earned {
                    Postmark.draw(&ctx, scale: s, tilt: badgeTilt(badge.id), date: earned, color: Color(red: 242 / 255, green: 200 / 255, blue: 121 / 255).opacity(0.75), clip: false)
                    ctx.draw(stamp, in: CGRect(x: 0, y: 0, width: 120 * s, height: 124 * s))
                    Postmark.draw(&ctx, scale: s, tilt: badgeTilt(badge.id), date: earned, color: Color(red: 42 / 255, green: 28 / 255, blue: 12 / 255).opacity(0.8), clip: true)
                } else {
                    ctx.draw(stamp, in: CGRect(x: 0, y: 0, width: 120 * s, height: 124 * s))
                }
            }
            .aspectRatio(150 / 124, contentMode: .fit)
        }
    }
}

/// The round postmark with the day the stamp was earned: rings, the app's name around, the
/// date in the middle and wavy lines to the right (the web's postmark() in art.ts).
enum Postmark {
    private static let months = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

    static func draw(_ base: inout GraphicsContext, scale s: CGFloat, tilt: Double, date: Date, color: Color, clip: Bool) {
        var ctx = base
        ctx.scaleBy(x: s, y: s)
        ctx.translateBy(x: 60, y: 62)
        ctx.rotate(by: .degrees(tilt))
        ctx.translateBy(x: -60, y: -62)
        if clip { ctx.clip(to: Path(roundedRect: CGRect(x: 19, y: 6, width: 82, height: 112), cornerRadius: 3)) }
        let cx: CGFloat = 96, cy: CGFloat = 26, r: CGFloat = 21
        let shading = GraphicsContext.Shading.color(color)
        ctx.stroke(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)), with: shading, lineWidth: 1.4)
        ctx.stroke(Path(ellipseIn: CGRect(x: cx - 11.5, y: cy - 11.5, width: 23, height: 23)), with: shading, lineWidth: 0.9)
        for k in stride(from: -1.5, through: 1.5, by: 1.0) {
            var wave = Path()
            var x = cx + r + 3
            let y = cy + CGFloat(k) * 8
            wave.move(to: CGPoint(x: x, y: y))
            for i in 0..<5 {
                wave.addQuadCurve(to: CGPoint(x: x + 9, y: y), control: CGPoint(x: x + 4.5, y: y + (i % 2 == 0 ? -4 : 4)))
                x += 9
            }
            ctx.stroke(wave, with: shading, style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
        }
        // The name around, from the left over the top, on a 16.2 circle.
        let ring: CGFloat = 16.2
        var along: CGFloat = 0
        for ch in "BUCĂTĂRIA CU POVEȘTI · TIMBRU NOU ·" {
            let glyph = ctx.resolve(Text(String(ch)).font(.custom(AppFont.bodyBold, fixedSize: 3.9)).foregroundStyle(color))
            let w = glyph.measure(in: CGSize(width: 20, height: 20)).width
            let mid = along + w / 2
            along += w + 0.9
            guard mid < 2 * .pi * ring else { break }
            let a = Double.pi + Double(mid / ring)
            var g = ctx
            g.translateBy(x: cx + ring * CGFloat(cos(a)), y: cy + ring * CGFloat(sin(a)))
            g.rotate(by: .radians(a + .pi / 2))
            g.draw(glyph, at: .zero, anchor: UnitPoint(x: 0.5, y: 0.78))
        }
        let cal = Calendar.current
        let day = "\(cal.component(.day, from: date)) \(months[cal.component(.month, from: date) - 1])"
        ctx.draw(ctx.resolve(Text(day).font(.custom(AppFont.bodyBold, fixedSize: 5.6)).foregroundStyle(color)),
                 at: CGPoint(x: cx, y: cy - 0.5), anchor: UnitPoint(x: 0.5, y: 0.78))
        ctx.draw(ctx.resolve(Text(String(cal.component(.year, from: date))).font(.custom(AppFont.bodySemibold, fixedSize: 4.4)).foregroundStyle(color)),
                 at: CGPoint(x: cx, y: cy + 5.5), anchor: UnitPoint(x: 0.5, y: 0.78))
    }
}

/// A thin progress bar.
struct BadgeBar: View {
    let value: Double
    var tint: Color = Theme.accent
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.1))
                Capsule().fill(tint).frame(width: geo.size.width * min(1, max(0, value)))
            }
        }
        .frame(height: height)
    }
}

/// Profil: the two collections side by side, each with how many and the newest three.
struct BadgeCards: View {
    let open: (ProfileRoute) -> Void
    @Environment(BadgeStore.self) private var badges

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            card(title: "Pașaportul culinar", list: BadgeCatalog.stamps, empty: "Primul timbru vine cu prima rețetă.", night: false) { open(.passport) }
            card(title: "Albumul de povești", list: BadgeCatalog.stickers, empty: "Primul abțibild vine la finalul unei povești.", night: true) { open(.album) }
        }
    }

    private func card(title: String, list: [Badge], empty: String, night: Bool, action: @escaping () -> Void) -> some View {
        let have = badges.count(list)
        let latest = badges.latest(list, 3)
        let muted = night ? Color(hex: 0xFFF6D6).opacity(0.7) : Theme.muted
        return Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(night ? .custom(AppFont.kidsHeavy, size: 15, relativeTo: .subheadline) : .custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(night ? Color(hex: 0xFFF6D6) : Theme.text)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Text("\(have) din \(list.count)").font(.custom(AppFont.body, size: 12, relativeTo: .caption)).foregroundStyle(muted)
                        .fixedSize()
                }
                BadgeBar(value: Double(have) / Double(list.count), tint: night ? Color(hex: 0xFFD76A) : Theme.accent)
                HStack(spacing: 4) {
                    if latest.isEmpty {
                        Text(empty).font(.custom(AppFont.body, size: 12, relativeTo: .caption)).foregroundStyle(muted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        ForEach(latest) { b in
                            BadgeArt(badge: b, earned: badges.earnedDate(b), plain: true)
                                .frame(maxWidth: 52)
                        }
                    }
                }
                .frame(minHeight: 52, alignment: .leading)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(night ? AnyShapeStyle(LinearGradient(colors: [Color(hex: 0x262A66), Color(hex: 0x3A2F86)], startPoint: .topLeading, endPoint: .bottomTrailing)) : AnyShapeStyle(Color.white.opacity(0.06)))
            }
            .overlay { if !night { RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.08)) } }
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("\(title), \(have) din \(list.count)")
    }
}

/// One badge's page: big, what earns it, the date or how far along it is, and its series.
struct BadgeSheet: View {
    let badge: Badge
    @Environment(BadgeStore.self) private var badges
    @State private var spoiler = false

    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.setLocalizedDateFormatFromTemplate("d MMM yyyy")
        return f
    }()

    var body: some View {
        let earned = badges.earnedDate(badge)
        let hidden = badge.secret && earned == nil
        let p = BadgeEngine.progress(badge, badges.state)
        let kid = badge.kind == .sticker
        let series = badge.lvl != nil ? BadgeCatalog.stamps.filter { $0.art == badge.art } : []
        VStack(spacing: 10) {
            BadgeArt(badge: badge, earned: earned)
                .frame(width: kid ? 170 : 220)
                .padding(.top, 26)
            Text(hidden ? "Surpriză" : badge.name)
                .font(kid ? .custom(AppFont.kidsHeavy, size: 24, relativeTo: .title2) : .custom(AppFont.displaySemibold, size: 24, relativeTo: .title2))
                .foregroundStyle(Theme.text)
            Text(hidden ? "O descoperi făcând ce faci de obicei în aplicație, doar puțin altfel." : badge.how)
                .font(.ktCallout).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if hidden {
                if spoiler {
                    VStack(spacing: 2) {
                        Text("Cum o primești").font(.ktBodyEmphasis)
                        Text(badge.how).font(.ktFootnote).multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Theme.text)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(.white.opacity(0.07)))
                } else {
                    Button { spoiler = true } label: { Label("Arată ce trebuie să faci", systemImage: "eye") }
                        .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .callout))
                        .foregroundStyle(Theme.accent)
                }
            }
            if let earned {
                Text("Primit pe \(Self.day.string(from: earned).replacingOccurrences(of: ".", with: ""))")
                    .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.accent)
            } else if !badge.secret, p.need > 1, p.have > 0, badge.id != "an" {
                VStack(spacing: 6) {
                    BadgeBar(value: Double(p.have) / Double(p.need))
                    Text("\(p.have) din \(p.need)").font(.ktFootnote).foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: 260)
            }
            if series.count > 1 {
                HStack(spacing: 6) {
                    ForEach(series) { b in BadgeArt(badge: b, earned: badges.earnedDate(b)).frame(width: 58) }
                }
                .padding(.top, 8)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Night.ink)
    }
}
