import SwiftUI

@main
struct KitchenTalesApp: App {
    @State private var auth = AuthModel()

    init() {
        Theme.applyAppearance()
        NotificationRouter.shared.install()
    }

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environment(auth)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .environment(\.locale, Locale(identifier: "ro_RO"))
                .onOpenURL { url in
                    if let command = AppCommands.command(for: url) { AppCommands.shared.pending = command }
                }
        }
    }
}

/// Login until there is a session, then the tabs.
struct AppRoot: View {
    @Environment(AuthModel.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .starting:
                Theme.background.ignoresSafeArea()
            case .signedOut:
                LoginView()
                    .transition(.opacity)
            case .signedIn:
                if let screen = LaunchOptions.screen, screen.hasPrefix("share-") {
                    ShareCardDemo(screen: screen)
                } else {
                    RootView()
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.35), value: auth.state)
        .task { await auth.start() }
    }
}

/// Launch arguments used by the simulator screenshots in CI, e.g. `-tab profile -screen catalog`.
/// Passing `-key value` on launch puts the value into UserDefaults under `key`.
enum LaunchOptions {
    /// `-tab <name>`: the tab to open (a recipes tab or a stories tab, by its raw value).
    static var tab: String? { UserDefaults.standard.string(forKey: "tab") }
    /// `-area recipes|stories`: the side to open.
    static var area: AppArea? { UserDefaults.standard.string(forKey: "area").flatMap(AppArea.init(rawValue:)) }
    static var screen: String? { UserDefaults.standard.string(forKey: "screen") }

    /// `-demo 1`: a made-up signed-in account, so screenshots can show the app without a real
    /// sign-in. Only in debug builds; TestFlight builds ignore it.
    static var demoAccount: Account? {
        #if DEBUG
        guard UserDefaults.standard.bool(forKey: "demo") else { return nil }
        return Account(user: "demo", email: "sorin@exemplu.ro", name: "Sorin", groups: ["space-demo", "admins", "everyone"])
        #else
        return nil
        #endif
    }
}
