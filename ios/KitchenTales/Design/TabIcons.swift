import SwiftUI

/// The tab bar icons from the web app (src/components/TabBar.tsx), on the same 24-point grid:
/// a rounded outline, and a solid version while the tab is open (a dark glyph inside the gold
/// bubble). Details cut out of a solid glyph show the bubble through them.
enum TabGlyph: Hashable {
    case home, week, recipes, list, profile, favorites, library, add, surprise, search
}

struct TabIcon: View {
    let glyph: TabGlyph
    var solid = false
    var size: CGFloat = 24

    var body: some View {
        Canvas { ctx, canvas in
            let k = canvas.width / 24
            ctx.scaleBy(x: k, y: k)
            for part in TabIconParts.parts(glyph, solid: solid) {
                if part.cut { ctx.blendMode = .destinationOut } else { ctx.blendMode = .normal }
                if part.fill { ctx.fill(part.path, with: .foreground) }
                if part.width > 0 {
                    ctx.stroke(part.path, with: .foreground,
                               style: StrokeStyle(lineWidth: part.width, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(width: size, height: size)
        .compositingGroup()
        .accessibilityHidden(true)
    }
}

/// One drawn piece of an icon: filled, stroked (width 0 = no stroke) or cut out.
struct TabIconPart {
    let path: Path
    var fill = false
    var width: CGFloat = 2
    var cut = false
}

enum TabIconParts {
    /// The outline everywhere; the solid glyph only where the web has one (`SOLID` in TabBar.tsx).
    static func parts(_ glyph: TabGlyph, solid: Bool) -> [TabIconPart] {
        let P = TabPaths.self
        if !solid {
            switch glyph {
            case .home: return [.init(path: P.home)]
            case .week: return [.init(path: P.week)]
            case .recipes: return [.init(path: P.book)]
            case .list: return [.init(path: P.cart)]
            case .profile: return [.init(path: P.profile)]
            case .favorites: return [.init(path: P.heart)]
            case .library: return [.init(path: P.shelf)]
            case .add: return [.init(path: P.plus)]
            case .surprise: return [.init(path: P.sparkle)]
            case .search: return [.init(path: P.search)]
            }
        }
        switch glyph {
        case .home: return [.init(path: P.homeSolid, fill: true, width: 1.2)]
        case .week: return [.init(path: P.weekBody, fill: true), .init(path: P.weekRings), .init(path: P.weekCut, cut: true)]
        case .recipes: return [.init(path: P.bookBody, fill: true), .init(path: P.bookCut, cut: true)]
        case .list: return [.init(path: P.cartBody, fill: true),
                            .init(path: Path(ellipseIn: CGRect(x: 7.9, y: 18.9, width: 3.2, height: 3.2)), fill: true, width: 0),
                            .init(path: Path(ellipseIn: CGRect(x: 15.4, y: 18.9, width: 3.2, height: 3.2)), fill: true, width: 0)]
        case .profile: return [.init(path: Path(ellipseIn: CGRect(x: 2, y: 2, width: 20, height: 20)), fill: true, width: 0),
                               .init(path: Path(ellipseIn: CGRect(x: 8.7, y: 6.9, width: 6.6, height: 6.6)), fill: true, width: 0, cut: true),
                               .init(path: P.profileCut, width: 2.6, cut: true)]
        case .favorites: return [.init(path: P.heart, fill: true)]
        case .library: return [.init(path: P.shelf, fill: true, width: 1)]
        case .add: return [.init(path: P.plus, width: 2.8)]
        case .surprise: return [.init(path: P.sparkle, fill: true)]
        case .search: return [.init(path: P.search, width: 2.8)]
        }
    }
}

/// The web SVG paths, converted to points (arcs as curves) by a script; keep in step with TabBar.tsx.
enum TabPaths {
    static let home: Path = Path { p in
        p.move(to: CGPoint(x: 3.0, y: 10.5))
        p.addLine(to: CGPoint(x: 12.0, y: 3.0))
        p.addLine(to: CGPoint(x: 21.0, y: 10.5))
        p.addLine(to: CGPoint(x: 21.0, y: 20.0))
        p.addCurve(to: CGPoint(x: 20.0, y: 21.0), control1: CGPoint(x: 21.0, y: 20.5486), control2: CGPoint(x: 20.5486, y: 21.0))
        p.addLine(to: CGPoint(x: 15.0, y: 21.0))
        p.addLine(to: CGPoint(x: 15.0, y: 15.0))
        p.addLine(to: CGPoint(x: 9.0, y: 15.0))
        p.addLine(to: CGPoint(x: 9.0, y: 21.0))
        p.addLine(to: CGPoint(x: 4.0, y: 21.0))
        p.addCurve(to: CGPoint(x: 3.0, y: 20.0), control1: CGPoint(x: 3.4514, y: 21.0), control2: CGPoint(x: 3.0, y: 20.5486))
        p.addLine(to: CGPoint(x: 3.0, y: 10.5))
        p.closeSubpath()
    }
    static let homeSolid: Path = Path { p in
        p.move(to: CGPoint(x: 12.0, y: 2.6))
        p.addLine(to: CGPoint(x: 2.6, y: 10.4))
        p.addLine(to: CGPoint(x: 2.6, y: 20.0))
        p.addCurve(to: CGPoint(x: 4.0, y: 21.4), control1: CGPoint(x: 2.6, y: 20.768), control2: CGPoint(x: 3.232, y: 21.4))
        p.addLine(to: CGPoint(x: 9.2, y: 21.4))
        p.addLine(to: CGPoint(x: 9.2, y: 15.2))
        p.addLine(to: CGPoint(x: 14.8, y: 15.2))
        p.addLine(to: CGPoint(x: 14.8, y: 21.4))
        p.addLine(to: CGPoint(x: 20.0, y: 21.4))
        p.addCurve(to: CGPoint(x: 21.4, y: 20.0), control1: CGPoint(x: 20.768, y: 21.4), control2: CGPoint(x: 21.4, y: 20.768))
        p.addLine(to: CGPoint(x: 21.4, y: 10.4))
        p.addLine(to: CGPoint(x: 12.0, y: 2.6))
        p.closeSubpath()
    }
    static let week: Path = Path { p in
        p.move(to: CGPoint(x: 4.0, y: 6.0))
        p.addCurve(to: CGPoint(x: 6.0, y: 4.0), control1: CGPoint(x: 4.0, y: 4.9028), control2: CGPoint(x: 4.9028, y: 4.0))
        p.addLine(to: CGPoint(x: 18.0, y: 4.0))
        p.addCurve(to: CGPoint(x: 20.0, y: 6.0), control1: CGPoint(x: 19.0972, y: 4.0), control2: CGPoint(x: 20.0, y: 4.9028))
        p.addLine(to: CGPoint(x: 20.0, y: 19.0))
        p.addCurve(to: CGPoint(x: 18.0, y: 21.0), control1: CGPoint(x: 20.0, y: 20.0972), control2: CGPoint(x: 19.0972, y: 21.0))
        p.addLine(to: CGPoint(x: 6.0, y: 21.0))
        p.addCurve(to: CGPoint(x: 4.0, y: 19.0), control1: CGPoint(x: 4.9028, y: 21.0), control2: CGPoint(x: 4.0, y: 20.0972))
        p.addLine(to: CGPoint(x: 4.0, y: 6.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 4.0, y: 10.0))
        p.addLine(to: CGPoint(x: 20.0, y: 10.0))
        p.move(to: CGPoint(x: 8.0, y: 2.0))
        p.addLine(to: CGPoint(x: 8.0, y: 6.0))
        p.move(to: CGPoint(x: 16.0, y: 2.0))
        p.addLine(to: CGPoint(x: 16.0, y: 6.0))
        p.move(to: CGPoint(x: 8.0, y: 14.0))
        p.addLine(to: CGPoint(x: 10.0, y: 14.0))
        p.move(to: CGPoint(x: 14.0, y: 14.0))
        p.addLine(to: CGPoint(x: 16.0, y: 14.0))
        p.move(to: CGPoint(x: 8.0, y: 17.0))
        p.addLine(to: CGPoint(x: 10.0, y: 17.0))
    }
    static let weekBody: Path = Path { p in
        p.move(to: CGPoint(x: 4.0, y: 6.0))
        p.addCurve(to: CGPoint(x: 6.0, y: 4.0), control1: CGPoint(x: 4.0, y: 4.9028), control2: CGPoint(x: 4.9028, y: 4.0))
        p.addLine(to: CGPoint(x: 18.0, y: 4.0))
        p.addCurve(to: CGPoint(x: 20.0, y: 6.0), control1: CGPoint(x: 19.0972, y: 4.0), control2: CGPoint(x: 20.0, y: 4.9028))
        p.addLine(to: CGPoint(x: 20.0, y: 19.0))
        p.addCurve(to: CGPoint(x: 18.0, y: 21.0), control1: CGPoint(x: 20.0, y: 20.0972), control2: CGPoint(x: 19.0972, y: 21.0))
        p.addLine(to: CGPoint(x: 6.0, y: 21.0))
        p.addCurve(to: CGPoint(x: 4.0, y: 19.0), control1: CGPoint(x: 4.9028, y: 21.0), control2: CGPoint(x: 4.0, y: 20.0972))
        p.addLine(to: CGPoint(x: 4.0, y: 6.0))
        p.closeSubpath()
    }
    static let weekRings: Path = Path { p in
        p.move(to: CGPoint(x: 8.0, y: 2.0))
        p.addLine(to: CGPoint(x: 8.0, y: 6.0))
        p.move(to: CGPoint(x: 16.0, y: 2.0))
        p.addLine(to: CGPoint(x: 16.0, y: 6.0))
    }
    static let weekCut: Path = Path { p in
        p.move(to: CGPoint(x: 4.0, y: 10.0))
        p.addLine(to: CGPoint(x: 20.0, y: 10.0))
        p.move(to: CGPoint(x: 8.0, y: 14.0))
        p.addLine(to: CGPoint(x: 10.0, y: 14.0))
        p.move(to: CGPoint(x: 14.0, y: 14.0))
        p.addLine(to: CGPoint(x: 16.0, y: 14.0))
        p.move(to: CGPoint(x: 8.0, y: 17.0))
        p.addLine(to: CGPoint(x: 10.0, y: 17.0))
    }
    static let book: Path = Path { p in
        p.move(to: CGPoint(x: 5.0, y: 4.0))
        p.addLine(to: CGPoint(x: 16.0, y: 4.0))
        p.addCurve(to: CGPoint(x: 19.0, y: 7.0), control1: CGPoint(x: 17.6458, y: 4.0), control2: CGPoint(x: 19.0, y: 5.3542))
        p.addLine(to: CGPoint(x: 19.0, y: 20.0))
        p.addLine(to: CGPoint(x: 8.0, y: 20.0))
        p.addCurve(to: CGPoint(x: 5.0, y: 17.0), control1: CGPoint(x: 6.3542, y: 20.0), control2: CGPoint(x: 5.0, y: 18.6458))
        p.addLine(to: CGPoint(x: 5.0, y: 4.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 5.0, y: 17.0))
        p.addCurve(to: CGPoint(x: 8.0, y: 14.0), control1: CGPoint(x: 5.0, y: 15.3542), control2: CGPoint(x: 6.3542, y: 14.0))
        p.addLine(to: CGPoint(x: 19.0, y: 14.0))
        p.move(to: CGPoint(x: 9.0, y: 8.0))
        p.addLine(to: CGPoint(x: 15.0, y: 8.0))
    }
    static let bookBody: Path = Path { p in
        p.move(to: CGPoint(x: 5.0, y: 4.0))
        p.addLine(to: CGPoint(x: 16.0, y: 4.0))
        p.addCurve(to: CGPoint(x: 19.0, y: 7.0), control1: CGPoint(x: 17.6458, y: 4.0), control2: CGPoint(x: 19.0, y: 5.3542))
        p.addLine(to: CGPoint(x: 19.0, y: 20.0))
        p.addLine(to: CGPoint(x: 8.0, y: 20.0))
        p.addCurve(to: CGPoint(x: 5.0, y: 17.0), control1: CGPoint(x: 6.3542, y: 20.0), control2: CGPoint(x: 5.0, y: 18.6458))
        p.addLine(to: CGPoint(x: 5.0, y: 4.0))
        p.closeSubpath()
    }
    static let bookCut: Path = Path { p in
        p.move(to: CGPoint(x: 7.4, y: 17.6))
        p.addCurve(to: CGPoint(x: 8.8, y: 16.4), control1: CGPoint(x: 7.5657, y: 16.9458), control2: CGPoint(x: 8.1282, y: 16.4637))
        p.addLine(to: CGPoint(x: 19.0, y: 16.4))
        p.move(to: CGPoint(x: 9.0, y: 8.0))
        p.addLine(to: CGPoint(x: 15.0, y: 8.0))
    }
    static let cart: Path = Path { p in
        p.move(to: CGPoint(x: 3.0, y: 4.0))
        p.addLine(to: CGPoint(x: 5.0, y: 4.0))
        p.addLine(to: CGPoint(x: 7.4, y: 15.2))
        p.addCurve(to: CGPoint(x: 8.4, y: 16.0), control1: CGPoint(x: 7.4961, y: 15.6712), control2: CGPoint(x: 7.9192, y: 16.0097))
        p.addLine(to: CGPoint(x: 17.6, y: 16.0))
        p.addCurve(to: CGPoint(x: 18.6, y: 15.2), control1: CGPoint(x: 18.0808, y: 16.0097), control2: CGPoint(x: 18.5039, y: 15.6712))
        p.addLine(to: CGPoint(x: 20.0, y: 8.0))
        p.addLine(to: CGPoint(x: 6.2, y: 8.0))
        p.move(to: CGPoint(x: 9.5, y: 20.5))
        p.addLine(to: CGPoint(x: 9.51, y: 20.5))
        p.move(to: CGPoint(x: 17.0, y: 20.5))
        p.addLine(to: CGPoint(x: 17.01, y: 20.5))
    }
    static let cartBody: Path = Path { p in
        p.move(to: CGPoint(x: 3.0, y: 4.0))
        p.addLine(to: CGPoint(x: 5.0, y: 4.0))
        p.addLine(to: CGPoint(x: 7.4, y: 15.2))
        p.addCurve(to: CGPoint(x: 8.4, y: 16.0), control1: CGPoint(x: 7.4961, y: 15.6712), control2: CGPoint(x: 7.9192, y: 16.0097))
        p.addLine(to: CGPoint(x: 17.6, y: 16.0))
        p.addCurve(to: CGPoint(x: 18.6, y: 15.2), control1: CGPoint(x: 18.0808, y: 16.0097), control2: CGPoint(x: 18.5039, y: 15.6712))
        p.addLine(to: CGPoint(x: 20.0, y: 8.0))
        p.addLine(to: CGPoint(x: 6.2, y: 8.0))
        p.addLine(to: CGPoint(x: 3.0, y: 4.0))
        p.closeSubpath()
    }
    static let profile: Path = Path { p in
        p.move(to: CGPoint(x: 12.0, y: 2.5))
        p.addCurve(to: CGPoint(x: 2.5, y: 12.0), control1: CGPoint(x: 6.7885, y: 2.5), control2: CGPoint(x: 2.5, y: 6.7885))
        p.addCurve(to: CGPoint(x: 12.0, y: 21.5), control1: CGPoint(x: 2.5, y: 17.2115), control2: CGPoint(x: 6.7885, y: 21.5))
        p.addCurve(to: CGPoint(x: 21.5, y: 12.0), control1: CGPoint(x: 17.2115, y: 21.5), control2: CGPoint(x: 21.5, y: 17.2115))
        p.addCurve(to: CGPoint(x: 12.0, y: 2.5), control1: CGPoint(x: 21.5, y: 6.7885), control2: CGPoint(x: 17.2115, y: 2.5))
        p.closeSubpath()
        p.move(to: CGPoint(x: 12.0, y: 7.0))
        p.addCurve(to: CGPoint(x: 8.8, y: 10.2), control1: CGPoint(x: 10.2445, y: 7.0), control2: CGPoint(x: 8.8, y: 8.4445))
        p.addCurve(to: CGPoint(x: 12.0, y: 13.4), control1: CGPoint(x: 8.8, y: 11.9555), control2: CGPoint(x: 10.2445, y: 13.4))
        p.addCurve(to: CGPoint(x: 15.2, y: 10.2), control1: CGPoint(x: 13.7555, y: 13.4), control2: CGPoint(x: 15.2, y: 11.9555))
        p.addCurve(to: CGPoint(x: 12.0, y: 7.0), control1: CGPoint(x: 15.2, y: 8.4445), control2: CGPoint(x: 13.7555, y: 7.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 6.2, y: 18.6))
        p.addCurve(to: CGPoint(x: 12.0, y: 15.5192), control1: CGPoint(x: 7.5005, y: 16.6754), control2: CGPoint(x: 9.6772, y: 15.5192))
        p.addCurve(to: CGPoint(x: 17.8, y: 18.6), control1: CGPoint(x: 14.3228, y: 15.5192), control2: CGPoint(x: 16.4995, y: 16.6754))
    }
    static let profileCut: Path = Path { p in
        p.move(to: CGPoint(x: 6.4, y: 18.4))
        p.addCurve(to: CGPoint(x: 12.0, y: 15.6), control1: CGPoint(x: 7.721, y: 16.6387), control2: CGPoint(x: 9.7984, y: 15.6))
        p.addCurve(to: CGPoint(x: 17.6, y: 18.4), control1: CGPoint(x: 14.2016, y: 15.6), control2: CGPoint(x: 16.279, y: 16.6387))
    }
    static let heart: Path = Path { p in
        p.move(to: CGPoint(x: 12.0, y: 21.0))
        p.addCurve(to: CGPoint(x: 3.0, y: 9.0), control1: CGPoint(x: 12.0, y: 21.0), control2: CGPoint(x: 3.0, y: 15.6))
        p.addCurve(to: CGPoint(x: 6.4189, y: 4.2566), control1: CGPoint(x: 3.0, y: 6.8534), control2: CGPoint(x: 4.3824, y: 4.9354))
        p.addCurve(to: CGPoint(x: 12.0, y: 6.0), control1: CGPoint(x: 8.4553, y: 3.5778), control2: CGPoint(x: 10.712, y: 4.2827))
        p.addCurve(to: CGPoint(x: 17.5811, y: 4.2566), control1: CGPoint(x: 13.288, y: 4.2827), control2: CGPoint(x: 15.5447, y: 3.5778))
        p.addCurve(to: CGPoint(x: 21.0, y: 9.0), control1: CGPoint(x: 19.6176, y: 4.9354), control2: CGPoint(x: 21.0, y: 6.8534))
        p.addCurve(to: CGPoint(x: 12.0, y: 21.0), control1: CGPoint(x: 21.0, y: 15.6), control2: CGPoint(x: 12.0, y: 21.0))
        p.closeSubpath()
    }
    static let shelf: Path = Path { p in
        p.move(to: CGPoint(x: 4.0, y: 4.0))
        p.addLine(to: CGPoint(x: 8.0, y: 4.0))
        p.addLine(to: CGPoint(x: 8.0, y: 20.0))
        p.addLine(to: CGPoint(x: 4.0, y: 20.0))
        p.addLine(to: CGPoint(x: 4.0, y: 4.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 10.0, y: 4.0))
        p.addLine(to: CGPoint(x: 14.0, y: 4.0))
        p.addLine(to: CGPoint(x: 14.0, y: 20.0))
        p.addLine(to: CGPoint(x: 10.0, y: 20.0))
        p.addLine(to: CGPoint(x: 10.0, y: 4.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 15.5, y: 5.2))
        p.addLine(to: CGPoint(x: 19.3, y: 4.2))
        p.addLine(to: CGPoint(x: 23.0, y: 19.7))
        p.addLine(to: CGPoint(x: 19.2, y: 20.7))
        p.addLine(to: CGPoint(x: 15.5, y: 5.2))
        p.closeSubpath()
    }
    static let plus: Path = Path { p in
        p.move(to: CGPoint(x: 12.0, y: 5.0))
        p.addLine(to: CGPoint(x: 12.0, y: 19.0))
        p.move(to: CGPoint(x: 5.0, y: 12.0))
        p.addLine(to: CGPoint(x: 19.0, y: 12.0))
    }
    static let sparkle: Path = Path { p in
        p.move(to: CGPoint(x: 12.0, y: 3.0))
        p.addLine(to: CGPoint(x: 13.8, y: 8.2))
        p.addLine(to: CGPoint(x: 19.0, y: 10.0))
        p.addLine(to: CGPoint(x: 13.8, y: 11.8))
        p.addLine(to: CGPoint(x: 12.0, y: 17.0))
        p.addLine(to: CGPoint(x: 10.2, y: 11.8))
        p.addLine(to: CGPoint(x: 5.0, y: 10.0))
        p.addLine(to: CGPoint(x: 10.2, y: 8.2))
        p.addLine(to: CGPoint(x: 12.0, y: 3.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 19.0, y: 15.0))
        p.addLine(to: CGPoint(x: 19.8, y: 17.2))
        p.addLine(to: CGPoint(x: 22.0, y: 18.0))
        p.addLine(to: CGPoint(x: 19.8, y: 18.8))
        p.addLine(to: CGPoint(x: 19.0, y: 21.0))
        p.addLine(to: CGPoint(x: 18.2, y: 18.8))
        p.addLine(to: CGPoint(x: 16.0, y: 18.0))
        p.addLine(to: CGPoint(x: 18.2, y: 17.2))
        p.addLine(to: CGPoint(x: 19.0, y: 15.0))
        p.closeSubpath()
    }
    static let search: Path = Path { p in
        p.move(to: CGPoint(x: 11.0, y: 4.0))
        p.addCurve(to: CGPoint(x: 4.0, y: 11.0), control1: CGPoint(x: 7.1599, y: 4.0), control2: CGPoint(x: 4.0, y: 7.1599))
        p.addCurve(to: CGPoint(x: 11.0, y: 18.0), control1: CGPoint(x: 4.0, y: 14.8401), control2: CGPoint(x: 7.1599, y: 18.0))
        p.addCurve(to: CGPoint(x: 18.0, y: 11.0), control1: CGPoint(x: 14.8401, y: 18.0), control2: CGPoint(x: 18.0, y: 14.8401))
        p.addCurve(to: CGPoint(x: 11.0, y: 4.0), control1: CGPoint(x: 18.0, y: 7.1599), control2: CGPoint(x: 14.8401, y: 4.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 20.0, y: 20.0))
        p.addLine(to: CGPoint(x: 16.0, y: 16.0))
    }
}
