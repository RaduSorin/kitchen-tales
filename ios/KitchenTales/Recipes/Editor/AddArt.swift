import SwiftUI

/// The small gold line drawings of the ways to add a recipe (AddArt.tsx), drawn in a 0–100 box.
struct AddArt: View {
    enum Kind { case link, cam, gen, pen }
    let kind: Kind

    private static let gold = Color(hex: 0xF2C879)
    private static let light = Color(hex: 0xFFE3A3)
    private static let fill = Color(hex: 0x2A2521)

    var body: some View {
        Canvas { ctx, size in
            let u = size.width / 100
            func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * u, y: y * u) }
            func line(_ w: Double) -> StrokeStyle { StrokeStyle(lineWidth: w * u, lineCap: .round, lineJoin: .round) }
            func poly(_ pts: [(Double, Double)]) -> Path {
                var path = Path()
                path.addLines(pts.map { p($0.0, $0.1) })
                path.closeSubpath()
                return path
            }
            func star(_ cx: Double, _ cy: Double, _ r: Double) -> Path {
                let k = r * 0.38
                return poly([(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k), (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)])
            }
            switch kind {
            case .link:
                let phone = Path(roundedRect: CGRect(x: 30 * u, y: 14 * u, width: 40 * u, height: 70 * u), cornerRadius: 8 * u)
                ctx.fill(phone, with: .color(Self.fill))
                ctx.stroke(phone, with: .color(Self.gold), style: line(2.2))
                // Two chain links at 45°.
                for (dx, dy) in [(-4.0, 4.0), (4.0, -4.0)] {
                    var link = ctx
                    link.translateBy(x: (50 + dx) * u, y: (48 + dy) * u)
                    link.rotate(by: .degrees(-45))
                    let r = CGRect(x: -9 * u, y: -5 * u, width: 18 * u, height: 10 * u)
                    link.stroke(Path(roundedRect: r, cornerRadius: 5 * u), with: .color(Self.light), style: line(2.4))
                }
            case .cam:
                var body = Path(roundedRect: CGRect(x: 18 * u, y: 31 * u, width: 64 * u, height: 44 * u), cornerRadius: 5 * u)
                body.addPath(poly([(32, 31), (36, 24), (64, 24), (68, 31)]))
                ctx.fill(body, with: .color(Self.fill))
                ctx.stroke(body, with: .color(Self.gold), style: line(2.2))
                ctx.stroke(Path(ellipseIn: CGRect(x: 37 * u, y: 39 * u, width: 26 * u, height: 26 * u)), with: .color(Self.light), style: line(2.4))
                ctx.fill(Path(ellipseIn: CGRect(x: 45 * u, y: 47 * u, width: 10 * u, height: 10 * u)), with: .color(Self.gold.opacity(0.6)))
            case .gen:
                let base = poly([(26, 70), (74, 70), (70, 80), (30, 80)])
                ctx.fill(base, with: .color(Self.fill))
                ctx.stroke(base, with: .color(Self.gold), style: line(2.2))
                var dome = Path()
                dome.addArc(center: p(50, 70), radius: 22 * u, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
                ctx.fill(dome, with: .color(Self.fill))
                ctx.stroke(dome, with: .color(Self.gold), style: line(2.2))
                ctx.fill(star(50, 25, 11), with: .color(Self.light))
                ctx.fill(star(72, 36, 6), with: .color(Self.light.opacity(0.8)))
            case .pen:
                var ground = Path()
                ground.move(to: p(20, 78)); ground.addLine(to: p(80, 78))
                ctx.stroke(ground, with: .color(Self.gold.opacity(0.5)), style: line(2))
                let sheet = Path(roundedRect: CGRect(x: 24 * u, y: 22 * u, width: 40 * u, height: 52 * u), cornerRadius: 4 * u)
                ctx.fill(sheet, with: .color(Self.fill))
                ctx.stroke(sheet, with: .color(Self.gold), style: line(2.2))
                var rows = Path()
                for (y, w) in [(34.0, 24.0), (44, 24), (54, 14)] { rows.move(to: p(32, y)); rows.addLine(to: p(32 + w, y)) }
                ctx.stroke(rows, with: .color(Self.gold.opacity(0.7)), style: line(2))
                ctx.fill(poly([(58, 64), (78, 44), (84, 50), (64, 70), (58, 70)]), with: .color(Self.light))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
