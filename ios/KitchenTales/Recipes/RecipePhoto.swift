import SwiftUI
import UIKit

/// A recipe's photo (or one of its step photos), loaded through the files Lambda like the web;
/// without one, the gold line-drawn plate on a warm tinted background (PlatePlaceholder.tsx).
struct RecipePhoto: View {
    let recipe: Recipe
    var key: String?
    var cornerRadius: CGFloat = 14
    @Environment(RecipeStore.self) private var store
    @State private var image: UIImage?

    init(recipe: Recipe, key: String? = nil, cornerRadius: CGFloat = 14) {
        self.recipe = recipe
        self.key = key ?? recipe.photoKey
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        // The clear base takes the size it is given, so a wide photo is cropped, never widens the layout.
        Color.clear
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                        .transition(.opacity)
                } else {
                    PlateDrawing(seed: recipe.title)
                }
            }
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .task(id: key ?? recipe.demoPhoto) { await load() }
        .accessibilityHidden(true)
    }

    private func load() async {
        if key == recipe.photoKey, let demo = recipe.demoPhoto {
            image = DemoPhotos.image(demo)
            return
        }
        guard let key else { image = nil; return }
        if let hit = CoverImages.shared.image(key) { image = hit; return }
        guard let links = store.links, let url = await links.url(for: key, ref: recipe.fileRef),
              let loaded = try? await URLSession.shared.data(from: url), let picture = UIImage(data: loaded.0) else { return }
        CoverImages.shared.keep(picture, key)
        withAnimation(.easeOut(duration: 0.2)) { image = picture }
    }
}

/// The dish photos bundled for screenshots (Resources/Demo).
@MainActor enum DemoPhotos {
    private static var loaded: [String: UIImage] = [:]
    static func image(_ name: String) -> UIImage? {
        if let hit = loaded[name] { return hit }
        guard let url = Bundle.main.url(forResource: "demo-\(name)", withExtension: "jpg"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        loaded[name] = image
        return image
    }
}

/// A recipe without a photo (PlatePlaceholder.tsx): a small gold steaming plate on a dark card
/// tinted in a warm colour picked from the title; outside its square the card has the tint's
/// dark edge colour, so it fills a thumbnail, a wide card or a hero the same way.
struct PlateDrawing: View {
    let seed: String

    static let tints: [(UInt32, UInt32)] = [(0xA05A3C, 0x24160E), (0x5A7846, 0x151A11), (0x8C3C50, 0x200F15),
                                            (0xA07832, 0x22180B), (0x46647E, 0x10161D), (0x7A4E8C, 0x19111E)]

    /// The web's string hash: h = h * 31 + code point, in 32 bits, then its absolute value.
    nonisolated static func index(_ seed: String) -> Int {
        var h: Int32 = 0
        for c in seed.unicodeScalars { h = h &* 31 &+ Int32(bitPattern: c.value) }
        return Int(h.magnitude % UInt32(tints.count))
    }

    var body: some View {
        let (tint, edge) = Self.tints[Self.index(seed)]
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            ZStack {
                Color(hex: edge)
                RadialGradient(colors: [Color(hex: tint).opacity(0.85), Color(hex: edge)], center: .center, startRadius: 0, endRadius: s * 0.5)
                    .frame(width: s, height: s)
                    .offset(y: -s * 0.04)
                Canvas { ctx, size in
                    let u = size.width / 100
                    let style = StrokeStyle(lineWidth: 1.6 * u, lineCap: .round)
                    ctx.stroke(Path(ellipseIn: CGRect(x: 35 * u, y: 40 * u, width: 30 * u, height: 30 * u)), with: .color(Theme.accent), style: style)
                    ctx.stroke(Path(ellipseIn: CGRect(x: 40.2 * u, y: 45.2 * u, width: 19.6 * u, height: 19.6 * u)),
                               with: .color(Theme.accent.opacity(0.6)), style: style)
                    var steam = Path()
                    for x in [43.0, 50.0, 57.0] {
                        steam.move(to: CGPoint(x: x * u, y: 38.5 * u))
                        steam.addCurve(to: CGPoint(x: (x + 2.8) * u, y: 32.9 * u),
                                       control1: CGPoint(x: x * u, y: 35.7 * u), control2: CGPoint(x: (x + 2.8) * u, y: 35.7 * u))
                    }
                    ctx.stroke(steam, with: .color(Theme.accent.opacity(0.8)), style: style)
                }
                .frame(width: s, height: s)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

extension View {
    /// The recipes background: warm near-black with a soft copper light at the top.
    func ktKitchenBackground() -> some View {
        background {
            ZStack {
                Theme.background
                RadialGradient(colors: [Color(hex: 0xBE7A3E).opacity(0.3), .clear], center: UnitPoint(x: 0.25, y: 0),
                               startRadius: 0, endRadius: 420)
            }
            .ignoresSafeArea()
        }
        .scrollContentBackground(.hidden)
    }
}
