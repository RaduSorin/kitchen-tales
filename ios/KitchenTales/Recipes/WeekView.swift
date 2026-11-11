import SwiftUI

/// "Săptămâna mea" as on the web: one column per day, side by side, that you swipe through;
/// each column scrolls on its own. Today is ringed in gold, past days are dimmed, "← Azi" brings
/// today back, the month title jumps to another day and the cart puts the next 7 days on the list.
struct WeekView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var path: [RecipeRoute] = []
    @State private var visible: String?
    @State private var adding: DayPick?
    @State private var picksDate = false
    @State private var jumpDate = Date()

    /// From a week back to eight weeks ahead.
    private let days: [Date] = {
        let today = Calendar.current.startOfDay(for: Date())
        return (-7...56).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: today) }
    }()

    private var startKey: String {
        RecipeText.dayKey(Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date())
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(alignment: .leading, spacing: 14) {
                header
                columns
            }
            .ktKitchenBackground()
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottom) { todayPill }
            .recipeDestinations()
            .sheet(item: $adding) { pick in
                PickRecipeSheet(day: pick.day)
                    .environment(store)
                    .environment(kitchen)
            }
            .sheet(isPresented: $picksDate) { datePicker }
        }
        .onAppear {
            if visible == nil { visible = startKey }
            if LaunchOptions.screen == "week-add", adding == nil,
               let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) {
                adding = DayPick(day: tomorrow)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 2) {
                Text("SĂPTĂMÂNA MEA").font(.ktLabel).tracking(1.2).foregroundStyle(Theme.accent)
                Button { jumpDate = shownDate; picksDate = true } label: {
                    HStack(spacing: 8) {
                        Text(monthTitle).font(.custom(AppFont.display, size: 30, relativeTo: .largeTitle)).foregroundStyle(Theme.text)
                        Image(systemName: "chevron.down").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent)
                    }
                }
                .accessibilityHint("Alege o zi din calendar")
            }
            Spacer()
            Button { addWeekToList() } label: {
                Image(systemName: "cart")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 46, height: 46)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.12)))
            }
            .accessibilityLabel("Pune în listă ce gătești în 7 zile")
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .environment(\.colorScheme, .dark)
    }

    private var shownDate: Date {
        days.first { RecipeText.dayKey($0) == visible } ?? Date()
    }

    private var monthTitle: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "LLLL yyyy"
        let s = f.string(from: Calendar.current.date(byAdding: .day, value: 1, to: shownDate) ?? shownDate)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    // MARK: Columns

    private var columns: some View {
        GeometryReader { geo in
            let width = (geo.size.width / 2.5).rounded()
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(days, id: \.self) { day in
                        DayColumn(day: day, open: { path.append(.recipe($0)) }, add: { adding = DayPick(day: day) })
                            .frame(width: width)
                            .id(RecipeText.dayKey(day))
                    }
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $visible, anchor: .leading)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder private var todayPill: some View {
        if let visible, visible != startKey, visible != RecipeText.dayKey(Date()) {
            Button {
                withAnimation(.snappy) { self.visible = startKey }
            } label: {
                Label("Azi", systemImage: shownDate > Date() ? "arrow.left" : "arrow.right")
                    .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
            }
            .padding(.bottom, 96)
            .transition(.scale.combined(with: .opacity))
            .environment(\.colorScheme, .dark)
        }
    }

    private var datePicker: some View {
        NavigationStack {
            DatePicker("Ziua", selection: $jumpDate, in: (days.first ?? Date())...(days.last ?? Date()), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .tint(Theme.accent)
                .padding()
                .navigationTitle("Sari la o zi")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Gata") {
                            let before = Calendar.current.date(byAdding: .day, value: -1, to: jumpDate) ?? jumpDate
                            visible = RecipeText.dayKey(max(days.first ?? before, before))
                            picksDate = false
                        }
                    }
                }
        }
        .presentationDetents([.medium])
        .environment(Locale(identifier: "ro_RO"))
    }

    private func addWeekToList() {
        Task {
            if let added = await store.addPlanToShopping() {
                Haptics.success()
                kitchen.say(added == 0 ? "Ingredientele sunt deja în listă" : "Am pus \(added) ingrediente în listă")
            } else {
                kitchen.say("Nu am putut pune în listă. Verifică internetul.")
            }
        }
    }
}

