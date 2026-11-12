import SwiftUI
import UniformTypeIdentifiers

/// The three ways to add a story, in the web's order: creating needs nothing ready.
enum AddMode: String, Identifiable, CaseIterable {
    case create, record, upload
    var id: String { rawValue }

    var title: String {
        switch self {
        case .create: "Creează o poveste"
        case .record: "Citește tu"
        case .upload: "Încarcă un fișier"
        }
    }

    var detail: String {
        switch self {
        case .create: "Spui eroul și tema, aplicația o scrie și o citește"
        case .record: "Înregistrează-ți vocea citind o carte"
        case .upload: "MP3 sau M4A de pe telefon, iCloud sau AirDrop"
        }
    }

    var symbol: String {
        switch self {
        case .create: "sparkles"
        case .record: "mic"
        case .upload: "folder"
        }
    }

    var emoji: String {
        switch self {
        case .create: "✨"
        case .record: "🎙️"
        case .upload: "📁"
        }
    }

    /// Card gradient and the glow behind the emoji (from the concept).
    var colors: (top: UInt32, bottom: UInt32, glow: UInt32, rim: UInt32) {
        switch self {
        case .create: (0x6B4FC4, 0x2F2470, 0xFFE3A3, 0xC9973F)
        case .record: (0xB4466A, 0x4E1D3C, 0xFFD1E3, 0xC4587A)
        case .upload: (0x2F7A8A, 0x163A4A, 0xD3F5F9, 0x2F9A8E)
        }
    }
}

/// Something that is being added: the audio (a file on the phone, or already on the server
/// for a story the app wrote), and what the parent chooses on "Aproape gata".
@MainActor @Observable
final class StoryDraft {
    let source: Story.Source
    var audioFile: URL?
    var audioKey: String?
    var text: String?
    var title = ""
    var emoji = "🐻"
    var scene: Int?
    var cover: UIImage?
    var collection: String?
    var shared = false
    var duration: Double?

    init(source: Story.Source, collection: String?) {
        self.source = source
        self.collection = collection
    }

    /// What the story looks like with the current choices (for the cover tiles).
    var preview: Story {
        Story(id: "draft", title: title.isEmpty ? "Poveste" : title, emoji: emoji, scene: scene)
    }
}

/// The Adaugă tab, like the web: "MOD PĂRINTE", "Poveste nouă", and three plain rows with the
/// small gold line drawings.
struct AddStoryView: View {
    var folder: String?
    var onAdded: () -> Void = {}
    /// Screenshots: `-screen add-create`, `add-record`, `add-upload` or `add-finish` opens that step.
    @State private var mode: AddMode? = LaunchOptions.screen == "add-finish" ? .upload
        : LaunchOptions.screen.flatMap { AddMode(rawValue: $0.replacingOccurrences(of: "add-", with: "")) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("MOD PĂRINTE")
                            .font(.custom(AppFont.bodyBold, size: 11, relativeTo: .caption2)).tracking(1.6)
                            .foregroundStyle(Theme.accent)
                        Text("Poveste nouă")
                            .font(.custom(AppFont.storyDisplay, size: 32, relativeTo: .largeTitle))
                            .foregroundStyle(Theme.text)
                            .accessibilityAddTraits(.isHeader)
                        Text("Apare pe raftul copilului imediat ce o salvezi.")
                            .font(.ktCallout)
                            .foregroundStyle(Theme.Night.muted)
                            .padding(.top, 4)
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                    ForEach(Array(AddMode.allCases.enumerated()), id: \.element) { i, item in
                        if i > 0 { Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5) }
                        Button { mode = item } label: { AddOptionRow(mode: item) }
                            .buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .ktNightBackground()
            .toolbar(.hidden, for: .navigationBar)
        }
        .fullScreenCover(item: $mode) { item in
            AddFlow(mode: item, folder: folder, onAdded: onAdded)
        }
    }
}

/// One way to add: the drawing, the title in serif and what it does, a chevron.
struct AddOptionRow: View {
    let mode: AddMode

