import SwiftUI

/// The Rețete tab: "Rețetele mele" with its own navigation stack.
struct RecipesTabRoot: View {
    var body: some View {
        NavigationStack {
            RecipeListView()
                .recipeDestinations()
        }
    }
}

/// How "Rețetele mele" shows the recipes (the web's views, remembered on the phone).
enum RecipeListMode: String, CaseIterable {
    case list, grid, magazine, rows
    var label: String { switch self { case .list: "Listă"; case .grid: "Grilă"; case .magazine: "Revistă"; case .rows: "Categorii" } }
    var symbol: String {
        switch self {
        case .list: "list.bullet"
        case .grid: "square.grid.2x2"
        case .magazine: "rectangle.portrait.bottomhalf.inset.filled"
        case .rows: "square.grid.3x2"
        }
    }
}

enum RecipeSort: String, CaseIterable {
    case az, new, fast, cooked
    var label: String { switch self { case .az: "Alfabetic"; case .new: "Cele mai noi"; case .fast: "Cele mai rapide"; case .cooked: "Gătite des" } }
}

/// "Rețetele mele", like the web: the big serif title with the gold +, the search box with the
/// view button beside it (Listă, Grilă, Revistă, Categorii and the order), underlined category
/// tabs, then the photo grid. Opened from a "Caietul meu" card it starts on that category.
struct RecipeListView: View {
    var category: String?
    @Environment(RecipeStore.self) private var store
    @State private var query = ""
    @State private var chosen: String?
    @State private var showsNew = false
    @State private var opened: String?
    @State private var editing: Recipe?
    @State private var switchOpen = false
    @AppStorage("kt-recipes-view") private var mode: RecipeListMode = .grid
    @AppStorage("kt-recipes-sort") private var sort: RecipeSort = .az
    @FocusState private var searching: Bool

    /// The "Favorite" tab's value (no real category can have it).
    static let favorites = "\u{0}fav"

    init(category: String? = nil) {
        self.category = category
        _chosen = State(initialValue: category)
    }

    private var shown: [Recipe] {
        let base = store.search(query, category: chosen == Self.favorites ? nil : chosen)
            .filter { chosen != Self.favorites || store.isFavorite($0.id) }
        let cooked = Dictionary(uniqueKeysWithValues: store.recipes.map { ($0.id, store.log($0.id)?.cooked.count ?? 0) })
        let byTitle: (Recipe, Recipe) -> Bool = { $0.title.compare($1.title, locale: Locale(identifier: "ro")) == .orderedAscending }
        return base.sorted { a, b in
            switch sort {
            case .az: return byTitle(a, b)
            case .new: return (a.createdAt ?? "") != (b.createdAt ?? "") ? (a.createdAt ?? "") > (b.createdAt ?? "") : byTitle(a, b)
            case .fast: return (a.minutes ?? 9999) != (b.minutes ?? 9999) ? (a.minutes ?? 9999) < (b.minutes ?? 9999) : byTitle(a, b)
            case .cooked: return cooked[a.id] != cooked[b.id] ? (cooked[a.id] ?? 0) > (cooked[b.id] ?? 0) : byTitle(a, b)
            }
        }
    }

    private var anyFavorite: Bool { store.recipes.contains { store.isFavorite($0.id) } }
    private var categories: [String] {
        Array(Set(store.recipes.map(\.category).filter { !$0.isEmpty })).sorted { $0.compare($1, locale: Locale(identifier: "ro")) == .orderedAscending }
    }

