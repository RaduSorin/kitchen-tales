import AVFoundation
import MediaPlayer
import Observation
import UIKit

/// Plays stories with AVPlayer: keeps going with the screen off, shows on the Lock Screen and in
/// the Dynamic Island with real controls, plays a queue (the folder it was started from), skips
/// 15 seconds and, at bedtime, lowers the volume before it stops.
@MainActor @Observable
final class StoryPlayer {
    /// "După N povești" (the web's cycle): the player stops by itself after this many stories.
    nonisolated static let stopChoices = [1, 2, 3, 5]
    private static let stopKey = "kt-stop-after"
    private static let shuffleKey = "kt-shuffle"

    private(set) var current: Story?
    private(set) var queue: [Story] = []
    /// The story playing comes from the phone's copy (for the offline sticker).
    @ObservationIgnored private var fromDevice = false
    private(set) var isPlaying = false
    private(set) var isLoading = false
    private(set) var position: Double = 0
    private(set) var duration: Double = 0
    private(set) var failure: String?
    var rate: Float = 1 { didSet { if isPlaying { player.rate = rate }; updateNowPlaying() } }
    /// Stop after this many stories in a row (1, 2, 3 or 5), remembered like on the web.
    var stopAfter: Int = StoryPlayer.savedStopAfter() {
        didSet { played = 0; UserDefaults.standard.set(stopAfter, forKey: Self.stopKey) }
    }
    /// "Amestecat": the next story is a random one from the folder not heard yet in this run.
    var shuffle: Bool = UserDefaults.standard.bool(forKey: StoryPlayer.shuffleKey) {
        didSet { UserDefaults.standard.set(shuffle, forKey: Self.shuffleKey); pickShuffle() }
    }
    /// The player stopped by itself (the chosen number of stories ended): "Noapte bună".
    private(set) var ended = false
    /// The full-screen player.
    var showsPlayer = false

    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var played = 0
    /// Paused by a call or an alarm (not by a tap), so it may go on by itself afterwards.
    @ObservationIgnored private var wasInterrupted = false
    @ObservationIgnored private var heard: Set<String> = []
    private var shufflePick: Story?
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
        watchAudioSession()
    }

    var remaining: Double { max(0, duration - position) }
    var hasNext: Bool { following != nil }
    /// What plays after this story: the next one in the folder, or the shuffle pick.
    var following: Story? {
        if shuffle { return shufflePick }
        guard let current, let i = queue.firstIndex(where: { $0.id == current.id }), i + 1 < queue.count else { return nil }
        return queue[i + 1]
    }

    nonisolated static func cycled(_ n: Int) -> Int {
        let i = stopChoices.firstIndex(of: n) ?? 0
        return stopChoices[(i + 1) % stopChoices.count]
    }

    private static func savedStopAfter() -> Int {
        let n = UserDefaults.standard.integer(forKey: stopKey)
        return stopChoices.contains(n) ? n : 1
    }

    private func pickShuffle() {
        guard shuffle, let current else { shufflePick = nil; return }
        let pool = queue.filter { $0.id != current.id && !heard.contains($0.id) }
        shufflePick = pool.randomElement()
    }

    /// The speed button: 1× → 1,25× → 1,5× → 0,75× → 1×.
    func cycleRate() {
        let all: [Float] = [1, 1.25, 1.5, 0.75]
        rate = all[((all.firstIndex(of: rate) ?? 0) + 1) % all.count]
    }

    // MARK: Playing

    /// Starts `story` (from where it was paused), with `queue` to continue through.
    /// `continued` is true when the previous story just ended, so "După N povești" keeps counting.
    func play(_ story: Story, queue: [Story]? = nil, store: StoryStore, continued: Bool = false) async {
        self.store = store
        self.queue = queue ?? [story]
        ended = false
        if current?.id == story.id {
            resume()
            return
        }
        savePosition()
        if !continued { played = 0; heard = [] }
        heard.insert(story.id)
        PlaybackMemory.markPlayed(story.id)
        current = story
        pickShuffle()
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
            ended = LaunchOptions.screen == "player-goodnight"
            return
        }
        let local = store.offline.localFile(story.id)
        fromDevice = local != nil
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
        if ended { ended = false; seek(to: 0) }
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
        guard let story = following, let store else { return }
        await play(story, queue: queue, store: store)
    }

    /// "Ascultă din nou" on the goodnight screen.
    func restart() { resume() }

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
        ended = false
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

    /// Lowers the volume over the last seconds of the story the player will stop after.
    private func applySleepFade() {
        guard isPlaying, duration > 0 else { return }
        let last = played + 1 >= stopAfter || following == nil
        player.volume = last ? Float(StoryPlayer.fadeVolume(secondsLeft: remaining)) : 1
    }

    /// 1 until the last `fadeSeconds`, then down to 0, eased so the drop is gentle.
    nonisolated static func fadeVolume(secondsLeft: Double, fade: Double = fadeSeconds) -> Double {
        guard secondsLeft < fade else { return 1 }
        let t = max(0, secondsLeft) / fade
        return t * t
    }

    private func observeEnd(of item: AVPlayerItem) {
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.didFinish() }
        }
    }

    /// When a story ends: the next one plays until the chosen number of stories is reached.
    private func didFinish() {
        guard let finished = current else { return }
        PlaybackMemory.setPosition(finished.id, nil)
        position = 0
        played += 1
        let folders = (store?.allStories ?? []).map(StoryLibrary.folderOf)
        trackBadge(.storyFinished(storyId: finished.id, folder: StoryLibrary.folderOf(finished), folders: Array(NSOrderedSet(array: folders)) as? [String] ?? [],
                                  secs: finished.durationSec, source: BadgeEvent.Source(rawValue: finished.source.rawValue),
                                  offline: fromDevice, kid: !(store?.kidFolders.isEmpty ?? true)))
        if let next = following, played < stopAfter, let store {
            Task { await play(next, queue: queue, store: store, continued: true) }
        } else {
            isPlaying = false
            player.volume = 1
            // Several stories in a row, then the player stopped by itself: the little cloud.
            if stopAfter > 1 && played >= stopAfter { trackBadge(.sleepStop) }
            played = 0
            ended = true
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

    // MARK: Calls, alarms and headphones

    /// iOS pauses the player by itself for a phone call or an alarm, and when headphones or the
    /// car are disconnected. Keep the buttons in step with that, and go on after a short
    /// interruption when iOS says so (not after a call the child might have answered).
    private func watchAudioSession() {
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
            let action = StoryPlayer.interruptionAction(note.userInfo)
            MainActor.assumeIsolated { self?.interrupted(action) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
            let unplugged = StoryPlayer.deviceRemoved(note.userInfo)
            MainActor.assumeIsolated { if unplugged, self?.isPlaying == true { self?.pause() } }
        }
    }

    enum InterruptionAction: Equatable { case pause, resume, none }

    private func interrupted(_ action: InterruptionAction) {
        switch action {
        case .pause:
            guard isPlaying else { return }
            wasInterrupted = true
            pause()
        case .resume:
            guard wasInterrupted else { return }
            wasInterrupted = false
            resume()
        case .none:
            wasInterrupted = false
        }
    }

    nonisolated static func interruptionAction(_ info: [AnyHashable: Any]?) -> InterruptionAction {
        guard let raw = info?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return .none }
        if type == .began { return .pause }
        let options = AVAudioSession.InterruptionOptions(rawValue: info?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
        return options.contains(.shouldResume) ? .resume : .none
    }

    nonisolated static func deviceRemoved(_ info: [AnyHashable: Any]?) -> Bool {
        guard let raw = info?[AVAudioSessionRouteChangeReasonKey] as? UInt else { return false }
        return AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable
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

/// "3:04"
func clockTime(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.isFinite ? seconds : 0))
    return "\(s / 60):\(String(format: "%02d", s % 60))"
}
