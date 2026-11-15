import SwiftUI
import UIKit

/// The square picture iOS shows for the playing story on the Lock Screen, in Control Center and,
/// over Bluetooth, on the car's screen.
///
/// Car stereos often read the picture only once, when the track starts. So the player waits for
/// it (a short while) before the first title goes out, the picture is a small square every car can
/// take, and a story without a cover gets its drawn cover instead of nothing.
@MainActor
enum NowPlayingArt {
    /// Enough for any car screen, small enough for Bluetooth (AVRCP cover art) to send quickly.
    static let side: CGFloat = 600

    private static var made: [String: UIImage] = [:]
    private static var running: [String: Task<UIImage?, Never>] = [:]

    private static func key(_ s: Story) -> String {
        [s.id, s.coverKey ?? "", s.scene.map(String.init) ?? "", s.emoji, s.title].joined(separator: "|")
    }

    /// The picture for `story`: its cover when it arrives within `wait` seconds (`isCover` true),
    /// otherwise the drawn cover. A cover that comes later is in `later(_:links:)`.
    static func image(for story: Story, links: FileLinks?, wait: Double = 1.5) async -> (image: UIImage, isCover: Bool) {
        if let hit = made[key(story)] { return (hit, story.coverKey != nil) }
        guard story.coverKey != nil else {
            let drawing = drawn(story)
            made[key(story)] = drawing
            return (drawing, false)
        }
        if let cover = await first(of: picture(story, links: links), within: wait) { return (cover, true) }
        return (drawn(story), false)
    }

    /// The cover once it has arrived, however long it took (nil if it can't be loaded).
    static func later(_ story: Story, links: FileLinks?) async -> UIImage? {
        guard story.coverKey != nil else { return nil }
        return await picture(story, links: links).value
    }

    /// Starts making the picture now (for the story that plays next), without waiting for it.
    static func prepare(_ story: Story, links: FileLinks?) {
        guard made[key(story)] == nil else { return }
        if story.coverKey == nil { made[key(story)] = drawn(story) } else { _ = picture(story, links: links) }
    }

    private static func picture(_ story: Story, links: FileLinks?) -> Task<UIImage?, Never> {
        let k = key(story)
        if let task = running[k] { return task }
        if made.count > 24 { made.removeAll() }
        let task = Task<UIImage?, Never> {
            guard let cover = await coverImage(story, links: links) else { running[k] = nil; return nil }
            let square = squared(cover)
            made[k] = square
            running[k] = nil
            return square
        }
        running[k] = task
        return task
    }

    private static func coverImage(_ story: Story, links: FileLinks?) async -> UIImage? {
        guard let key = story.coverKey else { return nil }
        if let hit = CoverImages.shared.image(key) { return hit }
        if let demo = DemoPhotos.cover(key) { return demo }
        guard let links, let url = await links.url(for: key, ref: story.fileRef),
              let loaded = try? await URLSession.shared.data(from: url), let picture = UIImage(data: loaded.0) else { return nil }
        CoverImages.shared.keep(picture, key)
        return picture
    }

    /// The cover filling a `side` square (like the covers in the app), on cream for transparent drawings.
    private static func squared(_ image: UIImage) -> UIImage {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE6 / 255, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            let w = image.size.width, h = image.size.height
            guard w > 0, h > 0 else { return }
            let scale = max(side / w, side / h)
            let fit = CGSize(width: w * scale, height: h * scale)
            image.draw(in: CGRect(x: (side - fit.width) / 2, y: (side - fit.height) / 2, width: fit.width, height: fit.height))
        }
    }

    /// The drawn cover (sky, glow, hills, emoji), the same one the app shows for a story without a picture.
    private static func drawn(_ story: Story) -> UIImage {
        let renderer = ImageRenderer(content: DrawnCover(scene: CoverScene.of(story), emoji: story.emoji).frame(width: side, height: side))
        renderer.scale = 1
        renderer.isOpaque = true
        return renderer.uiImage ?? UIImage()
    }

    /// The task's value if it is ready within `seconds`, otherwise nil (the task keeps going).
    private static func first(of task: Task<UIImage?, Never>, within seconds: Double) async -> UIImage? {
        let once = Once()
        return await withCheckedContinuation { (continuation: CheckedContinuation<UIImage?, Never>) in
            once.start(continuation)
            Task { @MainActor in once.finish(await task.value) }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                once.finish(nil)
            }
        }
    }

    /// Resumes the wait once, with whichever comes first: the picture or the time limit.
    private final class Once: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<UIImage?, Never>?
        func start(_ continuation: CheckedContinuation<UIImage?, Never>) {
            lock.withLock { self.continuation = continuation }
        }
        func finish(_ value: UIImage?) {
            let waiting = lock.withLock { () -> CheckedContinuation<UIImage?, Never>? in
                defer { continuation = nil }
                return continuation
            }
            waiting?.resume(returning: value)
        }
    }
}
