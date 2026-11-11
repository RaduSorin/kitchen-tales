import SwiftUI

/// The recipe editor, full screen like the web page: "Rețetă nouă · De unde vine rețeta?" and
/// its four ways in, then the editor. `onClose` gets the saved recipe (nil: left without saving).
struct RecipeEditorScreen: View {
    @State private var draft: RecipeDraft
    let onClose: (Recipe?) -> Void

    init(recipe: Recipe?, server: RecipeServer?, startMode: RecipeDraft.Mode? = nil, onClose: @escaping (Recipe?) -> Void) {
        _draft = State(initialValue: RecipeDraft(recipe: recipe, server: server, startMode: startMode))
        self.onClose = onClose
    }

    var body: some View {
        Group {
            if draft.mode == .edit {
                RecipeEditorView(draft: draft, onClose: onClose)
                    .transition(.opacity)
            } else {
                NewRecipeWaysView(draft: draft, onClose: onClose)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: draft.mode == .edit)
        .interactiveDismissDisabled(draft.dirty)
        .task { DemoEditor.prepare(draft) }
    }
}

/// The pages before the editor: the ways in, "Din link sau text", "Din poză" and "Cu AI".
struct NewRecipeWaysView: View {
    @Bindable var draft: RecipeDraft
    let onClose: (Recipe?) -> Void
    @Environment(ProfileStore.self) private var profile
    @State private var pickingPages = false
    @State private var showsPrefs = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                EditorBackButton(label: draft.mode == .choose ? "Renunță" : "Alte variante") {
                    if draft.mode == .choose { onClose(nil) } else {
                        withAnimation(.snappy) { draft.mode = .choose; draft.pages = []; draft.error = "" }
                    }
                }
                .padding(.bottom, 26)
                EditorEyebrow(text: "Rețetă nouă")
                Text(title)
                    .font(.custom(AppFont.displaySemibold, size: 30, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .padding(.top, 6)
                    .padding(.bottom, 22)
                if !draft.importing.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView().tint(Theme.accent)
                        Text(draft.importing).font(.ktCallout).foregroundStyle(Theme.text)
                    }
                    .padding(.top, 12)
                } else {
                    switch draft.mode {
                    case .paste: pastePanel
                    case .photo: photoPanel
                    case .ai: if draft.aiKind == .fridge, let ideas = draft.ideas, !ideas.isEmpty { ideasPanel(ideas) } else { aiPanel }
                    default: ways
                    }
                }
                if !draft.error.isEmpty {
                    Text(draft.error).font(.ktCallout).foregroundStyle(Theme.danger).padding(.top, 14)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .ktKitchenBackground()
        .recipePhotoSource(isPresented: $pickingPages, title: "Pozele rețetei", max: EditorText.maxPages - draft.pages.count) { images in
            draft.addPages(images)
        }
        .sheet(isPresented: $showsPrefs) {
            NavigationStack {
                PrefsView()
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata") { showsPrefs = false } } }
            }
        }
    }

    private var title: String {
        switch draft.mode {
        case .paste: "Din link sau text"
        case .photo: "Din poză"
        case .ai: "Cu AI"
        default: "De unde vine rețeta?"
        }
    }

    // MARK: The four ways (the imports most used first)

    private var ways: some View {
        VStack(spacing: 0) {
            way(.link, "Din link sau text", "Site, YouTube, TikTok, Instagram sau text") { draft.mode = .paste }
            divider
            way(.cam, "Din poză", "Din carte, din caiet sau un bilet, chiar pe mai multe pagini") { pickingPages = true }
            divider
            way(.gen, "Cu AI", "Spui ce ai chef sau ce ai în frigider") { draft.mode = .ai }
            divider
            way(.pen, "Scriu eu", "Titlu, ingrediente și pași") { draft.mode = .edit }
        }
    }

    private var divider: some View { Rectangle().fill(Theme.accent.opacity(0.14)).frame(height: 1) }

