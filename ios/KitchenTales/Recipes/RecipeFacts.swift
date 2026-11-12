import SwiftUI

// A recipe's values per serving and its allergens, like src/lib/diet.ts and
// src/components/RecipeFacts.tsx: estimated by AI from the ingredients the first time the recipe
// is opened, then kept on the row (on this phone for another space's recipe).

struct Nutrition: Hashable, Sendable {
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double?
    var sugar: Double?
    var salt: Double?

    nonisolated static func parse(_ text: String?) -> Nutrition? {
        guard let text, let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kcal = (raw["kcal"] as? NSNumber)?.doubleValue else { return nil }
        let n = { (k: String) in (raw[k] as? NSNumber)?.doubleValue }
        return Nutrition(kcal: kcal, protein: n("protein") ?? 0, carbs: n("carbs") ?? 0, fat: n("fat") ?? 0,
                         fiber: n("fiber"), sugar: n("sugar"), salt: n("salt"))
    }
}

struct AllergenHit: Hashable, Sendable {
    let key: String
    let from: [String]

    nonisolated static func parse(_ text: String?) -> [AllergenHit]? {
        guard let text, let data = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return nil }
        return raw.compactMap { item in
            guard let key = item["key"] as? String, !key.isEmpty else { return nil }
            return AllergenHit(key: key, from: (item["from"] as? [Any])?.compactMap { $0 as? String } ?? [])
        }
    }
}

enum RecipeFactsText {
    /// The short names (DIET_ITEMS.short and OTHER in diet.ts).
    nonisolated static func label(_ key: String) -> String {
        let names = ["lactoza": "lactoză", "nuci": "nuci", "gluten": "gluten", "oua": "ouă", "arahide": "arahide",
                     "peste": "pește", "crustacee": "crustacee", "soia": "soia", "susan": "susan", "telina": "țelină",
                     "mustar": "muștar", "porc": "porc", "carne": "carne", "sulfiti": "sulfiți", "lupin": "lupin", "moluste": "moluște"]
        return names[key] ?? key
    }

    /// The 14 allergens on EU food labels, for "nu conține".
    nonisolated static let euAllergens = ["gluten", "crustacee", "oua", "peste", "arahide", "soia", "lactoza", "nuci",
                                          "telina", "mustar", "susan", "sulfiti", "lupin", "moluste"]

    /// "22 g", "1,8 g" (grams() in diet.ts).
    nonisolated static func grams(_ n: Double?) -> String {
        guard let n else { return "–" }
        if n >= 10 { return "\(Int(n.rounded())) g" }
        let tenth = (n * 10).rounded() / 10
        let text = tenth == tenth.rounded() ? String(Int(tenth)) : String(tenth).replacingOccurrences(of: ".", with: ",")
        return "\(text) g"
    }

    /// What goes against the family's diet, strictest first (conflicts() in diet.ts).
    nonisolated static func conflicts(_ allergens: [AllergenHit]?, _ diet: Diet) -> [(rule: DietRule, from: [String])] {
        guard let allergens else { return [] }
        return diet.avoid.compactMap { rule -> (rule: DietRule, from: [String])? in
            let hits = allergens.filter { $0.key == rule.key || (rule.key == "carne" && ["peste", "crustacee", "moluste", "porc"].contains($0.key)) }
            guard !hits.isEmpty else { return nil }
            var seen = Set<String>()
            return (rule, hits.flatMap(\.from).filter { seen.insert($0).inserted })
        }
        .sorted { $0.rule.strict && !$1.rule.strict }
    }
}

/// On the Ingrediente tab: the values strip (tap: the full card), what clashes with the family's
/// diet, and the allergen chips.
struct RecipeFactsView: View {
    let recipe: Recipe
    @Environment(RecipeStore.self) private var store
    @Environment(ProfileStore.self) private var profile
    @State private var open = LaunchOptions.screen == "recipe-facts"
    @State private var busy = false

