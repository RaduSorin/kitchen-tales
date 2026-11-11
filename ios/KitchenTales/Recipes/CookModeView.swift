import AudioToolbox
import SwiftUI
import UIKit
import UserNotifications

/// "Gătește pas cu pas": one step on the screen in large type, the progress on top, swipe or the
/// buttons to move. The screen stays on while cooking; a step that names a time ("15 minute")
/// gets a timer that rings even when the phone is locked; the ingredients are in a sheet.
struct CookModeView: View {
    let session: CookSession
    @Environment(RecipeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var step: Int
    @State private var finished = false
    @State private var showsIngredients = false
    @State private var note = ""
    @State private var timers: CookTimers

    init(session: CookSession) {
        self.session = session
        let saved = CookProgress.step(session.recipe.id) ?? 0
        let start = LaunchOptions.screen == "cook" ? 2 : saved
        _step = State(initialValue: min(max(0, start), max(0, session.recipe.steps.count - 1)))
        _timers = State(initialValue: CookTimers(recipe: session.recipe))
    }

    private var recipe: Recipe { session.recipe }
    private var factor: Double {
        recipe.servings.flatMap { base in session.servings.map { Double($0) / Double(base) } } ?? 1
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            RadialGradient(colors: [Color(hex: 0xBE7A3E).opacity(0.32), .clear], center: UnitPoint(x: 0.5, y: 0),
                           startRadius: 0, endRadius: 460)
                .ignoresSafeArea()
            if recipe.steps.isEmpty {
                EmptyStateView(symbol: "list.number", title: "Fără pași", message: "Rețeta nu are pași de urmat.")
            } else if finished {
                finish
            } else {
                stepScreen
            }
        }
        .overlay(alignment: .topLeading) {
            Button { close() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 40, height: 40)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.12)))
            }
            .accessibilityLabel("Închide")
            .padding(.leading, 16)
            .padding(.top, 6)
        }
        .sheet(isPresented: $showsIngredients) { ingredientsSheet }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            if LaunchOptions.screen == "cook" { timers.startDemo(step: step) }
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .environment(\.colorScheme, .dark)
    }

    // MARK: A step

    private var stepScreen: some View {
        VStack(alignment: .leading, spacing: 0) {
            progress
                .padding(.top, 58)
            Text("Pasul \(step + 1) din \(recipe.steps.count)".uppercased(with: Locale(identifier: "ro")))
                .font(.ktLabel).tracking(1.2)
                .foregroundStyle(Theme.accent)
                .padding(.top, 30)
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    Text(recipe.steps[step])
                        .font(.custom(AppFont.display, size: 30, relativeTo: .title))
                        .foregroundStyle(Theme.text)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .id(step)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .offset(x: 30)), removal: .opacity))
                    if let key = recipe.stepPhoto(step) {
                        RecipePhoto(recipe: recipe, key: key, cornerRadius: 16).frame(height: 200)
                    }
                    TimerChip(timers: timers, step: step)
                }
                .padding(.top, 14)
            }
            .scrollIndicators(.hidden)
            HStack {
                Button { go(-1) } label: { Label("Înapoi", systemImage: "chevron.left") }
                    .buttonStyle(.ktSecondary)
                    .opacity(step == 0 ? 0.4 : 1)
                    .disabled(step == 0)
                Spacer()
                Button { go(1) } label: {
                    HStack(spacing: 6) {
                        Text(step + 1 == recipe.steps.count ? "Gata!" : "Următorul")
                        Image(systemName: step + 1 == recipe.steps.count ? "checkmark" : "chevron.right")
                    }
                }
                .buttonStyle(.ktPrimary)
            }
            .padding(.bottom, 16)
            ingredientsBar
        }
        .padding(.horizontal, 24)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 30).onEnded { value in
            let dx = value.translation.width
            guard abs(dx) > 60, abs(dx) > abs(value.translation.height) else { return }
            go(dx < 0 ? 1 : -1)
        })
    }

    private var progress: some View {
        HStack(spacing: 4) {
            ForEach(0..<recipe.steps.count, id: \.self) { i in
                Capsule().fill(i <= step ? Theme.accent : Color.white.opacity(0.18)).frame(height: 4)
            }
        }
        .animation(.snappy, value: step)
        .padding(.leading, 52)
        .accessibilityHidden(true)
    }

    private var ingredientsBar: some View {
        Button { showsIngredients = true } label: {
            VStack(spacing: 10) {
                Capsule().fill(Color.white.opacity(0.35)).frame(width: 38, height: 5)
                HStack(spacing: 6) {
                    Text("Ingrediente").font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout)).foregroundStyle(Theme.text)
                    Text("· \(recipe.ingredients.filter { !RecipeText.isHeading($0) }.count) · trage în sus")
                        .font(.ktFootnote).foregroundStyle(Theme.muted)
                    Spacer()
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity)
            .background(UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24).fill(Color(hex: 0x28221E).opacity(0.95)))
            .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 0.5) }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -24)
        .ignoresSafeArea(edges: .bottom)
        .gesture(DragGesture(minimumDistance: 10).onEnded { if $0.translation.height < -20 { showsIngredients = true } })
        .accessibilityLabel("Ingrediente")
    }

    private var ingredientsSheet: some View {
        NavigationStack {
            List {
                ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { _, line in
                    if RecipeText.isHeading(line) {
                        Text(line).font(.ktLabel).foregroundStyle(Theme.accent).listRowBackground(Theme.surface)
                    } else {
                        Text(RecipeText.scaleIngredient(line, factor: factor)).font(.ktBody).foregroundStyle(Theme.text)
                            .listRowBackground(Theme.surface)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(session.servings.map { "Ingrediente · \($0) porții" } ?? "Ingrediente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata") { showsIngredients = false } } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: The end

    private var finish: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("🍽️").font(.system(size: 64)).accessibilityHidden(true)
            Text("Poftă bună!").font(.custom(AppFont.display, size: 36, relativeTo: .largeTitle)).foregroundStyle(Theme.text)
            Text(recipe.title).font(.ktCallout).foregroundStyle(Theme.muted)
            VStack(alignment: .leading, spacing: 8) {
                Text("O notă pentru data viitoare? (opțional)").font(.ktFootnote).foregroundStyle(Theme.muted)
                TextField("Ex.: mai puțină sare", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.ktBody)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface2))
            }
            .padding(.top, 10)
            Spacer()
            Button("Salvează nota și închide") {
                Task {
                    await store.addNote(recipe.id, text: note)
                    dismiss()
                }
            }
            .buttonStyle(.ktPrimaryWide)
            Button("Înapoi la ultimul pas") { withAnimation(.snappy) { finished = false } }
                .font(.ktButton)
                .foregroundStyle(Theme.accent)
                .padding(.bottom, 8)
        }
        .padding(.horizontal, 24)
        .task {
            CookProgress.set(recipe.id, step: nil)
            timers.cancelAll()
            await store.markCooked(recipe.id)
        }
    }

    // MARK: Moving

    private func go(_ delta: Int) {
        let next = step + delta
        Haptics.select()
        if next >= recipe.steps.count {
            withAnimation(.snappy) { finished = true }
            Haptics.success()
            return
        }
        guard next >= 0 else { return }
        withAnimation(.snappy) { step = next }
        CookProgress.set(recipe.id, step: next)
    }

    private func close() {
        if !finished { CookProgress.set(recipe.id, step: step > 0 ? step : nil) }
        dismiss()
    }
}

