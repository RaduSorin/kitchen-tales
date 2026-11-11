import hashlib, hmac, base64, json
N_HEX = ('FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' '29024E088A67CC74020BBEA63B139B22514A08798E3404DD'
 'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' 'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED'
 'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' 'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F'
 '83655D23DCA3AD961C62F356208552BB9ED529077096966D' '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B'
 'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' 'DE2BCBF6955817183995497CEA956AE515D2261898FA0510'
 '15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64' 'ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7'
 'ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6B' 'F12FFA06D98A0864D87602733EC86A64521F2B18177B200C'
 'BBE117577A615D6C770988C0BAD946E208E24FA074E5AB31' '43DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF')
N = int(N_HEX, 16); g = 2
def H(b): return hashlib.sha256(b).digest()
def pad_hex(v):
    h = '%x' % v if isinstance(v, int) else v
    if len(h) % 2 == 1: h = '0' + h
    elif h[0] in '89abcdefABCDEF': h = '00' + h
    return h
k = int.from_bytes(H(bytes.fromhex('00' + N_HEX + '02')), 'big')
pool = 'mH3Vk6Rfm'
user_id = '0e4c1a2b-1234-4cde-9abc-0123456789ab'
password = 'Parolă-test-ăîșț 1'
a = int.from_bytes(H(b'a-fixed-seed') * 4, 'big')  # 1024-bit
A = pow(g, a, N)
salt_hex = '9a3f0c71e2b84d55c0de12'  # odd-ish length to exercise padding? length 22 even, starts with 9 -> '00'
b = int.from_bytes(H(b'b-fixed-seed') * 4, 'big')
x_inner = H((pool + user_id + ':' + password).encode())
x = int.from_bytes(H(bytes.fromhex(pad_hex(salt_hex)) + x_inner), 'big')
v = pow(g, x, N)
B = (k * v + pow(g, b, N)) % N
u = int.from_bytes(H(bytes.fromhex(pad_hex(A) + pad_hex(B))), 'big')
S = pow((B - k * pow(g, x, N)) % N, a + u * x, N)
prk = hmac.new(bytes.fromhex(pad_hex(u)), bytes.fromhex(pad_hex(S)), hashlib.sha256).digest()
key = hmac.new(prk, b'Caldera Derived Key\x01', hashlib.sha256).digest()[:16]
secret_block = base64.b64encode(H(b'secret') + H(b'block')).decode()
ts = 'Wed Nov 11 09:05:07 UTC 2026'
sig = base64.b64encode(hmac.new(key, pool.encode() + user_id.encode() + base64.b64decode(secret_block) + ts.encode(), hashlib.sha256).digest()).decode()
# Arithmetic vectors
p = int.from_bytes(H(b'p')*3, 'big'); q = int.from_bytes(H(b'q')*2, 'big'); m = int.from_bytes(H(b'm')*5, 'big') | 1
vec = dict(a='%x'%a, A='%x'%A, B='%x'%B, salt=salt_hex, userId=user_id, password=password, pool=pool,
  k='%x'%k, u='%x'%u, x='%x'%x, S='%x'%S, key=key.hex(), secretBlock=secret_block, timestamp=ts, signature=sig,
  p='%x'%p, q='%x'%q, m='%x'%m, pq='%x'%(p*q), pmodq='%x'%(p%q), pdivq='%x'%(p//q), ppowqm='%x'%pow(p,q,m), pplusq='%x'%(p+q), pminusq='%x'%(p-q))
print(json.dumps(vec, indent=1, ensure_ascii=False))
