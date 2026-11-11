import SwiftUI

/// A story's cover: its picture when it has one, else the drawn scene (sky, glow, hills, emoji)
/// the web app draws, so a story looks the same in both apps.
struct StoryCover: View {
    let story: Story
    var cornerRadius: CGFloat = 12
    var showsEmoji = true
    @Environment(StoryStore.self) private var store
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            DrawnCover(scene: CoverScene.of(story), emoji: showsEmoji ? story.emoji : nil)
            if let image {
                Color(hex: 0xF4EFE6)
                // Fills the space it is given without asking for more: a square cover in a wide
                // hero must not push the hero's text off screen.
                Color.clear
                    .overlay { Image(uiImage: image).resizable().scaledToFill() }
                    .clipped()
                    .transition(.opacity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .task(id: story.coverKey) { await load() }
        .accessibilityHidden(true)
    }

    private func load() async {
        guard let key = story.coverKey else { image = nil; return }
        if let hit = CoverImages.shared.image(key) { image = hit; return }
        if let demo = DemoPhotos.cover(key) { image = demo; return }
        guard let links = store.links, let url = await links.url(for: key, ref: story.fileRef),
              let loaded = try? await URLSession.shared.data(from: url), let picture = UIImage(data: loaded.0) else { return }
        CoverImages.shared.keep(picture, key)
        withAnimation(.easeOut(duration: 0.2)) { image = picture }
    }
}

/// Covers already downloaded in this run, so scrolling back does not ask again.
@MainActor final class CoverImages {
    static let shared = CoverImages()
    private let cache = NSCache<NSString, UIImage>()
    func image(_ key: String) -> UIImage? { cache.object(forKey: key as NSString) }
    func keep(_ image: UIImage, _ key: String) { cache.setObject(image, forKey: key as NSString) }
}

/// The illustrated cover from src/components/StoryCover.tsx, drawn natively.
struct DrawnCover: View {
    let scene: CoverScene
    var emoji: String?

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                LinearGradient(colors: [Color(hex: scene.top), Color(hex: scene.bottom)], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(hex: scene.glow).opacity(0.75), .clear], center: UnitPoint(x: 0.5, y: 0.42),
                               startRadius: 0, endRadius: min(w, h) * 0.45)
                Ellipse().fill(Color(hex: scene.hill).opacity(0.75))
                    .frame(width: w * 1.1, height: h * 0.42)
                    .position(x: w * 0.2, y: h * 0.98)
                Ellipse().fill(Color(hex: scene.hill))
                    .frame(width: w * 1.2, height: h * 0.38)
                    .position(x: w * 0.85, y: h * 1.04)
                if let emoji {
                    Text(emoji)
                        .font(.system(size: min(w, h) * 0.38))
                        .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
                        .position(x: w / 2, y: h * 0.44)
                }
            }
        }
    }
}

/// A square cover with the title under it, for the shelves on Acasă and in Favorite.
struct CoverTile: View {
    let story: Story
    var width: CGFloat = 132

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            StoryCover(story: story)
                .frame(width: width, height: width)
                .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
            Text(story.title)
                .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
                .foregroundStyle(Theme.text)
                .lineLimit(1)
            if let minutes = story.minutesLabel {
                Text(minutes).font(.ktCaption).foregroundStyle(Theme.Night.muted)
            }
        }
        .frame(width: width, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
