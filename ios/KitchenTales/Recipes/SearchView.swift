import SwiftUI

/// "Caută", like the web: one search for everything, recipes by name, category or ingredient,
/// and stories by title. Empty, it shows the categories and "Nu știi ce să gătești?".
struct SearchView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(StoryStore.self) private var stories
    @Environment(StoryPlayer.self) private var player
    @State private var query = LaunchOptions.screen == "search-results" ? "cartofi" : ""
    @State private var fridge = false
    @FocusState private var focused: Bool

    private var words: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        let recipes = words ? store.search(query, category: nil).sorted { $0.title.compare($1.title, locale: Locale(identifier: "ro")) == .orderedAscending } : []
        let found = words ? stories.allStories.filter { RecipeText.matches($0.title, query: query) } : []
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                KTPageHeader(title: "Caută")
                field.padding(.top, 14)
                if !words {
                    if !store.categoryNames.isEmpty {
                        heading("Categorii")
                        WrapLayout(spacing: 8) {
                            ForEach(store.categoryNames.sorted { $0.compare($1, locale: Locale(identifier: "ro")) == .orderedAscending }, id: \.self) { c in
                                Button { query = c } label: {
                                    Text(c)
                                        .font(.custom(AppFont.body, size: 16, relativeTo: .callout))
                                        .foregroundStyle(Theme.text)
                                        .padding(.horizontal, 14).frame(height: 40)
                                        .overlay(Capsule().strokeBorder(.white.opacity(0.14)))
                                }
                                .buttonStyle(PressableStyle())
                            }
                        }
                    }
                    Button { fridge = true } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Nu știi ce să gătești?").font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                                Text("Spune ce ai în frigider și primești idei de rețete").font(.ktFootnote).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.accent)
                        }
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.07)))
                    }
                    .buttonStyle(PressableStyle())
                    .padding(.top, 22)
                } else if recipes.isEmpty && found.isEmpty {
                    Text("Nimic nu se potrivește cu „\(query)”.")
                        .font(.ktCallout).foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    if !recipes.isEmpty {
                        heading("Rețete", count: recipes.count)
                        LazyVStack(spacing: 0) {
                            ForEach(recipes) { r in
                                NavigationLink(value: RecipeRoute.recipe(r.id)) { RecipeRow(recipe: r) }
                                    .buttonStyle(.plain)
                                    .recipeContextMenu(r)
                            }
                        }
                    }
                    if !found.isEmpty {
                        heading("Povești", count: found.count)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                            ForEach(found) { s in
                                Button { Task { await player.play(s, queue: found, store: stories) } } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        StoryCover(story: s, cornerRadius: 16).aspectRatio(1, contentMode: .fit)
                                        Text(s.title).font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                                            .foregroundStyle(Theme.text).lineLimit(2).multilineTextAlignment(.leading)
                                    }
                                }
                                .buttonStyle(PressableStyle())
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, KTTabBarMetrics.height + 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .ktKitchenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { if LaunchOptions.screen == nil { focused = true } }
        .fullScreenCover(isPresented: $fridge) {
            RecipeEditorScreen(recipe: nil, server: store.server, startMode: .ai) { _ in fridge = false }
        }
    }

    private var field: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.muted)
            TextField("", text: $query, prompt: Text("Rețetă, ingredient sau poveste").foregroundStyle(Theme.muted))
                .font(.ktCallout).foregroundStyle(Theme.text)
                .focused($focused)
                .submitLabel(.search)
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) }
                    .accessibilityLabel("Șterge căutarea")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 50)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.accent.opacity(focused ? 0.9 : 0.35), lineWidth: 1.5))
    }

    private func heading(_ title: String, count: Int? = nil) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title).font(.custom(AppFont.displaySemibold, size: 22, relativeTo: .title2)).foregroundStyle(Theme.text)
            if let count { Text("\(count)").font(.ktFootnote).foregroundStyle(Theme.muted) }
        }
        .padding(.top, 24).padding(.bottom, 10)
    }
}
