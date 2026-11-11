import Foundation
import Observation

/// Stories saved on this phone, so they play without internet (in the car, at grandma's).
/// One audio file per story in the device cache; it goes when another account signs in.
@MainActor @Observable
final class OfflineAudio {
    private(set) var saved: Set<String> = []
    /// Story id → its file name ("<id>.mp3"); the extension tells AVPlayer the format.
    @ObservationIgnored private var files: [String: String] = [:]
    /// Stories being downloaded now.
    private(set) var downloading: Set<String> = []
    private(set) var lastError: String?

    @ObservationIgnored private let folder: URL
    @ObservationIgnored private let session: URLSession

    init(cache: DeviceCache = .shared, session: URLSession = .shared) {
        folder = cache.folder("audio")
        self.session = session
        for name in (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? [] where !name.hasPrefix(".") {
            files[(name as NSString).deletingPathExtension] = name
        }
        saved = Set(files.keys)
    }

    /// The saved file, if this story is on the phone.
    func localFile(_ id: String) -> URL? { files[id].map { folder.appendingPathComponent($0) } }

    /// "<id>.<extension of the stored file>", with anything odd in the id replaced.
    nonisolated static func fileName(id: String, audioKey: String) -> String {
        let safe = String(id.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
        let ext = (audioKey as NSString).pathExtension.lowercased()
        return safe + "." + (ext.isEmpty || ext.count > 4 ? "mp3" : ext)
    }

    /// Downloads every story that is not on the phone yet, one after another.
    func download(_ stories: [Story], links: FileLinks?) async {
        for story in stories where !saved.contains(story.id) {
            await download(story, links: links)
        }
    }

    func download(_ story: Story, links: FileLinks?) async {
        guard !saved.contains(story.id), !downloading.contains(story.id) else { return }
        guard let links, let url = await links.url(for: story.audioKey, ref: story.fileRef) else {
            lastError = "Nu am putut descărca „\(story.title)”. Verifică internetul."
            return
        }
        downloading.insert(story.id)
        defer { downloading.remove(story.id) }
        do {
            let (temp, response) = try await session.download(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw BackendError.server("HTTP \(http.statusCode)")
            }
            let name = Self.fileName(id: story.id, audioKey: story.audioKey)
            var target = folder.appendingPathComponent(name)
            try? FileManager.default.removeItem(at: target)
            try FileManager.default.moveItem(at: temp, to: target)
            // Re-downloadable, so it stays out of iCloud backups.
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? target.setResourceValues(values)
            files[story.id] = name
            saved.insert(story.id)
            lastError = nil
        } catch {
            lastError = "Nu am putut descărca „\(story.title)”."
        }
    }

    func remove(_ ids: [String]) {
        for id in ids {
            if let url = localFile(id) { try? FileManager.default.removeItem(at: url) }
            files[id] = nil
            saved.remove(id)
        }
    }

    /// Drops files of stories that are no longer in the library (deleted on the web).
    func prune(keeping ids: Set<String>) {
        remove(saved.subtracting(ids).map { $0 })
    }

    /// Space the saved stories take, for Profil ("120 MB").
    var sizeLabel: String {
        let bytes = saved.reduce(Int64(0)) { total, id in
            let size = (try? localFile(id)?.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            return total + Int64(size)
        }
        return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    func clearError() { lastError = nil }

    /// Screenshots (`-demo`): show some stories as saved without files.
    func showAsSaved(_ ids: [String]) {
        #if DEBUG
        saved.formUnion(ids)
        #endif
    }
}
