import SwiftUI

@main
struct KitchenTalesApp: App {
    init() {
        Theme.applyAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .environment(\.locale, Locale(identifier: "ro_RO"))
        }
    }
}

/// Launch arguments used by the simulator screenshots in CI, e.g. `-tab profile -screen catalog`.
/// Passing `-key value` on launch puts the value into UserDefaults under `key`.
enum LaunchOptions {
    static var tab: AppTab? { UserDefaults.standard.string(forKey: "tab").flatMap(AppTab.init(rawValue:)) }
    static var screen: String? { UserDefaults.standard.string(forKey: "screen") }
}
