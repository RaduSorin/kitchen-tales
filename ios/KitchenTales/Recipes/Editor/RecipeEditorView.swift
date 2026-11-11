import SwiftUI

/// The editor itself (RecipeEdit.tsx, "calm concept 3"): the photo or the drawn plate on top with
/// ‹ and "Poza", "Editează" and the big name, the tabs Detalii / Ingrediente / Pași / Note and
/// one gold "Salvează rețeta" always at the bottom.
struct RecipeEditorView: View {
    @Bindable var draft: RecipeDraft
    let onClose: (Recipe?) -> Void
    @Environment(RecipeStore.self) private var store
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @State private var leaving = false
    @State private var pickingPhoto = false
    @State private var pickingStepPhoto = false
    @State private var stepForPhoto: UUID?
    @State private var newCategory = false
    @State private var categoryText = ""
    @FocusState private var focus: Field?

    enum Field: Hashable { case title, minutes, source, ingredients, notes, step(UUID) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                    VStack(alignment: .leading, spacing: 16) {
                        head
                        if let found = draft.found {
                            Text(found).font(.ktCallout).foregroundStyle(Theme.accent)
                        }
                        tabs
                        switch draft.tab {
                        case .details: details
                        case .ingredients: ingredients
                        case .steps: stepsPanel(proxy)
                        case .notes: notes
                        }
                        if !draft.error.isEmpty {
                            Text(draft.error).font(.ktCallout).foregroundStyle(Theme.danger)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, -64)
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .ignoresSafeArea(edges: .top)
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .top) { topBar }
        .safeAreaInset(edge: .bottom) { footer }
        .recipePhotoSource(isPresented: $pickingPhoto, title: photoLabel) { images in
            if let image = images.first { draft.pickPhoto(image) }
        }
        .recipePhotoSource(isPresented: $pickingStepPhoto, title: "Poza pasului") { images in
            if let image = images.first, let id = stepForPhoto, let i = draft.steps.firstIndex(where: { $0.id == id }) {
                draft.steps[i].photo = image
            }
        }
        .alert("Renunți la modificări?", isPresented: $leaving) {
            Button("Continuă editarea", role: .cancel) {}
            Button("Renunță la modificări", role: .destructive) { close() }
        } message: {
            Text("Ce ai schimbat la rețetă nu e salvat. Dacă pleci acum, se pierde.")
        }
        .alert("Categorie", isPresented: $newCategory) {
            TextField("Categorie", text: $categoryText)
            Button("Renunță", role: .cancel) {}
            Button("Gata") { draft.recipe.category = categoryText.trimmingCharacters(in: .whitespaces) }
        }
    }

    private var hasPhoto: Bool { draft.photo != nil || draft.recipe.photoKey != nil }
    private var photoLabel: String { hasPhoto ? "Schimbă poza" : "Adaugă o poză" }

    private func back() {
        if draft.dirty { leaving = true } else { close() }
    }

    private func close() {
        draft.discard()
        onClose(nil)
    }

    // MARK: Photo and name