    var body: some View {
        HStack(spacing: 16) {
            AddArt(mode: mode).frame(width: 58, height: 58)
            VStack(alignment: .leading, spacing: 3) {
                Text(mode.title)
                    .font(.custom(AppFont.storyDisplay, size: 21, relativeTo: .title3))
                    .foregroundStyle(Theme.text)
                Text(mode.detail)
                    .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.Night.muted)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.text.opacity(0.45))
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// One way of adding, full screen: its own first step, then "Aproape gata".
struct AddFlow: View {
    let mode: AddMode
    let folder: String?
    var onAdded: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @State private var draft: StoryDraft?
    @State private var picking = false
    @State private var pickError: String?

    var body: some View {
        NavigationStack {
            first
                .navigationDestination(item: $draft) { draft in
                    FinishStoryView(draft: draft, onDone: { dismiss(); onAdded() })
                }
        }
        .environment(\.colorScheme, .dark)
        .onAppear {
            if LaunchOptions.screen == "add-finish", draft == nil {
                let demo = StoryDraft(source: .recording, collection: folder)
                demo.title = "Ana și ursulețul curajos"
                demo.duration = 252
                draft = demo
            }
        }
    }

    @ViewBuilder private var first: some View {
        switch mode {
        case .create:
            CreateStoryFlow(folder: folder, onClose: { dismiss() }, onReady: { draft = $0 })
        case .record:
            RecordStoryView(onClose: { dismiss() }, onReady: { file, seconds in
                let next = StoryDraft(source: .recording, collection: folder)
                next.audioFile = file
                next.duration = seconds
                draft = next
            })
        case .upload:
            uploadStart
        }
    }

    /// The web's "Încarcă un fișier": the question, then a dashed box to pick the file.
    private var uploadStart: some View {
        VStack(alignment: .leading, spacing: 22) {
            StoryQuestion(kicker: "Încarcă un fișier", title: "Adaugă o poveste de pe telefon", text: nil)
            Button { picking = true } label: {
                VStack(spacing: 8) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Theme.Night.ink)
                        .frame(width: 52, height: 52)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Color(hex: 0x74E0D0)))
                    Text("Alege un fișier audio").font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                    Text("MP3, M4A sau WAV, din Fișiere, iCloud sau AirDrop")
                        .font(.ktFootnote).foregroundStyle(Theme.Night.muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 34).padding(.horizontal, 16)
                .background(RoundedRectangle(cornerRadius: 24).fill(Theme.Night.surface))
                .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(.white.opacity(0.18), style: StrokeStyle(lineWidth: 2, dash: [7, 5])))
            }
            .buttonStyle(PressableStyle())
            if let pickError {
                Text(pickError).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
            }
            Spacer()
        }
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .ktNightBackground()
        .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton(symbol: "chevron.left") { dismiss() } } }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.audio, .mp3, .mpeg4Audio, .wav]) { result in
            Task { await picked(result) }
        }
    }

    private func picked(_ result: Result<URL, Error>) async {
        guard case .success(let url) = result else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString).\(ext)")
        do {
            try FileManager.default.copyItem(at: url, to: copy)
        } catch {
            pickError = "Nu am putut citi fișierul."
            return
        }
        let next = StoryDraft(source: .upload, collection: folder)
        next.audioFile = copy
        next.title = url.deletingPathExtension().lastPathComponent
            .replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
        next.duration = await audioSeconds(copy)
        draft = next
    }
}

/// The round × or ‹ in the corner of the adding screens.
struct CloseButton: View {
    var symbol = "xmark"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 36, height: 36)
                .background(.ultraThinMaterial, in: Circle())
        }
        .accessibilityLabel(symbol == "xmark" ? "Închide" : "Înapoi")
    }
}

extension StoryDraft: Hashable {
    nonisolated static func == (a: StoryDraft, b: StoryDraft) -> Bool { a === b }
    nonisolated func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
}
