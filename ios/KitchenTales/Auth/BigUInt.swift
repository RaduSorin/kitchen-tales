import Foundation

/// A small arbitrary-precision unsigned integer, just enough for Cognito's SRP sign-in
/// (3072-bit modular exponentiation). Limbs are 32-bit, least significant first.
struct BigUInt: Equatable, Sendable {
    private(set) var limbs: [UInt32]

    init() { limbs = [] }

    init(_ value: UInt64) {
        limbs = [UInt32(truncatingIfNeeded: value), UInt32(truncatingIfNeeded: value >> 32)]
        normalize()
    }

    private init(limbs: [UInt32]) {
        self.limbs = limbs
        normalize()
    }

    /// From big-endian bytes.
    init(_ data: Data) {
        var out = [UInt32]()
        out.reserveCapacity(data.count / 4 + 1)
        let bytes = [UInt8](data)
        var i = bytes.count
        while i > 0 {
            let start = max(0, i - 4)
            var limb: UInt32 = 0
            for b in bytes[start..<i] { limb = limb << 8 | UInt32(b) }
            out.append(limb)
            i = start
        }
        self.init(limbs: out)
    }

    /// From a hex string (no prefix, any case). Returns nil on a non-hex character.
    init?(hex: String) {
        var bytes = [UInt8]()
        var chars = Array(hex.utf8)
        if chars.count % 2 == 1 { chars.insert(UInt8(ascii: "0"), at: 0) }
        bytes.reserveCapacity(chars.count / 2)
        var i = 0
        while i < chars.count {
            guard let hi = Self.nibble(chars[i]), let lo = Self.nibble(chars[i + 1]) else { return nil }
            bytes.append(hi << 4 | lo)
            i += 2
        }
        self.init(Data(bytes))
    }

