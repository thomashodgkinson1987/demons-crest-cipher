# Demon's Crest (USA) — Password System Reverse Engineering

Living document. ROM: `Demon's Crest (USA).sfc` (headerless, 2 MiB = 0x200000 bytes,
LoROM + FastROM, map mode byte `$00:FFD5 = $30`, title at `$00:FFC0`).

## ROM / mapping notes

- LoROM mapping used throughout: `file_offset = ((bank & 0x3F) << 15) | (addr & 0x7FFF)`.
  Banks `$80-$BF` mirror `$00-$3F` (FastROM), e.g. `$84:BAB8` == `$04:BAB8`.
- Reset vector `$00:FFFC = $FF8F` → `JML $80:8000` (bank 0 mirror).
- Text in this game is plain ASCII with control bytes `$01` (newline), `$02` (page/box), `$5D` (`]`).
- Disassembly helper tracks the 65C816 M/X flags (REP/SEP), see `tmp/disasm.py`.
  **Bugs found & fixed this session** (they silently misaligned everything downstream):
  1. `REP`/`SEP` immediates are always 8-bit (were sized by the M flag → 3-byte decode when M=0).
  2. `PEA`/`PER` immediates are always 16-bit (were sized by the M flag → 2-byte decode when M=1).
  When in doubt, verify suspicious spots against raw bytes.

## 0. Location summary

| Address (CPU) | File offset | Contents |
|---|---|---|
| `$04:BAB8` | `0x23AB8` | **Generator (encode)**: state `$1E50..$1E58` → 16 character indices `$1E61..$1E70`; input mapping at `$04:BACB-$BAEC`, key/keysum at `$BAFC-$BB4B` |
| `$04:BC3C` | `0x23C3C` | **Validator** (checksum + key checks) → falls into the plausibility gate at `$BD0F`, returns **C=1 = accept / C=0 = reject** |
| `$04:BC0F` | `0x23C0F` | Packer helper: 16 char-indices `$1D70..$1D7F` → 8 bytes `$1D68..$1D6F` |
| `$04:BD0F` | `0x23D0F` | **Plausibility gate** (end of validator): only certain payload shapes are accepted (see §5). *Not* the state extractor (earlier hypothesis, corrected) |
| `$04:C0E8` | `0x240E8` | **Only caller of the validator** (`JSR $BC3C`); `BCS → $C0F0` (load state), else `JMP $C200` (error) |
| `$04:C0F0` | `0x240F0` | **State loader (decode)**: unmasked payload `$10..$15` → game state `$1E50..$1E58` (full map in §7) |
| `$04:C200` | `0x24200` | Invalid-password handler: `ERROR! RETRY?` screen state (`$1D50 = $02`), sounds via `$BF3D` |
| `$04:BC00` | `0x23C00` | nibble → char-index helper (uses `$C730`, PRNG-selected alias) |
| `$04:BD46` | `0x23D46` | Generate-password wrapper (`JSL $84BAB8`), used by the password screen |
| `$04:BD74` | `0x23D74` | **"Everything" fill**: hard-codes a maxed state into `$1E51..$1E57` then calls the generator (see §7, `$1E52=$01` = cleared flag) |
| `$3C:904B` | `0x1E104B` | PRNG (picks the alternate character while generating) |
| `$01:C706` | `0xC706` | 21-byte character *tile-index* table (index → font tile) |
| `$01:C71B` | `0xC71B` | 21-byte char-index → nibble table |
| `$01:C730` | `0xC730` | nibble → char-index table (16 × 2 bytes: primary, alternate) |
| `$01:C834` | `0xC834` | 64-byte **8×8 bit-permutation matrix** (8 rows × 8 bytes) |
| `$01:C824` | `0xC824` | 8 × 16-bit row pointers into the matrix (`$C834,$C83C,…,$C86C`) |
| `$01:C790…$01:C803` | | password-screen text: spaces, `END`, `EXIT`, `PASS WORD ERROR!RETRY?`, `YES`, `NO`, `PASS WORD`, `PUSH START` |
| `$02:E17A` | | In-game rebuild of `$1E52/$1E53` from `val` (`$1E56`) — see §7 redundancy note |
| `$02:E105-$E164` | | Item grant block (key `$02 == $2D`): val `TSB $1E56` via `$01:F4CC` masks, talisman `TSB $1E53` via `$01:F4D2` masks |
| `$02:EA3C-$EA60` | | Heart-container pickup: mask = `word[$01:F4CA + 2*id]`, new → `TSB $1E54.w` + `INC $1E50` |
| `$02:EA9E-$EAA5` | | Crest/ability grant: mask = `byte[$01:D730 + X]` (X = 2*index) → `TSB $1E51` |
| `$01:D730` | `0xD730` | word masks `01 00 02 00 04 00 … 80 00` — `$1E51` bit-index table (byte-indexed read, X = 2*index) |
| `$01:F4BC` | `0xF4BC` | mask-table area: `01 02 04 08 10 20 40 80` (8-bit), inverses `FE FD … 7F`, word masks `01 00 02 00 …` at `$F4CC`, `00 01 00 02 …` at `$F4DC`, ASCII `"0123456789ABCDEF"` at `$F4EC` |
| `$01:F4CA` | `0xF4CA` | heart-container word masks: `word[$F4CA + 2*id]` = single bit (id-1) for id 1-16; id 0 → `$7FBF` |
| `$01:F4D2` | `0xF4D2` | talisman byte masks: `08 10 20 40 80` at even offsets → `$1E53` bits 3-7 |
| `$01:8D61/$01:8D6B` | `0x8D61/0x8D6B` | progression-tier word masks used by `$05:A1EE` (see §8.4) |
| `$01:E7A0` | `0xE7A0` | val mirror masks `0002 0004 … 0400` — item-use ownership test, indices 0-9 ↔ val bits 0-9 |
| `$05:C2EC-$C33C` | | item-use dispatcher: `BIT $1E52` ownership check, `CPX #$05` spells/potions split |
| `$3C:8036` | `0x1E8036` | **item name table** (stride `$24`): crests, spells, potions, talismans (§8.7) |
| `$05:83E3/$05:8441` | | spell shop lists (Wise Man): SHADOW/HOLD/IMP/SHOCK (+DEATH) with prices |
| `$05:8842/$05:88A0` | | potion shop lists (Black Lotus): MERCURY/SULFUR/HERB/ELIXIR (+GINSENG) |
| `$02:8BF9` | | Enemy spawner: `$1E58` bit0 selects the **boss spawn table** `$C9D0,X` vs normal `$C874,X` |
| `$02:F4C0…` | | item-effect dispatch stubs (`JSL $xxxxxx / RTS`, 5 bytes each), item id = index |

