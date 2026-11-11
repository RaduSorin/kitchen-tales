import SwiftUI

/// "Raft cu vitrină" (the web's components/BookShelf.tsx): the folder's stories stand on wooden
/// shelves with their spines out, and the chosen one's cover sits in the window above. Tap a
/// spine to choose it, tap it again (or the cover) to listen; ‹ › step to the next book.
struct BookShelfView: View {
    let stories: [Story]
    let folderName: String
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @AppStorage(PhoneSettings.shelfClickKey) private var shelfClick = true
    @State private var chosen: String?
    @State private var width: CGFloat = 0

    private static let gap: CGFloat = 3
    private static let full: CGFloat = 180

    var body: some View {
        let sel = stories.first { $0.id == (chosen ?? Self.pick(folderName)) } ?? stories.first
        VStack(spacing: 18) {
            if let sel { window(sel) }
            VStack(spacing: 0) {
                ForEach(Array(rows().enumerated()), id: \.offset) { _, row in
                    shelf(row, sel: sel)
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        }
        .padding(.horizontal, 16)
    }

    // MARK: The window

    private func window(_ s: Story) -> some View {
        let i = stories.firstIndex { $0.id == s.id } ?? 0
        return VStack(spacing: 8) {
            HStack(spacing: 18) {
                arrow("chevron.left", enabled: i > 0) { choose(stories[i - 1].id) }
                Button { open(s) } label: {
                    StoryCover(story: s, cornerRadius: 24)
                        .frame(width: 180, height: 180)
                        .shadow(color: .black.opacity(0.4), radius: 17, y: 16)
                        .id(s.id)
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("Ascultă „\(s.title)”")
                arrow("chevron.right", enabled: i < stories.count - 1) { choose(stories[i + 1].id) }
            }
            Text(s.title)
                .font(.ktStoryTitle)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(Self.meta(s))
                .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                .foregroundStyle(Theme.Night.muted)
        }
        .animation(.snappy, value: s.id)
    }

    private func arrow(_ symbol: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.text.opacity(enabled ? 0.8 : 0.2))
                .frame(width: 36, height: 44)
        }
        .disabled(!enabled)
    }

    // MARK: The shelves

    private func rows() -> [[Story]] {
        guard width > 0 else { return [stories] }
        var rows: [[Story]] = []
        var cur: [Story] = []
        var used: CGFloat = 0
        for s in stories {
            let w = Self.spineWidth(s) + Self.gap
            if used + w > width - 20, !cur.isEmpty { rows.append(cur); cur = []; used = 0 }
            cur.append(s); used += w
        }
        if !cur.isEmpty { rows.append(cur) }
        return rows
    }

    private func shelf(_ row: [Story], sel: Story?) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: Self.gap) {
                ForEach(row) { s in
                    let on = s.id == sel?.id
                    Button {
                        if on { open(s) } else { choose(s.id) }
                    } label: {
                        Spine(story: s, on: on)
                            .frame(width: Self.spineWidth(s), height: Self.spineHeight(s.title))
                    }
                    .buttonStyle(.plain)
                    .offset(y: on ? -18 : 0)
                    .zIndex(on ? 1 : 0)
                    .accessibilityLabel(s.title)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .bottom) {
                EllipticalGradient(colors: [Theme.accent.opacity(0.14), Theme.accent.opacity(0.04), .clear],
                                   center: .bottom, endRadiusFraction: 0.75)
                    .frame(height: Self.full * 0.75)
                    .allowsHitTesting(false)
            }
            // The plank the books stand on.
            RoundedRectangle(cornerRadius: 3)
                .fill(LinearGradient(colors: [Color(hex: 0x3A2C22), Color(hex: 0x1D1611)], startPoint: .top, endPoint: .bottom))
                .overlay(alignment: .top) { Rectangle().fill(Theme.accent.opacity(0.55)).frame(height: 1) }
                .frame(height: 13)
                .shadow(color: .black.opacity(0.6), radius: 9, y: 10)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: sel?.id)
    }

    private func choose(_ id: String) {
        guard id != chosen else { return }
        chosen = id
        UserDefaults.standard.set(id, forKey: Self.pickKey(folderName))
        if shelfClick { Haptics.select() }
    }

    private func open(_ s: Story) {
        Haptics.tap()
        Task { await player.play(s, queue: stories, store: store) }
        player.showsPlayer = true
    }

    // MARK: Sizes (src/lib/shelf.ts)

    private static func pickKey(_ folder: String) -> String { "kt-shelf-pick-\(folder)" }
    static func pick(_ folder: String) -> String? { UserDefaults.standard.string(forKey: pickKey(folder)) }

    /// Thicker for a longer story: 22 pt up to 3 minutes, 2.5 pt more per minute, 52 pt from 15.
    nonisolated static func spineWidth(_ s: Story) -> CGFloat {
        guard let d = s.durationSec, d > 0 else { return 36 }
        let min = Swift.min(15, Swift.max(3, d / 60))
        return CGFloat((22 + (min - 3) * 2.5).rounded())
    }

    /// 86–100% of the shelf's book height, from the title (FNV-1a, like the web).
    nonisolated static func spineHeight(_ title: String, full: CGFloat = 180) -> CGFloat {
        var h: UInt32 = 2166136261
        for c in title.unicodeScalars { h ^= c.value; h = h &* 16777619 }
        return CGFloat((Double(full) * (0.86 + 0.14 * Double(h % 1000) / 1000)).rounded())
    }

    /// "12 min · continuă de la 3:12" (bookMeta).
    static func meta(_ s: Story) -> String {
        var parts: [String] = []
        if let m = s.minutesLabel { parts.append(m) }
        let pos = PlaybackMemory.position(s.id)
        parts.append(pos > 5 ? "continuă de la \(clockTime(pos))" : "apasă pe copertă ca s-o asculți")
        return parts.joined(separator: " · ")
    }
}

