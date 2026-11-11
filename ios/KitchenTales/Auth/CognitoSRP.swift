import CryptoKit
import Foundation
import Security

/// Cognito's Secure Remote Password sign-in (USER_SRP_AUTH): the password never leaves the
/// phone, only a proof that we know it. Same math as Amplify's JS library uses on the web.
struct CognitoSRP: Sendable {
    // RFC 5054 3072-bit group, g = 2.
    static let nHex =
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
        "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
        "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
        "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7" +
        "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF"
    static let N = BigUInt(hex: nHex)!
    static let g = BigUInt(2)
    static let k = BigUInt(sha256(Data(hexString: "00" + nHex + "02")!))

    /// The private ephemeral value `a` and the public `A = g^a mod N` sent in SRP_A.
    let a: BigUInt
    let A: BigUInt

    init() {
        var bytes = [UInt8](repeating: 0, count: 128)
        var a: BigUInt
        repeat {
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            a = BigUInt(Data(bytes)) % Self.N
        } while a.isZero
        self.init(a: a)
    }

    /// For tests: a fixed `a`.
    init(a: BigUInt) {
        self.a = a
        A = Self.g.power(a, modulus: Self.N)
    }

    var srpA: String { A.hex }

    enum Failure: Error { case badServerValue }

    /// The 16-byte key both sides derive (`getPasswordAuthenticationKey` in Amplify).
    func passwordKey(poolName: String, userId: String, password: String, saltHex: String, serverB: BigUInt) throws -> Data {
        guard !(serverB % Self.N).isZero else { throw Failure.badServerValue }
        let u = BigUInt(Self.sha256(Data(hexString: Self.padHex(A) + Self.padHex(serverB))!))
        guard !u.isZero else { throw Failure.badServerValue }
        let inner = Self.sha256(Data((poolName + userId + ":" + password).utf8))
        let x = BigUInt(Self.sha256(Data(hexString: Self.padHex(saltHex))! + inner))
        let gx = Self.g.power(x, modulus: Self.N)
        let kgx = (Self.k * gx) % Self.N
        let bMod = serverB % Self.N
        let base = Self.compare(bMod, kgx) >= 0 ? bMod - kgx : bMod + Self.N - kgx
        let S = base.power(a + u * x, modulus: Self.N)
        let prk = HMAC<SHA256>.authenticationCode(for: Data(hexString: Self.padHex(S))!,
                                                  using: SymmetricKey(data: Data(hexString: Self.padHex(u))!))
        var info = Data("Caldera Derived Key".utf8)
        info.append(1)
        let okm = HMAC<SHA256>.authenticationCode(for: info, using: SymmetricKey(data: Data(prk)))
        return Data(okm).prefix(16)
    }

    /// PASSWORD_CLAIM_SIGNATURE for the PASSWORD_VERIFIER challenge.
    static func signature(key: Data, poolName: String, userId: String, secretBlock: String, timestamp: String) -> String? {
        guard let block = Data(base64Encoded: secretBlock) else { return nil }
        var message = Data(poolName.utf8)
        message.append(Data(userId.utf8))
        message.append(block)
        message.append(Data(timestamp.utf8))
        let mac = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key))
        return Data(mac).base64EncodedString()
    }

    /// Cognito's timestamp: "Wed Nov 11 9:05:07 UTC 2026" (day without a leading zero, English, UTC).
    static func timestamp(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "EEE MMM d HH:mm:ss 'UTC' yyyy"
        return f.string(from: date)
    }

    /// Hex with an even length and a leading "00" when the top bit is set (a positive number).
    static func padHex(_ value: BigUInt) -> String { padHex(value.hex) }
    static func padHex(_ hex: String) -> String {
        if hex.count % 2 == 1 { return "0" + hex }
        if let first = hex.first, "89abcdefABCDEF".contains(first) { return "00" + hex }
        return hex
    }

    static func sha256(_ data: Data) -> Data { Data(SHA256.hash(data: data)) }
    private static func compare(_ a: BigUInt, _ b: BigUInt) -> Int { BigUInt.compare(a, b) }
}

extension Data {
    init?(hexString: String) {
        guard let n = BigUInt(hex: hexString) else { return nil }
        // Keep leading zero bytes: the hash input depends on them.
        let body = n.data
        let length = (hexString.count + 1) / 2
        self = Data(repeating: 0, count: Swift.max(0, length - body.count)) + body
    }
}
