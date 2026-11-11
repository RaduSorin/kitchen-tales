import Observation
import SwiftUI
import UIKit

/// Everything the recipe editor holds while it is open (RecipeEdit.tsx): the way in, the recipe
/// being written, its photos and steps, the AI work running and saving. The views only show it.
@MainActor @Observable
final class RecipeDraft {
    enum Mode { case choose, paste, photo, ai, edit }
    enum AiKind { case craving, fridge }
    enum Tab: String, CaseIterable, Identifiable {
        case details = "Detalii", ingredients = "Ingrediente", steps = "Pași", notes = "Note"
        var id: String { rawValue }
    }

    struct Step: Identifiable, Equatable {
        let id = UUID()
        var text = ""
        /// The saved photo of the step, or nil.
        var photoKey: String?
        /// A photo picked now, uploaded on save.
        var photo: UIImage?
    }

    /// The editor opened on a saved recipe (nil: a new one).
    let original: Recipe?
    var isNew: Bool { original == nil }

    var mode: Mode
    var recipe: Recipe
    var ingredients = ""
    var steps: [Step] = []
    var tab: Tab = .details
    /// The step being edited: only it shows its tools.
    var openStep: UUID?
    /// A photo picked for the recipe, uploaded on save.
    var photo: UIImage?

    // The ways in
    var paste = ""
    /// Dictated text has no headings, so it goes to the AI instead of the local parser.
    var dictated = false
    var aiKind: AiKind = .craving
    var idea = ""
    var fridge = ""
    var genServings = 4
    /// Tools left out for this one recipe (all of the family's tools are used by default).
    var skipTools: [String] = []
    var ideas: [RecipeIdea]?
    var pages: [UIImage] = []

    /// What is running ("Scriu rețeta…"), shown with a spinner instead of the page.
    var importing = ""
    var found: String?
    var error = ""
    var saving = false
    var aiBusy = false

    @ObservationIgnored private let server: RecipeServer?
    @ObservationIgnored private var aiJob: Task<String?, Never>?
    @ObservationIgnored private var aiUnsaved: String?
    /// Photos this editor put in the cloud that no saved recipe uses yet (deleted if not kept).
    @ObservationIgnored private var made: Set<String> = []
    /// Counts photos you chose yourself; an AI photo that finishes after one of them is dropped.
    @ObservationIgnored private var picked = 0
    /// The values and allergens an import worked out, and the ingredients they were for.
    @ObservationIgnored private var facts: (nutrition: String?, allergens: String?)?
    @ObservationIgnored private var factsFor: String?
    @ObservationIgnored private var base: Snapshot

    init(recipe original: Recipe?, server: RecipeServer?, startMode: Mode? = nil) {
        self.original = original
        self.server = server
        let r = original ?? Recipe(id: UUID().uuidString.lowercased(), title: "", category: "")
        recipe = r
        mode = original != nil ? .edit : (startMode ?? .choose)
        if let original {
            ingredients = original.ingredients.joined(separator: "\n")
            steps = original.steps.enumerated().map { i, text in Step(text: text, photoKey: original.stepPhoto(i)) }
        }
        base = Snapshot(Recipe(id: "", title: "", category: ""), "", [], false)
        base = snapshot
    }

    // MARK: Unsaved changes

    private struct Snapshot: Equatable {
        var title: String, category: String, servings: Int?, minutes: Int?, notes: String?, source: String?, photoKey: String?
        var ingredients: String
        var steps: [String]
        var newPhoto: Bool

        init(_ r: Recipe, _ ingredients: String, _ steps: [Step], _ newPhoto: Bool) {
            title = r.title; category = r.category; servings = r.servings; minutes = r.minutes
            notes = r.notes ?? ""; source = r.sourceUrl ?? ""; photoKey = r.photoKey
            self.ingredients = ingredients
            self.steps = steps.map { "\($0.text)|\($0.photoKey ?? "")|\($0.photo != nil)" }
            self.newPhoto = newPhoto
        }
    }

    private var snapshot: Snapshot { Snapshot(recipe, ingredients, steps, photo != nil) }

    /// Something changed since the editor opened: leaving asks first.
    var dirty: Bool { mode == .edit && snapshot != base && !saving }

    // MARK: Filling the recipe from an import