(The `$01:C700`–`$01:C8FF` region is the password-screen data blob: strings + the tables above.)

---

## 1. Character set / alphabet table

The password uses **21 letters — every consonant, no vowels:**

```
B C D F G H J K L M N P Q R S T V W X Y Z
```

The **internal character index** (0–20) is the position in that consonant alphabet:

| idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| char | B | C | D | F | G | H | J | K | L | M | N | P | Q | R | S | T | V | W | X | Y | Z |
| tile | `$81` | `$82` | `$83` | `$85` | `$86` | `$87` | `$89` | `$8A` | `$8B` | `$8C` | `$8D` | `$8F` | `$A0` | `$A1` | `$A2` | `$A3` | `$A5` | `$A6` | `$A7` | `$A8` | `$A9` |

The 21-entry tile table lives at `$01:C706` (bytes `81 82 83 85 86 87 89 8A 8B 8C 8D 8F A0 A1 A2 A3 A5 A6 A7 A8 A9`).
The gaps (`$84,$88,$8E,$90..$9F,$A4`) are unused font tiles (vowels / punctuation).

This order was **confirmed by the checksum and the full validator** on the reference vectors (§5/§8).

### char-index ⇄ nibble tables

Char-index → nibble (`$01:C71B`, 21 bytes):

| char-idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nibble | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F | 1 | 6 | 8 | B | E |

So indices 16–20 are *aliases* of nibbles 1, 6, 8, B, E. This is what makes the alphabet 21 symbols instead of 16.

Nibble → char-index (`$01:C730`, 32 bytes = 16 pairs `(primary, alternate)`):

```
nib 0: 00 00   nib 1: 01 10   nib 2: 02 02   nib 3: 03 03
nib 4: 04 04   nib 5: 05 05   nib 6: 06 11   nib 7: 07 07
nib 8: 08 12   nib 9: 09 09   nib A: 0A 0A   nib B: 0B 13
nib C: 0C 0C   nib D: 0D 0D   nib E: 0E 14   nib F: 0F 0F
```

Five nibbles (1, 6, 8, B, E) have a second, aliased character. Whether the primary or the
alternate is written is decided by a **PRNG** (`$3C:904B`), so a given save state has many
valid passwords. Both aliases decode back to the same nibble, so decoding is deterministic.

---

## 2. Encryption / permutation matrix

At `$01:C834` there is a **64-byte matrix**: 8 rows × 8 bytes. Each row is a permutation of the
8 bit masks `01 02 04 08 10 20 40 80`:

```
row0 $C834: 40 04 20 80 02 10 01 08
row1 $C83C: 04 10 40 08 80 02 20 01
row2 $C844: 08 02 20 40 01 10 04 80
row3 $C84C: 08 20 04 40 02 80 01 10
row4 $C854: 20 40 80 04 01 08 02 10
row5 $C85C: 40 20 01 04 08 80 10 02
row6 $C864: 01 40 08 20 04 10 80 02
row7 $C86C: 20 80 04 08 01 10 02 40
```

The row pointers used by the decoder are the 8 words at `$01:C824`
(`$C834 $C83C $C844 $C84C $C854 $C85C $C864 $C86C`).

**Forward (generator, `$04:BB63` area):** for output byte `X` (X = 0..7):

```
out[X] bit r = src[r] bit p,  where MATRIX[r][X] == (1<<p)
```

i.e. `out[X]` gathers one bit from each of the 8 source bytes `src[0..7]`.

**Inverse (decoder, `$04:BC50`):** for each source row `r`, for each bit `p`, find the column `X`
with `matrix[r][X] == (1<<p)`; then `src[r] |= ((out[X] >> r) & 1) << p`.

`tmp/roundtrip.py` asserts both directions are exact inverses on random data — **verified**.

---

## 3. Checksum algorithm

The generator's last source byte is a checksum:

```
src[7] = (src[0] + src[1] + src[2] + src[3] + src[4] + src[5] + src[6]) & $FF
```

Computed at `$04:BB37`–`$04:BB4B` (`LDA $10 / CLC / ADC $11 / … / STA $17`, each `ADC` preceded
by `CLC`, so it is a plain modulo-256 sum over the **masked** payload + key). The validator
checks the same at `$04:BCA9-$BCBC`: `src[7] == sum(src[0..6]) & $FF`.

---

## 4. Generator (`$04:BAB8`) — state → password

Runs with `A`/`X`/`Y` 16-bit (`REP #$30`), DP = 0 (`PHD`/`TCD`).

### 4.1 State → payload (`$04:BACB-$BAEC`)

