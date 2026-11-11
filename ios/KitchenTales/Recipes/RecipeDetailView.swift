import SwiftUI

/// A recipe: the photo on top, the big title, then the web's buttons (Gătește pas cu pas,
/// În săptămână, Pune în listă), ingredients that scale with − and + and tick off, the steps
/// and the family's notes.
struct RecipeDetailView: View {
    let recipeId: String
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var servings: Int?
    @State private var ticked: Set<Int> = []
    @State private var editing: Recipe?
    @State private var confirmDelete = LaunchOptions.screen == "recipe-delete"
    @State private var deleting = false
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if let r = store.recipe(recipeId) {
            content(r)
        } else {
            EmptyStateView(symbol: "questionmark.folder", title: "Rețeta nu a fost găsită", message: "Poate a fost ștearsă.")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ktKitchenBackground()
        }
    }

    private func content(_ r: Recipe) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                RecipePhoto(recipe: r, cornerRadius: 0)
                    .frame(height: 330)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .overlay {
                        LinearGradient(stops: [.init(color: .black.opacity(0.35), location: 0), .init(color: .clear, location: 0.3),
                                               .init(color: Theme.background.opacity(0.6), location: 0.8), .init(color: Theme.background, location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                    }
                VStack(alignment: .leading, spacing: 26) {
                    header(r)
                    ingredients(r)
                    steps(r)
                    notes(r)
                }
                .padding(.horizontal, 16)
                .padding(.top, -52)
            }
            .padding(.bottom, 40)
        }
        .ignoresSafeArea(edges: .top)
        .scrollIndicators(.hidden)
        .background(Theme.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { moreMenu(r) } }
        .confirmationDialog("Ștergi rețeta? Nu se mai poate recupera.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Da, șterge", role: .destructive) { remove(r) }
            Button("Nu", role: .cancel) {}
        }
        .fullScreenCover(item: $editing) { r in
            RecipeEditorScreen(recipe: r, server: store.server) { saved in
                editing = nil
                if let saved { servings = saved.servings }
            }
        }
        .task {
            if servings == nil { servings = r.servings }
            if LaunchOptions.screen == "cook", kitchen.cooking == nil { kitchen.cook(r) }
        }
    }

    // MARK: Header

    private func header(_ r: Recipe) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(r.title)
                .font(.custom(AppFont.display, size: 32, relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            FlowLayout(spacing: 6) {
                if let m = r.minutes { Pill(text: RecipeText.formatMinutes(m), symbol: "clock") }
                if !r.category.isEmpty { Pill(text: r.category) }
                if !r.mine, let name = r.spaceName { Pill(text: "De la \(name)", symbol: "person.2") }
                else if r.shared { Pill(text: "Partajată", symbol: "person.2") }
                if let cooked = store.log(r.id)?.cooked.count, cooked > 0 {
                    Pill(text: cooked == 1 ? "Gătită o dată" : "Gătită de \(cooked) ori", symbol: "flame")
                }
            }
            Button { kitchen.cook(r, servings: servings) } label: {
                Label(cookLabel(r), systemImage: "play.fill")
            }
            .buttonStyle(.ktPrimaryWide)
            .disabled(r.steps.isEmpty)
            .padding(.top, 4)
            HStack(spacing: 10) {
                PlanDayMenu(recipe: r, servings: servings) {
                    Label("În săptămână", systemImage: "calendar")
                        .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout))
                        .foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().fill(Theme.surface2))
                }
                Button { addToList(r) } label: {
                    Label("Pune în listă", systemImage: "cart")
                        .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout))
                        .foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Capsule().fill(Theme.surface2))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func cookLabel(_ r: Recipe) -> String {
        if CookProgress.step(r.id) != nil { return "Continuă să gătești" }
        return "Gătește pas cu pas"
    }

    /// The web's ⋯ of a recipe: who sees it, Editează, favorite, send, source, and Șterge apart.
    private func moreMenu(_ r: Recipe) -> some View {
        let favorite = store.isFavorite(r.id)
        return Menu {
            if r.mine {
                Section(r.shared ? "Rețeta · partajată" : "Rețeta · doar la noi") {
                    Button { share(r, !r.shared) } label: {
                        Label(r.shared ? "Oprește partajarea" : "Partajează cu toate conturile", systemImage: r.shared ? "person.2.slash" : "person.2")
                    }
                    Button { editing = r } label: { Label("Editează rețeta", systemImage: "pencil") }
                }
            } else {
                Section("De la \(r.spaceName ?? "alt cont"). O poți găti, planifica și pune pe listă, dar nu o poți modifica.") {}
            }
            Section {
                Button { Task { await store.toggleFavorite(r.id) } } label: {
                    Label(favorite ? "Scoate din favorite" : "Pune la favorite", systemImage: favorite ? "heart.slash" : "heart")
                }
                ShareLink(item: RecipeShare.text(r)) { Label("Trimite", systemImage: "square.and.arrow.up") }
                if let source = r.sourceUrl, let url = URL(string: source) {
                    Link(destination: url) { Label("Deschide sursa", systemImage: "safari") }
                }
            }
            if r.mine {
                Section {
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Șterge rețeta", systemImage: "trash") }
                }
            }
        } label: {
            Image(systemName: favorite ? "heart.fill" : "ellipsis")
                .foregroundStyle(favorite ? Theme.accent : Theme.text)
        }
        .disabled(deleting)
        .accessibilityLabel("Mai multe")
    }

    private func share(_ r: Recipe, _ on: Bool) {
        Task {
            if await store.setShared(r.id, on, spaceName: mySpaceName(profile, auth)) {
                Haptics.success()
                kitchen.say(on ? "Rețeta e partajată cu toate conturile" : "Rețeta e acum doar la noi")
            } else {
                kitchen.say("Nu am putut schimba partajarea. Verifică internetul.")
            }
        }
    }

    private func remove(_ r: Recipe) {
        deleting = true
        Task {
            do {
                try await store.delete(r.id)
                Haptics.success()
                dismiss()
                kitchen.say("Am șters rețeta")
            } catch {
                Haptics.warning()
                kitchen.say("Nu am putut șterge rețeta. Verifică internetul.")
            }
            deleting = false
        }
    }

    private func addToList(_ r: Recipe) {
        Task {
            if let added = await store.addToShopping(r, servings: servings) {
                Haptics.success()
                kitchen.say(added == 0 ? "Sunt deja în listă" : "Am pus \(added) ingrediente în listă")
            } else {
                Haptics.warning()
                kitchen.say("Nu am putut pune în listă. Verifică internetul.")
            }
        }
    }

    // MARK: Ingredients

    private func ingredients(_ r: Recipe) -> some View {
        let factor = r.servings.flatMap { base in servings.map { Double($0) / Double(base) } } ?? 1
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Ingrediente").font(.ktTitle2).foregroundStyle(Theme.text)
                Spacer()
                if let s = servings { ServingsStepper(servings: s) { servings = $0 } }
            }
            .padding(.bottom, 6)
            if r.ingredients.isEmpty {
                Text("Rețeta nu are ingrediente.").font(.ktCallout).foregroundStyle(Theme.muted)
            }
            ForEach(Array(r.ingredients.enumerated()), id: \.offset) { i, line in
                if RecipeText.isHeading(line) {
                    Text(line.uppercased(with: Locale(identifier: "ro")))
                        .font(.ktLabel).tracking(1).foregroundStyle(Theme.accent)
                        .padding(.top, 12)
                } else {
                    IngredientRow(text: RecipeText.scaleIngredient(line, factor: factor), ticked: ticked.contains(i)) {
                        Haptics.select()
                        if ticked.contains(i) { ticked.remove(i) } else { ticked.insert(i) }
                    }
                }
            }
        }
    }

    // MARK: Steps and notes

    @ViewBuilder private func steps(_ r: Recipe) -> some View {
        if !r.steps.isEmpty {
            VStack(alignment: .leading, spacing: 16) {
                Text("Pași").font(.ktTitle2).foregroundStyle(Theme.text)
                ForEach(Array(r.steps.enumerated()), id: \.offset) { i, step in
                    HStack(alignment: .top, spacing: 14) {
                        Text("\(i + 1)")
                            .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                            .foregroundStyle(Theme.onAccent)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Theme.accent))
                        VStack(alignment: .leading, spacing: 10) {
                            Text(step).font(.ktBody).foregroundStyle(Theme.text).fixedSize(horizontal: false, vertical: true)
                            if let key = r.stepPhoto(i) {
                                RecipePhoto(recipe: r, key: key, cornerRadius: 12).frame(height: 180)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func notes(_ r: Recipe) -> some View {
        let family = store.log(r.id)?.notes ?? []
        if r.notes != nil || !family.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                if let text = r.notes {
                    Text("Note").font(.ktTitle2).foregroundStyle(Theme.text)
                    Text(text).font(.ktBody).foregroundStyle(Theme.text.opacity(0.9))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .ktCard()
                }
                if !family.isEmpty {
                    Text("Notele noastre").font(.ktTitle2).foregroundStyle(Theme.text).padding(.top, 6)
                    ForEach(Array(family.enumerated()), id: \.offset) { _, note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.text).font(.ktBody).foregroundStyle(Theme.text)
                            Text([note.by, note.day].compactMap { $0 }.joined(separator: " · "))
                                .font(.ktCaption).foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .ktCard()
                    }
                }
            }
        }
    }
}

/// A small rounded label: "1 h 30", "Ciorbe și supe", "Partajată".
struct Pill: View {
    let text: String
    var symbol: String?

    var body: some View {
        HStack(spacing: 5) {
            if let symbol { Image(systemName: symbol).font(.caption2.weight(.semibold)) }
            Text(text)
        }
        .font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote))
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 11)
        .frame(height: 30)
        .background(Capsule().fill(Color.white.opacity(0.12)))
    }
}

