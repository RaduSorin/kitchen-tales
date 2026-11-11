import AVFoundation
import SwiftUI

/// "Bucătărie și povești": the kitchen's appliances, what the family doesn't eat, the voice that
/// reads new stories and the cookbook PDF.
struct PrefsView: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(\.profileNight) private var night
    @State private var addingTool = false
    @State private var newTool = ""
    @State private var editingRule: DietRule?
    @State private var dislikes = ""
    @State private var preview = VoicePreview()
    @State private var makingCookbook = false

    var body: some View {
        let s = profile.settings
        ProfilePage(title: "Bucătărie și povești") {
            Section {
                FlowLayout(spacing: 8) {
                    ForEach(toolChoices, id: \.self) { tool in
                        Chip(title: tool, on: s.kitchenTools.contains(tool)) { toggleTool(tool) }
                    }
                    Button { newTool = ""; addingTool = true } label: {
                        Text("+ Alt aparat").font(.system(.subheadline, weight: .semibold)).foregroundStyle(Theme.accent)
                            .padding(.horizontal, 13).frame(height: 34)
                            .background(Capsule().fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 6)
            } header: {
                header("Bucătăria mea")
            } footer: {
                Text("Aragazul, cuptorul și oalele se înțeleg de la sine. Rețetele noi folosesc doar ce bifezi.")
            }
            .profileRows(night)

            Section {
                FlowLayout(spacing: 8) {
                    ForEach(Diet.items, id: \.key) { item in
                        Chip(title: item.label, on: s.diet.avoid.contains { $0.key == item.key }) { toggleDiet(item.key) }
                    }
                }
                .padding(.vertical, 6)
                ForEach(s.diet.avoid, id: \.key) { rule in
                    Button { editingRule = rule } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Diet.label(rule.key)).font(.ktBody).foregroundStyle(Theme.text)
                                Text([rule.strict ? "alergie" : "evităm", rule.who?.isEmpty == false ? rule.who! : "toată familia"].joined(separator: " · "))
                                    .font(.ktFootnote).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted.opacity(0.6))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ce nu ne place").font(.ktBody).foregroundStyle(Theme.text)
                    TextField("de exemplu ciuperci, ficat", text: $dislikes)
                        .font(.ktCallout)
                        .foregroundStyle(Theme.muted)
                        .onChange(of: dislikes) { profile.update { $0.diet.dislikes = dislikes } }
                }
                .padding(.vertical, 2)
            } header: {
                header("Ce mâncăm · fără")
            } footer: {
                Text("O alergie nu apare deloc în rețetele noi; ce evitați se înlocuiește.")
            }
            .profileRows(night)

            Section {
                voiceRow(nil, name: "Carmen", detail: "vocea Amazon, caldă, liniștită")
                ForEach(profile.voices) { voice in voiceRow(voice, name: voice.name, detail: voice.description) }
                if let error = profile.voicesError, profile.voices.isEmpty {
                    Text("Nu am putut aduce vocile: \(error)").font(.ktFootnote).foregroundStyle(Theme.muted)
                }
            } header: {
                header("Vocea poveștilor")
            } footer: {
                Text(preview.error ?? "Cu ▶ asculți o mostră. Vocea aleasă citește poveștile noi.")
            }
            .profileRows(night)

            Section {
                Button { makingCookbook = true } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "book.closed").font(.system(size: 19)).foregroundStyle(Theme.accent).frame(width: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Caietul de rețete").font(.ktBody).foregroundStyle(Theme.text)
                            Text("toate rețetele într-un PDF · A5 sau A4").font(.ktFootnote).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted.opacity(0.6))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .profileRows(night)
        }
        .onAppear { dislikes = profile.settings.diet.dislikes }
        .task { await profile.loadVoices() }
        .onDisappear { preview.stop() }
        .alert("Alt aparat", isPresented: $addingTool) {
            TextField("de exemplu Wok electric", text: $newTool)
            Button("Renunță", role: .cancel) {}
            Button("Adaugă") { addTool() }
        }
        .sheet(item: $editingRule) { rule in DietRuleSheet(rule: rule) }
        .sheet(isPresented: $makingCookbook) { CookbookSheet() }
    }

    private var toolChoices: [String] {
        let s = profile.settings
        return KitchenTools.presets + s.kitchenTools.filter { !KitchenTools.presets.contains($0) }
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }

    private func voiceRow(_ voice: NarratorVoice?, name: String, detail: String?) -> some View {
        let chosen = (voice?.id ?? "") == profile.settings.narrator
        return HStack(spacing: 12) {
            if let voice {
                Button { preview.play(voice.id, store: profile) } label: {
                    ZStack {
                        Circle().strokeBorder(Theme.accent, lineWidth: 1.6)
                        if preview.loading == voice.id {
                            ProgressView().controlSize(.small).tint(Theme.accent)
                        } else {
                            Image(systemName: preview.playing == voice.id ? "stop.fill" : "play.fill")
                                .font(.system(size: 12)).foregroundStyle(Theme.accent)
                        }
                    }
                    .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ascultă \(name)")
            } else {
                Image(systemName: "waveform").font(.system(size: 15)).foregroundStyle(Theme.accent).frame(width: 32, height: 32)
            }
            Button {
                profile.chooseVoice(voice)
                Haptics.select()
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(.ktBody).foregroundStyle(Theme.text)
                        if let detail { Text(detail).font(.ktFootnote).foregroundStyle(Theme.muted).lineLimit(2) }
                    }
                    Spacer()
                    if chosen { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(chosen ? .isSelected : [])
        }
    }

    private func toggleTool(_ tool: String) {
        Haptics.select()
        profile.update { s in
            if s.kitchenTools.contains(tool) { s.kitchenTools.removeAll { $0 == tool } } else { s.kitchenTools.append(tool) }
        }
    }

    private func addTool() {
        let tool = newTool.trimmingCharacters(in: .whitespaces)
        guard !tool.isEmpty else { return }
        profile.update { s in if !s.kitchenTools.contains(tool) { s.kitchenTools.append(tool) } }
    }

    private func toggleDiet(_ key: String) {
        Haptics.select()
        profile.update { s in
            if s.diet.avoid.contains(where: { $0.key == key }) { s.diet.avoid.removeAll { $0.key == key } }
            else { s.diet.avoid.append(DietRule(key: key, strict: false)) }
        }
    }
}

extension DietRule: Identifiable { var id: String { key } }

/// How strict a rule is, and for whom.
private struct DietRuleSheet: View {
    let rule: DietRule
    @Environment(ProfileStore.self) private var profile
    @Environment(\.dismiss) private var dismiss
    @State private var strict = false
    @State private var who = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Cât de strict", selection: $strict) {
                        Text("Alergie").tag(true)
                        Text("Evităm").tag(false)
                    }
                    .pickerStyle(.segmented)
                    TextField("Pentru cine (toată familia)", text: $who)
                } footer: {
                    Text(strict ? "Nu apare deloc în rețetele noi." : "Se înlocuiește cu altceva când se poate.")
                }
                .listRowBackground(Theme.surface)
                Section {
                    Button("Scoate de pe listă", role: .destructive) {
                        profile.update { $0.diet.avoid.removeAll { $0.key == rule.key } }
                        dismiss()
                    }
                    .foregroundStyle(Theme.danger)
                }
                .listRowBackground(Theme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(Diet.label(rule.key))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gata") {
                        let clean = who.trimmingCharacters(in: .whitespaces)
                        profile.update { s in
                            if let i = s.diet.avoid.firstIndex(where: { $0.key == rule.key }) {
                                s.diet.avoid[i].strict = strict
                                s.diet.avoid[i].who = clean.isEmpty ? nil : clean
                            }
                        }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear { strict = rule.strict; who = rule.who ?? "" }
    }
}

