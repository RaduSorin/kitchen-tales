import AVFoundation
import PhotosUI
import SwiftUI

/// "Aproape gata": listen to what came out, name it, pick the cover and the folder, then
/// "Pune pe raft" (upload, save the row, keep a copy on the phone).
struct FinishStoryView: View {
    @Bindable var draft: StoryDraft
    let onDone: () -> Void

    @Environment(StoryStore.self) private var store
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var photo: PhotosPickerItem?
    @State private var saving = false
    @State private var error: String?

    static let emojis = ["🐻", "🦊", "🐰", "🦁", "🐉", "🧚", "👑", "🚀", "🌙", "⭐", "🐢", "🦄"]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PreviewPlayer(draft: draft)
                    NightField(label: "Titlul", text: $draft.title, placeholder: "Titlul poveștii")
                    coverPicker
                    shelf
                    if draft.source != .generated {
                        Text("Se salvează și pe acest telefon, merge și fără internet.")
                            .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                    }
                    if let error {
                        Text(error).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            Button { Task { await save() } } label: {
                if saving {
                    HStack(spacing: 10) { ProgressView().tint(Theme.onAccent); Text("Se încarcă…") }
                } else {
                    Text("Pune pe raft")
                }
            }
            .buttonStyle(.ktPrimaryWide)
            .disabled(saving || draft.title.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .foregroundStyle(Theme.text)
        .ktNightBackground()
        .navigationTitle("Aproape gata")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                CloseButton(symbol: "chevron.left") { dismiss() }.disabled(saving)
            }
        }
        .interactiveDismissDisabled(saving)
        .onChange(of: photo) { Task { await loadPhoto() } }
    }

    // MARK: Cover

    private var coverPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            FieldLabel("Coperta")
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    if let cover = draft.cover {
                        Image(uiImage: cover).resizable().scaledToFill()
                            .frame(width: 76, height: 76)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.accent, lineWidth: 3))
                    }
                    ForEach(CoverScene.all.indices, id: \.self) { index in
                        SceneTile(scene: CoverScene.all[index], emoji: draft.emoji,
                                  selected: draft.cover == nil && currentScene == index) {
                            draft.cover = nil
                            photo = nil
                            draft.scene = index
                        }
                    }
                    PhotosPicker(selection: $photo, matching: .images) {
                        VStack(spacing: 4) {
                            Image(systemName: "photo")
                            Text("Poză").font(.ktCaption)
                        }
                        .foregroundStyle(Theme.Night.muted)
                        .frame(width: 76, height: 76)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.Night.surface))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(.white.opacity(0.3)))
                    }
                }
                .padding(4)
            }
            .scrollIndicators(.hidden)
            if draft.cover == nil {
                ScrollView(.horizontal) {
                    HStack(spacing: 6) {
                        ForEach(Self.emojis, id: \.self) { emoji in
                            Button { draft.emoji = emoji; Haptics.select() } label: {
                                Text(emoji).font(.system(size: 24))
                                    .frame(width: 40, height: 40)
                                    .background(Circle().fill(draft.emoji == emoji ? Theme.accent.opacity(0.35) : .clear))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private var currentScene: Int { draft.scene ?? CoverScene.index(draft.title.trimmingCharacters(in: .whitespaces)) }

    private func loadPhoto() async {
        guard let photo, let data = try? await photo.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
        draft.cover = image.resized(maxSide: 800)
    }

    // MARK: Shelf

    private var shelf: some View {
        let names = store.folders.filter { $0.mine && !$0.builtin }.map(\.name)
        return VStack(alignment: .leading, spacing: 10) {
            FieldLabel("Pe raft")
            VStack(spacing: 0) {
                if !names.isEmpty {
                    HStack {
                        Text("Dosar")
                        Spacer()
                        Picker("Dosar", selection: $draft.collection) {
                            Text("Automat").tag(String?.none)
                            ForEach(names, id: \.self) { Text($0).tag(Optional($0)) }
                        }
                        .tint(Theme.Night.muted)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 50)
                    Divider().overlay(Color.white.opacity(0.08))
                }
                Toggle(isOn: $draft.shared) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Văzută și de celelalte conturi")
                        Text(draft.shared ? "O văd toți cei care au cont în aplicație" : "Doar în spațiul nostru")
                            .font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                    }
                }
                .padding(.horizontal, 14)
                .frame(minHeight: 60)
            }
            .background(Theme.Night.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.white.opacity(0.1)))
        }
    }

    // MARK: Saving

    private func save() async {
        guard let creator = store.creator(account: auth.account) else {
            error = "Contul nu are încă un spațiu. Ieși din cont și intră din nou."
            return
        }
        saving = true
        error = nil
        defer { saving = false }
        do {
            var audioKey = draft.audioKey
            if audioKey == nil, let file = draft.audioFile {
                audioKey = try await creator.upload(file, prefix: "stories")
            }
            guard let audioKey else { throw BackendError.server("Lipsește fișierul audio.") }
            var coverKey: String?
            if let cover = draft.cover, let jpeg = cover.jpegData(compressionQuality: 0.85) {
                let file = FileManager.default.temporaryDirectory.appendingPathComponent("cover-\(UUID().uuidString).jpg")
                try jpeg.write(to: file)
                coverKey = try await creator.upload(file, prefix: "story-covers")
                try? FileManager.default.removeItem(at: file)
            }
            let title = draft.title.trimmingCharacters(in: .whitespaces)
            let story = try await creator.create(.init(
                title: title, emoji: draft.emoji, scene: coverKey == nil ? currentScene : nil, coverKey: coverKey,
                collection: draft.collection, source: draft.source, audioKey: audioKey, durationSec: draft.duration,
                text: draft.text, shared: draft.shared))
            if let file = draft.audioFile { store.offline.adopt(file, for: story) }
            if let cover = draft.cover, let key = coverKey { CoverImages.shared.keep(cover, key) }
            store.added(story)
            Haptics.success()
            onDone()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Povestea nu s-a salvat. Încearcă din nou."
            Haptics.warning()
        }
    }
}

private struct SceneTile: View {
    let scene: CoverScene
    let emoji: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            DrawnCover(scene: scene, emoji: emoji)
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(selected ? Theme.accent : .clear, lineWidth: 3))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Copertă desenată")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Plays the new story before it is saved: gold play button and a bar you can drag.
@MainActor @Observable
private final class PreviewModel {
    private(set) var playing = false
    private(set) var position: Double = 0
    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private var observer: Any?

    func load(_ url: URL) {
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.position = time.seconds.isFinite ? time.seconds : 0 }
        }
    }

    func toggle() {
        StoryPlayer.shared.pause()
        if playing { player.pause() } else { player.play() }
        playing.toggle()
    }

    func stop() {
        player.pause()
        playing = false
    }

    func seek(_ seconds: Double) {
        position = seconds
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }
}

