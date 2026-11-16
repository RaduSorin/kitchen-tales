import SwiftUI
import UIKit
import WidgetKit

/// Fonts and pieces of the widgets, in the app's "Seară de lux" style: near-black, gold, Young
/// Serif titles and Figtree text, no boxes around symbols.
enum WFont {
    static func serif(_ size: CGFloat) -> Font { .custom(AppFont.storyDisplay, size: size) }
    static func text(_ size: CGFloat) -> Font { .custom(AppFont.body, size: size) }
    static func semibold(_ size: CGFloat) -> Font { .custom(AppFont.bodySemibold, size: size) }
    static func bold(_ size: CGFloat) -> Font { .custom(AppFont.bodyBold, size: size) }
}

/// The small gold capitals over a title ("DISEARĂ · 20:30").
struct WKicker: View {
    let text: String
    var color: Color = Theme.accent

    var body: some View {
        Text(text.uppercased())
            .font(WFont.bold(10.5))
            .tracking(1.2)
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// A copy the app saved in the shared folder, filling the space it is given.
struct WPhoto: View {
    let name: String?

    var body: some View {
        Color.clear.overlay {
            if let name, let image = UIImage(contentsOfFile: WidgetFiles.imageURL(name).path) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                WGlow()
            }
        }
        .clipped()
    }

    static func exists(_ name: String?) -> Bool {
        guard let name else { return false }
        return FileManager.default.fileExists(atPath: WidgetFiles.imageURL(name).path)
    }
}

/// The widget background: near-black with a soft warm light, like the app.
struct WGlow: View {
    var body: some View {
        ZStack {
            Theme.background
            RadialGradient(colors: [Theme.accent.opacity(0.16), .clear], center: UnitPoint(x: 0.2, y: 0.3),
                           startRadius: 0, endRadius: 180)
        }
    }
}

/// Dark at the bottom of a photo, so the title on it reads.
struct WScrim: View {
    var body: some View {
        LinearGradient(stops: [.init(color: .clear, location: 0.3), .init(color: Color(hex: 0x0A0807, opacity: 0.88), location: 1)],
                       startPoint: .top, endPoint: .bottom)
    }
}

/// A recipe without a photo: the "Etichetă" label (thin gold frame, category, serif title, rule).
struct WRecipeTag: View {
    let title: String
    let category: String
    var size: CGFloat = 17

    var body: some View {
        ZStack {
            WGlow()
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.accent.opacity(0.55), lineWidth: 1)
                .padding(12)
            VStack(spacing: 6) {
                if !category.isEmpty { WKicker(text: category).font(WFont.bold(9.5)) }
                Text(title)
                    .font(WFont.serif(size))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                Rectangle().fill(Theme.accent.opacity(0.7)).frame(width: 22, height: 1)
            }
            .padding(.horizontal, 22)
        }
    }
}

/// The gold pill ("Ascultă").
struct WGoldPill: View {
    let title: String
    var play = false

    var body: some View {
        HStack(spacing: 6) {
            if play { Image(systemName: "play.fill").font(.system(size: 11, weight: .bold)) }
            Text(title).font(WFont.semibold(14))
        }
        .foregroundStyle(Theme.onAccent)
        .padding(.horizontal, 15)
        .padding(.vertical, 8)
        .background(Capsule().fill(Theme.accent))
    }
}

/// A thin gold progress line.
struct WBar: View {
    let value: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.14))
                Capsule().fill(Theme.accent).frame(width: g.size.width * min(1, max(0, value)))
            }
        }
        .frame(height: 3)
    }
}

/// Signed out, or nothing saved yet.
struct WOpenApp: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Bucătăria").font(WFont.serif(17)).foregroundStyle(Theme.text)
            Text(text).font(WFont.text(13)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
    }
}

enum WLinks {
    static func story(_ id: String) -> URL? { id.isEmpty ? URL(string: "kitchentales://bedtime") : URL(string: "kitchentales://story/\(id)") }
    static func recipe(_ id: String) -> URL? { id.isEmpty ? URL(string: "kitchentales://week") : URL(string: "kitchentales://recipe/\(id)") }
    static let week = URL(string: "kitchentales://week")
    static let list = URL(string: "kitchentales://list")
    static func cook(_ step: Int) -> URL? { URL(string: "kitchentales://cook/\(step)") }
}
