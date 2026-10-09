#!/usr/bin/env python3
"""Full round-trip test of the Demon's Crest password codec.

Implements BOTH directions as read from the disassembly:
  - generator ($04:BAB8): game state $1E50-$1E58 -> 16 chars
  - loader ($04:C0F0):    16 chars -> game state

Tests:
  1. forward permutation and inverse permutation are exact inverses
  2. loader(generate(state)) == state   (randomized property test)
  3. generate(loader(password)) == password, byte-exact, on all known vectors
"""
import random
from codec import MATRIX, IDX2NIB, CONS

BITPOS = {1: 0, 2: 1, 4: 2, 8: 3, 0x10: 4, 0x20: 5, 0x40: 6, 0x80: 7}


def permute(src):
    """Generator forward permutation ($04:BB63 area):
    out[X] bit r = src[r] bit p, where MATRIX[r][X] == (1<<p)."""
    out = []
    for X in range(8):
        b = 0
        for r in range(8):
            m = MATRIX[r][X]
            if src[r] & m:
                b |= 1 << r
        out.append(b)
    return out


def unpermute(out):
    """Decoder inverse permutation ($04:BC50)."""
    src = [0] * 8
    for r in range(8):
        for X in range(8):
            p = BITPOS[MATRIX[r][X]]
            if (out[X] >> r) & 1:
                src[r] |= 1 << p
    return src


# ---------------------------------------------------------------- loader ----
def loader_extract(src):
    """$04:C0F0: 8 reconstructed bytes (masked payload + key + checksum)
    -> game state dict $1E50-$1E58."""
    key = src[6]
    P = [b ^ key for b in src[0:6]]
    P0, P1, P2, P3, P4, P5 = P
    val = ((P2 << 8 | P1) & 0x07FE) >> 1          # $00/$1E56 ($C11C-$C124)

    e52 = P1 & 1                                  # from 16-bit STA $1E51 ($C107)
    e52 |= (val & 0x1F) << 1                      # loop 1 ($C127-$C13F)
    e52 |= (val & 0x00C0)                         # loop 2 ($C142-$C164) word bits 6,7
    e53 = (P2 & 0xF8) | ((val & 0x0300) >> 8)     # $C10F + loop 2 word bits 8,9

    hp = 4 + bin(P3 | (P4 << 8)).count('1')       # $C16B-$C17F: popcount($1E54.w)+4
    return {
        'hp':    hp,                              # $1E50
        'b1E51': P0,                              # $C107
        'b1E52': e52 & 0xFF,
        'b1E53': e53 & 0xFF,
        'b1E54': P3,                              # $C117 (16-bit store)
        'b1E55': P4,
        'val':   val,                             # $1E56/$1E57
        'b1E58': P5 & 0x0F,                       # $C188
    }


# ------------------------------------------------------------- generator ----
def generator_payload(st):
    """$04:BACB-$BAEC: game state -> unmasked payload bytes P0..P5."""
    val = st['val'] & 0x3FF
    P0 = st['b1E51'] & 0xFF
    P1 = (st['b1E52'] & 0x01) | ((val & 0x7F) << 1)
    P2 = ((val >> 7) & 0x07) | (st['b1E53'] & 0xF8)
    P3 = st['b1E54'] & 0xFF
    P4 = st['b1E55'] & 0xFF
    P5 = st['b1E58'] & 0x0F
    return [P0, P1, P2, P3, P4, P5]


def generator_encode(st, key_hi=None):
    """Full generator: state -> (src bytes, out bytes, char indices).
    key_hi: force the PRNG nibble (1..E) for reproducibility, else random."""
    P = generator_payload(st)
    if key_hi is None:
        key_hi = random.choice([n for n in range(1, 16) if n != 0xF])
    key = (key_hi << 4) | (sum(P) & 0x0F)         # $BAFC-$BB11
    masked = [p ^ key for p in P]                 # $BB13-$BB35
    chk = (sum(masked) + key) & 0xFF              # $BB37-$BB4B
    src = masked + [key, chk]
    out = permute(src)
    # nibbles hi,lo per byte -> char indices (primary table $C730: idx == nibble)
    idxs = []
    for b in out:
        idxs.append(b >> 4)
        idxs.append(b & 0xF)
    return src, out, idxs


# ----------------------------------------------------------------- decode ---
def decode(pw):
    """16 letters -> (char indices, nibbles, out bytes, src bytes)."""
    assert len(pw) == 16
    idxs = [CONS.index(c) for c in pw]
    nibs = [IDX2NIB[i] for i in idxs]
    out = [(nibs[2 * k] << 4) | nibs[2 * k + 1] for k in range(8)]
    src = unpermute(out)
    return idxs, nibs, out, src


