import AVFoundation
import MediaPlayer
import Observation
import UIKit

/// Plays stories with AVPlayer: keeps going with the screen off, shows on the Lock Screen and in
/// the Dynamic Island with real controls, plays what the family put in "Urmează" and then goes on
/// through the folder it was started from, skips 15 seconds and, at bedtime, lowers the volume
/// before it stops.
@MainActor @Observable
final class StoryPlayer {
    /// "După N povești" (the web's cycle): the player stops by itself after this many stories.
    nonisolated static let stopChoices = [1, 2, 3, 5]
    private static let stopKey = "kt-stop-after"
    private static let shuffleKey = "kt-shuffle"

    private(set) var current: Story?
    /// The folder (or list) the story was started from: it goes on from here after "Urmează".
    private(set) var queue: [Story] = []
    /// "Urmează": the stories the family chose to hear next, before the folder goes on by itself.
    private(set) var upNext = UpNext.saved() { didSet { upNext.save(); pickShuffle() } }
    /// The folder goes on after this story (the last one not started from "Urmează").
    private var anchor: String?
    /// Stories heard before this one, newest last, for ⏮ (also the car's and the headphones').
    private var history: [String] = []
    /// Kid mode: tapping another story while one plays asks "Acum sau După?" instead of switching.
    var asksBeforeSwitching = false
    /// The story the child tapped while another one played, waiting for "Acum" or "După".
    var pendingChoice: PendingChoice?
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
    /// ⏮ has somewhere to go: an earlier story, or the start of this one.
    var hasPrevious: Bool {
        guard let current else { return false }
        return position > 5 || !history.isEmpty || (queue.firstIndex { $0.id == current.id } ?? 0) > 0
    }
    /// Stories finished in a row in this run (for the moon line in "Urmează").
    var playedInRun: Int { played }
    /// What plays after this story: the first one in "Urmează", else the folder's next (or the shuffle pick).
    var following: Story? { nextStep?.story }

    private var nextStep: (story: Story, origin: Origin)? {
        if let s = queuedNext { return (s, .upNext) }
        if let s = folderNext { return (s, .folder) }
        return nil
    }

    /// The first story in "Urmează" this phone can play (kid mode sees only the child's folders).
    var queuedNext: Story? {
        for item in upNext.items where item.id != current?.id {
            if let s = visible(item.id) { return s }
        }
        return nil
    }

    /// The stories in "Urmează" that can be played, with whether the child chose them.
    var queuedStories: [QueuedEntry] {
        upNext.items.compactMap { item in visible(item.id).map { QueuedEntry(story: $0, byKid: item.byKid) } }
    }

    /// The folder's next story, after "Urmează" is done.
    var folderNext: Story? { folderAfter(limit: 1).first }

    /// What the folder plays by itself after "Urmează": the next stories after the one it was at,
    /// not the ones already heard in this run or waiting in "Urmează" (the shuffle pick when mixed).
    func folderAfter(limit: Int) -> [Story] {
        if shuffle { return shufflePick.map { [$0] } ?? [] }
        guard let from = anchor ?? current?.id, let i = queue.firstIndex(where: { $0.id == from }) else { return [] }
        let rest = queue[(i + 1)...].filter { $0.id != current?.id && !upNext.contains($0.id) && !heard.contains($0.id) }
        return Array(rest.prefix(limit))
    }

    private func visible(_ id: String) -> Story? {
        store?.stories.first { $0.id == id }
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
        let pool = queue.filter { $0.id != current.id && !heard.contains($0.id) && !upNext.contains($0.id) }
        shufflePick = pool.randomElement()
    }

    /// The speed button: 1× → 1,25× → 1,5× → 0,75× → 1×.
    func cycleRate() {
        let all: [Float] = [1, 1.25, 1.5, 0.75]
        rate = all[((all.firstIndex(of: rate) ?? 0) + 1) % all.count]
    }

    // MARK: Playing

    /// Where a story that starts came from.
    private enum Origin { case chosen, upNext, folder, back }