    private func fill(_ title: String, _ ingredientLines: [String], _ stepTexts: [String]) {
        if !title.isEmpty { recipe.title = title }
        ingredients = ingredientLines.joined(separator: "\n")
        steps = stepTexts.map { Step(text: $0) }
        found = EditorText.foundLine(ingredients: ingredientLines, steps: stepTexts.count)
        mode = .edit
    }

    private func apply(_ x: ImportedRecipe) {
        if let key = x.photoKey { made.insert(key) }
        if let c = x.category { recipe.category = c }
        recipe.servings = x.servings
        recipe.minutes = x.minutes
        recipe.notes = x.notes
        recipe.sourceUrl = x.sourceUrl
        if let key = x.photoKey { recipe.photoKey = key }
        fill(x.title, x.ingredients, x.steps)
        facts = (x.nutrition, x.allergens)
        factsFor = "\(x.ingredients.joined(separator: "\n"))|\(x.servings.map(String.init) ?? "")"
    }

    private func run(_ label: String, _ work: @escaping @MainActor (RecipeServer) async throws -> ImportedRecipe) {
        guard let server else { error = "Importul nu a reușit: \(BackendError.notConfigured.localizedDescription)"; return }
        importing = label
        error = ""
        Task {
            do {
                let x = try await work(server)
                apply(x)
                Haptics.success()
                // No photo from the source: draw one with AI in the background.
                if x.photoKey == nil && original?.photoKey == nil && photo == nil { makeAiPhoto() }
            } catch {
                self.error = "Importul nu a reușit: \(Self.text(error))"
                Haptics.warning()
            }
            importing = ""
        }
    }

    static func text(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }

    // MARK: The ways in

    func importText() {
        let text = paste.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if let link = EditorText.asLink(text) {
            let site = EditorText.videoSite(link)
            run(site.map { "Citesc rețeta din videoclipul de pe \($0)…" } ?? "Citesc rețeta de pe site…") {
                try await $0.importRecipe(.init(url: link))
            }
            return
        }
        let p = EditorText.parseRecipe(text)
        // Clear "Ingrediente / Mod de preparare" text is split on the phone; anything looser is read by the AI.
        if !dictated && !p.ingredients.isEmpty && !p.steps.isEmpty {
            fill(p.title, p.ingredients, p.steps)
        } else {
            run("Citesc rețeta…") { try await $0.importRecipe(.init(text: text)) }
        }
    }

    func addPages(_ images: [UIImage]) {
        guard !images.isEmpty else { return }
        pages = Array((pages + images).prefix(EditorText.maxPages))
        mode = .photo
    }

    func importPhotos() {
        guard !pages.isEmpty else { return }
        let pages = self.pages
        run(pages.count > 1 ? "Citesc rețeta din \(pages.count) poze…" : "Citesc rețeta din poză…") { try await $0.importPhotos(pages) }
    }

    func tools(_ all: [String]) -> [String] { all.filter { !skipTools.contains($0) } }

    func generate(tools: [String], diet: String?) {
        let text = idea.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let servings = genServings
        run("Scriu rețeta…") { try await $0.importRecipe(.init(idea: text, tools: tools, servings: servings, diet: diet)) }
    }

    func suggest(tools: [String], diet: String?) {
        let text = fridge.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let server else { error = "Nu am putut propune rețete: \(BackendError.notConfigured.localizedDescription)"; return }
        importing = "Mă uit ce se poate găti…"
        error = ""
        Task {
            do {
                let xs = try await server.suggest(ingredients: text, tools: tools, diet: diet)
                if xs.isEmpty { error = "Nu am găsit nicio idee. Adaugă mai multe ingrediente." }
                ideas = xs
            } catch {
                self.error = "Nu am putut propune rețete: \(Self.text(error))"
            }
            importing = ""
        }
    }

    func pick(_ x: RecipeIdea, tools: [String], diet: String?) {
        let brief = EditorText.ideaBrief(x, fridge: fridge)
        let servings = genServings
        run("Scriu rețeta „\(x.title)”…") { try await $0.importRecipe(.init(idea: brief, tools: tools, servings: servings, diet: diet)) }
    }

    // MARK: Photos

    func pickPhoto(_ image: UIImage) {
        picked += 1
        photo = image
    }

