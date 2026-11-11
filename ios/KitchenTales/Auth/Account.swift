import Foundation
import Security

/// The signed-in person, read from the ID token: their space (household) comes from the
/// Cognito groups, like `src/lib/space.ts` on the web.
struct Account: Codable, Sendable, Equatable {
    static let spacePrefix = "space-"
    static let adminsGroup = "admins"

    let user: String
    let email: String?
    let name: String?
    let groups: [String]

    /// The `space-<id>` group: new rows are created in it.
    var space: String? { groups.first { $0.hasPrefix(Self.spacePrefix) } }
    var isAdmin: Bool { groups.contains(Self.adminsGroup) }
    /// What the app calls the person: their name, else the part of the e-mail before "@".
    var displayName: String {
        if let name, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        return email.map { String($0.split(separator: "@").first ?? "") } ?? ""
    }

    init(user: String, email: String?, name: String?, groups: [String]) {
        self.user = user; self.email = email; self.name = name; self.groups = groups
    }

    init?(idToken: String) {
        guard let claims = JWT.claims(idToken), let sub = claims["sub"] as? String else { return nil }
        self.init(user: sub, email: claims["email"] as? String, name: claims["name"] as? String,
                  groups: claims["cognito:groups"] as? [String] ?? [])
    }
}

enum JWT {
    /// The payload of a JWT, without checking the signature (the server checks it on every call).
    static func claims(_ token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}

/// Keeps the tokens in the Keychain, readable after the first unlock (so a story can resume
/// from the Lock Screen) and only on this device.
struct TokenStore: Sendable {
    var service = "app.kitchentales.ios.auth"
    var account = "tokens"

    func load() -> Tokens? {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Tokens.self, from: data)
    }

    func save(_ tokens: Tokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        let update: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(base as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            var add = base
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    func clear() { SecItemDelete(base as CFDictionary) }

    private var base: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