/// The timers of one cooking session, a step each. A running timer keeps its end time, so it
/// keeps counting while you move between steps or lock the phone; a notification rings at the end.
@MainActor @Observable
final class CookTimers {
    struct Running: Hashable { var total: Int; var left: Int; var endsAt: Date? }

    private(set) var timers: [Int: Running] = [:]
    private(set) var now = Date()
    @ObservationIgnored private let recipe: Recipe
    @ObservationIgnored private var ticker: Timer?

    init(recipe: Recipe) { self.recipe = recipe }

    func duration(_ step: Int) -> Int {
        guard step < recipe.steps.count else { return 0 }
        return RecipeText.detectDuration(recipe.steps[step])
    }

    func left(_ step: Int) -> Int {
        guard let t = timers[step] else { return duration(step) }
        guard let end = t.endsAt else { return t.left }
        return max(0, Int(end.timeIntervalSince(now).rounded(.up)))
    }

    func isRunning(_ step: Int) -> Bool { timers[step]?.endsAt != nil }

    func start(_ step: Int) {
        let total = duration(step)
        guard total > 0 else { return }
        let left = timers[step].map { $0.endsAt == nil && $0.left > 0 ? $0.left : total } ?? total
        let end = Date().addingTimeInterval(TimeInterval(left))
        timers[step] = Running(total: total, left: left, endsAt: end)
        tick()
        schedule(step, at: end)
        Haptics.tap()
    }

