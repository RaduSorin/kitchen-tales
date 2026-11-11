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
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
                    .transition(.opacity)
            } else {
                PlateDrawing(seed: recipe.title)
            }
        }
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

/// A plate seen from above with steam, in gold lines, on a dark warm tint picked from the title.
struct PlateDrawing: View {
    let seed: String

    private static let tints: [UInt32] = [0x4A3424, 0x3A2F22, 0x4A2A2E, 0x2E3A2A, 0x2C3242]

    var body: some View {
        let tint = Self.tints[Int(CoverScene.index(seed)) % Self.tints.count]
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            ZStack {
                RadialGradient(colors: [Color(hex: tint), Color(hex: 0x1E1612)], center: UnitPoint(x: 0.5, y: 0.4),
                               startRadius: 0, endRadius: max(geo.size.width, geo.size.height) * 0.75)
                Group {
                    Circle().stroke(Theme.accent, lineWidth: max(1.2, s * 0.03)).frame(width: s * 0.44, height: s * 0.44)
                    Circle().stroke(Theme.accent.opacity(0.85), lineWidth: max(1, s * 0.022)).frame(width: s * 0.26, height: s * 0.26)
                    Steam().stroke(Theme.accent, style: StrokeStyle(lineWidth: max(1, s * 0.025), lineCap: .round))
                        .frame(width: s * 0.3, height: s * 0.16)
                        .offset(y: -s * 0.31)
                }
                .offset(y: s * 0.05)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

private struct Steam: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        for i in 0..<3 {
            let x = r.minX + r.width * (0.15 + 0.35 * CGFloat(i))
            p.move(to: CGPoint(x: x, y: r.maxY))
            p.addCurve(to: CGPoint(x: x + r.width * 0.05, y: r.minY),
                       control1: CGPoint(x: x - r.width * 0.12, y: r.maxY - r.height * 0.35),
                       control2: CGPoint(x: x + r.width * 0.16, y: r.minY + r.height * 0.4))
        }
        return p
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