    /// Starts `story` (from where it was paused), with `queue` to continue through after "Urmează".
    /// `continued` is true when the previous story just ended, so "După N povești" keeps counting.
    /// In kid mode, while another story plays, the child is asked "Acum sau După?" first.
    func play(_ story: Story, queue: [Story]? = nil, store: StoryStore, continued: Bool = false) async {
        if asksBeforeSwitching, !continued, let current, current.id != story.id, isPlaying || isLoading {
            Haptics.tap()
            pendingChoice = PendingChoice(story: story, queue: queue ?? [story])
            return
        }
        await start(story, queue: queue, store: store, origin: .chosen, continued: continued)
    }

    private func start(_ story: Story, queue: [Story]?, store: StoryStore, origin: Origin, continued: Bool) async {
        guard !lockedByKidMode else { return }
        self.store = store
        switch origin {
        case .chosen:
            if queue != nil || current?.id != story.id {
                self.queue = queue ?? [story]
                anchor = story.id
            }
        case .folder: anchor = story.id
        case .back: if self.queue.contains(where: { $0.id == story.id }) { anchor = story.id }
        case .upNext: break
        }
        ended = false
        if current?.id == story.id {
            resume()
            return
        }
        if origin != .back, let current {
            history.append(current.id)
            if history.count > 50 { history.removeFirst() }
        }
        upNext.remove(story.id)
        savePosition()
        if !continued { played = 0; heard = [] }
        heard.insert(story.id)
        PlaybackMemory.markPlayed(story.id)
        current = story
        pickShuffle()
        // A story from "Urmează" starts from the beginning, like one the folder plays by itself.
        position = origin == .upNext ? 0 : PlaybackMemory.position(story.id)
        duration = story.durationSec ?? 0
        failure = nil
        artwork = nil
        isLoading = true
        if LaunchOptions.demoAccount != nil {
            updateNowPlaying()
            // Screenshots: no server, so show the story a third of the way in, paused.
            position = duration * 0.34
            isLoading = false
            ended = LaunchOptions.screen == "player-goodnight"
            return
        }
        // The picture is made while the audio link is fetched. The title goes out only together with
        // it: a car reads the picture once, with the first title it gets for a track.
        let picture = Task { await NowPlayingArt.image(for: story, links: store.links) }
        let local = store.offline.localFile(story.id)
        fromDevice = local != nil
        var remote: URL?
        if local == nil, let links = store.links { remote = await links.url(for: story.audioKey, ref: story.fileRef) }
        guard let url = local ?? remote else {
            // Going on by itself without internet: skip the story that is not on the phone.
            if continued, let step = nextStep {
                await start(step.story, queue: nil, store: store, origin: step.origin, continued: true)
                return
            }
            isLoading = false
            failure = "Povestea nu se poate deschide acum. Verifică internetul."
            updateNowPlaying()
            return
        }
        let art = await picture.value
        guard current?.id == story.id else { return }
        artwork = Self.artwork(art.image)
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
        updateNowPlaying()
        if let next = following { NowPlayingArt.prepare(next, links: store.links) }
        Task { [weak self] in await self?.loadDetails(item: item, story: story, hasCover: art.isCover) }
    }

    /// Kid mode's time ran out: nothing plays until a parent unlocks.
    var lockedByKidMode = false

    func resume() {
        guard current != nil, !lockedByKidMode else { return }
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
        guard let step = nextStep, let store else { return }
        await start(step.story, queue: nil, store: store, origin: step.origin, continued: false)
    }

    /// "Ascultă din nou" on the goodnight screen.
    func restart() { resume() }

    /// ⏮: the start of this story, or (in its first 5 seconds) the story heard before it.
    func previous() async {
        guard let current, let store else { return }
        if position > 5 { seek(to: 0); return }
        while let id = history.popLast() {
            if id != current.id, let s = visible(id) ?? queue.first(where: { $0.id == id }) {
                await start(s, queue: nil, store: store, origin: .back, continued: false)
                return
            }
        }
        if let i = queue.firstIndex(where: { $0.id == current.id }), i > 0 {
            await start(queue[i - 1], queue: nil, store: store, origin: .back, continued: false)
        } else {
            seek(to: 0)
        }
    }

    // MARK: "Urmează"

    struct QueuedEntry: Identifiable {
        let story: Story
        let byKid: Bool
        var id: String { story.id }
    }