    private func way(_ art: AddArt.Kind, _ title: String, _ detail: String, action: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); withAnimation(.snappy) { action() } } label: {
            HStack(spacing: 16) {
                AddArt(kind: art).frame(width: 56, height: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.custom(AppFont.displaySemibold, size: 19, relativeTo: .title3)).foregroundStyle(Theme.text)
                    Text(detail).font(.custom(AppFont.body, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.muted.opacity(0.7))
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
    }

    // MARK: Din link sau text

    private var pastePanel: some View {
        let link = EditorText.asLink(draft.paste)
        let site = link.flatMap(EditorText.videoSite)
        return panel {
            Text("Un link sau textul rețetei").font(.ktBodyEmphasis).foregroundStyle(Theme.text)
            MicField(text: $draft.paste,
                     placeholder: "Lipește un link de pe un site, YouTube, TikTok sau Instagram.\n\nSau lipește, scrie ori dictează rețeta: ingredientele, cât și cum le gătești.",
                     minHeight: link != nil ? 90 : 180, onDictated: { draft.dictated = true }, focused: $focused)
            hint(site.map { "Videoclip de pe \($0): citim descrierea și, unde se poate, ce se spune în video." }
                 ?? (link != nil ? "Citim rețeta de pe pagină, cu poza ei."
                     : "Un link de pe un site sau dintr-un videoclip, o notiță copiată sau o rețetă dictată liber. Le aranjăm noi."))
            Button(link != nil ? "Importă" : "Completează rețeta") { focused = false; draft.importText() }
                .buttonStyle(EditorBigButtonStyle())
                .disabled(draft.paste.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .padding(.top, 4)
        }
        .onAppear { if LaunchOptions.screen == nil { focused = true } }
    }

    // MARK: Din poză

    private var photoPanel: some View {
        panel {
            Text("Pozele rețetei, în ordine").font(.ktBodyEmphasis).foregroundStyle(Theme.text)
            if !draft.pages.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(Array(draft.pages.enumerated()), id: \.offset) { i, page in
                            Image(uiImage: page).resizable().scaledToFill()
                                .frame(width: 84, height: 112)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(alignment: .bottomLeading) {
                                    Text("\(i + 1)").font(.system(.caption, weight: .bold)).foregroundStyle(Theme.onAccent)
                                        .frame(width: 22, height: 22).background(Circle().fill(Theme.accent)).padding(6)
                                }
                                .overlay(alignment: .topTrailing) {
                                    Button { draft.pages.remove(at: i) } label: {
                                        Image(systemName: "xmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                                            .frame(width: 24, height: 24).background(Circle().fill(.black.opacity(0.6)))
                                    }
                                    .padding(5)
                                    .accessibilityLabel("Scoate pagina \(i + 1)")
                                }
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
            if draft.pages.count < EditorText.maxPages {
                Button { pickingPages = true } label: {
                    Label(draft.pages.isEmpty ? "Alege o poză" : "Încă o pagină", systemImage: "plus")
                        .font(.ktButton).foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().fill(Theme.surface2))
                }
                .buttonStyle(.plain)
            }
            hint("Dacă rețeta e pe două pagini sau pe fața și spatele unui bilet, adaugă toate pozele: le citim împreună, ca o singură rețetă. Cel mult \(EditorText.maxPages).")
            Button("Citește rețeta") { draft.importPhotos() }
                .buttonStyle(EditorBigButtonStyle())
                .disabled(draft.pages.isEmpty)
        }
    }

    // MARK: Cu AI

    private var aiPanel: some View {
        panel {
            Picker("Pornesc de la", selection: $draft.aiKind) {
                Text("Am chef de…").tag(RecipeDraft.AiKind.craving)
                Text("Am în frigider…").tag(RecipeDraft.AiKind.fridge)
            }
            .pickerStyle(.segmented)
            if draft.aiKind == .craving {
                MicField(text: $draft.idea, placeholder: "De exemplu: o ciorbă de pui rapidă, ceva cu dovlecei și brânză, un desert fără zahăr pentru copii",
                         minHeight: 104, focused: $focused)
            } else {
                MicField(text: $draft.fridge, placeholder: "De exemplu: piept de pui, 2 dovlecei, smântână, ouă, o ceapă, orez",
                         minHeight: 104, focused: $focused)
                hint("Sarea, piperul, uleiul, zahărul și făina le considerăm deja în casă.")
            }
            genOptions
            if draft.aiKind == .craving {
                Button("Scrie rețeta") { focused = false; draft.generate(tools: tools, diet: diet) }
                    .buttonStyle(EditorBigButtonStyle())
                    .disabled(draft.idea.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else {
                Button("Propune rețete") { focused = false; draft.suggest(tools: tools, diet: diet) }
                    .buttonStyle(EditorBigButtonStyle())
                    .disabled(draft.fridge.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var kitchenTools: [String] { profile.settings.kitchenTools }
    private var tools: [String] { draft.tools(kitchenTools) }
    private var diet: String? { EditorText.hasDiet(profile.settings.diet) ? EditorText.dietText(profile.settings.diet) : nil }

    /// What the family doesn't eat, always in sight where recipes are written.
    @ViewBuilder private var dietRow: some View {
        let d = profile.settings.diet
        if EditorText.hasDiet(d) {
            Button { showsPrefs = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "shield").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.accent)
                    Text(EditorText.dietRow(d)).font(.ktFootnote).foregroundStyle(Theme.text).multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    Text("Schimbă").font(.system(.footnote, weight: .semibold)).foregroundStyle(Theme.accent)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.accent.opacity(0.08)))
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var genOptions: some View {
        dietRow
        HStack {
            Text("Porții").font(.ktBody).foregroundStyle(Theme.text)
            Spacer()
            EditorStepper(value: draft.genServings, min: 1, max: 20) { draft.genServings = $0 }
        }
        Text("Aparate folosite").font(.ktBodyEmphasis).foregroundStyle(Theme.text).padding(.top, 2)
        if !kitchenTools.isEmpty {
            FlowLayout(spacing: 8) {
                ForEach(kitchenTools, id: \.self) { t in
                    let on = !draft.skipTools.contains(t)
                    Button {
                        Haptics.select()
                        if on { draft.skipTools.append(t) } else { draft.skipTools.removeAll { $0 == t } }
                    } label: {
                        Text(t).font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                            .foregroundStyle(on ? Theme.onAccent : Theme.muted)
                            .padding(.horizontal, 14).frame(height: 34)
                            .background(Capsule().fill(on ? Theme.accent : Theme.surface2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        (Text(kitchenTools.isEmpty ? "Doar aragaz și cuptor. " : "Atinge un aparat ca să nu fie folosit la această rețetă. ")
            .foregroundStyle(Theme.muted)
         + Text(kitchenTools.isEmpty ? "Adaugă aparatele tale în Profil" : "Schimbă lista în Profil").foregroundStyle(Theme.accent).underline())
            .font(.ktFootnote)
            .onTapGesture { showsPrefs = true }
    }

    // MARK: Ideile din frigider

    private func ideasPanel(_ ideas: [RecipeIdea]) -> some View {
        panel {
            Text("Alege ce gătești").font(.ktBodyEmphasis).foregroundStyle(Theme.text)
            dietRow
            ForEach(ideas) { x in
                Button { draft.pick(x, tools: tools, diet: diet) } label: { idea(x) }
                    .buttonStyle(PressableStyle())
            }
            Button("Schimbă ingredientele") { draft.ideas = nil }.buttonStyle(.ktSecondaryWide)
            Button("Alte idei") { draft.suggest(tools: tools, diet: diet) }.buttonStyle(.ktSecondaryWide)
        }
    }

    private func idea(_ x: RecipeIdea) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(x.title).font(.custom(AppFont.displaySemibold, size: 18, relativeTo: .title3)).foregroundStyle(Theme.text)
            if let d = x.description { Text(d).font(.ktCallout).foregroundStyle(Theme.text.opacity(0.85)) }
            let meta = ([x.minutes.map(RecipeText.formatMinutes)].compactMap { $0 } + x.tools).joined(separator: " · ")
            if !meta.isEmpty { Text(meta).font(.ktFootnote).foregroundStyle(Theme.muted) }
            if !x.missing.isEmpty { Text("Îți mai trebuie: \(x.missing.joined(separator: ", "))").font(.ktFootnote).foregroundStyle(Theme.accent) }
            if diet != nil || x.kcal != nil {
                HStack(spacing: 6) {
                    if diet != nil { tag("potrivit pentru familie") }
                    if let k = x.kcal { tag("\(k) kcal / porție") }
                }
            }
            if !x.swaps.isEmpty { Text("În loc: \(x.swaps.joined(separator: "; "))").font(.ktFootnote).foregroundStyle(Theme.muted) }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface2))
    }

    private func tag(_ text: String) -> some View {
        Text(text).font(.system(.caption, weight: .semibold)).foregroundStyle(Theme.accent)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(Theme.accent.opacity(0.14)))
    }

    // MARK: Parts

    private func panel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) { content() }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.ktFootnote).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
    }
}

/// `-screen editor-…` screenshots: the editor opened on one page, with made-up content.
@MainActor enum DemoEditor {
    private static var done = false

    /// The launch screens that open the editor on a saved recipe.
    static let editingScreens: Set<String> = ["editor-edit", "editor-ingredients", "editor-steps"]

    static func prepare(_ draft: RecipeDraft) {
        guard !done, let screen = LaunchOptions.screen, screen.hasPrefix("editor-") else { return }
        done = true
        switch screen {
        case "editor-paste": draft.mode = .paste
        case "editor-ai": draft.mode = .ai
        case "editor-ideas":
            draft.mode = .ai
            draft.aiKind = .fridge
            draft.fridge = "piept de pui, 2 dovlecei, smântână, ouă, o ceapă"
            draft.ideas = [
                RecipeIdea(title: "Pui cu dovlecei la cuptor", description: "Bucăți de pui și dovlecei rumeniți, cu smântână și usturoi.",
                           tools: ["Cuptor"], missing: ["usturoi"], minutes: 45, kcal: 420),
                RecipeIdea(title: "Omletă cu dovlecel și ceapă", description: "Rapidă, pufoasă, bună la micul dejun sau seara.",
                           tools: ["Aragaz"], minutes: 15, kcal: 310, swaps: ["smântână în loc de lapte"]),
            ]
        case "editor-ingredients": draft.tab = .ingredients
        case "editor-steps":
            draft.tab = .steps
            draft.openStep = draft.steps.dropFirst().first?.id
        default: break
        }
    }
}
