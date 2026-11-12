import PhotosUI
import SwiftUI

/// "Coperta" from the player's ⋯, like the web: the drawing (colours and emoji, saved with one
/// tap; a picture gives way to it), a photo from the phone, or a cover found by the title.
struct StoryCoverSheet: View {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var emoji: String?
    @State private var scene: Int?
    @State private var photo: PhotosPickerItem?
    @State private var found: [StoryStore.CoverCandidate]?
    @State private var searching = false
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        let s = store.story(story.id) ?? story
        let drawing = emoji != nil || scene != nil
        let preview: Story = {
            var p = s
            if drawing { p.emoji = emoji ?? s.emoji; p.scene = scene ?? s.scene ?? CoverScene.index(s.title); p.coverKey = nil }
            return p
        }()
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if busy {
                        HStack(spacing: 10) { ProgressView().tint(Theme.Night.moon); Text("Salvez coperta…") }
                            .font(.ktCallout).foregroundStyle(Theme.Night.muted)
                            .frame(maxWidth: .infinity).padding(.vertical, 40)
                    } else {
                        StoryCover(story: preview, cornerRadius: 18)
                            .frame(width: 150, height: 150)
                            .frame(maxWidth: .infinity)

                        label("Desen")
                        ScrollView(.horizontal) {
                            HStack(spacing: 10) {
                                ForEach(Array(CoverScene.all.enumerated()), id: \.offset) { i, sc in
                                    SceneTile(scene: sc, emoji: emoji ?? s.emoji,
                                              selected: (scene ?? (s.coverKey == nil ? s.scene ?? CoverScene.index(s.title) : -1)) == i) {
                                        scene = i
                                        if emoji == nil { emoji = s.emoji }
                                        Haptics.select()
                                    }
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                        .scrollIndicators(.hidden)
                        .padding(.horizontal, -20)
                        ScrollView(.horizontal) {
                            HStack(spacing: 6) {
                                ForEach(FinishStoryView.emojis, id: \.self) { e in
                                    Button {
                                        emoji = e
                                        if scene == nil { scene = s.scene ?? CoverScene.index(s.title) }
                                        Haptics.select()
                                    } label: {
                                        Text(e).font(.system(size: 24)).frame(width: 44, height: 44)
                                            .background(Circle().fill((emoji ?? s.emoji) == e && drawing ? Theme.accent.opacity(0.35) : .clear))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                        .scrollIndicators(.hidden)
                        .padding(.horizontal, -20)
                        if drawing {
                            Button(s.coverKey != nil ? "Folosește desenul" : "Salvează coperta") { saveDrawing(s) }
                                .buttonStyle(.ktPrimaryWide)
                            if s.coverKey != nil {
                                Text("Poza de acum se șterge și rămâne desenul.").font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                            }
                        }

                        label("Poză")
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label("Alege o poză", systemImage: "photo")
                                .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                                .foregroundStyle(Theme.text)
                                .padding(.horizontal, 16)
                                .frame(minHeight: 40)
                                .background(Capsule().fill(.white.opacity(0.1)))
                        }
                        search(s)
                    }
                    if let message {
                        Text(message).font(.ktFootnote).foregroundStyle(Theme.Night.danger)
                    }
                }
                .padding(20)
            }
            .background(Theme.Night.ink.ignoresSafeArea())
            .navigationTitle("Coperta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } } }
        }
        .environment(\.colorScheme, .dark)
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task { await usePhoto(item, s) }
        }
        .task { if s.coverKey != nil { await find(s) } }
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro")))
            .font(.ktLabel).tracking(1.2)
            .foregroundStyle(Theme.Night.moon)
            .padding(.top, 8)
    }

    @ViewBuilder private func search(_ s: Story) -> some View {
        if let found {
            if found.isEmpty {
                Text("Nu am găsit coperți pentru „\(s.title)”.").font(.ktFootnote).foregroundStyle(Theme.Night.muted)
            } else {
                Text("Găsite după titlu").font(.ktFootnote).foregroundStyle(Theme.Night.muted)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 10)], spacing: 10) {
                    ForEach(found) { c in
                        Button { useFound(c, s) } label: {
                            AsyncImage(url: URL(string: c.url)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Color.white.opacity(0.06)
                            }
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityLabel(c.label ?? "Copertă găsită")
                    }
                }
            }
        } else {
            Button { Task { await find(s) } } label: {
                HStack(spacing: 8) {
                    if searching { ProgressView().controlSize(.small) } else { Image(systemName: "magnifyingglass") }
                    Text("Caută coperta după titlu")
                }
                .font(.custom(AppFont.bodyBold, size: 15, relativeTo: .subheadline))
                .foregroundStyle(Theme.Night.moon)
            }
            .disabled(searching)
        }
    }

