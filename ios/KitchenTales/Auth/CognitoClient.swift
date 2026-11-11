import Foundation

/// The user pool settings, read from `Resources/AuthConfig.json`: the `auth` part of the
/// `amplify_outputs.json` that Amplify writes for the web app (same keys). These are public
/// identifiers, the same ones the web app ships. An empty client ID means "not set up yet".
struct AuthConfig: Sendable, Equatable {
    let region: String
    let userPoolId: String
    let clientId: String

    /// The part after the underscore ("eu-central-1_abc" → "abc"), used in the SRP math.
    var poolName: String { String(userPoolId.split(separator: "_").last ?? "") }
    var endpoint: URL { URL(string: "https://cognito-idp.\(region).amazonaws.com/")! }

    static func fromBundle(_ bundle: Bundle = .main) -> AuthConfig? {
        guard let url = bundle.url(forResource: "AuthConfig", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return parse(data)
    }

    static func parse(_ data: Data) -> AuthConfig? {
        struct Outputs: Decodable {
            struct Auth: Decodable { let aws_region: String; let user_pool_id: String; let user_pool_client_id: String }
            let auth: Auth
        }
        guard let o = try? JSONDecoder().decode(Outputs.self, from: data),
              !o.auth.user_pool_client_id.isEmpty, !o.auth.user_pool_id.isEmpty else { return nil }
        return AuthConfig(region: o.auth.aws_region, userPoolId: o.auth.user_pool_id, clientId: o.auth.user_pool_client_id)
    }
}

/// The tokens Cognito hands out after a sign-in.
struct Tokens: Codable, Sendable, Equatable {
    var accessToken: String
    var idToken: String
    var refreshToken: String
    var expiresAt: Date

    var isFresh: Bool { expiresAt.timeIntervalSinceNow > 120 }
}

/// What a sign-in step needs next.
enum SignInStep: Sendable, Equatable {
    case done(Tokens)
    /// Invited account, first sign-in with the temporary password: pick a new one.
    case newPasswordRequired(session: String, username: String)
}

/// Errors in the words the sign-in screen shows.
enum AuthError: Error, Equatable, LocalizedError {
    case wrongCredentials
    case userNotFound
    case passwordPolicy(String)
    case codeMismatch
    case codeExpired
    case tooManyAttempts
    case network
    case notConfigured
    case sessionExpired
    case other(String)

    var errorDescription: String? {
        switch self {
        case .wrongCredentials: "E-mailul sau parola nu sunt corecte."
        case .userNotFound: "Nu există un cont cu acest e-mail. Cere-i lui Sorin o invitație."
        case .passwordPolicy: "Parola trebuie să aibă cel puțin 8 caractere, cu literă mare, literă mică, cifră și simbol."
        case .codeMismatch: "Codul nu e corect. Verifică e-mailul și încearcă din nou."
        case .codeExpired: "Codul a expirat. Cere unul nou."
        case .tooManyAttempts: "Prea multe încercări. Mai așteaptă puțin și încearcă din nou."
        case .network: "Nu e conexiune la internet."
        case .notConfigured: "Aplicația nu are încă datele contului (amplify_outputs.json)."
        case .sessionExpired: "Sesiunea a expirat. Intră din nou în cont."
        case .other(let message): message
        }
    }

    /// Maps Cognito's `__type` to an error.
    static func from(type: String, message: String) -> AuthError {
        let name = type.split(separator: "#").last.map(String.init) ?? type
        switch name {
        case "NotAuthorizedException":
            return message.localizedCaseInsensitiveContains("expired") || message.localizedCaseInsensitiveContains("Refresh Token")
                ? .sessionExpired : .wrongCredentials
        case "UserNotFoundException": return .userNotFound
        case "InvalidPasswordException": return .passwordPolicy(message)
        case "CodeMismatchException": return .codeMismatch
        case "ExpiredCodeException": return .codeExpired
        case "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException": return .tooManyAttempts
        default: return .other(message.isEmpty ? name : message)
        }
    }
}

/// A minimal client for the Cognito user pool API: sign in (SRP), new password, refresh,
/// forgot password, sign out. Plain JSON over HTTPS, no SDK.
struct CognitoClient: Sendable {
    let config: AuthConfig
    var session: URLSession = .shared
    var now: @Sendable () -> Date = { Date() }

