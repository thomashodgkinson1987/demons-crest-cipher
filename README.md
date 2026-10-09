# Demon's Crest (SNES) — Password System & Codec

A complete, byte-exact reverse engineering of the password system for **Demon's Crest** (SNES, USA version). 

This repository contains the disassembly analysis, bitfield specifications, encryption/permutation logic, and a zero-dependency offline web tool for generating, inspecting, and decoding custom game passwords.

---

## Highlights & Discoveries

* **The 21-Letter Alphabet:** The password screen exclusively uses consonants (`B C D F G H J K L M N P Q R S T V W X Y Z`). Five nibbles (`1`, `6`, `8`, `B`, `E`) have secondary glyph aliases selected at runtime via the SNES PRNG (`$3C:904B`), meaning a single save state can produce multiple visually distinct, valid passwords.
* **8×8 Bit Permutation Matrix:** Passwords use a non-linear bit permutation table residing at `$01:C834` to scramble payload bytes before converting them to tile indices.
* **Modulo-256 Checksum & Key Masking:** Validated against a dynamic XOR key where the low nibble acts as a parity check over unmasked game states.
* **The "Plausibility Gate" (`$04:BD0F`):** Identifies internal validity constraints that cause the game to reject passwords even when checksums pass:
  * Non-empty saves require Heart Container 1 to be set.
  * The Ultimate Gargoyle form is only accepted if all items, crests, and containers are maxed (100% completion shape).
* **Full Bitfield Map (`$1E50`–`$1E58`):** Exact mapping for all 9 Crests (Fire pieces & Morph forms), 5 Spells, 5 Potions, 5 Talismans, 16 individual Heart Containers (HP = 4 + popcount), and the hidden Boss-Only mode flag.

---

## Repository Structure

| File | Description |
|---|---|
| [`findings.md`](./findings.md) | The comprehensive technical specification: ROM offsets, 65C816 disassembly walkthroughs, RAM maps, and mathematical proofs. |
| [`password_tool.html`](./password_tool.html) | Standalone, single-file browser UI for decoding, generating, and experimenting with passwords offline. |
| [`info.md`](./info.md) | Original autonomous reverse-engineering brief and verification guidelines. |

---

## Web Tool (`password_tool.html`)

An offline, zero-dependency HTML/JS utility styled after the original game's UI.

* **Decoder:** Type or paste any 16-letter password into the 4×4 grid. Provides live status diagnostics (identifies whether a failure is a checksum mismatch, invalid key nibble, or plausibility gate violation) and inspects the raw decoded RAM values.
* **Encoder / Generator:** Interactive sliders and checkboxes to configure HP, Crests, Spells, Potions, Talismans, and Boss Mode. Features an **auto-fix** system that conforms your state to the game's internal plausibility rules so generated passwords always work.
* **PRNG Variant Generator:** Generate alternative valid passwords for the exact same state using the game's dual-glyph alias rules.
* **Embedded Test Suite:** Includes an in-browser self-test verifying 10 known reference vectors and running 300 randomized round-trip conversions (`state → password → state`).

### Running the Tool
No web server or build step required. Simply open `password_tool.html` in any modern web browser:
```bash
# Example (Linux)
xdg-open password_tool.html

# Example (macOS)
open password_tool.html
```

---

## Verified Reference Vectors

All vectors have been verified to round-trip byte-for-byte against the ROM logic:

| Vector | Password | Highlights |
|---|---|---|
| **Early Game (V1)** | `HDDS DTGX BQQZ NDMN` | 10 HP, Buster, Earth Crest |
| **Mid Game (V2)** | `LWDY MSQM VWDH GPSG` | 12 HP, Buster, Tornado, Claw, Earth, Air |
| **Late Game (V3)** | `MRBL MFNP HGJB JRZB` | 17 HP, Buster, Tornado, Claw, Earth, Air, Water |
| **100% / Best Ending (V4)** | `QFFF KNRR DDLR XGTQ` | 20 HP, Ultimate Gargoyle, all Spells/Potions/Talismans |
| **Boss-Only Mode (V5)** | `RBNL XHGB VGBB LYLD` | Removes normal stage enemies; bosses remain active |

---

## AI Collaboration & Credits

This project was built through autonomous AI reverse engineering:

* **Reverse Engineering & Development:** Executed entirely by **GLM 5.3 Flash**, including the 65C816 disassembly analysis, algorithmic discoveries, bug fixing of disassembler sizing flags, and the complete implementation of `findings.md` and `password_tool.html`.
* **Task Architecture & Prompt Engineering:** The operational brief and reversing constraints in [`info.md`](./info.md) were authored by **Gemini 3.8 Flash**.

---

## Disclaimer

This project is for educational and archival preservation purposes. *Demon's Crest* is © 1994 Capcom Co., Ltd. No copyrighted game ROMs or proprietary assets are distributed within this repository.