    private var topBar: some View {
        HStack {
            EditorBackButton { back() }
            Spacer()
            Menu {
                Button { pickingPhoto = true } label: { Label(photoLabel, systemImage: "photo") }
                if draft.recipe.title.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text("Scrie numele rețetei și îți putem desena și o poză cu AI.")
                } else {
                    Button { draft.makeAiPhoto() } label: { Label(hasPhoto ? "Altă poză AI" : "Poză AI", systemImage: "sparkles") }
                        .disabled(draft.aiBusy)
                }
            } label: {
                Label("Poza", systemImage: "camera")
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.text)
                    .padding(.horizontal, 14)
                    .frame(height: 40)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
                    .environment(\.colorScheme, .dark)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private var hero: some View {
        Button { pickingPhoto = true } label: {
            Group {
                if let image = draft.photo {
                    Color.clear.overlay { Image(uiImage: image).resizable().scaledToFill() }.clipped()
                } else if let key = draft.recipe.photoKey {
                    if let original = draft.original, key == original.photoKey {
                        RecipePhoto(recipe: original, cornerRadius: 0)
                    } else {
                        StoredPhoto(key: key)
                    }
                } else if let demo = draft.recipe.demoPhoto, let image = DemoPhotos.image(demo) {
                    Color.clear.overlay { Image(uiImage: image).resizable().scaledToFill() }.clipped()
                } else {
                    PlateDrawing(seed: draft.recipe.title.isEmpty ? "rețetă" : draft.recipe.title)
                }
            }
            .frame(height: 340)
            .frame(maxWidth: .infinity)
            .overlay {
                LinearGradient(stops: [.init(color: .black.opacity(0.3), location: 0), .init(color: .clear, location: 0.3),
                                       .init(color: Theme.background.opacity(0.7), location: 0.82), .init(color: Theme.background, location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            .overlay(alignment: .bottomTrailing) {
                if draft.aiBusy {
                    HStack(spacing: 8) {
                        ProgressView().tint(Theme.accent).controlSize(.small)
                        Text("Generez o poză…").font(.system(.footnote, weight: .semibold)).foregroundStyle(Theme.text)
                    }
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(.ultraThinMaterial, in: Capsule())
                    .environment(\.colorScheme, .dark)
                    .padding(.trailing, 16).padding(.bottom, 80)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(photoLabel)
    }

    private var head: some View {
        VStack(alignment: .leading, spacing: 8) {
            EditorEyebrow(text: draft.isNew ? "Rețetă nouă" : "Editează")
            TextField("Numele rețetei", text: Binding(get: { draft.recipe.title }, set: { draft.recipe.title = $0.replacingOccurrences(of: #"\s*\n\s*"#, with: " ", options: .regularExpression) }),
                      axis: .vertical)
                .font(.custom(AppFont.displaySemibold, size: 32, relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .focused($focus, equals: .title)
                .submitLabel(.done)
                .onSubmit { focus = nil }
                .padding(.bottom, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
        }
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach(RecipeDraft.Tab.allCases) { t in
                let on = draft.tab == t
                Button {
                    Haptics.select()
                    focus = nil
                    withAnimation(.snappy(duration: 0.2)) { draft.tab = t }
                } label: {
                    Text(t.rawValue)
                        .font(.custom(on ? AppFont.bodyBold : AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
                        .foregroundStyle(on ? Theme.text : Theme.muted)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background { if on { RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.16)) } }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Theme.surface))
    }

    // MARK: Detalii

    private var details: some View {
        VStack(spacing: 0) {
            Menu {
                ForEach(categoryChoices, id: \.self) { c in
                    Button { draft.recipe.category = c } label: {
                        if c == draft.recipe.category { Label(c, systemImage: "checkmark") } else { Text(c) }
                    }
                }
                Divider()
                Button("Altă categorie…") { categoryText = draft.recipe.category; newCategory = true }
                if !draft.recipe.category.isEmpty {
                    Button("Fără categorie", role: .destructive) { draft.recipe.category = "" }
                }
            } label: {
                row("Categorie") {
                    Text(draft.recipe.category.isEmpty ? "alege" : draft.recipe.category)
                        .foregroundStyle(draft.recipe.category.isEmpty ? Theme.muted : Theme.text)
                        .fontWeight(draft.recipe.category.isEmpty ? .regular : .semibold)
                    chevron
                }
            }
            rowDivider
            row("Porții") {
                Text(draft.recipe.servings.map(String.init) ?? "–").fontWeight(.semibold).foregroundStyle(Theme.text).monospacedDigit()
                    .padding(.trailing, 6)
                smallStep("minus", "Mai puține porții", enabled: (draft.recipe.servings ?? 0) > 1) {
                    draft.recipe.servings = max(1, (draft.recipe.servings ?? 1) - 1)
                }
                smallStep("plus", "Mai multe porții", enabled: true, gold: true) {
                    draft.recipe.servings = (draft.recipe.servings ?? 0) + 1
                }
            }
            rowDivider
            row("Timp") {
                TextField("–", text: Binding(get: { draft.recipe.minutes.map(String.init) ?? "" },
                                             set: { draft.recipe.minutes = Int($0.filter(\.isNumber)).flatMap { $0 > 0 ? $0 : nil } }))
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.text)
                    .focused($focus, equals: .minutes)
                    .fixedSize()
                Text("min").fontWeight(.semibold).foregroundStyle(Theme.text)
                chevron
            }
            .contentShape(Rectangle())
            .onTapGesture { focus = .minutes }
            rowDivider
            row("Link sursă") {
                TextField("adaugă", text: Binding(get: { draft.recipe.sourceUrl ?? "" }, set: { draft.recipe.sourceUrl = $0.isEmpty ? nil : $0 }))
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Theme.text)
                    .focused($focus, equals: .source)
                chevron
            }
            .contentShape(Rectangle())
            .onTapGesture { focus = .source }
        }
        .padding(.horizontal, 16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
    }

    private var categoryChoices: [String] {
        var all = EditorText.categories
        for c in store.categoryNames where c != "Fără categorie" && !all.contains(c) { all.append(c) }
        if !draft.recipe.category.isEmpty && !all.contains(draft.recipe.category) { all.append(draft.recipe.category) }
        return all
    }

    private func row<Content: View>(_ label: String, @ViewBuilder _ value: () -> Content) -> some View {
        HStack(spacing: 8) {
            Text(label).foregroundStyle(Theme.muted)
            Spacer(minLength: 12)
            value()
        }
        .font(.ktBody)
        .frame(minHeight: 54)
    }

    private var rowDivider: some View { Rectangle().fill(Theme.border).frame(height: 0.5) }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted.opacity(0.7))
    }

    private func smallStep(_ symbol: String, _ label: String, enabled: Bool, gold: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button { Haptics.select(); action() } label: {
            Image(systemName: symbol).font(.system(size: 15, weight: .bold))
                .foregroundStyle(enabled ? (gold ? Theme.accent : Theme.text) : Theme.muted.opacity(0.4))
                .frame(width: 38, height: 38)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    // MARK: Ingrediente

    private var ingredients: some View {
        VStack(alignment: .leading, spacing: 12) {
            MicField(text: $draft.ingredients, placeholder: "500 g carne tocată",
                     minHeight: CGFloat(max(10, EditorText.lines(draft.ingredients).count + 2)) * 24,
                     hint: "Spune câte un ingredient, cu o mică pauză între ele.",
                     asLines: EditorText.spokenIngredientLines, gold: false)
            EditorTip(title: "Cum scriu ingredientele?",
                      text: "Câte unul pe rând, cu cantitatea la început (de exemplu „500 g carne tocată”), ca să se poată recalcula porțiile.")
        }
    }

    // MARK: Note

    private var notes: some View {
        MicField(text: Binding(get: { draft.recipe.notes ?? "" }, set: { draft.recipe.notes = $0 }),
                 placeholder: "Ce vrei să ții minte despre rețetă", minHeight: 200, gold: false)
    }

    // MARK: Pași

    private func stepsPanel(_ proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            StepList(draft: draft, focus: $focus) { id in
                stepForPhoto = id
                pickingStepPhoto = true
            }
            HStack(spacing: 10) {
                Button {
                    let id = draft.addStep()
                    focus = .step(id)
                    withAnimation { proxy.scrollTo(id, anchor: .center) }
                } label: {
                    Label("Adaugă un pas", systemImage: "plus")
                        .font(.ktButton).foregroundStyle(Theme.accent)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().strokeBorder(Theme.accent.opacity(0.45), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4])))
                }
                .buttonStyle(.plain)
                StepDictateButton(draft: draft)
            }
            EditorTip(title: "Cum merg cronometrul și pozele?",
                      text: "Dacă scrii un timp („10 minute”), apare un cronometru când gătești. Poza unui pas apare pe tot ecranul. Atinge un pas ca să-i vezi uneltele: poză, dictează, pas după și șterge. Trage de ⠿ ca să muți un pas.")
        }
    }

    // MARK: Salvează

    private var footer: some View {
        Button(draft.saving ? "Se salvează…" : "Salvează rețeta") {
            focus = nil
            Task {
                let name = profile.settings.spaceName ?? auth.account?.displayName
                if let saved = await draft.save(store: store, spaceName: name) { onClose(saved) }
            }
        }
        .buttonStyle(EditorBigButtonStyle())
        .disabled(draft.saving)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background {
            LinearGradient(colors: [Theme.background.opacity(0), Theme.background.opacity(0.92), Theme.background],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
    }
}

/// "Cum scriu ingredientele?": a small (i) line that opens to the tip.
struct EditorTip: View {
    let title: String
    let text: String
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                Label(title, systemImage: "info.circle")
                    .font(.ktFootnote).foregroundStyle(Theme.muted)
            }
            .buttonStyle(.plain)
            if open {
                Text(text).font(.ktFootnote).foregroundStyle(Theme.text.opacity(0.85)).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// "Dictează un pas": fills the last empty step or starts a new one, live.
private struct StepDictateButton: View {
    let draft: RecipeDraft
    @State private var dictation = Dictation()
    @State private var target: UUID?

    var body: some View {
        Button {
            if dictation.busy { dictation.stop(); return }
            let id = draft.stepForDictation()
            target = id
            Task { await dictation.start { phrases, partial in
                let said = (phrases + [partial]).filter { !$0.isEmpty }.joined(separator: " ")
                if !said.isEmpty { draft.setStepText(id, said) }
            } }
        } label: {
            HStack(spacing: 6) {
                if dictation.state == .on {
                    RoundedRectangle(cornerRadius: 3).fill(Theme.onAccent).frame(width: 12, height: 12)
                    Text(MicButton.clock(dictation.seconds)).monospacedDigit()
                } else {
                    Image(systemName: "mic")
                }
            }
            .font(.ktButton)
            .foregroundStyle(dictation.busy ? Theme.onAccent : Theme.accent)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(Capsule().fill(dictation.busy ? Theme.danger : Theme.accent.opacity(0.14)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(dictation.busy ? "Oprește dictarea" : "Dictează un pas")
        .onDisappear { dictation.stop() }
    }
}