    var body: some View {
        let facts = store.facts(recipe)
        let diet = profile.settings.diet
        VStack(alignment: .leading, spacing: 12) {
            if let n = facts.nutrition {
                Button { open = true } label: { strip(n) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Valori nutriționale pe porție, deschide fișa")
                Text("pe porție\(recipe.servings.map { ", din \($0)" } ?? "") · atinge pentru detalii")
                    .font(.custom(AppFont.body, size: 12.5, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, -4)
                clashes(facts.allergens, diet)
                allergens(facts.allergens, diet)
            } else if busy {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Calculez valorile nutriționale…").font(.ktCallout).foregroundStyle(Theme.muted)
                }
            }
        }
        .task(id: recipe.id) {
            guard facts.nutrition == nil, !recipe.ingredients.isEmpty else { return }
            busy = true
            await store.analyze(recipe)
            busy = false
        }
        .sheet(isPresented: $open) {
            if let n = facts.nutrition {
                NutritionSheet(recipe: recipe, nutrition: n, allergens: facts.allergens ?? [],
                               clashKeys: Set(RecipeFactsText.conflicts(facts.allergens, diet).map { $0.rule.key }))
            }
        }
    }

    private func strip(_ n: Nutrition) -> some View {
        HStack(spacing: 0) {
            cell("\(Int(n.kcal.rounded()))", "kcal")
            divider
            cell(RecipeFactsText.grams(n.protein), "proteine")
            divider
            cell(RecipeFactsText.grams(n.carbs), "carbohidrați")
            divider
            cell(RecipeFactsText.grams(n.fat), "grăsimi")
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.08)))
    }

    private var divider: some View { Rectangle().fill(.white.opacity(0.08)).frame(width: 1, height: 34) }

    private func cell(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.custom(AppFont.bodyBold, size: 18, relativeTo: .headline)).monospacedDigit()
                .foregroundStyle(Theme.text)
            Text(label).font(.custom(AppFont.bodySemibold, size: 12.5, relativeTo: .caption)).foregroundStyle(Theme.muted)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func clashes(_ allergens: [AllergenHit]?, _ diet: Diet) -> some View {
        let list = RecipeFactsText.conflicts(allergens, diet)
        if let first = list.first {
            let strict = first.rule.strict
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(strict ? Color(hex: 0xFFB08A) : Theme.accent)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(strict ? Color(hex: 0xFF9B6E).opacity(0.18) : Theme.accent.opacity(0.16)))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Conține \(list.map { RecipeFactsText.label($0.rule.key) }.joined(separator: ", "))")
                        .font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                    Text(list.map { c in
                        "\(c.rule.strict ? "Alergie" : "Evitați")\(c.rule.who.map { " (\($0))" } ?? ""): \(RecipeFactsText.label(c.rule.key))\(c.from.isEmpty ? "" : ", din \(c.from.joined(separator: ", "))")."
                    }.joined(separator: " "))
                    .font(.ktCallout).foregroundStyle(Color(hex: 0xD9CFC4))
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(strict ? Color(hex: 0xFF9B6E).opacity(0.1) : Theme.accent.opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(strict ? Color(hex: 0xFF9B6E).opacity(0.4) : Theme.accent.opacity(0.3)))
        }
    }

    @ViewBuilder private func allergens(_ allergens: [AllergenHit]?, _ diet: Diet) -> some View {
        let list = allergens ?? []
        let clash = RecipeFactsText.conflicts(allergens, diet)
        if !list.isEmpty || !diet.avoid.isEmpty {
            FlowLayout(spacing: 6) {
                Text("Alergeni:").font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                    .frame(height: 28)
                if list.isEmpty {
                    chip("niciunul din cei 14", kind: .ok)
                } else {
                    ForEach(list, id: \.key) { a in
                        let hit = clash.contains { $0.rule.key == a.key || $0.from.contains { a.from.contains($0) } }
                        chip(RecipeFactsText.label(a.key), kind: hit ? .clash : .plain)
                    }
                }
                ForEach(diet.avoid.filter { r in !clash.contains { $0.rule.key == r.key } }, id: \.key) { r in
                    chip("fără \(RecipeFactsText.label(r.key))", kind: .ok)
                }
            }
        }
    }

    private enum ChipKind { case plain, clash, ok }

    private func chip(_ text: String, kind: ChipKind) -> some View {
        HStack(spacing: 4) {
            if kind == .ok { Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)) }
            Text(text)
        }
        .font(.custom(kind == .plain ? AppFont.bodySemibold : AppFont.bodyBold, size: 14, relativeTo: .subheadline))
        .foregroundStyle(kind == .clash ? Color(hex: 0xFFB08A) : kind == .ok ? Color(hex: 0x9FD3B4) : Theme.text)
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(Capsule().fill(kind == .clash ? Color(hex: 0xFF9B6E).opacity(0.16) : kind == .ok ? Color(hex: 0x8FC4A6).opacity(0.14) : Theme.surface2))
    }
}

