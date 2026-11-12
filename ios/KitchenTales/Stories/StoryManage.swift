import SwiftUI

/// The name other accounts see on what we share ("De la Sorin").
@MainActor func mySpaceName(_ profile: ProfileStore, _ auth: AuthModel) -> String? {
    profile.settings.spaceName ?? auth.account?.displayName
}

// MARK: The story's ⋯ menu (player)

/// The player's ⋯, in the web's order: sharing, offline, cover, folder, text, voice, delete.
struct StoryMoreMenu: View {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(StoryPlayer.self) private var player
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @State private var moving = ["story-move", "story-move-new"].contains(LaunchOptions.screen)
    @State private var reading = LaunchOptions.screen == "story-text"
    @State private var confirmDelete = LaunchOptions.screen == "story-delete"
    @State private var covering = LaunchOptions.screen == "story-cover"
    @State private var revoicing = LaunchOptions.screen == "story-voice"
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        let s = store.story(story.id) ?? story
        let saved = store.offline.saved.contains(s.id)
        Menu {
            if s.mine {
                Section(s.shared ? "Povestea · partajată" : "Povestea · doar la noi") {
                    Button { share(s, !s.shared) } label: {
                        Label(s.shared ? "Oprește partajarea" : "Partajează cu toate conturile", systemImage: s.shared ? "person.2.slash" : "person.2")
                    }
                }
            } else {
                Section("De la \(s.spaceName ?? "alt cont"), doar ascultare") {}
            }
            Section {
                if saved {
                    Button { store.offline.remove([s.id]) } label: { Label("Șterge de pe dispozitiv", systemImage: "iphone.slash") }
                } else {
                    Button { Task { await store.offline.download(s, links: store.links) } } label: { Label("Salvează offline", systemImage: "arrow.down.circle") }
                }
                if s.mine {
                    Button { covering = true } label: { Label("Coperta", systemImage: "photo") }
                    Button { moving = true } label: { Label("Mută în folder", systemImage: "folder") }
                }
                Button { reading = true } label: { Label("Textul poveștii", systemImage: "text.alignleft") }
                if s.mine && (s.source == .generated || !(s.text ?? "").isEmpty) {
                    Button { revoicing = true } label: { Label("Recitește cu altă voce", systemImage: "waveform") }
                }
            }
            if s.mine {
                Section {
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Șterge povestea", systemImage: "trash") }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.text)
                .frame(width: 40, height: 40)
                .background(Circle().fill(.white.opacity(0.12)))
        }
        .accessibilityLabel("Mai multe")
        .disabled(busy)
        .confirmationDialog("Ștergi povestea?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Da, șterge", role: .destructive) { remove(s) }
            Button("Nu", role: .cancel) {}
        }
        .sheet(isPresented: $moving) { MoveToFolderSheet(story: s) }
        .sheet(isPresented: $reading) { StoryTextSheet(story: s) }
        .sheet(isPresented: $covering) { StoryCoverSheet(story: s) }
        .sheet(isPresented: $revoicing) { RenarrateSheet(story: s) }
        .alert("Nu a mers", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
    }

    private func share(_ s: Story, _ on: Bool) {
        Task {
            if await store.setShared(s.id, on, spaceName: mySpaceName(profile, auth)) { Haptics.success() }
            else { message = "Nu am putut schimba partajarea. Încearcă din nou." }
        }
    }

    private func remove(_ s: Story) {
        busy = true
        Task {
            do {
                if player.current?.id == s.id { player.close() }
                try await store.delete(s.id)
                Haptics.success()
            } catch {
                message = "Nu am putut șterge povestea. Verifică internetul și încearcă din nou."
            }
            busy = false
        }
    }
}

/// "Textul poveștii": the story as it was written.
struct StoryTextSheet: View {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text: String?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                Group {
                    if let text {
                        Text(text).font(.custom(AppFont.storyDisplay, size: 19, relativeTo: .body)).lineSpacing(6)
                    } else if loading {
                        ProgressView().tint(Theme.Night.moon).frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        Text("Povestea nu are text, e doar înregistrarea.").font(.ktCallout).foregroundStyle(Theme.Night.muted)
                    }
                }
                .foregroundStyle(Theme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .background(NightBackdrop().ignoresSafeArea())
            .navigationTitle("Textul poveștii")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .task {
            text = await store.text(of: story.id)
            loading = false
        }
    }
}

// MARK: Mută în folder

/// Our folders to move a story into, a new one, or back to its own folder.
struct MoveToFolderSheet: View {
    let story: Story
    @Environment(StoryStore.self) private var store
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var adding = LaunchOptions.screen == "story-move-new"
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let targets = StoryLibrary.groupFolders(store.allStories, rows: store.folderRows).filter { !$0.builtin && $0.mine }
        let own = StoryLibrary.sourceFolder[story.source] ?? "Fișierele mele"
        NavigationStack {
            List {
                if adding {
                    Section {
                        TextField("Muzică pentru copii", text: $name)
                            .submitLabel(.done)
                            .onSubmit(addAndMove)
                    } header: {
                        Text("Numele folderului nou")
                    } footer: {
                        if let error { Text(error).foregroundStyle(Theme.Night.danger) }
                    }
                    Section {
                        Button(busy ? "Se mută…" : "Creează și mută", action: addAndMove)
                            .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                            .foregroundStyle(Theme.Night.moon)
                    }
                } else {
                    Section {
                        Button { adding = true } label: { row(icon: "+", name: "Folder nou", note: nil, on: false, gold: true) }
                        ForEach(targets) { f in
                            Button { move(to: f.name) } label: {
                                row(icon: f.icon ?? "📁", name: f.name,
                                    note: (f.items.count == 1 ? "1 poveste" : "\(f.items.count) povești")
                                        + (f.shared != story.shared ? (f.shared ? " · partajat cu toate conturile" : " · doar în spațiul nostru") : ""),
                                    on: story.collection == f.name)
                            }
                        }
                        Button { move(to: nil) } label: { row(icon: "🏠", name: own, note: nil, on: story.collection == nil) }
                    } footer: {
                        if let error { Text(error).foregroundStyle(Theme.Night.danger) }
                    }
                }
            }
            .disabled(busy)
            .scrollContentBackground(.hidden)
            .listRowBackground(Theme.Night.surface)
            .background(NightBackdrop().ignoresSafeArea())
            .navigationTitle("Mută în folder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .environment(\.colorScheme, .dark)
    }

    private func row(icon: String, name: String, note: String?, on: Bool, gold: Bool = false) -> some View {
        HStack(spacing: 12) {
            Text(icon).font(.system(size: gold ? 22 : 21, weight: gold ? .semibold : .regular))
                .foregroundStyle(Theme.Night.moon)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.08)))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.ktBody).foregroundStyle(gold ? Theme.Night.moon : Theme.text)
                if let note { Text(note).font(.ktFootnote).foregroundStyle(Theme.Night.muted) }
            }
            Spacer()
            if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.Night.moon) }
        }
        .contentShape(Rectangle())
    }

    private func move(to collection: String?) {
        busy = true
        error = nil
        Task {
            do {
                try await store.move(story.id, to: collection, spaceName: mySpaceName(profile, auth))
                Haptics.success()
                dismiss()
            } catch {
                self.error = "Nu am putut muta povestea. Încearcă din nou."
                busy = false
            }
        }
    }

    private func addAndMove() {
        let taken = StoryLibrary.groupFolders(store.allStories, rows: store.folderRows).map(\.name)
        if let problem = StoryLibrary.folderNameProblem(name, taken: taken) { error = problem; return }
        let clean = name.trimmingCharacters(in: .whitespaces)
        busy = true
        error = nil
        Task {
            do {
                // A folder made here keeps the story's sharing: a private story never becomes shared by a move.
                try await store.createFolder(clean, icon: StoryLibrary.folderIcons[0], shared: story.shared, spaceName: mySpaceName(profile, auth))
                try await store.move(story.id, to: clean, spaceName: mySpaceName(profile, auth))
                Haptics.success()
                dismiss()
            } catch {
                self.error = "Nu am putut muta povestea. Încearcă din nou."
                busy = false
            }
        }
    }
}

