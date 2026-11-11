import Foundation
import Testing
@testable import KitchenTales

/// Vectors computed with a Python reference that matches pycognito's AWSSRP (the same math as
/// Amplify): see ios/README.md. Any change to the SRP code must keep these passing.
struct SRPTests {
    enum V {
        static let a = "938fa7c50421d066cf0041b6bbde990b30f0cd363f517f88958972da5e61b90d938fa7c50421d066cf0041b6bbde990b30f0cd363f517f88958972da5e61b90d938fa7c50421d066cf0041b6bbde990b30f0cd363f517f88958972da5e61b90d938fa7c50421d066cf0041b6bbde990b30f0cd363f517f88958972da5e61b90d"
        static let A = "48f6285b9a1334db7f8e47c8f88843d84ee9e6ab52abafe32f646e017d269a383058901adce2f22d2e1b42164e3f4f742398e525d63ae722fd5e37b046cd3306f28c0d38754ec4011a443ec7649af1f6758b26dd3c7d1dab37803345cac57aceb2b92bc9eef584bad987d7b61c58d14453939d466b3bbd80eb3de6bb130dadcc1f9d0a4eb26b8b833fa535911658b6a77cd6b93cfc3251616cb25640c42b9fef968027ea761c3905cd8c1a29eaf3fb8ba6eec5efaaaba7c7e6da7c212b5cece44cf46eb7d4b0e61a3c3c31d8b88f0fbea98bccaa881c8e90c07d0028b3d99bfe962c2b41ea003e7b5c4a9b92ab665b5fb770d55e84d0a87790d90ab82244d41feb2f545a2987879cb3f45d871559f2741fae55de740d250c43dccc274b3b1488d977561be4db1798f90e0217b25b2d894dae827071d490c32cafd24a5ade976d85a8922fbe040d73fde4ebc013d181fabf827da37b6c25cda6c6ed91bc0393e9ccf2dcf7478aa987f7c34fb5cb89ccd64ac2a2565dd95c0f7af7a97bb3286b7d"
        static let B = "6d217452c4035f3b03b404598d9448b31a97444ee22d417f82cda5bb55b8a3de7171d8732cef0aa108cd9e4d4907c39abc04c0cf308190b919b08ba4df676f4941be58298208a7786eecb958e8706f568fc185f38ac1df3b2ba8c9688f47b07ce3d7708faafb2222a245277ae01394daf4952622fbdabf72db1a94c31804479eeef4473750d695c046aba55e8f0b08c4fc5a5ee59e87ab570bca3e5fae89ce1f76a3dd692b8e24185afcbbbc13cf856d58f098be0e3508890a5262edfef8aad1560cd8d52c203aabcccf469fac15070398f1edac7f19f36a0c1d1b32d80b3b787562199a90ea3eafa80b977757334f603f266b43419bc4a1c141be304b2792976478f69e3b52d973f692d036d9adbc6051da165e368f309f87f3c9117f5f788f6fcc23c499939eec89fa611c3e887c7d96aa1c876a45f49a1ae4e8ba0c7762d7e07a873d519a44a8b194cef5f8afb5791f39965f18e33d93c209493707b901cacd0566c392daf7930aa202bdfe58d9cbb47b2462179cd5c590c1bab7a1d2e588"
        static let salt = "9a3f0c71e2b84d55c0de12"
        static let userId = "0e4c1a2b-1234-4cde-9abc-0123456789ab"
        static let password = "Parolă-test-ăîșț 1"
        static let pool = "mH3Vk6Rfm"
        static let k = "538282c4354742d7cbbde2359fcf67f9f5b3a6b08791e5011b43b8a5b66d9ee6"
        static let key = "a3a379986c90e6c84e0ccf06bac98295"
        static let secretBlock = "K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/UnoltJasqA5Njyn7jozYFsOvtI0/EDlws6LuFgDAjKZzJt7g=="
        static let timestamp = "Wed Nov 11 09:05:07 UTC 2026"
        static let signature = "nRC6+4+uBGIFrLvD78L1ygnb0+Nj7w3xuDxyLWHN0rI="
        static let p = "148de9c5a7a44d19e56cd9ae1a554bf67847afb0c58f6e12fa29ac7ddfca9940148de9c5a7a44d19e56cd9ae1a554bf67847afb0c58f6e12fa29ac7ddfca9940148de9c5a7a44d19e56cd9ae1a554bf67847afb0c58f6e12fa29ac7ddfca9940"
        static let q = "8e35c2cd3bf6641bdb0e2050b76932cbb2e6034a0ddacc1d9bea82a6ba57f7cf8e35c2cd3bf6641bdb0e2050b76932cbb2e6034a0ddacc1d9bea82a6ba57f7cf"
        static let m = "62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5a62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5a62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5a62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5a62c66a7a5dd70c3146618063c344e531e6d4b59e379808443ce962b3abd63c5b"
        static let pq = "b6b08b10e855162f20f9a33db803058ba9f872a573853c08508ffbca23fbe7645d6a515cea1338acd33d1b885bdb5d525a4b0dfd1929f326e440ce047ee27ac74d738c98037c44fb6486f09547b0af8d60a536af4b496e3d2761a474b5cd26c696c301871b272ecc438d4d578fadaa01b6acc409d7c43234d6d1a8aa91d13f62f0093b3b19690c4e9149d50cebd5523b065a28b2321f7b164320d67036eaac0"
        static let pmodq = "22656f1cb56ee5317202127e9a8e475750c3e807a67bdd1718690b090a4f29cc36f358e25d13324b576eec2cb4e3934dc90b97b86c0b4b2a1292b786ea19c30c"
        static let pdivq = "250041eaa2af83071c52f90142c7ca288a65a45c1fe5ba320f306de7bdc8df8c"
        static let ppowqm = "1c931cbe029e85c3e0e3ee370c08f71354f116df1a27f6124e4d674ee37601e1fabfbe21d335850913854de49da9e7153484bde0ca05a2dcc4fb76dc3c30dd7b7c806febfc720972a02205d3e83bb207964a1e5fa9125ac92e4c8a9e0f09b02a7179c0e8e909028575afa63d7de0f78ba677eb3c4325f1aa766a5715eed6301f4e7ab828d90779f11205241a7bb4d733873190cc4a9a4188882843ff84b3bce8"
        static let pplusq = "148de9c5a7a44d19e56cd9ae1a554bf67847afb0c58f6e12fa29ac7ddfca9940a2c3ac92e39ab135c07af9fed1be7ec22b2db2fad36a3a3096142f249a22910fa2c3ac92e39ab135c07af9fed1be7ec22b2db2fad36a3a3096142f249a22910f"
        static let pminusq = "148de9c5a7a44d19e56cd9ae1a554bf67847afb0c58f6e12fa29ac7ddfca993f865826f86bade8fe0a5eb95d62ec192ac561ac66b7b4a1f55e3f29d72572a170865826f86bade8fe0a5eb95d62ec192ac561ac66b7b4a1f55e3f29d72572a171"
    }