/// "Valori nutriționale": a ring of the macros, fibre, sugar, salt and the allergen list.
private struct NutritionSheet: View {
    let recipe: Recipe
    let nutrition: Nutrition
    let allergens: [AllergenHit]
    let clashKeys: Set<String>
    @State private var whole = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let k = whole ? Double(recipe.servings ?? 1) : 1
        let n = nutrition
        let total = max(1, n.protein * 4 + n.carbs * 4 + n.fat * 9)
        let parts = [(n.protein * 4 / total, Theme.accent), (n.carbs * 4 / total, Color(hex: 0xE08A5A)), (n.fat * 9 / total, Color(hex: 0x8FB6E0))]
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let s = recipe.servings, s > 1 {
                        Picker("Cât arătăm", selection: $whole) {
                            Text("O porție").tag(false)
                            Text("Toată rețeta (\(s))").tag(true)
                        }
                        .pickerStyle(.segmented)
                    }
                    HStack(spacing: 18) {
                        ZStack {
                            Circle().stroke(Theme.surface2, lineWidth: 15)
                            ForEach(0..<3, id: \.self) { i in
                                let start = parts[..<i].reduce(0) { $0 + $1.0 }
                                Circle().trim(from: start, to: start + parts[i].0)
                                    .stroke(parts[i].1, lineWidth: 15)
                                    .rotationEffect(.degrees(-90))
                            }
                            VStack(spacing: 0) {
                                Text("\(Int((n.kcal * k).rounded()))").font(.custom(AppFont.display, size: 28, relativeTo: .title))
                                Text("kcal").font(.custom(AppFont.bodyBold, size: 12.5, relativeTo: .caption)).foregroundStyle(Theme.muted)
                            }
                        }
                        .frame(width: 128, height: 128)
                        VStack(alignment: .leading, spacing: 10) {
                            macro("Proteine", n.protein * k, parts[0].1)
                            macro("Carbohidrați", n.carbs * k, parts[1].1)
                            macro("Grăsimi", n.fat * k, parts[2].1)
                        }
                    }
                    HStack(spacing: 8) {
                        more("Fibre", n.fiber.map { $0 * k })
                        more("Zaharuri", n.sugar.map { $0 * k })
                        more("Sare", n.salt.map { $0 * k })
                    }
                    Text("ALERGENI").font(.ktLabel).tracking(1.2).foregroundStyle(Theme.accent).padding(.top, 2)
                    VStack(spacing: 0) {
                        ForEach(allergens, id: \.key) { a in
                            row(RecipeFactsText.label(a.key), a.from.joined(separator: ", "), "conține", clash: clashKeys.contains(a.key))
                        }
                        let absent = RecipeFactsText.euAllergens.filter { k in !allergens.contains { $0.key == k } }
                        if !absent.isEmpty {
                            row(absent.prefix(4).map(RecipeFactsText.label).joined(separator: ", ") + (absent.count > 4 ? " și încă \(absent.count - 4)" : ""),
                                "", "nu conține", clash: false, faint: true)
                        }
                    }
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.05)))
                    Text("Estimate din ingrediente. La o alergie severă, verifică și eticheta produselor.")
                        .font(.ktFootnote).foregroundStyle(Theme.muted)
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Valori nutriționale")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Gata") { dismiss() } } }
        }
        .presentationDetents([.large])
    }

    private func macro(_ name: String, _ value: Double, _ color: Color) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 10, height: 10)
            Text(name).font(.ktCallout).foregroundStyle(Theme.text)
            Spacer()
            Text(RecipeFactsText.grams(value)).font(.ktBodyEmphasis).monospacedDigit().foregroundStyle(Theme.text)
        }
    }

    private func more(_ name: String, _ value: Double?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name).font(.custom(AppFont.bodySemibold, size: 12.5, relativeTo: .caption)).foregroundStyle(Theme.muted)
            Text(RecipeFactsText.grams(value)).font(.ktBodyEmphasis).foregroundStyle(Theme.text)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.05)))
    }

    private func row(_ title: String, _ detail: String, _ state: String, clash: Bool, faint: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.ktCallout).foregroundStyle(clash ? Color(hex: 0xFFB08A) : faint ? Theme.muted : Theme.text)
                if !detail.isEmpty { Text(detail).font(.ktCaption).foregroundStyle(Theme.muted) }
            }
            Spacer()
            Text(state).font(.custom(AppFont.bodyBold, size: 14, relativeTo: .subheadline))
                .foregroundStyle(faint ? Theme.muted : clash ? Color(hex: 0xFFB08A) : Theme.text)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 0.5) }
    }
}
