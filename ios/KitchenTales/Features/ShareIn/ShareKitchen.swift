import Foundation
import Security
import UIKit

/// What someone shared into the app from TikTok, Instagram, Safari or Photos.
enum ShareInput: Equatable, Sendable {
    case link(URL)
    case text(String)
    case image(Data)

    /// A link inside shared text ("Look at this! https://vm.tiktok.com/…") counts as the link.
    nonisolated static func from(text: String) -> ShareInput {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
           let match = detector.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
           let url = match.url, url.scheme?.hasPrefix("http") == true {
            return .link(url)
        }
        return .text(trimmed)
    }

    /// "din TikTok", "din Instagram", "din safari.ro"…
    nonisolated var origin: String {
        switch self {
        case .text: return "din textul trimis"
        case .image: return "din poză"
        case .link(let url):
            let host = (url.host ?? "").lowercased().replacingOccurrences(of: "www.", with: "")
            if host.contains("tiktok") { return "din TikTok" }
            if host.contains("instagram") { return "din Instagram" }
            if host.contains("youtu") { return "din YouTube" }
            if host.contains("facebook") || host.contains("fb.watch") { return "din Facebook" }
            return host.isEmpty ? "din link" : "din \(host)"
        }
    }
}

/// The recipe categories, the same list as the editor (RecipeText.categories).
enum ShareCategories {
    nonisolated static let all = ["Ciorbe și supe", "Feluri principale", "Garnituri", "Salate", "Deserturi", "Mic dejun", "Pentru copii"]
    /// Where "Păstrează linkul" puts a link that had no recipe in it.
    nonisolated static let toTry = "De încercat"
}

/// A recipe the Share card just saved.
struct SharedRecipe: Equatable, Sendable {
    var id: String
    var title: String
    var category: String?
    var minutes: Int?
    var servings: Int?
    var ingredientCount: Int
    var photoKey: String?
}

/// The signed-in family as the Share extension (or the app) sees it: the session from the shared
/// Keychain, the GraphQL client and the few writes the Share card needs.
@MainActor
struct ShareKitchen {
    let client: GraphQLClient
    let space: String
    let spaceName: String?

    /// Nil when nobody is signed in on this phone.
    static func open(store: TokenStore = TokenStore()) -> ShareKitchen? {
        guard let saved = store.load(), let account = Account(idToken: saved.idToken), let space = account.space,
              let backend = BackendConfig.fromBundle(), let auth = AuthConfig.fromBundle() else { return nil }
        let tokens = TokenBox(saved)
        let cognito = CognitoClient(config: auth)
        let client = GraphQLClient(config: backend, token: { @Sendable in
            let current = tokens.value
            if current.isFresh { return current.accessToken }
            let next = try await cognito.refresh(current)
            tokens.value = next
            store.save(next)
            return next.accessToken
        })
        return ShareKitchen(client: client, space: space, spaceName: account.displayName)
    }

    /// Starts the import job (the same AI as the editor's "Lipește un link"); returns the job id.
    func startImport(_ input: ShareInput) async throws -> String {
        var v: [String: Any] = [:]
        switch input {
        case .link(let url): v["url"] = url.absoluteString
        case .text(let text): v["text"] = text
        case .image(let data): v["photoKeys"] = [try await upload(jpeg: Self.jpeg(data))]
        }
        return try await AIJob.start(client, mutation: AIJob.importMutation, variables: v)
    }

