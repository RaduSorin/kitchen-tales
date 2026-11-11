import SwiftUI

/// Acasă on the recipes side, like the web's src/pages/Home.tsx (design A1 "Topit în poză"): the
/// dish photo fills the top (swipe between the recipe being cooked, today's plan and the newest)
/// and fades into the page, where three tabs hold the rest: Azi (today's menu, or three ideas,
/// and tonight's story), Săptămâna (seven round plates that pick a day shown below) and Caiet
/// (Recente and one collection card per category). The open tab is remembered.
struct RecipesHomeView: View {
    enum HomeTab: String, CaseIterable { case azi, saptamana, caiet
        var label: String { switch self { case .azi: "Azi"; case .saptamana: "Săptămâna"; case .caiet: "Caiet" } }
    }

    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var path: [RecipeRoute] = []
    @State private var heroPage: String?
    @SceneStorage("kt-home-tab") private var tab: HomeTab = Self.launchTab

    private static var launchTab: HomeTab {
        switch LaunchOptions.screen {
        case "home-week": .saptamana
        case "home-caiet": .caiet
        default: .azi
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if store.recipes.isEmpty {
                        emptyState
                    } else {
                        hero
                        VStack(alignment: .leading, spacing: 16) {
                            HomeSegTabs(selection: $tab) { $0.label }
                            Group {
                                switch tab {
                                case .azi: AziPanel()
                                case .saptamana: WeekDayPanel()
                                case .caiet: caiet
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    }
                }
                .padding(.bottom, 24)
            }
            .ignoresSafeArea(edges: .top)
            .scrollIndicators(.hidden)
            .ktKitchenBackground()
            .refreshable { await store.refresh() }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .top) { topBar }
            .recipeDestinations()
        }
        .onAppear {
            // Screenshots pick the tab; a tab kept from an earlier run must not win.
            if LaunchOptions.tab != nil { tab = Self.launchTab }
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

    // MARK: Caiet

    @ViewBuilder private var caiet: some View {
        let onTop = Set(store.heroSlides.map(\.recipe.id))
        let recent = Array(store.recipes.filter { !onTop.contains($0.id) }.prefix(8))
        VStack(alignment: .leading, spacing: 14) {
            if !recent.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HomeSecHead(title: "Recente", link: "Toate") { kitchen.tab = .recipes }
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 14) {
                            ForEach(recent) { r in
                                NavigationLink(value: RecipeRoute.recipe(r.id)) {
                                    VStack(alignment: .leading, spacing: 7) {
                                        RecipePhoto(recipe: r, cornerRadius: 16)
                                            .frame(width: 150, height: 190)
                                        RecipeCaption(recipe: r)
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
                    .padding(.horizontal, -20)
                }
            }
            if !store.categories.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HomeSecHead(title: "Caietul meu", link: "Toate") { kitchen.tab = .recipes }
                    VStack(spacing: 12) {
                        ForEach(store.categories, id: \.name) { group in
                            NavigationLink(value: RecipeRoute.category(group.name)) {
                                CategoryCard(name: group.name, recipes: group.recipes, newCount: group.recipes.filter(store.isNew).count)
                            }
                            .buttonStyle(PressableStyle())
                        }
                    }
                }
            }
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

// MARK: - Pieces shared by the tabs

/// The web's `.seg-tabs`: the recipe page's segmented control, on the dark end of the photo.
struct HomeSegTabs<T: Hashable & CaseIterable>: View where T.AllCases: RandomAccessCollection {
    @Binding var selection: T
    let label: (T) -> String

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(T.allCases), id: \.self) { t in
                let on = t == selection
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { selection = t }
                } label: {
                    Text(label(t))
                        .font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
                        .foregroundStyle(on ? Theme.text : Theme.muted)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(on ? .white.opacity(0.16) : .clear))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
    }

}

/// A section title in a tab: "Recente" with a gold "Toate" on the right.
struct HomeSecHead: View {
    let title: String
    var link: String?
    var action: () -> Void = {}

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.custom(AppFont.displaySemibold, size: 22, relativeTo: .title2)).foregroundStyle(Theme.text)
            Spacer()
            if let link {
                Button(link, action: action)
                    .font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .subheadline))
                    .foregroundStyle(Theme.accent)
            }
        }
    }
}