/// A round choice that is gold when on.
struct Chip: View {
    let title: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(.subheadline, weight: .semibold))
                .foregroundStyle(on ? Theme.onAccent : Theme.text)
                .padding(.horizontal, 13)
                .frame(height: 34)
                .background(Capsule().fill(on ? Theme.accent : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Plays a voice sample (the story player is paused meanwhile).
@MainActor @Observable
final class VoicePreview {
    private(set) var loading: String?
    private(set) var playing: String?
    private(set) var error: String?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var samples: [String: Data] = [:]

    func play(_ id: String, store: ProfileStore) {
        if playing == id { stop(); return }
        stop()
        loading = id
        error = nil
        Task {
            do {
                let data: Data
                if let saved = samples[id] { data = saved } else { data = try await store.preview(id); samples[id] = data }
                guard loading == id else { return }
                StoryPlayer.shared.pause()
                let player = try AVAudioPlayer(data: data)
                player.play()
                self.player = player
                playing = id
                loading = nil
                let length = player.duration
                try? await Task.sleep(for: .seconds(length + 0.2))
                if playing == id, self.player === player { playing = nil }
            } catch {
                self.error = error.localizedDescription
                loading = nil
            }
        }
    }

    func stop() {
        player?.stop()
        player = nil
        playing = nil
        loading = nil
    }
}
