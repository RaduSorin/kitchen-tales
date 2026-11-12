import SwiftUI

/// Profil › Copilul › "Ora de culcare": the time, the days, the reminder and what happens during
/// the routine (concept part B, screen 1).
struct BedtimeSettingsView: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(StoryStore.self) private var stories
    @Environment(\.profileNight) private var night
    @Bindable private var bedtime = Bedtime.shared
    @State private var denied = false

    var body: some View {
        let name = profile.settings.childName
        ProfilePage(title: "Ora de culcare") {
            Section {
                Toggle("Rutina de seară", isOn: Binding(get: { bedtime.settings.enabled }, set: { on in turn(on) }))
                if bedtime.settings.enabled {
                    DatePicker("Ora", selection: timeBinding, displayedComponents: .hourAndMinute)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Zilele").font(.ktBody)
                        HStack(spacing: 8) {
                            ForEach(Bedtime.dayLetters, id: \.weekday) { day in
                                let on = bedtime.settings.days.contains(day.weekday)
                                Button {
                                    if on { bedtime.settings.days.remove(day.weekday) } else { bedtime.settings.days.insert(day.weekday) }
                                    Haptics.select()
                                } label: {
                                    Text(day.letter).font(.custom(AppFont.bodyBold, size: 15, relativeTo: .body))
                                        .foregroundStyle(on ? Theme.onAccent : Theme.text)
                                        .frame(width: 36, height: 36)
                                        .background(Circle().fill(on ? Theme.accent : Color.white.opacity(0.1)))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(day.name)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    Picker("Memento înainte", selection: $bedtime.settings.reminderMinutes) {
                        ForEach(Bedtime.reminderChoices, id: \.self) { m in Text(m == 0 ? "la ora fixă" : "\(m) min").tag(m) }
                    }
                }
            } header: {
                header("Rutina")
            } footer: {
                Text(denied ? "Notificările sunt oprite pentru Bucătăria. Pornește-le din Configurări ca să primești mementoul."
                     : "\(name.isEmpty ? "Copilul" : name) primește un memento pe ecranul blocat, apoi ecranul de noapte cu poveștile la rând.")
            }
            .profileRows(night)

            if bedtime.settings.enabled {
                Section {
                    Picker("Povești la rând", selection: $bedtime.settings.stories) {
                        ForEach(Bedtime.storyChoices, id: \.self) { n in Text("\(n)").tag(n) }
                    }
                    Picker("Din dosarul", selection: $bedtime.settings.folder) {
                        Text("Favorite").tag(String?.none)
                        ForEach(stories.allFolders, id: \.self) { folder in Text(folder).tag(String?.some(folder)) }
                    }
                    Toggle("Mod copil cât merge", isOn: $bedtime.settings.kidMode)
                        .disabled(!profile.settings.hasPin)
                    Toggle("Pornește cu modul Somn", isOn: $bedtime.settings.withSleepFocus)
                } header: {
                    header("În timpul rutinei")
                } footer: {
                    Text(profile.settings.hasPin
                         ? "Pentru modul Somn: Configurări › Concentrare › Somn › Filtre de concentrare › Bucătăria."
                         : "Modul copil cere un PIN (mai sus, în Copilul). Pentru modul Somn: Configurări › Concentrare › Somn › Filtre › Bucătăria.")
                }
                .profileRows(night)

                Section {
                    Button { bedtime.open() } label: { Label("Încearcă acum ecranul de noapte", systemImage: "moon.stars.fill") }
                        .buttonStyle(.ktPrimaryWide)
                }
                .listRowBackground(Color.clear)
            }
        }
    }

    private func turn(_ on: Bool) {
        bedtime.settings.enabled = on
        guard on else { return }
        Task { denied = !(await bedtime.requestPermission()) }
    }

    private var timeBinding: Binding<Date> {
        Binding(get: {
            Calendar.current.date(bySettingHour: bedtime.settings.hour, minute: bedtime.settings.minute, second: 0, of: Date()) ?? Date()
        }, set: { date in
            let c = Calendar.current.dateComponents([.hour, .minute], from: date)
            bedtime.settings.hour = c.hour ?? 20
            bedtime.settings.minute = c.minute ?? 30
        })
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }
}

/// The night screen (concept part B, screen 3): the moon, "Noapte bună, Ana", three big steps the
/// child ticks, tonight's stories and one button. The light goes down while it shows.
struct BedtimeNightView: View {
    @Environment(StoryStore.self) private var stories
    @Environment(ProfileStore.self) private var profile
    @Environment(KidMode.self) private var kid
    @Environment(AreaModel.self) private var area
    @Environment(\.dismiss) private var dismiss
    @Bindable private var bedtime = Bedtime.shared

    private static let steps = [("Pijama", "tshirt.fill"), ("Dinți", "mouth.fill"), ("În pat", "bed.double.fill")]

    var body: some View {
        let list = tonight
        ZStack {
            NightBackdrop()
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button { close() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.text)
                            .frame(width: 36, height: 36).background(Circle().fill(Color.white.opacity(0.1)))
                    }
                    .accessibilityLabel("Închide")
                }
                .padding(.horizontal, 20)
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0xFFF3D1), Theme.Night.moon, Color(hex: 0xB88A3A)],
                                         center: UnitPoint(x: 0.35, y: 0.35), startRadius: 4, endRadius: 70))
                    .frame(width: 112, height: 112)
                    .shadow(color: Theme.Night.moon.opacity(0.45), radius: 40)
                    .padding(.top, 4)
                Text(greeting).font(.custom(AppFont.storyDisplay, size: 30, relativeTo: .largeTitle)).foregroundStyle(Theme.text)
                    .padding(.top, 22)
                Text(subtitle(list)).font(.ktCallout).foregroundStyle(Theme.Night.muted).padding(.top, 4)
                HStack(spacing: 0) {
                    ForEach(Array(Self.steps.enumerated()), id: \.offset) { i, step in
                        let on = bedtime.ticked.contains(i)
                        Button {
                            if on { bedtime.ticked.remove(i) } else { bedtime.ticked.insert(i); Haptics.success() }
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: on ? "checkmark" : step.1).font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(on ? Theme.Night.ink : Theme.text)
                                    .frame(width: 50, height: 50)
                                    .background(Circle().fill(on ? Theme.Night.moon : Color.white.opacity(0.08)))
                                Text(step.0).font(.custom(on ? AppFont.bodySemibold : AppFont.body, size: 13, relativeTo: .footnote))
                                    .foregroundStyle(on ? Theme.Night.moon : Theme.Night.muted)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 22)
                .padding(.horizontal, 24)
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, story in
                            HStack(spacing: 12) {
                                StoryCover(story: story, cornerRadius: 12).frame(width: 58, height: 58)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(story.title).font(.custom(AppFont.bodySemibold, size: 16, relativeTo: .body)).foregroundStyle(Theme.text).lineLimit(1)
                                    Text(detail(story)).font(.footnote).foregroundStyle(Theme.Night.muted)
                                }
                                Spacer()
                                Text("\(i + 1)").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.Night.moon)
                                    .frame(width: 26, height: 26).background(Circle().fill(Theme.Night.moon.opacity(0.18)))
                            }
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.05)))
                        }
                        if list.isEmpty {
                            Text("Încă nu sunt povești. Adaugă una din Adaugă.").font(.ktCallout).foregroundStyle(Theme.Night.muted).padding(.top, 20)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 22)
                }
                Button { start(list) } label: {
                    Label("Pornește poveștile", systemImage: "play.fill")
                        .font(.custom(AppFont.bodyBold, size: 17, relativeTo: .body)).foregroundStyle(Theme.Night.ink)
                        .frame(maxWidth: .infinity).frame(height: 54)
                        .background(Capsule().fill(Theme.Night.moon))
                }
                .buttonStyle(.plain)
                .disabled(list.isEmpty)
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
        }
        .environment(\.colorScheme, .dark)
        .onAppear { bedtime.dim(true) }
        .onDisappear { if !StoryPlayer.shared.isPlaying { bedtime.dim(false) } }
    }

    private var tonight: [Story] {
        Bedtime.tonight(stories.stories, folder: bedtime.settings.folder, count: bedtime.settings.stories,
                        last: PlaybackMemory.lastStoryId, played: PlaybackMemory.played, position: PlaybackMemory.position)
    }

    private var greeting: String {
        let name = profile.settings.childName.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Noapte bună" : "Noapte bună, \(name)"
    }

    private func subtitle(_ list: [Story]) -> String {
        let count = list.count == 1 ? "o poveste" : "\(list.count) povești"
        let length = Bedtime.lengthLabel(list)
        return length.isEmpty ? count : "\(count) · \(length)"
    }

    private func detail(_ story: Story) -> String {
        let pos = PlaybackMemory.position(story.id)
        let minutes = story.minutesLabel ?? ""
        if pos > 5, story.id == PlaybackMemory.lastStoryId { return [minutes, "continuă de la \(clockTime(pos))"].filter { !$0.isEmpty }.joined(separator: " · ") }
        return minutes
    }

    private func start(_ list: [Story]) {
        guard let first = list.first else { return }
        let player = StoryPlayer.shared
        player.shuffle = false
        player.stopAfter = Bedtime.storyChoices.contains(list.count) ? list.count : (Bedtime.storyChoices.last { $0 <= list.count } ?? 1)
        if bedtime.settings.kidMode, profile.settings.hasPin, !kid.active {
            stories.kidFolders = profile.settings.kidFolders
            let minutes = Int((list.compactMap(\.durationSec).reduce(0, +) / 60).rounded()) + 10
            kid.start(minutes: max(profile.settings.kidMinutes, minutes))
        }
        area.current = .stories
        bedtime.showsNight = false
        Task {
            await player.play(first, queue: list, store: stories)
            // Let the night screen go away before the player opens over it.
            try? await Task.sleep(for: .milliseconds(600))
            player.showsPlayer = true
        }
    }

    private func close() {
        bedtime.dim(false)
        bedtime.showsNight = false
        dismiss()
    }
}
