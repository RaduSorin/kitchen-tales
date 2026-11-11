import Foundation
import Observation

/// Sign-in state for the whole app. The session lives in the Keychain, so after the first
/// sign-in the app opens straight to Acasă, also without internet.
@MainActor @Observable
final class AuthModel {
    enum State: Equatable {
        case starting
        case signedOut
        case signedIn(Account)
    }

    private(set) var state: State = .starting
    /// True while the saved session is used without a fresh token (no internet).
    private(set) var isOffline = false

    private let client: CognitoClient?
    private let store: TokenStore
    private let cache: DeviceCache
    private var tokens: Tokens?

    init(config: AuthConfig? = AuthConfig.fromBundle(), store: TokenStore = TokenStore(), cache: DeviceCache = .shared) {
        client = config.map { CognitoClient(config: $0) }
        self.store = store
        self.cache = cache
    }

    var account: Account? {
        if case .signedIn(let account) = state { return account }
        return nil
    }

    /// Restores the saved session (called once on launch).
    func start() async {
        if let demo = LaunchOptions.demoAccount {
            state = .signedIn(demo)
            return
        }
        guard let saved = store.load(), let account = Account(idToken: saved.idToken) else {
            state = .signedOut
            return
        }
        tokens = saved
        state = .signedIn(account)
        if !saved.isFresh { _ = try? await validTokens() }
    }

    /// Tokens for a server call, refreshed when they are about to expire.
    func validTokens() async throws -> Tokens {
        guard let current = tokens, let client else { throw AuthError.sessionExpired }
        if current.isFresh { return current }
        do {
            let next = try await client.refresh(current)
            accept(next)
            isOffline = false
            return next
        } catch AuthError.network {
            isOffline = true
            throw AuthError.network
        } catch {
            // Revoked or expired: sign in again.
            signOutLocally()
            throw AuthError.sessionExpired
        }
    }

    func signIn(email: String, password: String) async throws -> SignInStep {
        guard let client else { throw AuthError.notConfigured }
        let step = try await client.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), password: password)
        if case .done(let tokens) = step { accept(tokens) }
        return step
    }

    func completeNewPassword(session: String, username: String, newPassword: String) async throws {
        guard let client else { throw AuthError.notConfigured }
        accept(try await client.completeNewPassword(session: session, username: username, newPassword: newPassword))
    }

    func forgotPassword(email: String) async throws {
        guard let client else { throw AuthError.notConfigured }
        try await client.forgotPassword(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }

    func confirmForgotPassword(email: String, code: String, newPassword: String) async throws {
        guard let client else { throw AuthError.notConfigured }
        try await client.confirmForgotPassword(email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                                               code: code, newPassword: newPassword)
    }

    func signOut() async {
        if let tokens, let client { await client.revoke(tokens) }
        signOutLocally()
    }

    private func signOutLocally() {
        store.clear()
        tokens = nil
        state = .signedOut
    }

    private func accept(_ next: Tokens) {
        guard let account = Account(idToken: next.idToken) else { return }
        // Another account on this device: drop what the previous one kept here.
        if let previous = cache.lastUser, previous != account.user { cache.clearAll() }
        cache.lastUser = account.user
        tokens = next
        store.save(next)
        state = .signedIn(account)
    }
}

/// Copies of server data kept on the phone, so lists open instantly and work offline. One JSON
/// file per key in Application Support; everything goes when another account signs in.
final class DeviceCache: @unchecked Sendable {
    static let shared = DeviceCache()

    private let directory: URL
    private let defaults: UserDefaults
    private let lock = NSLock()

    init(directory: URL? = nil, defaults: UserDefaults = .standard) {
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("cache", isDirectory: true)
        self.directory = base
        self.defaults = defaults
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    /// The account whose copies are on this device.
    var lastUser: String? {
        get { defaults.string(forKey: "kt-last-user") }
        set { defaults.set(newValue, forKey: "kt-last-user") }
    }

    func read<T: Decodable>(_ type: T.Type, key: String) -> T? {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Data(contentsOf: url(key)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    func write<T: Encodable>(_ value: T, key: String) {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url(key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func clearAll() {
        lock.lock(); defer { lock.unlock() }
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for file in files { try? FileManager.default.removeItem(at: file) }
    }

    /// A folder inside the cache for files (story audio kept for offline); cleared with the rest.
    func folder(_ name: String) -> URL {
        let url = directory.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func url(_ key: String) -> URL {
        let safe = key.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }
        return directory.appendingPathComponent(String(safe) + ".json")
    }
}
