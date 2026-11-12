import Foundation
import UIKit

/// The server side of writing a recipe, like `uploadFile`, `runImport`, `suggestRecipes`,
/// `generateRecipePhoto` and `saveRecipe` in src/lib/db.ts (the same AppSync API and jobs).
@MainActor
struct RecipeServer {
    let client: GraphQLClient
    let space: String

    // MARK: Files

    /// Uploads a JPEG into recipe-photos/<space>/ and returns its path.
    func upload(jpeg: Data) async throws -> String {
        let query = "mutation Up($prefix: String!, $ext: String!, $contentType: String) { uploadUrl(prefix: $prefix, ext: $ext, contentType: $contentType) { path url } }"
        let body = try await client.run(query, variables: ["prefix": "recipe-photos", "ext": "jpg", "contentType": "image/jpeg"])
        guard let target = body["uploadUrl"] as? [String: Any], let path = target["path"] as? String,
              let raw = target["url"] as? String, let url = URL(string: raw) else {
            throw BackendError.server("Nu am putut încărca fișierul.")
        }
        var request = URLRequest(url: url, timeoutInterval: 120)
        request.httpMethod = "PUT"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        let response: URLResponse
        do {
            (_, response) = try await URLSession.shared.upload(for: request, from: jpeg)
        } catch let error as URLError where CognitoClient.isOffline(error) {
            throw BackendError.offline
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BackendError.server("Încărcarea a eșuat (\(http.statusCode))")
        }
        return path
    }

    func deleteFiles(_ paths: [String]) async {
        let clean = paths.filter { !$0.isEmpty }
        guard !clean.isEmpty else { return }
        _ = try? await client.run("mutation Del($paths: [String]!) { deleteFiles(paths: $paths) }", variables: ["paths": clean])
    }

    // MARK: AI jobs

    /// Starts AI work that runs in the background and waits for the outcome file it writes to
    /// ai-jobs/<space>/<jobId>.json (up to 150 s, a bit more than the function's own limit).
    private func runJob(_ mutation: String, _ variables: [String: Any]) async throws -> Any? {
        let jobId = try await AIJob.start(client, mutation: mutation, variables: variables)
        return try await AIJob.wait(client, space: space, jobId: jobId)
    }

    struct ImportArgs {
        var url: String?
        var photoKeys: [String]?
        var text: String?
        var idea: String?
        var tools: [String]?
        var servings: Int?
        var diet: String?
    }

    /// Reads a recipe from a link, photos or text, or writes one from an idea.
    func importRecipe(_ args: ImportArgs) async throws -> ImportedRecipe {
        var v: [String: Any] = [:]
        if let x = args.url { v["url"] = x }
        if let x = args.photoKeys { v["photoKeys"] = x }
        if let x = args.text { v["text"] = x }
        if let x = args.idea { v["idea"] = x }
        if let x = args.tools { v["tools"] = x }
        if let x = args.servings { v["servings"] = x }
        if let x = args.diet, !x.isEmpty { v["diet"] = x }
        let mutation = AIJob.importMutation
        guard let recipe = ImportedRecipe(json: try await runJob(mutation, v) as? [String: Any]) else {
            throw BackendError.server("Nu am găsit o rețetă aici.")
        }
        return recipe
    }

    /// One recipe from one or more photos (pages read together); the uploads are removed after.
    func importPhotos(_ pages: [UIImage]) async throws -> ImportedRecipe {
        var keys: [String] = []
        defer { let k = keys; Task { await deleteFiles(k) } }
        for page in pages {
            guard let jpeg = page.ktJPEG(maxSide: 2000, quality: 0.85) else { continue }
            keys.append(try await upload(jpeg: jpeg))
        }
        return try await importRecipe(ImportArgs(photoKeys: keys))
    }

    /// A few dishes that can be made from what is in the fridge.
    func suggest(ingredients: String, tools: [String], diet: String?) async throws -> [RecipeIdea] {
        let mutation = "mutation Sug($jobId: String!, $ingredients: String!, $tools: [String], $diet: String) { startSuggestRecipes(jobId: $jobId, ingredients: $ingredients, tools: $tools, diet: $diet) { success } }"
        var v: [String: Any] = ["ingredients": ingredients, "tools": tools]
        v["diet"] = diet ?? NSNull()
        let data = try await runJob(mutation, v)
        return (data as? [Any] ?? []).compactMap(RecipeIdea.init(json:))
    }