struct DayPick: Identifiable, Hashable {
    let day: Date
    var id: String { RecipeText.dayKey(day) }
}

/// One day: the weekday and date on top, then its recipes as photo cards and a dashed +.
private struct DayColumn: View {
    let day: Date
    let open: (String) -> Void
    let add: () -> Void
    @Environment(RecipeStore.self) private var store

    var body: some View {
        let today = Calendar.current.isDateInToday(day)
        let past = day < Calendar.current.startOfDay(for: Date())
        VStack(spacing: 10) {
            VStack(spacing: 4) {
                Text(today ? "Azi · \(RecipeText.dayName(day))" : RecipeText.dayName(day))
                    .font(.system(.footnote, weight: .semibold))
                    .foregroundStyle(today ? Theme.accent : Theme.muted)
                    .lineLimit(1)
                Text(String(format: "%02d", Calendar.current.component(.day, from: day)))
                    .font(.custom(AppFont.display, size: 24, relativeTo: .title))
                    .foregroundStyle(today ? Theme.onAccent : Theme.text.opacity(0.8))
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(today ? Theme.accent : .clear))
                    .shadow(color: today ? Theme.accent.opacity(0.35) : .clear, radius: 10)
            }
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(store.entries(on: day)) { entry in
                        if let r = store.recipe(entry.recipeId) {
                            PlannedCard(entry: entry, recipe: r, past: past, open: { open(r.id) })
                        }
                    }
                    if !past {
                        Button(action: add) {
                            Image(systemName: "plus")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                                .frame(maxWidth: .infinity, minHeight: 60)
                                .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(Theme.accent.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                        }
                        .accessibilityLabel("Adaugă o rețetă \(today ? "azi" : RecipeText.dayName(day).lowercased())")
                    }
                }
                .padding(.bottom, 110)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 10)
        .overlay(alignment: .trailing) { Rectangle().fill(Color.white.opacity(0.07)).frame(width: 0.5) }
    }
}