    func signIn(email: String, password: String) async throws -> SignInStep {
        let srp = CognitoSRP()
        let start = try await call("InitiateAuth", [
            "AuthFlow": "USER_SRP_AUTH",
            "ClientId": config.clientId,
            "AuthParameters": ["USERNAME": email, "SRP_A": srp.srpA],
        ])
        guard start["ChallengeName"] as? String == "PASSWORD_VERIFIER",
              let params = start["ChallengeParameters"] as? [String: String],
              let salt = params["SALT"], let bHex = params["SRP_B"], let block = params["SECRET_BLOCK"],
              let userId = params["USER_ID_FOR_SRP"], let serverB = BigUInt(hex: bHex) else {
            throw AuthError.other("Răspuns neașteptat de la server.")
        }
        let key = try srp.passwordKey(poolName: config.poolName, userId: userId, password: password, saltHex: salt, serverB: serverB)
        let timestamp = CognitoSRP.timestamp(now())
        guard let signature = CognitoSRP.signature(key: key, poolName: config.poolName, userId: userId,
                                                   secretBlock: block, timestamp: timestamp) else {
            throw AuthError.other("Răspuns neașteptat de la server.")
        }
        let username = params["USERNAME"] ?? userId
        let reply = try await call("RespondToAuthChallenge", [
            "ChallengeName": "PASSWORD_VERIFIER",
            "ClientId": config.clientId,
            "ChallengeResponses": [
                "USERNAME": username,
                "PASSWORD_CLAIM_SECRET_BLOCK": block,
                "PASSWORD_CLAIM_SIGNATURE": signature,
                "TIMESTAMP": timestamp,
            ],
        ])
        return try step(from: reply, username: username)
    }

    func completeNewPassword(session: String, username: String, newPassword: String) async throws -> Tokens {
        let reply = try await call("RespondToAuthChallenge", [
            "ChallengeName": "NEW_PASSWORD_REQUIRED",
            "ClientId": config.clientId,
            "Session": session,
            "ChallengeResponses": ["USERNAME": username, "NEW_PASSWORD": newPassword],
        ])
        guard case .done(let tokens) = try step(from: reply, username: username) else {
            throw AuthError.other("Răspuns neașteptat de la server.")
        }
        return tokens
    }

    /// New access and ID tokens from the refresh token (it stays the same).
    func refresh(_ tokens: Tokens) async throws -> Tokens {
        let reply = try await call("InitiateAuth", [
            "AuthFlow": "REFRESH_TOKEN_AUTH",
            "ClientId": config.clientId,
            "AuthParameters": ["REFRESH_TOKEN": tokens.refreshToken],
        ])
        guard let result = reply["AuthenticationResult"] as? [String: Any],
              let access = result["AccessToken"] as? String, let id = result["IdToken"] as? String else {
            throw AuthError.sessionExpired
        }
        let expires = (result["ExpiresIn"] as? Double) ?? 3600
        return Tokens(accessToken: access, idToken: id,
                      refreshToken: (result["RefreshToken"] as? String) ?? tokens.refreshToken,
                      expiresAt: now().addingTimeInterval(expires))
    }

    func forgotPassword(email: String) async throws {
        _ = try await call("ForgotPassword", ["ClientId": config.clientId, "Username": email])
    }

    func confirmForgotPassword(email: String, code: String, newPassword: String) async throws {
        _ = try await call("ConfirmForgotPassword", [
            "ClientId": config.clientId, "Username": email, "ConfirmationCode": code, "Password": newPassword,
        ])
    }

    /// Changes the person's name (the Cognito `name` attribute the web shows too).
    func updateName(_ name: String, accessToken: String) async throws {
        _ = try await call("UpdateUserAttributes", [
            "AccessToken": accessToken, "UserAttributes": [["Name": "name", "Value": name]],
        ])
    }

    /// Ends the session on the server too (best effort: signing out works offline).
    func revoke(_ tokens: Tokens) async {
        _ = try? await call("RevokeToken", ["ClientId": config.clientId, "Token": tokens.refreshToken])
    }

    // MARK: -

    private func step(from reply: [String: Any], username: String) throws -> SignInStep {
        if let result = reply["AuthenticationResult"] as? [String: Any],
           let access = result["AccessToken"] as? String, let id = result["IdToken"] as? String,
           let refresh = result["RefreshToken"] as? String {
            let expires = (result["ExpiresIn"] as? Double) ?? 3600
            return .done(Tokens(accessToken: access, idToken: id, refreshToken: refresh, expiresAt: now().addingTimeInterval(expires)))
        }
        if reply["ChallengeName"] as? String == "NEW_PASSWORD_REQUIRED", let session = reply["Session"] as? String {
            let params = reply["ChallengeParameters"] as? [String: String]
            return .newPasswordRequired(session: session, username: params?["USER_ID_FOR_SRP"] ?? username)
        }
        let challenge = reply["ChallengeName"] as? String ?? "?"
        throw AuthError.other("Pasul de autentificare \(challenge) nu e încă suportat în aplicație.")
    }

    private func call(_ action: String, _ body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: config.endpoint, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/x-amz-json-1.1", forHTTPHeaderField: "Content-Type")
        request.setValue("AWSCognitoIdentityProviderService.\(action)", forHTTPHeaderField: "X-Amz-Target")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where Self.isOffline(error) {
            throw AuthError.network
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let type = json["__type"] as? String ?? "HTTP \(http.statusCode)"
            let message = json["message"] as? String ?? json["Message"] as? String ?? ""
            throw AuthError.from(type: type, message: message)
        }
        return json
    }

    static func isOffline(_ error: URLError) -> Bool {
        [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost,
         .dataNotAllowed, .internationalRoamingOff].contains(error.code)
    }
}