/// What is printed on a spine (collector's edition): two gold bands, the title in gold from top
/// to bottom, a heart for a favourite, a small moon and the length at the foot; the cloth is the
/// cover's colour, darkened. A gold ribbon hangs from the book you were listening to.
private struct Spine: View {
    let story: Story
    let on: Bool

    var body: some View {
        let c = Color(hex: CoverScene.of(story).top)
        ZStack(alignment: .topTrailing) {
            UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 2, bottomTrailingRadius: 2, topTrailingRadius: 4)
                .fill(LinearGradient(colors: [c.mix(with: .black, by: 0.38), c.mix(with: .black, by: 0.6)], startPoint: .top, endPoint: .bottom))
                .overlay {
                    LinearGradient(stops: [.init(color: .white.opacity(0.12), location: 0), .init(color: .clear, location: 0.25),
                                           .init(color: .clear, location: 0.6), .init(color: .black.opacity(0.45), location: 1)],
                                   startPoint: .leading, endPoint: .trailing)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 2, bottomTrailingRadius: 2, topTrailingRadius: 4))
                }
            VStack(spacing: 6) {
                band
                // The title runs top to bottom; its slot is as tall as the spine allows.
                GeometryReader { g in
                    Text(story.title)
                        .font(.custom(AppFont.storyDisplay, size: 13.5, relativeTo: .caption))
                        .tracking(0.3)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(width: g.size.height, height: g.size.width)
                        .rotationEffect(.degrees(90))
                        .position(x: g.size.width / 2, y: g.size.height / 2)
                }
                if story.favorite {
                    Image(systemName: "heart.fill").font(.system(size: 9))
                }
                band
                Image(systemName: "moon.fill").font(.system(size: 10))
                if let d = story.durationSec, d > 0 {
                    Text("\(max(1, Int((d / 60).rounded())))′")
                        .font(.custom(AppFont.bodyBold, size: 9, relativeTo: .caption2))
                        .opacity(0.8)
                }
            }
            .foregroundStyle(Theme.accent)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            if PlaybackMemory.position(story.id) > 5 {
                Rectangle().fill(Theme.accent).frame(width: 7, height: 28).padding(.trailing, 4)
                    .shadow(color: .black.opacity(0.5), radius: 1, y: 1)
            }
        }
        .overlay {
            if on {
                UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 2, bottomTrailingRadius: 2, topTrailingRadius: 4)
                    .strokeBorder(Theme.accent, lineWidth: 1.5)
            }
        }
        .shadow(color: .black.opacity(on ? 0.6 : 0.4), radius: on ? 12 : 0, x: on ? 0 : 1, y: on ? 14 : 0)
    }

    private var band: some View {
        Rectangle()
            .fill(.clear)
            .frame(height: 4)
            .overlay(alignment: .top) { Rectangle().frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().frame(height: 1) }
            .opacity(0.8)
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity)
            .scaleEffect(x: 0.7)
    }
}
