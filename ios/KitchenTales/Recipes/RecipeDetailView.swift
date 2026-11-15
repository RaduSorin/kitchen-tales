import SwiftUI

/// A recipe, in the stories' style: the photo on top fading into the page (or, without a photo,
/// the title right at the top on a warm glow in the category's colour and a line inviting a
/// photo), the serif title, text tabs with a gold underline, ingredients that scale with − and +
/// and tick off, the steps and the family's notes. At the bottom: the gold "Gătește pas cu pas"
/// and two plain glyphs, În plan and Pe listă.
struct RecipeDetailView: View {
    let recipeId: String
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var servings: Int?
    @State private var ticked: Set<Int> = []
    @State private var editing: Recipe?
    @State private var confirmDelete = LaunchOptions.screen == "recipe-delete"
    @State private var deleting = false
    @State private var tab: RecipeTab = .ingredients
    @State private var done: Set<Int> = []
    @State private var planning = false
    @State private var writing = false
    @State private var noteText = ""
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
        let photo = r.hasPhoto
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if photo {
                    RecipePhoto(recipe: r, cornerRadius: 0)
                        .frame(height: 330)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .overlay(alignment: .bottom) {
                            LinearGradient(colors: [.clear, Theme.background], startPoint: .top, endPoint: .bottom)
                                .frame(height: 330 * 0.55)
                        }
                } else {
                    Color.clear.frame(height: 124)
                }
                VStack(alignment: .leading, spacing: 18) {
                    header(r, photo: photo)
                    UnderlineTabs(selection: $tab) { $0.label }
                        .padding(.top, 4)
                    switch tab {
                    case .ingredients: ingredients(r)
                    case .steps: steps(r)
                    case .notes: notes(r)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, photo ? -84 : 0)
            }
            .padding(.bottom, 120)
        }
        .ignoresSafeArea(edges: .top)
        .scrollIndicators(.hidden)
        .background {
            ZStack(alignment: .top) {
                Theme.background
                if !photo {
                    // No photo: a warm glow in the category's colour instead of a big drawing.
                    let tint = RecipeLabel.tint(RecipeLabel.kind(r.category))
                    RadialGradient(colors: [Color(hex: tint.0).opacity(0.9), Color(hex: tint.1).opacity(0.5), .clear],
                                   center: UnitPoint(x: 0.3, y: 0), startRadius: 0, endRadius: 460)
                        .frame(height: 520)
                    RadialGradient(colors: [Theme.accent.opacity(0.12), .clear], center: UnitPoint(x: 0.2, y: 0.05),
                                   startRadius: 0, endRadius: 300)
                        .frame(height: 420)
                }
            }
            .ignoresSafeArea()
        }
        .overlay(alignment: .top) { topButtons(r) }
        .safeAreaInset(edge: .bottom, spacing: 0) { foot(r).hiddenWhileTyping() }
        .keyboardDoneButton()
        .hidesAppTabBar()
        .toolbar(.hidden, for: .navigationBar)
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
        .sheet(isPresented: $planning) {
            DayPickerSheet(recipe: r, servings: servings)
        }
        .task {
            if servings == nil { servings = r.servings }
            if ["cook", "cook-ingredients"].contains(LaunchOptions.screen), kitchen.cooking == nil { kitchen.cook(r) }
            if LaunchOptions.screen == "recipe-steps" { tab = .steps }
            if LaunchOptions.screen == "recipe-notes" { tab = .notes }
        }
    }

    // MARK: Over the photo and at the bottom

    /// Back on the left, the heart and ⋯ on the right: plain glyphs, no circles (with a soft
    /// shadow so they read on a photo).
    private func topButtons(_ r: Recipe) -> some View {
        let favorite = store.isFavorite(r.id)
        return HStack(spacing: 4) {
            Button { dismiss() } label: {
                plainGlyph { Image(systemName: "chevron.left").font(.system(size: 21, weight: .semibold)).foregroundStyle(r.hasPhoto ? .white : Theme.accent) }
            }
            .accessibilityLabel("Înapoi")
            Spacer()
            Button {
                Haptics.select()
                Task { await store.toggleFavorite(r.id) }
                kitchen.say(favorite ? "Scoasă din favorite" : "Pusă la favorite")
            } label: {
                plainGlyph {
                    Image(systemName: favorite ? "heart.fill" : "heart").font(.system(size: 21, weight: .medium))
                        .foregroundStyle(favorite ? Theme.accent : .white)
                        .contentTransition(.symbolEffect(.replace))
                }
            }
            .accessibilityLabel(favorite ? "Scoate din favorite" : "Pune la favorite")
            moreMenu(r)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .padding(.top, 2)
    }

    private func plainGlyph<Icon: View>(@ViewBuilder _ icon: () -> Icon) -> some View {
        icon()
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
            .shadow(color: .black.opacity(0.55), radius: 6, y: 1)
    }

    /// The bottom bar: the gold "Gătește pas cu pas", then În plan and Pe listă as plain glyphs
    /// with their names under them.
    private func foot(_ r: Recipe) -> some View {
        let left = r.ingredients.enumerated().filter { !RecipeText.isHeading($0.element) && !ticked.contains($0.offset) }.count
        return HStack(spacing: 10) {
            if !r.steps.isEmpty {
                Button { kitchen.cook(r, servings: servings) } label: {
                    HStack(spacing: 10) {
                        ChefHat().stroke(style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                            .frame(width: 22, height: 22)
                        Text(cookLabel(r)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .font(.custom(AppFont.bodyHeavy, size: 17, relativeTo: .headline))
                    .foregroundStyle(Theme.onAccent)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: 420, minHeight: 54)
                    .background(Capsule().fill(Theme.accent))
                    .shadow(color: Theme.accent.opacity(0.25), radius: 12, y: 8)
                }
                .buttonStyle(PressScale())
            }
            Button { planning = true } label: { footGlyph("calendar", label: "În plan") }
                .buttonStyle(PressScale())
                .accessibilityLabel("Pune în săptămână")
            if !r.ingredients.isEmpty {
                Button { addToList(r) } label: {
                    footGlyph("cart", label: "Pe listă")
                        .overlay(alignment: .topTrailing) {
                            if !ticked.isEmpty && left > 0 {
                                Text("\(left)").font(.custom(AppFont.bodyHeavy, size: 11, relativeTo: .caption2))
                                    .foregroundStyle(Theme.onAccent)
                                    .padding(.horizontal, 5).frame(minWidth: 20, minHeight: 20)
                                    .background(Capsule().fill(Theme.accent))
                                    .offset(x: 2, y: -2)
                            }
                        }
                }
                .buttonStyle(PressScale())
                .accessibilityLabel("Pune în listă")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
        .background(LinearGradient(stops: [.init(color: Theme.background.opacity(0), location: 0), .init(color: Theme.background, location: 0.4)],
                                   startPoint: .top, endPoint: .bottom).ignoresSafeArea())
    }

    private func footGlyph(_ symbol: String, label: String) -> some View {
        VStack(spacing: 3) {
            Image(systemName: symbol).font(.system(size: 20, weight: .regular))
            Text(label).font(.custom(AppFont.bodySemibold, size: 11, relativeTo: .caption2))
        }
        .foregroundStyle(Theme.text)
        .frame(width: 58, height: 54)
        .contentShape(Rectangle())
    }

    // MARK: Header and tabs

    private func header(_ r: Recipe, photo: Bool) -> some View {
        let kicker = [r.category.isEmpty ? nil : r.category,
                      !r.mine ? "de la \(r.spaceName ?? "alt cont")" : r.shared ? "partajată" : nil].compactMap { $0 }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 6) {
            if !kicker.isEmpty {
                HStack(spacing: 6) {
                    if r.mine && r.shared { Image(systemName: "person.2.fill").font(.system(size: 10, weight: .bold)) }
                    Text(kicker.uppercased(with: Locale(identifier: "ro")))
                }
                .font(.custom(AppFont.bodyHeavy, size: 11.5, relativeTo: .caption))
                .tracking(1.5)
                .foregroundStyle(Theme.accent)
                .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
            }
            Text(r.title)
                .font(.custom(AppFont.storyDisplay, size: photo ? 32 : 38, relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .lineSpacing(-2)
                .fixedSize(horizontal: false, vertical: true)
                .shadow(color: .black.opacity(0.45), radius: 7, y: 2)
                .padding(.top, 2).padding(.bottom, 4)
            meta(r)
            if let cooked = store.log(r.id)?.cooked, let last = cooked.max() {
                Text("Gătită \(cooked.count == 1 ? "o dată" : cooked.count < 20 ? "de \(cooked.count) ori" : "de \(cooked.count) de ori") · \(cooked.count == 1 ? "" : "ultima dată ")\(RecipeText.since(last))")
                    .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.muted)
            }
            if !photo && r.mine {
                Button { editing = r } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "camera").font(.system(size: 14, weight: .semibold))
                        Text("Adaugă o poză").font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
                        Text("sau").font(.custom(AppFont.body, size: 14, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                        Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold))
                        Text("fă una cu AI").font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
                    }
                    .foregroundStyle(Theme.accent)
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Adaugă o poză sau fă una cu AI")
                .padding(.top, 2)
            }
        }
    }

    /// "⏱ 1 h   4 porții − +   4 pași"
    private func meta(_ r: Recipe) -> some View {
        HStack(spacing: 18) {
            if let m = r.minutes {
                HStack(spacing: 5) {
                    Image(systemName: "clock").font(.system(size: 13, weight: .bold))
                    Text(RecipeText.formatMinutes(m))
                }
            }
            if r.servings != nil, let s = servings {
                HStack(spacing: 4) {
                    servingsButton("−", label: "Mai puține porții", enabled: s > 1) { servings = s - 1; trackBadge(.servings) }
                    Text(s == 1 ? "1 porție" : "\(s) porții").contentTransition(.numericText()).monospacedDigit()
                    servingsButton("+", label: "Mai multe porții", enabled: s < 50) { servings = s + 1; trackBadge(.servings) }
                }
            }
            if !r.steps.isEmpty { Text(r.steps.count == 1 ? "1 pas" : "\(r.steps.count) pași") }
        }
        .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
        .foregroundStyle(Theme.text.opacity(0.85))
    }

    private func servingsButton(_ sign: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.select()
            withAnimation(.snappy) { action() }
        } label: {
            Text(sign).font(.custom(AppFont.bodyHeavy, size: 19, relativeTo: .headline))
                .foregroundStyle(Theme.accent.opacity(enabled ? 1 : 0.35))
                .frame(width: 32, height: 32)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .padding(.vertical, -6)
        .accessibilityLabel(label)
    }

    private func cookLabel(_ r: Recipe) -> String {
        if CookProgress.step(r.id) != nil { return "Continuă să gătești" }
        return "Gătește pas cu pas"
    }

    /// The web's ⋯ of a recipe: who sees it, Editează, favorite, send, source, and Șterge apart.
    private func moreMenu(_ r: Recipe) -> some View {
        Menu {
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
            plainGlyph { Image(systemName: "ellipsis").font(.system(size: 20, weight: .semibold)).foregroundStyle(r.hasPhoto ? .white : Theme.text) }
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
        // Ticked ingredients are the ones already in the kitchen: they stay off the list (like the web).
        let have = Set(r.ingredients.enumerated().filter { ticked.contains($0.offset) }
            .map { $0.element.trimmingCharacters(in: .whitespaces) })
        Task {
            if let added = await store.addToShopping(r, servings: servings, skip: { have.contains($0) }) {
                Haptics.success()
                kitchen.say(added == 0 ? "Sunt deja în listă" : "Am pus \(added) ingrediente în listă")
            } else {
                Haptics.warning()
                kitchen.say("Nu am putut pune în listă. Verifică internetul.")
            }
        }
    }

    // MARK: The three tabs

    private func ingredients(_ r: Recipe) -> some View {
        let factor = r.servings.flatMap { base in servings.map { Double($0) / Double(base) } } ?? 1
        return VStack(alignment: .leading, spacing: 12) {
            RecipeFactsView(recipe: r)
            if r.ingredients.isEmpty {
                Text("Rețeta nu are ingrediente.").font(.ktCallout).foregroundStyle(Theme.muted)
            }
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(r.ingredients.enumerated()), id: \.offset) { i, line in
                    if RecipeText.isHeading(line) {
                        Text(line.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ":", with: "").uppercased(with: Locale(identifier: "ro")))
                            .font(.custom(AppFont.bodyBold, size: 13.5, relativeTo: .footnote)).tracking(0.3)
                            .foregroundStyle(Theme.muted)
                            .padding(.top, 10).padding(.horizontal, 4)
                    } else {
                        IngredientRow(text: RecipeText.scaleIngredient(line, factor: factor), ticked: ticked.contains(i)) {
                            Haptics.select()
                            if ticked.contains(i) { ticked.remove(i) } else { ticked.insert(i) }
                        }
                    }
                }
            }
            if !ticked.isEmpty {
                Text("Ce ai bifat nu ajunge în lista de cumpărături.").font(.ktCallout).foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder private func steps(_ r: Recipe) -> some View {
        if r.steps.isEmpty {
            Text("Rețeta nu are încă pași.").font(.ktCallout).foregroundStyle(Theme.muted)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(r.steps.enumerated()), id: \.offset) { i, step in
                    let isDone = done.contains(i)
                    Button {
                        Haptics.select()
                        if isDone { done.remove(i) } else { done.insert(i) }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1)")
                                .font(.custom(AppFont.storyDisplay, size: 20, relativeTo: .title3)).monospacedDigit()
                                .foregroundStyle(isDone ? Theme.muted : Theme.accent)
                                .strikethrough(isDone, color: Theme.muted)
                                .frame(width: 28, alignment: .leading)
                            VStack(alignment: .leading, spacing: 10) {
                                Text(step).font(.ktBody).foregroundStyle(isDone ? Theme.muted : Theme.text)
                                    .lineSpacing(3)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let key = r.stepPhoto(i) {
                                    RecipePhoto(recipe: r, key: key, cornerRadius: 12).frame(height: 180)
                                }
                            }
                            .padding(.top, 2)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8).padding(.horizontal, 4)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isDone ? .isSelected : [])
                }
            }
        }
    }

    private func notes(_ r: Recipe) -> some View {
        let family = Array((store.log(r.id)?.notes ?? []).reversed())
        return VStack(alignment: .leading, spacing: 12) {
            if let text = r.notes {
                Text(text).font(.ktBody).foregroundStyle(Theme.text).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Text("Notele noastre").font(.custom(AppFont.storyDisplay, size: 22, relativeTo: .title2)).foregroundStyle(Theme.text)
                Spacer()
                if !writing {
                    Button("Adaugă o notă") { writing = true }
                        .font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.accent)
                        .frame(minHeight: 44)
                        .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)
            if writing {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("ex. mai puțină sare, copilului i-a plăcut", text: $noteText, axis: .vertical)
                        .lineLimit(2...6)
                        .font(.ktBody)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
                    HStack(spacing: 8) {
                        Button("Salvează") {
                            let text = noteText
                            noteText = ""; writing = false
                            Task { await store.addNote(r.id, text: text) }
                        }
                        .buttonStyle(.ktPrimary)
                        .disabled(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        Button("Renunță") { writing = false; noteText = "" }.buttonStyle(.ktSecondary)
                    }
                }
            }
            if family.isEmpty && !writing {
                Text("Ce ați schimba data viitoare? Scrieți aici după ce o gătiți.").font(.ktCallout).foregroundStyle(Theme.muted)
            }
            ForEach(Array(family.enumerated()), id: \.offset) { _, note in
                VStack(alignment: .leading, spacing: 4) {
                    Text(note.text).font(.ktBody).foregroundStyle(Theme.text)
                    HStack {
                        Text([note.by, RecipeText.since(note.day)].compactMap { $0 }.joined(separator: " · "))
                        Spacer()
                        Button("Șterge") { Task { await store.removeNote(r.id, note) } }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Șterge nota")
                    }
                    .font(.ktCaption).foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border))
            }
            if let source = r.sourceUrl, let url = URL(string: source) {
                Link("Sursa originală", destination: url).font(.ktBodyEmphasis).foregroundStyle(Theme.accent)
            }
        }
    }
}