Input is the live game state `$1E50..$1E58` (see §7 for its layout):

```
$10.w = $1E51.w & $01FF          ; P0 = $1E51, P1.bit0 = $1E52.bit0
val   = $1E56.w (10 bits)        ; = $1E57:$1E56
$12:$11 |= val << 1              ; TSB $11: P1[1..7] = val[0..6], P2[0..2] = val[7..9]
$12 |= $1E53 & $F8               ; TSB $12: P2[3..7] = $1E53[3..7]   (talismans)
$13.w = $1E54.w                  ; P3 = $1E54, P4 = $1E55            (heart containers)
$15 = $1E58 & $0F                ; P5 = $1E58 low nibble             (mode flags)
```

### 4.2 Key + masking + checksum (`$04:BAF0-$BB4B`)

```
key K:  high nibble = PRNG($3C:904B) result, rejected while == $0 or == $F
        low nibble  = (P0+P1+P2+P3+P4+P5) & $0F          ; TSB $16
P[i] ^= K  for i in 0..5                                           ; payload masking
src[7] = (sum(masked P) + K) & $FF                                 ; checksum
```

### 4.3 Permutation + characters

The bit-permutation matrix (§2) produces `$18..$1F`, copied to `$1E59..$1E60`; each byte is split
high-then-low nibble and converted to a character index by `$04:BC00` using the `$C730` table
(primary/alternate selected by the PRNG). Result chars are stored at `$1E61..$1E70` in order:
`byte0.hi, byte0.lo, byte1.hi, byte1.lo, …`.

### 4.4 PRNG (`$3C:904B`)

```
REP #$20
A = 3 * $009C
XBA                  ; use high byte
SEP #$20
$009D = high byte
$009C = $009C + (that)
RTL
```
The sign of the result selects the primary vs. alternate character in `$04:BC00`.

---

## 5. Validator (`$04:BC3C`) and control flow

The decoder takes the 16 entered character indices at `$1D70..$1D7F`:

```
$04:BC3C  JSR $BC0F          ; pack 16 char-indices -> bytes $1D68..$1D6F
$04:BC3F  REP #$30, clear DP $00..$1F
$04:BC50  inverse bit-permutation (row-pointer table $C824) -> src bytes $10..$17
$04:BCA9  LDA $10 / CLC / ADC $11 / … / ADC $16 / CMP $17   ; CHECK 1: checksum
$04:BCC3  LDA $16 / AND #$F0 / BEQ fail / CMP #$F0 / BEQ fail ; CHECK 2: key hi nibble in 1..E
$04:BCCD  EOR $16 into $10..$15      ; unmask payload
$04:BCF1  LDA #$F0 / TRB $16         ; $16 = key & $0F
$04:BCF5  sum($10..$15) & $0F == $16 ; CHECK 3: key low nibble == sum(unmasked P) & $F
$04:BD0F  plausibility gate (below)  ; returns C=1 (accept) or C=0 (reject)
```

At the only call site `$04:C0E8`:

```
$04:C0E8  JSR $BC3C
$04:C0EB  BCS $C0F0        ; C=1 -> load state into the game
$04:C0ED  JMP $C200        ; C=0 -> "PASS WORD ERROR! RETRY?" screen
```

### 5.1 Plausibility gate (`$04:BD0F-$BD45`) — corrected understanding

This is *not* a state extractor. With `$10..$15` = unmasked payload `P0..P5` (16-bit reads:
`LDA $13` = `P4<<8|P3`, `LDA $10` = `P1<<8|P0`, `LDA $11` = `P2<<8|P1`):

```
$04:BD0F  REP #$20
$04:BD11  LDA $13 / BIT #$0001        ; P3 bit0
$04:BD16  BNE $BD23
$04:BD18  AND #$FFFE / BNE fail       ; P3bit0=0: require P3==0 && P4==0
$04:BD1D  LDA $10 / ORA $11 / BNE fail;               && P0==P1==P2==0   ("empty" shape)
$04:BD23  LDA $10 / AND #$0100        ; P3bit0=1: test P1 bit0 ($1E52 bit0)
$04:BD28  BEQ accept                  ; P1 even -> accept (normal case, any state)
$04:BD2A  CMP #$FFFF (P1<<8|P0) / LDA $11 CMP #$FFFF (P2<<8|P1) / LDA $13 CMP #$FFFF
$04:BD3F  accept iff P0==P1==P2==P3==P4==$FF           ("100%" shape)
$04:BD42  SEP #$30 / CLC / RTS        ; reject  (C=0)
$04:BD3F  SEP #$31 / RTS              ; accept  (C=1)
```

**A password is accepted iff** (after checksum + key checks):

1. `P3` odd and `P1` even — any payload; **or**
2. `P0=P1=P2=P3=P4=$FF` (the exact 100 % shape); **or**
3. `P0=P1=P2=P3=P4=$00` (the exact empty shape; `P5` = mode flags free).

