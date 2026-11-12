import AVFoundation
import MediaPlayer
import Observation
import UIKit

/// Plays stories with AVPlayer: keeps going with the screen off, shows on the Lock Screen and in
/// the Dynamic Island with real controls, plays a queue (the folder it was started from), skips
/// 15 seconds and, at bedtime, lowers the volume before it stops.
@MainActor @Observable
final class StoryPlayer {
    enum Sleep: Hashable, CaseIterable {
        case off, afterStory, minutes15, minutes30
        var label: String {
            switch self {
            case .off: "Oprit"
            case .afterStory: "După 1 poveste"
            case .minutes15: "15 min"
            case .minutes30: "30 min"
            }
        }
    }

    private(set) var current: Story?
    private(set) var queue: [Story] = []
    private(set) var isPlaying = false
    private(set) var isLoading = false
    private(set) var position: Double = 0
    private(set) var duration: Double = 0
    private(set) var failure: String?
    var rate: Float = 1 { didSet { if isPlaying { player.rate = rate }; updateNowPlaying() } }
    var sleep: Sleep = .off { didSet { sleepDeadline = sleep.deadline(from: Date()) } }
    /// The full-screen player sheet.
    var showsPlayer = false

    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var sleepDeadline: Date?
    @ObservationIgnored private var artwork: MPMediaItemArtwork?
    @ObservationIgnored private weak var store: StoryStore?
    /// The volume is lowered over this many seconds before a sleep stop.
    nonisolated static let fadeSeconds: Double = 30

    /// One player for the whole app (it owns the Lock Screen controls).
    static let shared = StoryPlayer()

