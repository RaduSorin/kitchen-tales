import SwiftUI
import UIKit

// Shared building blocks for style A. Screens use these instead of styling controls one by one,
// so the look stays the same across the app.

/// Gold capsule button: the main action on a screen ("Salvează", "Gătește").
struct PrimaryButtonStyle: ButtonStyle {
    var fullWidth = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ktButton)
            .foregroundStyle(Theme.onAccent)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(Capsule().fill(configuration.isPressed ? Theme.accentHi : Theme.accent))
            .overlay(Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 0.5).blendMode(.overlay))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
            .contentShape(Capsule())
    }
}

/// Dark capsule button for secondary actions.
struct SecondaryButtonStyle: ButtonStyle {
    var fullWidth = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ktButton)
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(Capsule().fill(configuration.isPressed ? Theme.surface2 : Theme.surface))
            .overlay(Capsule().strokeBorder(Theme.border))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
            .contentShape(Capsule())
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var ktPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
    static var ktPrimaryWide: PrimaryButtonStyle { PrimaryButtonStyle(fullWidth: true) }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var ktSecondary: SecondaryButtonStyle { SecondaryButtonStyle() }
    static var ktSecondaryWide: SecondaryButtonStyle { SecondaryButtonStyle(fullWidth: true) }
}

/// Uppercase tracked label above a group ("DE GĂTIT", "SĂPTĂMÂNA TA").
struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased(with: Locale(identifier: "ro")))
            .font(.ktLabel)
            .tracking(1.2)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The rounded dark card used for groups of content.
struct CardModifier: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).strokeBorder(Theme.border))
    }
}

extension View {
    func ktCard(padding: CGFloat = 16) -> some View { modifier(CardModifier(padding: padding)) }

    /// The recipes-side page background, behind lists and scroll views.
    func ktBackground() -> some View {
        background(Theme.background.ignoresSafeArea())
            .scrollContentBackground(.hidden)
    }

    /// The stories-side night-sky background.
    func ktNightBackground() -> some View {
        background(Theme.Night.gradient.ignoresSafeArea())
            .scrollContentBackground(.hidden)
    }
}

/// An empty or "not here yet" state: a symbol, a title and one line of text.
struct EmptyStateView: View {
    let symbol: String
    let title: String
    let message: String
    var body: some View {
        ContentUnavailableView {
            Label {
                Text(title).font(.ktTitle2).foregroundStyle(Theme.text)
            } icon: {
                Image(systemName: symbol).foregroundStyle(Theme.accent)
            }
        } description: {
            Text(message).font(.ktCallout).foregroundStyle(Theme.muted)
        }
    }
}

/// Haptic feedback in one place, so every tap feels the same.
@MainActor enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func select() { UISelectionFeedbackGenerator().selectionChanged() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}
