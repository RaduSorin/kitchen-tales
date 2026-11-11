import SwiftUI

/// The steps on "Pași": a plain line each with the grip ⠿, the gold number, the text, the timer
/// it found and the step's photo. Only the open step shows its tools (Poză, Dictează, Pas după,
/// Șterge). Drag the grip to move a step; the others make room.
struct StepList: View {
    @Bindable var draft: RecipeDraft
    var focus: FocusState<RecipeEditorView.Field?>.Binding
    let pickPhoto: (UUID) -> Void
    @State private var dragging: UUID?
    @State private var dragY: CGFloat = 0
    @State private var heights: [UUID: CGFloat] = [:]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(draft.steps.enumerated()), id: \.element.id) { i, step in
                StepRow(draft: draft, step: step, number: i + 1, open: draft.openStep == step.id, focus: focus,
                        pickPhoto: { pickPhoto(step.id) }, grip: grip(step.id, index: i))
                    .id(step.id)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[step.id] = $0 }
                    .offset(y: offset(for: i, step.id))
                    .zIndex(dragging == step.id ? 1 : 0)
                    .scaleEffect(dragging == step.id ? 1.02 : 1)
                    .shadow(color: .black.opacity(dragging == step.id ? 0.45 : 0), radius: 12, y: 4)
                    .background { if dragging == step.id { RoundedRectangle(cornerRadius: 12).fill(Theme.surface) } }
                    .accessibilityAction(named: "Mută mai sus") { if i > 0 { draft.moveStep(from: i, to: i - 1) } }
                    .accessibilityAction(named: "Mută mai jos") { if i < draft.steps.count - 1 { draft.moveStep(from: i, to: i + 1) } }
            }
        }
        .animation(.snappy(duration: 0.2), value: target)
    }

    private var from: Int? { dragging.flatMap { id in draft.steps.firstIndex { $0.id == id } } }

    /// Where the dragged step would land.
    private var target: Int? {
        guard let from else { return nil }
        let hs = draft.steps.map { heights[$0.id] ?? 60 }
        var mids: [CGFloat] = []
        var y: CGFloat = 0
        for h in hs { mids.append(y + h / 2); y += h }
        let c = mids[from] + dragY
        var to = from
        while to < mids.count - 1 && c > mids[to + 1] { to += 1 }
        while to > 0 && c < mids[to - 1] { to -= 1 }
        return to
    }

    private func offset(for i: Int, _ id: UUID) -> CGFloat {
        guard let from, let to = target else { return 0 }
        if id == dragging { return dragY }
        let h = heights[draft.steps[from].id] ?? 60
        if from < i && i <= to { return -h }
        if to <= i && i < from { return h }
        return 0
    }

    private func grip(_ id: UUID, index: Int) -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { value in
                if dragging == nil {
                    focus.wrappedValue = nil
                    dragging = id
                    Haptics.tap()
                }
                let before = target
                dragY = value.translation.height
                if target != before { Haptics.select() }
            }
            .onEnded { _ in
                if let from, let to = target { draft.moveStep(from: from, to: to) }
                dragging = nil
                dragY = 0
            }
    }
}

private struct StepRow<G: Gesture>: View {
    @Bindable var draft: RecipeDraft
    let step: RecipeDraft.Step
    let number: Int
    let open: Bool
    var focus: FocusState<RecipeEditorView.Field?>.Binding
    let pickPhoto: () -> Void
    let grip: G
    @State private var dictation = Dictation()

