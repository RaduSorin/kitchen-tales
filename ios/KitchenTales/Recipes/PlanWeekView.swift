import SwiftUI

/// One evening of the AI week plan: a dish we have, a new one (written by the AI), or the
/// leftovers of the evening before.
struct PlannedDinner: Identifiable, Hashable {
    enum Kind: String { case existing, new, leftovers }
    let day: String
    let kind: Kind
    let recipeId: String?
    let title: String
    let reason: String?
    let recipe: ImportedRecipe?
    var id: String { day }

    init?(json: [String: Any]?) {
        guard let json, let day = json["day"] as? String, let title = json["title"] as? String else { return nil }
        self.day = day
        self.title = title
        kind = Kind(rawValue: json["kind"] as? String ?? "") ?? .existing
        recipeId = (json["recipeId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        reason = (json["reason"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        recipe = ImportedRecipe(json: json["recipe"] as? [String: Any])
    }

    init(day: String, kind: Kind, recipeId: String?, title: String, reason: String?) {
        self.day = day; self.kind = kind; self.recipeId = recipeId; self.title = title; self.reason = reason; recipe = nil
    }

    static func == (a: Self, b: Self) -> Bool { a.day == b.day && a.title == b.title && a.kind == b.kind }
    func hash(into h: inout Hasher) { h.combine(day); h.combine(title) }
}

/// "Propune cinele săptămânii", like the web's PlanWeek: 1) the evenings and how much time each
/// has, 2) what is already at home (optional), 3) the proposal, each evening swappable, then into
/// the week (and the ingredients on the list, without what you have).
struct PlanWeekView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(ProfileStore.self) private var profile
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0
    @State private var prefs = PlanPrefs.load()
    @State private var fridge = UserDefaults.standard.string(forKey: PlanPrefs.fridgeKey) ?? ""
    @State private var useFridge = true
    @State private var items: [PlannedDinner]?
    @State private var busy = false
    @State private var swapping: String?
    @State private var error = ""
    @State private var toList = true
    @State private var saving = false

    struct Evening: Identifiable {
        let date: Date
        let key: String
        let label: String
        let planned: [String]
        let time: PlanPrefs.Time
        var id: String { key }
        /// JavaScript's weekday (0 = Sunday), the key the web stores the times under.
        var weekday: Int { Calendar.current.component(.weekday, from: date) - 1 }
    }

    init(startStep: Int = 0) {
        _step = State(initialValue: startStep)
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch step {
                    case 0: timesStep
                    case 1: fridgeStep
                    default: resultStep
                    }
                    if !error.isEmpty {
                        Text(error).font(.ktFootnote).foregroundStyle(Theme.danger)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .ktKitchenBackground()
        .environment(\.colorScheme, .dark)
        .task {
            if LaunchOptions.screen == "plan-week-result", items == nil { await propose() }
        }
    }

    // MARK: Top

    private var topBar: some View {
        HStack {
            Button { back() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.25)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.1)))
            }
            .accessibilityLabel(step > 0 ? "Pasul anterior" : "Înapoi la săptămână")
            Spacer()
            HStack(spacing: 6) {
                ForEach(0..<3) { i in
                    Capsule().fill(i == step ? Theme.accent : Theme.text.opacity(i < step ? 0.5 : 0.2))
                        .frame(width: i == step ? 22 : 7, height: 7)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("Pasul \(step + 1) din 3")
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .animation(.snappy, value: step)
    }

    private func question(_ kicker: String, _ title: String, _ text: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(kicker.uppercased(with: Locale(identifier: "ro")))
                .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption)).tracking(1.4)
                .foregroundStyle(Theme.accent)
            Text(title)
                .font(.custom(AppFont.displaySemibold, size: 32, relativeTo: .largeTitle))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            if let text {
                Text(text).font(.ktCallout).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 10)
    }

    // MARK: 1. The evenings

    private var timesStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            question("Planifică automat", "Ce gătim săptămâna asta?", "Cât timp ai pentru cină în fiecare seară. „–” înseamnă că sărim seara.")
            VStack(spacing: 0) {
                ForEach(Array(evenings.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Rectangle().fill(Theme.border).frame(height: 0.5) }
                    eveningRow(e)
                }
            }
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
            PlanSegment(options: [(false, "Doar rețetele mele"), (true, "Și câteva noi")], selection: prefs.allowNew) { v in
                prefs.allowNew = v
                prefs.save()
            }
            if EditorText.hasDiet(profile.settings.diet) {
                HStack(spacing: 10) {
                    Image(systemName: "shield").foregroundStyle(Theme.accent)
                    Text(profile.settings.diet.summary.prefix(1).uppercased() + profile.settings.diet.summary.dropFirst())
                        .font(.ktCallout).foregroundStyle(Theme.text)
                    Spacer()
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface))
            }
        }
    }

    private func eveningRow(_ e: Evening) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.label).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout)).foregroundStyle(Theme.text)
                Text(e.planned.isEmpty ? Self.shortDate(e.date) : "deja: \(e.planned.joined(separator: ", "))")
                    .font(.ktCaption).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .opacity(e.planned.isEmpty ? 1 : 0.75)
            Spacer(minLength: 6)
            if e.planned.isEmpty {
                PlanSegment(options: PlanPrefs.Time.allCases.map { ($0, $0.label) }, selection: e.time, compact: true) { t in
                    prefs.times[e.weekday] = t
                    prefs.save()
                }
                .frame(width: 210)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: 2. At home

    private var fridgeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            question("Planifică automat", "Ce ai deja acasă?", "Folosim întâi ce trebuie gătit, iar la listă nu mai punem ce ai. Poți sări peste.")
            MicField(text: $fridge, placeholder: "De exemplu: 2 dovlecei, piept de pui, smântână, ouă, orez", minHeight: 140)
        }
    }

    // MARK: 3. The proposal

    private var resultStep: some View {
        let n = chosen.count
        return VStack(alignment: .leading, spacing: 16) {
            question("Propunerea", n == 1 ? "O cină" : "\(n) cine", !busy && items != nil ? "Atinge ↻ ca să schimbi doar seara aceea." : nil)
            if busy {
                HStack(spacing: 10) {
                    ProgressView().tint(Theme.accent)
                    Text("Aleg cinele\(prefs.allowNew ? " și scriu rețetele noi" : "")… poate dura până la un minut.")
                        .font(.ktCallout).foregroundStyle(Theme.muted)
                }
                .padding(.top, 8)
            } else if let items {
                VStack(spacing: 10) {
                    ForEach(items) { dinnerRow($0) }
                }
            }
        }
    }

    private func dinnerRow(_ x: PlannedDinner) -> some View {
        let r = x.recipeId.flatMap { store.recipe($0) }
        let date = DateFormatter.dayKey.date(from: x.day) ?? Date()
        let e = evenings.first { $0.key == x.day }
        let minutes = r?.minutes ?? x.recipe?.minutes
        let meta = [minutes.map(RecipeText.formatMinutes), x.reason].compactMap { $0 }.joined(separator: " · ")
        return HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(e?.label ?? RecipeText.dayName(date)).font(.ktCaption).foregroundStyle(Theme.muted).lineLimit(1)
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.custom(AppFont.display, size: 22, relativeTo: .title2)).foregroundStyle(Theme.text)
            }
            .frame(width: 54)
            thumb(x, r)
            VStack(alignment: .leading, spacing: 3) {
                Text(x.title).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout)).foregroundStyle(Theme.text).lineLimit(2)
                if !meta.isEmpty { Text(meta).font(.ktCaption).foregroundStyle(Theme.muted).lineLimit(2) }
                if x.kind == .new {
                    Text("rețetă nouă")
                        .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2))
                        .foregroundStyle(Theme.accent)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(Theme.accent.opacity(0.16)))
                }
            }
            Spacer(minLength: 4)
            Button { Task { await swap(x.day) } } label: {
                Group {
                    if swapping == x.day { ProgressView().tint(Theme.accent) } else { Image(systemName: "arrow.triangle.2.circlepath") }
                }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Theme.accent.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .disabled(swapping != nil)
            .accessibilityLabel("Altceva pentru \(e?.label ?? x.day)")
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
        .opacity(swapping == x.day ? 0.6 : 1)
    }

    @ViewBuilder private func thumb(_ x: PlannedDinner, _ r: Recipe?) -> some View {
        if x.kind == .leftovers {
            Image(systemName: "takeoutbag.and.cup.and.straw")
                .font(.system(size: 20)).foregroundStyle(Theme.accent)
                .frame(width: 56, height: 56)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.accent.opacity(0.12)))
        } else if let r {
            RecipePhoto(recipe: r, cornerRadius: 12).frame(width: 56, height: 56)
        } else {
            PlateDrawing(seed: x.title).frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: Footer

    @ViewBuilder private var footer: some View {
        VStack(spacing: 10) {
            switch step {
            case 0:
                Button(chosen.isEmpty ? "Alege cel puțin o seară" : "Mai departe · \(chosen.count) \(chosen.count == 1 ? "seară" : "seri")") {
                    withAnimation(.snappy) { step = 1 }
                }
                .buttonStyle(.ktPrimaryWide)
                .disabled(chosen.isEmpty)
            case 1:
                Button { useFridge = true; Task { await propose() } } label: {
                    Label("Propune cinele", systemImage: "sparkles")
                }
                .buttonStyle(.ktPrimaryWide)
                .disabled(fridge.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Sari peste ›") { useFridge = false; Task { await propose() } }
                    .font(.ktButton).foregroundStyle(Theme.accent)
            default:
                if let items, !busy {
                    let count = listCount
                    if count > 0 {
                        Toggle(isOn: $toList) {
                            Text("Pune și ingredientele în listă ")
                                .font(.ktCallout).foregroundStyle(Theme.text)
                            + Text("(\(count)\(skip != nil ? ", fără ce ai acasă" : ""))")
                                .font(.ktFootnote).foregroundStyle(Theme.muted)
                        }
                        .tint(Theme.accent)
                    }
                    Button(saving ? "Se salvează…" : "Pune în săptămână") { Task { await save() } }
                        .buttonStyle(.ktPrimaryWide)
                        .disabled(saving || items.isEmpty)
                } else if !error.isEmpty, !busy {
                    Button("Încearcă din nou") { Task { await propose() } }.buttonStyle(.ktPrimaryWide)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 12)
    }

    // MARK: Data

    /// The next 7 evenings (from tomorrow once it's late); evenings that already have a dish are
    /// shown, not planned.
    private var evenings: [Evening] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let start = cal.component(.hour, from: Date()) >= 20 ? cal.date(byAdding: .day, value: 1, to: today) ?? today : today
        return (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: start) }.map { d in
            let k = RecipeText.dayKey(d)
            let planned = store.plan.filter { $0.day == k }.compactMap { store.recipe($0.recipeId)?.title }
            let label = cal.isDateInToday(d) ? "Azi" : cal.isDateInTomorrow(d) ? "Mâine" : RecipeText.dayName(d)
            let wd = cal.component(.weekday, from: d) - 1
            return Evening(date: d, key: k, label: label, planned: planned, time: prefs.times[wd] ?? .skip)
        }
    }

    private var chosen: [Evening] { evenings.filter { $0.planned.isEmpty && $0.time != .skip } }

    private var skip: ((String) -> Bool)? {
        let t = fridge.trimmingCharacters(in: .whitespacesAndNewlines)
        return useFridge && !t.isEmpty ? PlanPrefs.atHome(t) : nil
    }

    private var listCount: Int {
        guard let items else { return 0 }
        var lines = Set<String>()
        let skip = skip
        for x in items {
            let ings: [String] = x.kind == .existing ? (x.recipeId.flatMap { store.recipe($0) }?.ingredients ?? [])
                : x.kind == .new ? (x.recipe?.ingredients ?? []) : []
            for l in ings {
                let t = l.trimmingCharacters(in: .whitespaces)
                if !t.isEmpty, !RecipeText.isHeading(t), !(skip?(t) ?? false) { lines.insert(t.lowercased()) }
            }
        }
        return lines.count
    }

    private func args() -> (days: String, recipes: String, recent: [String]) {
        let days: [[String: Any]] = chosen.map { e in
            ["day": e.key, "label": e.label, "minutes": e.time.minutes.map { $0 as Any } ?? NSNull()]
        }
        let logs = store.logsById
        let recipes: [[String: Any]] = store.recipes.filter(\.mine).map { r in
            var item: [String: Any] = ["id": r.id, "title": r.title, "category": r.category,
                                       "ingredients": Array(r.ingredients.filter { !RecipeText.isHeading($0) }.prefix(8))]
            if let m = r.minutes { item["minutes"] = m }
            if let l = logs[r.id] {
                if l.favorite { item["favorite"] = true }
                if !l.cooked.isEmpty { item["cooked"] = l.cooked.count }
                if let last = l.cooked.max() { item["lastCooked"] = last }
            }
            return item
        }
        let from = RecipeText.dayKey(Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date())
        var ids = store.plan.filter { $0.day >= from }.map(\.recipeId)
        ids += logs.values.filter { $0.cooked.contains { $0 >= from } }.map(\.recipeId)
        var recent: [String] = []
        for id in ids { if let t = store.recipe(id)?.title, !recent.contains(t) { recent.append(t) } }
        return (Self.json(days), Self.json(recipes), recent)
    }

    private static func json(_ value: Any) -> String {
        (try? JSONSerialization.data(withJSONObject: value)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    private var dietText: String? {
        EditorText.hasDiet(profile.settings.diet) ? EditorText.dietText(profile.settings.diet) : nil
    }

    // MARK: Actions

    private func back() {
        if step > 0, !busy { withAnimation(.snappy) { step -= 1 } } else { dismiss() }
    }

    private func propose() async {
        withAnimation(.snappy) { step = 2 }
        busy = true
        error = ""
        items = nil
        if useFridge { UserDefaults.standard.set(fridge, forKey: PlanPrefs.fridgeKey) }
        defer { busy = false }
        guard let server = store.server else {
            // Screenshots: our own recipes, one per evening.
            let mine = store.recipes.filter(\.mine)
            items = chosen.enumerated().map { i, e in
                let r = mine.isEmpty ? nil : mine[i % mine.count]
                return PlannedDinner(day: e.key, kind: .existing, recipeId: r?.id, title: r?.title ?? "Ciorbă de legume",
                                     reason: i == 0 ? "n-ați mai mâncat-o de o lună" : "rapidă, pentru o seară grea")
            }
            return
        }
        let a = args()
        do {
            items = try await server.planWeek(days: a.days, recipes: a.recipes, recent: a.recent,
                                              fridge: useFridge ? fridge.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                                              diet: dietText, tools: profile.settings.kitchenTools, allowNew: prefs.allowNew)
        } catch {
            self.error = "Nu am putut face planul: \(Self.text(error))"
        }
    }

    private func swap(_ day: String) async {
        guard let items, let server = store.server else { return }
        swapping = day
        error = ""
        defer { swapping = nil }
        let a = args()
        let keep = items.filter { $0.day != day }.map(\.title) + [items.first { $0.day == day }?.title ?? ""]
        do {
            let found = try await server.planWeek(days: a.days, recipes: a.recipes, recent: a.recent,
                                                  fridge: useFridge ? fridge : nil, diet: dietText, tools: profile.settings.kitchenTools,
                                                  allowNew: prefs.allowNew, swapDay: day, keep: keep)
            if let x = found.first { self.items = items.map { $0.day == day ? x : $0 } }
        } catch {
            self.error = "Nu am găsit altceva: \(Self.text(error))"
        }
    }

    private func save() async {
        guard let items else { return }
        saving = true
        error = ""
        var planned: [Recipe] = []
        var dishOf: [String: Recipe] = [:]
        for x in items.sorted(by: { $0.day < $1.day }) {
            guard let date = DateFormatter.dayKey.date(from: x.day) else { continue }
            if x.kind == .leftovers {
                let before = RecipeText.dayKey(Calendar.current.date(byAdding: .day, value: -1, to: date) ?? date)
                let dish = dishOf[before] ?? store.plan.first { $0.day == before && !$0.leftovers }.flatMap { store.recipe($0.recipeId) }
                // Nothing to cook or buy: just marked in the week, so the evening isn't empty.
                if let dish { _ = await store.planRecipe(dish, on: date, leftovers: true) }
                continue
            }
            var r = x.recipeId.flatMap { store.recipe($0) }
            if x.kind == .new, let n = x.recipe {
                let fresh = Recipe(id: UUID().uuidString.lowercased(), title: n.title, category: n.category ?? "", servings: n.servings,
                                   minutes: n.minutes, ingredients: n.ingredients, steps: n.steps, notes: n.notes,
                                   nutrition: n.nutrition, allergens: n.allergens)
                if let server = store.server {
                    do {
                        let saved = try await server.save(fresh, isNew: true, facts: .some((n.nutrition, n.allergens)), spaceName: profile.settings.spaceName)
                        store.saved(saved)
                        r = saved
                    } catch {
                        self.error = "Nu am putut salva: \(Self.text(error))"
                        saving = false
                        return
                    }
                } else {
                    store.saved(fresh)
                    r = fresh
                }
            }
            guard let r else { continue }
            guard await store.planRecipe(r, on: date) else {
                error = "Nu am putut salva. Verifică internetul."
                saving = false
                return
            }
            dishOf[x.day] = r
            planned.append(r)
        }
        var added = 0
        if toList {
            let skip = skip
            for r in planned { added += await store.addToShopping(r, servings: r.servings, skip: skip) ?? 0 }
        }
        Haptics.success()
        kitchen.say("Am pus \(planned.count) \(planned.count == 1 ? "cină" : "cine") în săptămână\(added > 0 ? " și \(added) ingrediente în listă" : "")")
        dismiss()
    }

    private static func text(_ error: Error) -> String {
        if let e = error as? BackendError, case .server(let m) = e { return m }
        return error.localizedDescription
    }

    /// "15 nov"
    static func shortDate(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "d MMM"
        return f.string(from: d).replacingOccurrences(of: ".", with: "")
    }
}

/// The times per evening and "Și câteva noi", remembered like on the web (kt-plan-prefs).
struct PlanPrefs: Codable {
    enum Time: String, Codable, CaseIterable {
        case skip, m20 = "20", m45 = "45", any
        var label: String {
            switch self {
            case .skip: "–"
            case .m20: "20 min"
            case .m45: "45 min"
            case .any: "oricât"
            }
        }
        var minutes: Int? { Int(rawValue) }
    }

    var times: [Int: Time] = [0: .skip, 1: .m45, 2: .m45, 3: .m45, 4: .m45, 5: .m45, 6: .skip]
    var allowNew = true

    static let key = "kt-plan-prefs"
    static let fridgeKey = "kt-plan-fridge"

    static func load() -> PlanPrefs {
        guard let data = UserDefaults.standard.data(forKey: key), let p = try? JSONDecoder().decode(PlanPrefs.self, from: data) else { return PlanPrefs() }
        return p
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) { UserDefaults.standard.set(data, forKey: Self.key) }
    }

    /// Whether an ingredient line is something written in "Ce ai deja acasă?" (the web's atHome).
    nonisolated static func atHome(_ fridge: String) -> (String) -> Bool {
        let stop: Set<String> = ["pentru", "bucati", "grame", "din", "sau", "mai", "cam"]
        let words: [String] = RecipeText.norm(fridge)
            .split { $0 == "," || $0 == ";" || $0 == "\n" }
            .compactMap { part -> String? in
                let cleaned = String(part).replacingOccurrences(of: #"[\d.,/]+"#, with: " ", options: .regularExpression)
                let w = cleaned.split(whereSeparator: \.isWhitespace).map(String.init)
                    .filter { $0.count >= 3 && !stop.contains($0) }
                    .sorted { $0.count > $1.count }.first
                return w.map { String($0.prefix(max(4, min(6, $0.count - 1)))) }
            }
        return { line in
            let l = RecipeStore.withoutAmount(line).split(whereSeparator: \.isWhitespace)
            return words.contains { w in l.contains { $0.hasPrefix(w) } }
        }
    }
}

/// A small segmented control in the web's style: the chosen option gold.
private struct PlanSegment<T: Hashable>: View {
    let options: [(T, String)]
    let selection: T
    var compact = false
    let pick: (T) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.0) { value, label in
                let on = value == selection
                Button { Haptics.select(); pick(value) } label: {
                    Text(label)
                        .font(.custom(on ? AppFont.bodyBold : AppFont.body, size: compact ? 13 : 15, relativeTo: .footnote))
                        .foregroundStyle(on ? (compact ? Theme.onAccent : Theme.text) : Theme.text.opacity(0.8))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: compact ? 34 : 44)
                        .background {
                            if on {
                                RoundedRectangle(cornerRadius: compact ? 9 : 12)
                                    .fill(compact ? Theme.accent : Color.white.opacity(0.1))
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: compact ? 11 : 14).fill(.black.opacity(0.3)))
    }
}
