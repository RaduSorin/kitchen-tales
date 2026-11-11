import SwiftUI

/// Acasă on the recipes side, "Vitrina" like the web: the dish photo fills the top (swipe
/// between the recipe being cooked, today's plan and the newest), then Azi în meniu,
/// Săptămâna ta (seven round plates), Recente and Caietul meu (one card per category).
struct RecipesHomeView: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var path: [RecipeRoute] = []
    @State private var heroPage: String?

    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    if store.recipes.isEmpty {
                        emptyState
                    } else {
                        hero
                        todayMenu
                        WeekPlates().id("week")
                        recent
                        notebook
                    }
                }
                .padding(.bottom, 24)
            }
            .ignoresSafeArea(edges: .top)
            .scrollIndicators(.hidden)
            .task {
                // Screenshots: the middle of the page (the week and the recent recipes).
                if LaunchOptions.screen == "home-week" {
                    try? await Task.sleep(for: .milliseconds(300))
                    proxy.scrollTo("week", anchor: .top)
                }
            }
            }
            .ktKitchenBackground()
            .refreshable { await store.refresh() }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .top) { topBar }
            .recipeDestinations()
        }
        .task {
            if ["recipe", "cook", "recipe-delete", "recipe-steps", "recipe-notes", "recipe-facts"].contains(LaunchOptions.screen), let first = store.recipes.first, path.isEmpty {
                path = [.recipe(first.id)]
            }
        }
    }

    private var topBar: some View {
        HStack {
            AreaPicker(current: .recipes)
            Spacer()
            Button { kitchen.tab = .recipes } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 38, height: 38)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.12)))
            }
            .accessibilityLabel("Caută rețete")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .environment(\.colorScheme, .dark)
    }

    // MARK: Hero

    private var hero: some View {
        let slides = store.heroSlides
        return TabView(selection: $heroPage) {
            ForEach(slides) { slide in
                HeroDish(slide: slide, open: { path.append(.recipe(slide.recipe.id)) })
                    .tag(Optional(slide.id))
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .bottom) { pageDots(slides) }
        .frame(height: 540)
    }

    private func pageDots(_ slides: [HeroSlide]) -> some View {
        let current = heroPage ?? slides.first?.id
        return HStack(spacing: 5) {
            ForEach(slides) { slide in
                Capsule()
                    .fill(slide.id == current ? Theme.accent : Color.white.opacity(0.35))
                    .frame(width: slide.id == current ? 18 : 6, height: 6)
            }
        }
        .opacity(slides.count > 1 ? 1 : 0)
        .animation(.snappy, value: current)
        .padding(.bottom, 4)
        .accessibilityHidden(true)
    }

    // MARK: Sections

    @ViewBuilder private var todayMenu: some View {
        let heroId = store.heroSlides.first?.recipe.id
        let rest = store.today.filter { $0.id != heroId }
        VStack(alignment: .leading, spacing: 12) {
            ShelfHeader(title: "Azi în meniu", link: "Săptămâna") { kitchen.tab = .week }
            if store.today.isEmpty {
                Button { kitchen.tab = .week } label: {
                    (Text("Nimic în plan azi. ").foregroundStyle(Theme.muted) + Text("Planifică săptămâna").foregroundStyle(Theme.accent).bold())
                        .font(.ktCallout)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
            } else if !rest.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
                    ForEach(rest) { r in
                        NavigationLink(value: RecipeRoute.recipe(r.id)) {
                            VStack(alignment: .leading, spacing: 6) {
                                RecipePhoto(recipe: r)
                                    .frame(height: 104)
                                    .frame(maxWidth: .infinity)
                                RecipeCaption(recipe: r)
                            }
                        }
                        .buttonStyle(PressableStyle())
                        .recipeContextMenu(r)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 12) {
            ShelfHeader(title: "Recente", link: "Toate") { kitchen.tab = .recipes }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(store.recent) { r in
                        NavigationLink(value: RecipeRoute.recipe(r.id)) {
                            VStack(alignment: .leading, spacing: 7) {
                                RecipePhoto(recipe: r, cornerRadius: 16)
                                    .frame(width: 150, height: 190)
                                RecipeCaption(recipe: r, showsCategory: false)
                                    .frame(width: 150, alignment: .leading)
                            }
                        }
                        .buttonStyle(PressableStyle())
                        .recipeContextMenu(r)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var notebook: some View {
        VStack(alignment: .leading, spacing: 12) {
            ShelfHeader(title: "Caietul meu", link: "Toate") { kitchen.tab = .recipes }
            VStack(spacing: 12) {
                ForEach(store.categories, id: \.name) { group in
                    NavigationLink(value: RecipeRoute.category(group.name)) {
                        CategoryCard(name: group.name, recipes: group.recipes, newCount: group.recipes.filter(store.isNew).count)
                    }
                    .buttonStyle(PressableStyle())
                }
            }
            .padding(.horizontal, 20)
        }
    }

    @ViewBuilder private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 140)
            switch store.phase {
            case .loading, .idle:
                ProgressView().tint(Theme.accent)
                Text("Se încarcă rețetele…").font(.ktCallout).foregroundStyle(Theme.muted)
            case .failed(let message):
                EmptyStateView(symbol: "wifi.exclamationmark", title: "Nu am putut încărca", message: message)
                Button("Încearcă din nou") { Task { await store.refresh() } }.buttonStyle(.ktPrimary)
            case .loaded:
                EmptyStateView(symbol: "fork.knife", title: "Nicio rețetă încă",
                               message: "Adaugă prima rețetă din aplicația web și apare aici.")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
    }
}

/// One page of the hero: the photo to the edges, fading into the page, with the title and buttons.
private struct HeroDish: View {
    let slide: HeroSlide
    let open: () -> Void
    @Environment(KitchenModel.self) private var kitchen

    var body: some View {
        let r = slide.recipe
        ZStack(alignment: .bottomLeading) {
            RecipePhoto(recipe: r, cornerRadius: 0)
            LinearGradient(stops: [
                .init(color: Theme.background.opacity(0.15), location: 0),
                .init(color: .clear, location: 0.28),
                .init(color: Theme.background.opacity(0.82), location: 0.74),
                .init(color: Theme.background, location: 1),
            ], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                Text(slide.eyebrow.uppercased(with: Locale(identifier: "ro")))
                    .font(.ktLabel).tracking(1.2)
                    .foregroundStyle(Theme.accent)
                Text(r.title)
                    .font(.custom(AppFont.display, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text([r.category.isEmpty ? nil : r.category, r.servings.map { "\($0) porții" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text.opacity(0.85))
                HStack(spacing: 10) {
                    Button { kitchen.cook(r) } label: { Label(slide.primary, systemImage: "play.fill") }
                        .buttonStyle(.ktPrimary)
                    Button("Rețeta", action: open)
                        .buttonStyle(GlassCapsuleStyle())
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
        .clipped()
        .contentShape(Rectangle())
    }
}

/// A capsule of frosted glass, for buttons on photos.
struct GlassCapsuleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ktButton)
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.14)))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
            .environment(\.colorScheme, .dark)
    }
}

/// Title and "40 min · Patiserie" under a photo.
struct RecipeCaption: View {
    let recipe: Recipe
    var showsCategory = true

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(recipe.title)
                .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                .foregroundStyle(Theme.text)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text(caption)
                .font(.ktCaption)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
    }

    private var caption: String {
        var parts: [String] = []
        if let m = recipe.minutes { parts.append(RecipeText.formatMinutes(m)) }
        if !recipe.mine, let name = recipe.spaceName { parts.append("de la \(name)") }
        else if showsCategory, !recipe.category.isEmpty { parts.append(recipe.category) }
        return parts.joined(separator: " · ")
    }
}

/// "Săptămâna ta": a round plate per day, today ringed in gold, an empty day a dashed +.
private struct WeekPlates: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen

    var body: some View {
        let days = RecipeText.weekDays(of: Date())
        VStack(alignment: .leading, spacing: 14) {
            ShelfHeader(title: "Săptămâna ta", link: "Planifică") { kitchen.tab = .week }
            HStack(spacing: 0) {
                ForEach(Array(days.enumerated()), id: \.offset) { i, day in
                    plate(day, letter: Calendar.current.isDateInToday(day) ? "Azi" : RecipeText.dayLetters[i])
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    @ViewBuilder private func plate(_ day: Date, letter: String) -> some View {
        let today = Calendar.current.isDateInToday(day)
        let first = store.entries(on: day).first.flatMap { store.recipe($0.recipeId) }
        VStack(spacing: 7) {
            if let first {
                NavigationLink(value: RecipeRoute.recipe(first.id)) {
                    RecipePhoto(recipe: first, cornerRadius: 23)
                        .frame(width: 46, height: 46)
                        .overlay(Circle().strokeBorder(Theme.accent, lineWidth: today ? 2 : 0).padding(-4))
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel("\(letter): \(first.title)")
            } else {
                Button { kitchen.tab = .week } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 46, height: 46)
                        .background(Circle().strokeBorder(Theme.accent.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                        .overlay(Circle().strokeBorder(Theme.accent, lineWidth: today ? 2 : 0).padding(-4))
                }
                .accessibilityLabel("\(letter): nimic în plan")
            }
            Text(letter)
                .font(.system(.caption, weight: .semibold))
                .foregroundStyle(today ? Theme.accent : Theme.muted)
        }
    }
}

/// A category of "Caietul meu": tinted from its name, with three overlapping dishes.
struct CategoryCard: View {
    let name: String
    let recipes: [Recipe]
    var newCount = 0

    private static let tints: [(UInt32, UInt32)] = [(0x7A4A22, 0x3A2412), (0x3E5A2E, 0x1E2C16), (0x6A2A3C, 0x32141C),
                                                    (0x2E4A6A, 0x162434), (0x6A5A22, 0x322A10)]

    var body: some View {
        let tint = Self.tints[CoverScene.index(name) % Self.tints.count]
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.custom(AppFont.display, size: 22, relativeTo: .title2))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)
                Text(count)
                    .font(.ktFootnote)
                    .foregroundStyle(Theme.text.opacity(0.75))
            }
            Spacer(minLength: 8)
            ZStack {
                ForEach(Array(Array(recipes.prefix(3).enumerated()).reversed()), id: \.offset) { i, r in
                    RecipePhoto(recipe: r, cornerRadius: 12)
                        .frame(width: 64, height: 84)
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.15), lineWidth: 1.5))
                        .shadow(color: .black.opacity(0.4), radius: 6, y: 3)
                        .offset(x: CGFloat(i) * -34)
                }
            }
            .frame(width: 132, alignment: .trailing)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
        .background(LinearGradient(colors: [Color(hex: tint.0), Color(hex: tint.1)], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(.white.opacity(0.08)))
        .accessibilityElement(children: .combine)
    }

    private var count: String {
        let n = recipes.count
        var s = n == 1 ? "1 rețetă" : "\(n) rețete"
        if newCount > 0 { s += newCount == 1 ? " · 1 nouă" : " · \(newCount) noi" }
        return s
    }
}