/// The web's `.home-rows` row: a 52pt photo, the name and one muted line.
struct HomeDishRow<Trailing: View>: View {
    let recipe: Recipe
    var kicker: (text: String, color: Color)?
    let line: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 14) {
            RecipePhoto(recipe: recipe, cornerRadius: 14)
                .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                if let kicker {
                    Text(kicker.text.uppercased(with: Locale(identifier: "ro")))
                        .font(.custom(AppFont.bodyHeavy, size: 10.5, relativeTo: .caption2))
                        .tracking(1)
                        .foregroundStyle(kicker.color)
                        .lineLimit(1)
                }
                Text(recipe.title)
                    .font(.custom(AppFont.bodyBold, size: 16, relativeTo: .body))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if !line.isEmpty {
                    Text(line)
                        .font(.custom(AppFont.bodySemibold, size: 12.5, relativeTo: .caption))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// The thin line between rows.
struct HomeRowDivider: View {
    var body: some View { Rectangle().fill(.white.opacity(0.07)).frame(height: 1) }
}

/// "+ Azi": the gold outlined pill that plans an idea.
struct HomeAddPill: View {
    let title: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom(AppFont.bodyHeavy, size: 14, relativeTo: .subheadline))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(Capsule().fill(Theme.accent.opacity(0.1)))
                .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.45)))
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(label)
    }
}

struct HomeChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Theme.muted)
    }
}

// MARK: - Azi