    private func find(_ s: Story) async {
        searching = true
        defer { searching = false }
        do { found = try await store.findCovers(s.title) } catch { message = "Nu am putut căuta coperți. Verifică internetul." }
    }

    private func done() {
        Haptics.success()
        dismiss()
    }

    private func saveDrawing(_ s: Story) {
        busy = true
        Task {
            do {
                try await store.setDrawing(s.id, emoji: emoji ?? s.emoji, scene: scene ?? s.scene ?? CoverScene.index(s.title), dropPicture: s.coverKey != nil)
                done()
            } catch { message = "Nu am putut schimba coperta. Încearcă din nou." }
            busy = false
        }
    }

    private func useFound(_ c: StoryStore.CoverCandidate, _ s: Story) {
        busy = true
        Task {
            do {
                let key = try await store.saveFoundCover(c.url)
                try await store.setCover(s.id, coverKey: key)
                done()
            } catch { message = "Nu am putut schimba coperta. Încearcă din nou." }
            busy = false
        }
    }

    private func usePhoto(_ item: PhotosPickerItem, _ s: Story) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
        guard let creator = store.creator(account: auth.account) else {
            message = "Coperta se poate schimba doar cu internet și cont."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let small = image.resized(maxSide: 800)
            guard let jpeg = small.jpegData(compressionQuality: 0.85) else { return }
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("cover-\(UUID().uuidString).jpg")
            try jpeg.write(to: file)
            let key = try await creator.upload(file, prefix: "story-covers")
            CoverImages.shared.keep(small, key)
            try await store.setCover(s.id, coverKey: key)
            done()
        } catch { message = "Nu am putut schimba coperta. Încearcă din nou." }
    }
}

/// "Recitește cu altă voce": the same text read again by another voice; title, cover and folder stay.
struct RenarrateSheet: View {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @Environment(KitchenModel.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var voice: NarratorVoice?
    @State private var picked = false
    @State private var working = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(nil, name: "Carmen", detail: "vocea Amazon, caldă, liniștită")
                    ForEach(profile.voices) { v in row(v, name: v.name, detail: v.description) }
                } footer: {
                    Text("Titlul, coperta și folderul rămân la fel. Se schimbă doar vocea.")
                }
                if let message {
                    Section { Text(message).foregroundStyle(Theme.Night.danger) }
                }
                Section {
                    Button { renarrate() } label: {
                        HStack {
                            if working { ProgressView().tint(Theme.Night.ink) }
                            Text(working ? "Se citește din nou… (până la un minut)" : "Recitește povestea")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ktPrimaryWide)
                    .disabled(working)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Night.ink.ignoresSafeArea())
            .navigationTitle("Recitește cu altă voce")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() }.disabled(working) } }
        }
        .environment(\.colorScheme, .dark)
        .interactiveDismissDisabled(working)
        .task {
            await profile.loadVoices()
            if !picked { voice = profile.voices.first { $0.id == profile.settings.narrator } }
        }
    }

    private func row(_ v: NarratorVoice?, name: String, detail: String?) -> some View {
        let on = (v?.id ?? "") == (voice?.id ?? "")
        return Button { voice = v; picked = true; Haptics.select() } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name.components(separatedBy: " - ").first ?? name).font(.ktBodyEmphasis).foregroundStyle(Theme.text)
                    if let detail, !detail.isEmpty { Text(detail).font(.ktFootnote).foregroundStyle(Theme.Night.muted).lineLimit(2) }
                }
                Spacer()
                if on { Image(systemName: "checkmark").foregroundStyle(Theme.Night.moon).fontWeight(.bold) }
            }
        }
        .listRowBackground(Color.white.opacity(0.05))
    }

    private func renarrate() {
        guard let creator = store.creator(account: auth.account) else {
            message = "Se poate reciti doar cu internet și cont."
            return
        }
        working = true
        message = nil
        Task {
            defer { working = false }
            do {
                guard let text = await store.text(of: story.id), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    message = "Povestea nu are text salvat."
                    return
                }
                let g = try await creator.generate(title: story.title, brief: nil, ownText: text, voice: voice?.id)
                var seconds: Double?
                if let links = store.links, let url = await links.url(for: g.audioKey, ref: story.fileRef) { seconds = await audioSeconds(url) }
                try await store.replaceAudio(story.id, audioKey: g.audioKey, durationSec: seconds)
                if player.current?.id == story.id { player.close() }
                kitchen.say(g.note ?? "Gata! Acum o citește \((voice?.name ?? "Carmen").components(separatedBy: " - ").first ?? "Carmen").")
                Haptics.success()
                dismiss()
            } catch {
                message = "Nu am putut reciti povestea: \(error.localizedDescription)"
            }
        }
    }
}