    /// Draws a photo with AI for the title and ingredients (Save waits for it).
    func makeAiPhoto() {
        let title = recipe.title.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty, aiJob == nil, let server else { return }
        aiBusy = true
        let before = picked
        let ingredients = EditorText.lines(self.ingredients)
        aiJob = Task {
            defer { aiJob = nil; aiBusy = false }
            do {
                let key = try await server.generatePhoto(title: title, ingredients: ingredients)
                // You picked your own photo while the AI was drawing: yours stays.
                if picked != before { await server.deleteFiles([key]); return nil }
                if let old = aiUnsaved { await server.deleteFiles([old]) }
                aiUnsaved = key
                made.insert(key)
                photo = nil
                recipe.photoKey = key
                return key
            } catch {
                self.error = "Poza AI nu a reușit: \(Self.text(error))"
                return nil
            }
        }
    }

    // MARK: Steps

    @discardableResult
    func addStep(at index: Int? = nil) -> UUID {
        let s = Step()
        steps.insert(s, at: min(index ?? steps.count, steps.count))
        openStep = s.id
        return s.id
    }

    /// "Dictează un pas": fills the last step if it is still empty, otherwise starts a new one.
    func stepForDictation() -> UUID {
        if let last = steps.last, last.text.trimmingCharacters(in: .whitespaces).isEmpty, last.photoKey == nil, last.photo == nil {
            openStep = last.id
            return last.id
        }
        return addStep()
    }

    func setStepText(_ id: UUID, _ text: String) {
        guard let i = steps.firstIndex(where: { $0.id == id }) else { return }
        steps[i].text = text.prefix(1).uppercased() + text.dropFirst()
    }

    func removeStep(_ id: UUID) { steps.removeAll { $0.id == id } }

    func moveStep(from: Int, to: Int) {
        guard from != to, steps.indices.contains(from), steps.indices.contains(to) else { return }
        let s = steps.remove(at: from)
        steps.insert(s, at: to)
    }

    // MARK: Saving

    /// Saves (create or update); returns the saved recipe, or nil with `error` set.
    func save(store: RecipeStore, spaceName: String?) async -> Recipe? {
        let title = recipe.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { error = "Scrie un titlu pentru rețetă."; Haptics.warning(); return nil }
        saving = true
        error = ""
        let lines = EditorText.lines(ingredients)
        let kept = steps.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        var next = recipe
        next.title = title
        next.ingredients = lines
        next.steps = kept.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
        next.notes = recipe.notes.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
        next.sourceUrl = recipe.sourceUrl.flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0.trimmingCharacters(in: .whitespaces) }
        guard let server else {
            // Screenshots: kept on the phone only.
            next.stepPhotoKeys = kept.map { $0.photoKey ?? "" }
            store.saved(next)
            Haptics.success()
            return next
        }
        do {
            // An AI photo still being drawn is part of this save.
            if let job = aiJob, let key = await job.value { next.photoKey = key }
            if let photo, let jpeg = photo.ktJPEG() { next.photoKey = try await server.upload(jpeg: jpeg) }
            var stepKeys: [String] = []
            for s in kept {
                if let image = s.photo, let jpeg = image.ktJPEG() { stepKeys.append(try await server.upload(jpeg: jpeg)) }
                else { stepKeys.append(s.photoKey ?? "") }
            }
            next.stepPhotoKeys = stepKeys
            // Values and allergens stay only while the ingredients and servings are the ones they were worked out for.
            let now = "\(lines.joined(separator: "\n"))|\(next.servings.map(String.init) ?? "")"
            let was = factsFor ?? original.map { "\($0.ingredients.joined(separator: "\n"))|\($0.servings.map(String.init) ?? "")" }
            let keep: (nutrition: String?, allergens: String?)?? = now == was ? (factsFor != nil ? .some(facts) : nil) : .some(nil)
            let saved = try await server.save(next, isNew: isNew, facts: keep, spaceName: spaceName)
            // Clean up photos that were replaced or removed.
            var gone: [String] = []
            if let old = original?.photoKey, old != saved.photoKey { gone.append(old) }
            gone += made.filter { $0 != saved.photoKey }
            made.removeAll()
            gone += (original?.stepPhotoKeys ?? []).filter { !$0.isEmpty && !stepKeys.contains($0) }
            await server.deleteFiles(gone)
            store.saved(saved)
            Haptics.success()
            return saved
        } catch {
            self.error = "Nu am putut salva rețeta: \(Self.text(error))"
            saving = false
            Haptics.warning()
            return nil
        }
    }

    /// Leaving without saving: the photos this editor made go.
    func discard() {
        aiJob?.cancel()
        let files = Array(made)
        made.removeAll()
        guard let server, !files.isEmpty else { return }
        Task { await server.deleteFiles(files) }
    }
}
