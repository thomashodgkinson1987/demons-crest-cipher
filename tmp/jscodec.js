/*CODEC-BEGIN*/
// ===== Demon's Crest password codec =====
// Port of tmp/roundtrip.py (verified byte-exact against 10 known passwords).
const ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ";
// char index -> nibble (table $01:C71B, 21 entries; 16-20 are PRNG aliases)
const IDX2NIB = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1,6,8,11,14];
// nibble -> [primary char index, alternate char index] (table $01:C730)
const NIB2IDX = [[0,0],[1,16],[2,2],[3,3],[4,4],[5,5],[6,17],[7,7],[8,18],[9,9],
                 [10,10],[11,19],[12,12],[13,13],[14,20],[15,15]];
// 8x8 bit-permutation matrix at $01:C834
const MATRIX = [
  [0x40,0x04,0x20,0x80,0x02,0x10,0x01,0x08],
  [0x04,0x10,0x40,0x08,0x80,0x02,0x20,0x01],
  [0x08,0x02,0x20,0x40,0x01,0x10,0x04,0x80],
  [0x08,0x20,0x04,0x40,0x02,0x80,0x01,0x10],
  [0x20,0x40,0x80,0x04,0x01,0x08,0x02,0x10],
  [0x40,0x20,0x01,0x04,0x08,0x80,0x10,0x02],
  [0x01,0x40,0x08,0x20,0x04,0x10,0x80,0x02],
  [0x20,0x80,0x04,0x08,0x01,0x10,0x02,0x40],
];
const BITPOS = {1:0,2:1,4:2,8:3,16:4,32:5,64:6,128:7};

function popcount(x){ let c=0; while(x){ x &= x-1; c++; } return c; }

// Generator forward permutation: out[X] bit r = src[r] bit p where MATRIX[r][X]==1<<p
function permute(src){
  const out = [];
  for (let X = 0; X < 8; X++){
    let b = 0;
    for (let r = 0; r < 8; r++) if (src[r] & MATRIX[r][X]) b |= (1 << r);
    out.push(b);
  }
  return out;
}
// Decoder inverse permutation
function unpermute(out){
  const src = [0,0,0,0,0,0,0,0];
  for (let r = 0; r < 8; r++)
    for (let X = 0; X < 8; X++){
      const p = BITPOS[MATRIX[r][X]];
      if ((out[X] >> r) & 1) src[r] |= (1 << p);
    }
  return src;
}

// 16 letters -> {idxs, nibs, out, src}
function decodePassword(pw){
  const idxs = [...pw].map(c => ALPHABET.indexOf(c));
  const nibs = idxs.map(i => IDX2NIB[i]);
  const out = [];
  for (let k = 0; k < 8; k++) out.push((nibs[2*k] << 4) | nibs[2*k+1]);
  return { idxs, nibs, out, src: unpermute(out) };
}

function unmaskPayload(src){ const key = src[6]; return src.slice(0,6).map(b => b ^ key); }

// The game's checks: checksum, key nibbles, plausibility gate (findings §3/§5.1)
function validate(src){
  const sum = src.slice(0,7).reduce((a,b)=>a+b,0) & 0xFF;
  if (sum !== src[7]) return { ok:false, reason:'checksum mismatch (byte 8)' };
  const key = src[6];
  if ((key & 0xF0) === 0)      return { ok:false, reason:'key high nibble is $0 (invalid)' };
  if ((key & 0xF0) === 0xF0)   return { ok:false, reason:'key high nibble is $F (invalid)' };
  const P = unmaskPayload(src);
  if ((P.reduce((a,b)=>a+b,0) & 0xF) !== (key & 0xF))
    return { ok:false, reason:'key low nibble does not match payload sum' };
  const [P0,P1,P2,P3,P4] = P;
  const allFF = P0===0xFF && P1===0xFF && P2===0xFF && P3===0xFF && P4===0xFF;
  const all00 = P0===0 && P1===0 && P2===0 && P3===0 && P4===0;
  const freeShape = ((P3 & 1) === 1) && ((P1 & 1) === 0);
  if (!freeShape && !allFF && !all00)
    return { ok:false, reason:"rejected by the game's plausibility gate" };
  return { ok:true, P, key };
}

