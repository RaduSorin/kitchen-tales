import SwiftUI
import UIKit

/// A recipe's photo (or one of its step photos), loaded through the files Lambda like the web;
/// without one, the "Etichetă" label in the colour of its category (`RecipeLabel`).
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
                    RecipeLabel(title: recipe.title, category: recipe.category)
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

    /// A bundled story cover for a `demo:` key (screenshots only).
    static func cover(_ key: String) -> UIImage? {
        key.hasPrefix("demo:") ? image(String(key.dropFirst(5))) : nil
    }
}

/// A recipe without a photo, as drawn in the "Etichetă" concept: a dark card tinted by the recipe's
/// category, with a thin gold frame, the category in small gold capitals, the title in the serif
/// and a short gold rule. Below 90 pt wide only the category's gold line drawing is shown
/// (a bowl, a pan, a loaf or a glass), so thumbnails stay readable.
struct RecipeLabel: View {
    let title: String
    let category: String

    enum Kind: Equatable { case bowl, pan, bread, glass }

    /// The drawing for a category, from words in its name (the user names categories freely).
    nonisolated static func kind(_ category: String) -> Kind {
        let c = category.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "ro"))
        if ["ciorb", "sup", "bors", "zeam"].contains(where: { c.contains($0) }) { return .bowl }
        if ["patiser", "desert", "dulc", "prajitur", "tort", "paine", "cozonac", "aluat", "biscu"].contains(where: { c.contains($0) }) { return .bread }
        if ["bautur", "smoothie", "suc", "cocktail", "limonad", "ceai", "cafea"].contains(where: { c.contains($0) }) { return .glass }
        return .pan
    }

    /// Warm, muted tints (light centre, dark edge) per drawing.
    nonisolated static func tint(_ kind: Kind) -> (UInt32, UInt32) {
        switch kind {
        case .bowl: (0x3A321A, 0x2A2413)
        case .pan: (0x3D261A, 0x2B1B13)
        case .bread: (0x3A2E1F, 0x2A2117)
        case .glass: (0x1C323B, 0x14232A)
        }
    }

    var body: some View {
        let kind = Self.kind(category)
        let (light, dark) = Self.tint(kind)
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let s = min(w, h)
            ZStack {
                RadialGradient(colors: [Color(hex: light), Color(hex: dark)], center: UnitPoint(x: 0.5, y: 0.35),
                               startRadius: 0, endRadius: max(w, h) * 0.8)
                if w < 90 {
                    RecipeLabelDrawing(kind: kind).frame(width: s * 0.62, height: s * 0.62)
                } else {
                    let inset: CGFloat = w < 160 ? 7 : 10
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Theme.accent.opacity(0.32), lineWidth: 1)
                        .padding(inset)
                    VStack(spacing: s * 0.05) {
                        if !category.isEmpty {
                            Text(category.uppercased())
                                .font(.custom(AppFont.bodyBold, size: max(8, min(13, w * 0.062))))
                                .tracking(1.6)
                                .foregroundStyle(Theme.accent)
                                .lineLimit(1)
                        }
                        Text(title.isEmpty ? "Rețetă nouă" : title)
                            .font(.custom(AppFont.storyDisplay, size: max(14, min(40, w * 0.115))))
                            .foregroundStyle(Theme.text)
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .minimumScaleFactor(0.7)
                        Rectangle().fill(Theme.accent.opacity(0.7)).frame(width: max(14, w * 0.1), height: 1)
                            .padding(.top, 2)
                    }
                    .padding(.horizontal, inset + 12)
                }
            }
            .frame(width: w, height: h)
        }
    }
}

/// The small gold line drawing of a recipe label: bowl, pan, loaf or glass.
struct RecipeLabelDrawing: View {
    let kind: RecipeLabel.Kind

    var body: some View {
        Canvas { ctx, size in
            let u = size.width / 100
            func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * u, y: y * u) }
            var path = Path()
            switch kind {
            case .bowl:
                path.move(to: p(18, 46)); path.addLine(to: p(82, 46))
                path.addCurve(to: p(18, 46), control1: p(80, 78), control2: p(20, 78))
                path.move(to: p(38, 76)); path.addLine(to: p(62, 76))
                for x in [38.0, 50.0, 62.0] {
                    path.move(to: p(x, 38)); path.addCurve(to: p(x + 3, 22), control1: p(x - 4, 32), control2: p(x + 6, 28))
                }
            case .pan:
                path.addEllipse(in: CGRect(origin: p(14, 32), size: CGSize(width: 50 * u, height: 50 * u)))
                path.addEllipse(in: CGRect(origin: p(22, 40), size: CGSize(width: 34 * u, height: 34 * u)))
                path.move(to: p(63, 52)); path.addLine(to: p(90, 42))
            case .bread:
                path.move(to: p(16, 72)); path.addLine(to: p(16, 54))
                path.addCurve(to: p(84, 54), control1: p(16, 26), control2: p(84, 26))
                path.addLine(to: p(84, 72)); path.closeSubpath()
                for x in [36.0, 50.0, 64.0] { path.move(to: p(x - 4, 52)); path.addLine(to: p(x + 4, 42)) }
            case .glass:
                path.move(to: p(30, 22)); path.addLine(to: p(70, 22)); path.addLine(to: p(63, 84)); path.addLine(to: p(37, 84)); path.closeSubpath()
                path.move(to: p(33, 42)); path.addLine(to: p(67, 42))
                path.move(to: p(58, 10)); path.addLine(to: p(52, 42))
            }
            ctx.stroke(path, with: .color(Theme.accent), style: StrokeStyle(lineWidth: max(1.2, 2.4 * u), lineCap: .round, lineJoin: .round))
        }
    }
}

/// The old placeholder (PlatePlaceholder.tsx): a small gold steaming plate on a dark card
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
