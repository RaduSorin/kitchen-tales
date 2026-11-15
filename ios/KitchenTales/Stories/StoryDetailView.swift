import SwiftUI

// The story's own page (redesign "Seară de lux, curățat", design-polish/ios-stories-redesign/):
// tapping a cover opens it, like a book in a bookstore app, instead of starting the story.
// In kid mode a tap still plays straight away.

/// A story to push onto a NavigationStack.
struct StoryRoute: Hashable {
    let id: String
}

extension View {
    /// Lets a NavigationStack open a story's page (`NavigationLink(value: StoryRoute(...))`).
    func storyDetailDestination() -> some View {
        navigationDestination(for: StoryRoute.self) { StoryDetailView(storyId: $0.id) }
    }
}

/// A cover or row that opens the story's page, or plays it right away in kid mode.
struct StoryOpenLink<Label: View>: View {
    let story: Story
    let queue: [Story]
    @ViewBuilder var label: () -> Label
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KidMode.self) private var kid

    var body: some View {
        if kid.active {
            Button {
                Task { await player.play(story, queue: queue, store: store) }
                player.showsPlayer = true
            } label: { label() }
        } else {
            NavigationLink(value: StoryRoute(id: story.id)) { label() }
        }
    }
}

/// How far into a story this phone got, 0…1, or nil when it was not started.
enum StoryProgress {
    static func of(_ story: Story) -> Double? {
        let pos = PlaybackMemory.position(story.id)
        guard pos > 5, let total = story.durationSec, total > 0 else { return nil }
        return min(1, pos / total)
    }

    /// "mai sunt 6 min", or nil when the story was not started.
    static func left(_ story: Story) -> String? {
        let pos = PlaybackMemory.position(story.id)
        guard pos > 5, let total = story.durationSec, total > pos else { return nil }
        return "mai sunt " + StoryHomePlan.minutes(total - pos)
    }

    /// The stories started on this phone and not finished, the last one played first.
    static func started(_ stories: [Story]) -> [Story] {
        let list = stories.filter { PlaybackMemory.position($0.id) > 5 }
        guard let last = PlaybackMemory.lastStoryId, let i = list.firstIndex(where: { $0.id == last }) else { return list }
        var out = list
        out.insert(out.remove(at: i), at: 0)
        return out
    }
}

/// A thin gold line on a faint track: how much of a story was heard.
struct StoryProgressLine: View {
    let value: Double
    var height: CGFloat = 3

    var body: some View {
        Capsule().fill(.white.opacity(0.15))
            .frame(height: height)
            .overlay(alignment: .leading) {
                GeometryReader { geo in
                    Capsule().fill(Theme.Night.moon).frame(width: geo.size.width * CGFloat(min(1, max(0, value))))
                }
            }
            .accessibilityHidden(true)
    }
}

/// The page: the folder to go back to, the cover with its glow, the title, Continuă / Ascultă,
/// four plain actions (Favorită, Pe telefon, La coadă, Text), "Despre poveste" and the other
/// stories from the same folder.
struct StoryDetailView: View {
    let storyId: String
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var text: String?
    @State private var reading = false

