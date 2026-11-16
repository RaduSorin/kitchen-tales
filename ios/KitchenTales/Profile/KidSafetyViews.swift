import AVFoundation
import SwiftUI

/// The top of the "Modul copil" card (web: the Mod copil box): what kid mode does, then the gold
/// button that hands the phone over, or "Alege un PIN" when there is no PIN yet.
struct KidModeIntro: View {
    let hasPin: Bool
    let startLabel: String
    let choosePin: () -> Void
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Doar povești, cu timp limitat")
                .font(.ktStoryTitle)
                .foregroundStyle(Theme.text)
            Text(hasPin ? "Fără ștergere, rețete sau setări. Ieși cu fața ta sau cu PIN-ul."
                        : "Fără ștergere, rețete sau setări. Alege întâi un PIN, cu el ieși din modul copil.")
                .font(.ktFootnote)
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 8)
            if hasPin {
                Button(action: start) { Label(startLabel, systemImage: "lock.fill") }
                    .buttonStyle(.ktPrimaryWide)
            } else {
                Button("Alege un PIN", action: choosePin)
                    .buttonStyle(.ktPrimaryWide)
            }
        }
        .padding(.vertical, 10)
    }
}

/// The lines inside an open tip ("Cum funcționează", Acces ghidat).
struct KidTips: View {
    let lines: [String]
    var numbered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(numbered ? "\(i + 1)" : "·")
                        .font(.ktBodyEmphasis)
                        .foregroundStyle(Theme.accent)
                        .frame(width: 12)
                    Text(line)
                        .font(.ktFootnote)
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

/// "Volum maxim": how loud stories may get in kid mode, and whether only in headphones. The
/// page says plainly what an app cannot do, and where the phone-wide limit lives.
struct KidVolumeView: View {
    @Environment(\.profileNight) private var night
    @Environment(ProfileStore.self) private var profile
    @AppStorage(KidSafety.volumeKey) private var volume = KidSafety.defaultVolume
    @AppStorage(KidSafety.volumeAlwaysKey) private var always = false
    @State private var preview = VolumePreview()
    @State private var showsPhoneWide = false

    var body: some View {
        ProfilePage(title: "Volum maxim") {
            Section {
                VolumeDial(value: $volume)
            }
            .profileRows(night)

            Section {
                Picker("Când se aplică", selection: $always) {
                    Text("Doar în căști").tag(false)
                    Text("Mereu").tag(true)
                }
                .pickerStyle(.segmented)
            } header: {
                header("Când se aplică")
            } footer: {
                Text(always ? "Și în difuzorul telefonului." : "Căști cu fir, AirPods sau alte căști Bluetooth.")
            }
            .profileRows(night)

            Section {
                Button { preview.play(cap: volume, name: profile.settings.childName) } label: {
                    Label("Ascultă cum sună", systemImage: "play.fill")
                }
                .buttonStyle(.ktSecondaryWide)
            } footer: {
                Text("Dă volumul telefonului la maxim ca să auzi limita.")
            }
            .listRowBackground(Color.clear)

            Section {
                Text("Limita e doar pentru poveștile din aplicație. Butoanele de volum rămân active și alte aplicații nu sunt atinse: iOS nu lasă nicio aplicație să facă asta.")
                    .font(.ktFootnote)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Button { showsPhoneWide = true } label: {
                    HStack {
                        Text("Limită pentru tot telefonul").font(.ktBody).foregroundStyle(Theme.text)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                    .contentShape(Rectangle())
                }
            } header: {
                header("Bine de știut")
            }
            .profileRows(night)
        }
        .onDisappear { preview.stop() }
        .sheet(isPresented: $showsPhoneWide) { PhoneWideVolumeGuide() }
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased(with: Locale(identifier: "ro"))).font(.ktLabel).tracking(1.1).foregroundStyle(Theme.accent)
    }
}

/// The big percentage and the slider (20 % to 100 %).
private struct VolumeDial: View {
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(Self.percent(value))
                    .font(.custom(AppFont.storyDisplay, size: 44, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.text)
                    .monospacedDigit()
                Spacer()
                Text(KidSafety.volumeWord(value)).font(.ktFootnote).foregroundStyle(Theme.muted)
            }
            Slider(value: $value, in: KidSafety.volumeRange, step: 0.05) {
                Text("Volum maxim")
            } minimumValueLabel: {
                Image(systemName: "speaker.fill").foregroundStyle(Theme.muted)
            } maximumValueLabel: {
                Image(systemName: "speaker.wave.3.fill").foregroundStyle(Theme.muted)
            }
            .tint(Theme.accent)
            .onChange(of: value) { Haptics.select() }
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .contain)
    }

    static func percent(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }
}

/// "Ascultă cum sună": a short sentence read at the ceiling, as the child would hear it with
/// the phone's volume all the way up.
@MainActor
final class VolumePreview {
    private let synth = AVSpeechSynthesizer()

    func play(cap: Double, name: String) {
        synth.stopSpeaking(at: .immediate)
        let system = Double(AVAudioSession.sharedInstance().outputVolume)
        let line = name.isEmpty ? "Așa sună poveștile în modul copil." : "Așa sună poveștile pentru \(name)."
        let utterance = AVSpeechUtterance(string: line)
        utterance.voice = AVSpeechSynthesisVoice(language: "ro-RO")
        utterance.volume = Float(KidSafety.gain(system: system, cap: cap >= 0.995 ? nil : cap))
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }
}

/// Where the real, phone-wide headphone limit is in Settings, and how to lock it.
private struct PhoneWideVolumeGuide: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    step(1, "Deschide Configurări › Sunete și haptice › Siguranța căștilor.")
                    step(2, "Pornește „Reduce sunetele puternice” și alege o limită (de exemplu 75 dB).")
                    step(3, "Ca să n-o poată schimba copilul: Configurări › Timp de utilizare › Restricții de conținut și confidențialitate › Reduce sunetele puternice › Nu permite.")
                } footer: {
                    Text("Limita din Configurări e în decibeli și se aplică la tot ce se aude în căști, din orice aplicație.")
                }
                .listRowBackground(Theme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Pentru tot telefonul")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gata") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(n)").font(.ktBodyEmphasis).foregroundStyle(Theme.accent)
            Text(text).font(.ktCallout).foregroundStyle(Theme.text)
        }
        .padding(.vertical, 2)
    }
}