// Loader ($04:C0F0): src -> game state $1E50-$1E58
function extractState(src){
  const P = unmaskPayload(src);
  const val = ((P[2] << 8 | P[1]) & 0x07FE) >> 1;
  const e52 = ((P[1] & 1) | ((val & 0x1F) << 1) | (val & 0x0C0)) & 0xFF;
  const e53 = ((P[2] & 0xF8) | ((val & 0x300) >> 8)) & 0xFF;
  const cont = (P[4] << 8) | P[3];
  return {
    hp: 4 + popcount(cont),
    crest: P[0], ult: (P[1] & 1) === 1,
    spell: val & 0x1F, potion: (val >> 5) & 0x1F,
    talis: e53 & 0xF8, cont,
    boss: (P[5] & 1) === 1, unknown58: (P[5] >> 1) & 7,
    raw: { e51: P[0], e52, e53, e54: P[3], e55: P[4], val, e58: P[5] & 0x0F }
  };
}

// Generator ($04:BACB-$BAEC): state -> unmasked payload P0..P5
function payload(st){
  const val = (st.spell & 0x1F) | ((st.potion & 0x1F) << 5);
  return [
    st.crest & 0xFF,
    (st.ult ? 1 : 0) | ((val & 0x7F) << 1),
    ((val >> 7) & 7) | (st.talis & 0xF8),
    st.cont & 0xFF,
    (st.cont >> 8) & 0xFF,
    st.boss ? 1 : 0
  ];
}

// Enforce the game's acceptance rules on a state (findings §5.1)
function autoFix(st){
  const s = Object.assign({}, st);
  const notices = [];
  const anyItem = s.crest !== 0 || s.ult || s.spell !== 0 || s.potion !== 0 || s.talis !== 0;
  if (!(s.cont & 1) && (popcount(s.cont) > 0 || anyItem)){
    s.cont |= 1;
    notices.push('Container 1 auto-enabled: the game only accepts passwords whose heart-container bits include container 1.');
  }
  if (s.ult && (s.crest !== 0xFF || s.spell !== 0x1F || s.potion !== 0x1F || s.talis !== 0xF8 || s.cont !== 0xFFFF)){
    s.crest = 0xFF; s.spell = 0x1F; s.potion = 0x1F; s.talis = 0xF8; s.cont = 0xFFFF;
    notices.push('Ultimate Gargoyle owned: state auto-completed to the exact 100% form the game requires.');
  }
  return { state: s, notices };
}

// Full generator: state -> {src, out, pw}. keyHi null = random 1..$E; alias = random glyphs.
function encodeState(st, keyHi, alias){
  const P = payload(st);
  if (keyHi == null){
    do { keyHi = 1 + Math.floor(Math.random() * 14); } while (keyHi === 0xF);
  }
  const key = (keyHi << 4) | (P.reduce((a,b)=>a+b,0) & 0xF);
  const masked = P.map(b => b ^ key);
  const chk = (masked.reduce((a,b)=>a+b,0) + key) & 0xFF;
  const src = masked.concat([key, chk]);
  const out = permute(src);
  let pw = '';
  for (const byte of out){
    pw += ALPHABET[pickIdx(byte >> 4, alias)];
    pw += ALPHABET[pickIdx(byte & 0xF, alias)];
  }
  return { src, out, pw };
}
function pickIdx(nib, alias){
  const pair = NIB2IDX[nib];
  return (alias && pair[1] !== pair[0] && Math.random() < 0.5) ? pair[1] : pair[0];
}

const KNOWN = [
  ['V1',      'HDDSDTGXBQQZNDMN'],
  ['V2',      'LWDYMSQMVWDHGPSG'],
  ['V3',      'MRBLMFNPHGJBJRZB'],
  ['V4 100%', 'QFFFKNRRDDLRXGTQ'],
  ['V5 BOSS', 'RBNLXHGBVGBBLYLD'],
  ['ALLITEMS','PDQMRRMVFWGXDTSG'],
  ['STAGE1',  'GDBFYLFVHZJSZHCS'],
  ['STAGE2',  'HDDMNTKBHQLFXKLD'],
  ['STAGE6',  'PBGXRVNGKGKXWRZB'],
  ['ULT',     'FDQPQRMBFGNHGTKL'],
];

if (typeof module !== 'undefined') module.exports = {
  ALPHABET, IDX2NIB, NIB2IDX, MATRIX, KNOWN, popcount, permute, unpermute,
  decodePassword, unmaskPayload, validate, extractState, payload, autoFix, encodeState
};
/*CODEC-END*/
export { ALPHABET, IDX2NIB, NIB2IDX, MATRIX, KNOWN, popcount, permute, unpermute,
         decodePassword, unmaskPayload, validate, extractState, payload, autoFix, encodeState };
