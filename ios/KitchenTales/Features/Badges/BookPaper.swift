import SwiftUI

// The materials of the two medal books (design-polish/ios-medals/album-detaliat.jpg): grained
// cardboard with fibres for the album, torn paper tape, the twin metal wire through holes punched
// next to the spine, and the edge of the pages under the open one.

/// A small, repeatable random sequence, so a page's grain is the same every time it is drawn.
struct BookNoise {
    private var state: UInt64

    init(seed: Int) { state = UInt64(truncatingIfNeeded: seed) &* 0x9E37_79B9_7F4A_7C15 | 1 }

    mutating func next() -> CGFloat {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return CGFloat(state % 10_000) / 10_000
    }
}

/// Coloured cardboard: the colour, a soft light from the top left, fine grain and a few fibres.
struct CardboardTexture: View {
    let color: Color
    var seed = 7

    var body: some View {
        ZStack {
            color
            LinearGradient(colors: [.white.opacity(0.07), .clear, .black.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Canvas { ctx, size in
                var noise = BookNoise(seed: seed)
                let area = size.width * size.height
                let specks = Int(min(900, area / 90))
                for _ in 0..<specks {
                    let x = noise.next() * size.width
                    let y = noise.next() * size.height
                    let r = 0.4 + noise.next() * 0.7
                    let light = noise.next() > 0.5
                    let alpha = 0.05 + noise.next() * 0.09
                    let rect = CGRect(x: x, y: y, width: r, height: r)
                    ctx.fill(Path(ellipseIn: rect), with: .color(light ? .white.opacity(alpha) : .black.opacity(alpha * 1.4)))
                }
                let fibres = Int(min(70, area / 1600))
                for _ in 0..<fibres {
                    let x = noise.next() * size.width
                    let y = noise.next() * size.height
                    let len = 4 + noise.next() * 9
                    let angle = noise.next() * .pi
                    var p = Path()
                    p.move(to: CGPoint(x: x, y: y))
                    p.addQuadCurve(to: CGPoint(x: x + cos(angle) * len, y: y + sin(angle) * len),
                                   control: CGPoint(x: x + cos(angle + 0.6) * len * 0.5, y: y + sin(angle + 0.6) * len * 0.5))
                    let light = noise.next() > 0.4
                    ctx.stroke(p, with: .color(light ? .white.opacity(0.13) : .black.opacity(0.16)), lineWidth: 0.45)
                }
            }
        }
        .drawingGroup()
        .accessibilityHidden(true)
    }
}

/// A strip of paper tape with torn ends: straight long sides, jagged short ones.
struct TornTape: Shape {
    var seed = 3

    func path(in rect: CGRect) -> Path {
        var noise = BookNoise(seed: seed)
        let teeth = 7
        let depth = min(rect.width, rect.height) * 0.12
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + noise.next() * depth, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - noise.next() * depth, y: rect.minY))
        for i in 1...teeth {
            let y = rect.minY + rect.height * CGFloat(i) / CGFloat(teeth)
            p.addLine(to: CGPoint(x: rect.maxX - noise.next() * depth, y: y))
        }
        p.addLine(to: CGPoint(x: rect.minX + noise.next() * depth, y: rect.maxY))
        for i in stride(from: teeth - 1, through: 1, by: -1) {
            let y = rect.minY + rect.height * CGFloat(i) / CGFloat(teeth)
            p.addLine(to: CGPoint(x: rect.minX + noise.next() * depth, y: y))
        }
        p.closeSubpath()
        return p
    }
}

/// Paper tape as it looks on the page: see-through colour, a little sheen, a soft shadow.
struct TapeStrip: View {
    let color: Color
    var seed = 3

    var body: some View {
        TornTape(seed: seed)
            .fill(color.opacity(0.88))
            .overlay(TornTape(seed: seed).fill(LinearGradient(colors: [.white.opacity(0.22), .clear, .white.opacity(0.08)], startPoint: .top, endPoint: .bottom)))
            .shadow(color: .black.opacity(0.28), radius: 1.2, y: 0.8)
    }
}

