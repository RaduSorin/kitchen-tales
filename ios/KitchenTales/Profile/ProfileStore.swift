import Foundation
import Observation

/// The space's settings (child, kid mode, kitchen, diet, voice, space name), the people in the
/// family and the narrator voices. Settings show the phone's copy at once and are sent to the
/// same FamilySettings row the web uses, a moment after the last change.
@MainActor @Observable
final class ProfileStore {
    private(set) var settings = FamilySettings()
    private(set) var members: [FamilyMember] = []
    private(set) var voices: [NarratorVoice] = []
    private(set) var voicesError: String?
    /// The last save did not reach the server (it is tried again with the next change or refresh).
    private(set) var unsent = false

    private let client: GraphQLClient?
    private let cache: DeviceCache
    private let mySpace: () -> String?
    private let demo: Bool
    /// The settings as last agreed with the server: what differs from it is this phone's change.
    private var synced: FamilySettings?
    private var saveTask: Task<Void, Never>?

    private struct Saved: Codable { var settings: FamilySettings; var synced: FamilySettings?; var unsent: Bool; var members: [FamilyMember] }
    private static let cacheKey = "profile/settings"

    init(auth: AuthModel, config: BackendConfig? = .fromBundle(), cache: DeviceCache = .shared) {
        demo = LaunchOptions.demoAccount != nil
        client = config.map { config in
            GraphQLClient(config: config, token: { @Sendable in try await auth.validTokens().accessToken })
        }
        self.cache = cache
        mySpace = { [weak auth] in auth?.account?.space }
        if demo {
            settings = DemoProfile.settings
            members = DemoProfile.members
            voices = DemoProfile.voices
        } else if let saved = cache.read(Saved.self, key: Self.cacheKey) {
            settings = saved.settings; synced = saved.synced; unsent = saved.unsent; members = saved.members
        }
    }

    // MARK: Settings

