import Foundation

/// The background AI jobs (startImportRecipe and friends): the mutation is sent with a new job id
/// and the function writes its outcome to ai-jobs/<space>/<jobId>.json. Used by the editor and by
/// the Share extension, which can leave a job running and let the app pick it up later.
@MainActor
enum AIJob {
    enum Outcome: Equatable {
        case ok(Data)
        case failed(String)
    }

    /// Sends the mutation; returns the job id.
    static func start(_ client: GraphQLClient, mutation: String, variables: [String: Any], jobId: String = UUID().uuidString.lowercased()) async throws -> String {
        var vars = variables
        vars["jobId"] = jobId
        _ = try await client.run(mutation, variables: vars)
        return jobId
    }

    /// Looks once for the outcome; nil while the job is still running.
    static func check(_ client: GraphQLClient, links: FileLinks, space: String, jobId: String) async -> Outcome? {
        let path = path(space: space, jobId: jobId)
        guard let url = await links.url(for: path, ref: nil) else { return nil }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let outcome = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        _ = try? await client.run("mutation Del($paths: [String]!) { deleteFiles(paths: $paths) }", variables: ["paths": [path]])
        guard outcome["ok"] as? Bool == true else { return .failed((outcome["error"] as? String) ?? "Nu a mers.") }
        let payload = outcome["data"].flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed]) }
        return .ok(payload ?? Data("null".utf8))
    }

    /// Waits for the outcome (up to `seconds`, a bit more than the function's own limit).
    static func wait(_ client: GraphQLClient, space: String, jobId: String, seconds: Double = 150) async throws -> Any? {
        let links = FileLinks(client: client)
        let until = Date().addingTimeInterval(seconds)
        var pause: Double = 1.5
        while Date() < until {
            try await Task.sleep(for: .seconds(pause))
            pause = min(pause + 0.5, 4)
            switch await check(client, links: links, space: space, jobId: jobId) {
            case .ok(let data): return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
            case .failed(let message): throw BackendError.server(message)
            case nil: continue
            }
        }
        throw BackendError.server("Durează mai mult decât de obicei. Verifică internetul și încearcă din nou.")
    }

    nonisolated static func path(space: String, jobId: String) -> String { "ai-jobs/\(space)/\(jobId).json" }

    static let importMutation = """
    mutation Imp($jobId: String!, $url: String, $photoKeys: [String], $text: String, $idea: String, $tools: [String], $servings: Int, $diet: String) {
      startImportRecipe(jobId: $jobId, url: $url, photoKeys: $photoKeys, text: $text, idea: $idea, tools: $tools, servings: $servings, diet: $diet) { success }
    }
    """
}
