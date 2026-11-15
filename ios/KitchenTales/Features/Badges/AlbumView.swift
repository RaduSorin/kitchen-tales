import SwiftUI

/// One page of the album: a chapter's stickers, four at most.
struct AlbumSheet: Sendable {
    let group: String
    let badges: [Badge]

    static let all: [AlbumSheet] = BadgeCatalog.stickerGroups.flatMap { g in
        badgePages(BadgeCatalog.stickers.filter { $0.group == g }, max: 4).map { AlbumSheet(group: g, badges: $0) }
    }

    /// The book page (cover 0, sheets from 1) that holds a sticker.
    static func pageNumber(of id: String) -> Int? {
        all.firstIndex { $0.badges.contains { $0.id == id } }.map { $0 + 1 }
    }
}

/// "Albumul meu" (design-polish/ios-medals/album-detaliat.jpg): the stickers in a notebook of
/// grained coloured cardboard bound with a twin metal wire, turned page by page, full screen.
/// Four places a page, a chapter (and a colour) per group, with tabs to jump between chapters.
/// An empty place is the sticker's shape pressed into the cardboard; its edge glows gold when the
/// sticker waits to be stuck (a tap sticks it). For the child too.
struct AlbumView: View {
    @Environment(BadgeStore.self) private var badges
    @State private var page = 0
    @State private var open: Badge?
    @State private var stuck: String?
    @State private var started = false

    struct Chapter { let short: String; let tape: Color; let paper: Color }
    static let chapters: [String: Chapter] = [
        "La ascultat": Chapter(short: "Ascultat", tape: Color(hex: 0xF5B453), paper: Color(hex: 0x272D55)),
        "La făcut povești": Chapter(short: "Făcut", tape: Color(hex: 0xEF8FAE), paper: Color(hex: 0x4B2545)),
        "Obiceiuri bune": Chapter(short: "Obiceiuri", tape: Color(hex: 0x7CC795), paper: Color(hex: 0x1C4541)),
    ]
    static let coverPaper = Color(hex: 0x1F2547)
    static let cream = Color(hex: 0xFFF6E4)

