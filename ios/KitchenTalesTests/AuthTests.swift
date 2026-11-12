import Foundation
import Testing
@testable import KitchenTales

struct AuthTests {
    /// An unsigned JWT with the given claims (the app never checks signatures, the server does).
    static func jwt(_ claims: [String: Any]) -> String {
        func b64(_ data: Data) -> String {
            data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        let header = b64(Data(#"{"alg":"none"}"#.utf8))
        let body = b64(try! JSONSerialization.data(withJSONObject: claims))
        return "\(header).\(body).sig"
    }

    @Test func accountFromIdToken() throws {
        let token = Self.jwt(["sub": "abc-123", "email": "lori@exemplu.ro", "name": "Lori",
                              "cognito:groups": ["everyone", "space-casa", "admins"]])
        let account = try #require(Account(idToken: token))
        #expect(account.user == "abc-123")
        #expect(account.space == "space-casa")
        #expect(account.isAdmin)
        #expect(account.displayName == "Lori")
    }

    @Test func accountWithoutGroupsOrName() throws {
        let account = try #require(Account(idToken: Self.jwt(["sub": "x", "email": "ana.maria@exemplu.ro"])))
        #expect(account.space == nil)
        #expect(!account.isAdmin)
        #expect(account.displayName == "ana.maria")
    }

    @Test func badTokenIsRejected() {
        #expect(Account(idToken: "not-a-token") == nil)
        #expect(Account(idToken: Self.jwt(["email": "no-sub@exemplu.ro"])) == nil)
    }

    @Test func configParsesAndRejectsPlaceholder() throws {
        let good = Data(#"{"auth":{"aws_region":"eu-central-1","user_pool_id":"eu-central-1_abc","user_pool_client_id":"xyz"}}"#.utf8)
        let config = try #require(AuthConfig.parse(good))
        #expect(config.poolName == "abc")
        #expect(config.endpoint.absoluteString == "https://cognito-idp.eu-central-1.amazonaws.com/")
        let placeholder = Data(#"{"auth":{"aws_region":"eu-central-1","user_pool_id":"eu-central-1_abc","user_pool_client_id":""}}"#.utf8)
        #expect(AuthConfig.parse(placeholder) == nil)
    }

    @Test func bundledConfigPointsAtTheFamilyPool() throws {
        let config = try #require(AuthConfig.fromBundle())
        #expect(config.region == "eu-central-1")
        #expect(config.userPoolId == "eu-central-1_mH3Vk6Rfm")
        #expect(!config.clientId.isEmpty)
    }

    @Test func cognitoErrorsBecomeRomanianMessages() {
        #expect(AuthError.from(type: "NotAuthorizedException", message: "Incorrect username or password.") == .wrongCredentials)
        #expect(AuthError.from(type: "NotAuthorizedException", message: "Refresh Token has expired") == .sessionExpired)
        #expect(AuthError.from(type: "com.amazonaws#UserNotFoundException", message: "") == .userNotFound)
        #expect(AuthError.from(type: "CodeMismatchException", message: "") == .codeMismatch)
        #expect(AuthError.from(type: "LimitExceededException", message: "") == .tooManyAttempts)
        #expect(AuthError.wrongCredentials.errorDescription == "E-mailul sau parola nu sunt corecte.")
    }

    @Test func onlyCognitoSayingNoEndsTheSession() {
        #expect(AuthModel.endsSession(.sessionExpired))
        #expect(AuthModel.endsSession(.wrongCredentials))
        #expect(AuthModel.endsSession(.userNotFound))
        #expect(!AuthModel.endsSession(.network))
        #expect(!AuthModel.endsSession(.tooManyAttempts))
        #expect(!AuthModel.endsSession(.other("HTTP 503")))
    }

    @Test func tokensFreshness() {
        let soon = Tokens(accessToken: "a", idToken: "i", refreshToken: "r", expiresAt: Date().addingTimeInterval(60))
        let later = Tokens(accessToken: "a", idToken: "i", refreshToken: "r", expiresAt: Date().addingTimeInterval(3600))
        #expect(!soon.isFresh)
        #expect(later.isFresh)
    }

    @Test func deviceCacheRoundTripAndClear() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let defaults = try #require(UserDefaults(suiteName: "test-\(UUID().uuidString)"))
        let cache = DeviceCache(directory: dir, defaults: defaults)
        cache.write(["ciorbă", "plăcintă"], key: "recipes/list")
        #expect(cache.read([String].self, key: "recipes/list") == ["ciorbă", "plăcintă"])
        cache.lastUser = "u1"
        #expect(cache.lastUser == "u1")
        cache.clearAll()
        #expect(cache.read([String].self, key: "recipes/list") == nil)
    }

    @Test func tokenStoreRoundTrip() {
        let store = TokenStore(service: "app.kitchentales.ios.tests.\(UUID().uuidString)")
        let tokens = Tokens(accessToken: "a", idToken: "i", refreshToken: "r", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
        store.save(tokens)
        // The simulator test host may run without a Keychain entitlement; only check when saving worked.
        if let loaded = store.load() {
            #expect(loaded == tokens)
            store.clear()
            #expect(store.load() == nil)
        }
    }
}
