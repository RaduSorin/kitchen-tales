import Foundation

/// One line on the shopping list as shown: lines that ask for the same thing are merged, so
/// "2 cepe mari" (one recipe) and "1 ceapă" (another) show as "3 cepe mari". Only on screen: the
/// stored items stay one per recipe line (the web's src/lib/merge.ts, ported one to one).
struct ShoppingRow: Identifiable, Hashable {
    let key: String
    let text: String
    let ids: [String]
    /// Titles of the recipes the row comes from (empty for items typed by hand).
    let sources: [String]
    let checked: Bool
    var id: String { key }
}

enum ShoppingMerge {
    private struct Unit { let key: String; let base: String; let factor: Double; let one: String; let many: String }

    private static let units: [(Set<String>, Unit)] = [
        (["g", "gr", "gram", "grame"], Unit(key: "g", base: "g", factor: 1, one: "g", many: "g")),
        (["kg", "kilogram", "kilograme"], Unit(key: "g", base: "g", factor: 1000, one: "kg", many: "kg")),
        (["ml", "mililitri", "mililitru"], Unit(key: "ml", base: "ml", factor: 1, one: "ml", many: "ml")),
        (["l", "litri", "litru"], Unit(key: "ml", base: "ml", factor: 1000, one: "l", many: "l")),
        (["lingura", "linguri"], Unit(key: "lingura", base: "lingura", factor: 1, one: "lingură", many: "linguri")),
        (["lingurita", "lingurite", "lgt"], Unit(key: "lingurita", base: "lingurita", factor: 1, one: "linguriță", many: "lingurițe")),
        (["cana", "cani"], Unit(key: "cana", base: "cana", factor: 1, one: "cană", many: "căni")),
        (["catel", "catei"], Unit(key: "catel", base: "catel", factor: 1, one: "cățel", many: "căței")),
        (["buc", "bucata", "bucati"], Unit(key: "buc", base: "buc", factor: 1, one: "buc.", many: "buc.")),
        (["legatura", "legaturi"], Unit(key: "legatura", base: "legatura", factor: 1, one: "legătură", many: "legături")),
        (["plic", "plicuri"], Unit(key: "plic", base: "plic", factor: 1, one: "plic", many: "plicuri")),
        (["conserva", "conserve"], Unit(key: "conserva", base: "conserva", factor: 1, one: "conservă", many: "conserve")),
    ]

    /// Words that describe size or state, not what to buy.
    private static let skip: Set<String> = ["mare", "mari", "mic", "mica", "mici", "mediu", "medie", "medii", "mijlociu", "mijlocie", "mijlocii",
        "proaspat", "proaspata", "proaspete", "proaspeti", "tocat", "tocata", "tocate", "tocati", "de", "din", "cu"]
    private static let irregular = ["cepe": "ceapa", "oua": "ou", "mere": "mar", "pere": "para", "lamai": "lamaie", "nuci": "nuca"]
    private static let pluralOf = ["ceapă": "cepe", "ou": "ouă", "măr": "mere", "pară": "pere", "lămâie": "lămâi", "ardei": "ardei"]

    private struct Parsed { let name: String; let nameKey: String; let unit: Unit?; let amount: Double?; let range: Bool }

    private static func stem(_ w: String) -> String {
        var s = irregular[w] ?? w
        for end in ["ii", "ie", "i", "e", "a", "u"] where s.hasSuffix(end) {
            s.removeLast(end.count)
            break
        }
        return s
    }

    private static func parse(_ text: String) -> Parsed {
        let q = RecipeText.parseQuantity(text)
        var rest = (q?.rest ?? text).trimmingCharacters(in: .whitespaces)
        var unit: Unit?
        let first = rest.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
        if q != nil {
            var f = RecipeText.norm(first)
            if f.hasSuffix(".") { f.removeLast() }
            if let u = units.first(where: { $0.0.contains(f) }) {
                unit = u.1
                rest = String(rest.dropFirst(first.count)).trimmingCharacters(in: .whitespaces)
            }
        }
        // Without "(...)" and only up to the first comma: "ceapă (mare), tocată" → "ceapa".
        var core = RecipeText.norm(rest).replacingOccurrences(of: #"\(.*?\)"#, with: " ", options: .regularExpression)
        if let cut = core.firstIndex(where: { $0 == "," || $0 == ";" }) { core = String(core[..<cut]) }
        let words = core.split { !($0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-")) }.map(String.init).filter { !skip.contains($0) }
        return Parsed(name: rest, nameKey: words.map(stem).joined(separator: " "), unit: unit, amount: q?.value, range: q?.max != nil)
    }

    private static func plural(_ name: String) -> String {
        var words = name.split(separator: " ").map(String.init)
        guard let w = words.first else { return name }
        let p: String
        if let known = pluralOf[w.lowercased()] { p = known }
        else if w.hasSuffix("ă") { p = String(w.dropLast()) + "e" }
        else if w.hasSuffix("ie") { p = String(w.dropLast()) + "i" }
        else if let last = w.lowercased().last, !"aeiouăâîi".contains(last) { p = w + "i" }
        else { p = w }
        words[0] = p
        return words.joined(separator: " ")
    }

    private static func amountText(_ total: Double, _ unit: Unit?) -> String {
        guard let unit else { return RecipeText.formatQuantity(total) }
        if unit.base == "g" || unit.base == "ml" {
            let big = unit.base == "g" ? "kg" : "l"
            return total >= 1000 ? "\(RecipeText.formatQuantity(total / 1000)) \(big)" : "\(RecipeText.formatQuantity(total)) \(unit.base)"
        }
        return "\(RecipeText.formatQuantity(total)) \(total > 1 ? unit.many : unit.one)"
    }

    /// Groups lines that ask for the same ingredient, adding up their amounts; keeps the order.
    static func rows(_ lines: [ShoppingLine]) -> [ShoppingRow] {
        var order: [String] = []
        var groups: [String: [(ShoppingLine, Parsed)]] = [:]
        for line in lines {
            let p = parse(line.text)
            // No clear name, or a range ("2-3 căței"): it stays on its own.
            let key = !p.nameKey.isEmpty && !p.range ? "\(p.nameKey)|\(p.amount == nil ? "-" : p.unit?.key ?? "#")" : "id:\(line.id)"
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append((line, p))
        }
        return order.map { key in
            let xs = groups[key] ?? []
            var sources: [String] = []
            for (l, _) in xs { if let t = l.recipeTitle, !t.isEmpty, !sources.contains(t) { sources.append(t) } }
            let ids = xs.map(\.0.id)
            let checked = xs.allSatisfy(\.0.checked)
            guard xs.count > 1, let first = xs.first?.1, first.amount != nil else {
                return ShoppingRow(key: key, text: xs.first?.0.text ?? "", ids: ids, sources: sources, checked: checked)
            }
            let parsed = xs.map(\.1)
            let total = parsed.reduce(0) { $0 + ($1.amount ?? 0) * ($1.unit?.factor ?? 1) }
            let shown = first.unit.map { Unit(key: $0.key, base: $0.base, factor: 1, one: $0.one, many: $0.many) }
            var name = first.name
            if first.unit == nil {
                let many = parsed.first { ($0.amount ?? 0) > 1 }
                name = total > 1 ? (many?.name ?? plural(first.name)) : (parsed.first { $0.amount == 1 }?.name ?? name)
            }
            let text = "\(amountText(total, shown)) \(name)".trimmingCharacters(in: .whitespaces)
            return ShoppingRow(key: key, text: text, ids: ids, sources: sources, checked: checked)
        }
    }
}