    /// Saves what the import found as a new private recipe.
    func saveImported(_ json: [String: Any], sourceUrl: String?) async throws -> SharedRecipe {
        guard let title = (json["title"] as? String).flatMap({ $0.isEmpty ? nil : $0 }) else {
            throw BackendError.server("Nu am găsit o rețetă aici.")
        }
        func text(_ k: String) -> Any { (json[k] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? NSNull() }
        func list(_ k: String) -> [String] { (json[k] as? [Any] ?? []).compactMap { ($0 as? String).flatMap { $0.isEmpty ? nil : $0 } } }
        let ingredients = list("ingredients")
        let category = json["category"] as? String
        var input: [String: Any] = [
            "id": UUID().uuidString.lowercased(), "title": title, "category": text("category"),
            "servings": json["servings"] ?? NSNull(), "minutes": json["minutes"] ?? NSNull(),
            "ingredients": ingredients, "steps": list("steps"), "notes": text("notes"),
            "sourceUrl": (json["sourceUrl"] as? String) ?? sourceUrl ?? NSNull(), "photoKey": text("photoKey"),
            "nutrition": text("nutrition"), "allergens": text("allergens"),
        ]
        let id = try await create(&input)
        return SharedRecipe(id: id, title: title, category: category, minutes: (json["minutes"] as? NSNumber)?.intValue,
                            servings: (json["servings"] as? NSNumber)?.intValue, ingredientCount: ingredients.count,
                            photoKey: json["photoKey"] as? String)
    }

    /// "Păstrează linkul în De încercat": a recipe with only the title and the link.
    func keepLink(_ url: URL, title: String?) async throws -> SharedRecipe {
        let name = Self.linkTitle(title, url: url)
        var input: [String: Any] = [
            "id": UUID().uuidString.lowercased(), "title": name, "category": ShareCategories.toTry,
            "ingredients": [String](), "steps": [String](), "sourceUrl": url.absoluteString,
        ]
        let id = try await create(&input)
        return SharedRecipe(id: id, title: name, category: ShareCategories.toTry, ingredientCount: 0)
    }

    func setCategory(_ recipeId: String, _ category: String) async throws {
        _ = try await client.run("mutation Cat($input: UpdateRecipeInput!) { updateRecipe(input: $input) { id } }",
                                 variables: ["input": ["id": recipeId, "category": category]])
    }

    /// "Pune în Săptămâna": the recipe on that day's plan.
    func plan(_ recipeId: String, on day: Date) async throws {
        let input: [String: Any] = ["id": UUID().uuidString.lowercased(), "day": Self.dayKey(day), "recipeId": recipeId, "spaceGroups": [space]]
        _ = try await client.run("mutation Plan($input: CreateMealPlanEntryInput!) { createMealPlanEntry(input: $input) { id } }",
                                 variables: ["input": input])
    }

    private func create(_ input: inout [String: Any]) async throws -> String {
        input["spaceGroups"] = [space]
        input["readerGroups"] = [String]()
        if let spaceName, !spaceName.isEmpty { input["spaceName"] = spaceName }
        let body = try await client.run("mutation Save($input: CreateRecipeInput!) { createRecipe(input: $input) { id } }", variables: ["input": input])
        guard let row = body["createRecipe"] as? [String: Any], let id = row["id"] as? String else {
            throw BackendError.server("Rețeta nu s-a salvat. Încearcă din nou.")
        }
        return id
    }

    private func upload(jpeg: Data) async throws -> String {
        let query = "mutation Up($prefix: String!, $ext: String!, $contentType: String) { uploadUrl(prefix: $prefix, ext: $ext, contentType: $contentType) { path url } }"
        let body = try await client.run(query, variables: ["prefix": "recipe-photos", "ext": "jpg", "contentType": "image/jpeg"])
        guard let target = body["uploadUrl"] as? [String: Any], let path = target["path"] as? String,
              let raw = target["url"] as? String, let url = URL(string: raw) else { throw BackendError.server("Nu am putut încărca poza.") }
        var request = URLRequest(url: url, timeoutInterval: 120)
        request.httpMethod = "PUT"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.upload(for: request, from: jpeg)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BackendError.server("Încărcarea a eșuat (\(http.statusCode))")
        }
        return path
    }

    // MARK: Helpers (pure, tested)

    nonisolated static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The title for a kept link: the page's own title, else "Video TikTok de încercat".
    nonisolated static func linkTitle(_ title: String?, url: URL) -> String {
        let clean = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { return String(clean.prefix(80)) }
        let origin = ShareInput.link(url).origin.replacingOccurrences(of: "din ", with: "")
        return "Video \(origin) de încercat"
    }

    /// The "no recipe here" answers from the import function (isNoRecipe in amplify/shared/aiUsage.ts).
    nonisolated static func isNoRecipe(_ message: String) -> Bool {
        message.hasPrefix("Nu am găsit o rețet") || message.hasPrefix("Nu am găsit rețet")
    }

    nonisolated static func jpeg(_ data: Data, maxSide: CGFloat = 2000) -> Data {
        guard let image = UIImage(data: data) else { return data }
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, maxSide / max(longest, 1))
        let target = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.85) ?? data
    }
}

/// The session's tokens, refreshed in place while the Share card runs.
private final class TokenBox: @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: Tokens
    init(_ tokens: Tokens) { self.tokens = tokens }
    var value: Tokens {
        get { lock.lock(); defer { lock.unlock() }; return tokens }
        set { lock.lock(); tokens = newValue; lock.unlock() }
    }
}

/// Imports left running from the Share card ("Gata, lucrează în fundal"): the app saves them the
/// next time it opens. Kept in the Keychain group the app and the extension share.
struct PendingImports: Sendable {
    struct Job: Codable, Equatable, Sendable {
        var jobId: String
        var sourceUrl: String?
        var startedAt: Date
    }

    var service = "app.kitchentales.ios.share"

    func load() -> [Job] {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return [] }
        return (try? JSONDecoder().decode([Job].self, from: data)) ?? []
    }

    func save(_ jobs: [Job]) {
        SecItemDelete(base as CFDictionary)
        guard !jobs.isEmpty, let data = try? JSONEncoder().encode(jobs) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    func add(_ job: Job) { save(load().filter { $0.jobId != job.jobId } + [job]) }

    private var base: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "pending"]
    }
}

extension ShareKitchen {
    /// In the app: saves the imports the Share card left running. Returns the titles saved; a job
    /// still running stays for next time, one older than 15 minutes is dropped.
    func collectPending(_ pending: PendingImports = PendingImports(), now: Date = Date()) async -> [String] {
        var left: [PendingImports.Job] = []
        var saved: [String] = []
        let links = FileLinks(client: client)
        for job in pending.load() {
            switch await AIJob.check(client, links: links, space: space, jobId: job.jobId) {
            case .ok(let data):
                if let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                   let recipe = try? await saveImported(json, sourceUrl: job.sourceUrl) {
                    saved.append(recipe.title)
                }
            case .failed:
                break
            case nil:
                if now.timeIntervalSince(job.startedAt) < 15 * 60 { left.append(job) }
            }
        }
        pending.save(left)
        return saved
    }
}
