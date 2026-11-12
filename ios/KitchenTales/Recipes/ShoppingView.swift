import SwiftUI

/// "Cumpărături", the family shopping list as on the web: the big title with "7 de luat · 1 în
/// coș" and ⋯, the list by shop aisle or by recipe (the same ingredient from several recipes is
/// one line, amounts added up), tap to tick (ticked lines fold into "În coș"), swipe to delete,
/// and the add bar at the bottom, where the thumb is. It is the same list on every phone.
struct ShoppingView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @AppStorage("kt-shopping-by-recipe") private var byRecipe = false
    @State private var newText = ""
    @State private var confirm: Clear?
    @State private var basketOpen = false
    @FocusState private var typing: Bool

    enum Clear: Identifiable { case basket, all; var id: Self { self } }

    private var open: [ShoppingLine] { store.shopping.filter { !$0.checked } }
    private var basket: [ShoppingLine] { store.shopping.filter(\.checked) }

    var body: some View {
        let openRows = ShoppingMerge.rows(open)
        let doneRows = ShoppingMerge.rows(basket)
        NavigationStack {
            List {
                Section {
                    top(openRows.count, doneRows.count)
                    if !open.isEmpty { viewSwitch }
                }
                ForEach(groups(openRows), id: \.title) { group in
                    Section {
                        ForEach(group.rows) { row($0, showsSources: !byRecipe) }
                    } header: {
                        if !group.title.isEmpty { header(group.title) }
                    }
                }
                if !store.shopping.isEmpty, open.isEmpty {
                    Text("Ai luat tot!")
                        .font(.ktCallout).foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity).padding(.vertical, 20)
                        .listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
                if !doneRows.isEmpty { basketSection(doneRows) }
                if store.shopping.isEmpty { empty }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .ktKitchenBackground()
            .refreshable { await store.refresh() }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom, spacing: 0) { addBar }
            .confirmationDialog(confirm == .all ? "Ștergi toate cele \(openRows.count + doneRows.count) produse?" : "Golești coșul (\(doneRows.count))?",
                                isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
                Button(confirm == .all ? "Da, golește tot" : "Da, golește", role: .destructive) { clear() }
            } message: {
                Text(confirm == .all ? "Se șterge toată lista, pe toate telefoanele." : "Se șterge ce ai bifat.")
            }
        }
    }

    // MARK: Parts

    private func top(_ toBuy: Int, _ inBasket: Int) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Cumpărături")
                    .font(.custom(AppFont.displaySemibold, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .accessibilityAddTraits(.isHeader)
                if !store.shopping.isEmpty {
                    Text(inBasket > 0 ? "\(toBuy) de luat · \(inBasket) în coș" : "\(toBuy) de luat")
                        .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            if !store.shopping.isEmpty { moreMenu }
        }
        .padding(.top, 8)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    /// The web's dark segmented control: the chosen side a lighter dark.
    private var viewSwitch: some View {
        HStack(spacing: 0) {
            ForEach([false, true], id: \.self) { recipes in
                let on = byRecipe == recipes
                Button {
                    Haptics.select()
                    withAnimation(.snappy) { byRecipe = recipes }
                } label: {
                    Text(recipes ? "Pe rețete" : "Pe raioane")
                        .font(.custom(on ? AppFont.bodySemibold : AppFont.body, size: 15, relativeTo: .subheadline))
                        .foregroundStyle(on ? Theme.text : Theme.text.opacity(0.75))
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background { if on { RoundedRectangle(cornerRadius: 10).fill(Color(hex: 0x241B16)) } }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 13).fill(.black.opacity(0.35)))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    /// At the bottom, where the thumb is; the gold arrow (or Done) adds.
    private var addBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus").font(.system(size: 17, weight: .regular)).foregroundStyle(Theme.muted)
            TextField("Adaugă ceva, ex. 1 l lapte", text: $newText)
                .font(.ktBody)
                .focused($typing)
                .submitLabel(.done)
                .onSubmit(add)
            if !newText.trimmingCharacters(in: .whitespaces).isEmpty {
                Button(action: add) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.onAccent)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(Theme.accent))
                }
                .accessibilityLabel("Adaugă")
            }
        }
        .padding(.leading, 18).padding(.trailing, 7)
        .frame(height: 50)
        .background(Capsule().fill(Color(hex: 0x241B16)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.06)))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .animation(.snappy, value: newText.isEmpty)
    }

    private func header(_ title: String) -> some View {
        Text(title.uppercased(with: Locale(identifier: "ro")))
            .font(.ktLabel).tracking(1.4)
            .foregroundStyle(Theme.accent)
            .textCase(nil)
            .padding(.top, 8)
    }

    private func basketSection(_ rows: [ShoppingRow]) -> some View {
        Section {
            if basketOpen {
                ForEach(rows) { row($0, showsSources: false) }
                Button("Golește coșul") { confirm = .basket }
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.accent)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        } header: {
            Button { withAnimation(.snappy) { basketOpen.toggle() } } label: {
                HStack {
                    Text("În coș · \(rows.count)".uppercased(with: Locale(identifier: "ro")))
                        .font(.ktLabel).tracking(1.4)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .semibold))
                        .rotationEffect(.degrees(basketOpen ? 180 : 0))
                }
                .foregroundStyle(Theme.accent)
                .padding(.top, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .textCase(nil)
            .accessibilityValue(basketOpen ? "deschis" : "închis")
        }
    }

    private func row(_ row: ShoppingRow, showsSources: Bool) -> some View {
        Button {
            Haptics.select()
            Task { await store.setChecked(row.ids, !row.checked) }
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().strokeBorder(row.checked ? Theme.accent : Theme.muted.opacity(0.6), lineWidth: 1.6)
                    if row.checked {
                        Circle().fill(Theme.accent)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Theme.onAccent)
                    }
                }
                .frame(width: 24, height: 24)
                Text(row.text)
                    .font(.ktBody)
                    .foregroundStyle(row.checked ? Theme.muted : Theme.text)
                    .strikethrough(row.checked, color: Theme.muted)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 6)
                // By aisle every source shows; by recipe only when several recipes share the line.
                if row.sources.count > (showsSources ? 0 : 1) {
                    Text(row.sources.joined(separator: " · "))
                        .font(.ktCaption).foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { Task { await store.removeShopping(row.ids) } } label: { Label("Șterge", systemImage: "trash") }
        }
        .accessibilityAddTraits(row.checked ? .isSelected : [])
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
            if !open.isEmpty {
                ShareLink(item: shareText) { Label("Trimite lista", systemImage: "square.and.arrow.up") }
            }
            Button { addWeek() } label: { Label("Pune ce gătești în 7 zile", systemImage: "calendar.badge.plus") }
            if !basket.isEmpty {
                Button { confirm = .basket } label: { Label("Golește coșul", systemImage: "cart") }
            }
            Button(role: .destructive) { confirm = .all } label: { Label("Golește toată lista", systemImage: "trash") }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 44, height: 44)
                .background(Circle().fill(.white.opacity(0.1)))
        }
        .accessibilityLabel("Opțiuni listă")
    }

    // MARK: Grouping

    /// By aisle, in the order of a walk through the shop; by recipe in the order recipes were
    /// added, lines typed by hand first, then the ones several recipes share.
    private func groups(_ rows: [ShoppingRow]) -> [(title: String, rows: [ShoppingRow])] {
        if byRecipe {
            let many = "Pentru mai multe rețete"
            var order: [String] = []
            var map: [String: [ShoppingRow]] = [:]
            for r in rows {
                let first = store.shopping.first { $0.id == r.ids.first }
                let k = r.sources.count > 1 ? many : first?.recipeId != nil ? (first?.recipeTitle ?? "Rețetă") : ""
                if map[k] == nil { order.append(k) }
                map[k, default: []].append(r)
            }
            let rank: (String) -> Int = { $0.isEmpty ? 0 : $0 == many ? 1 : 2 }
            let sorted = order.enumerated().sorted { a, b in
                rank(a.element) != rank(b.element) ? rank(a.element) < rank(b.element) : a.offset < b.offset
            }.map(\.element)
            return sorted.map { k in (title: k.isEmpty && order.count > 1 ? "Altele" : k, rows: map[k] ?? []) }
        }
        let grouped = Dictionary(grouping: rows) { ShoppingAisles.aisleOf($0.text) }
        return grouped.sorted { ShoppingAisles.order($0.key) < ShoppingAisles.order($1.key) }
            .map { (title: ShoppingAisles.name($0.key), rows: $0.value) }
    }

    /// The list as text, by aisle, for WhatsApp or Messages.
    private var shareText: String {
        let grouped = Dictionary(grouping: ShoppingMerge.rows(open)) { ShoppingAisles.aisleOf($0.text) }
        let parts = grouped.sorted { ShoppingAisles.order($0.key) < ShoppingAisles.order($1.key) }.map { key, rows in
            ShoppingAisles.name(key) + ":\n" + rows.map { "• \($0.text)" }.joined(separator: "\n")
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
