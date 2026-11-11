import SwiftUI

/// "Pe acest telefon": stories saved for listening without internet, the click on the shelf,
/// and the app's version.
struct PhoneView: View {
    @Environment(\.profileNight) private var night
    @AppStorage(PhoneSettings.shelfClickKey) private var shelfClick = true

    var body: some View {
        ProfilePage(title: "Pe acest telefon") {
            OfflineSection(rowBackground: night ? Theme.Night.surface : Theme.surface)
            Section {
                Toggle("Clic pe raft", isOn: $shelfClick).tint(Theme.accent)
            } footer: {
                Text("O vibrație ușoară când răsfoiești copertele în Cover Flow.")
            }
            .profileRows(night)
            Section {
                LabeledContent("Versiune", value: AppInfo.version)
                NavigationLink(value: ProfileRoute.catalog) {
                    Label("Componente de design", systemImage: "paintpalette")
                }
            } header: {
                Text("Despre aplicație")
            }
            .profileRows(night)
        }
    }
}

/// Profil: how many stories are saved on the phone, and a way to free the space.
struct OfflineSection: View {
    let rowBackground: Color
    @Environment(StoryStore.self) private var store
    @State private var confirmClear = false

    var body: some View {
        let offline = store.offline
        Section {
            LabeledContent("Povești pe telefon") {
                Text(offline.saved.isEmpty ? "niciuna" : "\(offline.saved.count) · \(offline.sizeLabel)")
            }
            if !offline.saved.isEmpty {
                Button("Șterge poveștile de pe telefon", role: .destructive) { confirmClear = true }
                    .foregroundStyle(Theme.danger)
            }
        } header: {
            Text("Offline")
        } footer: {
            Text("Ține apăsat pe o poveste sau pe un dosar și alege „Descarcă” ca să le asculți fără internet.")
        }
        .listRowBackground(rowBackground)
        .confirmationDialog("Ștergi poveștile salvate?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Șterge de pe telefon", role: .destructive) { offline.remove(Array(offline.saved)) }
        } message: {
            Text("Rămân în bibliotecă; doar nu se mai pot asculta fără internet până le descarci din nou.")
        }
    }
}