    func refresh(isAdmin: Bool) async {
        guard !demo, let client, let space = mySpace() else { return }
        if unsent { await push() }
        do {
            let body = try await client.run("query G($id: ID!) { getFamilySettings(id: $id) { \(FamilySettings.fields) } }", variables: ["id": space])
            if let row = body["getFamilySettings"] as? [String: Any], !unsent {
                let server = FamilySettings(row: row)
                settings = server
                synced = server
                save()
            }
        } catch {
            // Offline or no row yet: keep the phone's copy.
        }
        if isAdmin {
            if let body = try? await client.run("query F { listFamily { \(FamilyMember.fields) } }") {
                members = (body["listFamily"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(FamilyMember.init(row:)) }
                    .sorted { ($0.sameSpace ? 0 : 1, $0.email) < ($1.sameSpace ? 0 : 1, $1.email) }
                save()
            }
        }
    }

    /// Changes the settings here at once and sends them a moment later (typing stays smooth).
    func update(_ change: (inout FamilySettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        settings = next
        unsent = true
        save()
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            await self?.push()
        }
    }

    /// Sends only the fields changed on this phone over the server's copy, then keeps the result.
    private func push() async {
        guard !demo, let client, let space = mySpace() else { unsent = false; return }
        let local = settings
        let changed = local.changedKeys(from: synced)
        do {
            var merged = local.input
            let body = try? await client.run("query G($id: ID!) { getFamilySettings(id: $id) { \(FamilySettings.fields) } }", variables: ["id": space])
            let serverRow = body?["getFamilySettings"] as? [String: Any]
            if let serverRow {
                merged = FamilySettings(row: serverRow).input
                for key in changed { merged[key] = local.input[key] }
            }
            var input = merged
            input["id"] = space
            if serverRow != nil {
                _ = try await client.run("mutation U($input: UpdateFamilySettingsInput!) { updateFamilySettings(input: $input) { id } }", variables: ["input": input])
            } else {
                input["spaceGroups"] = [space]
                _ = try await client.run("mutation C($input: CreateFamilySettingsInput!) { createFamilySettings(input: $input) { id } }", variables: ["input": input])
            }
            let result = FamilySettings(row: input)
            synced = result
            // Nothing changed here while it was sent: show what the server now has (the other phone's changes too).
            if settings == local { settings = result; unsent = false }
            save()
        } catch {
            unsent = true
            save()
        }
    }

    private func save() {
        cache.write(Saved(settings: settings, synced: synced, unsent: unsent, members: members), key: Self.cacheKey)
    }

    // MARK: Kid mode PIN

    func setPin(_ pin: String) {
        let salt = KidPin.newSalt()
        update { $0.kidPinSalt = salt; $0.kidPinHash = KidPin.hash(pin, salt: salt) }
    }

    func checkPin(_ pin: String) -> Bool {
        guard let hash = settings.kidPinHash else { return true }
        return KidPin.hash(pin, salt: settings.kidPinSalt ?? "") == hash
    }

    // MARK: Family

    /// Creates the account and emails a temporary password. `separate`: it gets its own space and
    /// sees only what is shared; otherwise it joins ours and sees everything.
    func invite(_ email: String, separate: Bool) async throws {
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard clean.contains("@"), clean.contains(".") else { throw BackendError.server("Scrie un e-mail întreg, de exemplu ana@gmail.com.") }
        if demo {
            members.append(FamilyMember(email: clean, pending: true, sameSpace: !separate))
            return
        }
        guard let client else { throw BackendError.offline }
        let body = try await client.run("mutation I($email: String!, $separate: Boolean) { inviteFamilyMember(email: $email, separate: $separate) { \(FamilyMember.fields) } }",
                                        variables: ["email": clean, "separate": separate])
        if let row = body["inviteFamilyMember"] as? [String: Any], let member = FamilyMember(row: row) {
            members.removeAll { $0.email == member.email }
            members.append(member)
            save()
        }
    }

    func resendInvite(_ member: FamilyMember) async throws {
        guard !demo else { return }
        guard let client else { throw BackendError.offline }
        _ = try await client.run("mutation I($email: String!, $resend: Boolean) { inviteFamilyMember(email: $email, resend: $resend) { email } }",
                                 variables: ["email": member.email, "resend": true])
    }

    /// The name other spaces see on what this space shares ("De la Sorin"), also put on the
    /// rows already shared so their folders don't split (db.ts refreshSharedNames).
    func renameSpace(_ name: String, recipes: RecipeStore, stories: StoryStore) async {
        let clean = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        guard !clean.isEmpty else { return }
        update { $0.spaceName = clean }
        await recipes.renameShared(to: clean)
        await stories.renameShared(to: clean)
    }

    // MARK: Voices

    func loadVoices() async {
        guard !demo, let client else { return }
        do {
            let body = try await client.run("query V { narratorVoices { \(NarratorVoice.fields) } }")
            voices = (body["narratorVoices"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(NarratorVoice.init(row:)) }
            voicesError = nil
        } catch {
            voicesError = error.localizedDescription
        }
    }

    /// A short Romanian sample read by the voice, as MP3.
    func preview(_ voice: String) async throws -> Data {
        guard !demo else { throw BackendError.server("Mostrele nu merg în modul demo.") }
        guard let client else { throw BackendError.offline }
        let body = try await client.run("query P($voice: String!) { previewVoice(voice: $voice) }", variables: ["voice": voice])
        guard let text = body["previewVoice"] as? String, let data = Data(base64Encoded: text) else {
            throw BackendError.server("Nu am primit mostra.")
        }
        return data
    }

    func chooseVoice(_ voice: NarratorVoice?) {
        update { $0.narrator = voice?.id ?? ""; $0.narratorName = voice?.name ?? "" }
    }
}

/// Made-up settings for `-demo` screenshots.
enum DemoProfile {
    static var settings: FamilySettings {
        var s = FamilySettings()
        s.childName = "Ana"
        s.childBirthYear = Calendar.current.component(.year, from: Date()) - 5
        s.childGender = "girl"
        s.kitchenTools = ["Air fryer", "Robot de bucătărie", "Multicooker", "Cuptor cu microunde"]
        s.kidPinSalt = "demo"
        s.kidPinHash = KidPin.hash("1234", salt: "demo")
        s.kidMinutes = 30
        s.kidFolders = ["Povești de seară", "Basme"]
        s.diet = Diet(avoid: [DietRule(key: "nuci", strict: true, who: "Ana")], dislikes: "ciuperci, ficat")
        s.spaceName = "Sorin"
        return s
    }

    static let members = [
        FamilyMember(email: "sorin@exemplu.ro", pending: false, sameSpace: true),
        FamilyMember(email: "loredana@exemplu.ro", pending: false, sameSpace: true),
        FamilyMember(email: "mihaela@exemplu.ro", pending: true, sameSpace: false),
    ]

    static let voices = [
        NarratorVoice(id: "v1", name: "Bunica Ileana", description: "vocea voastră"),
        NarratorVoice(id: "v2", name: "Andrei", description: "vesel, pentru aventuri"),
    ]
}
