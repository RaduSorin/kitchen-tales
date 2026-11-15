import SwiftUI

/// "Insigne" (concept C in design-polish/ios-medals/): the two medal books standing on a lit
/// shelf, each with its count; "Aproape gata" with the medals closest to being earned, as rings;
/// "Recente" with the newest. A book opens full screen, growing out of the shelf. Reached from
/// Profil and from the album button on Povești.
struct InsigneView: View {
    @Environment(BadgeStore.self) private var badges
    @Namespace private var shelf
    @State private var book: InsigneBook?
    @State private var open: Badge?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                shelfRow
                    .padding(.top, 26)
                nearly
                recent
            }
            .padding(.horizontal, 20)
            .padding(.bottom, KTTabBarMetrics.height + 28)
        }
        .scrollIndicators(.hidden)
        .background(NightBackdrop())
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(item: $book) { b in
            Group {
                switch b {
                case .passport: PassportView()
                case .album: AlbumView()
                }
            }
            .environment(\.colorScheme, .dark)
            .navigationTransition(.zoom(sourceID: b, in: shelf))
        }
        .sheet(item: $open) { BadgeSheet(badge: $0) }
        .task {
            // Screenshots open a book straight away.
            if LaunchOptions.screen == "passport" { book = .passport }
            if LaunchOptions.screen == "album" { book = .album }
        }
    }

    private var header: some View {
        let have = badges.count(BadgeCatalog.all)
        return VStack(alignment: .leading, spacing: 14) {
            KTBackButton()
            VStack(alignment: .leading, spacing: 4) {
                Text("Insigne")
                    .font(.custom(AppFont.storyDisplay, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(AlbumView.cream)
                Text("\(have) din \(BadgeCatalog.all.count) adunate")
                    .font(.custom(AppFont.body, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(.white.opacity(0.6))
                    .monospacedDigit()
            }
        }
    }

    // MARK: Shelf

    private var shelfRow: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 26) {
                shelfBook(.passport)
                shelfBook(.album)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .zIndex(1)
            ShelfBoard()
                .frame(height: 16)
                .padding(.top, -2)
            HStack(spacing: 26) {
                bookCount(.passport)
                bookCount(.album)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
        }
        .background(alignment: .bottom) {
            // The lamp over the shelf.
            RadialGradient(colors: [Color(hex: 0xFFD99A).opacity(0.28), .clear], center: UnitPoint(x: 0.5, y: 0.75), startRadius: 4, endRadius: 220)
                .frame(height: 300)
                .allowsHitTesting(false)
        }
    }

    private func shelfBook(_ b: InsigneBook) -> some View {
        let waiting = b == .album && BadgeCatalog.stickers.contains(where: badges.waiting)
        return Button {
            Haptics.tap()
            book = b
        } label: {
            Group {
                switch b {
                case .passport: PassportShelfCover()
                case .album: AlbumShelfCover()
                }
            }
            .aspectRatio(282 / 470 * 1.18, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .rotationEffect(.degrees(b == .passport ? -1.5 : 1.2), anchor: .bottom)
            .shadow(color: .black.opacity(0.55), radius: 10, x: 4, y: 6)
            .overlay(alignment: .topTrailing) {
                if waiting {
                    Circle().fill(Color(hex: 0xFF5F6D)).frame(width: 14, height: 14)
                        .overlay(Circle().strokeBorder(.black.opacity(0.35)))
                        .offset(x: 4, y: -4)
                }
            }
            .matchedTransitionSource(id: b, in: shelf)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(b == .passport ? "Pașaportul culinar" : (waiting ? "Albumul meu: ai un abțibild de lipit" : "Albumul meu"))
    }

    private func bookCount(_ b: InsigneBook) -> some View {
        let list = b == .passport ? BadgeCatalog.stamps : BadgeCatalog.stickers
        let have = badges.count(list)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(b == .passport ? "Timbre" : "Abțibilduri")
                    .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(AlbumView.cream)
                Spacer(minLength: 4)
                Text("\(have) / \(list.count)")
                    .font(.custom(AppFont.body, size: 13, relativeTo: .footnote)).monospacedDigit()
                    .foregroundStyle(.white.opacity(0.6))
            }
            BadgeBar(value: Double(have) / Double(max(list.count, 1)), tint: Color(hex: 0xF2C879), height: 5)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: Nearly there

    private struct NearRow: Identifiable {
        let badge: Badge
        let fraction: Double
        let have: Int
        let need: Int
        var id: String { badge.id }
    }

    /// The medals with the most done toward them, not yet earned (no secrets, no single steps).
    private var closest: [NearRow] {
        let rows: [NearRow] = BadgeCatalog.all.compactMap { b in
            guard !badges.earned(b), !b.secret, b.id != "an" else { return nil }
            let p = BadgeEngine.progress(b, badges.state)
            guard p.need > 1, p.have > 0 else { return nil }
            return NearRow(badge: b, fraction: Double(p.have) / Double(p.need), have: p.have, need: p.need)
        }
        return Array(rows.sorted { $0.fraction > $1.fraction }.prefix(4))
    }

    @ViewBuilder
    private var nearly: some View {
        let rows = closest
        if !rows.isEmpty {
            sectionTitle("Aproape gata")
            VStack(spacing: 10) {
                ForEach(rows) { row in
                    nearRow(row.badge, fraction: row.fraction, have: row.have, need: row.need)
                }
            }
        }
    }

    private func nearRow(_ b: Badge, fraction: Double, have: Int, need: Int) -> some View {
        Button { open = b } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().stroke(.white.opacity(0.1), lineWidth: 4)
                    Circle().trim(from: 0, to: fraction)
                        .stroke(Color(hex: 0xF2C879), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    BadgeArt(badge: b, earned: nil, plain: b.kind == .stamp)
                        .padding(10)
                        .opacity(0.85)
                }
                .frame(width: 58, height: 58)
                VStack(alignment: .leading, spacing: 3) {
                    Text(b.name)
                        .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .body))
                        .foregroundStyle(AlbumView.cream)
                    Text(b.how)
                        .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 4)
                Text("\(have) din \(need)")
                    .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote)).monospacedDigit()
                    .foregroundStyle(Color(hex: 0xF2C879))
                    .fixedSize()
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.07)))
        }
        .buttonStyle(PressableStyle())
        .accessibilityElement(children: .combine)
    }

    // MARK: Recent

    @ViewBuilder
    private var recent: some View {
        let list = badges.latest(BadgeCatalog.all, 8)
        if !list.isEmpty {
            sectionTitle("Recente")
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(list) { b in
                        Button { open = b } label: {
                            VStack(spacing: 6) {
                                BadgeArt(badge: b, earned: badges.earnedDate(b), plain: b.kind == .stamp)
                                    .frame(width: 64, height: 64)
                                Text(b.name)
                                    .font(.custom(AppFont.bodySemibold, size: 12, relativeTo: .caption))
                                    .foregroundStyle(AlbumView.cream)
                                    .lineLimit(1)
                                Text(Self.shortDay(badges.earnedDate(b)))
                                    .font(.custom(AppFont.body, size: 11, relativeTo: .caption2))
                                    .foregroundStyle(.white.opacity(0.5))
                            }
                            .frame(width: 86)
                            .padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.05)))
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.setLocalizedDateFormatFromTemplate("d MMM")
        return f
    }()

    private static func shortDay(_ d: Date?) -> String {
        guard let d else { return "" }
        return dayFormat.string(from: d).replacingOccurrences(of: ".", with: "")
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s)
            .font(.custom(AppFont.storyDisplay, size: 22, relativeTo: .title3))
            .foregroundStyle(AlbumView.cream)
            .padding(.top, 30)
            .padding(.bottom, 12)
    }
}