    var body: some View {
        let list = shown
        let rowsMode = mode == .rows && query.isEmpty && chosen == nil && category == nil
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                searchRow.padding(.top, 14)
                if category == nil && mode != .rows { tabs.padding(.top, 10) }
                if mode == .rows, chosen != nil, category == nil {
                    Button { withAnimation(.snappy) { chosen = nil } } label: {
                        Label("Toate categoriile", systemImage: "chevron.left").font(.ktBodyEmphasis).foregroundStyle(Theme.accent)
                    }
                    .padding(.vertical, 10)
                }
                Group {
                    if list.isEmpty { empty }
                    else if rowsMode { rows(list) }
                    else {
                        switch mode {
                        case .list:
                            LazyVStack(spacing: 0) {
                                ForEach(list) { r in link(r) { RecipeRow(recipe: r) } }
                            }
                        case .magazine:
                            LazyVStack(spacing: 26) {
                                ForEach(list) { r in RecipeMagazineCard(recipe: r) { opened = r.id } }
                            }
                        default:
                            RecipeMasonry(recipes: list) { r in link(r) { RecipeTile(recipe: r, height: RecipeMasonry.height(r)) } }
                        }
                    }
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, KTTabBarMetrics.height + 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .ktKitchenBackground()
        .refreshable { await store.refresh() }
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(isPresented: $showsNew) {
            RecipeEditorScreen(recipe: nil, server: store.server) { saved in
                showsNew = false
                if let saved { opened = saved.id }
            }
        }
        .fullScreenCover(item: $editing) { r in
            RecipeEditorScreen(recipe: r, server: store.server) { _ in editing = nil }
        }
        .navigationDestination(item: $opened) { RecipeDetailView(recipeId: $0) }
        .task {
            guard category == nil, let screen = LaunchOptions.screen else { return }
            guard screen.hasPrefix("editor-") else { return }
            if DemoEditor.editingScreens.contains(screen) { editing = store.recipe("r1") } else { showsNew = true }
        }
    }

    private func link<Label: View>(_ r: Recipe, @ViewBuilder _ label: () -> Label) -> some View {
        NavigationLink(value: RecipeRoute.recipe(r.id)) { label() }
            .buttonStyle(.plain)
            .recipeContextMenu(r)
    }

    // MARK: Head

    @ViewBuilder private var header: some View {
        if let category {
            KTPageHeader(title: category)
        } else {
            HStack(alignment: .center) {
                Text("Rețetele mele")
                    .font(.custom(AppFont.displaySemibold, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button { showsNew = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Theme.onAccent)
                        .frame(width: 46, height: 46)
                        .background(Circle().fill(Theme.accent))
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("Rețetă nouă")
            }
            .padding(.top, 8)
        }
    }

    private var searchRow: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.muted)
                TextField("", text: $query, prompt: Text(switchOpen ? "Caută după" : "Caută după nume sau ingredient").foregroundStyle(Theme.muted))
                    .font(.ktCallout).foregroundStyle(Theme.text)
                    .focused($searching)
                    .submitLabel(.search)
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) }
                        .accessibilityLabel("Șterge căutarea")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.07)))
            viewSwitch
        }
        .animation(.snappy, value: switchOpen)
    }

    /// One round button with the current view; a tap widens it into the four views and the order.
    private var viewSwitch: some View {
        HStack(spacing: 2) {
            if switchOpen {
                ForEach(RecipeListMode.allCases, id: \.self) { m in
                    Button {
                        Haptics.select()
                        mode = m
                        chosen = category
                    } label: {
                        Image(systemName: m.symbol)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(m == mode ? Theme.onAccent : Theme.text)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(m == mode ? Theme.accent : .clear))
                    }
                    .accessibilityLabel(m.label)
                    .accessibilityAddTraits(m == mode ? .isSelected : [])
                }
                Menu {
                    Picker("Ordine", selection: $sort) {
                        ForEach(RecipeSort.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .frame(width: 38, height: 38)
                }
                .accessibilityLabel("Ordine")
            } else {
                Button { switchOpen = true } label: {
                    Image(systemName: mode.symbol)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .frame(width: 38, height: 38)
                }
                .accessibilityLabel("Vizualizare: \(mode.label)")
            }
        }
        .padding(4)
        .background(Capsule().fill(.white.opacity(0.07)))
        .task(id: switchOpen) {
            guard switchOpen else { return }
            try? await Task.sleep(for: .seconds(4))
            switchOpen = false
        }
    }

    /// The web's underlined category tabs: Toate, Favorite, then each category.
    private var tabs: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 18) {
                tab("Toate", nil)
                if anyFavorite { tab("Favorite", Self.favorites) }
                ForEach(categories, id: \.self) { tab($0, $0) }
            }
            .padding(.horizontal, 2)
        }
        .scrollIndicators(.hidden)
    }

    private func tab(_ title: String, _ value: String?) -> some View {
        let on = chosen == value
        return Button {
            Haptics.select()
            withAnimation(.snappy) { chosen = value }
        } label: {
            Text(title)
                .font(.custom(on ? AppFont.bodySemibold : AppFont.body, size: 16, relativeTo: .callout))
                .foregroundStyle(on ? Theme.text : Theme.muted)
                .frame(minHeight: 44)
                .overlay(alignment: .bottom) { if on { Rectangle().fill(Theme.accent).frame(height: 2) } }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Categorii

    private func rows(_ list: [Recipe]) -> some View {
        let days = Set(RecipeText.weekDays(of: Date()).map { RecipeText.dayKey($0) })
        var seen = Set<String>()
        let week = store.plan.filter { days.contains($0.day) }.sorted { $0.day < $1.day }
            .compactMap { e in store.recipe(e.recipeId) }.filter { seen.insert($0.id).inserted }
        return VStack(alignment: .leading, spacing: 22) {
            if anyFavorite { row("Favorite", list.filter { store.isFavorite($0.id) }, more: Self.favorites) }
            if !week.isEmpty { row("Săptămâna asta", week, more: nil) }
            ForEach(categories + [""], id: \.self) { c in
                let xs = list.filter { $0.category == c }
                if !xs.isEmpty { row(c.isEmpty ? "Fără categorie" : c, xs, more: c.isEmpty ? nil : c) }
            }
        }
    }

    private func row(_ title: String, _ xs: [Recipe], more: String?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.ktTitle3).foregroundStyle(Theme.text)
                Spacer()
                if let more {
                    Button("\(xs.count) ›") { withAnimation(.snappy) { chosen = more } }
                        .font(.ktFootnote).foregroundStyle(Theme.muted)
                }
            }
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    ForEach(xs) { r in
                        link(r) {
                            VStack(alignment: .leading, spacing: 6) {
                                RecipePhoto(recipe: r, cornerRadius: 14).frame(width: 130, height: 130)
                                Text(r.title).font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                                    .foregroundStyle(Theme.text).lineLimit(2).frame(width: 130, alignment: .leading)
                            }
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder private var empty: some View {
        if store.recipes.isEmpty, store.phase == .loading || store.phase == .idle {
            ProgressView().tint(Theme.accent).frame(maxWidth: .infinity).padding(.top, 60)
        } else {
            EmptyStateView(symbol: "magnifyingglass", title: query.isEmpty ? "Nicio rețetă aici" : "Nimic găsit",
                           message: query.isEmpty ? "Adaugă una cu +." : "Nicio rețetă nu se potrivește cu „\(query)”.")
                .padding(.top, 40)
        }
    }
}

/// The web's photo grid: two columns of tiles of three heights, each tile going to the shorter column.
struct RecipeMasonry<Tile: View>: View {
    let recipes: [Recipe]
    @ViewBuilder let tile: (Recipe) -> Tile

    static func height(_ r: Recipe) -> CGFloat {
        [200, 170, 230][r.id.unicodeScalars.reduce(0) { $0 + Int($1.value) } % 3]
    }

    var body: some View {
        var cols: [[Recipe]] = [[], []]
        var tall: [CGFloat] = [0, 0]
        for r in recipes {
            let c = tall[0] <= tall[1] ? 0 : 1
            cols[c].append(r)
            tall[c] += Self.height(r)
        }
        return HStack(alignment: .top, spacing: 10) {
            ForEach(0..<2, id: \.self) { i in
                LazyVStack(spacing: 10) { ForEach(cols[i]) { tile($0) } }
            }
        }
    }
}

/// A photo tile with the title and "45 min · 4 porții" on a dark fade.
struct RecipeTile: View {
    let recipe: Recipe
    let height: CGFloat

    var body: some View {
        RecipePhoto(recipe: recipe, cornerRadius: 0)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay { LinearGradient(stops: [.init(color: .clear, location: 0.4), .init(color: .black.opacity(0.75), location: 1)], startPoint: .top, endPoint: .bottom) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(recipe.title)
                        .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .callout))
                        .lineLimit(3)
                    let meta = [recipe.minutes.map(RecipeText.formatMinutes), recipe.servings.map { "\($0) porții" }].compactMap { $0 }.joined(separator: " · ")
                    if !meta.isEmpty { Text(meta).font(.custom(AppFont.bodySemibold, size: 12, relativeTo: .caption)).opacity(0.85) }
                }
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
                .padding(.leading, 12).padding(.trailing, 10).padding(.bottom, 10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.4), radius: 10, y: 8)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// "Revistă": a wide photo with the category, the serif title, and buttons to plan and to shop.
struct RecipeMagazineCard: View {
    let recipe: Recipe
    let open: () -> Void
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: open) {
                RecipePhoto(recipe: recipe, cornerRadius: 0)
                    .aspectRatio(16 / 10, contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(alignment: .topLeading) {
                        if !recipe.category.isEmpty {
                            Text(recipe.category)
                                .font(.custom(AppFont.bodyBold, size: 12, relativeTo: .caption))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 11).padding(.vertical, 5)
                                .background(Capsule().fill(.black.opacity(0.45)))
                                .padding(12)
                        }
                    }
                    .shadow(color: .black.opacity(0.45), radius: 14, y: 12)
            }
            .buttonStyle(PressableStyle())
            .recipeContextMenu(recipe)
            HStack(alignment: .top, spacing: 10) {
                Button(action: open) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(recipe.title)
                            .font(.custom(AppFont.displaySemibold, size: 22, relativeTo: .title2))
                            .foregroundStyle(Theme.text)
                            .multilineTextAlignment(.leading)
                        let meta = [recipe.minutes.map(RecipeText.formatMinutes), recipe.servings.map { "\($0) porții" }].compactMap { $0 }.joined(separator: " · ")
                        if !meta.isEmpty { Text(meta).font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.muted) }
                    }
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
                PlanDayMenu(recipe: recipe) { round("calendar") }
                    .accessibilityLabel("Pune \(recipe.title) în săptămână")
                if !recipe.ingredients.isEmpty {
                    Button {
                        Task {
                            let n = await store.addToShopping(recipe, servings: recipe.servings)
                            kitchen.say(n.map { $0 > 0 ? "Am pus \($0) \($0 == 1 ? "ingredient" : "ingrediente") în listă" : "Sunt deja în listă" } ?? "Nu am putut pune în listă.")
                        }
                    } label: { round("cart") }
                    .accessibilityLabel("Pune ingredientele pentru \(recipe.title) în listă")
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func round(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.accent)
            .frame(width: 44, height: 44)
            .background(Circle().fill(Theme.surface2))
    }
}

