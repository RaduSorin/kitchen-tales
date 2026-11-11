import SwiftUI

extension View {
    /// In kid mode: a small lock with the time left at the top left (where the Rețete / Povești switch was) (the PIN takes you out), and the
    /// lock screen when the time runs out.
    func kidModeChrome() -> some View { modifier(KidModeChrome()) }
}

private struct KidModeChrome: ViewModifier {
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var leaving = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .topLeading) {
                if kid.active {
                    Button { leaving = true } label: { KidBadge() }
                        .buttonStyle(.plain)
                        .padding(.leading, 16)
                        .padding(.top, 2)
                        .accessibilityLabel("Ieși din modul copil")
                }
            }
            .sheet(isPresented: $leaving) {
                KidPinGate(title: "PIN-ul de părinte", unlocked: { kid.exit(); leaving = false })
                    .background(Theme.background.ignoresSafeArea())
                    .presentationDetents([.large])
            }
            .fullScreenCover(isPresented: Binding(get: { kid.locked }, set: { _ in })) {
                KidLockScreen()
            }
    }
}

/// The lock and the minutes left, as a glass capsule.
private struct KidBadge: View {
    @Environment(KidMode.self) private var kid

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            HStack(spacing: 6) {
                Image(systemName: "lock.fill").font(.system(size: 12, weight: .bold))
                if let left = kid.left(now: context.date) {
                    Text("\(Int((left / 60).rounded(.up))) min").font(.system(.footnote, weight: .semibold)).monospacedDigit()
                }
            }
            .foregroundStyle(Theme.Night.moon)
            .padding(.horizontal, 12)
            .frame(height: 32)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.14)))
            .environment(\.colorScheme, .dark)
        }
    }
}

/// The PIN pad that lets a parent through (with the wait after too many wrong tries).
private struct KidPinGate: View {
    let title: String
    let unlocked: () -> Void
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var message: String?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let wait = kid.pinWait(now: context.date)
            PinPad(title: title, message: wait > 0 ? "Prea multe încercări. Mai așteaptă \(wait) s." : message, disabled: wait > 0) { pin in
                if kid.tryPin(pin, check: profile.checkPin) {
                    Haptics.success()
                    unlocked()
                } else {
                    Haptics.warning()
                    message = "PIN greșit. Încearcă din nou."
                }
            }
        }
    }
}

/// The time ran out: the story is paused and only the parent's PIN opens the app again, with
/// more time or out of kid mode.
private struct KidLockScreen: View {
    @Environment(KidMode.self) private var kid
    @State private var parent = false

    var body: some View {
        ZStack {
            NightBackdrop()
            if parent {
                VStack(spacing: 14) {
                    Spacer()
                    Text("Cât mai ascultă?").font(.ktTitle).foregroundStyle(Theme.text)
                    ForEach([10, 20, 30], id: \.self) { m in
                        Button("Încă \(m) minute") { kid.extend(minutes: m) }.buttonStyle(.ktPrimaryWide)
                    }
                    Button("Ieși din modul copil") { kid.exit() }.buttonStyle(.ktSecondaryWide)
                    Spacer()
                }
                .padding(.horizontal, 32)
            } else {
                VStack(spacing: 0) {
                    VStack(spacing: 10) {
                        Text("🌙").font(.system(size: 64))
                        Text("Gata pentru azi").font(.ktKidsTitle).foregroundStyle(Theme.text)
                        Text("Poveștile se odihnesc acum. Cheamă un părinte.").font(.ktKidsBody).foregroundStyle(Theme.Night.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 60)
                    .padding(.horizontal, 32)
                    KidPinGate(title: "PIN-ul de părinte", unlocked: { parent = true })
                        .background(Color.clear)
                }
            }
        }
        .interactiveDismissDisabled()
    }
}
