import Foundation

/// The AppSync GraphQL endpoint, from the `data` part of `Resources/AuthConfig.json`.
struct BackendConfig: Sendable, Equatable {
    let graphqlURL: URL

    static func fromBundle(_ bundle: Bundle = .main) -> BackendConfig? {
        guard let url = bundle.url(forResource: "AuthConfig", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return parse(data)
    }

    static func parse(_ data: Data) -> BackendConfig? {
        struct Outputs: Decodable {
            struct DataPart: Decodable { let url: String }
            let data: DataPart?
        }
        guard let o = try? JSONDecoder().decode(Outputs.self, from: data), let raw = o.data?.url,
              let url = URL(string: raw) else { return nil }
        return BackendConfig(graphqlURL: url)
    }
}

enum BackendError: Error, LocalizedError, Equatable {
    case offline
    case server(String)
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .offline: "Nu e conexiune la internet."
        case .server(let message): message
        case .notConfigured: "Aplicația nu are adresa serverului."
        }
    }
}

/// Plain GraphQL over HTTPS to the same AppSync API the web app uses, signed in with the
/// Cognito access token (user pool authorization, groups decide what each space sees).
/// Main-actor bound: the JSON dictionaries never cross actors, and the waiting happens in
/// URLSession, so the interface stays smooth.
@MainActor
struct GraphQLClient {
    let config: BackendConfig
    let token: @Sendable () async throws -> String
    var session: URLSession = .shared

    /// Runs a query and returns its `data` object. Field errors that still come with data
    /// (for example `spaceGroups` on another space's shared story, which only its owners may
    /// read) are ignored, like the web app does.
    func run(_ query: String, variables: [String: Any] = [:]) async throws -> [String: Any] {
        var request = URLRequest(url: config.graphqlURL, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(try await token(), forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["query": query, "variables": variables])
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where CognitoClient.isOffline(error) {
            throw BackendError.offline
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let errors = (json["errors"] as? [[String: Any]])?.compactMap { $0["message"] as? String } ?? []
        if let body = json["data"] as? [String: Any], !body.values.allSatisfy({ $0 is NSNull }) {
            return body
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BackendError.server(errors.first ?? "Serverul a răspuns cu eroarea \(http.statusCode).")
        }
        throw BackendError.server(errors.first ?? "Răspuns gol de la server.")
    }

    /// Every page of a `list…` query: `{ items { … } nextToken }`.
    func listAll(_ field: String, fields: String, pageSize: Int = 200) async throws -> [[String: Any]] {
        let query = "query List($limit: Int, $nextToken: String) { \(field)(limit: $limit, nextToken: $nextToken) { items { \(fields) } nextToken } }"
        var items: [[String: Any]] = []
        var next: String?
        repeat {
            var variables: [String: Any] = ["limit": pageSize]
            if let next { variables["nextToken"] = next }
            let body = try await run(query, variables: variables)
            let page = body[field] as? [String: Any]
            items += (page?["items"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            next = page?["nextToken"] as? String
        } while next != nil
        return items
    }
}

/// Signed links (valid one hour) to read stored files, asked for through the `fileUrls` query,
/// which checks the caller's space. Kept for 50 minutes, so a shelf of covers is one call.
@MainActor
final class FileLinks {
    private let client: GraphQLClient
    private var cache: [String: (url: URL, until: Date)] = [:]
    private var pending: [String: Task<URL?, Never>] = [:]

    init(client: GraphQLClient) { self.client = client }

    /// `ref` names the row that points at the file ("Story:<id>"), so files kept from before
    /// spaces had folders can still be checked.
    func url(for path: String, ref: String?) async -> URL? {
        if let hit = cache[path], hit.until > Date() { return hit.url }
        if let running = pending[path] { return await running.value }
        let task = Task<URL?, Never> { [client] in
            let query = "query Urls($paths: [String]!, $refs: [String]) { fileUrls(paths: $paths, refs: $refs) }"
            let refValue: Any = ref.map { $0 as Any } ?? NSNull()
            let variables: [String: Any] = ["paths": [path], "refs": [refValue]]
            guard let body = try? await client.run(query, variables: variables),
                  let list = body["fileUrls"] as? [Any], let first = list.first as? String, !first.isEmpty else { return nil }
            return URL(string: first)
        }
        pending[path] = task
        let url = await task.value
        pending[path] = nil
        if let url { cache[path] = (url, Date().addingTimeInterval(50 * 60)) }
        return url
    }
}