enum RecipeTab: Hashable, CaseIterable {
    case ingredients, steps, notes
    var label: String {
        switch self {
        case .ingredients: "Ingrediente"
        case .steps: "Pași"
        case .notes: "Note"
        }
    }
}

/// The web's chef hat on "Începe să gătești" (24-point grid).
struct ChefHat: Shape {
    func path(in rect: CGRect) -> Path {
        let k = rect.width / 24
        var p = Path()
        p.move(to: CGPoint(x: 7, y: 14.5))
        p.addCurve(to: CGPoint(x: 3.34, y: 10.77), control1: CGPoint(x: 5.03, y: 14.34), control2: CGPoint(x: 3.46, y: 12.74))
        p.addCurve(to: CGPoint(x: 6.5, y: 6.6), control1: CGPoint(x: 3.21, y: 8.79), control2: CGPoint(x: 4.57, y: 7.01))
        p.addCurve(to: CGPoint(x: 12, y: 1.1), control1: CGPoint(x: 6.5, y: 3.58), control2: CGPoint(x: 8.98, y: 1.1))
        p.addCurve(to: CGPoint(x: 17.5, y: 6.6), control1: CGPoint(x: 15.02, y: 1.1), control2: CGPoint(x: 17.5, y: 3.58))
        p.addCurve(to: CGPoint(x: 20.66, y: 10.77), control1: CGPoint(x: 19.43, y: 7.01), control2: CGPoint(x: 20.79, y: 8.79))
        p.addCurve(to: CGPoint(x: 17, y: 14.5), control1: CGPoint(x: 20.54, y: 12.74), control2: CGPoint(x: 18.97, y: 14.34))
        p.addLine(to: CGPoint(x: 17, y: 19))
        p.addLine(to: CGPoint(x: 7, y: 19))
        p.closeSubpath()
        p.move(to: CGPoint(x: 7, y: 16.5))
        p.addLine(to: CGPoint(x: 17, y: 16.5))
        return p.applying(CGAffineTransform(scaleX: k, y: k).translatedBy(x: rect.minX / k, y: rect.minY / k))
    }
}

