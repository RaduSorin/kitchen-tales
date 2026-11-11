import Foundation

/// The editor's text rules, ported from the web (RecipeEdit.tsx, parseRecipe.ts,
/// spokenIngredients.ts, videoSite.ts and diet.ts), so a recipe comes out the same on both.
enum EditorText {
    /// The categories offered under "Categorie" (any other text is allowed too).
    static let categories = ["Ciorbe și supe", "Feluri principale", "Garnituri", "Salate", "Deserturi", "Mic dejun", "Pentru copii"]

    /// Photos of one recipe read together: a book's two pages, both sides of a note.
    static let maxPages = 4

    // MARK: Links

    /// The pasted text when it is one web address and nothing else ("www.x.ro/a" gets https://).
    static func asLink(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: #"^https?://\S+$"#, options: [.regularExpression, .caseInsensitive]) != nil { return t }
        if t.range(of: #"^(www\.)?[\w-]+(\.[\w-]+)+/\S*$"#, options: [.regularExpression, .caseInsensitive]) != nil,
           !t.contains(where: \.isWhitespace) {
            return "https://\(t)"
        }
        return nil
    }

    /// "YouTube", "TikTok" or "Instagram" for a link to one of them.
    static func videoSite(_ link: String) -> String? {
        guard let host = URL(string: link)?.host?.lowercased() else { return nil }
        func on(_ domains: [String]) -> Bool { domains.contains { host == $0 || host.hasSuffix("." + $0) } }
        if on(["youtube.com", "youtu.be"]) { return "YouTube" }
        if on(["tiktok.com"]) { return "TikTok" }
        if on(["instagram.com", "instagr.am"]) { return "Instagram" }
        return nil
    }

    // MARK: Pasted text

    /// Splits pasted text with "Ingrediente" / "Mod de preparare" style headings (RO + EN).
    static func parseRecipe(_ text: String) -> (title: String, ingredients: [String], steps: [String]) {
        var lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let title = lines.isEmpty ? "" : lines.removeFirst()
        var ingredients: [String] = []
        var steps: [String] = []
        enum Part { case ingredients, steps }
        var part: Part?
        func clean(_ l: String) -> String {
            l.replacingOccurrences(of: #"^([-*•·]|\d+[.)])\s*"#, with: "", options: .regularExpression)
        }
        func starts(_ l: String, _ pattern: String) -> Bool {
            l.range(of: "^(\(pattern))(?![\\p{L}\\d_])", options: [.regularExpression, .caseInsensitive]) != nil
        }
        for l in lines {
            if starts(l, "ingrediente|ingredients") { part = .ingredients; continue }
            if starts(l, "mod de preparare|preparare|instruc[tț]iuni|pa[sș]i|method|directions|instructions|steps") { part = .steps; continue }
            switch part {
            case .ingredients: ingredients.append(clean(l))
            case .steps: steps.append(clean(l))
            case nil:
                if l.range(of: #"^[-*•·]"#, options: .regularExpression) != nil { ingredients.append(clean(l)) } else { steps.append(clean(l)) }
            }
        }
        return (title, ingredients, steps)
    }

    /// "Am găsit 8 ingrediente și 6 pași. Verifică și salvează." (or how many have no amount).
    static func foundLine(ingredients: [String], steps: Int) -> String {
        let vague = ingredients.filter { RecipeText.parseQuantity($0) == nil }.count
        let head = "Am găsit \(ingredients.count) ingrediente și \(steps) pași."
        if vague == 0 { return head + " Verifică și salvează." }
        return head + (vague == 1 ? " Un ingredient nu are" : " \(vague) ingrediente nu au") + " cantitate, verifică-le."
    }

    /// Lines of a text box, trimmed, empty ones left out.
    static func lines(_ text: String) -> [String] {
        text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    /// The AI brief for an idea picked from "Propune rețete".
    static func ideaBrief(_ idea: RecipeIdea, fridge: String) -> String {
        let desc = idea.description.map { " (\($0))" } ?? ""
        let missing = idea.missing.isEmpty ? "." : ", iar pot cumpăra: \(idea.missing.joined(separator: ", "))."
        return "\(idea.title)\(desc). Folosește ce am în frigider: \(fridge.trimmingCharacters(in: .whitespacesAndNewlines)). "
            + "Pe lângă asta am doar sare, piper, ulei, apă, zahăr și făină" + missing
    }

    // MARK: Dictated ingredients

    private static let small: [String: String] = [
        "un": "1", "o": "1", "una": "1", "unu": "1", "doi": "2", "două": "2", "doua": "2", "trei": "3", "patru": "4", "cinci": "5",
        "șase": "6", "sase": "6", "șapte": "7", "sapte": "7", "opt": "8", "nouă": "9", "noua": "9", "zece": "10",
        "jumătate": "½", "jumatate": "½", "sfert": "¼",
    ]

    private static func unit(_ words: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: #"^(?:de\s+)?("# + words + #")\.?(?=\s|$)(?:\s+de(?=\s|$))?"#, options: .caseInsensitive)
    }

    nonisolated(unsafe) private static let units: [(NSRegularExpression, String?)] = [
        (unit("grame|gram|gr|g"), "g"),
        (unit("kilograme|kilogram|kilo|kile|kg"), "kg"),
        (unit("mililitri|mililitru|ml"), "ml"),
        (unit("litri|litru|l"), "l"),
        (unit("linguri|lingură|lingura|lingurițe|linguriță|lingurite|lingurita|căni|cană|cana|pahare|pahar|plicuri|plic|bucăți|bucată|bucati|bucata|fire|fir|căței|cățel|catei|catel|legături|legătură|praf|vârf de cuțit|varf de cutit"), nil),
    ]

    /// One dictated phrase split into ingredients: on commas, semicolons, "apoi", or where a new amount starts.
    static func splitSpoken(_ phrase: String) -> [String] {
        let pattern = #"[;]|,(?!\d)|\.(?!\d)|\s+(?:și\s+)?apoi\s+|(?<=\p{L})\s+(?=\d)"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [phrase] }
        let ns = phrase as NSString
        var parts: [String] = []
        var last = 0
        for m in re.matches(in: phrase, range: NSRange(location: 0, length: ns.length)) {
            parts.append(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
            last = m.range.location + m.range.length
        }
        parts.append(ns.substring(from: last))
        return parts.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    /// Number words to digits, units shortened, no trailing dot, lower case first letter.
    static func cleanSpokenIngredient(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: #"[.!?]+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        guard !s.isEmpty else { return "" }
        let words = s.split(separator: " ").map(String.init)
        if let first = words.first, let n = small[first.lowercased()], words.count > 1 {
            let rest = words.dropFirst().joined(separator: " ")
            if let h = rest.range(of: #"^(sute|sută|suta)(?=\s|$)\s*"#, options: [.regularExpression, .caseInsensitive]), let v = Int(n) {
                s = "\(v * 100) \(rest[h.upperBound...])"
            } else if rest.range(of: #"^sfert(?=\s|$)"#, options: [.regularExpression, .caseInsensitive]) != nil {
                let tail = rest.replacingOccurrences(of: #"^sfert\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
                    .replacingOccurrences(of: #"^de\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
                s = "¼ \(tail)"
            } else if n == "½" {
                s = "½ " + rest.replacingOccurrences(of: #"^de\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
            } else {
                s = "\(n) \(rest)"
            }
        }
        let ns = s as NSString
        if let amount = try? NSRegularExpression(pattern: #"^(\d+(?:[.,]\d+)?(?:\s*[¼½¾])?|[¼½¾])\s*(.*)$"#),
           let m = amount.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) {
            let number = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
            var rest = ns.substring(with: m.range(at: 2))
            for (re, short) in units {
                let rns = rest as NSString
                if let u = re.firstMatch(in: rest, range: NSRange(location: 0, length: rns.length)) {
                    let word = short ?? rns.substring(with: u.range(at: 1))
                    let after = rns.substring(from: u.range.location + u.range.length).trimmingCharacters(in: .whitespaces)
                    rest = "\(word) \(after)".trimmingCharacters(in: .whitespaces)
                    break
                }
            }
            rest = rest.replacingOccurrences(of: #"^de\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
            s = "\(number) \(rest)".trimmingCharacters(in: .whitespaces)
        }
        return s.prefix(1).lowercased() + s.dropFirst()
    }

    /// All ingredient lines from the dictated phrases (one phrase per pause).
    static func spokenIngredientLines(_ segments: [String]) -> [String] {
        segments.flatMap(splitSpoken).map(cleanSpokenIngredient).filter { !$0.isEmpty }
    }

    // MARK: Diet (src/lib/diet.ts)

    private static let dietWords: [String: (label: String, short: String)] = [
        "lactoza": ("lactoză", "lactoză"), "nuci": ("nuci", "nuci"), "gluten": ("gluten", "gluten"), "oua": ("ouă", "ouă"),
        "arahide": ("arahide", "arahide"), "peste": ("pește", "pește"), "crustacee": ("crustacee", "crustacee"), "soia": ("soia", "soia"),
        "susan": ("susan", "susan"), "telina": ("țelină", "țelină"), "mustar": ("muștar", "muștar"),
        "porc": ("carne de porc", "porc"), "carne": ("carne (vegetarian)", "carne"),
    ]

    static func hasDiet(_ d: Diet) -> Bool { !d.avoid.isEmpty || !d.dislikes.trimmingCharacters(in: .whitespaces).isEmpty }

    /// The diet in words, for the AI ("alergie, nu apar deloc: nuci (Ana); nu ne plac: ciuperci").
    static func dietText(_ d: Diet) -> String {
        func item(_ r: DietRule) -> String {
            let who = r.who?.trimmingCharacters(in: .whitespaces) ?? ""
            return (dietWords[r.key]?.label ?? r.key) + (who.isEmpty ? "" : " (\(who))")
        }
        let strict = d.avoid.filter(\.strict).map(item)
        let soft = d.avoid.filter { !$0.strict }.map(item)
        let dislikes = d.dislikes.trimmingCharacters(in: .whitespaces)
        return [strict.isEmpty ? "" : "alergie, nu apar deloc: \(strict.joined(separator: ", "))",
                soft.isEmpty ? "" : "evităm, înlocuiește: \(soft.joined(separator: ", "))",
                dislikes.isEmpty ? "" : "nu ne plac: \(dislikes)"].filter { !$0.isEmpty }.joined(separator: "; ")
    }

    /// The line above the AI options: "fără nuci (alergie, Ana) · fără ciuperci, ficat".
    static func dietRow(_ d: Diet) -> String {
        let rules = d.avoid.map { r -> String in
            let extra = [r.strict ? "alergie" : "", r.who?.trimmingCharacters(in: .whitespaces) ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
            return "fără \(dietWords[r.key]?.short ?? r.key)" + (extra.isEmpty ? "" : " (\(extra))")
        }.joined(separator: " · ")
        let dislikes = d.dislikes.trimmingCharacters(in: .whitespaces)
        return [rules, dislikes.isEmpty ? "" : "fără \(dislikes)"].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// What the import job returns (ImportedRecipe in amplify/data/resource.ts).
struct ImportedRecipe: Equatable, Sendable {
    var title: String
    var category: String?
    var servings: Int?
    var minutes: Int?
    var ingredients: [String]
    var steps: [String]
    var notes: String?
    var sourceUrl: String?
    var photoKey: String?
    var nutrition: String?
    var allergens: String?

    init?(json: [String: Any]?) {
        guard let json, let title = json["title"] as? String, !title.isEmpty else { return nil }
        func text(_ k: String) -> String? { (json[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        func list(_ k: String) -> [String] { (json[k] as? [Any] ?? []).compactMap { ($0 as? String).flatMap { $0.isEmpty ? nil : $0 } } }
        self.title = title
        category = text("category"); notes = text("notes"); sourceUrl = text("sourceUrl"); photoKey = text("photoKey")
        nutrition = text("nutrition"); allergens = text("allergens")
        servings = (json["servings"] as? NSNumber)?.intValue
        minutes = (json["minutes"] as? NSNumber)?.intValue
        ingredients = list("ingredients"); steps = list("steps")
    }
}

/// A dish "Propune rețete" offers from what is in the fridge.
struct RecipeIdea: Identifiable, Equatable, Sendable {
    var title: String
    var description: String?
    var tools: [String]
    var missing: [String]
    var minutes: Int?
    var kcal: Int?
    var swaps: [String]
    var id: String { title }

    init(title: String, description: String? = nil, tools: [String] = [], missing: [String] = [], minutes: Int? = nil, kcal: Int? = nil, swaps: [String] = []) {
        self.title = title; self.description = description; self.tools = tools; self.missing = missing
        self.minutes = minutes; self.kcal = kcal; self.swaps = swaps
    }

    init?(json: Any) {
        guard let json = json as? [String: Any], let title = json["title"] as? String, !title.isEmpty else { return nil }
        func list(_ k: String) -> [String] { (json[k] as? [Any] ?? []).compactMap { ($0 as? String).flatMap { $0.isEmpty ? nil : $0 } } }
        self.init(title: title, description: (json["description"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                  tools: list("tools"), missing: list("missing"), minutes: (json["minutes"] as? NSNumber)?.intValue,
                  kcal: (json["kcal"] as? NSNumber)?.intValue, swaps: list("swaps"))
    }
}