    var body: some View {
        if let story = store.story(storyId) {
            page(story)
        } else {
            Text("Povestea nu mai este în bibliotecă.")
                .font(.ktCallout).foregroundStyle(Theme.Night.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ktNightBackground()
        }
    }

    private func page(_ story: Story) -> some View {
        let folder = StoryLibrary.folderOf(story)
        let siblings = Self.folderStories(store.stories, of: story)
        return ScrollView {
            VStack(spacing: 0) {
                topBar(story, folder: folder)
                StoryCover(story: story, cornerRadius: 16)
                    .frame(width: 240, height: 240)
                    .shadow(color: .black.opacity(0.55), radius: 26, y: 22)
                    .padding(.top, 14)
                Text(story.title)
                    .font(.custom(AppFont.storyDisplay, size: 32, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 22)
                    .accessibilityAddTraits(.isHeader)
                Text(Self.meta(story))
                    .font(.custom(AppFont.body, size: 14.5, relativeTo: .subheadline))
                    .foregroundStyle(Theme.Night.muted)
                    .padding(.top, 4)
                StoryDetailPlayButton(story: story, queue: siblings)
                    .padding(.top, 20)
                if let p = StoryProgress.of(story) {
                    StoryProgressLine(value: p).padding(.horizontal, 24).padding(.top, 8)
                }
                actions(story)
                    .padding(.top, 20)
                about
                more(story, siblings: siblings, folder: folder)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .background { StoryDetailGlow(story: story) }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $reading) { StoryTextSheet(story: story) }
        .task(id: story.id) { text = await store.text(of: story.id) }
    }

    private func topBar(_ story: Story, folder: String) -> some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                HStack(spacing: 3) {
                    Image(systemName: "chevron.left").font(.system(size: 19, weight: .semibold))
                    Text(folder).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .body)).lineLimit(1)
                }
                .foregroundStyle(Theme.Night.moon)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Înapoi la \(folder)")
            Spacer(minLength: 8)
            StoryMoreMenu(story: story)
        }
        .padding(.horizontal, -12)
        .padding(.top, 4)
    }

    /// Favorită, Pe telefon, La coadă and Text: a symbol with a word under it, no circles.
    private func actions(_ story: Story) -> some View {
        let favorite = story.favorite
        let saved = store.offline.saved.contains(story.id)
        let downloading = store.offline.downloading.contains(story.id)
        return HStack(alignment: .top, spacing: 0) {
            action(favorite ? "heart.fill" : "heart", "Favorită", gold: favorite) {
                Task { await store.toggleFavorite(story.id) }
            }
            .accessibilityLabel(favorite ? "Scoate de la favorite" : "Adaugă la favorite")
            action(saved ? "checkmark.circle.fill" : "arrow.down", "Pe telefon", gold: saved, busy: downloading) {
                if saved { store.offline.remove([story.id]) } else { Task { await store.offline.download(story, links: store.links) } }
            }
            .accessibilityLabel(saved ? "Șterge de pe telefon" : "Salvează pe telefon")
            action("text.line.last.and.arrowtriangle.forward", "La coadă", gold: false) {
                kitchen.say(StoryPlayer.message(player.addToQueue(story, byKid: false), playing: player.current != nil))
            }
            .disabled(player.current?.id == story.id)
            action("text.bubble", "Text", gold: false) { reading = true }
        }
    }

    private func action(_ symbol: String, _ title: String, gold: Bool, busy: Bool = false, run: @escaping () -> Void) -> some View {
        Button { Haptics.tap(); run() } label: {
            VStack(spacing: 6) {
                Group {
                    if busy { ProgressView().tint(Theme.Night.moon) }
                    else { Image(systemName: symbol).font(.system(size: 21, weight: .medium)) }
                }
                .frame(height: 26)
                .foregroundStyle(gold ? Theme.Night.moon : Theme.text)
                Text(title)
                    .font(.custom(AppFont.bodySemibold, size: 12, relativeTo: .caption))
                    .foregroundStyle(Theme.text.opacity(0.8))
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var about: some View {
        if let text, let excerpt = Self.excerpt(text) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Despre poveste")
                    .font(.custom(AppFont.storyDisplay, size: 19, relativeTo: .title3))
                    .foregroundStyle(Theme.text)
                Button { reading = true } label: {
                    (Text(excerpt + " ").foregroundStyle(Theme.Night.muted)
                        + Text("mai mult").foregroundStyle(Theme.Night.moon).bold())
                        .font(.custom(AppFont.body, size: 15, relativeTo: .body))
                        .lineSpacing(3)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 26)
        }
    }

    @ViewBuilder private func more(_ story: Story, siblings: [Story], folder: String) -> some View {
        let others = siblings.filter { $0.id != story.id }
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Tot din \(folder)")
                    .font(.custom(AppFont.storyDisplay, size: 17, relativeTo: .headline))
                    .foregroundStyle(Theme.text)
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 10) {
                        ForEach(others.prefix(12)) { s in
                            NavigationLink(value: StoryRoute(id: s.id)) {
                                StoryCover(story: s, cornerRadius: 10).frame(width: 84, height: 84)
                            }
                            .buttonStyle(PressableStyle())
                            .accessibilityLabel(s.title)
                        }
                    }
                    .padding(.horizontal, 24)
                }
                .scrollIndicators(.hidden)
                .padding(.horizontal, -24)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 26)
        }
    }

    // MARK: Text

    /// "Vocea noastră · 10 min": where it came from (when that says something) and the length.
    static func meta(_ s: Story) -> String {
        let source: String? = switch s.source {
        case .recording: "Vocea noastră"
        case .generated: "Poveste creată de noi"
        case .upload: nil
        }
        return [source, s.minutesLabel].compactMap { $0 }.joined(separator: " · ")
    }

    /// The first ~200 characters of the story, cut at a word, with "…".
    static func excerpt(_ text: String, limit: Int = 200) -> String? {
        let flat = text.split(whereSeparator: \.isNewline).joined(separator: " ").trimmingCharacters(in: .whitespaces)
        guard !flat.isEmpty else { return nil }
        guard flat.count > limit else { return flat }
        let cut = String(flat.prefix(limit))
        let words = cut.split(separator: " ").dropLast()
        return words.joined(separator: " ") + "…"
    }

    /// The stories of the same folder, in the library's order (the queue for Ascultă).
    static func folderStories(_ all: [Story], of story: Story) -> [Story] {
        let folder = StoryLibrary.folderOf(story)
        return all.filter { StoryLibrary.folderOf($0) == folder }
    }
}

/// The wide gold button: "Continuă · mai sunt 6 min", "Ascultă", or "Pauză" while it plays.
private struct StoryDetailPlayButton: View {
    let story: Story
    let queue: [Story]
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player

    var body: some View {
        let isCurrent = player.current?.id == story.id
        let playing = isCurrent && player.isPlaying
        Button {
            Haptics.tap()
            if isCurrent {
                player.togglePlay()
            } else {
                Task { await player.play(story, queue: queue.isEmpty ? [story] : queue, store: store) }
                player.showsPlayer = true
            }
        } label: {
            Label(Self.title(story, playing: playing), systemImage: playing ? "pause.fill" : "play.fill")
                .font(.custom(AppFont.bodyBold, size: 16.5, relativeTo: .body))
                .foregroundStyle(Theme.Night.ink)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Capsule().fill(Theme.Night.moon))
        }
        .buttonStyle(PressableStyle())
    }

    static func title(_ story: Story, playing: Bool) -> String {
        if playing { return "Pauză" }
        if let left = StoryProgress.left(story) { return "Continuă · " + left }
        return "Ascultă"
    }
}

/// The cover, blurred, as a glow at the top of the page, fading into the night.
private struct StoryDetailGlow: View {
    let story: Story

    var body: some View {
        ZStack(alignment: .top) {
            Theme.Night.top
            StoryCover(story: story, cornerRadius: 0, showsEmoji: false)
                .frame(height: 420)
                .scaleEffect(1.5)
                .blur(radius: 60)
                .saturation(1.3)
                .opacity(0.55)
                .mask(LinearGradient(colors: [.black, .black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom))
                .frame(height: 560, alignment: .top)
                .clipped()
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
