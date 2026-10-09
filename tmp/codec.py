#!/usr/bin/env python3
"""Demon's Crest password codec - derive/validate."""

MATRIX = [
    [0x40,0x04,0x20,0x80,0x02,0x10,0x01,0x08],
    [0x04,0x10,0x40,0x08,0x80,0x02,0x20,0x01],
    [0x08,0x02,0x20,0x40,0x01,0x10,0x04,0x80],
    [0x08,0x20,0x04,0x40,0x02,0x80,0x01,0x10],
    [0x20,0x40,0x80,0x04,0x01,0x08,0x02,0x10],
    [0x40,0x20,0x01,0x04,0x08,0x80,0x10,0x02],
    [0x01,0x40,0x08,0x20,0x04,0x10,0x80,0x02],
    [0x20,0x80,0x04,0x08,0x01,0x10,0x02,0x40],
]
# character index -> nibble, table at $01:C71B (21 entries)
IDX2NIB = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1,6,8,11,14]
# nibble -> possible character indices, table at $01:C730
NIB2IDX = {}
for nib, idx in enumerate(IDX2NIB):
    NIB2IDX.setdefault(nib, []).append(idx)

CONS = "BCDFGHJKLMNPQRSTVWXYZ"  # hypothesis for index -> letter

def unpermute(out):
    """out = list of 8 permuted bytes; return source list of 8 bytes."""
    src = [0]*8
    for r in range(8):
        for X in range(8):
            m = MATRIX[r][X]
            p = {1:0,2:1,4:2,8:3,0x10:4,0x20:5,0x40:6,0x80:7}[m]
            if (out[X] >> r) & 1:
                src[r] |= (1 << p)
    return src

def decode(pw, letter2idx):
    assert len(pw) == 16, pw
    idxs = [letter2idx[c] for c in pw]
    nibs = [IDX2NIB[i] for i in idxs]
    out = []
    for k in range(8):
        out.append((nibs[2*k] << 4) | nibs[2*k+1])
    src = unpermute(out)
    return src, out

def check(pw, letter2idx):
    src, out = decode(pw, letter2idx)
    s = (src[0]+src[1]+src[2]+src[3]+src[4]+src[5]+src[6]) & 0xFF
    return s == src[7], src

if __name__ == '__main__':
    v = {
    'V1':'HDDSDTGXBQQZNDMN',
    'V2':'LWDYMSQMVWDHGPSG',
    'V3':'MRBLMFNPHGJBJRZB',
    'V4':'QFFFKNRRDDLRXGTQ',
    'V5':'RBNLXHGBVGBBLYLD',
    'allitems':'PDQMRRMVFWGXDTSG',
    'stage1':'GDBFYLFVHZJSZHCS',
    'stage2':'HDDMNTKBHQLFXKLD',
    'stage3':'VWNPXSQXCGBHBPJP',
    'stage6':'PBGXRVNGKGKXWRZB',
    'ult':'FDQPQRMBFGNHGTKL',
    }
    l2i = {c:i for i,c in enumerate(CONS)}
    for k,pw in v.items():
        try:
            ok, src = check(pw, l2i)
            print(f'{k:9s} {pw} ok={ok} src={[hex(x) for x in src]}')
        except KeyError as e:
            print(f'{k:9s} {pw} UNKNOWN LETTER {e}')