/// The two books on the shelf.
enum InsigneBook: String, Identifiable, Hashable {
    case passport, album
    var id: String { rawValue }
}

/// A wooden shelf board, lit from above.
private struct ShelfBoard: View {
    var body: some View {
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 3)
                .fill(LinearGradient(colors: [Color(hex: 0x8A5A34), Color(hex: 0x5E3A1F), Color(hex: 0x3A2312)], startPoint: .top, endPoint: .bottom))
            Rectangle().fill(Color(hex: 0xE2B07A).opacity(0.7)).frame(height: 1.5)
        }
        .shadow(color: .black.opacity(0.6), radius: 10, y: 8)
        .accessibilityHidden(true)
    }
}

/// The passport standing on the shelf: leather, gold foil emblem and title.
private struct PassportShelfCover: View {
    var body: some View {
        GeometryReader { geo in
            let u = geo.size.width / 100
            ZStack {
                RoundedRectangle(cornerRadius: 4 * u, style: .continuous).fill(PassportView.leather)
                RoundedRectangle(cornerRadius: 4 * u, style: .continuous)
                    .fill(LinearGradient(colors: [.white.opacity(0.12), .clear, .black.opacity(0.25)], startPoint: .topLeading, endPoint: .bottomTrailing))
                VStack(spacing: 5 * u) {
                    Image.badgeArt("emblem").resizable().renderingMode(.template).scaledToFit()
                        .frame(width: 40 * u).foregroundStyle(PassportView.foil)
                    Text("PAȘAPORT\nCULINAR")
                        .font(.custom(AppFont.displaySemibold, fixedSize: 8.5 * u)).tracking(1.6 * u)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(PassportView.foil)
                }
                // The spine's crease.
                HStack {
                    Rectangle().fill(.black.opacity(0.25)).frame(width: 1.2 * u).padding(.leading, 6 * u)
                    Spacer()
                }
            }
        }
    }
}