    private func big(_ hex: String) -> BigUInt { BigUInt(hex: hex)! }

    @Test func hexRoundTrip() {
        #expect(big(V.p).hex == V.p)
        #expect(BigUInt(hex: "00ff")!.hex == "ff")
        #expect(BigUInt(hex: "0")!.hex == "0")
        #expect(BigUInt(hex: "xyz") == nil)
    }

    @Test func arithmetic() {
        let p = big(V.p), q = big(V.q)
        #expect((p + q).hex == V.pplusq)
        #expect((p - q).hex == V.pminusq)
        #expect((p * q).hex == V.pq)
        #expect((p % q).hex == V.pmodq)
        #expect((p / q).hex == V.pdivq)
        #expect(p.power(q, modulus: big(V.m)).hex == V.ppowqm)
        #expect((BigUInt(1000) % BigUInt(7)) == BigUInt(6))
    }

    @Test func divisionMatchesMultiplication() {
        // q * (p / q) + p % q == p for several sizes, including single-limb divisors.
        let p = big(V.pq)
        for d in [big(V.q), big(V.p), BigUInt(97), BigUInt(0xFFFF_FFFF), BigUInt(0x1_0000_0001), big(V.m)] {
            let (quotient, remainder) = BigUInt.divMod(p, d)
            #expect(quotient * d + remainder == p)
            #expect(remainder < d)
        }
    }

    @Test func multiplierK() {
        #expect(CognitoSRP.k.hex == V.k)
    }

    @Test func publicA() {
        #expect(CognitoSRP(a: big(V.a)).srpA == V.A)
    }

    @Test func passwordKeyAndSignature() throws {
        let srp = CognitoSRP(a: big(V.a))
        let key = try srp.passwordKey(poolName: V.pool, userId: V.userId, password: V.password, saltHex: V.salt, serverB: big(V.B))
        #expect(key.map { String(format: "%02x", $0) }.joined() == V.key)
        let signature = CognitoSRP.signature(key: key, poolName: V.pool, userId: V.userId, secretBlock: V.secretBlock, timestamp: V.timestamp)
        #expect(signature == V.signature)
    }

    @Test func rejectsZeroB() {
        let srp = CognitoSRP(a: big(V.a))
        #expect(throws: CognitoSRP.Failure.self) {
            try srp.passwordKey(poolName: V.pool, userId: V.userId, password: V.password, saltHex: V.salt, serverB: CognitoSRP.N)
        }
    }

    @Test func randomAIsInRange() {
        let srp = CognitoSRP()
        #expect(!srp.a.isZero)
        #expect(srp.A < CognitoSRP.N)
    }

    @Test func padHex() {
        #expect(CognitoSRP.padHex("abc") == "0abc")
        #expect(CognitoSRP.padHex("8f") == "008f")
        #expect(CognitoSRP.padHex("7f") == "7f")
    }

    @Test func timestampHasNoLeadingZeroDay() {
        // 2026-11-01 09:05:07 UTC
        let date = Date(timeIntervalSince1970: 1_793_523_907)
        #expect(CognitoSRP.timestamp(date) == "Sun Nov 1 09:05:07 UTC 2026")
    }
}
