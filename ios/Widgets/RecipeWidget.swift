import AppIntents
import SwiftUI
import WidgetKit

/// "Ce gătim azi": today's plan from Săptămâna (and tomorrow's), or an idea when nothing is planned.
struct TodayRecipeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKinds.recipe, provider: KitchenProvider()) { entry in
            TodayRecipeView(entry: entry)
        }
        .configurationDisplayName("Ce gătim azi")
        .description("Ce e azi în plan și ce urmează mâine, sau o idee când nu e nimic.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
        .contentMarginsDisabled()
    }
}

struct TodayRecipeView: View {
    let entry: KitchenEntry
    @Environment(\.widgetFamily) private var family

    private var s: WidgetSnapshot { entry.snapshot }
    private var today: WidgetSnapshot.RecipeItem? { WidgetRules.today(s, now: entry.date).first }
    private var idea: WidgetSnapshot.RecipeItem? { WidgetRules.idea(s, round: entry.ideaRound) }

    private var link: URL? {
        if let today { return WLinks.recipe(today.id) }
        if let idea { return WLinks.recipe(idea.id) }
        return WLinks.week
    }

    var body: some View {
        content
            .widgetURL(link)
            .containerBackground(for: .widget) {
                if family == .systemSmall || family == .systemMedium { WGlow() } else { AccessoryWidgetBackground() }
            }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryRectangular: TodayRectangular(recipe: today)
        case .accessoryInline: Text(today.map { "Azi: \($0.title)" } ?? "Azi: nimic în plan")
        default:
            if !s.signedIn {
                WOpenApp(text: "Deschide aplicația ca să apară ce gătiți azi.")
            } else if let today {
                if family == .systemMedium {
                    TodayMedium(recipe: today, tomorrow: WidgetRules.tomorrow(s, now: entry.date).first?.title)
                } else {
                    RecipeSmall(recipe: today, kicker: WidgetRules.todayKicker(today))
                }
            } else if let idea {
                if family == .systemMedium { IdeaMedium(idea: idea) } else { RecipeSmall(recipe: idea, kicker: "O idee") }
            } else {
                WOpenApp(text: "Nimic în plan azi. Alege ceva în Săptămâna.")
            }
        }
    }
}

/// Small: the whole photo with the title on it, or the "Etichetă" label without a photo.
private struct RecipeSmall: View {
    let recipe: WidgetSnapshot.RecipeItem
    let kicker: String

    var body: some View {
        if WPhoto.exists(recipe.image) {
            ZStack(alignment: .bottomLeading) {
                WPhoto(name: recipe.image)
                WScrim()
                VStack(alignment: .leading, spacing: 4) {
                    WKicker(text: kicker)
                    Text(recipe.title)
                        .font(WFont.serif(17))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                }
                .padding(13)
            }
        } else {
            WRecipeTag(title: recipe.title, category: recipe.category)
        }
    }
}

/// Medium: the photo on the left, "Azi în plan", the title, time and portions, tomorrow's dish.
private struct TodayMedium: View {
    let recipe: WidgetSnapshot.RecipeItem
    let tomorrow: String?

    var body: some View {
        HStack(spacing: 0) {
            Group {
                if WPhoto.exists(recipe.image) {
                    WPhoto(name: recipe.image)
                } else {
                    WRecipeTag(title: recipe.title, category: recipe.category, size: 14)
                }
            }
            .frame(width: 150)
            .overlay(alignment: .trailing) {
                LinearGradient(colors: [.clear, Theme.background], startPoint: .leading, endPoint: .trailing).frame(width: 24)
            }
            VStack(alignment: .leading, spacing: 0) {
                WKicker(text: "Azi în plan")
                Text(recipe.title)
                    .font(WFont.serif(19))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 6)
                if !recipe.meta.isEmpty {
                    Text(recipe.meta)
                        .font(WFont.text(12.5))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .padding(.top, 3)
                }
                Spacer(minLength: 6)
                if let tomorrow {
                    (Text("Mâine: ").foregroundStyle(Theme.muted) + Text(tomorrow).foregroundStyle(Theme.text))
                        .font(WFont.semibold(13))
                        .lineLimit(1)
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 14)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Medium, nothing planned: an idea from "Idei pentru azi", "Pune azi în plan" and "Altă idee".
private struct IdeaMedium: View {
    let idea: WidgetSnapshot.RecipeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    WKicker(text: "Nimic în plan azi", color: Theme.muted)
                    Text("O idee")
                        .font(WFont.semibold(12.5))
                        .foregroundStyle(Theme.accent)
                        .padding(.top, 8)
                    Text(idea.title)
                        .font(WFont.serif(19))
                        .foregroundStyle(Theme.text)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .padding(.top, 2)
                    Text(WidgetRules.ideaLine(idea))
                        .font(WFont.text(12.5))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .padding(.top, 3)
                }
                Spacer(minLength: 0)
                if WPhoto.exists(idea.image) {
                    WPhoto(name: idea.image)
                        .frame(width: 62, height: 62)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            Spacer(minLength: 6)
            HStack {
                Button(intent: PlanTodayIntent(recipeId: idea.id)) {
                    Text("Pune azi în plan").font(WFont.semibold(13.5)).foregroundStyle(Theme.accent)
                }
                .buttonStyle(.plain)
                Spacer()
                Button(intent: NextIdeaIntent()) {
                    Text("Altă idee").font(WFont.semibold(13.5)).foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
    }
}

/// Lock Screen: "Azi gătim / Ciorbă de perișoare / 1 h 30".
private struct TodayRectangular: View {
    let recipe: WidgetSnapshot.RecipeItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Azi gătim").font(.headline)
            Text(recipe?.title ?? "Nimic în plan").lineLimit(1)
            if let minutes = recipe?.minutes { Text(minutes).foregroundStyle(.secondary) }
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .widgetAccentable()
    }
}

/// "7 de luat": what is left on the shopping list, round on the Lock Screen.
struct ShoppingLeftWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetKinds.list, provider: KitchenProvider()) { entry in
            VStack(spacing: 0) {
                Text("\(entry.snapshot.shoppingLeft)")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.6)
                Text("de luat").font(.system(size: 10, weight: .semibold))
            }
            .widgetAccentable()
            .widgetURL(WLinks.list)
            .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        }
        .configurationDisplayName("Lista de cumpărături")
        .description("Câte lucruri mai ai de luat.")
        .supportedFamilies([.accessoryCircular])
    }
}