    private init() {
        player.automaticallyWaitsToMinimizeStalling = true
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time.seconds) }
        }
        setUpRemoteCommands()
    }

    var remaining: Double { max(0, duration - position) }
    var hasNext: Bool { nextIndex != nil }
    private var nextIndex: Int? {
        guard let current, let i = queue.firstIndex(where: { $0.id == current.id }), i + 1 < queue.count else { return nil }
        return i + 1
    }

    // MARK: Playing

    /// Starts `story` (from where it was paused), with `queue` to continue through.
    func play(_ story: Story, queue: [Story]? = nil, store: StoryStore) async {
        self.store = store
        self.queue = queue ?? [story]
        if current?.id == story.id {
            resume()
            return
        }
        savePosition()
        PlaybackMemory.markPlayed(story.id)
        current = story
        position = PlaybackMemory.position(story.id)
        duration = story.durationSec ?? 0
        failure = nil
        artwork = nil
        isLoading = true
        updateNowPlaying()
        if LaunchOptions.demoAccount != nil {
            // Screenshots: no server, so show the story a third of the way in, paused.
            position = duration * 0.34
            isLoading = false
            return
        }
        let local = store.offline.localFile(story.id)
        var remote: URL?
        if local == nil, let links = store.links { remote = await links.url(for: story.audioKey, ref: story.fileRef) }
        guard let url = local ?? remote else {
            isLoading = false
            failure = "Povestea nu se poate deschide acum. Verifică internetul."
            return
        }
        guard current?.id == story.id else { return }
        activateSession()
        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        observeEnd(of: item)
        let start = position
        if start > 5, duration == 0 || start < duration - 5 {
            _ = await player.seek(to: CMTime(seconds: start, preferredTimescale: 600))
        }
        player.volume = 1
        player.playImmediately(atRate: rate)
        isPlaying = true
        isLoading = false
        Task { [weak self] in await self?.loadDetails(item: item, story: story) }
    }

    func resume() {
        guard current != nil else { return }
        activateSession()
        player.playImmediately(atRate: rate)
        isPlaying = true
        updateNowPlaying()
    }

    func pause() {
        player.pause()
        isPlaying = false
        savePosition()
        updateNowPlaying()
    }

    func togglePlay() { isPlaying ? pause() : resume() }

    func skip(_ seconds: Double) { seek(to: position + seconds) }

    func seek(to seconds: Double) {
        let target = min(max(0, seconds), duration > 0 ? duration - 0.5 : seconds)
        position = target
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        updateNowPlaying()
    }

    func next() async {
        guard let i = nextIndex, let store else { return }
        await play(queue[i], queue: queue, store: store)
    }

    func previous() async {
        guard let current, let store else { return }
        if position > 5 { seek(to: 0); return }
        if let i = queue.firstIndex(where: { $0.id == current.id }), i > 0 {
            await play(queue[i - 1], queue: queue, store: store)
        } else {
            seek(to: 0)
        }
    }

    /// Stops and hides the mini-player.
    func close() {
        savePosition()
        player.pause()
        player.replaceCurrentItem(with: nil)
        current = nil
        isPlaying = false
        showsPlayer = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: Time, sleep and the end of a story

    private func tick(_ seconds: Double) {
        guard current != nil, seconds.isFinite else { return }
        position = seconds
        if Int(seconds) % 5 == 0 { savePosition() }
        applySleepFade()
    }

    private func applySleepFade() {
        guard isPlaying else { return }
        let left: Double
        switch sleep {
        case .off: return
        case .afterStory:
            guard duration > 0 else { return }
            left = remaining
        case .minutes15, .minutes30:
            guard let sleepDeadline else { return }
            left = sleepDeadline.timeIntervalSinceNow
        }
        player.volume = Float(StoryPlayer.fadeVolume(secondsLeft: left))
        if left <= 0, sleep != .afterStory { sleepStop() }
    }

    /// 1 until the last `fadeSeconds`, then down to 0, eased so the drop is gentle.
    nonisolated static func fadeVolume(secondsLeft: Double, fade: Double = fadeSeconds) -> Double {
        guard secondsLeft < fade else { return 1 }
        let t = max(0, secondsLeft) / fade
        return t * t
    }

    private func sleepStop() {
        pause()
        player.volume = 1
        sleep = .off
    }

    private func observeEnd(of item: AVPlayerItem) {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.didFinish() }
        }
    }

    private func didFinish() {
        guard let finished = current else { return }
        PlaybackMemory.setPosition(finished.id, nil)
        position = 0
        if sleep == .afterStory {
            sleepStop()
            return
        }
        if nextIndex != nil {
            Task { await next() }
        } else {
            isPlaying = false
            updateNowPlaying()
        }
    }

    private func savePosition() {
        guard let current else { return }
        let nearEnd = duration > 0 && position > duration - 5
        PlaybackMemory.setPosition(current.id, nearEnd ? nil : position)
    }

    private func loadDetails(item: AVPlayerItem, story: Story) async {
        if let seconds = try? await item.asset.load(.duration).seconds, seconds.isFinite, seconds > 0, current?.id == story.id {
            duration = seconds
            updateNowPlaying()
        }
        guard let key = story.coverKey, let links = store?.links, let url = await links.url(for: key, ref: story.fileRef),
              let loaded = try? await URLSession.shared.data(from: url), let image = UIImage(data: loaded.0),
              current?.id == story.id else { return }
        artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        updateNowPlaying()
    }

    // MARK: Lock Screen and Control Center

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio, options: [])
        try? session.setActive(true)
    }

    private func updateNowPlaying() {
        guard let current else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: current.title,
            MPMediaItemPropertyArtist: "Bucătăria",
            MPMediaItemPropertyAlbumTitle: StoryLibrary.folderOf(current),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(rate) : 0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        let commands = MPRemoteCommandCenter.shared()
        commands.nextTrackCommand.isEnabled = hasNext
    }

    private func setUpRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.resume() }; return .success }
        c.pauseCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.pause() }; return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.togglePlay() }; return .success }
        c.skipBackwardCommand.preferredIntervals = [15]
        c.skipForwardCommand.preferredIntervals = [15]
        c.skipBackwardCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.skip(-15) }; return .success }
        c.skipForwardCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.skip(15) }; return .success }
        c.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let time = event.positionTime
            MainActor.assumeIsolated { self?.seek(to: time) }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated { Task { await self?.next() } }
            return .success
        }
        c.previousTrackCommand.isEnabled = false
    }
}

extension StoryPlayer.Sleep {
    func deadline(from now: Date) -> Date? {
        switch self {
        case .minutes15: now.addingTimeInterval(15 * 60)
        case .minutes30: now.addingTimeInterval(30 * 60)
        case .off, .afterStory: nil
        }
    }
}

/// "3:04"
func clockTime(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.isFinite ? seconds : 0))
    return "\(s / 60):\(String(format: "%02d", s % 60))"
}
