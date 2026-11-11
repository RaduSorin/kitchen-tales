import SwiftUI

/// "Cumpărături", the family shopping list as on the web: a quick add field, the list by shop
/// aisle or by recipe, tap to tick (ticked lines move to "În coș"), swipe to delete, and ⋯ to
/// send the list or empty it. It is the same list on every phone.
struct ShoppingView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @AppStorage("kt-shopping-by-recipe") private var byRecipe = false
    @State private var newText = ""
    @State private var confirm: Clear?
    @FocusState private var typing: Bool

    enum Clear: Identifiable { case basket, all; var id: Self { self } }

    private var open: [ShoppingLine] { store.shopping.filter { !$0.checked } }
    private var basket: [ShoppingLine] { store.shopping.filter(\.checked) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    addField
                    Picker("Ordine", selection: $byRecipe) {
                        Text("Pe raioane").tag(false)
                        Text("Pe rețete").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                ForEach(groups, id: \.title) { group in
                    Section {
                        ForEach(group.lines) { line in row(line, showsSource: !byRecipe) }
                    } header: {
                        header(group.title, count: group.lines.count)
                    }
                }
                if !basket.isEmpty {
                    Section {
                        ForEach(basket) { line in row(line, showsSource: false) }
                    } header: {
                        HStack {
                            header("În coș", count: basket.count)
                            Button("Golește") { confirm = .basket }
                                .font(.system(.footnote, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                        }
                    }
                }
                if store.shopping.isEmpty { empty }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .ktKitchenBackground()
            .refreshable { await store.refresh() }
            .navigationTitle("Cumpărături")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { moreMenu } }
            .confirmationDialog(confirm == .all ? "Golești toată lista?" : "Golești coșul?", isPresented: Binding(
                get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
                Button(confirm == .all ? "Da, golește tot" : "Da, golește", role: .destructive) { clear() }
            } message: {
                Text(confirm == .all ? "Se șterge toată lista, pe toate telefoanele." : "Se șterge ce ai bifat.")
            }
        }
    }

    // MARK: Parts

    private var addField: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent)
            TextField("Adaugă ceva (ex. 2 l lapte)", text: $newText)
                .font(.ktBody)
                .focused($typing)
                .submitLabel(.done)
                .onSubmit(add)
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private func header(_ title: String, count: Int) -> some View {
        HStack {
            Text(title.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
            Spacer()
            Text("\(count)").font(.system(.caption, weight: .semibold)).foregroundStyle(Theme.muted)
        }
        .textCase(nil)
    }

    private func row(_ line: ShoppingLine, showsSource: Bool) -> some View {
        Button {
            Haptics.select()
            Task { await store.toggleChecked(line.id) }
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().strokeBorder(line.checked ? Theme.accent : Theme.muted.opacity(0.6), lineWidth: 2)
                    if line.checked {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.onAccent)
                    }
                }
                .frame(width: 24, height: 24)
                Text(line.text)
                    .font(.ktBody)
                    .foregroundStyle(line.checked ? Theme.muted : Theme.text)
                    .strikethrough(line.checked, color: Theme.muted)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 6)
                if showsSource, let title = line.recipeTitle {
                    Text(title).font(.ktCaption).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(Theme.border)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { Task { await store.removeShopping([line.id]) } } label: { Label("Șterge", systemImage: "trash") }
        }
        .accessibilityAddTraits(line.checked ? .isSelected : [])
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Text("Lista e goală.").font(.ktTitle3).foregroundStyle(Theme.text)
            Text("Deschide o rețetă și apasă „Pune în listă”, sau pune ce ai planificat în Săptămâna mea.")
                .font(.ktCallout).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            Button("Pune în listă ce gătești în 7 zile") { addWeek() }
                .buttonStyle(.ktSecondary)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private var moreMenu: some View {
        Menu {
            ShareLink(item: shareText) { Label("Trimite lista", systemImage: "square.and.arrow.up") }
            Button { addWeek() } label: { Label("Pune ce gătești în 7 zile", systemImage: "calendar.badge.plus") }
            Divider()
            Button(role: .destructive) { confirm = .basket } label: { Label("Golește coșul", systemImage: "cart.badge.minus") }
                .disabled(basket.isEmpty)
            Button(role: .destructive) { confirm = .all } label: { Label("Golește toată lista", systemImage: "trash") }
                .disabled(store.shopping.isEmpty)
        } label: {
            Image(systemName: "ellipsis").foregroundStyle(Theme.text)
        }
        .accessibilityLabel("Mai multe")
    }

    // MARK: Grouping

    private var groups: [(title: String, lines: [ShoppingLine])] {
        if byRecipe {
            let grouped = Dictionary(grouping: open) { $0.recipeTitle ?? "" }
            return grouped.map { (title: $0.key.isEmpty ? "Altele" : $0.key, lines: $0.value) }
                .sorted { a, b in a.title == "Altele" ? false : b.title == "Altele" ? true : a.title < b.title }
        }
        let grouped = Dictionary(grouping: open) { ShoppingAisles.aisleOf($0.text) }
        return grouped.sorted { ShoppingAisles.order($0.key) < ShoppingAisles.order($1.key) }
            .map { (title: ShoppingAisles.name($0.key), lines: $0.value) }
    }

    /// The list as text, by aisle, for WhatsApp or Messages.
    private var shareText: String {
        let grouped = Dictionary(grouping: open) { ShoppingAisles.aisleOf($0.text) }
        let parts = grouped.sorted { ShoppingAisles.order($0.key) < ShoppingAisles.order($1.key) }.map { key, lines in
            ShoppingAisles.name(key) + ":\n" + lines.map { "• \($0.text)" }.joined(separator: "\n")
        }
        return (["Cumpărături"] + parts).joined(separator: "\n\n")
    }

    // MARK: Actions

    private func add() {
        let text = newText
        newText = ""
        typing = true
        Task {
            if await store.addShoppingText(text) { Haptics.tap() } else if !text.trimmingCharacters(in: .whitespaces).isEmpty {
                kitchen.say("Nu am putut adăuga. Verifică internetul.")
            }
        }
    }

    private func addWeek() {
        Task {
            if let added = await store.addPlanToShopping() {
                kitchen.say(added == 0 ? "Ingredientele sunt deja în listă" : "Am pus \(added) ingrediente în listă")
            } else {
                kitchen.say("Nu am putut pune în listă. Verifică internetul.")
            }
        }
    }

    private func clear() {
        let ids = (confirm == .all ? store.shopping : basket).map(\.id)
        let all = confirm == .all
        confirm = nil
        Task {
            if await store.removeShopping(ids) { kitchen.say(all ? "Am golit lista" : "Am golit coșul") }
        }
    }
}
