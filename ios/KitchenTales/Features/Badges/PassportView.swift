import SwiftUI

/// Splits a list into pages of at most `max`, as evenly as possible (13 by 4: 4, 3, 3, 3).
func badgePages<T>(_ list: [T], max: Int) -> [[T]] {
    let n = (list.count + max - 1) / max
    var out: [[T]] = []
    var i = 0
    for p in 0..<n {
        let size = (list.count - i + (n - p) - 1) / (n - p)
        out.append(Array(list[i..<(i + size)]))
        i += size
    }
    return out
}

/// Profil › "Pașaportul culinar", like the web: the recipe stamps as visas in a passport turned
/// page by page. A leather cover, the holder's page, then four visas a page, chapter by chapter,
/// each chapter in its own ink.
struct PassportView: View {
    /// A stamp just earned: the passport turns to its page.
    var focus: String? = nil
    @Environment(BadgeStore.self) private var badges
    @Environment(AuthModel.self) private var auth
    @State private var page = LaunchOptions.screen == "passport" ? 2 : 0
    @State private var open: Badge?

    static let inks: [String: Color] = [
        "Adăugare": Color(hex: 0xA8424F), "La gătit": Color(hex: 0x2F7A6D), "Plan și caiet": Color(hex: 0x3F5F9E),
        "Familie": Color(hex: 0xA8742A), "Surprize": Color(hex: 0x6D4C9A),
    ]

    private struct Visa { let group: String; let badges: [Badge]; let first: Int }

    private var visas: [Visa] {
        var out: [Visa] = []
        var no = 0
        for g in BadgeCatalog.stampGroups {
            for part in badgePages(BadgeCatalog.stamps.filter { $0.group == g }, max: 4) {
                out.append(Visa(group: g, badges: part, first: no))
                no += part.count
            }
        }
        return out
    }