    var body: some View {
        let sheets = AlbumSheet.all
        let count = sheets.count + 2
        let have = badges.count(BadgeCatalog.stickers)
        BadgeBookFrame(title: "Albumul meu", count: "\(have) din \(BadgeCatalog.stickers.count) abțibilduri", glow: Color(hex: 0x4A56B8),
                       pages: count, page: $page, caption: { Self.caption($0, sheets: sheets) }) { w in
            let h = w * 470 / 282
            HStack(spacing: 0) {
                PageCurl(count: count, index: $page) { i in
                    pageView(i, sheets: sheets)
                        .frame(width: w, height: h)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: w * 0.012, bottomLeadingRadius: w * 0.012, bottomTrailingRadius: w * 0.04, topTrailingRadius: w * 0.04))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } back: { i in
                    backView(i, sheets: sheets)
                        .frame(width: w, height: h)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: w * 0.04, bottomLeadingRadius: w * 0.04, bottomTrailingRadius: w * 0.012, topTrailingRadius: w * 0.012))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: w, height: h)
                .background(alignment: .topLeading) {
                    PageStackEdge(paper: Self.chapters[sheets[min(max(page - 1, 0), sheets.count - 1)].group]?.paper ?? Self.coverPaper, corner: w * 0.04)
                        .frame(width: w, height: h)
                        .shadow(color: .black.opacity(0.55), radius: 20, y: 12)
                }
                .overlay(alignment: .leading) {
                    WireSpiral(page: CGSize(width: w, height: h))
                        .offset(x: -w * 0.06)
                }
                AlbumTabs(sheets: sheets, page: $page, width: w)
            }
            .padding(.leading, w * 0.05)
        }
        .sheet(item: $open) { BadgeSheet(badge: $0) }
        .onAppear {
            // Open where a sticker waits to be stuck.
            guard !started else { return }
            started = true
            if let first = sheets.firstIndex(where: { $0.badges.contains(where: badges.waiting) }) { page = first + 1 }
            if LaunchOptions.screen == "album" { page = 1 }
        }
    }

    static func caption(_ i: Int, sheets: [AlbumSheet]) -> String {
        let n = sheets.count + 2
        let what: String
        if i == 0 { what = "Coperta" } else if i - 1 < sheets.count { what = sheets[i - 1].group } else { what = "Sfârșit" }
        return "Pagina \(i + 1) din \(n) · \(what)"
    }

    // MARK: Pages

    @ViewBuilder
    private func pageView(_ i: Int, sheets: [AlbumSheet]) -> some View {
        if i == 0 {
            AlbumCover()
        } else if i - 1 < sheets.count {
            AlbumSheetPage(sheet: sheets[i - 1], number: i, stuck: stuck) { b in
                if badges.waiting(b) { stick(b) } else { open = b }
            }
        } else {
            endPage
        }
    }

    /// The back of a sheet: the same cardboard, a little darker, with the holes on its spine side.
    private func backView(_ i: Int, sheets: [AlbumSheet]) -> some View {
        let paper: Color = i == 0 ? Self.coverPaper : (i - 1 < sheets.count ? Self.chapters[sheets[i - 1].group]?.paper ?? Self.coverPaper : Self.coverPaper)
        return ZStack {
            CardboardTexture(color: paper.mix(with: .black, by: 0.12), seed: 100 + i)
            PunchedHoles(spineOnRight: true)
        }
    }

    private func stick(_ b: Badge) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) { stuck = b.id }
        badges.markSeen(b.id)
        Haptics.success()
    }

    private var endPage: some View {
        let missing = BadgeCatalog.stickers.count - badges.count(BadgeCatalog.stickers)
        let paper = Self.chapters[BadgeCatalog.stickerGroups.last ?? ""]?.paper ?? Self.coverPaper
        return PageBox { u in
            ZStack {
                CardboardTexture(color: paper, seed: 99)
                PunchedHoles()
                VStack(spacing: 1.4 * u) {
                    Text(missing == 0 ? "Ai toate abțibildurile!" : "Mai ai \(missing) de găsit")
                        .font(.custom(AppFont.storyDisplay, fixedSize: 8.4 * u))
                    Text("ascultă, fă povești\nși caută surprizele")
                        .font(.custom(AppFont.hand, fixedSize: 7.8 * u)).opacity(0.8)
                }
                .multilineTextAlignment(.center)
                .foregroundStyle(Self.cream)
                .padding(.leading, 6 * u)
            }
        }
    }
}

/// The chapter tabs on the album's outer edge: tap one to jump to its first page.
private struct AlbumTabs: View {
    let sheets: [AlbumSheet]
    @Binding var page: Int
    let width: CGFloat

    var body: some View {
        let w = width
        VStack(spacing: w * 0.028) {
            ForEach(BadgeCatalog.stickerGroups, id: \.self) { g in
                tab(g, w: w)
            }
            Spacer()
        }
        .frame(width: max(30, w * 0.12), alignment: .leading)
        .padding(.top, w * 0.16)
        .frame(height: w * 470 / 282)
    }