    var body: some View {
        let seconds = RecipeText.detectDuration(step.text)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                GripDots()
                    .frame(width: 22, height: 30)
                    .contentShape(Rectangle().inset(by: -10))
                    .highPriorityGesture(grip)
                    .accessibilityLabel("Mută pasul \(number)")
                Text("\(number)")
                    .font(.custom(AppFont.bodyBold, size: 17, relativeTo: .body))
                    .foregroundStyle(Theme.accent)
                    .frame(minWidth: 18, alignment: .leading)
                    .padding(.top, 4)
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Ce faci la acest pas?", text: text, axis: .vertical)
                        .font(.ktBody)
                        .foregroundStyle(Theme.text)
                        .focused(focus, equals: .step(step.id))
                        .accessibilityLabel("Pasul \(number)")
                    if seconds > 0 {
                        Label(RecipeText.formatMinutes(max(1, Int((Double(seconds) / 60).rounded()))), systemImage: "timer")
                            .font(.system(.caption, weight: .bold))
                            .foregroundStyle(Theme.accent)
                    }
                }
                .padding(.top, 4)
                Spacer(minLength: 0)
                thumb
            }
            if open { tools.padding(.leading, 32) }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 0.5) }
        .contentShape(Rectangle())
        .onTapGesture { if !open { withAnimation(.snappy) { draft.openStep = step.id } } }
        .onChange(of: focus.wrappedValue) { if focus.wrappedValue == .step(step.id) { draft.openStep = step.id } }
        .onDisappear { dictation.stop() }
    }

    private var text: Binding<String> {
        Binding(get: { draft.steps.first { $0.id == step.id }?.text ?? "" },
                set: { v in if let i = draft.steps.firstIndex(where: { $0.id == step.id }) { draft.steps[i].text = v } })
    }

    private var hasPhoto: Bool { step.photo != nil || step.photoKey != nil }

    @ViewBuilder private var thumb: some View {
        if hasPhoto {
            Group {
                if let image = step.photo { Image(uiImage: image).resizable().scaledToFill() }
                else if let key = step.photoKey { StoredPhoto(key: key) }
            }
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .topTrailing) {
                if open {
                    Button { setPhoto(nil, key: nil) } label: {
                        Image(systemName: "xmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                            .frame(width: 22, height: 22).background(Circle().fill(.black.opacity(0.65)))
                    }
                    .offset(x: 6, y: -6)
                    .accessibilityLabel("Scoate poza de la pasul \(number)")
                }
            }
        }
    }

    private func setPhoto(_ image: UIImage?, key: String?) {
        guard let i = draft.steps.firstIndex(where: { $0.id == step.id }) else { return }
        draft.steps[i].photo = image
        draft.steps[i].photoKey = key
    }

    private var tools: some View {
        HStack(spacing: 6) {
            tool(hasPhoto ? "Altă poză" : "Poză", "camera") { pickPhoto() }
            Button {
                if dictation.busy { dictation.stop(); return }
                let base = text.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
                let id = step.id
                Task { await dictation.start { phrases, partial in
                    let said = (phrases + [partial]).filter { !$0.isEmpty }.joined(separator: " ")
                    guard !said.isEmpty else { return }
                    draft.setStepText(id, base.isEmpty ? said : "\(base)\n\(said)")
                } }
            } label: {
                toolLabel(dictation.state == .on ? MicButton.clock(dictation.seconds) : "Dictează",
                          dictation.state == .on ? "stop.fill" : "mic", tint: dictation.busy ? Theme.danger : Theme.text)
            }
            .buttonStyle(.plain)
            tool("Pas după", "plus") {
                if let i = draft.steps.firstIndex(where: { $0.id == step.id }) {
                    let id = draft.addStep(at: i + 1)
                    focus.wrappedValue = .step(id)
                }
            }
            tool("Șterge", "trash", tint: Theme.danger) { withAnimation(.snappy) { draft.removeStep(step.id) } }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func tool(_ title: String, _ symbol: String, tint: Color = Theme.text, _ action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); action() } label: { toolLabel(title, symbol, tint: tint) }
            .buttonStyle(.plain)
    }

    private func toolLabel(_ title: String, _ symbol: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 16, weight: .regular))
            Text(title).font(.system(.caption, weight: .semibold)).monospacedDigit()
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface))
    }
}

/// ⠿ in six small dots.
private struct GripDots: View {
    var body: some View {
        Canvas { ctx, size in
            for x in [9.0, 15.0] {
                for y in [6.0, 12.0, 18.0] {
                    let p = CGPoint(x: size.width / 2 + (x - 12), y: size.height / 2 + (y - 12))
                    ctx.fill(Path(ellipseIn: CGRect(x: p.x - 1.4, y: p.y - 1.4, width: 2.8, height: 2.8)), with: .color(Theme.muted.opacity(0.7)))
                }
            }
        }
    }
}
