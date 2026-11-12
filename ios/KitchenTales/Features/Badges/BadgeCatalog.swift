import Foundation

/// Every badge, as in the web's src/lib/badges/catalog.ts: stamps for the recipes side (the
/// culinary passport), stickers for the stories side (the album). The pictures are the web's,
/// drawn into Resources/Badges by ios/scripts/render-badges.ts.
struct Badge: Identifiable, Hashable, Sendable {
    enum Kind: Sendable { case stamp, sticker }
    enum Ink: Sendable { case add, cook, plan, family, secret }
    /// What has to be done: [done so far, needed] over the person's counters (BadgeState).
    enum Goal: Hashable, Sendable {
        case count(String, Int)
        case size(String, Int)
        /// The biggest counter whose name starts with this ("cook:" per recipe).
        case most(String, Int)
        /// A year since the collection started.
        case days
        /// One story from every folder.
        case folders
        /// Evenings in a row.
        case run(Int)
    }

    let id: String
    let kind: Kind
    let group: String
    let name: String
    let how: String
    let art: String
    var ink: Ink? = nil
    var lvl: Int? = nil
    var secret = false
    /// A listening sticker: at most one an evening.
    var listen = false
    let goal: Goal

    static func == (a: Badge, b: Badge) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }

    /// The picture's name in the bundle: earned, missing, or missing drawn for the passport's paper.
    func image(earned: Bool, onPaper: Bool = false) -> String {
        let base = kind == .stamp ? "stamp-\(id)" : "sticker-\(id)"
        return earned ? base : (onPaper && kind == .stamp ? "\(base)-missing-ink" : "\(base)-missing")
    }
}

enum BadgeCatalog {
    static let stampGroups = ["Adăugare", "La gătit", "Plan și caiet", "Familie", "Surprize"]
    static let stickerGroups = ["La ascultat", "La făcut povești", "Obiceiuri bune"]