/// A small press, like the web's `:active { transform: scale(.97) }`.
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// "Când o gătești?": today and the next 13 days, marking days that already have the recipe.
struct DayPickerSheet: View {
    let recipe: Recipe
    var servings: Int?
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(0..<14, id: \.self) { i in
                    let day = Calendar.current.date(byAdding: .day, value: i, to: Calendar.current.startOfDay(for: Date()))!
                    let key = RecipeText.dayKey(day)
                    let planned = store.plan.contains { $0.day == key && $0.recipeId == recipe.id }
                    Button { plan(day, index: i) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(name(day, i)).font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                            Text(day.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "ro"))))
                                .font(.ktFootnote).foregroundStyle(Theme.muted)
                            Spacer()
                            if planned { Text("deja în plan").font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .footnote)).foregroundStyle(Theme.accent) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Theme.surface)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Când o gătești?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Închide") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func name(_ day: Date, _ i: Int) -> String {
        if i == 0 { return "Azi" }
        if i == 1 { return "Mâine" }
        return day.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "ro"))).capitalized(with: Locale(identifier: "ro"))
    }

    private func plan(_ day: Date, index i: Int) {
        Task {
            if await store.planRecipe(recipe, on: day, servings: servings) {
                Haptics.success()
                kitchen.say(i == 0 ? "Adăugată azi." : i == 1 ? "Adăugată mâine." : "Adăugată \(name(day, i).lowercased()).")
                dismiss()
            } else {
                Haptics.warning()
                kitchen.say("Nu am putut pune în plan. Verifică internetul.")
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

/// An ingredient with a round tick box (the web's `.rv .checklist`); ticked ones fade and are struck through.
struct IngredientRow: View {
    let text: String
    let ticked: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().strokeBorder(ticked ? Theme.accent : .white.opacity(0.35), lineWidth: 2)
                    if ticked {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.onAccent)
                    }
                }
                .frame(width: 22, height: 22)
                Text(text)
                    .font(.ktBody)
                    .foregroundStyle(ticked ? Theme.muted : Theme.text)
                    .strikethrough(ticked, color: Theme.muted)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(ticked ? .isSelected : [])
    }
}
