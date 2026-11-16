import SwiftUI

extension View {
    /// In kid mode: a small lock with the time left at the top left (where the Rețete / Povești
    /// switch was; Face ID or the PIN takes you out), the lock screen when the time runs out, and
    /// the capsule when the child turns the volume past the ceiling.
    func kidModeChrome() -> some View { modifier(KidModeChrome()) }
}

@MainActor private struct KidModeChrome: ViewModifier {
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var leaving = false

    func body(content: Content) -> some View {
        content
            .kidQueueChoice()
            .overlay(alignment: .topLeading) {
                if kid.active {
                    Button { Task { await leave() } } label: { KidBadge() }
                        .buttonStyle(.plain)
                        .padding(.leading, 16)
                        .padding(.top, 2)
                        .accessibilityLabel("Ieși din modul copil")
                }
            }
            .sheet(isPresented: $leaving) {
                KidPinGate(title: "PIN-ul de părinte", unlocked: { kid.exit(); leaving = false }, retryFace: retryFace)
                    .background(Theme.background.ignoresSafeArea())
                    .presentationDetents([.large])
            }
            .fullScreenCover(isPresented: Binding(get: { kid.locked }, set: { _ in })) {
                KidLockScreen()
            }
            .volumeCapNotice()
    }

    /// Face ID first when it is on and the phone has it; the PIN when it does not recognise you.
    private func leave() async {
        guard ParentCheck.available else { leaving = true; return }
        switch await ParentCheck.ask() {
        case .passed: Haptics.success(); kid.exit()
        case .usePin: leaving = true
        case .cancelled: break
        }
    }

    /// The face key on the PIN pad: try Face ID again from there.
    private var retryFace: (() -> Void)? {
        guard ParentCheck.available else { return nil }
        return {
            Task {
                if await ParentCheck.ask() == .passed { Haptics.success(); kid.exit(); leaving = false }
            }
        }
    }
}

extension View {
    /// "Volumul maxim pentru Matei": shown for a moment at the top when the child turns the
    /// phone up past kid mode's ceiling (on the stories and on the player page).
    func volumeCapNotice() -> some View { modifier(VolumeCapNotice()) }
}

@MainActor private struct VolumeCapNotice: ViewModifier {
    @Environment(StoryPlayer.self) private var player
    @Environment(ProfileStore.self) private var profile
    @State private var showing = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if showing {
                    VolumeCapCapsule(name: profile.settings.childName)
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .allowsHitTesting(false)
                }
            }
            .onChange(of: player.capNotices) {
                withAnimation(.snappy) { showing = true }
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    withAnimation(.easeOut(duration: 0.4)) { showing = false }
                }
            }
    }
}

private struct VolumeCapCapsule: View {
    let name: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "headphones").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.accent)
            Text(Self.label(name)).font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline)).foregroundStyle(Theme.text)
            Capsule().fill(Theme.accent).frame(width: 56, height: 5)
        }
        .padding(.horizontal, 16)
        .frame(height: 42)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.35)))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .combine)
    }

    static func label(_ name: String) -> String {
        name.isEmpty ? "Volumul maxim pentru copii" : "Volumul maxim pentru \(name)"
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
    var retryFace: (() -> Void)?
    @Environment(KidMode.self) private var kid
    @Environment(ProfileStore.self) private var profile
    @State private var message: String?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let wait = kid.pinWait(now: context.date)
            PinPad(title: title, message: wait > 0 ? "Prea multe încercări. Mai așteaptă \(wait) s." : message, disabled: wait > 0,
                   faceAction: retryFace) { pin in
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

/// The time ran out: the story is paused and only a parent (Face ID, or the PIN) opens the app
/// again, with more time or out of kid mode.
private struct KidLockScreen: View {
    @Environment(KidMode.self) private var kid
    @State private var parent = false
    /// "Folosește PIN-ul", or Face ID did not recognise the face: the number pad shows.
    @State private var usesPin = false

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
                    if ParentCheck.available && !usesPin {
                        Spacer()
                        VStack(spacing: 18) {
                            Button { Task { await askFace() } } label: {
                                Label("Sunt părinte", systemImage: ParentCheck.symbol)
                            }
                            .buttonStyle(.ktPrimaryWide)
                            Button("Folosește PIN-ul") { usesPin = true }
                                .font(.ktButton)
                                .foregroundStyle(Theme.accent)
                        }
                        .padding(.horizontal, 40)
                        .padding(.bottom, 60)
                    } else {
                        KidPinGate(title: "PIN-ul de părinte", unlocked: { parent = true }, retryFace: retryFace)
                            .background(Color.clear)
                    }
                }
            }
        }
        .interactiveDismissDisabled()
        .onChange(of: kid.locked) { if !kid.locked { parent = false; usesPin = false } }
    }

    private func askFace() async {
        switch await ParentCheck.ask() {
        case .passed: Haptics.success(); parent = true
        case .usePin: usesPin = true
        case .cancelled: break
        }
    }

    private var retryFace: (() -> Void)? {
        guard ParentCheck.available else { return nil }
        return { Task { await askFace() } }
    }
}
