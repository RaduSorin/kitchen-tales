import Combine
import SwiftUI
import UIKit

extension View {
    /// Folds this view away while the on-screen keyboard is up: a bar pinned to the bottom (the
    /// recipe's "Gătește pas cu pas") would otherwise sit on the keyboard and cover the field's
    /// own buttons. The view stays in place, so it comes back as soon as the keyboard goes.
    func hiddenWhileTyping() -> some View { modifier(HiddenWhileTyping()) }

    /// A "Gata" button above the keyboard. Multi-line fields have no Done key, so without it the
    /// keyboard cannot be put away. (A bar of our own, not a keyboard toolbar: these pages hide
    /// the navigation bar or are not in a navigation stack.)
    func keyboardDoneButton() -> some View { modifier(KeyboardDoneBar()) }
}

private struct KeyboardDoneBar: ViewModifier {
    @State private var typing = false

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if typing {
                    HStack {
                        Spacer()
                        Button("Gata") {
                            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                        }
                        .font(.ktBodyEmphasis)
                        .foregroundStyle(Theme.accent)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 44)
                    }
                    .background(.ultraThinMaterial)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in typing = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in typing = false }
    }
}

private struct HiddenWhileTyping: ViewModifier {
    @State private var typing = false

    func body(content: Content) -> some View {
        content
            .opacity(typing ? 0 : 1)
            .allowsHitTesting(!typing)
            .accessibilityHidden(typing)
            .frame(height: typing ? 0 : nil, alignment: .top)
            .clipped()
            .animation(.easeInOut(duration: 0.2), value: typing)
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in typing = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in typing = false }
    }
}
