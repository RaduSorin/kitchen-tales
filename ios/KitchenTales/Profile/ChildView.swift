import SwiftUI

/// "Despre copil" and "Modul copil" on one page, in cards like the web: what the stories know
/// about the child, then kid mode (the button that starts it, time, folders, volume ceiling,
/// Face ID or PIN to leave), Seara, and two tips that open in place.
struct ChildView: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(StoryStore.self) private var stories
    @Environment(KidMode.self) private var kid
    @Environment(AreaModel.self) private var area
    @Environment(\.profileNight) private var night
    @State private var name = ""
    @State private var settingPin = false

    private static let minuteChoices = [10, 15, 20, 30, 45, 60, 90, 0]

    var body: some View {
        let s = profile.settings
        ProfilePage(title: s.childName.isEmpty ? "Copilul" : s.childName) {
            Section {
                TextField("Prenume", text: $name)
                    .font(.ktBody)
                    .textContentType(.givenName)
                    .submitLabel(.done)
                    .onSubmit(saveName)
                    .onChange(of: name) { saveName() }
                Picker("Fetiță sau băiețel", selection: Binding(get: { s.childGender ?? "" }, set: { v in profile.update { $0.childGender = v.isEmpty ? nil : v } })) {
                    Text("Fetiță").tag("girl")
                    Text("Băiețel").tag("boy")
                }
                .pickerStyle(.segmented)
                Picker("Anul nașterii", selection: Binding(get: { s.childBirthYear ?? 0 }, set: { v in profile.update { $0.childBirthYear = v == 0 ? nil : v } })) {
                    Text("Nu spun").tag(0)
                    ForEach(years, id: \.self) { year in Text(verbatim: "\(year) · \(ageLabel(year))").tag(year) }
                }
                Toggle("Știe să citească", isOn: Binding(get: { s.childCanRead }, set: { v in profile.update { $0.childCanRead = v } }))
            } header: {
                header("Despre copil")
            } footer: {
                Text("Poveștile noi țin cont de vârstă și de nume.")
            }
            .profileRows(night)

            kidModeSection

            Section {
                NavigationLink(value: ProfileRoute.bedtime) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Ora de culcare").font(.ktBody)
                        Text(bedtimeSummary).font(.ktFootnote).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
            } header: {
                header("Seara")
            }
            .profileRows(night)

            Section {
                DisclosureGroup("Cum funcționează") {
                    KidTips(lines: Self.howItWorks)
                }
                DisclosureGroup("Ca să nu poată ieși deloc din aplicație") {
                    KidTips(lines: Self.guidedAccess, numbered: true)
                }
            }
            .font(.ktCallout)
            .tint(Theme.muted)
            .listRowBackground(Color.clear)
        }
        .onAppear { name = profile.settings.childName }
        .sheet(isPresented: $settingPin) { NewPinSheet { profile.setPin($0) } }
    }

    // MARK: Kid mode rows

    /// The "Modul copil" card, as on the web: what it does and the gold button first, then its
    /// settings (only once there is a PIN).
    @ViewBuilder private var kidModeSection: some View {
        let s = profile.settings
        Section {
            KidModeIntro(hasPin: s.hasPin, startLabel: startLabel, choosePin: { settingPin = true }, start: give)
            if s.hasPin {
                Picker("Timp", selection: Binding(get: { s.kidMinutes }, set: { v in profile.update { $0.kidMinutes = v } })) {
                    ForEach(Self.minuteChoices, id: \.self) { m in Text(m.kidMinutesLabel).tag(m) }
                }
                .font(.ktBody)
                NavigationLink {
                    KidFoldersView()
                } label: {
                    LabeledContent("Foldere", value: foldersSummary)
                }
                NavigationLink {
                    KidVolumeView()
                } label: {
                    LabeledContent("Volum maxim", value: volumeSummary)
                }
                if let biometry = ParentCheck.biometryName {
                    Picker("Ieșire", selection: $faceID) {
                        Text("\(biometry) sau PIN").tag(true)
                        Text("Doar PIN").tag(false)
                    }
                }
                Button { settingPin = true } label: {
                    LabeledContent("Schimbă PIN-ul", value: "••••").foregroundStyle(Theme.text)
                }
            }
            Toggle("Vibrație la răsfoit", isOn: shelfClick)
        } header: {
            header("Modul copil")
        }
        .profileRows(night)
    }

    @AppStorage(KidSafety.faceIDKey) private var faceID = true
    @AppStorage(KidSafety.volumeKey) private var volume = KidSafety.defaultVolume
    @AppStorage(KidSafety.volumeAlwaysKey) private var volumeAlways = false

    private var startLabel: String {
        let name = profile.settings.childName
        return name.isEmpty ? "Dă-i telefonul copilului" : "Dă-i telefonul \(Self.dative(name))"
    }

    private var foldersSummary: String {
        let all = stories.allFolders
        let picked = profile.settings.kidFolders.filter { all.contains($0) }
        if picked.isEmpty { return "toate" }
        return picked.count == 1 ? picked[0] : "\(picked.count) din \(all.count)"
    }

    private var volumeSummary: String {
        KidSafety.volumeSummary(cap: volume >= 0.995 ? nil : volume, onlyInHeadphones: !volumeAlways)
    }

    static let howItWorks = [
        "Copilul vede doar poveștile, fără ștergere, mutare sau rețete.",
        "La final, povestea începută se termină dacă mai are cel mult 5 minute, apoi aplicația se blochează.",
        "Ca să ieși: apasă lacătul de sus și uită-te la telefon (Face ID) sau scrie PIN-ul.",
        "PIN-ul și alegerile se salvează în cont; modul copil, Face ID și volumul sunt doar pe acest telefon.",
    ]

    static let guidedAccess = [
        "Configurări › Accesibilitate › Acces ghidat: pornește-l și alege un cod.",
        "Deschide aplicația, pornește modul copil, apoi apasă de 3 ori butonul lateral și alege Pornește.",
        "Ca să ieși: apasă de 3 ori butonul lateral și scrie codul.",
        "Tot acolo, la Opțiuni, poți opri butoanele de volum.",
    ]

    private var bedtimeSummary: String {
        let s = Bedtime.shared.settings
        return s.enabled ? "\(Bedtime.timeLabel(s)) · \(Bedtime.daysLabel(s.days))" : "oprită"
    }

    @AppStorage(PhoneSettings.shelfClickKey) private var shelfClickStored = true
    private var shelfClick: Binding<Bool> { $shelfClickStored }

    private var years: [Int] {
        let now = Calendar.current.component(.year, from: Date())
        return Array((now - 14)...now).reversed()
    }

    private func ageLabel(_ year: Int) -> String {
        let age = Calendar.current.component(.year, from: Date()) - year
        return age == 0 ? "sub 1 an" : age == 1 ? "1 an" : "\(age) ani"
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }

    private func saveName() {
        let clean = name.trimmingCharacters(in: .whitespaces)
        profile.update { $0.childName = clean }
    }

    /// "Anei", "lui Matei": good enough for the button; other names keep "copilului".
    static func dative(_ name: String) -> String {
        if name.hasSuffix("a") { return String(name.dropLast()) + "ei" }
        return "lui \(name)"
    }

    private func give() {
        Haptics.success()
        stories.kidFolders = profile.settings.kidFolders
        kid.start(minutes: profile.settings.kidMinutes)
        area.current = .stories
    }
}

