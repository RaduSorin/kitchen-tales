import SwiftUI

/// The web's small gold line drawings for the ways to add a story (components/AddArt.tsx,
/// "Desene mici"), drawn in the same 0–100 box: a book with a sparkle, a mic with the moon, a
/// cloud with an arrow.
struct AddArt: View {
    let mode: AddMode

    private static let gold = Color(hex: 0xF2C879)
    private static let light = Color(hex: 0xFFE3A3)

    var body: some View {
        Canvas { ctx, size in
            let k = min(size.width, size.height) / 100
            ctx.scaleBy(x: k, y: k)
            switch mode {
            case .create: Self.create(&ctx)
            case .record: Self.record(&ctx)
            case .upload: Self.upload(&ctx)
            }
        }
        .accessibilityHidden(true)
    }

    private static let line = StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round)

    private static func star(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, _ w: CGFloat) -> Path {
        Path { p in
            p.move(to: CGPoint(x: cx, y: cy - r))
            p.addLine(to: CGPoint(x: cx + w, y: cy - w))
            p.addLine(to: CGPoint(x: cx + r, y: cy))
            p.addLine(to: CGPoint(x: cx + w, y: cy + w))
            p.addLine(to: CGPoint(x: cx, y: cy + r))
            p.addLine(to: CGPoint(x: cx - w, y: cy + w))
            p.addLine(to: CGPoint(x: cx - r, y: cy))
            p.addLine(to: CGPoint(x: cx - w, y: cy - w))
            p.closeSubpath()
        }
    }

    private static func dot(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    private static func create(_ ctx: inout GraphicsContext) {
        ctx.fill(dot(70, 28, 20), with: .color(gold.opacity(0.18)))
        let book = Path { p in
            p.move(to: CGPoint(x: 18, y: 72))
            p.addQuadCurve(to: CGPoint(x: 50, y: 72), control: CGPoint(x: 34, y: 62))
            p.addQuadCurve(to: CGPoint(x: 82, y: 72), control: CGPoint(x: 66, y: 62))
            p.addLine(to: CGPoint(x: 82, y: 40))
            p.addQuadCurve(to: CGPoint(x: 50, y: 40), control: CGPoint(x: 66, y: 30))
            p.addQuadCurve(to: CGPoint(x: 18, y: 40), control: CGPoint(x: 34, y: 30))
            p.closeSubpath()
        }
        ctx.fill(book, with: .color(Color(hex: 0x2A2244)))
        ctx.stroke(book, with: .color(gold), style: line)
        ctx.stroke(Path { p in p.move(to: CGPoint(x: 50, y: 40)); p.addLine(to: CGPoint(x: 50, y: 72)) }, with: .color(gold), style: line)
        ctx.fill(star(66, 23, 9, 2.5), with: .color(light))
        ctx.fill(star(38, 25.5, 5.5, 1.5), with: .color(light.opacity(0.8)))
        ctx.fill(dot(82, 44, 1.8), with: .color(.white))
        ctx.fill(dot(26, 34, 1.4), with: .color(.white.opacity(0.7)))
    }

    private static func record(_ ctx: inout GraphicsContext) {
        // The moon: a gold disc with a bite taken out.
        ctx.drawLayer { layer in
            layer.fill(dot(64, 32, 16), with: .color(gold.opacity(0.9)))
            layer.blendMode = .destinationOut
            layer.fill(dot(76, 26, 13), with: .color(.black))
        }
        let mic = Path(roundedRect: CGRect(x: 30, y: 34, width: 18, height: 30), cornerRadius: 9)
        ctx.fill(mic, with: .color(Color(hex: 0x3A2440)))
        ctx.stroke(mic, with: .color(gold), style: line)
        let stand = Path { p in
            p.move(to: CGPoint(x: 22, y: 54))
            p.addCurve(to: CGPoint(x: 56, y: 54), control1: CGPoint(x: 22, y: 76.7), control2: CGPoint(x: 56, y: 76.7))
            p.move(to: CGPoint(x: 39, y: 71)); p.addLine(to: CGPoint(x: 39, y: 81))
            p.move(to: CGPoint(x: 31, y: 81)); p.addLine(to: CGPoint(x: 47, y: 81))
        }
        ctx.stroke(stand, with: .color(gold), style: line)
        let waves = Path { p in
            p.move(to: CGPoint(x: 62, y: 60)); p.addQuadCurve(to: CGPoint(x: 62, y: 72), control: CGPoint(x: 66, y: 66))
            p.move(to: CGPoint(x: 70, y: 56)); p.addQuadCurve(to: CGPoint(x: 70, y: 76), control: CGPoint(x: 77, y: 66))
        }
        ctx.stroke(waves, with: .color(light.opacity(0.8)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
    }

    private static func upload(_ ctx: inout GraphicsContext) {
        let cloud = Path { p in
            p.move(to: CGPoint(x: 28, y: 70))
            p.addCurve(to: CGPoint(x: 30, y: 42), control1: CGPoint(x: 12, y: 69), control2: CGPoint(x: 13, y: 44))
            p.addCurve(to: CGPoint(x: 68, y: 38), control1: CGPoint(x: 33, y: 20), control2: CGPoint(x: 63, y: 16))
            p.addCurve(to: CGPoint(x: 72, y: 70), control1: CGPoint(x: 88, y: 37), control2: CGPoint(x: 91, y: 68))
            p.closeSubpath()
        }
        ctx.fill(cloud, with: .color(Color(hex: 0x1D3442)))
        ctx.stroke(cloud, with: .color(gold), style: line)
        let arrow = Path { p in
            p.move(to: CGPoint(x: 50, y: 64)); p.addLine(to: CGPoint(x: 50, y: 44))
            p.move(to: CGPoint(x: 42, y: 52)); p.addLine(to: CGPoint(x: 50, y: 44)); p.addLine(to: CGPoint(x: 58, y: 52))
        }
        ctx.stroke(arrow, with: .color(light), style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
        ctx.fill(dot(80, 24, 1.8), with: .color(.white))
        ctx.fill(dot(20, 28, 1.4), with: .color(.white.opacity(0.7)))
    }
}