    struct PendingChoice: Identifiable {
        let story: Story
        let queue: [Story]
        var id: String { story.id }
    }

    enum QueueResult: Equatable { case first, added, alreadyThere, playingNow, kidFull }

    /// "Redă următoarea": right after the story playing now.
    @discardableResult
    func playNext(_ story: Story) -> QueueResult {
        guard story.id != current?.id else { return .playingNow }
        upNext.playNext(story.id)
        Haptics.success()
        return .first
    }

    /// "Adaugă la coadă": at the end of "Urmează".
    @discardableResult
    func addToQueue(_ story: Story, byKid: Bool = false) -> QueueResult {
        guard story.id != current?.id else { return .playingNow }
        if upNext.contains(story.id) { return .alreadyThere }
        guard upNext.add(story.id, byKid: byKid) else { return .kidFull }
        Haptics.success()
        return .added
    }

    func removeFromQueue(_ id: String) { upNext.remove(id) }
    func moveInQueue(from offsets: IndexSet, to destination: Int) { upNext.move(from: offsets, to: destination) }
    func clearQueue() { upNext.clear() }
    /// Drops the stories that no longer exist (only once the library has loaded).
    func forgetMissing(_ known: Set<String>) {
        guard !known.isEmpty else { return }
        upNext.keep(only: known)
    }

    /// Nothing is playing: starts the first story in "Urmează" (the folder does not go on after it).
    func playQueue(store: StoryStore) async {
        self.store = store
        guard let first = queuedNext else { return }
        queue = []
        anchor = nil
        await start(first, queue: nil, store: store, origin: .upNext, continued: false)
        showsPlayer = true
    }

    /// A story tapped in "Urmează": it plays now, and the folder still goes on after the list.
    func playFromQueue(_ story: Story) async {
        guard let store else { return }
        await start(story, queue: nil, store: store, origin: .upNext, continued: false)
    }

    /// The child's answer to "Acum sau După?".
    func answer(_ choice: PendingChoice, now: Bool) async -> QueueResult? {
        pendingChoice = nil
        guard let store else { return nil }
        if now {
            await start(choice.story, queue: choice.queue, store: store, origin: .chosen, continued: false)
            return nil
        }
        return addToQueue(choice.story, byKid: true)
    }

    /// The short message after adding a story ("Urmează după povestea asta").
    nonisolated static func message(_ result: QueueResult, playing: Bool) -> String {
        switch result {
        case .first: playing ? "Urmează după povestea asta" : "Prima în coadă. O găsești pe Acasă."
        case .added: playing ? "Adăugată la coadă" : "Adăugată la coadă. O găsești pe Acasă."
        case .alreadyThere: "E deja în coadă"
        case .playingNow: "Se ascultă acum"
        case .kidFull: "Ai ales deja \(UpNext.kidLimit) povești"
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
        if let step = nextStep, played < stopAfter, let store {
            Task { await start(step.story, queue: nil, store: store, origin: step.origin, continued: true) }
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

    private func loadDetails(item: AVPlayerItem, story: Story, hasCover: Bool) async {
        if let seconds = try? await item.asset.load(.duration).seconds, seconds.isFinite, seconds > 0, current?.id == story.id {
            duration = seconds
            updateNowPlaying()
        }
        // The cover was too slow and the drawn one went out: the Lock Screen still gets the cover.
        guard !hasCover, let image = await NowPlayingArt.later(story, links: store?.links), current?.id == story.id else { return }
        artwork = Self.artwork(image)
        updateNowPlaying()
    }

    /// iOS asks for the picture on a background thread, so the handler must not be tied to the main actor.
    nonisolated private static func artwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
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
            MPMediaItemPropertyArtist: "Kitchen Tales",
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
        commands.previousTrackCommand.isEnabled = true
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
        // ⏮ in the car and on headphones: the start of the story, or the one heard before it.
        c.previousTrackCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated { Task { await self?.previous() } }
            return .success
        }
    }
}

/// "3:04"
func clockTime(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.isFinite ? seconds : 0))
    return "\(s / 60):\(String(format: "%02d", s % 60))"
}