/// "− 4 porții +"
struct ServingsStepper: View {
    let servings: Int
    let change: (Int) -> Void

    var body: some View {
        HStack(spacing: 2) {
            button("minus", label: "Mai puține porții", enabled: servings > 1) { change(servings - 1) }
            Text(servings == 1 ? "1 porție" : "\(servings) porții")
                .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                .foregroundStyle(Theme.text)
                .monospacedDigit()
                .contentTransition(.numericText())
                .frame(minWidth: 70)
            button("plus", label: "Mai multe porții", enabled: servings < 50) { change(servings + 1) }
        }
        .padding(.horizontal, 4)
        .frame(height: 38)
        .background(Capsule().fill(Theme.surface2))
        .accessibilityElement(children: .contain)
    }

    private func button(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.select()
            withAnimation(.snappy) { action() }
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(enabled ? Theme.text : Theme.muted.opacity(0.4))
                .frame(width: 34, height: 34)
        }
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// An ingredient with a round tick box; ticked ones fade and are struck through.
struct IngredientRow: View {
    let text: String
    let ticked: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().strokeBorder(ticked ? Theme.accent : Theme.muted.opacity(0.6), lineWidth: 2)
                    if ticked {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.onAccent)
                    }
                }
                .frame(width: 24, height: 24)
                Text(text)
                    .font(.ktBody)
                    .foregroundStyle(ticked ? Theme.muted : Theme.text)
                    .strikethrough(ticked, color: Theme.muted)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 11)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 0.5) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(ticked ? .isSelected : [])
    }
}