/// A planned recipe: its photo, title and servings; long press for everything else.
private struct PlannedCard: View {
    let entry: PlanEntry
    let recipe: Recipe
    let past: Bool
    let open: () -> Void
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 6) {
                RecipePhoto(recipe: recipe)
                    .frame(height: 132)
                    .frame(maxWidth: .infinity)
                Text(recipe.title)
                    .font(.custom(AppFont.display, size: 16, relativeTo: .headline))
                    .foregroundStyle(Theme.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                Text(detail)
                    .font(.ktCaption)
                    .foregroundStyle(entry.leftovers ? Theme.accent : Theme.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(past ? 0.55 : 1)
        }
        .buttonStyle(PressableStyle())
        .contextMenu { menu } preview: {
            RecipePhoto(recipe: recipe, cornerRadius: 0).frame(width: 300, height: 220).environment(store)
        }
    }

    private var detail: String {
        if entry.leftovers { return "Resturi · nu trebuie gătit" }
        var parts: [String] = []
        if let m = recipe.minutes { parts.append(RecipeText.formatMinutes(m)) }
        if let s = store.servings(of: entry) { parts.append(s == 1 ? "1 porție" : "\(s) porții") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private var menu: some View {
        Button(action: open) { Label("Deschide rețeta", systemImage: "book") }
        Button { kitchen.cook(recipe, servings: store.servings(of: entry)) } label: { Label("Gătește pas cu pas", systemImage: "play.fill") }
        Menu {
            ForEach([1, 2, 3, 4, 5, 6, 8, 10, 12], id: \.self) { n in
                Button { Task { await store.setServings(entry.id, n) } } label: {
                    if store.servings(of: entry) == n { Label("\(n) porții", systemImage: "checkmark") } else { Text(n == 1 ? "1 porție" : "\(n) porții") }
                }
            }
        } label: { Label("Porții: \(store.servings(of: entry).map(String.init) ?? "–")", systemImage: "person.2") }
        Menu {
            ForEach(PlanDayMenu<EmptyView>.days(), id: \.self) { day in
                Button(PlanDayMenu<EmptyView>.label(day)) {
                    Task {
                        if await store.movePlan(entry.id, to: day) { kitchen.say("Mutată: \(PlanDayMenu<EmptyView>.label(day).lowercased())") }
                    }
                }
            }
        } label: { Label("Mută în altă zi", systemImage: "arrow.left.arrow.right") }
        Button {
            Task {
                if let added = await store.addToShopping(recipe, servings: store.servings(of: entry)) {
                    kitchen.say(added == 0 ? "Sunt deja în listă" : "Am pus \(added) ingrediente în listă")
                }
            }
        } label: { Label("Pune în listă", systemImage: "cart.badge.plus") }
        Button(role: .destructive) { Task { await store.removePlan(entry.id) } } label: {
            Label("Scoate din ziua asta", systemImage: "trash")
        }
    }
}

/// "+" on a day: search the recipes, quick filters, and a + per recipe; the sheet stays open so
/// you can put several on the same day.
struct PickRecipeSheet: View {
    let day: Date
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var filter = Filter.all
    @State private var added: Set<String> = []

    enum Filter: String, CaseIterable { case all = "Toate", favorites = "Favorite", quick = "Rapide", leftovers = "Resturi" }

    private var previousDay: Date { Calendar.current.date(byAdding: .day, value: -1, to: day) ?? day }

    private var list: [Recipe] {
        let found = store.search(query, category: nil)
        switch filter {
        case .all: return found
        case .favorites: return found.filter { store.isFavorite($0.id) }
        case .quick: return found.filter { ($0.minutes ?? 999) <= 30 }
        case .leftovers:
            let yesterday = Set(store.entries(on: previousDay).map(\.recipeId))
            return found.filter { yesterday.contains($0.id) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(list) { r in row(r) }
                } header: {
                    chips.textCase(nil).padding(.bottom, 4)
                }
                if list.isEmpty {
                    Text(filter == .leftovers ? "Nimic planificat în ziua dinainte." : "Nicio rețetă nu se potrivește.")
                        .font(.ktCallout).foregroundStyle(Theme.muted)
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color(hex: 0x211B17))
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută o rețetă")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata") { dismiss() }.foregroundStyle(Theme.accent) } }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .environment(\.colorScheme, .dark)
    }

    private var title: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "EEEE, d MMMM"
        let s = f.string(from: day)
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Filter.allCases, id: \.self) { f in
                    Button {
                        Haptics.select()
                        filter = f
                    } label: {
                        Text(f.rawValue)
                            .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline))
                            .foregroundStyle(filter == f ? Theme.onAccent : Theme.text)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(Capsule().fill(filter == f ? Theme.accent : Theme.surface2))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func row(_ r: Recipe) -> some View {
        HStack(spacing: 12) {
            RecipePhoto(recipe: r, cornerRadius: 12).frame(width: 60, height: 60)
            VStack(alignment: .leading, spacing: 3) {
                Text(r.title).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout)).foregroundStyle(Theme.text).lineLimit(2)
                Text(hint(r)).font(.ktFootnote).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 4)
            Button { plan(r) } label: {
                Image(systemName: added.contains(r.id) ? "checkmark.circle.fill" : "plus.circle")
                    .font(.system(size: 26))
                    .foregroundStyle(Theme.accent)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(added.contains(r.id) ? "Pusă în ziua asta" : "Pune \(r.title) în ziua asta")
        }
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(Theme.border)
    }

    /// "35 min · gătită acum 2 săpt. · deja joi"
    private func hint(_ r: Recipe) -> String {
        var parts: [String] = []
        if let m = r.minutes { parts.append(RecipeText.formatMinutes(m)) }
        if let last = store.lastCooked(r.id) { parts.append("gătită \(RecipeText.since(last))") }
        let week = RecipeText.weekDays(of: day)
        if let planned = week.first(where: { d in store.entries(on: d).contains { $0.recipeId == r.id } }) {
            parts.append(Calendar.current.isDate(planned, inSameDayAs: day) ? "deja în ziua asta" : "deja \(RecipeText.dayName(planned).lowercased())")
        }
        return parts.joined(separator: " · ")
    }

    private func plan(_ r: Recipe) {
        guard !added.contains(r.id) else { return }
        Task {
            if await store.planRecipe(r, on: day, leftovers: filter == .leftovers) {
                Haptics.success()
                added.insert(r.id)
            } else {
                kitchen.say("Nu am putut pune în plan. Verifică internetul.")
            }
        }
    }
}