    private func tab(_ g: String, w: CGFloat) -> some View {
        let first = (sheets.firstIndex { $0.group == g } ?? 0) + 1
        let on = page > 0 && page - 1 < sheets.count && sheets[page - 1].group == g
        let c = AlbumView.chapters[g] ?? AlbumView.Chapter(short: g, tape: .orange, paper: .black)
        return Button {
            page = first
            Haptics.select()
        } label: {
            Text(c.short)
                .font(.custom(AppFont.bodyBold, fixedSize: max(10, w * 0.036)))
                .foregroundStyle(Color(hex: 0x3A2410))
                .fixedSize()
                .rotationEffect(.degrees(90))
                .frame(width: max(26, w * (on ? 0.112 : 0.096)), height: w * 0.227)
                .background(UnevenRoundedRectangle(bottomTrailingRadius: w * 0.03, topTrailingRadius: w * 0.03).fill(c.tape))
                .overlay(UnevenRoundedRectangle(bottomTrailingRadius: w * 0.03, topTrailingRadius: w * 0.03).fill(LinearGradient(colors: [.white.opacity(0.18), .clear], startPoint: .top, endPoint: .bottom)))
                .shadow(color: .black.opacity(0.3), radius: 3, x: 2, y: 2)
        }
        .buttonStyle(.plain)
        .animation(.snappy, value: on)
        .accessibilityLabel("Capitolul \(g)")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The album's cover: dark cardboard, the newest stickers, a paper label held by torn tape.
private struct AlbumCover: View {
    @Environment(BadgeStore.self) private var badges

    var body: some View {
        let latest = badges.latest(BadgeCatalog.stickers, 4)
        let have = badges.count(BadgeCatalog.stickers)
        let spots: [(CGFloat, CGFloat, CGFloat, Double)] = [(14.8, 14, 30, -12), (51.6, 23.4, 25, 14), (17.6, 103.5, 27.7, 8), (50.2, 112.8, 29, -9)]
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                CardboardTexture(color: AlbumView.coverPaper, seed: 1)
                PunchedHoles()
                ForEach(Array(latest.enumerated()), id: \.element.id) { k, b in
                    BadgeArt(badge: b, earned: badges.earnedDate(b))
                        .frame(width: spots[k].2 * u)
                        .rotationEffect(.degrees(spots[k].3))
                        .shadow(color: .black.opacity(0.45), radius: 0.7 * u, y: 1 * u)
                        .offset(x: spots[k].0 * u, y: spots[k].1 * u)
                }
                label(have: have, u: u)
                    .rotationEffect(.degrees(-3))
                    .offset(x: 17 * u, y: 53 * u)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Albumul meu, coperta, \(have) din \(BadgeCatalog.stickers.count) abțibilduri")
    }

    private func label(have: Int, u: CGFloat) -> some View {
        VStack(spacing: 1 * u) {
            Text("Albumul meu").font(.custom(AppFont.storyDisplay, fixedSize: 9.4 * u))
            Text("\(have) din \(BadgeCatalog.stickers.count) abțibilduri").font(.custom(AppFont.hand, fixedSize: 7 * u))
        }
        .foregroundStyle(Color(hex: 0x3A2613))
        .padding(.top, 5.7 * u).padding(.bottom, 5 * u)
        .frame(width: 62.4 * u)
        .background(RoundedRectangle(cornerRadius: 1 * u).fill(Color(hex: 0xF1E6CF)).shadow(color: .black.opacity(0.45), radius: 2 * u, y: 1 * u))
        .overlay(alignment: .topLeading) {
            TapeStrip(color: Color(hex: 0xF5B453), seed: 4).frame(width: 19 * u, height: 6.4 * u).rotationEffect(.degrees(-32)).offset(x: -5.7 * u, y: -3.2 * u)
        }
        .overlay(alignment: .topTrailing) {
            TapeStrip(color: Color(hex: 0xEF8FAE), seed: 9).frame(width: 19 * u, height: 6.4 * u).rotationEffect(.degrees(30)).offset(x: 5.7 * u, y: -3.2 * u)
        }
    }
}

/// One page of stickers: cardboard, the chapter's name on torn tape, a pen doodle and four
/// places. Used by the album and by the earn moment, where `hiding` keeps a just-earned
/// sticker's place empty and glowing until it is stuck, and `target` reports where it is.
struct AlbumSheetPage: View {
    let sheet: AlbumSheet
    let number: Int
    var stuck: String? = nil
    var hiding: String? = nil
    var target: ((CGRect) -> Void)? = nil
    let onTap: (Badge) -> Void
    @Environment(BadgeStore.self) private var badges

    var body: some View {
        let c = AlbumView.chapters[sheet.group] ?? AlbumView.Chapter(short: "", tape: .orange, paper: AlbumView.coverPaper)
        let list = BadgeCatalog.stickers.filter { $0.group == sheet.group }
        // While a just-earned sticker waits on this page, it is not counted yet.
        let got = badges.count(list) - (hiding != nil && stuck != hiding ? 1 : 0)
        PageBox { u in
            ZStack(alignment: .topLeading) {
                CardboardTexture(color: c.paper, seed: number)
                PunchedHoles()
                heading(sheet.group, got: got, of: list.count, tape: c.tape, u: u)
                    .rotationEffect(.degrees(-2.2))
                    .offset(x: 13 * u, y: 5.7 * u)
                Image.badgeArt("doodle-\(number % 5)").resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 15 * u).foregroundStyle(.white.opacity(0.38))
                    .offset(x: 80 * u, y: 4 * u)
                let cols = [GridItem(.flexible(), spacing: 2.1 * u), GridItem(.flexible(), spacing: 2.1 * u)]
                LazyVGrid(columns: cols, spacing: 2 * u) {
                    ForEach(sheet.badges) { b in
                        StickerPlace(badge: b, paper: c.paper, u: u, justStuck: stuck == b.id, hiding: hiding == b.id, target: target) { onTap(b) }
                    }
                }
                .frame(width: 82 * u)
                .offset(x: 13 * u, y: 24 * u)
                Image.badgeArt("trail").resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 26 * u).foregroundStyle(.white.opacity(0.38))
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.leading, 13 * u).padding(.bottom, 3 * u)
                Text("\(number)")
                    .font(.custom(AppFont.hand, fixedSize: 7 * u)).foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 6.4 * u).padding(.bottom, 3 * u)
            }
        }
    }

    private func heading(_ group: String, got: Int, of total: Int, tape: Color, u: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3 * u) {
            Text(group).font(.custom(AppFont.storyDisplay, fixedSize: 6 * u))
            Text("\(got) din \(total)").font(.custom(AppFont.bodySemibold, fixedSize: 3.8 * u)).opacity(0.75).monospacedDigit()
                .contentTransition(.numericText())
        }
        .foregroundStyle(Color(hex: 0x2A1A10))
        .lineLimit(1)
        .padding(.leading, 5 * u).padding(.trailing, 6 * u).padding(.top, 2 * u).padding(.bottom, 1.6 * u)
        .background(TapeStrip(color: tape, seed: group.count))
    }
}

