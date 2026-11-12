import SwiftUI

/// Celebrates the badges just earned, one at a time, like the web: "Timbru nou" with the
/// postmark, or "Ura!" with the sticker. Its button opens the passport or the album at the
/// badge's page. Shown over the whole app (never over the kid-mode lock screen).
struct BadgeCelebration: View {
    @Environment(BadgeStore.self) private var badges
    @Environment(KidMode.self) private var kid
    @State private var placing: Badge?
    @State private var appear = false

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
            if let b = shown, placing == nil {
                Color.black.opacity(0.62).ignoresSafeArea()
                    .transition(.opacity)
                Group {
                    if b.kind == .stamp { stamp(b) } else { sticker(b) }
                }
                .id(b.id)
                .transition(.scale(scale: 0.85).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.75), value: shown?.id)
        .fullScreenCover(item: $placing) { b in
            NavigationStack {
                if b.kind == .stamp { PassportView(focus: b.id) } else { AlbumView() }
            }
            .environment(\.colorScheme, .dark)
        }
    }

    private func stamp(_ b: Badge) -> some View {
        let next = b.lvl.flatMap { lvl in BadgeCatalog.stamps.first { $0.art == b.art && ($0.lvl ?? 0) > lvl } }
        return VStack(spacing: 10) {
            Text("TIMBRU NOU")
                .font(.custom(AppFont.bodyBold, size: 13, relativeTo: .caption)).tracking(2)
                .foregroundStyle(Theme.accent)
            BadgeArt(badge: b, earned: badges.earnedDate(b) ?? Date())
                .frame(width: 250)
                .rotationEffect(.degrees(appear ? 0 : -8))
                .scaleEffect(appear ? 1 : 1.25)
                .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.55).delay(0.1)) { appear = true } }
                .onDisappear { appear = false }
            Text(b.name)
                .font(.custom(AppFont.displaySemibold, size: 26, relativeTo: .title))
                .foregroundStyle(Theme.text)
            Text(b.how + (next.map { " Următorul timbru: \($0.name)." } ?? ""))
                .font(.ktCallout).foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Pune în pașaport") { Haptics.success(); placing = b; badges.markSeen(b.id) }
                .buttonStyle(.ktPrimaryWide)
                .padding(.top, 8)
            Button("Gata") { badges.markSeen(b.id) }
                .font(.ktButton).foregroundStyle(Theme.muted)
                .frame(minHeight: 44)
        }
        .padding(24)
        .frame(maxWidth: 360)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Theme.surface))
        .padding(.horizontal, 20)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Timbru nou: \(b.name)")
    }

    private func sticker(_ b: Badge) -> some View {
        VStack(spacing: 12) {
            Text("Ura!")
                .font(.custom(AppFont.kidsHeavy, size: 52, relativeTo: .largeTitle))
                .foregroundStyle(Color(hex: 0xFFD76A))
                .shadow(color: Color(hex: 0xFFD76A).opacity(0.5), radius: 12)
            ZStack {
                Circle().fill(RadialGradient(colors: [Color(hex: 0xFFD76A).opacity(0.45), .clear], center: .center, startRadius: 0, endRadius: 140))
                    .frame(width: 280, height: 280)
                    .scaleEffect(appear ? 1.05 : 0.9)
                    .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: appear)
                ForEach(Array(Self.twinkles.enumerated()), id: \.offset) { _, t in
                    Image(systemName: "sparkle")
                        .font(.system(size: 16))
                        .foregroundStyle(Color(hex: 0xFFD76A))
                        .position(x: 240 * t.0 / 100, y: 240 * t.1 / 100)
                        .opacity(appear ? 1 : 0.2)
                        .animation(.easeInOut(duration: 1.2).repeatForever().delay(t.2), value: appear)
                }
                .frame(width: 240, height: 240)
                BadgeArt(badge: b, earned: Date())
                    .frame(width: 190)
                    .scaleEffect(appear ? 1 : 0.4)
                    .rotationEffect(.degrees(appear ? 0 : -20))
                    .animation(.spring(response: 0.55, dampingFraction: 0.5), value: appear)
            }
            .onAppear { appear = true }
            .onDisappear { appear = false }
            Text(b.name)
                .font(.custom(AppFont.kidsHeavy, size: 30, relativeTo: .title))
                .foregroundStyle(Color(hex: 0xFFF6D6))
            Text(b.how)
                .font(.custom(AppFont.kidsSemibold, size: 18, relativeTo: .body))
                .foregroundStyle(Color(hex: 0xFFF6D6).opacity(0.8))
                .multilineTextAlignment(.center)
            Button { Haptics.success(); placing = b; badges.putOff(b.id) } label: {
                Text("Lipește în album")
                    .font(.custom(AppFont.kidsHeavy, size: 20, relativeTo: .title3))
                    .foregroundStyle(Color(hex: 0x171A45))
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Capsule().fill(Color(hex: 0xFFD76A)))
            }
            .buttonStyle(PressableStyle())
            .padding(.top, 8)
            Button { badges.putOff(b.id) } label: {
                Text("Mai târziu")
                    .font(.custom(AppFont.kidsHeavy, size: 18, relativeTo: .body))
                    .foregroundStyle(Color(hex: 0xFFF6D6))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Capsule().fill(.white.opacity(0.12)))
            }
            .buttonStyle(PressableStyle())
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 400)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Abțibild nou: \(b.name)")
    }

    private static let twinkles: [(CGFloat, CGFloat, Double)] = [(8, 14, 0), (86, 22, 0.5), (14, 78, 0.9), (84, 80, 0.3), (48, 2, 1.2), (2, 48, 0.7), (94, 54, 1.4)]
}

/// The round button on the stories home that opens the album, with the newest sticker on it
/// and a dot while one waits to be stuck.
struct AlbumButton: View {
    @Environment(BadgeStore.self) private var badges
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
        .accessibilityLabel(waiting ? "Albumul meu: ai un abțibild de lipit" : "Albumul meu")
        .fullScreenCover(isPresented: $open) {
            NavigationStack { AlbumView() }
                .environment(\.colorScheme, .dark)
        }
    }
}
