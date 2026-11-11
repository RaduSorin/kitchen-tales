import Foundation

/// Which shop aisle a shopping line belongs to, from its words (src/lib/aisles.ts, offline, no
/// AI): "2 piepți de pui" → Carne și pește. The aisles come in the order you walk a supermarket.
enum ShoppingAisles {
    static let aisles: [(key: String, name: String)] = [("produce", "Legume și fructe"), ("bakery", "Pâine și panificație"), ("meat", "Carne și pește"), ("dairy", "Lactate și ouă"), ("frozen", "Congelate"), ("pantry", "Băcănie"), ("spices", "Condimente și sosuri"), ("sweets", "Dulciuri și gustări"), ("drinks", "Băuturi"), ("home", "Casă și igienă"), ("other", "Altele")]
    static let words: [(String, [String])] = [
        ("produce", ["suc de la", "suc de lamai", "suc de lime", "zeama de lamai", "coaja de lamai", "coaja de portocal"]),
        ("pantry", ["lapte de cocos", "lapte condensat", "lapte praf", "rosii decojite", "rosii in bulion", "rosii la conserva", "porumb la conserva", "fasole la conserva"]),
        ("home", ["detergent", "sapun", "sampon", "hartie igienica", "servet", "prosop de hartie", "burete", "saci de gunoi", "pasta de dinti", "scutec", "folie", "hartie de copt", "lavete", "balsam de rufe", "solutie"]),
        ("frozen", ["congelat", "inghetat", "mazare congelata", "pizza congelata"]),
        ("drinks", ["apa minerala", "apa plata", "suc", "bere", "vin ", "vin rosu", "vin alb", "cafea", "ceai", "cola", "limonada", "sirop"]),
        ("spices", ["sare", "piper", "boia", "oregano", "cimbru", "busuioc uscat", "rozmarin uscat", "scortisoara", "curry", "chimen", "nucsoara", "dafin", "vegeta", "condiment", "ketchup", "mustar", "maioneza", "sos de soia", "sos soia", "otet", "bulion", "pasta de tomate", "sos de rosii", "pesto", "cub de", "supa la plic", "ghimbir macinat", "turmeric", "paprika", "chili", "esenta", "vanilie", "drojdie", "praf de copt", "bicarbonat"]),
        ("sweets", ["ciocolat", "biscuit", "napolitan", "bomboan", "chips", "covrig", "gem", "dulceata", "miere", "nutella", "cacao", "frisca spray", "inghetata"]),
        ("dairy", ["lapte", "smantana", "iaurt", "branza", "telemea", "cascaval", "mozzarella", "parmezan", "ricotta", "mascarpone", "cheddar", "feta", "unt", "frisca", "kefir", "sana", "ou", "oua", "cas ", "urda", "crema de branza", "philadelphia"]),
        ("meat", ["pui", "piept", "pulp", "aripi", "carne", "tocatura", "porc", "vita", "vitel", "miel", "curcan", "rata", "ficat", "mici", "carnat", "carnati", "crenvurst", "sunca", "bacon", "kaizer", "salam", "costita", "muschi", "cotlet", "snitel", "peste", "somon", "ton proaspat", "pastrav", "cod", "hering", "macrou", "creveti", "fructe de mare", "midii", "calamar"]),
        ("bakery", ["paine", "chifl", "bagheta", "lipie", "tortilla", "franzela", "cozonac", "croissant", "blat", "foi de placinta", "aluat", "pesmet", "sandvis"]),
        ("pantry", ["faina", "malai", "gris", "orez", "paste", "spaghete", "penne", "fusilli", "tagliatelle", "lasagna", "taitei", "fidea", "quinoa", "cuscus", "bulgur", "ovaz", "fulgi", "cereale", "zahar", "ulei", "masline", "conserv", "ton", "naut", "linte", "fasole", "mazare", "porumb", "lapte de cocos", "stafide", "nuci", "migdale", "alune", "seminte", "susan", "arahide", "gelatina", "amidon", "pasta de", "zacusca", "pateu"]),
        ("produce", ["ceapa", "cepe", "usturoi", "morcov", "cartof", "rosii", "rosie", "tomat", "castrave", "ardei", "dovlec", "dovleac", "vinete", "vanata", "varz", "conopid", "broccoli", "spanac", "salata", "rucola", "patrunjel", "marar", "leustean", "busuioc", "rozmarin", "menta", "telina", "praz", "ciuperci", "ciuperca", "sfecla", "ridichi", "avocado", "lamai", "lamaie", "lime", "portocal", "mere", "mar ", "pere", "banan", "capsun", "afine", "zmeura", "struguri", "kiwi", "ananas", "mango", "piersic", "caise", "prune", "cirese", "visine", "pepene", "fructe", "legume", "ghimbir", "ceapa verde", "usturoi verde", "fasole verde", "mazare verde", "porumb dulce", "sparanghel", "nap", "pastarnac", "gulie", "ardei iute"]),
    ]

    private static let fresh: Set<String> = ["proaspat", "proaspata", "proaspete", "verde", "verzi"]

    private static func plain(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ro")).lowercased()
    }

    /// The aisle key of a line ("produce", "meat"… or "other"); the amount at the start is ignored.
    static func aisleOf(_ text: String) -> String {
        var core = Substring(plain(text))
        core = core.drop { "0123456789 .,/½¼¾-".contains($0) }
        let cleaned = String(core.map { ($0.isASCII && ($0.isLetter || $0.isNumber)) || $0 == " " ? $0 : " " })
        let t = " \(cleaned) "
        // Same as the web: the first produce list decides for fresh greens.
        let produce = words.first { $0.0 == "produce" }?.1 ?? []
        if fresh.contains(where: { t.contains(" \($0) ") }), produce.contains(where: { t.contains(" \($0)") }) { return "produce" }
        for (key, list) in words where list.contains(where: { t.contains(" \($0)") }) { return key }
        return "other"
    }

    static func name(_ key: String) -> String { aisles.first { $0.key == key }?.name ?? "Altele" }
    static func order(_ key: String) -> Int { aisles.firstIndex { $0.key == key } ?? aisles.count }
}
