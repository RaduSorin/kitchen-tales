import SwiftUI
import UIKit

/// Design tokens for style A "Seară iOS": the web app's "Seară de lux" colors (src/index.css)
/// used with Apple's own patterns. The app is always dark.
enum Theme {
    // Recipes side (the default).
    static let background = Color(hex: 0x13100E)
    static let surface = Color(hex: 0x1E1A17)
    static let surface2 = Color(hex: 0x2A2521)
    static let text = Color(hex: 0xF4EFE6)
    static let muted = Color(hex: 0xA89F95)
    static let border = Color.white.opacity(0.09)
    static let accent = Color(hex: 0xF2C879)
    static let accentHi = Color(hex: 0xFFE3A3)
    static let accentSoft = Color(hex: 0xF2C879).opacity(0.15)
    static let onAccent = Color(hex: 0x1A1410)
    static let danger = Color(hex: 0xFF8F7A)

    /// Stories side ("noapte"): a night-sky gradient and its own muted/danger tones.
    enum Night {
        static let top = Color(hex: 0x171A45)
        static let bottom = Color(hex: 0x2C2368)
        static let surface = Color.white.opacity(0.07)
        static let surface2 = Color.white.opacity(0.11)
        static let muted = Color(hex: 0xAAA3B2)
        static let gold = Color(hex: 0xE2B84F)
        static let danger = Color(hex: 0xFF8FA3)
        static let moon = Color(hex: 0xFFD76A)
        static let ink = Color(hex: 0x171A45)
        static var gradient: LinearGradient {
            LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom)
        }
    }

    /// Corner radii, matching the web cards and buttons.
    enum Radius {
        static let small: CGFloat = 10
        static let card: CGFloat = 16
        static let sheet: CGFloat = 24
    }

    /// UIKit appearance for the parts SwiftUI does not style directly: Fraunces large titles,
    /// the gold segmented control and the tab bar tint.
    @MainActor static func applyAppearance() {
        let nav = UINavigationBarAppearance()
        if #available(iOS 26, *) {
            // Keep the system's Liquid Glass bar; only the fonts change.
            nav.configureWithDefaultBackground()
        } else {
            nav.configureWithTransparentBackground()
            nav.backgroundColor = UIColor(Theme.background).withAlphaComponent(0.6)
            nav.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        }
        nav.largeTitleTextAttributes = [
            .font: AppFont.uiFont(AppFont.display, size: 34, textStyle: .largeTitle),
            .foregroundColor: UIColor(Theme.text),
        ]
        nav.titleTextAttributes = [
            .font: AppFont.uiFont(AppFont.display, size: 17, textStyle: .headline),
            .foregroundColor: UIColor(Theme.text),
        ]
        let scrollEdge = UINavigationBarAppearance()
        scrollEdge.configureWithTransparentBackground()
        scrollEdge.largeTitleTextAttributes = nav.largeTitleTextAttributes
        scrollEdge.titleTextAttributes = nav.titleTextAttributes
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = scrollEdge
        UINavigationBar.appearance().tintColor = UIColor(Theme.accent)

        let segmented = UISegmentedControl.appearance()
        segmented.selectedSegmentTintColor = UIColor(Theme.accent)
        segmented.backgroundColor = UIColor(Theme.surface2)
        segmented.setTitleTextAttributes([.foregroundColor: UIColor(Theme.onAccent),
                                          .font: AppFont.uiFont(AppFont.bodySemibold, size: 14, textStyle: .subheadline)], for: .selected)
        segmented.setTitleTextAttributes([.foregroundColor: UIColor(Theme.muted),
                                          .font: AppFont.uiFont(AppFont.bodySemibold, size: 14, textStyle: .subheadline)], for: .normal)

        UITableView.appearance().backgroundColor = .clear
    }
}

extension Color {
    /// A color from a 0xRRGGBB literal, like the hex values in src/index.css.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}
