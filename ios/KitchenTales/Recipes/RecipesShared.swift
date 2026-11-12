import SwiftUI

/// The recipes side's state shared by its tabs: the tab showing, the recipe being cooked
/// (full screen over every tab) and a short message at the bottom ("Am pus 6 ingrediente în listă").
@MainActor @Observable
final class KitchenModel {
    var tab: AppTab = LaunchOptions.tab.flatMap(AppTab.init(rawValue:)) ?? .home
    var cooking: CookSession?
    /// A recipe Spotlight or a Shortcut asked to open (the Rețete tab shows it).
    var openRecipe: String?
    private(set) var toast: String?
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    func cook(_ recipe: Recipe, servings: Int? = nil) {
        Haptics.tap()
        cooking = CookSession(recipe: recipe, servings: servings ?? recipe.servings)
    }

    func say(_ text: String) {
        toastTask?.cancel()
        withAnimation(.snappy) { toast = text }
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.6))
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) { self?.toast = nil }
        }
    }
}

struct CookSession: Identifiable, Hashable {
    let recipe: Recipe
    let servings: Int?
    var id: String { recipe.id }
}

/// Places inside the recipes navigation stacks.
enum RecipeRoute: Hashable {
    case recipe(String)
    case category(String)
}

extension View {
    /// The destinations every recipes stack can open.
    func recipeDestinations() -> some View {
        navigationDestination(for: RecipeRoute.self) { route in
            switch route {
            case .recipe(let id): RecipeDetailView(recipeId: id)
            case .category(let name): RecipeListView(category: name)
            }
        }
    }

    /// The short message at the bottom of the recipes side.
    func kitchenToast() -> some View { modifier(KitchenToast()) }
}

private struct KitchenToast: ViewModifier {
    @Environment(KitchenModel.self) private var kitchen

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let text = kitchen.toast {
                Text(text)
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.text)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.12)))
                    .padding(.bottom, 100)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }
}

/// "În săptămână": today, tomorrow and the other days of this week and the next.
struct PlanDayMenu<MenuLabel: View>: View {
    let recipe: Recipe
    var servings: Int?
    @ViewBuilder let label: () -> MenuLabel
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen

    var body: some View {
        Menu {
            ForEach(Self.days(), id: \.self) { day in
                Button(Self.label(day)) { plan(day) }
            }
        } label: {
            label()
        }
    }

    private func plan(_ day: Date) {
        Task {
            if await store.planRecipe(recipe, on: day, servings: servings) {
                Haptics.success()
                kitchen.say("Pusă în plan: \(Self.label(day).lowercased())")
            } else {
                Haptics.warning()
                kitchen.say("Nu am putut pune în plan. Verifică internetul.")
            }
        }
    }

    /// Today and the next 7 days.
    static func days(from now: Date = Date()) -> [Date] {
        let start = Calendar.current.startOfDay(for: now)
        return (0..<8).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
    }

    static func label(_ day: Date) -> String {
        if Calendar.current.isDateInToday(day) { return "Azi" }
        if Calendar.current.isDateInTomorrow(day) { return "Mâine" }
        return RecipeText.dayName(day)
    }
}

extension View {
    /// Long press on a recipe: cook, plan, shopping list, favourite, share.
    func recipeContextMenu(_ recipe: Recipe) -> some View { modifier(RecipeContextMenu(recipe: recipe)) }
}

private struct RecipeContextMenu: ViewModifier {
    let recipe: Recipe
    @Environment(RecipeStore.self) private var store
    @Environment(KitchenModel.self) private var kitchen

    func body(content: Content) -> some View {
        content.contextMenu {
            Button { kitchen.cook(recipe) } label: { Label("Gătește pas cu pas", systemImage: "play.fill") }
            PlanDayMenu(recipe: recipe) { Label("Pune în săptămână", systemImage: "calendar.badge.plus") }
            Button { addToList() } label: { Label("Pune în listă", systemImage: "cart.badge.plus") }
            let favorite = store.isFavorite(recipe.id)
            Button { Task { await store.toggleFavorite(recipe.id) } } label: {
                Label(favorite ? "Scoate din favorite" : "Pune la favorite", systemImage: favorite ? "heart.slash" : "heart")
            }
            ShareLink(item: RecipeShare.text(recipe)) { Label("Partajează", systemImage: "square.and.arrow.up") }
        } preview: {
            RecipePhoto(recipe: recipe, cornerRadius: 0)
                .frame(width: 300, height: 220)
                .environment(store)
        }
    }

    private func addToList() {
        Task {
            if let added = await store.addToShopping(recipe) {
                Haptics.success()
                kitchen.say(added == 0 ? "Sunt deja în listă" : "Am pus \(added) ingrediente în listă")
            } else {
                Haptics.warning()
                kitchen.say("Nu am putut pune în listă. Verifică internetul.")
            }
        }
    }
}

/// The recipe as text, for Messages, WhatsApp or Notes.
enum RecipeShare {
    static func text(_ r: Recipe) -> String {
        var parts = [r.title]
        if !r.detailLine.isEmpty { parts.append(r.detailLine) }
        if !r.ingredients.isEmpty { parts.append("Ingrediente:\n" + r.ingredients.map { "• \($0)" }.joined(separator: "\n")) }
        if !r.steps.isEmpty { parts.append("Pași:\n" + r.steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")) }
        return parts.joined(separator: "\n\n")
    }
}

/// A section title with an optional gold link on the right ("Azi în meniu · Săptămâna").
struct ShelfHeader: View {
    let title: String
    var link: String?
    var action: () -> Void = {}

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.ktTitle2).foregroundStyle(Theme.text)
            Spacer()
            if let link {
                Button(link, action: action)
                    .font(.custom(AppFont.bodySemibold, size: 15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.accent)
            }
        }
        .padding(.horizontal, 20)
    }
}
