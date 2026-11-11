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
        case .upload: "MP3 sau M4A din Fișiere, iCloud sau AirDrop"
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

/// The Adaugă tab: three large cards.
struct AddStoryView: View {
    var folder: String?
    var onAdded: () -> Void = {}
    /// Screenshots: `-screen add-create`, `add-record`, `add-upload` or `add-finish` opens that step.
    @State private var mode: AddMode? = LaunchOptions.screen == "add-finish" ? .upload
        : LaunchOptions.screen.flatMap { AddMode(rawValue: $0.replacingOccurrences(of: "add-", with: "")) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Cum vrei să adaugi povestea de diseară?")
                        .font(.ktCallout)
                        .foregroundStyle(Theme.Night.muted)
                        .padding(.bottom, 10)
                    ForEach(AddMode.allCases) { item in
                        Button { mode = item } label: { AddOptionCard(mode: item) }
                            .buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .ktNightBackground()
            .navigationTitle("Poveste nouă")
        }
        .fullScreenCover(item: $mode) { item in
            AddFlow(mode: item, folder: folder, onAdded: onAdded)
        }
    }
}

struct AddOptionCard: View {
    let mode: AddMode

    var body: some View {
        let c = mode.colors
        HStack(spacing: 16) {
            Text(mode.emoji)
                .font(.system(size: 38))
                .frame(width: 74, height: 74)
                .background(Circle().fill(RadialGradient(colors: [Color(hex: c.glow), Color(hex: c.rim)], center: .center,
                                                         startRadius: 4, endRadius: 40)))
            VStack(alignment: .leading, spacing: 4) {
                Text(mode.title)
                    .font(.custom(AppFont.storyDisplay, size: 22, relativeTo: .title3))
                    .foregroundStyle(Theme.text)
                Text(mode.detail)
                    .font(.custom(AppFont.body, size: 14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.text.opacity(0.78))
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.text.opacity(0.6))
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: c.top), Color(hex: c.bottom)], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22))
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

    private var uploadStart: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("📁").font(.system(size: 64))
            Text("Adaugă o poveste de pe telefon")
                .font(.custom(AppFont.storyDisplay, size: 28, relativeTo: .title))
                .multilineTextAlignment(.center)
            Text("Alege un fișier MP3 sau M4A din Fișiere, iCloud Drive sau ce ai primit pe AirDrop.")
                .font(.ktCallout).foregroundStyle(Theme.Night.muted).multilineTextAlignment(.center)
            if let pickError {
                Text(pickError).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
            }
            Spacer()
            Button { picking = true } label: { Text("Alege fișierul") }
                .buttonStyle(.ktPrimaryWide)
        }
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
        .ktNightBackground()
        .toolbar { ToolbarItem(placement: .topBarLeading) { CloseButton { dismiss() } } }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.audio, .mp3, .mpeg4Audio]) { result in
            Task { await picked(result) }
        }
        .onAppear { if draft == nil, LaunchOptions.screen != "add-finish" { picking = true } }
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