def encode_idxs(idxs):
    """char indices -> nibbles -> out bytes -> src bytes (via inverse perm)."""
    nibs = [IDX2NIB[i] for i in idxs]
    out = [(nibs[2 * k] << 4) | nibs[2 * k + 1] for k in range(8)]
    return nibs, out, unpermute(out)


# ------------------------------------------------------------------ tests ---
VECTORS = {
    'V1': 'HDDSDTGXBQQZNDMN',
    'V2': 'LWDYMSQMVWDHGPSG',
    'V3': 'MRBLMFNPHGJBJRZB',
    'V4': 'QFFFKNRRDDLRXGTQ',
    'V5': 'RBNLXHGBVGBBLYLD',
    'allitems': 'PDQMRRMVFWGXDTSG',
    'stage1': 'GDBFYLFVHZJSZHCS',
    'stage2': 'HDDMNTKBHQLFXKLD',
    'stage6': 'PBGXRVNGKGKXWRZB',
    'ult': 'FDQPQRMBFGNHGTKL',
}

fails = 0

# Test 1: permute/unpermute inverses on random data
for _ in range(2000):
    src = [random.randrange(256) for _ in range(8)]
    if unpermute(permute(src)) != src:
        print('FAIL: permute/unpermute not inverse')
        fails += 1
        break
else:
    print('PASS: permute/unpermute are exact inverses (2000 random inputs)')

# Test 2: randomized state -> password -> state
# The game state has redundancy: hp = 4+popcount($1E54.w); $1E52 bits 1-7 and
# $1E53 bits 0-2 are copies of val (the generator reads val from $1E56 instead).
# Canonical state (as produced by the loader) is what must round-trip exactly.
for _ in range(2000):
    b1E54 = random.randrange(256)
    b1E55 = random.randrange(256)
    val = random.randrange(1024)
    st = {
        'b1E51': random.randrange(256),
        'b1E52': (random.randrange(2)) | ((val & 0x1F) << 1) | (val & 0x00C0),
        'b1E53': (random.randrange(256) & 0xF8) | ((val >> 8) & 0x03),
        'b1E54': b1E54,
        'b1E55': b1E55,
        'val':   val,
        'b1E58': random.randrange(16),
    }
    st['hp'] = 4 + bin(st['b1E54'] | (st['b1E55'] << 8)).count('1')
    src, out, idxs = generator_encode(st)
    # validate like the game does
    if src[7] != (sum(src[0:7]) & 0xFF):
        print('FAIL: checksum'); fails += 1; break
    P = [b ^ src[6] for b in src[0:6]]
    if (sum(P) & 0xF) != (src[6] & 0xF):
        print('FAIL: key low nibble'); fails += 1; break
    st2 = loader_extract(src)
    st2['hp'] = 4 + bin(st2['b1E54'] | (st2['b1E55'] << 8)).count('1')
    if st2 != st:
        print('FAIL: state mismatch')
        print('  in :', st)
        print('  out:', st2)
        fails += 1
        break
else:
    print('PASS: 2000 random states round-trip state->password->state')

# Test 3: known passwords: decode -> state -> encode must reproduce them exactly
for name, pw in VECTORS.items():
    idxs, nibs, out, src = decode(pw)
    ok_chk = src[7] == (sum(src[0:7]) & 0xFF)
    key = src[6]
    P = [b ^ key for b in src[0:6]]
    ok_key = (sum(P) & 0xF) == (key & 0xF)
    ok_hinib = 0 != (key & 0xF0) != 0xF0
    st = loader_extract(src)
    src2, out2, idxs2 = generator_encode(st, key_hi=key >> 4)
    # byte-exact payload round-trip; char indices may differ only in the
    # PRNG-chosen alternate glyphs, so compare at nibble level
    nibs2 = [IDX2NIB[i] for i in idxs2]
    same = (src2 == src) and (nibs2 == nibs)
    status = 'OK ' if (ok_chk and ok_key and ok_hinib and same) else 'FAIL'
    if status == 'FAIL':
        fails += 1
        print(f'{status} {name}: chk={ok_chk} key={ok_key} exact={same}')
        print(f'     src  orig={[hex(b) for b in src]}')
        print(f'     src  renc={[hex(b) for b in src2]}')
    else:
        print(f'{status} {name}: {pw}  state: HP={st["hp"]} '
              f'1E51={st["b1E51"]:02X} 1E52={st["b1E52"]:02X} '
              f'1E53={st["b1E53"]:02X} 1E54={st["b1E54"]:02X} '
              f'1E55={st["b1E55"]:02X} val={st["val"]:03X} 1E58={st["b1E58"]:02X}')

print('ALL PASS' if fails == 0 else f'{fails} FAILURES')