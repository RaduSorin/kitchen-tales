import Foundation

/// The web app's text helpers for recipes, ported one to one: scaling an ingredient line to
/// other servings (src/lib/scale.ts), the timer hidden in a step (src/lib/cooking.ts), search
/// that finds "2 cepe" from "ceapa" (src/lib/format.ts) and the week's dates (src/lib/plan.ts).
enum RecipeText {
    // MARK: Formatting

    /// 45 → "45 min", 90 → "1 h 30", 120 → "2 h"
    static func formatMinutes(_ m: Int) -> String {
        if m < 60 { return "\(m) min" }
        let h = m / 60, rest = m % 60
        return rest > 0 ? "\(h) h \(rest)" : "\(h) h"
    }

    /// 702 → "11:42", 3725 → "1:02:05"
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }

    /// Lines that are headings ("Pentru sos:") rather than things to buy or tick.
    static func isHeading(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).hasSuffix(":")
    }

    // MARK: Scaling

    private static let fractions: [String: Double] = ["¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1.0 / 3, "⅔": 2.0 / 3]
    private static let nice: [(Double, String)] = [(0.25, "¼"), (0.5, "½"), (0.75, "¾"), (1.0 / 3, "⅓"), (2.0 / 3, "⅔")]
    nonisolated(unsafe) private static let lead = try! NSRegularExpression(
        pattern: #"^\s*(?:(\d+)\s+(\d+)/(\d+)|(\d+)/(\d+)|(\d+(?:[.,]\d+)?)\s*([¼½¾⅓⅔])?|([¼½¾⅓⅔]))"#)
    nonisolated(unsafe) private static let range = try! NSRegularExpression(pattern: #"^\s*[-–]\s*(\d+(?:[.,]\d+)?)"#)
    nonisolated(unsafe) private static let word = try! NSRegularExpression(pattern: #"^(\s*)(\p{L}+)"#)
    nonisolated(unsafe) private static let size = try! NSRegularExpression(pattern: #"^(\s+)(mare|mari)\b"#)

    private static let units: [(String, String)] = [
        ("cană", "căni"), ("ceașcă", "cești"), ("lingură", "linguri"), ("linguriță", "lingurițe"), ("pahar", "pahare"),
        ("legătură", "legături"), ("felie", "felii"), ("bucată", "bucăți"), ("cățel", "căței"), ("conservă", "conserve"),
        ("plic", "plicuri"), ("pachet", "pachete"), ("fir", "fire"), ("frunză", "frunze"), ("vârf", "vârfuri"),
    ]
    private static let nouns: [(String, String)] = [
        ("ou", "ouă"), ("ceapă", "cepe"), ("morcov", "morcovi"), ("cartof", "cartofi"), ("roșie", "roșii"), ("lămâie", "lămâi"),
        ("măr", "mere"), ("pară", "pere"), ("dovlecel", "dovlecei"), ("castravete", "castraveți"), ("vânătă", "vinete"),
        ("portocală", "portocale"), ("banană", "banane"), ("gălbenuș", "gălbenușuri"), ("albuș", "albușuri"), ("piept", "piepți"),
    ]

    /// The groups of the first match at the start of `text` (nil where a group did not take part).
    private static func match(_ re: NSRegularExpression, _ text: String) -> (whole: String, groups: [String?])? {
        let ns = text as NSString
        guard let m = re.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let groups = (1..<m.numberOfRanges).map { i -> String? in
            let r = m.range(at: i)
            return r.location == NSNotFound ? nil : ns.substring(with: r)
        }
        return (ns.substring(with: m.range), groups)
    }

    /// 1.5 → "1,5", 2.0 → "2", like JavaScript's String(n) with a Romanian comma.
    private static func decimal(_ n: Double) -> String {
        n == n.rounded() ? String(Int(n)) : String(n).replacingOccurrences(of: ".", with: ",")
    }

    private static func number(_ s: String) -> Double { Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }

    /// The amount at the start of a line; `max` is the upper end of a range like "2-3".
    static func parseQuantity(_ line: String) -> (value: Double, max: Double?, rest: String)? {
        guard let m = match(lead, line), !m.whole.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        let g = m.groups
        let value: Double
        if let a = g[0], let b = g[1], let c = g[2] { value = number(a) + number(b) / number(c) }
        else if let a = g[3], let b = g[4] { value = number(a) / number(b) }
        else if let a = g[5] { value = number(a) + (g[6].flatMap { fractions[$0] } ?? 0) }
        else if let f = g[7] { value = fractions[f] ?? 0 }
        else { return nil }
        guard value > 0, value.isFinite else { return nil }
        let rest = String(line.dropFirst(m.whole.count))
        guard let r = match(range, rest), let top = r.groups[0] else { return (value, nil, rest) }
        let max = number(top)
        // "3-2" is not an amount we understand (a code, a date): leave the line as it is.
        return max > value ? (value, max, String(rest.dropFirst(r.whole.count))) : nil
    }

    static func formatQuantity(_ amount: Double) -> String {
        if amount >= 10 { return String(Int(amount.rounded())) }
        let n = max(0.25, amount)
        var whole = Int(n.rounded(.down))
        var best: (Double, String) = (0, "")
        for c in [(0.0, ""), (1.0, "")] + nice where abs(n - Double(whole) - c.0) < abs(n - Double(whole) - best.0) { best = c }
        if best.0 == 1 { whole += 1; best = (0, "") }
        if best.1.isEmpty { return String(max(whole, 1)) }
        return whole > 0 ? "\(whole) \(best.1)" : best.1
    }

    /// "3 cană" → "3 căni", "1 ouă" → "1 ou"; "1000 g" → "1 kg", "1500 ml" → "1,5 l".
    private static func tidyUnit(_ amount: Double, _ rest: String, range: Bool) -> (amount: String?, rest: String) {
        guard let m = match(word, rest), let space = m.groups[0], let w = m.groups[1] else { return (nil, rest) }
        let after = String(rest.dropFirst(m.whole.count))
        let lower = w.lowercased()
        if (lower == "g" || lower == "ml") && amount >= 1000 {
            let big = (amount / 1000 * 100).rounded() / 100
            return (decimal(big), "\(space)\(lower == "g" ? "kg" : "l")\(after)")
        }
        for (one, many) in units where lower == one || lower == many {
            let want = amount >= 2 || (range && amount > 1) ? many : one
            return (nil, "\(space)\(want)\(after)")
        }
        for (one, many) in nouns where lower == one || lower == many {
            let plural = amount > 1
            var tail = after
            if let s = match(size, after), let gap = s.groups[0] {
                tail = "\(gap)\(plural ? "mari" : "mare")\(after.dropFirst(s.whole.count))"
            }
            return (nil, "\(space)\(plural ? many : one)\(tail)")
        }
        return (nil, rest)
    }

    /// "500 g carne" × 1.5 → "750 g carne"
    static func scaleIngredient(_ line: String, factor: Double) -> String {
        guard factor != 1, let q = parseQuantity(line) else { return line }
        var rest = q.rest.hasPrefix(" ") || q.rest.isEmpty ? q.rest : " " + q.rest
        let lo = q.value * factor
        let hi = q.max.map { $0 * factor }
        let t = tidyUnit(hi ?? lo, rest, range: hi != nil)
        rest = t.rest
        if let amount = t.amount {
            if hi == nil { return amount + rest }
            return decimal((lo / 10).rounded() / 100) + "-" + amount + rest
        }
        let amount = hi.map { "\(formatQuantity(lo))-\(formatQuantity($0))" } ?? formatQuantity(lo)
        return amount + rest
    }

    // MARK: Timers in steps

    private static let wordNumbers: [String: Double] = [
        "o": 1, "un": 1, "una": 1, "doua": 2, "doi": 2, "trei": 3, "patru": 4, "cinci": 5, "sase": 6, "sapte": 7, "opt": 8,
        "noua": 9, "zece": 10, "cincisprezece": 15, "douazeci": 20, "treizeci": 30, "patruzeci": 40,
    ]
    nonisolated(unsafe) private static let duration = try! NSRegularExpression(
        pattern: #"(\d+(?:[.,]\d+)?|[a-z]+)(?:\s*(?:-|–|sau)\s*(\d+(?:[.,]\d+)?))?\s*(?:de\s+)?(ore|ora|h|minute|minut|min|secunde|secunda|sec)\b"#)

    /// Total seconds of the durations mentioned in a step, or 0. Ranges use the upper bound.
    static func detectDuration(_ text: String) -> Int {
        let t = norm(text)
        if t.contains("jumatate de ora") { return 1800 }
        let ns = t as NSString
        var total = 0.0
        for m in duration.matches(in: t, range: NSRange(location: 0, length: ns.length)) {
            let first = ns.substring(with: m.range(at: 1))
            let raw = m.range(at: 2).location != NSNotFound ? ns.substring(with: m.range(at: 2)) : first
            let n = raw.first?.isNumber == true ? number(raw) : (wordNumbers[raw] ?? 0)
            guard n > 0 else { continue }
            let unit = ns.substring(with: m.range(at: 3))
            let seconds: Double = ["ore", "ora", "h"].contains(unit) ? 3600 : ["secunde", "secunda", "sec"].contains(unit) ? 1 : 60
            total += n * seconds
        }
        return Int(total.rounded())
    }

    // MARK: Search

    /// Lowercase without diacritics: "Ciorbă" → "ciorba".
    static func norm(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ro")).lowercased()
    }

    private static let endings = ["urilor", "elor", "ilor", "ului", "urile", "uri", "ele", "lor", "ul", "le", "ii", "i", "e", "a", "u"]

    /// A rough Romanian stem, so "ceapă" and "cepe" both become "cep".
    static func stem(_ word: String) -> String {
        var s = String(norm(word).unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
        for e in endings where s.hasSuffix(e) && s.count - e.count >= 2 {
            s = String(s.dropLast(e.count))
            break
        }
        return s.replacingOccurrences(of: "ea", with: "e").replacingOccurrences(of: "oa", with: "o").replacingOccurrences(of: "a", with: "e")
    }

    private static func sameWord(_ a: String, _ b: String) -> Bool {
        if a == b { return true }
        let (short, long) = a.count <= b.count ? (a, b) : (b, a)
        return short.count >= 3 && long.hasPrefix(short)
    }

    /// True when every word of the query is in the text, as typed or as another form of it.
    static func matches(_ text: String, query: String) -> Bool {
        let words = norm(query).split(whereSeparator: \.isWhitespace).map(String.init)
        guard !words.isEmpty else { return true }
        let t = norm(text)
        let stems = t.split { !$0.isLetter && !$0.isNumber }.map { stem(String($0)) }
        return words.allSatisfy { w in t.contains(w) || stems.contains { sameWord($0, stem(w)) } }
    }

    // MARK: Days

    /// "2026-11-11", the local day.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Monday to Sunday of the week `date` is in.
    static func weekDays(of date: Date, calendar: Calendar = .current) -> [Date] {
        let day = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: day) // 1 = Sunday
        let monday = calendar.date(byAdding: .day, value: -((weekday + 5) % 7), to: day) ?? day
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }
    }

    /// L, Ma, Mi, J, V, S, D (Monday first).
    static let dayLetters = ["L", "Ma", "Mi", "J", "V", "S", "D"]

    /// "Luni", "Marți"…, for the day menus.
    static func dayName(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "EEEE"
        let s = f.string(from: date)
        return s.prefix(1).uppercased() + s.dropFirst()
    }
}
