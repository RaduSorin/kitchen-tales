import AudioToolbox
import SwiftUI
import UIKit
import UserNotifications

/// "Gătește pas cu pas": the recipe photo, blurred and dimmed, fills the screen (or the step's own
/// photo; without any photo, a warm glow in the category's colour); gold progress segments and the
/// title on top, with the microphone for hands-free cooking; the step written big in the serif
/// straight on the photo, with no card, and "Îți trebuie: …" under it; "‹ Înapoi" as text and
/// one gold button for the next step; "Pune un timer" and "Ingrediente" as text at the bottom.
/// Tapping the left or right of the screen (or swiping) also moves; swipe up for the list.
/// The screen stays on; a timer rings even when the phone is locked.
struct CookModeView: View {
    let session: CookSession
    @Environment(RecipeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var step: Int
    @State private var finished = false
    @State private var showsIngredients = false
    @State private var have: Set<Int> = []
    @State private var note = ""
    @State private var timers: CookTimers
    @State private var handsFree = HandsFree()

    init(session: CookSession) {
        self.session = session
        let saved = CookProgress.step(session.recipe.id) ?? 0
        let start = LaunchOptions.screen == "cook" ? 2 : LaunchOptions.screen == "cook-ingredients" ? 0 : saved
        _step = State(initialValue: min(max(0, start), max(0, session.recipe.steps.count - 1)))
        _timers = State(initialValue: CookTimers(recipe: session.recipe))
        _showsIngredients = State(initialValue: LaunchOptions.screen == "cook-ingredients")
    }

    private var recipe: Recipe { session.recipe }
    private var factor: Double {
        recipe.servings.flatMap { base in session.servings.map { Double($0) / Double(base) } } ?? 1
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if recipe.steps.isEmpty {
                EmptyStateView(symbol: "list.number", title: "Fără pași", message: "Rețeta nu are pași de urmat.")
                    .overlay(alignment: .topTrailing) { closeButton.padding(.trailing, 16) }
            } else if finished {
                finish
            } else {
                stepScreen
            }
        }
        .sheet(isPresented: $showsIngredients) { ingredientsSheet }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            trackBadge(.cookOpened)
            if LaunchOptions.screen == "cook" { timers.startDemo(step: step) }
            handsFree.onCommand = { command($0) }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            handsFree.stop()
        }
        .onChange(of: step) { if handsFree.on { handsFree.say(stepSpeech(step)) } }
        .onChange(of: finished) { if handsFree.on, finished { handsFree.say("Poftă bună! Ai terminat \(recipe.title).") } }
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
    }

    // MARK: A step

    private var stepScreen: some View {
        let forStep = RecipeText.ingredientsForStep(recipe.steps[step], recipe.ingredients)
        return ZStack {
            StepBackground(recipe: recipe, step: step)
                .id(step)
                .transition(.opacity)
            // Tap the left third to go back, the rest to go on (the web's cook-zones).
            GeometryReader { g in
                HStack(spacing: 0) {
                    Color.clear.contentShape(Rectangle()).frame(width: g.size.width * 0.3)
                        .onTapGesture { go(-1) }
                        .accessibilityLabel("Pasul anterior").accessibilityAddTraits(.isButton)
                    Color.clear.contentShape(Rectangle()).frame(width: g.size.width * 0.7)
                        .onTapGesture { go(1) }
                        .accessibilityLabel("Pasul următor").accessibilityAddTraits(.isButton)
                }
            }
            .padding(.top, 90)
            .ignoresSafeArea()
            VStack(spacing: 0) {
                top
                Spacer(minLength: 20)
                panel(forStep)
                Spacer(minLength: 20)
                stepButtons
                bottomLinks
            }
        }
        .gesture(DragGesture(minimumDistance: 30).onEnded { value in
            let dx = value.translation.width, dy = value.translation.height
            if abs(dy) > 60, abs(dy) > abs(dx) {
                if dy < 0 { showsIngredients = true }
            } else if abs(dx) > 60 {
                go(dx < 0 ? 1 : -1)
            }
        })
    }

    private var top: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 4) {
                ForEach(0..<recipe.steps.count, id: \.self) { i in
                    Capsule().fill(i <= step ? Theme.accent : Color.white.opacity(0.2)).frame(height: 3)
                }
            }
            .animation(.snappy, value: step)
            .accessibilityElement()
            .accessibilityLabel("Pasul \(step + 1) din \(recipe.steps.count)")
            HStack(spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(recipe.title)
                        .font(.custom(AppFont.storyDisplay, size: 18, relativeTo: .headline))
                        .lineLimit(1)
                    Text("\(step + 1) din \(recipe.steps.count)")
                        .font(.custom(AppFont.body, size: 13.5, relativeTo: .subheadline))
                        .opacity(0.7)
                        .fixedSize()
                }
                Spacer(minLength: 4)
                micButton
                closeButton
            }
            let others = otherTimers
            if !others.isEmpty {
                HStack(spacing: 6) {
                    ForEach(others, id: \.self) { k in
                        let left = timers.left(k)
                        Button { withAnimation(.snappy) { step = k }; CookProgress.set(recipe.id, step: k) } label: {
                            Text("Pasul \(k + 1) · \(left == 0 ? "gata!" : RecipeText.clock(left))")
                                .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote).monospacedDigit())
                                .padding(.horizontal, 14).frame(height: 36)
                                .background(Capsule().fill(.white.opacity(0.2)))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.35), radius: 6)
        .padding(.horizontal, 12)
        .padding(.top, 10)
    }

    /// Other steps whose timer runs or has rung.
    private var otherTimers: [Int] {
        timers.timers.filter { $0.key != step && ($0.value.endsAt != nil || $0.value.left == 0) }.keys.sorted()
    }

    private var micButton: some View {
        Button { toggleHandsFree() } label: {
            Image(systemName: handsFree.on ? "mic.fill" : "mic")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(handsFree.on ? Theme.accent : .white)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .symbolEffect(.pulse, isActive: handsFree.listening)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(handsFree.on ? "Oprește gătitul fără mâini" : "Gătește fără mâini: citesc pașii și te ascult")
    }

    private var closeButton: some View {
        Button { close() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Închide modul de gătit")
    }

    /// The step, big, straight on the photo: "PASUL 1", the text in the serif, what it needs.
    private func panel(_ forStep: [String]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if handsFree.on || handsFree.error != nil { listenBox }
            Text("Pasul \(step + 1)".uppercased(with: Locale(identifier: "ro")))
                .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                .tracking(1.6)
                .foregroundStyle(Theme.accent)
            Text(recipe.steps[step])
                .font(.custom(AppFont.storyDisplay, size: Self.stepSize(recipe.steps[step]), relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .lineSpacing(1)
                .minimumScaleFactor(0.6)
                .fixedSize(horizontal: false, vertical: true)
                .id(step)
                .transition(.opacity)
            if !forStep.isEmpty {
                let needs = Self.needs(forStep, factor: factor)
                (Text("Îți trebuie: ").foregroundStyle(Theme.text.opacity(0.75))
                 + Text(needs)
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline)).foregroundStyle(Theme.text))
                    .font(.custom(AppFont.body, size: 15, relativeTo: .subheadline))
                    .fixedSize(horizontal: false, vertical: true)
            }
            TimerBox(timers: timers, step: step)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .shadow(color: .black.opacity(0.35), radius: 8)
    }

    /// "2 cepe, 1 morcov": what the step uses, scaled to the portions.
    static func needs(_ lines: [String], factor: Double) -> String {
        lines.map { RecipeText.scaleIngredient($0, factor: factor) }.joined(separator: ", ")
    }

    /// Short steps big (34), long ones smaller, so a step still fits without scrolling.
    static func stepSize(_ text: String) -> CGFloat {
        switch text.count {
        case ..<90: 34
        case ..<180: 28
        case ..<300: 23
        default: 20
        }
    }

    /// "‹ Înapoi" as text and the gold "Pasul 2 ›" (or "Gata ›" on the last step).
    private var stepButtons: some View {
        let last = step == recipe.steps.count - 1
        return HStack {
            if step > 0 {
                Button { go(-1) } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left").font(.system(size: 14, weight: .semibold))
                        Text("Înapoi")
                    }
                    .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout))
                    .foregroundStyle(.white)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer()
            Button { go(1) } label: {
                HStack(spacing: 8) {
                    Text(last ? "Gata" : "Pasul \(step + 2)")
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold))
                }
            }
            .buttonStyle(.ktPrimary)
            .accessibilityLabel(last ? "Am terminat" : "Pasul următor")
        }
        .padding(.horizontal, 24)
    }

    /// "Pune un timer" (when the step has one that is not set yet) and "Ingrediente", as text.
    private var bottomLinks: some View {
        HStack(spacing: 34) {
            if timers.duration(step) > 0, timers.timers[step] == nil {
                Button { timers.start(step) } label: {
                    Label("Pune un timer", systemImage: "timer")
                }
            }
            Button { showsIngredients = true } label: {
                Label("Ingrediente", systemImage: "line.3.horizontal.decrease")
            }
        }
        .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
        .foregroundStyle(.white.opacity(0.85))
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .padding(.top, 18)
        .padding(.bottom, 6)
    }

    private var listenBox: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let error = handsFree.error {
                Text(error).foregroundStyle(Color(hex: 0xFF9F9F))
            } else {
                Text(handsFree.listening ? "Te ascult" : "Pornesc microfonul…")
                    .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.accent)
                Text(handsFree.heard.isEmpty ? "„următorul” · „înapoi” · „repetă” · „ingrediente” · „pornește timerul”" : "„\(handsFree.heard)”")
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
        }
        .font(.custom(AppFont.body, size: 14, relativeTo: .footnote))
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.accent.opacity(0.12)))
    }

    // MARK: Ingredients

    /// The checklist, the ones this step uses first ("Pentru pasul 2", then "Toată rețeta").
    private var ingredientsSheet: some View {
        let forStep = Set(RecipeText.ingredientsForStep(recipe.steps.isEmpty ? "" : recipe.steps[step], recipe.ingredients))
        let lines = Array(recipe.ingredients.enumerated())
        let first = lines.filter { forStep.contains($0.element) }
        let rest = lines.filter { !forStep.contains($0.element) }
        return ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.servings.map { "Ingrediente · \($0) porții" } ?? "Ingrediente")
                    .font(.custom(AppFont.storyDisplay, size: 26, relativeTo: .title2))
                    .foregroundStyle(Theme.text)
                    .padding(.bottom, 8)
                if !first.isEmpty {
                    sheetLabel("Pentru pasul \(step + 1)")
                    ForEach(first, id: \.offset) { checkRow($0.offset, $0.element) }
                    sheetLabel("Toată rețeta").padding(.top, 10)
                }
                ForEach(rest, id: \.offset) { item in
                    if RecipeText.isHeading(item.element) {
                        sheetLabel(item.element.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ":", with: "")).padding(.top, 10)
                    } else {
                        checkRow(item.offset, item.element)
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 26)
            .padding(.bottom, 20)
        }
        .background(Theme.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .environment(\.colorScheme, .dark)
    }

    private func sheetLabel(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro")))
            .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
            .tracking(1.1)
            .foregroundStyle(Theme.muted)
            .padding(.vertical, 4)
    }

    private func checkRow(_ k: Int, _ line: String) -> some View {
        let on = have.contains(k)
        return Button {
            Haptics.select()
            if on { have.remove(k) } else { have.insert(k) }
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(on ? Theme.accent : Theme.text.opacity(0.45), lineWidth: 1.6)
                    .background(RoundedRectangle(cornerRadius: 6).fill(on ? Theme.accent : .clear))
                    .overlay { if on { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.Night.ink) } }
                    .frame(width: 22, height: 22)
                Text(RecipeText.scaleIngredient(line, factor: factor))
                    .font(.ktBody)
                    .foregroundStyle(on ? Theme.muted : Theme.text)
                    .strikethrough(on, color: Theme.muted)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: The end

    private var finish: some View {
        VStack(spacing: 18) {
            HStack { Spacer(); closeButton }.padding(.top, 10)
            Spacer()
            Group {
                if recipe.hasPhoto {
                    RecipePhoto(recipe: recipe, cornerRadius: 0).frame(width: 150, height: 150).clipShape(Circle())
                } else {
                    RecipeLabelDrawing(kind: RecipeLabel.kind(recipe.category)).frame(width: 110, height: 110)
                }
            }
            .accessibilityHidden(true)
            Text("Poftă bună!").font(.custom(AppFont.storyDisplay, size: 36, relativeTo: .largeTitle)).foregroundStyle(Theme.text)
            Text("Ai terminat \(recipe.title).").font(.ktCallout).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 8) {
                Text("O notă pentru data viitoare? (opțional)").font(.ktFootnote).foregroundStyle(Theme.muted)
                TextField("ex. mai puțină sare, copilului i-a plăcut", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.ktBody)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface2))
            }
            .padding(.top, 10)
            Spacer()
            Button(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Gata" : "Salvează nota și închide") {
                Task {
                    let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty { await store.addNote(recipe.id, text: text) }
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
            trackBadge(.cookFinished)
        }
    }

    // MARK: Moving and voice

    private func go(_ delta: Int) {
        showsIngredients = false
        let next = step + delta
        if next >= recipe.steps.count {
            withAnimation(.snappy) { finished = true }
            Haptics.success()
            return
        }
        guard next >= 0 else { return }
        Haptics.select()
        withAnimation(.snappy) { step = next }
        CookProgress.set(recipe.id, step: next)
    }

    private func close() {
        if !finished { CookProgress.set(recipe.id, step: step > 0 ? step : nil) }
        dismiss()
    }

    private func stepSpeech(_ k: Int) -> String {
        let d = RecipeText.detectDuration(recipe.steps[k])
        return "Pasul \(k + 1). \(recipe.steps[k])" + (d > 0 ? " Are un timer de \(CookCommand.spokenDuration(d)). Spune: pornește timerul." : "")
    }

    private func toggleHandsFree() {
        Haptics.tap()
        if handsFree.on {
            handsFree.stop()
            return
        }
        handsFree.start()
        let lead = "Te ascult. Spune: următorul, înapoi, repetă, ingrediente sau pornește timerul."
        handsFree.say(finished ? lead : "\(lead) \(stepSpeech(step))")
    }

    private func command(_ c: CookCommand) {
        switch c {
        case .next:
            go(1)
            trackBadge(.handsFree)
        case .prev:
            if finished { withAnimation(.snappy) { finished = false } } else { go(-1) }
        case .repeatStep: handsFree.say(finished ? "Poftă bună!" : stepSpeech(step))
        case .ingredients:
            let forStep = RecipeText.ingredientsForStep(recipe.steps[step], recipe.ingredients)
            let list = forStep.isEmpty ? recipe.ingredients.filter { !RecipeText.isHeading($0) } : forStep
            handsFree.say(list.isEmpty ? "Rețeta nu are ingrediente scrise."
                          : "\(forStep.isEmpty ? "Ingrediente" : "Pentru pasul \(step + 1)"): \(list.map { RecipeText.scaleIngredient($0, factor: factor) }.joined(separator: ", ")).")
        case .timer:
            let total = timers.duration(step)
            if total == 0 { handsFree.say("Pasul acesta nu are timer.") }
            else if !timers.isRunning(step) {
                let left = timers.left(step)
                if left == 0 { timers.reset(step) }
                timers.start(step)
                handsFree.say("Am pornit timerul de \(CookCommand.spokenDuration(left > 0 ? left : total)).")
            }
        case .pause:
            if timers.isRunning(step) { timers.pause(step); handsFree.say("Am oprit timerul.") }
        case .step(let n):
            if n >= 1, n <= recipe.steps.count {
                finished = false
                showsIngredients = false
                withAnimation(.snappy) { step = n - 1 }
                CookProgress.set(recipe.id, step: n - 1)
            } else {
                handsFree.say("Rețeta are \(recipe.steps.count) pași.")
            }
        case .stop:
            handsFree.stop()
            handsFree.say("Gata, nu mai ascult.")
        }
    }
}

