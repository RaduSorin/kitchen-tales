import SwiftUI

/// The web app's phone tab bar (src/components/TabBar.tsx and the "Seară de lux" CSS): a dark
/// floating capsule, muted outline icons, and a gold bubble that slides to the open tab, where the
/// icon turns solid and dark. The Listă tab carries a red count. The system tab bar is hidden;
/// pages that take the whole screen (a recipe, the editor) hide this one too.
struct KTTabItem<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    let glyph: TabGlyph
    var badge = 0
    var id: Value { value }
}

struct KTTabBar<Value: Hashable>: View {
    let items: [KTTabItem<Value>]
    @Binding var selection: Value
    var night = false
    @Namespace private var bubble

    var body: some View {
        HStack(spacing: 2) {
            ForEach(items) { item in
                tab(item)
            }
        }
        .padding(7)
        .background {
            Capsule(style: .continuous)
                .fill(night ? Color(red: 26 / 255, green: 24 / 255, blue: 30 / 255).opacity(0.94)
                            : Color(red: 30 / 255, green: 26 / 255, blue: 23 / 255).opacity(0.94))
                .background(.ultraThinMaterial, in: Capsule(style: .continuous))
                .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(0.06)))
                .shadow(color: .black.opacity(0.55), radius: 17, y: 12)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
        .environment(\.colorScheme, .dark)
    }

    private func tab(_ item: KTTabItem<Value>) -> some View {
        let on = item.value == selection
        return Button {
            guard !on else { return }
            withAnimation(.spring(response: 0.42, dampingFraction: 0.78)) { selection = item.value }
        } label: {
            VStack(spacing: 1) {
                TabIcon(glyph: item.glyph, solid: on)
                    .frame(width: 32, height: 28)
                    .overlay(alignment: .topTrailing) {
                        if item.badge > 0 {
                            Text(item.badge > 99 ? "99+" : "\(item.badge)")
                                .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 18, minHeight: 18)
                                .background(Capsule().fill(night ? Theme.Night.danger : Theme.danger))
                                .offset(x: 8, y: -4)
                        }
                    }
                Text(item.label)
                    .font(.custom(on ? AppFont.bodyBold : AppFont.bodySemibold, size: 11.2, relativeTo: .caption2))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Theme.onAccent : (night ? Theme.Night.muted : Theme.muted))
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background {
                if on {
                    Capsule(style: .continuous)
                        .fill(Theme.accent)
                        .shadow(color: Theme.accent.opacity(0.3), radius: 8, y: 4)
                        .matchedGeometryEffect(id: "bubble", in: bubble)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(TabPressStyle())
        .accessibilityLabel(item.badge > 0 ? "\(item.label), \(item.badge) de luat" : item.label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The web's `.tab:active { transform: scale(.94) }`.
private struct TabPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Pages that take the whole screen ask for the tab bar to go away while they are open.
@MainActor @Observable
final class TabBarModel {
    private(set) var hiders = 0
    var hidden: Bool { hiders > 0 }
    func hide() { hiders += 1 }
    func show() { hiders = max(0, hiders - 1) }
}

extension View {
    /// Hides the app's tab bar while this view is on screen (a recipe, the editor), like the web.
    func hidesAppTabBar() -> some View { modifier(HidesTabBar()) }

    /// The app's own tab bar under `content`, with the system bar hidden.
    func appTabBar<Value: Hashable>(_ items: [KTTabItem<Value>], selection: Binding<Value>, night: Bool = false) -> some View {
        modifier(AppTabBarHost(items: items, selection: selection, night: night))
    }
}

private struct HidesTabBar: ViewModifier {
    @Environment(TabBarModel.self) private var bar: TabBarModel?

    func body(content: Content) -> some View {
        content
            .onAppear { bar?.hide() }
            .onDisappear { bar?.show() }
    }
}

private struct AppTabBarHost<Value: Hashable>: ViewModifier {
    let items: [KTTabItem<Value>]
    @Binding var selection: Value
    let night: Bool
    @State private var bar = TabBarModel()

    func body(content: Content) -> some View {
        content
            .environment(bar)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !bar.hidden {
                    KTTabBar(items: items, selection: $selection, night: night)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: bar.hidden)
    }
}