    var body: some View {
        let visas = self.visas
        let count = visas.count + 3
        VStack(spacing: 12) {
            KTPageHeader(title: "Pașaportul culinar")
                .padding(.horizontal, 20)
            GeometryReader { geo in
                let w = min(geo.size.width - 48, (geo.size.height) * 282 / 470, 380)
                PageCurl(count: count, index: $page) { i in
                    Group {
                        if i == 0 { cover }
                        else if i == 1 { holder }
                        else if i - 2 < visas.count { visaPage(visas[i - 2], number: i) }
                        else { endPage(number: i) }
                    }
                    .frame(width: w, height: w * 470 / 282)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: w * 0.018, bottomLeadingRadius: w * 0.018, bottomTrailingRadius: w * 0.05, topTrailingRadius: w * 0.05))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: w, height: w * 470 / 282)
                .shadow(color: .black.opacity(0.45), radius: 18, y: 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Text("Glisează sau atinge marginea paginii ca să răsfoiești.")
                .font(.ktFootnote).foregroundStyle(Theme.muted)
                .padding(.bottom, KTTabBarMetrics.height + 16)
        }
        .background(ProfileBackdrop())
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: $open) { BadgeSheet(badge: $0) }
        .task {
            guard let focus, let i = visas.firstIndex(where: { $0.badges.contains { $0.id == focus } }) else { return }
            try? await Task.sleep(for: .milliseconds(450))
            page = i + 2
        }
    }

    // MARK: Pages

    private var who: String {
        let name = auth.account?.displayName ?? ""
        return name.isEmpty ? (auth.account?.email?.split(separator: "@").first.map(String.init) ?? "Bucătar") : name
    }

    private var since: Date { badges.state.since.flatMap(BadgeEngine.date) ?? Date() }

    private var ymd: String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: since)
        return String(format: "%02d%02d%02d", (c.year ?? 0) % 100, c.month ?? 0, c.day ?? 0)
    }

    private var cover: some View {
        PageBox { u in
            ZStack {
                Color(hex: 0x5A1C29)
                LinearGradient(stops: [.init(color: .black.opacity(0.35), location: 0), .init(color: .clear, location: 0.05),
                                       .init(color: .clear, location: 0.06), .init(color: .black.opacity(0.18), location: 0.064), .init(color: .clear, location: 0.07)],
                               startPoint: .leading, endPoint: .trailing)
                RadialGradient(colors: [.white.opacity(0.1), .clear], center: UnitPoint(x: 0.45, y: 0.25), startRadius: 0, endRadius: 70 * u)
                VStack(spacing: 5 * u) {
                    Image("emblem").resizable().renderingMode(.template).scaledToFit().frame(width: 37 * u).foregroundStyle(Self.foil)
                    Text("PAȘAPORT\nCULINAR")
                        .font(.custom(AppFont.displaySemibold, fixedSize: 7.4 * u)).tracking(1.8 * u)
                        .multilineTextAlignment(.center).lineSpacing(2 * u)
                        .foregroundStyle(Self.foil)
                    Text("REȚETELE MELE")
                        .font(.custom(AppFont.bodySemibold, fixedSize: 3.5 * u)).tracking(1.2 * u)
                        .foregroundStyle(Self.foil)
                    Image(systemName: "cpu").font(.system(size: 6 * u, weight: .light)).foregroundStyle(Self.foil).padding(.top, 6 * u)
                }
                VStack {
                    Spacer()
                    Text("Glisează ca să deschizi")
                        .font(.custom(AppFont.bodySemibold, fixedSize: 3.9 * u))
                        .foregroundStyle(Color(hex: 0xDFBD6C).opacity(0.6))
                        .padding(.bottom, 6.4 * u)
                }
            }
        }
        .accessibilityLabel("Pașaportul culinar, coperta")
    }

    static let foil = LinearGradient(colors: [Color(hex: 0xA9853F), Color(hex: 0xF4DFA2), Color(hex: 0xB48F47), Color(hex: 0xECD28C), Color(hex: 0xA9853F)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing)

    private var holder: some View {
        let ink = Self.inks["Adăugare"]!
        let have = badges.count(BadgeCatalog.stamps)
        let total = BadgeCatalog.stamps.count
        let issued: String = {
            let f = DateFormatter()
            f.locale = Locale(identifier: "ro_RO")
            f.dateFormat = "dd MMM yyyy"
            return f.string(from: since).replacingOccurrences(of: ".", with: "").uppercased()
        }()
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                VisaPaper(ink: ink, watermark: false)
                VisaHead(title: "Pașaport culinar", number: "RO", ink: ink, u: u)
                RoundedRectangle(cornerRadius: 1.4 * u).fill(.white.opacity(0.35))
                    .overlay(RoundedRectangle(cornerRadius: 1.4 * u).strokeBorder(ink, lineWidth: 1))
                    .overlay(Image("emblem").resizable().renderingMode(.template).scaledToFit().frame(width: 26 * u).foregroundStyle(ink))
                    .frame(width: 34 * u, height: 42.5 * u)
                    .offset(x: 7.8 * u, y: 20.6 * u)
                VStack(alignment: .leading, spacing: 2.5 * u) {
                    field("Titular", who, ink, u)
                    field("Bucătăria", "Kitchen Tales", ink, u)
                    field("Eliberat la", issued, ink, u)
                    field("Vize", "\(have) din \(total)", ink, u)
                }
                .frame(width: 49 * u, alignment: .leading)
                .offset(x: 46 * u, y: 19.9 * u)
                Text(who)
                    .font(.custom(AppFont.hand, fixedSize: 9.2 * u)).foregroundStyle(Color(hex: 0x2B3A67))
                    .lineLimit(1)
                    .rotationEffect(.degrees(-4))
                    .offset(x: 8.5 * u, y: 67 * u)
                VStack(spacing: 2.5 * u) {
                    ForEach(BadgeCatalog.stampGroups, id: \.self) { g in
                        let list = BadgeCatalog.stamps.filter { $0.group == g }
                        let got = badges.count(list)
                        VStack(spacing: 0.6 * u) {
                            HStack {
                                Text(g.uppercased(with: Locale(identifier: "ro"))).tracking(0.3 * u)
                                Spacer()
                                Text("\(got) / \(list.count)").monospacedDigit()
                            }
                            .font(.custom(AppFont.bodySemibold, fixedSize: 3.5 * u))
                            .foregroundStyle(Color(hex: 0x5B4549))
                            GeometryReader { bar in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color(hex: 0x5A3C40).opacity(0.15))
                                    Capsule().fill(Self.inks[g] ?? ink).frame(width: bar.size.width * Double(got) / Double(list.count))
                                }
                            }
                            .frame(height: 1 * u)
                        }
                    }
                }
                .frame(width: 86.5 * u)
                .offset(x: 7.8 * u, y: 87 * u)
                VStack(alignment: .leading, spacing: 0.6 * u) {
                    Text(mrzLine("P<RO\(Self.mrz(who))<<BUCATAR"))
                    Text(mrzLine("KT\(ymd)RO<<\(String(format: "%02d", have))<\(total)"))
                }
                .font(.system(size: 3.3 * u, weight: .medium, design: .monospaced)).tracking(0.33 * u)
                .foregroundStyle(Color(hex: 0x3C282C).opacity(0.6))
                .lineLimit(1)
                .frame(width: 89 * u, alignment: .leading).clipped()
                .offset(x: 7 * u, y: 147 * u)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func mrzLine(_ s: String) -> String { String((s + String(repeating: "<", count: 44)).prefix(44)) }

    static func mrz(_ s: String) -> String {
        let plain = s.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "ro")).uppercased()
        var out = ""
        var gap = false
        for c in plain.unicodeScalars {
            if ("A"..."Z").contains(c) || ("0"..."9").contains(c) { out.unicodeScalars.append(c); gap = false }
            else if !gap { out += "<"; gap = true }
        }
        return out
    }

    private func field(_ label: String, _ value: String, _ ink: Color, _ u: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0.3 * u) {
            Text(label.uppercased(with: Locale(identifier: "ro")))
                .font(.custom(AppFont.bodySemibold, fixedSize: 2.7 * u)).tracking(0.43 * u)
                .foregroundStyle(ink.opacity(0.85))
            Text(value)
                .font(.custom(AppFont.bodyBold, fixedSize: 4.6 * u)).monospacedDigit()
                .foregroundStyle(Color(hex: 0x3A2B2E))
                .lineLimit(1)
        }
    }

    private func visaPage(_ visa: Visa, number: Int) -> some View {
        let ink = Self.inks[visa.group] ?? .brown
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                VisaPaper(ink: ink, watermark: true)
                VisaHead(title: "Vize · \(visa.group)", number: String(format: "%02d", number), ink: ink, u: u)
                let cols = [GridItem(.flexible(), spacing: 2.8 * u), GridItem(.flexible(), spacing: 2.8 * u)]
                LazyVGrid(columns: cols, spacing: 2.8 * u) {
                    ForEach(Array(visa.badges.enumerated()), id: \.element.id) { k, b in
                        cell(b, no: visa.first + k + 1, tilt: [-4, 3, 2.5, -3][k], ink: ink, u: u)
                    }
                }
                .frame(width: 89.3 * u)
                .offset(x: 6.4 * u, y: 15.6 * u)
                folio(number: number, ink: ink, u: u)
            }
        }
    }

    private func cell(_ b: Badge, no: Int, tilt: Double, ink: Color, u: CGFloat) -> some View {
        let earned = badges.earnedDate(b)
        let hidden = b.secret && earned == nil
        return Button { open = b } label: {
            VStack(spacing: 0) {
                BadgeArt(badge: b, earned: earned, onPaper: true)
                    .frame(width: 37 * u)
                    .rotationEffect(.degrees(earned != nil ? tilt : 0))
                    .padding(.leading, 4.3 * u)
                    .blendMode(earned != nil ? .multiply : .normal)
                if earned != nil {
                    Text(b.name)
                        .font(.custom(AppFont.hand, fixedSize: 6 * u)).foregroundStyle(Color(hex: 0x2B3A67))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .rotationEffect(.degrees(-2))
                        .padding(.top, 0.7 * u)
                } else {
                    Text((hidden ? "Surpriză" : b.name).uppercased(with: Locale(identifier: "ro")))
                        .font(.custom(AppFont.bodySemibold, fixedSize: 3 * u)).tracking(0.42 * u)
                        .foregroundStyle(ink.opacity(0.7))
                        .lineLimit(1)
                        .padding(.top, 2.1 * u)
                }
            }
            .padding(.horizontal, 1.4 * u)
            .frame(maxWidth: .infinity)
            .frame(height: 56 * u)
            .overlay(alignment: .topLeading) {
                Text(String(format: "VIZA %02d", no))
                    .font(.system(size: 2.8 * u, weight: .semibold, design: .monospaced)).tracking(0.34 * u)
                    .foregroundStyle(ink.opacity(0.8))
                    .padding(.leading, 2.1 * u).padding(.top, 1.4 * u)
            }
            .background(RoundedRectangle(cornerRadius: 1 * u).strokeBorder(ink, style: StrokeStyle(lineWidth: 1, dash: [1, 2])))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(hidden ? "Surpriză" : "\(b.name)\(earned == nil ? ", lipsă" : "")")
    }

    private func folio(number: Int, ink: Color, u: CGFloat, left: String? = nil) -> some View {
        VStack {
            Spacer()
            HStack {
                Text(left ?? "KT·\(ymd.prefix(4))").opacity(0.7)
                Spacer()
                Text(String(format: "%02d", number))
            }
            .font(.system(size: 3.5 * u, weight: .semibold, design: .monospaced)).tracking(0.5 * u)
            .foregroundStyle(ink)
            .padding(.leading, 7 * u).padding(.trailing, 5.7 * u).padding(.bottom, 3.2 * u)
        }
    }

    private func endPage(number: Int) -> some View {
        let ink = Self.inks["Plan și caiet"]!
        return PageBox { u in
            ZStack(alignment: .topLeading) {
                VisaPaper(ink: ink, watermark: true)
                VisaHead(title: "Vize", number: String(format: "%02d", number), ink: ink, u: u)
                VStack {
                    Spacer()
                    HStack {
                        Text("pagini libere pentru ce urmează").opacity(0.7)
                        Spacer()
                    }
                    .font(.system(size: 3.5 * u, weight: .semibold, design: .monospaced))
                    .foregroundStyle(ink)
                    .padding(.leading, 7 * u).padding(.bottom, 3.2 * u)
                }
            }
        }
    }
}

