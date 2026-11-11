import SwiftUI
import UIKit

/// The app's typefaces. Titles use Fraunces (recipes) or Baloo 2 / Young Serif (stories), body
/// text uses Figtree like the web app, and small print uses the system font (from variant B).
/// Every style scales with Dynamic Type through `relativeTo:`.
enum AppFont {
    // PostScript names of the bundled fonts (Resources/Fonts, listed in UIAppFonts).
    static let display = "Fraunces-Regular"
    static let displaySemibold = "Fraunces-SemiBold"
    static let displayItalic = "Fraunces-SemiBoldItalic"
    static let body = "Figtree-Regular"
    static let bodySemibold = "Figtree-SemiBold"
    static let bodyBold = "Figtree-Bold"
    static let bodyHeavy = "Figtree-ExtraBold"
    static let kids = "Baloo2-Regular"
    static let kidsSemibold = "Baloo2-SemiBold"
    static let kidsHeavy = "Baloo2-ExtraBold"
    static let storyDisplay = "YoungSerif-Regular"

    static let all = [display, displaySemibold, displayItalic, body, bodySemibold, bodyBold, bodyHeavy,
                      kids, kidsSemibold, kidsHeavy, storyDisplay]

    /// A UIKit font that follows Dynamic Type, falling back to the system font if the file is missing.
    static func uiFont(_ name: String, size: CGFloat, textStyle: UIFont.TextStyle) -> UIFont {
        let base = UIFont(name: name, size: size) ?? .systemFont(ofSize: size)
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base)
    }
}

extension Font {
    // Recipes side.
    static let ktLargeTitle = Font.custom(AppFont.display, size: 34, relativeTo: .largeTitle)
    static let ktTitle = Font.custom(AppFont.display, size: 26, relativeTo: .title)
    static let ktTitle2 = Font.custom(AppFont.display, size: 21, relativeTo: .title2)
    static let ktTitle3 = Font.custom(AppFont.display, size: 18, relativeTo: .title3)
    static let ktBody = Font.custom(AppFont.body, size: 17, relativeTo: .body)
    static let ktBodyEmphasis = Font.custom(AppFont.bodySemibold, size: 17, relativeTo: .body)
    static let ktCallout = Font.custom(AppFont.body, size: 16, relativeTo: .callout)
    static let ktButton = Font.custom(AppFont.bodySemibold, size: 17, relativeTo: .body)
    /// Small print is the system font: crisper at small sizes.
    static let ktFootnote = Font.footnote
    static let ktCaption = Font.caption
    /// Uppercase section labels ("DE GĂTIT"), like `.set-label` on the web.
    static let ktLabel = Font.system(.caption, weight: .bold)

    // Stories side.
    static let ktKidsTitle = Font.custom(AppFont.kidsHeavy, size: 30, relativeTo: .largeTitle)
    static let ktKidsHeadline = Font.custom(AppFont.kidsSemibold, size: 20, relativeTo: .title3)
    static let ktKidsBody = Font.custom(AppFont.kids, size: 17, relativeTo: .body)
    static let ktStoryTitle = Font.custom(AppFont.storyDisplay, size: 24, relativeTo: .title)
}