// MARK: Folder nou / Editează folderul

/// Make a new folder, or rename, change the icon of, or delete one of ours.
struct FolderSheet: View {
    /// The folder being edited; nil makes a new one.
    let folder: StoryFolder?
    var onDeleted: () -> Void = {}
    var onRenamed: (String) -> Void = { _ in }
    @Environment(StoryStore.self) private var store
    @Environment(ProfileStore.self) private var profile
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var icon: String?
    @State private var busy = false
    @State private var confirm = LaunchOptions.screen == "folder-delete"
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        let changed = folder == nil || name.trimmingCharacters(in: .whitespaces) != folder?.name || icon != folder?.icon
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Numele folderului").font(.system(.footnote, weight: .semibold)).foregroundStyle(Theme.Night.muted)
                    TextField("Muzică pentru copii", text: $name)
                        .font(.ktBody)
                        .padding(.horizontal, 14).frame(height: 50)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.07)))
                        .focused($focused)
                        .submitLabel(.done)
                        .onSubmit(save)
                        .onChange(of: name) { error = nil }
                        .padding(.bottom, 10)
                    Text("Iconiță").font(.system(.footnote, weight: .semibold)).foregroundStyle(Theme.Night.muted)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                        ForEach(StoryLibrary.folderIcons, id: \.self) { x in
                            Button { Haptics.select(); icon = x == icon ? nil : x } label: {
                                Text(x).font(.system(size: 26))
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(x == icon ? Theme.Night.moon.opacity(0.2) : .white.opacity(0.07)))
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .strokeBorder(Theme.Night.moon, lineWidth: x == icon ? 2 : 0))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(x == icon ? .isSelected : [])
                        }
                    }
                    .padding(.bottom, 14)
                    if let error { Text(error).font(.ktCallout).foregroundStyle(Theme.Night.danger) }
                    Button(busy ? "Se salvează…" : folder == nil ? "Creează folderul" : "Salvează", action: save)
                        .buttonStyle(.ktPrimaryWide)
                        .disabled(busy || !changed || name.trimmingCharacters(in: .whitespaces).isEmpty)
                    if let folder { deletePart(folder) }
                }
                .padding(20)
            }
            .background(NightBackdrop().ignoresSafeArea())
            .navigationTitle(folder == nil ? "Folder nou" : "Editează folderul")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } } }
        }
        .presentationDetents([.large])
        .environment(\.colorScheme, .dark)
        .onAppear {
            name = folder?.name ?? ""
            icon = folder.map(\.icon) ?? StoryLibrary.folderIcons[0]
            if folder == nil && LaunchOptions.screen == nil { focused = true }
        }
    }

    @ViewBuilder private func deletePart(_ folder: StoryFolder) -> some View {
        if confirm {
            let n = folder.items.filter(\.mine).count
            let sources = Set(folder.items.filter(\.mine).map { StoryLibrary.sourceFolder[$0.source] ?? "" })
            let fallback = sources.count == 1 ? sources.first! : "folderele lor de bază"
            VStack(alignment: .leading, spacing: 12) {
                Text(n == 0 ? "Folderul dispare." : "Folderul dispare, \(n == 1 ? "povestea rămâne" : "cele \(n) povești rămân") în \(fallback).")
                    .font(.ktCallout).foregroundStyle(Theme.text)
                HStack(spacing: 10) {
                    Button("Da, șterge folderul") { remove(folder) }
                        .font(.ktButton).foregroundStyle(Theme.Night.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule().fill(Theme.Night.danger))
                    Button("Nu") { confirm = false }
                        .font(.ktButton).foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule().fill(.white.opacity(0.1)))
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Night.danger.opacity(0.08)))
            .padding(.top, 18)
        } else {
            Button("Șterge folderul") { confirm = true }
                .font(.ktButton).foregroundStyle(Theme.Night.danger)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.top, 14)
        }
    }

    private func save() {
        let taken = StoryLibrary.groupFolders(store.allStories, rows: store.folderRows).map(\.name)
        if let problem = StoryLibrary.folderNameProblem(name, taken: taken, current: folder?.name) { error = problem; return }
        let clean = name.trimmingCharacters(in: .whitespaces)
        busy = true
        Task {
            do {
                if let folder {
                    try await store.saveFolder(folder, name: clean, icon: icon, spaceName: mySpaceName(profile, auth))
                    if clean != folder.name {
                        // The child's allowed folders follow the new name.
                        profile.update { s in s.kidFolders = s.kidFolders.map { $0 == folder.name ? clean : $0 } }
                        onRenamed(clean)
                    }
                } else {
                    try await store.createFolder(clean, icon: icon, spaceName: mySpaceName(profile, auth))
                }
                Haptics.success()
                dismiss()
            } catch {
                self.error = "Nu am putut salva folderul. Încearcă din nou."
                busy = false
            }
        }
    }

    private func remove(_ folder: StoryFolder) {
        busy = true
        Task {
            do {
                try await store.deleteFolder(folder)
                profile.update { s in s.kidFolders.removeAll { $0 == folder.name } }
                Haptics.success()
                dismiss()
                onDeleted()
            } catch {
                self.error = "Nu am putut șterge folderul. Încearcă din nou."
                busy = false
            }
        }
    }
}

/// The last card of Dosare: "Folder nou · pentru povești sau muzică", gold dashed edge.
struct NewFolderCard: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Folder nou").font(.custom(AppFont.storyDisplay, size: 19, relativeTo: .headline)).foregroundStyle(Theme.text)
                Text("pentru povești sau muzică").font(.custom(AppFont.bodySemibold, size: 14, relativeTo: .footnote)).foregroundStyle(Theme.Night.muted)
            }
            Spacer()
            Image(systemName: "plus").font(.system(size: 28, weight: .light)).foregroundStyle(Theme.Night.muted)
                .frame(width: 60, height: 60)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, minHeight: 96)
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(.white.opacity(0.16), style: StrokeStyle(lineWidth: 2, dash: [6, 5])))
        .contentShape(Rectangle())
    }
}