/// The album standing on the shelf: cardboard cover, wire on the left, a paper label.
private struct AlbumShelfCover: View {
    var body: some View {
        GeometryReader { geo in
            let u = geo.size.width / 100
            ZStack(alignment: .leading) {
                CardboardTexture(color: AlbumView.coverPaper, seed: 1)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 1.5 * u, bottomLeadingRadius: 1.5 * u, bottomTrailingRadius: 5 * u, topTrailingRadius: 5 * u))
                PunchedHoles()
                VStack(spacing: 1.5 * u) {
                    Text("Albumul meu").font(.custom(AppFont.storyDisplay, fixedSize: 10 * u))
                    Text("abțibilduri").font(.custom(AppFont.hand, fixedSize: 8 * u))
                }
                .foregroundStyle(Color(hex: 0x3A2613))
                .padding(.vertical, 5 * u)
                .frame(width: 66 * u)
                .background(RoundedRectangle(cornerRadius: 1 * u).fill(Color(hex: 0xF1E6CF)))
                .overlay(alignment: .top) {
                    TapeStrip(color: Color(hex: 0xF5B453), seed: 4).frame(width: 22 * u, height: 7 * u).rotationEffect(.degrees(-4)).offset(y: -4 * u)
                }
                .rotationEffect(.degrees(-3))
                .offset(x: 20 * u)
            }
        }
    }
}

/// Profil: one card for the medals, both books' counts and the newest three; opens "Insigne".
struct InsigneCard: View {
    let open: () -> Void
    @Environment(BadgeStore.self) private var badges

    var body: some View {
        let stamps = badges.count(BadgeCatalog.stamps)
        let stickers = badges.count(BadgeCatalog.stickers)
        let latest = badges.latest(BadgeCatalog.all, 3)
        let waiting = BadgeCatalog.stickers.contains(where: badges.waiting)
        Button(action: open) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text("Insigne")
                            .font(.custom(AppFont.storyDisplay, size: 19, relativeTo: .headline))
                            .foregroundStyle(Theme.text)
                        if waiting {
                            Circle().fill(Color(hex: 0xFF5F6D)).frame(width: 8, height: 8)
                        }
                    }
                    Text("\(stamps) din \(BadgeCatalog.stamps.count) timbre · \(stickers) din \(BadgeCatalog.stickers.count) abțibilduri")
                        .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                        .monospacedDigit()
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                HStack(spacing: -10) {
                    ForEach(latest) { b in
                        BadgeArt(badge: b, earned: badges.earnedDate(b), plain: true)
                            .frame(width: 42, height: 42)
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.08)))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(waiting ? "Insigne: ai un abțibild de lipit" : "Insigne")
        .accessibilityValue("\(stamps) din \(BadgeCatalog.stamps.count) timbre, \(stickers) din \(BadgeCatalog.stickers.count) abțibilduri")
    }
}