private struct PreviewPlayer: View {
    let draft: StoryDraft
    @Environment(StoryStore.self) private var store
    @State private var model = PreviewModel()

    var body: some View {
        let total = max(draft.duration ?? 0, 1)
        HStack(spacing: 12) {
            Button { model.toggle(); Haptics.tap() } label: {
                Image(systemName: model.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.onAccent)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(Theme.accent))
            }
            .accessibilityLabel(model.playing ? "Pauză" : "Ascultă")
            VStack(spacing: 4) {
                Slider(value: Binding(get: { min(model.position, total) }, set: { model.seek($0) }), in: 0...total)
                    .tint(Theme.accent)
                HStack {
                    Text(clockTime(model.position))
                    Spacer()
                    Text(clockTime(draft.duration ?? 0))
                }
                .font(.ktCaption.monospacedDigit())
                .foregroundStyle(Theme.Night.muted)
            }
        }
        .padding(12)
        .background(Theme.Night.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.white.opacity(0.1)))
        .task { await prepare() }
        .onDisappear { model.stop() }
    }

    private func prepare() async {
        var url = draft.audioFile
        if url == nil, let key = draft.audioKey { url = await store.links?.url(for: key, ref: nil) }
        if let url { model.load(url) }
    }
}

extension UIImage {
    /// The picture scaled down so its longer side is at most `maxSide` points.
    func resized(maxSide: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxSide else { return self }
        let scale = maxSide / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
