import SwiftUI

/// The pages Profil opens.
enum ProfileRoute: Hashable {
    case child, family, sharing, prefs, phone, catalog
}

/// Profil, as on the web: you at the top, small cards of what the family made, then the child
/// (with "Dă-i telefonul copilului" when kid mode has a PIN), Familie și partajare, Bucătărie și
/// povești and Pe acest telefon. On the stories side it sits on the night background.
struct ProfileView: View {
    var night = false
    @Environment(AuthModel.self) private var auth
    @Environment(ProfileStore.self) private var profile
    @Environment(RecipeStore.self) private var recipes
    @Environment(StoryStore.self) private var stories
    @Environment(KidMode.self) private var kid
    @Environment(AreaModel.self) private var area
    @State private var path: [ProfileRoute] = ProfileView.startPath
    @State private var confirmSignOut = false
    @State private var renaming = false
    @State private var newName = ""
    @AppStorage(PhoneSettings.shelfClickKey) private var shelfClick = true

    private static var startPath: [ProfileRoute] {
        switch LaunchOptions.screen {
        case "catalog": [.catalog]
        case "profile-child": [.child]
        case "profile-family", "profile-invite": [.family]
        case "profile-prefs": [.prefs]
        default: []
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                hero
                stats
                childSection
                Section {
                    groupRow(.family, "person.2", "Familie și partajare", familyLine)
                    groupRow(.prefs, "frying.pan", "Bucătărie și povești", prefsLine)
                    groupRow(.phone, "iphone", "Pe acest telefon", phoneLine)
                }
                .listRowBackground(rowBackground)
                Section {
                    Button("Ieși din cont", role: .destructive) { confirmSignOut = true }
                        .font(.ktBody)
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)
            }
            .ktProfileList(night: night)
            .navigationTitle("Profil")
            .navigationDestination(for: ProfileRoute.self) { route in
                Group {
                    switch route {
                    case .child: ChildView()
                    case .family: FamilyView()
                    case .sharing: SharingView()
                    case .prefs: PrefsView()
                    case .phone: PhoneView()
                    case .catalog: DesignCatalogView()
                    }
                }
                .environment(\.profileNight, night)
            }
            .confirmationDialog("Ieși din cont?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Ieși din cont", role: .destructive) { Task { await auth.signOut() } }
            } message: {
                Text("Pe acest telefon va trebui să intri din nou cu e-mailul și parola.")
            }
            .alert("Numele tău", isPresented: $renaming) {
                TextField("Prenume", text: $newName).textContentType(.givenName)
                Button("Renunță", role: .cancel) {}
                Button("Salvează") { rename() }
            } message: {
                Text("Așa te văd ceilalți în familie și pe caietul de rețete.")
            }
            .refreshable { await profile.refresh(isAdmin: auth.account?.isAdmin ?? false) }
        }
        .environment(\.profileNight, night)
        .task { await profile.refresh(isAdmin: auth.account?.isAdmin ?? false) }
    }

    private var rowBackground: Color { night ? Theme.Night.surface : Theme.surface }

    // MARK: Parts

    @ViewBuilder private var hero: some View {
        if let account = auth.account {
            Section {
                Button {
                    newName = account.name ?? ""
                    renaming = true
                } label: {
                    VStack(spacing: 6) {
                        Text(String(account.displayName.prefix(1)).uppercased())
                            .font(.custom(AppFont.display, size: 40, relativeTo: .largeTitle))
                            .foregroundStyle(Theme.onAccent)
                            .frame(width: 88, height: 88)
                            .background(Circle().fill(LinearGradient(colors: [Theme.accent, Color(hex: 0xBE7A3E)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                            .shadow(color: Theme.accent.opacity(0.25), radius: 20)
                        Text(account.name?.isEmpty == false ? account.displayName : "Adaugă numele tău")
                            .font(.ktTitle).foregroundStyle(Theme.text)
                            .padding(.top, 4)
                        Text([account.email, spaceLine].compactMap { $0 }.joined(separator: " · "))
                            .font(.ktFootnote).foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                        if auth.isOffline {
                            Label("Fără internet: folosești copia de pe telefon.", systemImage: "wifi.slash")
                                .font(.ktFootnote).foregroundStyle(Theme.muted).padding(.top, 4)
                        }
                        if account.space == nil {
                            Label("Contul nu are încă un spațiu. Ieși din cont și intră din nou.", systemImage: "exclamationmark.triangle")
                                .font(.ktFootnote).foregroundStyle(Theme.danger).padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Schimbă-ți numele")
            }
            .listRowBackground(Color.clear)
        }
    }

    /// Three small cards of what the family made (the web's stamps and stickers stay on the web).
    private var stats: some View {
        let mineRecipes = recipes.recipes.filter(\.mine).count
        let mineStories = stories.allStories.filter(\.mine).count
        let cooked = recipes.logs.reduce(0) { $0 + $1.cooked.count }
        return Section {
            HStack(spacing: 10) {
                StatCard(symbol: "fork.knife", title: "Bucătar", value: mineRecipes.ro("rețetă", "rețete"))
                StatCard(symbol: "moon.stars", title: "Povestitor", value: mineStories.ro("poveste", "povești"))
                StatCard(symbol: "flame", title: "La masă", value: cooked.ro("dată gătit", "ori gătit"))
            }
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
    }

    @ViewBuilder private var childSection: some View {
        let s = profile.settings
        Section {
            groupRow(.child, "figure.child", s.childName.isEmpty ? "Adaugă copilul" : s.childName, childLine)
        }
        .listRowBackground(rowBackground)
        if s.hasPin {
            Section {
                Button { giveToChild() } label: {
                    Label(s.childName.isEmpty ? "Dă-i telefonul copilului" : "Dă-i telefonul copilului", systemImage: "lock.fill")
                }
                .buttonStyle(.ktPrimaryWide)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        }
    }

    private func groupRow(_ route: ProfileRoute, _ symbol: String, _ title: String, _ line: String) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(Theme.accent)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.ktBody).foregroundStyle(Theme.text)
                    if !line.isEmpty { Text(line).font(.ktFootnote).foregroundStyle(Theme.muted) }
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: Lines

    private var spaceLine: String? {
        let me = auth.account?.email?.lowercased()
        let others = profile.members.filter { $0.sameSpace && $0.email.lowercased() != me }.map(\.name)
        if auth.account?.isAdmin == true, !others.isEmpty { return "spațiu comun cu \(others.joined(separator: ", "))" }
        return profile.settings.spaceName.map { "spațiul \($0)" }
    }

    private var childLine: String {
        let s = profile.settings
        let mode = s.hasPin ? "modul copil: \(s.kidMinutes.kidMinutesLabel)" : "modul copil oprit"
        return [s.childAge.map { $0 == 1 ? "1 an" : "\($0) ani" }, mode].compactMap { $0 }.joined(separator: " · ")
    }

    private var sharedCount: Int {
        recipes.recipes.filter { $0.mine && $0.shared }.count + stories.allStories.filter { $0.mine && $0.shared }.count
    }

    private var familyLine: String {
        let people = auth.account?.isAdmin == true && !profile.members.isEmpty ? profile.members.count.ro("persoană", "persoane") : nil
        let shared = sharedCount == 0 ? "nimic partajat" : sharedCount.ro("lucru partajat", "lucruri partajate")
        return [people, shared].compactMap { $0 }.joined(separator: " · ")
    }

    private var prefsLine: String {
        let s = profile.settings
        return [s.kitchenTools.count.ro("aparat", "aparate"), "mâncăm \(s.diet.summary)", "vocea \(s.voiceName)"].joined(separator: " · ")
    }

    private var phoneLine: String {
        let saved = stories.offline.saved.count
        return [saved == 0 ? "nicio poveste descărcată" : saved.ro("poveste descărcată", "povești descărcate"),
                "clic pe raft \(shelfClick ? "pornit" : "oprit")"].joined(separator: " · ")
    }

    // MARK: Actions

    private func rename() {
        let name = newName
        Task {
            do { try await auth.rename(name) } catch { Haptics.warning() }
        }
    }

    private func giveToChild() {
        Haptics.success()
        stories.kidFolders = profile.settings.kidFolders
        kid.start(minutes: profile.settings.kidMinutes)
        area.current = .stories
    }
}

private struct StatCard: View {
    let symbol: String
    let title: String
    let value: String
    @Environment(\.profileNight) private var night

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 20)).foregroundStyle(Theme.accent)
            Text(title).font(.system(.footnote, weight: .semibold)).foregroundStyle(Theme.text)
            Text(value).font(.ktCaption).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(night ? Theme.Night.surface : Theme.surface))
        .accessibilityElement(children: .combine)
    }
}

// MARK: Shared look

private struct ProfileNightKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    /// Profil on the stories side: the night background and surfaces.
    var profileNight: Bool {
        get { self[ProfileNightKey.self] }
        set { self[ProfileNightKey.self] = newValue }
    }
}

extension View {
    /// The grouped list look of every Profil page.
    func ktProfileList(night: Bool) -> some View {
        self
            .scrollContentBackground(.hidden)
            .background { if night { NightBackdrop() } else { ProfileBackdrop() } }
    }
}

/// The recipes side's warm background with a soft copper glow at the top, like the concept.
struct ProfileBackdrop: View {
    var body: some View {
        ZStack {
            Theme.background
            RadialGradient(colors: [Color(hex: 0xBE7A3E).opacity(0.28), .clear], center: UnitPoint(x: 0.25, y: 0), startRadius: 0, endRadius: 320)
        }
        .ignoresSafeArea()
    }
}

/// A page under Profil, like the web: the round back button and the big title on the left, then a
/// grouped list with the right background.
struct ProfilePage<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    @Environment(\.profileNight) private var night

    var body: some View {
        List {
            KTPageHeader(title: title)
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            content
        }
        .ktProfileList(night: night)
        .navigationTitle(title)
        .toolbar(.hidden, for: .navigationBar)
    }
}

extension View {
    /// The row background of a Profil section.
    func profileRows(_ night: Bool) -> some View {
        listRowBackground(night ? Theme.Night.surface : Theme.surface)
    }
}