/// A page of a book, laid out in hundredths of its width (the web's cqw).
struct PageBox<Content: View>: View {
    @ViewBuilder let content: (CGFloat) -> Content

    var body: some View {
        GeometryReader { geo in
            content(geo.size.width / 100)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
    }
}

/// The visa paper: cream, the chapter's security print and, faintly, the emblem.
private struct VisaPaper: View {
    let ink: Color
    let watermark: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(hex: 0xF0EADB)
                Image("guilloche").resizable().renderingMode(.template).foregroundStyle(ink)
                if watermark {
                    Image("emblem").resizable().renderingMode(.template).scaledToFit()
                        .frame(width: geo.size.width * 0.74)
                        .foregroundStyle(ink.opacity(0.09))
                        .position(x: geo.size.width / 2, y: geo.size.height * 0.52)
                }
            }
        }
    }
}

/// The line at the top of a visa page: its title and number over a double rule.
private struct VisaHead: View {
    let title: String
    let number: String
    let ink: Color
    let u: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(title.uppercased(with: Locale(identifier: "ro")))
                Spacer()
                Text(number).monospacedDigit().opacity(0.8)
            }
            .font(.custom(AppFont.bodyBold, fixedSize: 3.5 * u)).tracking(0.63 * u)
            .foregroundStyle(ink)
            .padding(.bottom, 1.8 * u)
            VStack(spacing: 1) {
                Rectangle().fill(ink).frame(height: 1)
                Rectangle().fill(ink).frame(height: 1)
            }
        }
        .padding(.leading, 7 * u).padding(.trailing, 5.7 * u).padding(.top, 5 * u)
    }
}