/// A place in the album. Empty: the sticker's shape pressed into the cardboard. Waiting: the
/// same shape with its outline glowing gold. Nearly there: a faint gold outline and the count.
/// Stuck: the sticker with a soft shadow and a gloss.
struct StickerPlace: View {
    let badge: Badge
    let paper: Color
    let u: CGFloat
    var justStuck = false
    var hiding = false
    var target: ((CGRect) -> Void)? = nil
    let onTap: () -> Void
    @Environment(BadgeStore.self) private var badges
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Look { case empty, waiting, near, stuck }

    var body: some View {
        let earned = badges.earnedDate(badge)
        let p = BadgeEngine.progress(badge, badges.state)
        let look = Self.look(earned: earned != nil, waiting: badges.waiting(badge), hiding: hiding, justStuck: justStuck, near: !badge.secret && p.need > 1 && Double(p.have) / Double(p.need) >= 0.5)
        let hidden = badge.secret && earned == nil
        Button(action: onTap) {
            VStack(spacing: 0.8 * u) {
                ZStack {
                    if look == .stuck {
                        StuckSticker(badge: badge, earned: earned, justStuck: justStuck)
                    } else {
                        StickerHollow(image: badge.image(earned: !hidden), paper: paper, glow: look == .waiting ? 1 : look == .near ? 0.35 : 0, pulse: look == .waiting && !reduceMotion)
                    }
                }
                .frame(width: 38 * u, height: 38 * u)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(BadgeEarnSpace.name)) } action: { frame in
                    if hiding { target?(frame) }
                }
                Text(hidden ? "Surpriză" : badge.name)
                    .font(.custom(AppFont.bodySemibold, fixedSize: 4.2 * u))
                    .foregroundStyle(Color(hex: 0xF4EDDC))
                    .opacity(look == .stuck ? 1 : 0.55)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if look == .near {
                    Text("\(p.have) din \(p.need)")
                        .font(.custom(AppFont.bodySemibold, fixedSize: 3.3 * u)).monospacedDigit()
                        .foregroundStyle(Color(hex: 0xF2C879).opacity(0.85))
                } else if look == .waiting && !hiding {
                    Text("Lipește!")
                        .font(.custom(AppFont.bodyBold, fixedSize: 3.6 * u))
                        .foregroundStyle(Color(hex: 0xF2C879))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 58 * u, alignment: .top)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Self.label(badge, look: look, hidden: hidden))
    }

    private static func look(earned: Bool, waiting: Bool, hiding: Bool, justStuck: Bool, near: Bool) -> Look {
        if justStuck { return .stuck }
        if hiding || waiting { return .waiting }
        if earned { return .stuck }
        return near ? .near : .empty
    }

    private static func label(_ b: Badge, look: Look, hidden: Bool) -> String {
        switch look {
        case .waiting: return "\(b.name): lipește-l în album"
        case .stuck: return b.name
        case .near, .empty: return hidden ? "Surpriză, loc gol" : "\(b.name), loc gol"
        }
    }
}