/// Today's menu as rows, or three ideas from the notebook when nothing is planned, then
/// tonight's story.
private struct AziPanel: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var round = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            let menu = store.entries(on: Date()).filter { !$0.leftovers }.compactMap { store.recipe($0.recipeId) }
            if !menu.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(menu.enumerated()), id: \.offset) { i, r in
                        if i > 0 { HomeRowDivider() }
                        NavigationLink(value: RecipeRoute.recipe(r.id)) {
                            HomeDishRow(recipe: r, line: Self.todayLine(r)) { HomeChevron() }
                        }
                        .buttonStyle(.plain)
                        .recipeContextMenu(r)
                    }
                }
            } else {
                ideas
            }
            TonightStory()
        }
    }

    static func todayLine(_ r: Recipe) -> String {
        let m = meta(r)
        return m.isEmpty ? "Azi în meniu" : "Azi în meniu · " + m
    }

    static func meta(_ r: Recipe) -> String {
        [r.minutes.map(RecipeText.formatMinutes), r.category.isEmpty ? nil : r.category].compactMap { $0 }.joined(separator: " · ")
    }

    @ViewBuilder private var ideas: some View {
        let list = TodayIdeas.ideas(store.recipes, logs: store.logsById, exclude: store.plannedThisWeek, round: round)
        if list.isEmpty {
            Button { kitchen.tab = .week } label: {
                (Text("Nimic în plan azi. ").foregroundStyle(Theme.muted) + Text("Săptămâna").foregroundStyle(Theme.accent).bold())
                    .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
            }
            .buttonStyle(.plain)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HomeSecHead(title: "Nimic în plan azi", link: "Planifică") { kitchen.tab = .week }
                Text("Dar am \(["", "o idee", "două idei", "trei idei"][list.count]) din caietul tău:")
                    .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 4)
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.offset) { i, idea in
                        if i > 0 { HomeRowDivider() }
                        HStack(spacing: 8) {
                            NavigationLink(value: RecipeRoute.recipe(idea.recipe.id)) {
                                HomeDishRow(recipe: idea.recipe, kicker: (idea.why, Self.color(idea.kind)), line: idea.meta) { EmptyView() }
                            }
                            .buttonStyle(.plain)
                            HomeAddPill(title: "+ Azi", label: "Pune \(idea.recipe.title) în meniul de azi") {
                                Task {
                                    if await store.planRecipe(idea.recipe, on: Date()) { kitchen.say("\(idea.recipe.title) e în meniul de azi") }
                                }
                            }
                        }
                    }
                }
                .padding(.top, 6)
                HStack {
                    Button("↻ Alte idei") { withAnimation(.snappy) { round += 1 } }
                        .font(.custom(AppFont.bodyHeavy, size: 14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.accent)
                        .frame(minHeight: 44)
                    Spacer()
                    Button { kitchen.tab = .recipes } label: {
                        (Text("sau alege din ").foregroundStyle(Theme.muted) + Text("Rețete").foregroundStyle(Theme.accent).bold())
                            .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    static func color(_ kind: TodayIdea.Kind) -> Color {
        switch kind {
        case .demult: Color(hex: 0xF0A08E)
        case .favorita: Theme.accent
        case .rapida: Color(hex: 0x9DBFE6)
        case .noua: Color(hex: 0x9FC6A0)
        }
    }
}

/// "Pentru Matei, diseară": tonight's story on the recipes side, the one paused halfway or a
/// different one each day; tap plays it.
private struct TonightStory: View {
    @Environment(StoryStore.self) private var stories
    @Environment(StoryPlayer.self) private var player
    @Environment(ProfileStore.self) private var profile
    @Environment(AreaModel.self) private var area

    var body: some View {
        let child = profile.settings.childName.isEmpty ? "cei mici" : profile.settings.childName
        if let pick = Self.pick(stories.stories) {
            Button {
                Task { await player.play(pick.story, store: stories) }
                player.showsPlayer = true
            } label: {
                HStack(spacing: 14) {
                    StoryCover(story: pick.story, cornerRadius: 12)
                        .frame(width: 64, height: 64)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.kicker(pick.resume, child: child))
                            .font(.ktLabel).tracking(1.2)
                            .foregroundStyle(Theme.accent)
                            .lineLimit(1)
                        Text(pick.story.title)
                            .font(.custom(AppFont.displaySemibold, size: 19, relativeTo: .title3))
                            .foregroundStyle(Theme.text)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text([pick.resume ? "Continuă" : "Ascultă", pick.story.minutesLabel].compactMap { $0 }.joined(separator: " · "))
                            .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                            .foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "play.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.onAccent)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.accent))
                }
                .padding(12)
                .background(LinearGradient(colors: [Color(hex: 0x241D33), Color(hex: 0x171320)], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .buttonStyle(PressScale())
        } else if !stories.stories.isEmpty || stories.phase == .loaded {
            Button { area.current = .stories } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("POVEȘTI PENTRU \(child.uppercased(with: Locale(identifier: "ro")))").font(.ktLabel).tracking(1.2).foregroundStyle(Theme.accent)
                    Text("Adaugă prima poveste").font(.custom(AppFont.displaySemibold, size: 19, relativeTo: .title3)).foregroundStyle(Theme.text)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(LinearGradient(colors: [Color(hex: 0x241D33), Color(hex: 0x171320)], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .buttonStyle(PressScale())
        }
    }

    static func kicker(_ resume: Bool, child: String) -> String {
        let text: String = resume ? "Ați rămas la jumătate" : "Pentru \(child), " + (evening ? "diseară" : "la culcare")
        return text.uppercased(with: Locale(identifier: "ro"))
    }

    /// Evening from 18:00, like the sky on the stories side.
    static var evening: Bool { Calendar.current.component(.hour, from: Date()) >= 18 || Calendar.current.component(.hour, from: Date()) < 5 }

    static func pick(_ list: [Story]) -> (story: Story, resume: Bool)? {
        guard !list.isEmpty else { return nil }
        let last = PlaybackMemory.lastStoryId.flatMap { id in list.first { $0.id == id } }
        if let last, PlaybackMemory.position(last.id) > 5 { return (last, true) }
        let day = Int(Date().timeIntervalSince1970 / 86400)
        let pool = list.count > 1 ? list.filter { $0.id != last?.id } : list
        return (pool[day % pool.count], false)
    }
}

// MARK: - Săptămâna

/// Acasă › Săptămâna, "Cercuri + ziua aleasă" (src/components/WeekDayPanel.tsx): the seven
/// plates pick a day shown right below. A planned day lists its dishes (tap one for Gătește ·
/// Pe listă · Mută · Scoate); a free day offers three dishes from the notebook.
private struct WeekDayPanel: View {
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen
    @State private var picked = RecipeText.dayKey(Date())
    @State private var open: String?
    @State private var moving: PlanEntry?

    private static let abbr = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"]

    var body: some View {
        let days = RecipeText.weekDays(of: Date())
        let todayKey = RecipeText.dayKey(Date())
        let i = days.firstIndex { RecipeText.dayKey($0) == picked } ?? 0
        let day = days[i]
        let isToday = RecipeText.dayKey(day) == todayKey
        let entries = store.entries(on: day)
        let label = isToday ? "Azi" : RecipeText.dayName(day)
        let date = Self.date(day)

        VStack(alignment: .leading, spacing: 0) {
            plates(days, todayKey: todayKey)

            HStack(alignment: .firstTextBaseline) {
                Text(Self.title(day, label: label, isToday: isToday, empty: entries.isEmpty, date: date))
                    .font(.custom(AppFont.displaySemibold, size: 22, relativeTo: .title2))
                    .foregroundStyle(Theme.text)
                Spacer()
                Text(entries.isEmpty ? date : (entries.count == 1 ? "1 fel" : "\(entries.count) feluri"))
                    .font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.top, 20)
            .padding(.bottom, 2)

            if entries.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(ideas(days).enumerated()), id: \.offset) { k, idea in
                        if k > 0 { HomeRowDivider() }
                        HStack(spacing: 8) {
                            NavigationLink(value: RecipeRoute.recipe(idea.r.id)) {
                                HomeDishRow(recipe: idea.r, line: freeLine(idea)) { EmptyView() }
                            }
                            .buttonStyle(.plain)
                            HomeAddPill(title: "+ \(isToday ? "Azi" : Self.abbr[i])", label: "Pune \(idea.r.title) \(isToday ? "azi" : "pe \(RecipeText.dayName(day).lowercased())")") {
                                Task {
                                    if await store.planRecipe(idea.r, on: day) {
                                        kitchen.say("\(idea.r.title) e în plan \(isToday ? "azi" : RecipeText.dayName(day).lowercased())")
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(entries) { e in
                        if let r = store.recipe(e.recipeId) {
                            row(e, r, isToday: isToday)
                            HomeRowDivider()
                        }
                    }
                    Button { kitchen.tab = .week } label: {
                        Label("Adaugă încă un fel \(isToday ? "azi" : Self.abbr[i].lowercased())", systemImage: "plus")
                            .font(.custom(AppFont.bodyBold, size: 16, relativeTo: .body))
                            .foregroundStyle(Theme.accent)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, 17)
                            .padding(.top, 12)
                            .padding(.bottom, 4)
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack {
                Button(entries.isEmpty ? "Altă rețetă…" : "Toată săptămâna") { kitchen.tab = entries.isEmpty ? .recipes : .week }
                Spacer()
                Button("Planifică") { kitchen.tab = .week }
            }
            .font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
            .foregroundStyle(Theme.accent)
            .padding(.vertical, 6)
            .padding(.top, 14)
        }
        .sheet(item: $moving) { e in
            MoveDaySheet(entry: e, days: days) { target in
                Task {
                    if await store.movePlan(e.id, to: target) {
                        picked = RecipeText.dayKey(target)
                        open = nil
                        kitchen.say(Calendar.current.isDateInToday(target) ? "Am mutat-o azi" : "Am mutat-o pe \(RecipeText.dayName(target).lowercased())")
                    }
                }
                moving = nil
            }
            .presentationDetents([.medium])
            .presentationCornerRadius(Theme.Radius.sheet)
        }
    }

    private func plates(_ days: [Date], todayKey: String) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(days.enumerated()), id: \.offset) { k, d in
                let key = RecipeText.dayKey(d)
                let today = key == todayKey
                let on = key == picked
                let first = store.entries(on: d).first.flatMap { store.recipe($0.recipeId) }
                Button {
                    withAnimation(.snappy) { picked = key; open = nil }
                } label: {
                    VStack(spacing: 6) {
                        Group {
                            if let first {
                                RecipePhoto(recipe: first, cornerRadius: 0).clipShape(Circle())
                            } else {
                                Text("+").font(.custom(AppFont.bodySemibold, size: 19, relativeTo: .body)).foregroundStyle(Theme.accent)
                            }
                        }
                        .frame(width: 44, height: 44)
                        .overlay {
                            if on {
                                Circle().strokeBorder(Theme.accent, lineWidth: 2.5)
                            } else if first == nil {
                                Circle().strokeBorder(Theme.accent.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            } else {
                                Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1.5)
                            }
                        }
                        .background {
                            if on { Circle().fill(Theme.accent.opacity(0.2)).padding(-3).shadow(color: Theme.accent.opacity(0.35), radius: 9) }
                        }
                        Text(today ? "Azi" : RecipeText.dayLetters[k])
                            .font(.custom(AppFont.bodyBold, size: 12.5, relativeTo: .caption))
                            .foregroundStyle(today ? Theme.accent : on ? Theme.text : Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScale())
                .accessibilityLabel("\(RecipeText.dayName(d)): \(first?.title ?? "nimic planificat")")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    @ViewBuilder private func row(_ e: PlanEntry, _ r: Recipe, isToday: Bool) -> some View {
        let on = open == e.id
        let servings = store.servings(of: e)
        let meta: String = e.leftovers ? "Resturi · nu trebuie gătit" : Self.dishLine(r, servings: servings)
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { withAnimation(.snappy) { open = on ? nil : e.id } } label: {
                    HomeDishRow(recipe: r, line: meta) {
                        if !(isToday && !e.leftovers) {
                            HomeChevron().rotationEffect(.degrees(on ? 90 : 0))
                        }
                    }
                }
                .buttonStyle(.plain)
                if isToday && !e.leftovers {
                    Button { kitchen.cook(r, servings: servings) } label: {
                        HStack(spacing: 6) {
                            ChefHat().stroke(style: StrokeStyle(lineWidth: 1.9, lineCap: .round, lineJoin: .round)).frame(width: 15, height: 15)
                            Text("Gătește").font(.custom(AppFont.bodyHeavy, size: 14, relativeTo: .subheadline))
                        }
                        .foregroundStyle(Theme.onAccent)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 34)
                        .background(Capsule().fill(Theme.accent))
                    }
                    .buttonStyle(PressScale())
                }
            }
            if on {
                HStack(spacing: 0) {
                    action("Gătește", chef: true) { kitchen.cook(r, servings: servings) }
                    action("Pe listă", symbol: "cart") {
                        Task {
                            if let n = await store.addToShopping(r, servings: servings) {
                                kitchen.say(n > 0 ? "Am pus \(n) \(n == 1 ? "ingredient" : "ingrediente") pe listă" : "Ingredientele sunt deja pe listă")
                            }
                        }
                    }
                    action("Mută", symbol: "calendar") { moving = e }
                    action("Scoate", symbol: "trash", danger: true) {
                        Task {
                            if await store.removePlan(e.id) { open = nil; kitchen.say("Am scos \(r.title)") }
                        }
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func action(_ title: String, symbol: String = "", chef: Bool = false, danger: Bool = false, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            VStack(spacing: 4) {
                if chef {
                    ChefHat().stroke(style: StrokeStyle(lineWidth: 1.9, lineCap: .round, lineJoin: .round)).frame(width: 17, height: 17)
                } else {
                    Image(systemName: symbol).font(.system(size: 16, weight: .regular))
                }
                Text(title).font(.custom(AppFont.bodyBold, size: 11.5, relativeTo: .caption2))
            }
            .foregroundStyle(danger ? Theme.danger : Theme.text.opacity(0.8))
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScale())
    }

    /// A free day's ideas: the notebook's dishes not planned this week, cooked longest ago first.
    private func ideas(_ days: [Date]) -> [FreeDayIdea] {
        let planned: Set<String> = store.plannedThisWeek
        var list: [FreeDayIdea] = []
        for r in store.recipes where r.mine && !planned.contains(r.id) {
            list.append(FreeDayIdea(r: r, last: store.lastCooked(r.id)))
        }
        list.sort { a, b in
            let x = a.last ?? "", y = b.last ?? ""
            if x != y { return x < y }
            return a.r.title < b.r.title
        }
        return Array(list.prefix(3))
    }

    private func freeLine(_ idea: FreeDayIdea) -> String {
        var parts: [String] = []
        if let last = idea.last { parts.append("gătită ultima dată \(TodayIdeas.addedOn(last))") } else { parts.append("încă negătită") }
        if let m = idea.r.minutes { parts.append(RecipeText.formatMinutes(m)) }
        return parts.joined(separator: " · ")
    }

    static func title(_ day: Date, label: String, isToday: Bool, empty: Bool, date: String) -> String {
        if empty { return label + " e liberă" }
        let when: String = isToday ? RecipeText.dayName(day).lowercased() + " \(Calendar.current.component(.day, from: day))" : date
        return label + " · " + when
    }

    static func dishLine(_ r: Recipe, servings: Int?) -> String {
        var parts: [String] = []
        if let m = r.minutes { parts.append(RecipeText.formatMinutes(m)) }
        if let n = servings { parts.append("\(n) porții") }
        return parts.joined(separator: " · ")
    }

    static func date(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "d MMMM"
        return f.string(from: d)
    }
}

private struct FreeDayIdea {
    let r: Recipe
    let last: String?
}

/// "Pe ce zi o muți?": the week's days, the dish's day marked "acum".
private struct MoveDaySheet: View {
    let entry: PlanEntry
    let days: [Date]
    let pick: (Date) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pe ce zi o muți?")
                .font(.custom(AppFont.displaySemibold, size: 22, relativeTo: .title2))
                .foregroundStyle(Theme.text)
                .padding(.bottom, 6)
            ForEach(days, id: \.self) { d in
                let now = RecipeText.dayKey(d) == entry.day
                Button { pick(d) } label: {
                    HStack {
                        Text(Calendar.current.isDateInToday(d) ? "Azi" : RecipeText.dayName(d)).font(.custom(AppFont.bodyBold, size: 16, relativeTo: .body))
                        Text(WeekDayPanelDate.short(d)).font(.custom(AppFont.body, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                        Spacer()
                        if now { Text("acum").font(.custom(AppFont.bodySemibold, size: 13, relativeTo: .caption)).foregroundStyle(Theme.accent) }
                    }
                    .foregroundStyle(Theme.text)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(now)
                .opacity(now ? 0.6 : 1)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
    }
}

private enum WeekDayPanelDate {
    static func short(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "d MMM"
        return f.string(from: d).replacingOccurrences(of: ".", with: "")
    }
}

// MARK: - Hero

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
                    .font(.custom(AppFont.displaySemibold, size: 34, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text([r.category.isEmpty ? nil : r.category, r.servings.map { "\($0) porții" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.ktCallout)
                    .foregroundStyle(Theme.text.opacity(0.85))
                HStack(spacing: 10) {
                    Button { kitchen.cook(r) } label: {
                        HStack(spacing: 8) {
                            ChefHat().stroke(style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)).frame(width: 18, height: 18)
                            Text(slide.primary)
                        }
                    }
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
