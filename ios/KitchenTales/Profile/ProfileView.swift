import SwiftUI

/// The pages Profil opens.
enum ProfileRoute: Hashable {
    case child, family, sharing, prefs, phone, catalog, passport, album
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
        case "passport": [.passport]
        case "album": [.album]
        default: []
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                    BadgeCards { path.append($0) }
                        .padding(.top, 22)
                    rows
                    Button("Ieși din cont") { confirmSignOut = true }
                        .font(.custom(AppFont.bodyBold, size: 16, relativeTo: .body))
                        .foregroundStyle(Color(hex: 0xFF8F7A))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .padding(.top, 22)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, KTTabBarMetrics.height + 28)
            }
            .background { if night { NightBackdrop() } else { ProfileBackdrop() } }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: ProfileRoute.self) { route in
                Group {
                    switch route {
                    case .child: ChildView()
                    case .family: FamilyView()
                    case .sharing: SharingView()
                    case .prefs: PrefsView()
                    case .phone: PhoneView()
                    case .catalog: DesignCatalogView()
                    case .passport: PassportView()
                    case .album: AlbumView()
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

    // MARK: Parts

    /// You, centred: the terracotta initial, your name in serif (tap to change it), e-mail · space.
    @ViewBuilder private var hero: some View {
        if let account = auth.account {
            Button {
                newName = account.name ?? ""
                renaming = true
            } label: {
                VStack(spacing: 4) {
                    Text(String(account.displayName.prefix(1)).uppercased())
                        .font(.custom(AppFont.bodySemibold, size: 34, relativeTo: .largeTitle))
                        .foregroundStyle(.white)
                        .frame(width: 84, height: 84)
                        .background(Circle().fill(LinearGradient(colors: [Color(hex: 0xE7A26B), Color(hex: 0xC4664A)], startPoint: .topLeading, endPoint: .bottomTrailing)))
                        .shadow(color: Color(hex: 0xF2A05A).opacity(0.35), radius: 25)
                        .padding(.bottom, 8)
                    Text(account.name?.isEmpty == false ? account.displayName : "Adaugă numele tău")
                        .font(.custom(AppFont.displaySemibold, size: 28, relativeTo: .title))
                        .foregroundStyle(Theme.text)
                    Text([account.email, spaceLine].compactMap { $0 }.joined(separator: " · "))
                        .font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1).truncationMode(.tail)
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
                .padding(.top, 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Schimbă-ți numele")
        }
    }

    /// The web's plain rows: a title, one line of what is inside, a chevron, thin dividers.
    private var rows: some View {
        let s = profile.settings
        return VStack(spacing: 0) {
            groupRow(.child, s.childName.isEmpty ? "Adaugă copilul" : s.childName, childLine)
            if s.hasPin {
                Button { giveToChild() } label: {
                    Label("Dă-i telefonul copilului", systemImage: "lock.fill")
                }
                .buttonStyle(.ktPrimaryWide)
                .padding(.top, 4).padding(.bottom, 12)
            }
            groupRow(.family, auth.account?.isAdmin == true ? "Familie și partajare" : "Partajare", familyLine)
            groupRow(.prefs, "Bucătărie și povești", prefsLine)
            groupRow(.phone, "Pe acest telefon", phoneLine)
        }
        .padding(.top, 14)
    }

    private func groupRow(_ route: ProfileRoute, _ title: String, _ line: String) -> some View {
        Button { path.append(route) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.custom(AppFont.bodySemibold, size: 17, relativeTo: .body))
                        .foregroundStyle(Theme.text)
                    if !line.isEmpty {
                        Text(line).font(.custom(AppFont.body, size: 13, relativeTo: .footnote))
                            .foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.vertical, 16)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5) }
        }
        .buttonStyle(PressableStyle())
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