/// The step's own photo fills the screen, dimmed at the bottom where the text sits; otherwise the
/// recipe photo, blurred and dimmed; without any photo, a warm glow in the category's colour.
private struct StepBackground: View {
    let recipe: Recipe
    let step: Int

    var body: some View {
        let own = recipe.stepPhoto(step)
        ZStack {
            if let own {
                RecipePhoto(recipe: recipe, key: own, cornerRadius: 0)
                LinearGradient(stops: [.init(color: .black.opacity(0.5), location: 0), .init(color: .clear, location: 0.2),
                                       .init(color: .black.opacity(0.55), location: 0.45), .init(color: .black.opacity(0.85), location: 1)],
                               startPoint: .top, endPoint: .bottom)
            } else if recipe.hasPhoto {
                RecipePhoto(recipe: recipe, cornerRadius: 0)
                    .scaleEffect(1.15)
                    .blur(radius: 28)
                    .overlay(Color.black.opacity(0.55))
            } else {
                let tint = RecipeLabel.tint(RecipeLabel.kind(recipe.category))
                Theme.background
                RadialGradient(colors: [Color(hex: tint.0), Color(hex: tint.1).opacity(0.6), .clear],
                               center: UnitPoint(x: 0.3, y: 0.1), startRadius: 0, endRadius: 520)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Lays its children out in rows, wrapping to the next row when one is full.
struct WrapLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { y += row + spacing; x = 0; row = 0 }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { y += row + spacing; x = bounds.minX; row = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
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
        trackBadge(.timers(running: timers.values.filter { $0.endsAt != nil }.count))
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

/// The timer inside the step card (the web's cook-timer): the time big on a light bar, and a
/// gold Pornește / Pauză / Continuă / Din nou button.
private struct TimerBox: View {
    let timers: CookTimers
    let step: Int

    var body: some View {
        let total = timers.duration(step)
        // Shown once the timer is set ("Pune un timer" at the bottom sets it).
        if total > 0, timers.timers[step] != nil {
            let left = timers.left(step)
            let running = timers.isRunning(step)
            let done = left == 0
            let action = running ? "Pauză" : done ? "Din nou" : left < total ? "Continuă" : "Pornește"
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    Text(done ? "Gata!" : RecipeText.clock(left))
                        .font(.custom(AppFont.storyDisplay, size: 34, relativeTo: .title).monospacedDigit())
                        .foregroundStyle(Theme.accent)
                        .contentTransition(.numericText(countsDown: true))
                        .phaseAnimator(done ? [false, true] : [false]) { view, on in
                            view.scaleEffect(on ? 1.06 : 1, anchor: .leading)
                        } animation: { _ in .easeInOut(duration: 0.5) }
                    Button {
                        if running { timers.pause(step) } else if done { timers.reset(step) } else { timers.start(step) }
                    } label: {
                        Text(action)
                            .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .callout))
                            .foregroundStyle(.white)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(running ? "Timer, mai sunt \(RecipeText.clock(left)). \(action)" : "Timer de \(RecipeText.clock(total)). \(action)")
                }
                if running {
                    Text("Sună și cu telefonul blocat, chiar dacă ieși din aplicație.")
                        .font(.custom(AppFont.body, size: 13, relativeTo: .caption))
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
            .animation(.snappy, value: left)
        }
    }
}