    func pause(_ step: Int) {
        guard var t = timers[step], t.endsAt != nil else { return }
        t.left = left(step)
        t.endsAt = nil
        timers[step] = t
        cancel(step)
        Haptics.tap()
    }

    func reset(_ step: Int) {
        timers[step] = nil
        cancel(step)
    }

    func cancelAll() {
        for step in timers.keys { cancel(step) }
        timers = [:]
        ticker?.invalidate()
    }

    /// Screenshots: the step's timer running with a few minutes gone.
    func startDemo(step: Int) {
        let total = duration(step)
        guard total > 0 else { return }
        timers[step] = Running(total: total, left: 702, endsAt: Date().addingTimeInterval(702))
        tick()
    }

    private func tick() {
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.update() }
        }
    }

    private func update() {
        now = Date()
        for (step, t) in timers {
            guard let end = t.endsAt, end <= now else { continue }
            timers[step] = Running(total: t.total, left: 0, endsAt: nil)
            // The app is open: ring here (the notification only shows when it is in the background).
            AudioServicesPlayAlertSound(SystemSoundID(1005))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        if !timers.values.contains(where: { $0.endsAt != nil }) { ticker?.invalidate() }
    }

    private func id(_ step: Int) -> String { "cook-\(recipe.id)-\(step)" }

    private func schedule(_ step: Int, at end: Date) {
        let center = UNUserNotificationCenter.current()
        let id = id(step)
        let title = recipe.title
        let interval = max(1, end.timeIntervalSinceNow)
        Task {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "Gata timerul"
            content.body = "\(title) · pasul \(step + 1)"
            content.sound = .default
            let request = UNNotificationRequest(identifier: id, content: content,
                                                trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false))
            try? await center.add(request)
        }
    }

    private func cancel(_ step: Int) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id(step)])
    }
}

/// "⏱ 15:00 · Pornește", "⏱ 11:42 · Pauză", "Gata! · Din nou".
private struct TimerChip: View {
    let timers: CookTimers
    let step: Int

    var body: some View {
        let total = timers.duration(step)
        if total > 0 {
            let left = timers.left(step)
            let running = timers.isRunning(step)
            let done = timers.timers[step] != nil && left == 0
            HStack(spacing: 10) {
                Button {
                    if running { timers.pause(step) } else if done { timers.reset(step); timers.start(step) } else { timers.start(step) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: done ? "bell.fill" : "timer")
                        Text(done ? "Gata!" : RecipeText.clock(left)).monospacedDigit().contentTransition(.numericText(countsDown: true))
                        Text("·").foregroundStyle(Theme.accent.opacity(0.6))
                        Text(running ? "Pauză" : done ? "Din nou" : timers.timers[step] != nil ? "Continuă" : "Pornește")
                    }
                    .font(.custom(AppFont.bodyBold, size: 17, relativeTo: .body))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 18)
                    .frame(height: 46)
                    .background(Capsule().fill(Theme.accent.opacity(0.16)))
                    .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.35)))
                }
                .buttonStyle(.plain)
                if timers.timers[step] != nil, !running, !done {
                    Button("Resetează") { timers.reset(step) }
                        .font(.ktFootnote).foregroundStyle(Theme.muted)
                }
            }
            .animation(.snappy, value: left)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(running ? "Timer, mai sunt \(RecipeText.clock(left))" : "Timer de \(RecipeText.clock(total))")
        }
    }
}
