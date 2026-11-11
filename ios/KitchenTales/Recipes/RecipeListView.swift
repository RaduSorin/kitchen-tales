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

/// "Rețetele mele": a large iOS title, search by name or ingredient, the categories as chips
/// and a row per recipe with its photo. Opened from a "Caietul meu" card it starts on that category.
struct RecipeListView: View {
    var category: String?
    @Environment(RecipeStore.self) private var store
    @State private var query = ""
    @State private var chosen: String?
    @State private var showsNew = false
    @Environment(\.openURL) private var openURL

    init(category: String? = nil) {
        self.category = category
        _chosen = State(initialValue: category)
    }

    var body: some View {
        let list = store.search(query, category: chosen)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                if category == nil { chips.padding(.bottom, 8) }
                ForEach(list) { r in
                    NavigationLink(value: RecipeRoute.recipe(r.id)) { RecipeRow(recipe: r) }
                        .buttonStyle(.plain)
                        .recipeContextMenu(r)
                }
                if list.isEmpty { empty }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .ktKitchenBackground()
        .refreshable { await store.refresh() }
        .navigationTitle(category ?? "Rețetele mele")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Caută după nume sau ingredient")
        .toolbar {
            if category == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showsNew = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Theme.onAccent)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(Theme.accent))
                    }
                    .accessibilityLabel("Rețetă nouă")
                }
            }
        }
        .alert("Rețetă nouă", isPresented: $showsNew) {
            Button("Deschide aplicația web") {
                if let url = URL(string: "https://main.d1b5q3cpreuzof.amplifyapp.com/retete/noua") { openURL(url) }
            }
            Button("Renunță", role: .cancel) {}
        } message: {
            Text("Scrierea rețetelor în aplicația iPhone vine în pasul următor. Până atunci, adaug-o din aplicația web și apare aici.")
        }
    }

    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                chip("Toate", selected: chosen == nil) { chosen = nil }
                ForEach(store.categoryNames, id: \.self) { name in
                    chip(name, selected: chosen == name) { chosen = name }
                }
            }
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.select()
            withAnimation(.snappy) { action() }
        } label: {
            Text(title)
                .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                .foregroundStyle(selected ? Theme.onAccent : Theme.text)
                .padding(.horizontal, 14)
                .frame(height: 36)
                .background(Capsule().fill(selected ? Theme.accent : Theme.surface2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private var empty: some View {
        if store.recipes.isEmpty, store.phase == .loading || store.phase == .idle {
            ProgressView().tint(Theme.accent).frame(maxWidth: .infinity).padding(.top, 60)
        } else {
            EmptyStateView(symbol: "magnifyingglass", title: query.isEmpty ? "Nicio rețetă aici" : "Nimic găsit",
                           message: query.isEmpty ? "Adaugă rețete din aplicația web." : "Încearcă alt cuvânt sau un ingredient.")
                .padding(.top, 40)
        }
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
