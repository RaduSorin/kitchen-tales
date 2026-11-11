import SwiftUI

/// Every style A building block on one screen, to check them in the simulator screenshots and on
/// the phone (Profil › Componente de design).
struct DesignCatalogView: View {
    @State private var segment = 0
    @State private var toggle = true
    @State private var query = ""
    @State private var showSheet = false

    private let swatches: [(String, Color)] = [
        ("Fundal", Theme.background), ("Suprafață", Theme.surface), ("Suprafață 2", Theme.surface2),
        ("Text", Theme.text), ("Secundar", Theme.muted), ("Auriu", Theme.accent),
        ("Auriu deschis", Theme.accentHi), ("Pericol", Theme.danger),
        ("Noapte sus", Theme.Night.top), ("Noapte jos", Theme.Night.bottom),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                group("Culori") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 12)], spacing: 12) {
                        ForEach(swatches, id: \.0) { name, color in
                            VStack(spacing: 6) {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(color)
                                    .frame(height: 56)
                                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
                                Text(name).font(.ktCaption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }

                group("Text") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Ciorbă de perișoare").font(.ktLargeTitle)
                        Text("Titlu de secțiune").font(.ktTitle)
                        Text("Titlu mic, Fraunces").font(.ktTitle3)
                        Text("Text de bază în Figtree: se fierbe 20 de minute, apoi se adaugă smântâna.").font(.ktBody)
                        Text("Notă mică în fontul sistemului · 4 porții · 45 min").font(.ktFootnote).foregroundStyle(Theme.muted)
                        Text("diacritice: ă â î ș ț Ă Â Î Ș Ț").font(.ktBodyEmphasis).foregroundStyle(Theme.accent)
                    }
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .ktCard()
                }

                group("Butoane") {
                    VStack(spacing: 12) {
                        Button("Gătește acum") { Haptics.tap() }.buttonStyle(.ktPrimaryWide)
                        HStack(spacing: 12) {
                            Button("Salvează") { Haptics.success() }.buttonStyle(.ktPrimary)
                            Button("Anulează") { Haptics.tap() }.buttonStyle(.ktSecondary)
                        }
                        Button("Deschide foaia de jos") { showSheet = true }.buttonStyle(.ktSecondaryWide)
                    }
                }

                group("Controale iOS") {
                    VStack(spacing: 16) {
                        Picker("Vedere", selection: $segment) {
                            Text("Azi").tag(0)
                            Text("Săptămâna").tag(1)
                        }
                        .pickerStyle(.segmented)
                        Toggle("Mâini libere", isOn: $toggle).font(.ktBody).tint(Theme.accent)
                        HStack {
                            Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                            TextField("Caută rețete", text: $query).font(.ktBody)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2))
                    }
                    .ktCard()
                }

                group("Povești") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Leul și șoricelul").font(.ktKidsTitle)
                        Text("Povestea de diseară").font(.ktStoryTitle)
                        Text("Text pentru copii în Baloo 2, rotunjit și prietenos.").font(.ktKidsBody)
                            .foregroundStyle(Theme.Night.muted)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(Theme.Night.gradient, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                }

                group("Gol") {
                    EmptyStateView(symbol: "fork.knife", title: "Nicio rețetă încă",
                                   message: "Adaugă prima rețetă din link, poză sau dictare.")
                        .ktCard()
                }
            }
            .padding(16)
        }
        .ktBackground()
        .navigationTitle("Componente")
        .navigationBarTitleDisplayMode(.large)
        .sheet(isPresented: $showSheet) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Adaugă").font(.ktTitle)
                Label("Din link", systemImage: "link").font(.ktBody)
                Label("Din poze", systemImage: "camera").font(.ktBody)
                Label("Dictează", systemImage: "mic").font(.ktBody)
                Spacer()
            }
            .foregroundStyle(Theme.text)
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .presentationDetents([.medium, .large])
            .presentationBackground(Theme.surface)
            .presentationCornerRadius(Theme.Radius.sheet)
        }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
            content()
        }
    }
}

#Preview {
    NavigationStack { DesignCatalogView() }.preferredColorScheme(.dark)
}
