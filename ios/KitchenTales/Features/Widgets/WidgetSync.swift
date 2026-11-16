import UIKit
import WidgetKit

/// Keeps the widgets' copy (`WidgetSnapshot` and small images in the App Group) up to date with
/// what the app has: tonight's stories, the plan of the next days, today's ideas, the list.
@MainActor
enum WidgetSync {
    private static var pending: Task<Void, Never>?

    /// After a change; a burst of changes is written once, a second later.
    static func update(recipes: RecipeStore?, stories: StoryStore?) {
        guard LaunchOptions.demoAccount == nil else { return }
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await write(recipes: recipes, stories: stories)
        }
    }

    /// Signed out: the widgets ask to open the app.
    static func clear() {
        pending?.cancel()
        if WidgetFiles.write(.empty) { WidgetCenter.shared.reloadAllTimelines() }
        CookLiveActivity.end()
    }

    static func write(recipes: RecipeStore?, stories: StoryStore?) async {
        var s = WidgetFiles.read()
        s.signedIn = true
        let bedtime = Bedtime.shared.settings
        s.bedtime = bedtime.enabled ? Bedtime.timeLabel(bedtime) : nil
        s.bedtimeDays = bedtime.days.sorted()
        var keep = Set<String>()
        if let stories {
            let list = Bedtime.tonight(stories.stories, folder: bedtime.enabled ? bedtime.folder : nil, count: 3,
                                       last: PlaybackMemory.lastStoryId, played: PlaybackMemory.played,
                                       position: PlaybackMemory.position)
            var items: [WidgetSnapshot.StoryItem] = []
            for story in list {
                let image = await WidgetImages.save(key: story.coverKey, ref: story.fileRef, links: stories.links)
                if let image { keep.insert(image) }
                items.append(WidgetSnapshot.StoryItem(id: story.id, title: story.title, detail: story.detailLine,
                                                      minutes: story.minutesLabel, image: image, progress: progress(story)))
            }
            s.tonight = items
        } else {
            keep.formUnion(s.tonight.compactMap(\.image))
        }
        if let recipes {
            var days: [String: [WidgetSnapshot.RecipeItem]] = [:]
            let calendar = Calendar.current
            for offset in 0..<7 {
                guard let day = calendar.date(byAdding: .day, value: offset, to: Date()) else { continue }
                var seen = Set<String>()
                var items: [WidgetSnapshot.RecipeItem] = []
                for entry in recipes.entries(on: day) where seen.insert(entry.recipeId).inserted {
                    guard let recipe = recipes.recipe(entry.recipeId) else { continue }
                    // Only today's and tomorrow's photos are shown.
                    var image: String?
                    if offset < 2 { image = await WidgetImages.save(key: recipe.photoKey, ref: recipe.fileRef, links: recipes.links) }
                    if let image { keep.insert(image) }
                    items.append(item(recipe, why: nil, image: image))
                }
                if !items.isEmpty { days[RecipeText.dayKey(day)] = items }
            }
            s.days = days
            var ideas: [WidgetSnapshot.RecipeItem] = []
            for idea in ideaList(recipes) {
                let image = await WidgetImages.save(key: idea.recipe.photoKey, ref: idea.recipe.fileRef, links: recipes.links)
                if let image { keep.insert(image) }
                ideas.append(item(idea.recipe, why: idea.why, image: image))
            }
            s.ideas = ideas
            s.shoppingLeft = recipes.shopping.filter { !$0.checked }.count
        } else {
            keep.formUnion(s.days.values.flatMap { $0 }.compactMap(\.image))
            keep.formUnion(s.ideas.compactMap(\.image))
        }
        WidgetImages.removeAll(except: keep)
        if WidgetFiles.write(s) { WidgetCenter.shared.reloadAllTimelines() }
    }

    /// Up to six ideas: today's three, then the next ones "Alte idei" would show.
    private static func ideaList(_ recipes: RecipeStore) -> [TodayIdea] {
        var out: [TodayIdea] = []
        for round in 0..<3 {
            for idea in TodayIdeas.ideas(recipes.recipes, logs: recipes.logsById, exclude: recipes.plannedThisWeek, round: round)
            where !out.contains(where: { $0.recipe.id == idea.recipe.id }) && out.count < 6 {
                out.append(idea)
            }
        }
        return out
    }

    private static func item(_ r: Recipe, why: String?, image: String?) -> WidgetSnapshot.RecipeItem {
        let minutes = r.minutes.map(RecipeText.formatMinutes)
        let meta = [minutes, r.servings.map { "\($0) porții" }].compactMap { $0 }.joined(separator: " · ")
        return WidgetSnapshot.RecipeItem(id: r.id, title: r.title, category: r.category, minutes: minutes,
                                         meta: meta, why: why, image: image)
    }

    private static func progress(_ story: Story) -> Double? {
        let at = PlaybackMemory.position(story.id)
        guard at > 5, let total = story.durationSec, total > 0 else { return nil }
        return min(1, at / total)
    }
}

/// Small JPEG copies of covers and photos for the widgets.
@MainActor
enum WidgetImages {
    /// The file name of the image for `key`, downloading it first if needed; nil without one.
    static func save(key: String?, ref: String, links: FileLinks?) async -> String? {
        guard let key, !key.isEmpty else { return nil }
        let name = WidgetRules.fileName(key)
        let url = WidgetFiles.imageURL(name)
        if FileManager.default.fileExists(atPath: url.path) { return name }
        var image = CoverImages.shared.image(key)
        if image == nil, let links, let link = await links.url(for: key, ref: ref),
           let loaded = try? await URLSession.shared.data(from: link) {
            image = UIImage(data: loaded.0)
        }
        guard let image, let data = jpeg(image, side: 600) else { return nil }
        try? data.write(to: url, options: .atomic)
        return name
    }

    /// The image scaled so its longer side is at most `side` pixels.
    static func jpeg(_ image: UIImage, side: CGFloat) -> Data? {
        let longest = max(image.size.width, image.size.height)
        guard longest > 0 else { return nil }
        let scale = min(1, side / longest)
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return small.jpegData(compressionQuality: 0.8)
    }

    /// Drops the copies nothing shows any more (the cooking photos stay).
    static func removeAll(except keep: Set<String>) {
        let folder = WidgetFiles.folder
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
        for file in files where file.hasPrefix("img-") && !keep.contains(file) {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(file))
        }
    }
}
