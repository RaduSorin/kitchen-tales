import SwiftUI

/// "Albumul meu", like the web: the stickers in a spiral notebook of colored cardboard, turned
/// page by page, four a page, a chapter (and a color) per group, with tabs to jump between
/// chapters. Stickers waiting to be stuck glow: a tap sticks them in. For the child too.
struct AlbumView: View {
    @Environment(BadgeStore.self) private var badges
    @Environment(\.dismiss) private var dismiss
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
    private static let cream = Color(hex: 0xFFF6D6)

    private struct Sheet { let group: String; let badges: [Badge] }

    private var sheets: [Sheet] {
        BadgeCatalog.stickerGroups.flatMap { g in
            badgePages(BadgeCatalog.stickers.filter { $0.group == g }, max: 4).map { Sheet(group: g, badges: $0) }
        }
    }

    var body: some View {
        let sheets = self.sheets
        let count = sheets.count + 2
        VStack(spacing: 10) {
            ZStack {
                Text("Albumul meu")
                    .font(.custom(AppFont.kidsHeavy, size: 32, relativeTo: .largeTitle))
                    .foregroundStyle(Self.cream)
                HStack { KTBackButton(); Spacer() }
            }
            .padding(.horizontal, 16)
            GeometryReader { geo in
                let w = min(geo.size.width - 64, geo.size.height * 282 / 470, 360)
                HStack(spacing: 0) {
                    PageCurl(count: count, index: $page) { i in
                        Group {
                            if i == 0 { cover }
                            else if i - 1 < sheets.count { sheetPage(sheets[i - 1], number: i) }
                            else { endPage(paper: Self.chapters[BadgeCatalog.stickerGroups.last!]!.paper) }
                        }
                        .frame(width: w, height: w * 470 / 282)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: w * 0.018, bottomLeadingRadius: w * 0.018, bottomTrailingRadius: w * 0.05, topTrailingRadius: w * 0.05))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .frame(width: w, height: w * 470 / 282)
                    .shadow(color: .black.opacity(0.5), radius: 18, y: 10)
                    .overlay(alignment: .leading) { rings(w) }
                    tabs(w, sheets: sheets)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Text("Glisează sau atinge marginea paginii ca să răsfoiești. Atinge un loc gol ca să afli ce lipsește.")
                .font(.custom(AppFont.kidsSemibold, size: 15, relativeTo: .callout))
                .foregroundStyle(Self.cream.opacity(0.7))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, KTTabBarMetrics.height + 12)
        }
        .background(NightBackdrop())
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: $open) { BadgeSheet(badge: $0) }
        .onAppear {
            // Open where a sticker waits to be stuck.
            guard !started else { return }
            started = true
            if let first = sheets.firstIndex(where: { $0.badges.contains(where: badges.waiting) }) { page = first + 1 }
            if LaunchOptions.screen == "album" { page = 1 }
        }
    }

    // MARK: Parts

    private func rings(_ w: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(0..<13, id: \.self) { _ in
                Capsule()
                    .fill(LinearGradient(colors: [Color(hex: 0xF1F1F4), Color(hex: 0x8D8E97), Color(hex: 0x55565E)], startPoint: .top, endPoint: .bottom))
                    .frame(width: w * 0.092, height: w * 0.032)
                    .shadow(color: .black.opacity(0.5), radius: 1, y: 1)
                    .frame(height: w * 0.12)
            }
        }
        .offset(x: -w * 0.032)
        .padding(.vertical, w * 0.043)
        .allowsHitTesting(false)
    }

    private func tabs(_ w: CGFloat, sheets: [Sheet]) -> some View {
        VStack(spacing: w * 0.028) {
            ForEach(BadgeCatalog.stickerGroups, id: \.self) { g in
                let first = (sheets.firstIndex { $0.group == g } ?? 0) + 1
                let on = page > 0 && page - 1 < sheets.count && sheets[page - 1].group == g
                let c = Self.chapters[g]!
                Button { page = first } label: {
                    Text(c.short)
                        .font(.custom(AppFont.kidsHeavy, fixedSize: max(10, w * 0.039)))
                        .foregroundStyle(Color(hex: 0x3A2410))
                        .fixedSize()
                        .rotationEffect(.degrees(90))
                        .frame(width: max(26, w * (on ? 0.112 : 0.096)), height: w * 0.227)
                        .background(UnevenRoundedRectangle(bottomTrailingRadius: w * 0.03, topTrailingRadius: w * 0.03).fill(c.tape))
                        .shadow(color: .black.opacity(0.3), radius: 3, x: 2, y: 2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Capitolul \(g)")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            Spacer()
        }
        .frame(width: max(30, w * 0.12), alignment: .leading)
        .padding(.top, w * 0.16)
        .frame(height: w * 470 / 282)
    }

    private var cover: some View {
        let latest = badges.latest(BadgeCatalog.stickers, 4)
        let have = badges.count(BadgeCatalog.stickers)
        let spots: [(CGFloat, CGFloat, CGFloat, Double)] = [(12.8, 14, 30, -12), (49.6, 23.4, 25, 14), (15.6, 103.5, 27.7, 8), (48.2, 112.8, 29, -9)]
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                Color(hex: 0x1F2547)
                ForEach(Array(latest.enumerated()), id: \.element.id) { k, b in
                    BadgeArt(badge: b, earned: badges.earnedDate(b))
                        .frame(width: spots[k].2 * u)
                        .rotationEffect(.degrees(spots[k].3))
                        .shadow(color: .black.opacity(0.45), radius: 0.7 * u, y: 1 * u)
                        .offset(x: spots[k].0 * u, y: spots[k].1 * u)
                }
                VStack(spacing: 1 * u) {
                    Text("Albumul meu").font(.custom(AppFont.kidsHeavy, fixedSize: 10.6 * u))
                    Text("\(have) din \(BadgeCatalog.stickers.count) abțibilduri").font(.custom(AppFont.hand, fixedSize: 7 * u))
                }
                .foregroundStyle(Color(hex: 0x3A2613))
                .padding(.top, 5.7 * u).padding(.bottom, 5 * u)
                .frame(width: 62.4 * u)
                .background(RoundedRectangle(cornerRadius: 1 * u).fill(Color(hex: 0xF1E6CF)).shadow(color: .black.opacity(0.45), radius: 2 * u, y: 1 * u))
                .overlay(alignment: .topLeading) { tape(Color(hex: 0xF5B453), u).rotationEffect(.degrees(-32)).offset(x: -5.7 * u, y: -3.2 * u) }
                .overlay(alignment: .topTrailing) { tape(Color(hex: 0xEF8FAE), u).rotationEffect(.degrees(30)).offset(x: 5.7 * u, y: -3.2 * u) }
                .rotationEffect(.degrees(-3))
                .offset(x: 14.9 * u, y: 53 * u)
                VStack {
                    Spacer()
                    Text("Glisează ca să deschizi")
                        .font(.custom(AppFont.kidsSemibold, fixedSize: 4.2 * u))
                        .foregroundStyle(Self.cream.opacity(0.6))
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 6 * u)
                }
            }
        }
    }

    private func tape(_ color: Color, _ u: CGFloat) -> some View {
        Rectangle().fill(color.opacity(0.92)).frame(width: 19 * u, height: 6.4 * u)
    }

    private func sheetPage(_ sheet: Sheet, number: Int) -> some View {
        let c = Self.chapters[sheet.group]!
        let list = BadgeCatalog.stickers.filter { $0.group == sheet.group }
        let got = badges.count(list)
        let doodle = "doodle-\(number % 5)"
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                c.paper
                HStack(alignment: .firstTextBaseline, spacing: 3.5 * u) {
                    Text(sheet.group).font(.custom(AppFont.kidsHeavy, fixedSize: 6.7 * u))
                    Text("\(got) din \(list.count)").font(.custom(AppFont.kidsSemibold, fixedSize: 4.2 * u)).opacity(0.75).monospacedDigit()
                }
                .foregroundStyle(Color(hex: 0x2A1A10))
                .lineLimit(1)
                .padding(.leading, 5 * u).padding(.trailing, 5.7 * u).padding(.top, 1.8 * u).padding(.bottom, 1.4 * u)
                .background(Rectangle().fill(c.tape.opacity(0.95)))
                .rotationEffect(.degrees(-2.2))
                .offset(x: 12 * u, y: 5.7 * u)
                Image(doodle).resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 16 * u).foregroundStyle(.white.opacity(0.42))
                    .offset(x: 79 * u, y: 4 * u)
                let cols = [GridItem(.flexible(), spacing: 2.1 * u), GridItem(.flexible(), spacing: 2.1 * u)]
                LazyVGrid(columns: cols, spacing: 1.4 * u) {
                    ForEach(sheet.badges) { b in slot(b, u: u) }
                }
                .frame(width: 85.1 * u)
                .offset(x: 10.6 * u, y: 22 * u)
                Image("trail").resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 27 * u).foregroundStyle(.white.opacity(0.42))
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.leading, 12 * u).padding(.bottom, 2.8 * u)
                Text("\(number)")
                    .font(.custom(AppFont.hand, fixedSize: 7 * u)).foregroundStyle(.white.opacity(0.42))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 6.4 * u).padding(.bottom, 3 * u)
            }
        }
    }

    private func slot(_ b: Badge, u: CGFloat) -> some View {
        let earned = badges.earnedDate(b)
        let waiting = badges.waiting(b)
        let hidden = b.secret && earned == nil
        return Button {
            if waiting {
                Haptics.success()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5)) { stuck = b.id }
                badges.markSeen(b.id)
            } else {
                open = b
            }
        } label: {
            VStack(spacing: 0.7 * u) {
                BadgeArt(badge: b, earned: earned)
                    .frame(width: 39.7 * u)
                    .background { if waiting { Circle().fill(Color(hex: 0xFFD76A).opacity(0.16)).shadow(color: Color(hex: 0xFFD76A).opacity(0.45), radius: 11) } }
                    .overlay { if waiting { Circle().strokeBorder(Color(hex: 0xFFD76A).opacity(0.6), lineWidth: 3) } }
                    .shadow(color: earned != nil ? .black.opacity(0.4) : .clear, radius: 0.7 * u, y: 0.8 * u)
                    .scaleEffect(stuck == b.id ? 1.08 : 1)
                    .overlay(alignment: .bottom) {
                        if waiting {
                            Text("Lipește!")
                                .font(.custom(AppFont.kidsHeavy, size: 14, relativeTo: .footnote))
                                .foregroundStyle(Color(hex: 0x171A45))
                                .padding(.horizontal, 10).padding(.vertical, 1)
                                .background(Capsule().fill(Color(hex: 0xFFD76A)))
                                .offset(y: 6)
                        }
                    }
                Text(hidden ? "Surpriză" : b.name)
                    .font(.custom(AppFont.kidsHeavy, fixedSize: 4.6 * u))
                    .foregroundStyle(Color(hex: 0xF4EDDC))
                    .opacity(earned == nil ? 0.5 : 1)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56 * u)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(waiting ? "\(b.name): lipește-l în album" : earned != nil ? b.name : hidden ? "Surpriză, loc gol" : "\(b.name), loc gol")
    }

    private func endPage(paper: Color) -> some View {
        let missing = BadgeCatalog.stickers.count - badges.count(BadgeCatalog.stickers)
        return PageBox { u in
            ZStack {
                paper
                VStack(spacing: 1.4 * u) {
                    Text(missing == 0 ? "Ai toate abțibildurile!" : "Mai ai \(missing) de găsit")
                        .font(.custom(AppFont.kidsHeavy, fixedSize: 9.2 * u))
                    Text("ascultă, fă povești\nși caută surprizele")
                        .font(.custom(AppFont.hand, fixedSize: 7.8 * u)).opacity(0.8)
                }
                .multilineTextAlignment(.center)
                .foregroundStyle(Color(hex: 0xF4EDDC))
                .padding(.leading, 5 * u)
            }
        }
    }
}