    private static func nibble(_ c: UInt8) -> UInt8? {
        switch c {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): c - UInt8(ascii: "0")
        case UInt8(ascii: "a")...UInt8(ascii: "f"): c - UInt8(ascii: "a") + 10
        case UInt8(ascii: "A")...UInt8(ascii: "F"): c - UInt8(ascii: "A") + 10
        default: nil
        }
    }

    var isZero: Bool { limbs.isEmpty }

    /// Big-endian bytes without leading zeros (empty for zero).
    var data: Data {
        var bytes = [UInt8]()
        bytes.reserveCapacity(limbs.count * 4)
        for limb in limbs.reversed() {
            bytes.append(UInt8(truncatingIfNeeded: limb >> 24))
            bytes.append(UInt8(truncatingIfNeeded: limb >> 16))
            bytes.append(UInt8(truncatingIfNeeded: limb >> 8))
            bytes.append(UInt8(truncatingIfNeeded: limb))
        }
        let first = bytes.firstIndex { $0 != 0 } ?? bytes.count
        return Data(bytes[first...])
    }

    /// Lowercase hex without leading zeros ("0" for zero), like Python's `'%x' % n`.
    var hex: String {
        if isZero { return "0" }
        let s = data.map { String(format: "%02x", $0) }.joined()
        return s.hasPrefix("0") ? String(s.dropFirst()) : s
    }

    private mutating func normalize() {
        while let last = limbs.last, last == 0 { limbs.removeLast() }
    }

    // MARK: Comparison

    static func compare(_ a: BigUInt, _ b: BigUInt) -> Int {
        if a.limbs.count != b.limbs.count { return a.limbs.count < b.limbs.count ? -1 : 1 }
        for i in stride(from: a.limbs.count - 1, through: 0, by: -1) where a.limbs[i] != b.limbs[i] {
            return a.limbs[i] < b.limbs[i] ? -1 : 1
        }
        return 0
    }

    static func < (a: BigUInt, b: BigUInt) -> Bool { compare(a, b) < 0 }

    // MARK: Arithmetic

    static func + (a: BigUInt, b: BigUInt) -> BigUInt {
        let n = max(a.limbs.count, b.limbs.count)
        var out = [UInt32](repeating: 0, count: n + 1)
        var carry: UInt64 = 0
        for i in 0..<n {
            let s = UInt64(i < a.limbs.count ? a.limbs[i] : 0) + UInt64(i < b.limbs.count ? b.limbs[i] : 0) + carry
            out[i] = UInt32(truncatingIfNeeded: s)
            carry = s >> 32
        }
        out[n] = UInt32(carry)
        return BigUInt(limbs: out)
    }

    /// a - b; requires a >= b.
    static func - (a: BigUInt, b: BigUInt) -> BigUInt {
        precondition(compare(a, b) >= 0, "BigUInt subtraction underflow")
        var out = a.limbs
        var borrow: Int64 = 0
        for i in 0..<out.count {
            var d = Int64(out[i]) - borrow - Int64(i < b.limbs.count ? b.limbs[i] : 0)
            if d < 0 { d += 1 << 32; borrow = 1 } else { borrow = 0 }
            out[i] = UInt32(d)
        }
        return BigUInt(limbs: out)
    }

    static func * (a: BigUInt, b: BigUInt) -> BigUInt {
        if a.isZero || b.isZero { return BigUInt() }
        var out = [UInt32](repeating: 0, count: a.limbs.count + b.limbs.count)
        for i in 0..<a.limbs.count {
            var carry: UInt64 = 0
            let ai = UInt64(a.limbs[i])
            if ai == 0 { continue }
            for j in 0..<b.limbs.count {
                let t = ai * UInt64(b.limbs[j]) + UInt64(out[i + j]) + carry
                out[i + j] = UInt32(truncatingIfNeeded: t)
                carry = t >> 32
            }
            var k = i + b.limbs.count
            while carry != 0 {
                let t = UInt64(out[k]) + carry
                out[k] = UInt32(truncatingIfNeeded: t)
                carry = t >> 32
                k += 1
            }
        }
        return BigUInt(limbs: out)
    }

    /// Quotient and remainder (Knuth, TAOCP vol. 2, algorithm D).
    static func divMod(_ u: BigUInt, _ v: BigUInt) -> (quotient: BigUInt, remainder: BigUInt) {
        precondition(!v.isZero, "BigUInt division by zero")
        if compare(u, v) < 0 { return (BigUInt(), u) }
        if v.limbs.count == 1 {
            let d = UInt64(v.limbs[0])
            var q = [UInt32](repeating: 0, count: u.limbs.count)
            var r: UInt64 = 0
            for i in stride(from: u.limbs.count - 1, through: 0, by: -1) {
                let cur = r << 32 | UInt64(u.limbs[i])
                q[i] = UInt32(cur / d)
                r = cur % d
            }
            return (BigUInt(limbs: q), BigUInt(r))
        }
        let n = v.limbs.count
        let m = u.limbs.count - n
        let shift = UInt32(v.limbs[n - 1].leadingZeroBitCount)
        let vn = shifted(v.limbs, by: shift, extra: false)
        var un = shifted(u.limbs, by: shift, extra: true)
        var q = [UInt32](repeating: 0, count: m + 1)
        let base: UInt64 = 1 << 32
        let vTop = UInt64(vn[n - 1]), vNext = UInt64(vn[n - 2])
        for j in stride(from: m, through: 0, by: -1) {
            let num = UInt64(un[j + n]) << 32 | UInt64(un[j + n - 1])
            var qhat = num / vTop
            var rhat = num % vTop
            while qhat >= base || qhat * vNext > (rhat << 32 | UInt64(un[j + n - 2])) {
                qhat -= 1
                rhat += vTop
                if rhat >= base { break }
            }
            // Multiply and subtract.
            var borrow: Int64 = 0
            var carry: UInt64 = 0
            for i in 0..<n {
                let p = qhat * UInt64(vn[i]) + carry
                carry = p >> 32
                let t = Int64(un[i + j]) - borrow - Int64(p & 0xFFFF_FFFF)
                un[i + j] = UInt32(truncatingIfNeeded: t)
                borrow = t < 0 ? 1 : 0
            }
            let t = Int64(un[j + n]) - borrow - Int64(carry)
            un[j + n] = UInt32(truncatingIfNeeded: t)
            if t < 0 {
                // Added back: qhat was one too large.
                qhat -= 1
                var c: UInt64 = 0
                for i in 0..<n {
                    let s = UInt64(un[i + j]) + UInt64(vn[i]) + c
                    un[i + j] = UInt32(truncatingIfNeeded: s)
                    c = s >> 32
                }
                un[j + n] = UInt32(truncatingIfNeeded: UInt64(un[j + n]) + c)
            }
            q[j] = UInt32(truncatingIfNeeded: qhat)
        }
        // Unnormalize the remainder.
        var r = [UInt32](repeating: 0, count: n)
        if shift == 0 {
            for i in 0..<n { r[i] = un[i] }
        } else {
            for i in 0..<n { r[i] = un[i] >> shift | un[i + 1] << (32 - shift) }
        }
        return (BigUInt(limbs: q), BigUInt(limbs: r))
    }

    private static func shifted(_ x: [UInt32], by s: UInt32, extra: Bool) -> [UInt32] {
        var out = [UInt32](repeating: 0, count: x.count + (extra ? 1 : 0))
        if s == 0 {
            for i in 0..<x.count { out[i] = x[i] }
            return out
        }
        var carry: UInt32 = 0
        for i in 0..<x.count {
            out[i] = x[i] << s | carry
            carry = x[i] >> (32 - s)
        }
        if extra { out[x.count] = carry }
        return out
    }

    static func % (a: BigUInt, m: BigUInt) -> BigUInt { divMod(a, m).remainder }
    static func / (a: BigUInt, m: BigUInt) -> BigUInt { divMod(a, m).quotient }

    /// self^exponent mod modulus, by square-and-multiply.
    func power(_ exponent: BigUInt, modulus: BigUInt) -> BigUInt {
        if modulus == BigUInt(1) { return BigUInt() }
        var result = BigUInt(1)
        var base = self % modulus
        for limb in exponent.limbs.indices {
            var bits = exponent.limbs[limb]
            let count = limb == exponent.limbs.count - 1 ? 32 - bits.leadingZeroBitCount : 32
            for _ in 0..<count {
                if bits & 1 == 1 { result = (result * base) % modulus }
                bits >>= 1
                base = (base * base) % modulus
            }
        }
        return result
    }
}