    /// "Propune cinele săptămânii": the evenings' dinners, from our recipes and a few new ones when
    /// allowed (the web's planWeek). `swapDay` asks again for that evening only.
    func planWeek(days: String, recipes: String, recent: [String], fridge: String?, diet: String?, tools: [String],
                  allowNew: Bool, swapDay: String? = nil, keep: [String]? = nil) async throws -> [PlannedDinner] {
        let mutation = """
        mutation Plan($jobId: String!, $days: String!, $recipes: String, $recent: [String], $fridge: String, $diet: String, $tools: [String], $allowNew: Boolean, $swapDay: String, $keep: [String]) {
          startPlanWeek(jobId: $jobId, days: $days, recipes: $recipes, recent: $recent, fridge: $fridge, diet: $diet, tools: $tools, allowNew: $allowNew, swapDay: $swapDay, keep: $keep) { success }
        }
        """
        var v: [String: Any] = ["days": days, "recipes": recipes, "recent": recent, "tools": tools, "allowNew": allowNew]
        v["fridge"] = fridge ?? NSNull()
        v["diet"] = diet ?? NSNull()
        v["swapDay"] = swapDay ?? NSNull()
        v["keep"] = keep ?? NSNull()
        guard let data = try await runJob(mutation, v) as? [Any] else { throw BackendError.server("Nu am putut citi planul.") }
        return data.compactMap { PlannedDinner(json: $0 as? [String: Any]) }
    }

    /// Draws a photo for the recipe with AI; returns its path.
    func generatePhoto(title: String, ingredients: [String]) async throws -> String {
        let body = try await client.run("mutation Pic($title: String!, $ingredients: [String]) { generateRecipePhoto(title: $title, ingredients: $ingredients) }",
                                        variables: ["title": title, "ingredients": ingredients])
        guard let key = body["generateRecipePhoto"] as? String, !key.isEmpty else { throw BackendError.server("Nu am putut genera poza.") }
        return key
    }

    // MARK: Saving

    /// Creates (private to our space) or updates the Recipe row; returns it as the app shows it.
    /// `facts`: nil keeps the row's values and allergens, .some(nil) clears them.
    func save(_ r: Recipe, isNew: Bool, facts: (nutrition: String?, allergens: String?)??, spaceName: String?) async throws -> Recipe {
        func orNull(_ s: String?) -> Any { s.flatMap { $0.isEmpty ? nil : $0 } ?? NSNull() }
        var input: [String: Any] = [
            "id": r.id, "title": r.title, "category": orNull(r.category), "servings": r.servings.map { $0 as Any } ?? NSNull(), "minutes": r.minutes.map { $0 as Any } ?? NSNull(),
            "ingredients": r.ingredients, "steps": r.steps, "notes": orNull(r.notes), "sourceUrl": orNull(r.sourceUrl),
            "photoKey": orNull(r.photoKey), "stepPhotoKeys": r.stepPhotoKeys.contains { !$0.isEmpty } ? r.stepPhotoKeys as Any : NSNull(),
        ]
        if let facts {
            input["nutrition"] = orNull(facts?.nutrition)
            input["allergens"] = orNull(facts?.allergens)
        }
        let field = isNew ? "createRecipe" : "updateRecipe"
        if isNew {
            input["spaceGroups"] = [space]
            input["readerGroups"] = [String]()
            if let spaceName { input["spaceName"] = spaceName }
        }
        let type = isNew ? "CreateRecipeInput" : "UpdateRecipeInput"
        let body = try await client.run("mutation Save($input: \(type)!) { \(field)(input: $input) { \(Recipe.fields) } }", variables: ["input": input])
        guard let row = body[field] as? [String: Any], let saved = Recipe(row: row, mySpace: space) else {
            throw BackendError.server("Rețeta nu s-a salvat. Încearcă din nou.")
        }
        return saved
    }
}

extension UIImage {
    /// The photo as a JPEG at most `maxSide` px on its longer side (resizeImage.ts).
    func ktJPEG(maxSide: CGFloat = 1600, quality: CGFloat = 0.82) -> Data? {
        let longest = max(size.width, size.height)
        let scale = min(1, maxSide / max(longest, 1))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: quality)
    }
}