/// Which story folders the child may see (none picked = all).
private struct KidFoldersView: View {
    @Environment(ProfileStore.self) private var profile
    @Environment(StoryStore.self) private var stories
    @Environment(\.profileNight) private var night

    var body: some View {
        let picked = Set(profile.settings.kidFolders)
        ProfilePage(title: "Ce foldere vede") {
            Section {
                Button { profile.update { $0.kidFolders = [] } } label: { row("Toate folderele", on: picked.isEmpty) }
                ForEach(stories.allFolders, id: \.self) { name in
                    Button {
                        profile.update { s in
                            if s.kidFolders.contains(name) { s.kidFolders.removeAll { $0 == name } } else { s.kidFolders.append(name) }
                        }
                        Haptics.select()
                    } label: { row(name, on: picked.contains(name)) }
                }
            } footer: {
                Text("În modul copil se văd doar poveștile din folderele bifate.")
            }
            .profileRows(night)
        }
    }

    private func row(_ title: String, on: Bool) -> some View {
        HStack {
            Text(title).font(.ktBody).foregroundStyle(Theme.text)
            Spacer()
            if on { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.accent) }
        }
        .contentShape(Rectangle())
    }
}

/// Two rounds of four digits; the PIN is saved only when both match.
struct NewPinSheet: View {
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var first: String?
    @State private var message: String?

    var body: some View {
        NavigationStack {
            PinPad(title: first == nil ? "Alege un PIN de 4 cifre" : "Scrie-l încă o dată", message: message) { pin in
                if let first {
                    if first == pin {
                        onDone(pin)
                        Haptics.success()
                        dismiss()
                    } else {
                        self.first = nil
                        message = "Nu se potrivesc. Începe din nou."
                        Haptics.warning()
                    }
                } else {
                    first = pin
                    message = "Cu el ieși din modul copil."
                }
            }
            .background(Theme.background.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Renunță") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

/// Four dots and a number pad; calls `onPin` when four digits are in, then clears.
struct PinPad: View {
    let title: String
    var message: String?
    var disabled = false
    /// Kid mode: the empty key bottom left tries Face ID again.
    var faceAction: (() -> Void)?
    let onPin: (String) -> Void
    @State private var digits = ""

    var body: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 10)
            Text(title).font(.ktTitle2).foregroundStyle(Theme.text).multilineTextAlignment(.center)
            HStack(spacing: 18) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .strokeBorder(Theme.accent, lineWidth: 2)
                        .background(Circle().fill(i < digits.count ? Theme.accent : .clear))
                        .frame(width: 16, height: 16)
                }
            }
            Text(message ?? " ").font(.ktFootnote).foregroundStyle(Theme.muted).multilineTextAlignment(.center).frame(minHeight: 34)
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(84), spacing: 22), count: 3), spacing: 16) {
                ForEach(["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"], id: \.self) { key in
                    if key.isEmpty, let faceAction {
                        Button { Haptics.tap(); faceAction() } label: {
                            Image(systemName: ParentCheck.symbol)
                                .font(.system(size: 30, weight: .regular))
                                .foregroundStyle(Theme.accent)
                                .frame(width: 76, height: 76)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ParentCheck.biometryName ?? "Face ID")
                    } else if key.isEmpty {
                        Color.clear.frame(width: 76, height: 76)
                    } else {
                        Button { press(key) } label: {
                            Text(key)
                                .font(.system(size: 30, weight: .regular, design: .rounded))
                                .foregroundStyle(Theme.text)
                                .frame(width: 76, height: 76)
                                .background(Circle().fill(key == "⌫" ? Color.clear : Color.white.opacity(0.09)))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(key == "⌫" ? "Șterge" : key)
                    }
                }
            }
            .disabled(disabled)
            .opacity(disabled ? 0.4 : 1)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func press(_ key: String) {
        Haptics.tap()
        if key == "⌫" { if !digits.isEmpty { digits.removeLast() }; return }
        guard digits.count < 4 else { return }
        digits += key
        if digits.count == 4 {
            let pin = digits
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(150))
                digits = ""
                onPin(pin)
            }
        }
    }
}