/// The sticker's shape pressed into the cardboard, its edge lit gold by `glow` (0 to 1).
struct StickerHollow: View {
    let image: String
    let paper: Color
    var glow: Double = 0
    var pulse = false

    var body: some View {
        let shape = Image.badgeArt(image).resizable().renderingMode(.template).scaledToFit()
        ZStack {
            if glow > 0 {
                shape
                    .foregroundStyle(Color(hex: 0xFFD76A))
                    .blur(radius: 5)
                    .opacity(glow * 0.9)
                    .phaseAnimator(pulse ? [0.55, 1.0] : [1.0]) { v, phase in v.opacity(phase) } animation: { _ in .easeInOut(duration: 1.1) }
                shape
                    .foregroundStyle(Color(hex: 0xFFD76A).opacity(glow))
                    .scaleEffect(1.035)
            }
            shape
                .foregroundStyle(paper.mix(with: .black, by: 0.22).shadow(.inner(color: .black.opacity(0.6), radius: 1.6, x: 1, y: 1.6)))
            // The pressed edge catches the light at the bottom right.
            shape
                .foregroundStyle(.white.opacity(0.1))
                .mask(LinearGradient(colors: [.clear, .white], startPoint: .topLeading, endPoint: .bottomTrailing))
                .offset(x: 0.6, y: 0.8)
                .blendMode(.plusLighter)
        }
        .accessibilityHidden(true)
    }
}

/// A stuck sticker: a soft shadow and a gloss that sweeps across it once when it is just stuck,
/// with a squash as it lands.
struct StuckSticker: View {
    let badge: Badge
    let earned: Date?
    var justStuck = false

    private struct Squash { var x: CGFloat = 1; var y: CGFloat = 1; var gloss: CGFloat = -1 }

    var body: some View {
        BadgeArt(badge: badge, earned: earned)
            .shadow(color: .black.opacity(0.45), radius: 1.5, x: 0.5, y: 1.5)
            .keyframeAnimator(initialValue: Squash(), trigger: justStuck) { content, v in
                content
                    .overlay {
                        LinearGradient(colors: [.clear, .white.opacity(0.55), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: 30)
                            .rotationEffect(.degrees(20))
                            .offset(x: v.gloss * 60)
                            .mask(Image.badgeArt(badge.image(earned: true)).resizable().scaledToFit())
                            .blendMode(.plusLighter)
                            .allowsHitTesting(false)
                    }
                    .scaleEffect(x: v.x, y: v.y, anchor: .bottom)
            } keyframes: { _ in
                KeyframeTrack(\.x) {
                    CubicKeyframe(1.14, duration: 0.1)
                    SpringKeyframe(1, duration: 0.5, spring: .bouncy)
                }
                KeyframeTrack(\.y) {
                    CubicKeyframe(0.86, duration: 0.1)
                    SpringKeyframe(1, duration: 0.5, spring: .bouncy)
                }
                KeyframeTrack(\.gloss) {
                    LinearKeyframe(-1, duration: 0.15)
                    CubicKeyframe(1, duration: 0.6)
                }
            }
    }
}