Consequences (empirically satisfied by all 10 known passwords):
- **`$1E54` (container byte) must be odd whenever any state is present** — all 10 known
  passwords have `P3` bit0 = 1. In state terms: heart-container bit 0 is always set once any
  container is collected (invariant maintained by the game's pickup code).
- `$1E52` bit0 = the **Ultimate Gargoyle crest** flag; it may only be set in the exact
  100 % state (owning the Ultimate crest implies everything else is owned — it is the final
  reward). The `$04:BD74` fill routine sets exactly that shape.

### 5.2 State loader (`$04:C0F0`) — the real decode tail

```
$04:C0F0  SEP #$30 / LDA #$1B / JSL $80BD51        ; accept sound
$04:C0F8  copy 24 bytes $1D68..$1D7F -> $1E59..$1E70  ; keep entered password for display
$04:C105  REP #$30
$04:C107  $1E51.w = ($11:$10) & $01FF              ; $1E51 = P0, $1E52[0] = P1[0]
$04:C10F  $1E53.w = ($13:$12) & $00F8              ; $1E53 = P2 & $F8 (talismans)
$04:C117  $1E54.w = ($14:$13)                      ; $1E54 = P3, $1E55 = P4 (containers)
$04:C11C  val = (($12:$11) & $07FE) >> 1 ; $00 = val ; $1E56.w = val
$04:C127  loop1 (BNE -> $C131, the LSR): $02.w = sequential val bits 0..4
          LDA $02 / ASL A / TSB $1E52              ; $1E52[1..5] = val[0..4]
$04:C142  loop2 (BNE -> $C151, 6th LSR): $02.w = sequential val bits 6..9
          LDA $02 / ASL A ×6 / TSB $1E52 (16-bit)  ; $1E52[6..7] = val[6..7], $1E53[0..1] = val[8..9]
$04:C167  X = popcount($1E54.w)  (16-bit LSR-count loop)
$04:C178  A = X + 4 -> $1E50 (HP), also $1062/$1061
$04:C188  $1E58 = $15 & $0F
$04:C18F  … clears $0EA6/$00F9=$1C/$09F7/$008D/$0EA4/$0EA7, JSL $848938,
          clears $1E30..$1E39, $1000..$107F, $7FE000..$7FE07F,
          sets $7FE000=$7FE001=$02 if $1E51 bit1, $7FE002=$40 if $1E51 bit6, JSL $8088F4
```

Note the loop branch targets: `BNE $C131` / `BNE $C151` jump back to the **LSR**, not the loop
head — so each loop extracts **consecutive** bits of `val` into consecutive bits of `$02`.
(An earlier reading assumed the same bit was tested 5× — wrong; corrected after the round-trip
test exposed it.)

### 5.3 Verification walkthrough — Vector 1 `HDDS DTGX BQQZ NDMN`

1. **Letters → char-indices** (consonant alphabet):
   `H D D S D T G X B Q Q Z N D M N` → `5 2 2 14 2 15 4 18 0 12 12 20 10 2 9 10`
2. **Char-index → nibble** (`$C71B`): `5 2 2 E 2 F 4 8 0 C C E 6 2 9 6`
3. **Pack pairs** `out[k] = nib[2k]<<4 | nib[2k+1]`:
   `out = [52 2E 2F 48 0C CE 62 96]`
4. **Inverse permutation** → `src = [20 77 33 F6 30 31 31 52]`
5. **CHECK 1**: `0x20+0x77+0x33+0xF6+0x30+0x31+0x31 = 0x252` → low byte `0x52` = `src[7]` ✔
6. **CHECK 2**: key `src[6] = 0x31`, high nibble 3 ∈ 1..E ✔
7. **CHECK 3**: unmask `P = src[0..5] ^ 0x31 = [11 46 02 C7 01 00]`;
   `sum(P) & $0F = 0x11+0x46+0x02+0xC7+0x01+0x00 = 0x121 → 1 = key & $0F` ✔
8. **Gate**: `P3 = 0xC7` odd, `P1 = 0x46` even → accept ✔
9. **Loader**: `val = ((0x02<<8|0x46) & $07FE) >> 1 = $123`;
   HP = 4 + popcount($01C7) = 4 + 6 = **10** ✔ (matches the reference state)

---

## 6. Reconstructed bytes per vector (verified byte-exact round-trip)

```
V1  HDDSDTGXBQQZNDMN -> src 20 77 33 F6 30 31 31 52  key 31
V2  LWDYMSQMVWDHGPSG -> src 95 F4 B9 65 81 A2 A2 6C  key A2
V3  MRBLMFNPHGJBJRZB -> src E1 48 0D 69 A1 96 96 6C  key 96
V4  QFFFKNRRDDLRXGTQ -> src D4 D4 D4 D4 D4 2B 2B 7A  key 2B
V5  RBNLXHGBVGBBLYLD -> src 21 21 21 21 21 20 21 E6  key 21
allitems PDQMRRMVFWGXDTSG -> A5 A4 A5 A5 A5 5A 5A EC  key 5A
stage1  GDBFYLFVHZJSZHCS   -> 85 97 95 96 95 95 95 06  key 95
stage2  HDDMNTKBHQLFXKLD   -> 35 67 25 26 25 25 25 56  key 25
stage6  PBGXRVNGKGKXWRZB   -> 21 00 45 A1 A9 DE DE 6C  key DE
ult     FDQPQRMBFGNHGTKL   -> 35 34 35 35 35 CA CA 9C  key CA
(stage3 "VWNP XSQX CGBH BPJP" from an OCR'd source fails -> source string likely mistyped)
```

`src[0..5]` = masked payload, `src[6]` = key, `src[7]` = checksum.
`tmp/roundtrip.py` re-encodes every vector byte-exactly (`src` and nibbles identical; only the
PRNG-chosen alternate glyphs may differ).

---

## 7. Game-state bitfield map (`$1E50..$1E58`)

Machine-checked via `tmp/roundtrip.py` (state→password→state identity on 2000 random states +
all 10 known passwords). Values below are the loader's outputs for each vector:

```
        HP  1E51 1E52 1E53 1E54 1E55 val(1E56/57) 1E58
V1      10   11   06   01   C7   01   123          00
V2      12   37   96   19   C7   23   1AB          00
V3      17   77   DE   99   FF   37   1EF          00
V4      20   FF   FF   FB   FF   FF   3FF          00
V5       4   00   00   00   00   00   000          01
allitems 20   FF   FE   FB   FF   FF   3FF          00
stage1   6   10   02   00   03   00   001          00
stage2   6   10   02   00   03   00   021          00
stage6  17   FF   DE   99   7F   77   1EF          00
ult     20   FF   FE   FB   FF   FF   3FF          00
```

| Field | Meaning | Evidence |
|---|---|---|
| `$1E50` | **Current HP** = 4 + popcount(`$1E54.w`) | 10/12/17/20/4 match the five reference states exactly |
| `$1E51` bit0 | **FIRE crest "BUSTER"** (default fireball) | name table + V1 {Buster,Earth} = bits {0,4} |
| `$1E51` bit1 | **FIRE crest "TORNADO"** | name table; already-have check `$02:EA29` tests bit1 for item 2 |
| `$1E51` bit2 | **FIRE crest "CLAW"** | name table; V2 delta |
| `$1E51` bit3 | **FIRE crest "DEMON FIRE"** | name table; all-4 fire check `$04:900C` (`AND #$000F/CMP #$000F`) |
| `$1E51` bit4 | **EARTH crest** (Ground Gargoyle) | stage gating `$04:8564` (`AND #$10`); V1 |
| `$1E51` bit5 | **AIR crest** (Aerial Gargoyle) | name table; V2 delta |
| `$1E51` bit6 | **WATER crest** (Tidal Gargoyle) | `$04:8A18` (`AND #$40`) + loader `$7FE002` flag; V3 delta |
| `$1E51` bit7 | **TIME crest** (Legendary Gargoyle) | `$3E:E3E1` (`AND #$80`); V4-only in vectors |
| `$1E52` bit0 | **ULTIMATE GARGOYLE crest** (9th crest) | grouped with morph crests via `AND #$01F0` (`$04:9017`); `$00:A45F`/`$3E:E3DA` tests; tier-3 in `$05:A1EE` |
| `$1E52` bits 1-7, `$1E53` bits 0-2 | **Redundant copies of `val`** (see below) | loader rebuilds them from `val` |
| `$1E53` bits 3-7 | **5 talismans**: CROWN, SKULL, ARMOR, FANG, HAND; granted via `byte[$01:F4D2 + 2*index]` = `08 10 20 40 80` → `TSB $1E53` | all 5 set in V4/allitems/ult/BD74; V2 carries CROWN+SKULL (`$1E53=$19`), V3 adds HAND (`$99`) — omitted from the reference descriptions (§8.8) |
| `$1E54/$1E55` | **16 heart-container bits**; HP = 4 + popcount; pickup code: container **id 1-16** sets bit **id-1** via `word[$01:F4CA + 2*id]`, then `INC $1E50` | HP arithmetic matches all vectors |
| `$1E56/$1E57` | `val`: **10 items at bits 0-9** (mirror mask table `$01:E7A0` = `0002…0400`; per-item state = 10 bytes `$1E30-$1E39`, cleared by the loader) | counts match info.md exactly |
| `val` bits 0-4 | **5 vellum spells** (shop order): SHADOW, HOLD, IMP, SHOCK, DEATH | see §8.7 |
| `val` bits 5-9 | **5 urn potions** (shop order): MERCURY, SULFUR, HERB, ELIXIR, GINSENG | see §8.7 |
| `$1E58` bit0 | **Boss-only mode** ("Boss Fight Mode" password); confirmed by the enemy spawner `$02:8BF9`: when set (and `$008D & $FF < $A0`) spawns come from the **boss table `$C9D0,X`** instead of the normal `$C874,X`. Only writers: password loader + `TRB #$01` at `$00:AAB3` (game-start flow clears it) | V5 = 1, everything else 0; V5 state is otherwise empty |
| `$1E58` bits 1-3 | Unknown (0 in all known passwords) | |

**`val` redundancy note.** The game keeps `$1E52[1..7]` and `$1E53[0..2]` as a shifted copy of
`val` (`$1E52.w ≈ val << 1`): the in-game rebuild at `$02:E17A` maps `$1E52[6..7] = val[5..6]`,
`$1E53[0..2] = val[7..9]`, while the password loader's loop2 writes `$1E52[6..7] = val[6..7]`,
`$1E53[0..1] = val[8..9]` — a one-bit shift on these *redundant* bits only. The generator reads
`val` from `$1E56` directly, so passwords round-trip `val` exactly; only the redundant mirror
bits can come back shifted. Irrelevant for the codec, relevant if emulating the game exactly.

**Generator ↔ loader round trip (exact):**

```
P0 = $1E51            P3 = $1E54
P1 = ($1E52 & 1) | ((val & $7F) << 1)      P4 = $1E55
P2 = ((val >> 7) & 7) | ($1E53 & $F8)      P5 = $1E58 & $0F
HP = 4 + popcount($1E54.w)
```

**Password validity constraints (gate, §5.1), in state terms:** a generated password is accepted
iff the state is (a) any state with `$1E54` odd and `$1E52[0]=0`, (b) the exact 100 % state
(`$1E51=$1E52=$1E53=$1E54=$1E55=$FF`, `val=$3FF`), or (c) the exact empty state
(`$1E51=$1E52=$1E53=$1E54=$1E55=0`, `val=0`; `$1E58` free — boss mode).

### 7.1 Where the state lives (DBR discovery)

The password code accesses the tables via `LDA $C730,X` etc. — DBR-relative. The 21-byte tile
table and the 64-byte matrix exist **only** at file offset `0xC7xx` (bank `$01`), so the password
path runs with **DBR = `$01`**. Under LoROM mapping with DBR=$01:

- `$01:1E50-$01:1E58` → address range `$0000-$1FFF` → **WRAM mirror of `$7E:1E50-$1E58`**
  (the live game state; the HP mirror `$01:1061/$1062` = `$7E:1061/$1062` likewise).
- `$01:F4CA`, `$01:F4CC`, `$01:F4D2`, `$01:D730`, `$01:8D61` → ROM (file offsets `0xF4CA`,
  `0xF4CC`, `0xF4D2`, `0xD730`, `0x8D61`) — the item mask tables below.

This also resolves the pickup/dispatch code in bank `$02` whose `$F4CA/$F4CC/$D730` reads looked
like garbage in other banks: it runs with the same DBR=$01.

---

## 8. Item mask tables and grant code (confirmed semantics)

### 8.1 Mask-table area `$01:F4BC-$F4FB`

```
$F4BC: 01 02 04 08 10 20 40 80      ; 8-bit ascending bit masks
$F4C4: FE FD FB F7 EF DF BF 7F      ; 8-bit inverse (bit-clear) masks
$F4CC: 01 00 02 00 04 00 08 00 10 00 20 00 40 00 80 00   ; word masks bits 0-7
$F4DC: 00 01 00 02 00 04 00 08 00 10 00 20 00 40 00 80   ; word masks bits 8-15
$F4EC: 30 31 32 … 46                 ; ASCII "0123456789ABCDEF"
```

### 8.2 Heart containers (`$02:EA3C-$EA60`, m=0)

```
A = item_id & $001F;  if A == $001F skip
X = A << 1
mask = word[$01:F4CA + X]        ; id 1..16 -> bits 0..15;  id 0 -> $7FBF
$38.w = mask & $1E54.w           ; already-owned?
if $38 == 0: $1E54.w |= mask ; INC $1E50 (HP + 1)
; message values: new -> $08, repeat -> $06 (STA $3C)
```

So **container id N (1-16) ↔ `$1E54.w` bit (N-1)** — matching HP = 4 + popcount exactly.
(id 0 with mask `$7FBF` = all bits except 6 and 14: a special/debug grant.)

### 8.3 Val (vellum/urn) and talisman grants (`$02:E105-$E164`)

Entered when `$02 == $2D` (menu "use item" key) with `$03 = 2 × item_index` (pre-shifted —
confirmed by the talisman table hitting only even offsets):

```
X = $03 & $3F                       ; = 2*index
REP #$20
$1E56.w |= word[$01:F4CC + X]       ; val |= 1 << index      (bits 0-15 available)
; then rebuild the $1E52/$1E53 mirror from val via JSR $E17A (TRB #$07FE / TSB)
; other branch ($02 != $2D):
X = $03 & $3F
$1E53 |= byte[$01:F4D2 + X]         ; talisman index 0..4 -> $1E53 bits 3..7
```

**Confirmed: `$1E53` bits 3-7 = talismans 0-4 (mask bytes `08 10 20 40 80`).**
`val` bits come from the same ascending word table, so `val` bit N = item_index N — the
vellum/urn split (bits 0-4 vs 5-9) still needs the item list (index → name).

### 8.4 Crest/ability grants (`$02:EA9E-$EAA5`)

```
SEP #$10 ; X = $03 (8-bit)
mask = byte[$01:D730 + X]           ; X = 2*index -> 01 02 04 08 10 20 40 80
TSB $1E51                           ; $1E51 bit index = ability index
```

`$01:D730` = `01 00 02 00 04 00 08 00 10 00 20 00 40 00 80 00` + `00 01` (bit 8) at `$D740`.
So **`$1E51` bit N = ability/crest index N**. Vector deltas give: bit4 present in V1 (Earth
crest), bits {1,2,5} appear with V2's Air crest + Tornado + Claw, bit6 with V3's Water crest,
bits {3,7} only in V4 (Time/Ultimate). Exact index→name mapping pending the item list.

### 8.5 Progression-tier routine (`$05:A1EE-$A24B`) — ending/status logic

Hand-decoded from raw bytes; returns Y = progression tier:

```
REP #$20
if $1E58.w & $0001:  → boss-mode branch ($A22D)
if $1E51.w & $0100:  → Y=3, exit            ; $1E52 bit0 = "game cleared" tier
Y = 0
for X in 8,6,4,2,0:                          ; word masks at $01:8D61+X / $01:8D6B+X
    if $1E51.w & mask51[X]: continue         ; X=8:$0088 (bits 3,7)  X=6:$0040 (bit 6)
    if $1E54.w & mask54[X]: continue         ;   X=4:$0024 (bits 2,5) X=2:$0002 (bit 1)
    goto $A21D                               ;   X=0:$0001 (bit 0)
RTL (Y=0)                                    ; all five checks passed → tier 0
$A21D: if ($1E51 & $0037) == $0037: Y=1, exit ; bits 0,1,2,4,5 all set → tier 1
       else fall into boss branch
$A22D: Y=$FF; for X in 4,2,0: (same masks, fewer entries)
       if none found: RTL (Y=$FF) else Y=2, RTL
```

Mask tables (file `0x8D60` = `$01:8D60`): `$8D61: 01 00 | 02 00 | 24 00 | 40 00 | 88 00`
(`$1E51` masks for X=0,2,4,6,8) and `$8D6B: 04 00 | 08 00 | 00 00 | 00 20 | 00 00`
(`$1E54` fallback masks: bits 2, 3, —, 13, —). The `$1E54` substitutions (container bits 2/3/13
standing in for `$1E51` bits 0/1/6) suggest those abilities become available at fixed HP
milestones — consistent with Demon's Crest gating forms behind heart containers.

### 8.6 Writer census (who can change the state)

ROM-wide scan for `TSB/ORA/STA/TRB/INC/DEC $1E5x`:

```
$02:E113 TSB $1E56   (val grant)          $04:BD78-BD8C  BD74 fill
$02:E145 TSB $1E52   (mirror rebuild)     $04:C18C STA $1E58  (loader)
$02:E15D TSB $1E53   (talisman grant)     $00:AAB3 TRB $1E58 (A=1, clears boss bit)
$02:EAA5 TSB $1E51   (ability grant)      $26:E3A8 INC $1E56 (unexamined, bank $26)
```

`$1E58` is therefore set **only by the password loader** (and the BD74 fill) and cleared at
game start — boss mode is purely password-driven, matching community lore.

### 8.7 Item names: name table `$3C:8036` (stride $24) and shop orders

Fixed-width (36-byte) name table at `$3C:8036` (file `0x1E8036`; the 54 bytes before it are
blank padding — the menu's "no crest" slot):

| slot | name | | slot | name |
|---|---|---|---|---|
| 0 | `FIRE` (normal form label) | | 15 | `HERB` |
| 1 | `BUSTER` | | 16 | `GINSENG` |
| 2 | `TORNADO` | | 17 | `MERCURY` |
| 3 | `CLAW` | | 18 | `SULFUR` |
| 4 | `DEMON    FIRE` | | 19 | `ELIXIR` |
| 5 | `GROUND  GARGOYLE` | | 20 | `CROWN` |
| 6 | `AERIAL  GARGOYLE` | | 21 | `SKULL` |
| 7 | `TIDAL   GARGOYLE` | | 22 | `ARMOR` |
| 8 | `LEGENDARYGARGOYLE` | | 23 | `FANG` |
| 9 | `ULTIMATE GARGOYLE` | | 24 | `HAND` |
| 10 | `HOLD` | | 25 | `VELLUM` (category label) |
| 11 | `DEATH` | | 26 | `URN` (category label) |
| 12 | `SHOCK` | | 27 | `EQUIPPED]` |
| 13 | `IMP` | | 28+ | test-mode strings (`MUTEKI MODE ON/OFF`, `LIFE RECOVER`) |
| 14 | `SHADOW` | | | |

Crest lore text at `$3E:A43C+`: the FIRE crest is split into four pieces ("THE FIRE CREST
CALLED 'BUSTER'/'TORNADO'/'CLAW'/'DEMON FIRE'"); Earth/Air/Water/Time crests morph Firebrand
into the GROUND/AERIAL/TIDAL/LEGENDARY gargoyle. Crest bit N ↔ name slot N+1 (FIRE = slot 0 =
the default form). This reproduces every vector delta exactly.

**Shop orders** (spell shop "THE WISE MAN" `$05:83E3`/`$05:8441`; potion shop "THE BLACK
LOTUS" `$05:8842`/`$05:88A0`):

```
spells:  SHADOW 10GP, HOLD 20GP, IMP 25GP, SHOCK 50GP | DEATH 80GP  (2nd shop only)
potions: MERCURY 6GP, SULFUR 10GP, HERB 25GP, ELIXIR 100GP | GINSENG 140GP (2nd shop only)
```

**val bit assignment (high confidence):** bits 0-4 = spells, 5-9 = potions, each in the shop
menu order above. Decisive cross-check: **V3's val = bits {0,1,2,3,5,6,7,8} = exactly the first
shop's complete stock (4 spells + 4 potions), and bits 4/9 = the second-shop exclusives
(DEATH, GINSENG)** — only V4 (100 %) has them. The alternative (name-table order) would put
SHADOW (10 GP, first shop) at bit 4 — implying mid-game states own DEATH (80 GP, late shop)
but not SHADOW, which is implausible. Supporting code: the item-use dispatcher tests ownership
via the mirror masks `$01:E7A0` (indices 0-9 ↔ val bits 0-9) and splits behaviour at index 5
(`CPX #$05`, `$05:C30F`); the loader clears exactly 10 state bytes `$1E30-$1E39` (one per val
item).

**val = usable items, not containers.** The dispatcher *uses* the owned item (spell effect /
potion heal — the heal routine `$05:C24D-$C25F` raises `$1062` HP capped at `$1E50`), so val
bits are the owned spells/potions. The vellum/urn *containers* (capacity gates, "YOUR VELLUM IS
ALREADY FULL OF SPELLS" `$05:875B`) are **not** password-tracked — every state byte is otherwise
fully accounted for. Community descriptions like "2 Vellum, 2 Urns" mean 2 owned spells /
2 owned potions.

Talisman order (CROWN, SKULL, ARMOR, FANG, HAND) follows the name/description order
(`$05:8C51-$05:8E33`: money / soul energy / defence / magic power / cast speed); the grant
index 0-4 → bits 3-7 (medium confidence on the per-bit direction).

### 8.8 Named decode of the reference vectors (`tmp/named_state.py`)

```
V1  HDDSDTGXBQQZNDMN  HP 10 | BUSTER, EARTH | SHADOW, HOLD | MERCURY, ELIXIR | - | cont 1,2,3,7,8,9
V2  LWDYMSQMVWDHGPSG  HP 12 | BUSTER, TORNADO, CLAW, EARTH, AIR | SHADOW, HOLD, SHOCK |
                      MERCURY, HERB, ELIXIR | talismans CROWN, SKULL | cont 1,2,3,7,8,9,10,14
V3  MRBLMFNPHGJBJRZB  HP 17 | BUSTER, TORNADO, CLAW, EARTH, AIR, WATER |
                      SHADOW, HOLD, IMP, SHOCK (= first shop complete) |
                      MERCURY, SULFUR, HERB, ELIXIR (= first shop complete) |
                      talismans CROWN, SKULL, HAND | cont 1-11,13,14
V4  QFFFKNRRDDLRXGTQ  HP 20 | all 9 crests incl. ULTIMATE | all 5 spells | all 5 potions |
                      all 5 talismans | containers 1-16
V5  RBNLXHGBVGBBLYLD  HP 4 | empty state | BOSS-ONLY MODE
```

Crest sets of V2/V3 match the reference descriptions **exactly**; note V2/V3 also carry
talismans (CROWN+SKULL, +HAND) that the reference descriptions omit — the passwords are the
ground truth.

---

## 9. Verification methodology (new this session)

`tmp/roundtrip.py` implements **both** directions from the disassembly and checks:

1. `permute`/`unpermute` are exact inverses (2000 random inputs) — PASS
2. 2000 randomized canonical states: `state → password → state` identity — PASS
   (state space modelled with the game's redundancy: `hp` derived from `$1E54.w`;
   `$1E52[1..7]`/`$1E53[0..2]` are `val` mirrors; keys random with valid nibbles)
3. all 10 known passwords decode, re-encode **byte-exactly** (`src` identical, nibbles identical) — PASS

This caught and fixed two earlier hand-derivation errors (wrong source byte for `$1E53`; the
loader loops extracting *sequential* bits rather than repeating bit 0/bit 6), and confirmed the
alphabet, tables, matrix, checksum, key rules, gate and loader simultaneously.

---

## 10. TODO / open items

- [x] Disassemble `$04:BD0F-$BD45` → it is the plausibility gate (§5.1), not the extractor.
- [x] Find the generator-input fill → `$04:BACB-$BAEC` (§4.1) + loader `$04:C0F0` (§5.2).
- [x] Round-trip verification both directions (`tmp/roundtrip.py`).
- [x] Confirm `$1E53` bits 3-7 = talismans via the grant masks `$01:F4D2` (§8.3).
- [x] Confirm `$1E54.w` bits 0-15 = heart containers 1-16 via pickup code `$02:EA3C` (§8.2).
- [x] Confirm `$1E58` bit0 = boss-only mode via spawner `$02:8BF9` (§7, §8.6).
- [x] Locate the mask tables (`$01:D730`, `$01:F4CA`, `$01:F4CC`, `$01:F4D2`, `$01:8D61`,
      `$01:E7A0`) and the DBR=$01 / WRAM-mirror model (§7.1).
- [x] Name all 9 crest bits (BUSTER/TORNADO/CLAW/DEMON FIRE + EARTH/AIR/WATER/TIME +
      ULTIMATE in `$1E52` bit0) — name table `$3C:8036` + shop/lore text + vector deltas (§8.7).
- [x] Name the val items (5 spells + 5 potions, shop order) and the talismans
      (CROWN/SKULL/ARMOR/FANG/HAND) (§8.7); resolve val = usable items, containers not
      password-tracked (§8.7/§8.8).
- [ ] Verify the per-bit talisman order (CROWN=bit3 … HAND=bit7) against the stage pickup
      data; V2/V3 talisman content (CROWN+SKULL/+HAND) is consistent but order-sensitive.
- [ ] Examine `$26:E3A8 INC $1E56` (bank $26 writer of val) and the remaining `TRB $1E58` sites
      (`$15:998D`, `$3E:82E8`).
- [ ] Recover the actual **font glyphs** for tiles `$81..$A9` to render the alphabet independently.
- [ ] Confirm the stage3 password from a non-OCR source.

## 11. Deliverable: `password_tool.html` — standalone GUI

Single self-contained HTML file (no dependencies, works offline) at the workspace root:

- **DECODE tab** — 4×4 letter grid (typing with auto-advance + paste support), live validation
  that names the failing check (checksum / key nibble / plausibility gate), the fully named
  state (HP, 9 crest checkboxes, spells, potions, talismans, 16 containers, boss flag,
  unknown `$1E58` bits), and a raw byte dump (`$10-$17` payload+key+chk and `$1E50-$1E58`).
- **ENCODE tab** — HP slider (4–20) + individual container checkboxes, 9 crest checkboxes,
  5 spells, 5 potions, 5 talismans, boss toggle → GENERATE / NEW VARIANT (random key nibble
  1..$E and random primary/alternate glyphs, mimicking the game's PRNG so each state has many
  valid renderings), copy button.
- **Gate auto-fix** implements §5.1: container 1 auto-enabled when the state is non-empty;
  Ultimate Gargoyle forces the exact 100 % shape; both show a one-line notice.
- **Presets** load all 10 known passwords into both tabs.
- **RUN SELF-TEST** button: 10 known passwords re-encode byte-exactly + 300 random states
  round-trip, in-browser.

Verification of the file itself: the codec `<script>` block (marker-delimited
`/*CODEC-BEGIN*/…/*CODEC-END*/`) was extracted and run under deno — **10/10 known passwords +
2000/2000 random round-trips pass** (`tmp/jstest.js`). The UI logic was executed under a
minimal DOM shim (`tmp/uitest.js`) — **25/25 functional tests pass** (init/presets, decode
validation + invalid detection, generate/variant, gate auto-fixes, talisman bit mapping,
slider→containers sync, in-page self-test).

Helper scripts: `tmp/dis65816.py` + `tmp/disasm.py` (65C816 disassembler with M/X tracking,
REP/SEP + PEA/PER fixes), `tmp/codec.py` (decode + checksum/key tests),
`tmp/roundtrip.py` (full two-way verification),
`tmp/named_state.py` (human-readable named state decode),
`tmp/jstest.js` + `tmp/uitest.js` (deno tests for `password_tool.html`).