    static let all: [Badge] = [
        Badge(id: "scrisa", kind: .stamp, group: "Adăugare", name: "Din mâna mea", how: "Prima rețetă scrisă de la zero, în editor.", art: "pencil", ink: .add, goal: .count("way:written", 1)),
        Badge(id: "link", kind: .stamp, group: "Adăugare", name: "Găsită pe net", how: "Prima rețetă adăugată dintr-un link de site.", art: "globe", ink: .add, goal: .count("way:link", 1)),
        Badge(id: "video", kind: .stamp, group: "Adăugare", name: "De pe ecran", how: "Prima rețetă dintr-un video YouTube, TikTok sau Instagram.", art: "tv", ink: .add, goal: .count("way:video", 1)),
        Badge(id: "poza", kind: .stamp, group: "Adăugare", name: "Caietul bunicii", how: "Prima rețetă scoasă dintr-o poză: carte, caiet sau bilețel.", art: "camera", ink: .add, goal: .count("way:photo", 1)),
        Badge(id: "dictat", kind: .stamp, group: "Adăugare", name: "Spusă cu voce tare", how: "Prima rețetă dictată.", art: "mic", ink: .add, goal: .count("way:dictation", 1)),
        Badge(id: "frigider", kind: .stamp, group: "Adăugare", name: "Din ce aveam", how: "O rețetă salvată din ideile pentru „Ce pot găti din frigider”.", art: "fridge", ink: .add, goal: .count("way:fridge", 1)),
        Badge(id: "c5", kind: .stamp, group: "Adăugare", name: "Ucenic", how: "5 rețete adăugate.", art: "toque", ink: .add, lvl: 5, goal: .count("recipes", 5)),
        Badge(id: "c10", kind: .stamp, group: "Adăugare", name: "Bucătar", how: "10 rețete adăugate.", art: "toque", ink: .add, lvl: 10, goal: .count("recipes", 10)),
        Badge(id: "c25", kind: .stamp, group: "Adăugare", name: "Sous-chef", how: "25 de rețete adăugate.", art: "toque", ink: .add, lvl: 25, goal: .count("recipes", 25)),
        Badge(id: "c50", kind: .stamp, group: "Adăugare", name: "Chef", how: "50 de rețete adăugate.", art: "toque", ink: .add, lvl: 50, goal: .count("recipes", 50)),
        Badge(id: "c100", kind: .stamp, group: "Adăugare", name: "Cartea casei", how: "100 de rețete adăugate.", art: "toque", ink: .add, lvl: 100, goal: .count("recipes", 100)),
        Badge(id: "categorii", kind: .stamp, group: "Adăugare", name: "Gust de toate", how: "Rețete în 5 categorii diferite.", art: "salt", ink: .add, goal: .size("categories", 5)),
        Badge(id: "foto", kind: .stamp, group: "Adăugare", name: "Arată bine", how: "10 rețete cu poză.", art: "pie", ink: .add, lvl: 10, goal: .count("photos", 10)),
        Badge(id: "prima", kind: .stamp, group: "La gătit", name: "Prima la masă", how: "Prima rețetă gătită până la capăt în modul de gătit.", art: "plate", ink: .cook, goal: .count("cooked", 1)),
        Badge(id: "g10", kind: .stamp, group: "La gătit", name: "Gospodar", how: "10 mese gătite din aplicație.", art: "pot", ink: .cook, lvl: 10, goal: .count("cooked", 10)),
        Badge(id: "g25", kind: .stamp, group: "La gătit", name: "Bucătăria plină", how: "25 de mese gătite din aplicație.", art: "pot", ink: .cook, lvl: 25, goal: .count("cooked", 25)),
        Badge(id: "g50", kind: .stamp, group: "La gătit", name: "Cuptor încins", how: "50 de mese gătite din aplicație.", art: "pot", ink: .cook, lvl: 50, goal: .count("cooked", 50)),
        Badge(id: "casei", kind: .stamp, group: "La gătit", name: "Rețeta casei", how: "Aceeași rețetă gătită de 5 ori.", art: "bowl", ink: .cook, lvl: 5, goal: .most("cook:", 5)),
        Badge(id: "pas", kind: .stamp, group: "La gătit", name: "Pas cu pas", how: "O rețetă dusă până la ultimul pas în modul de gătit.", art: "whisk", ink: .cook, goal: .count("cookmode", 1)),
        Badge(id: "maini", kind: .stamp, group: "La gătit", name: "Fără mâini", how: "Un pas schimbat cu vocea, în modul mâini libere.", art: "bubble", ink: .cook, goal: .count("handsfree", 1)),
        Badge(id: "jongler", kind: .stamp, group: "La gătit", name: "Jongler", how: "3 cronometre pornite în același timp.", art: "timer", ink: .cook, lvl: 3, goal: .count("timers", 3)),
        Badge(id: "nota", kind: .stamp, group: "La gătit", name: "Nota bucătarului", how: "Prima notiță lăsată după ce ai gătit.", art: "notepad", ink: .cook, goal: .count("notes", 1)),
        Badge(id: "dubla", kind: .stamp, group: "La gătit", name: "Porție dublă", how: "Numărul de porții schimbat la o rețetă.", art: "cup", ink: .cook, goal: .count("servings", 1)),
        Badge(id: "saptamana", kind: .stamp, group: "Plan și caiet", name: "Săptămâna e gata", how: "Cina planificată pentru toate cele 7 zile ale unei săptămâni.", art: "calendar", ink: .plan, lvl: 7, goal: .count("week", 1)),
        Badge(id: "cos", kind: .stamp, group: "Plan și caiet", name: "Coșul plin", how: "Toată lista de cumpărături bifată.", art: "basket", ink: .plan, goal: .count("shopping", 1)),
        Badge(id: "pdf", kind: .stamp, group: "Plan și caiet", name: "Caietul de rețete", how: "Primul caiet de rețete PDF, făcut din Profil.", art: "cookbook", ink: .plan, goal: .count("cookbook", 1)),
        Badge(id: "tipar", kind: .stamp, group: "Plan și caiet", name: "Ediție tipărită", how: "Un caiet A4, de tipar, cu cel puțin 20 de rețete.", art: "printer", ink: .plan, goal: .count("print", 1)),
        Badge(id: "casa", kind: .stamp, group: "Familie", name: "Casa plină", how: "Pe cineva invitat în aplicație.", art: "envelope", ink: .family, goal: .count("invited", 1)),
        Badge(id: "impartim", kind: .stamp, group: "Familie", name: "Împărțim", how: "O rețetă partajată cu toate conturile.", art: "gift", ink: .family, goal: .count("shared", 1)),
        Badge(id: "an", kind: .stamp, group: "Familie", name: "Un an împreună", how: "Un an de la prima ta rețetă sau poveste.", art: "cake", ink: .family, lvl: 1, goal: .days),
        Badge(id: "noapte", kind: .stamp, group: "Surprize", name: "Bucătar de noapte", how: "Modul de gătit deschis după ora 23.", art: "moon", ink: .secret, secret: true, goal: .count("night", 1)),
        Badge(id: "brunch", kind: .stamp, group: "Surprize", name: "Brunch de duminică", how: "Ceva gătit duminică înainte de ora 11.", art: "pancakes", ink: .secret, secret: true, goal: .count("brunch", 1)),
        Badge(id: "dulce", kind: .stamp, group: "Surprize", name: "Dinte dulce", how: "10 rețete de desert.", art: "cupcake", ink: .secret, lvl: 10, secret: true, goal: .count("desserts", 10)),
        Badge(id: "k-star", kind: .sticker, group: "La ascultat", name: "Steluța", how: "O poveste ascultată până la capăt.", art: "star", listen: true, goal: .count("listened", 1)),
        Badge(id: "k-moon", kind: .sticker, group: "La ascultat", name: "Luna", how: "5 povești ascultate până la capăt.", art: "moon", listen: true, goal: .count("listened", 5)),
        Badge(id: "k-book", kind: .sticker, group: "La ascultat", name: "Cărțulia", how: "10 povești ascultate până la capăt.", art: "book", listen: true, goal: .count("listened", 10)),
        Badge(id: "k-owl", kind: .sticker, group: "La ascultat", name: "Bufnița", how: "25 de povești ascultate până la capăt.", art: "owl", listen: true, goal: .count("listened", 25)),
        Badge(id: "k-crown", kind: .sticker, group: "La ascultat", name: "Coroana", how: "50 de povești ascultate până la capăt.", art: "crown", listen: true, goal: .count("listened", 50)),
        Badge(id: "k-whale", kind: .sticker, group: "La ascultat", name: "Balena", how: "100 de povești ascultate până la capăt.", art: "whale", listen: true, goal: .count("listened", 100)),
        Badge(id: "k-rainbow", kind: .sticker, group: "La ascultat", name: "Curcubeul", how: "Aceeași poveste ascultată de 3 ori.", art: "rainbow", listen: true, goal: .most("listen:", 3)),
        Badge(id: "k-rocket", kind: .sticker, group: "La ascultat", name: "Racheta", how: "Câte o poveste ascultată din fiecare folder.", art: "rocket", listen: true, goal: .folders),
        Badge(id: "k-cloud", kind: .sticker, group: "La ascultat", name: "Norișorul", how: "Mai multe povești la rând, până s-a oprit singur playerul.", art: "cloud", listen: true, goal: .count("sleepstop", 1)),
        Badge(id: "k-balloon", kind: .sticker, group: "La ascultat", name: "Balonul", how: "O poveste salvată pe telefon, pentru drum fără internet.", art: "balloon", goal: .count("offline", 1)),
        Badge(id: "k-ghost", kind: .sticker, group: "La ascultat", name: "Stafia", how: "Povești ascultate după ora 21, în 7 seri diferite.", art: "ghost", secret: true, listen: true, goal: .size("evenings", 7)),
        Badge(id: "k-fox", kind: .sticker, group: "La ascultat", name: "Vulpița", how: "O poveste ascultată dimineața, înainte de ora 9.", art: "fox", listen: true, goal: .count("morning", 1)),
        Badge(id: "k-snail", kind: .sticker, group: "La ascultat", name: "Melcul", how: "O poveste lungă, de peste 20 de minute, ascultată până la capăt.", art: "snail", listen: true, goal: .count("long", 1)),
        Badge(id: "k-bunny", kind: .sticker, group: "La ascultat", name: "Iepurașul", how: "5 povești scurte, sub 5 minute, ascultate până la capăt.", art: "bunny", listen: true, goal: .count("short", 5)),
        Badge(id: "k-parrot", kind: .sticker, group: "La ascultat", name: "Papagalul", how: "O poveste înregistrată de voi, ascultată de 5 ori.", art: "parrot", listen: true, goal: .most("rec:", 5)),
        Badge(id: "k-umbrella", kind: .sticker, group: "La ascultat", name: "Umbrela", how: "O poveste ascultată fără internet, de pe telefon.", art: "umbrella", listen: true, goal: .count("offlineListen", 1)),
        Badge(id: "k-comet", kind: .sticker, group: "La ascultat", name: "Cometa", how: "200 de povești ascultate până la capăt.", art: "comet", listen: true, goal: .count("listened", 200)),
        Badge(id: "k-snow", kind: .sticker, group: "La ascultat", name: "Fulgul de nea", how: "O poveste ascultată de Crăciun.", art: "snow", secret: true, goal: .count("xmas", 1)),
        Badge(id: "k-pumpkin", kind: .sticker, group: "La ascultat", name: "Dovlecelul", how: "O poveste ascultată de Halloween.", art: "pumpkin", secret: true, goal: .count("halloween", 1)),
        Badge(id: "k-heart", kind: .sticker, group: "La făcut povești", name: "Inimioara", how: "Prima poveste înregistrată cu vocea voastră.", art: "heart", goal: .count("source:recording", 1)),
        Badge(id: "k-wand", kind: .sticker, group: "La făcut povești", name: "Bagheta", how: "Prima poveste scrisă cu AI și citită de un narator.", art: "wand", goal: .count("source:generated", 1)),
        Badge(id: "k-shell", kind: .sticker, group: "La făcut povești", name: "Scoica", how: "Prima poveste încărcată dintr-un fișier audio.", art: "shell", goal: .count("source:upload", 1)),
        Badge(id: "k-crayon", kind: .sticker, group: "La făcut povești", name: "Creionul", how: "O copertă aleasă sau desenată pentru o poveste.", art: "crayon", goal: .count("covers", 1)),
        Badge(id: "k-house", kind: .sticker, group: "La făcut povești", name: "Căsuța", how: "Primul folder de povești.", art: "house", goal: .count("folders", 1)),
        Badge(id: "k-mushroom", kind: .sticker, group: "La făcut povești", name: "Ciupercuța", how: "10 povești în bibliotecă.", art: "mushroom", goal: .count("stories", 10)),
        Badge(id: "k-tree", kind: .sticker, group: "La făcut povești", name: "Copacul", how: "25 de povești în bibliotecă.", art: "tree", goal: .count("stories", 25)),
        Badge(id: "k-castle", kind: .sticker, group: "La făcut povești", name: "Castelul", how: "50 de povești în bibliotecă.", art: "castle", goal: .count("stories", 50)),
        Badge(id: "k-teddy", kind: .sticker, group: "La făcut povești", name: "Ursulețul", how: "Modul copil pornit prima dată.", art: "teddy", goal: .count("kid", 1)),
        Badge(id: "k-cat", kind: .sticker, group: "Obiceiuri bune", name: "Pisicuța", how: "Povești ascultate 3 seri la rând.", art: "cat", listen: true, goal: .run(3)),
        Badge(id: "k-dragon", kind: .sticker, group: "Obiceiuri bune", name: "Dragonul", how: "Povești ascultate 7 seri la rând.", art: "dragon", listen: true, goal: .run(7)),
        Badge(id: "k-key", kind: .sticker, group: "Obiceiuri bune", name: "Cheița", how: "Prima poveste pusă la favorite.", art: "key", goal: .count("favorite", 1)),
        Badge(id: "k-penguin", kind: .sticker, group: "Obiceiuri bune", name: "Pinguinul", how: "10 povești ascultate în modul copil.", art: "penguin", listen: true, goal: .count("kidListen", 10)),
    ]

    static let byId = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
    static let stamps = all.filter { $0.kind == .stamp }
    static let stickers = all.filter { $0.kind == .sticker }
}
