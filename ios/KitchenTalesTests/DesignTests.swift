import Testing
import SwiftUI
import UIKit
@testable import KitchenTales

@MainActor
struct DesignTests {
    /// Every bundled font must load by its PostScript name, or titles silently fall back to the
    /// system font.
    @Test(arguments: AppFont.all)
    func fontIsBundled(_ name: String) {
        #expect(UIFont(name: name, size: 17) != nil, "Missing font \(name): check Resources/Fonts and UIAppFonts")
    }

    @Test func fontsCoverRomanianLetters() throws {
        for name in AppFont.all {
            let font = try #require(UIFont(name: name, size: 17))
            let ctFont = font as CTFont
            for scalar in "ăâîșțĂÂÎȘȚ".utf16 {
                var char = scalar
                var glyph: CGGlyph = 0
                #expect(CTFontGetGlyphsForCharacters(ctFont, &char, &glyph, 1), "\(name) has no glyph for U+\(String(scalar, radix: 16))")
            }
        }
    }

    @Test func hexColorsMatchTheWebTokens() {
        let gold = UIColor(Theme.accent)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        gold.getRed(&r, green: &g, blue: &b, alpha: &a)
        #expect(Int((r * 255).rounded()) == 0xF2)
        #expect(Int((g * 255).rounded()) == 0xC8)
        #expect(Int((b * 255).rounded()) == 0x79)
        #expect(a == 1)
    }

    @Test func launchTabParsesFromDefaults() {
        UserDefaults.standard.set("profile", forKey: "tab")
        defer { UserDefaults.standard.removeObject(forKey: "tab") }
        #expect(LaunchOptions.tab == .profile)
    }
}