/// A row: the photo, the title and "Ciorbe și supe · 1 h 30 · 4 porții".
struct RecipeRow: View {
    let recipe: Recipe
    @Environment(RecipeStore.self) private var store

    var body: some View {
        HStack(spacing: 14) {
            RecipePhoto(recipe: recipe, cornerRadius: 12)
                .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(recipe.title)
                        .font(.custom(AppFont.bodySemibold, size: 17, relativeTo: .body))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                    if store.isFavorite(recipe.id) {
                        Image(systemName: "heart.fill").font(.caption2).foregroundStyle(Theme.accent)
                            .accessibilityLabel("Favorită")
                    }
                }
                Text(detail)
                    .font(.ktFootnote)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.muted.opacity(0.6))
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.border).frame(height: 0.5).padding(.leading, 78)
        }
        .contentShape(Rectangle())
    }

    private var detail: String {
        var parts: [String] = []
        if !recipe.mine, let name = recipe.spaceName { parts.append("De la \(name)") }
        if !recipe.category.isEmpty { parts.append(recipe.category) }
        if let m = recipe.minutes { parts.append(RecipeText.formatMinutes(m)) }
        if let s = recipe.servings { parts.append(s == 1 ? "1 porție" : "\(s) porții") }
        return parts.joined(separator: " · ")
    }
}