/// Where the wire goes through a page: holes in a column next to the spine, top to bottom.
enum SpiralHoles {
    /// The holes' centres in a page of this size, `inset` from the spine edge.
    static func centres(in size: CGSize, inset: CGFloat) -> [CGPoint] {
        let u = size.width / 100
        let gap = 8.6 * u
        let count = max(1, Int((size.height - 8 * u) / gap))
        let top = (size.height - CGFloat(count - 1) * gap) / 2
        return (0..<count).map { CGPoint(x: inset, y: top + CGFloat($0) * gap) }
    }
}

/// The punched holes next to the spine. `spineOnRight` for the back of a page (seen from behind,
/// its spine edge is on the right), so the holes are never on the outer edge.
struct PunchedHoles: View {
    var spineOnRight = false

    var body: some View {
        Canvas { ctx, size in
            let u = size.width / 100
            let x = spineOnRight ? size.width - 4.6 * u : 4.6 * u
            for c in SpiralHoles.centres(in: size, inset: x) {
                for dy in [-1.35 * u, 1.35 * u] {
                    let r = 1.05 * u
                    let hole = Path(ellipseIn: CGRect(x: c.x - r, y: c.y + dy - r, width: 2 * r, height: 2 * r))
                    ctx.fill(hole, with: .color(Color(hex: 0x0B0A10)))
                    // The cut edge catches the light at the bottom.
                    ctx.stroke(Path { p in p.addArc(center: CGPoint(x: c.x, y: c.y + dy), radius: r, startAngle: .degrees(20), endAngle: .degrees(160), clockwise: false) },
                               with: .color(.white.opacity(0.22)), lineWidth: 0.35 * u)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The twin metal wire over the spine: two loops per pair of holes, from the hole round the edge
/// of the book, steel with a highlight and a shadow on the page.
struct WireSpiral: View {
    /// The page's size, to put the loops over its holes.
    let page: CGSize

    var body: some View {
        Canvas { ctx, size in
            let u = page.width / 100
            let holeX = 4.6 * u + 6 * u
            for c in SpiralHoles.centres(in: page, inset: holeX) {
                for dy in [-1.35 * u, 1.35 * u] {
                    let y = c.y + dy
                    var loop = Path()
                    loop.move(to: CGPoint(x: holeX, y: y))
                    loop.addCurve(to: CGPoint(x: 0.6 * u, y: y - 2.6 * u),
                                  control1: CGPoint(x: holeX - 1 * u, y: y - 3.6 * u),
                                  control2: CGPoint(x: 2.6 * u, y: y - 4 * u))
                    loop.addCurve(to: CGPoint(x: holeX - 1.2 * u, y: y + 0.6 * u),
                                  control1: CGPoint(x: -0.6 * u, y: y - 1 * u),
                                  control2: CGPoint(x: 3 * u, y: y + 2 * u))
                    var shadow = ctx
                    shadow.translateBy(x: 0.5 * u, y: 0.9 * u)
                    shadow.stroke(loop, with: .color(.black.opacity(0.45)), style: StrokeStyle(lineWidth: 1.15 * u, lineCap: .round))
                    ctx.stroke(loop, with: .linearGradient(Gradient(colors: [Color(hex: 0x5D6068), Color(hex: 0xE9EBF0), Color(hex: 0x8A8D96), Color(hex: 0x3E4047)]),
                                                           startPoint: CGPoint(x: 0, y: y - 4 * u), endPoint: CGPoint(x: 0, y: y + 2 * u)),
                               style: StrokeStyle(lineWidth: 1.05 * u, lineCap: .round))
                    ctx.stroke(loop, with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 0.28 * u, lineCap: .round))
                }
            }
        }
        .frame(width: page.width * 0.12 + 6 * page.width / 100, height: page.height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The pages under the open one, seen at the outer edge and the bottom.
struct PageStackEdge: View {
    let paper: Color
    var corner: CGFloat = 8

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { k in
                let step = CGFloat(3 - k) * 1.6
                UnevenRoundedRectangle(topLeadingRadius: 2, bottomLeadingRadius: 2, bottomTrailingRadius: corner, topTrailingRadius: corner)
                    .fill(paper.mix(with: k % 2 == 0 ? .white : .black, by: 0.12))
                    .overlay(UnevenRoundedRectangle(topLeadingRadius: 2, bottomLeadingRadius: 2, bottomTrailingRadius: corner, topTrailingRadius: corner)
                        .strokeBorder(.black.opacity(0.25), lineWidth: 0.5))
                    .offset(x: step, y: step)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
