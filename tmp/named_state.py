#!/usr/bin/env python3
"""Demon's Crest password decoder with fully named game state.

Usage: python3 named_state.py [PASSWORD ...]
       python3 named_state.py --encode   (interactive-ish demo: build a state, encode it)
"""
import sys
from roundtrip import loader_extract, generator_encode, permute, decode as _decode
from codec import IDX2NIB, CONS

CRESTS = ['FIRE/BUSTER', 'FIRE/TORNADO', 'FIRE/CLAW', 'FIRE/DEMON FIRE',
          'EARTH (Ground Gargoyle)', 'AIR (Aerial Gargoyle)', 'WATER (Tidal Gargoyle)',
          'TIME (Legendary Gargoyle)']
ULTIMATE = 'ULTIMATE GARGOYLE'
SPELLS = ['SHADOW', 'HOLD', 'IMP', 'SHOCK', 'DEATH']
POTIONS = ['MERCURY', 'SULFUR', 'HERB', 'ELIXIR', 'GINSENG']
TALISMANS = ['CROWN', 'SKULL', 'ARMOR', 'FANG', 'HAND']


def named_state(st):
    crests = [CRESTS[i] for i in range(8) if st['b1E51'] >> i & 1]
    if st['b1E52'] & 1:
        crests.append(ULTIMATE)
    val = st['val']
    spells = [SPELLS[i] for i in range(5) if val >> i & 1]
    potions = [POTIONS[i] for i in range(5) if val >> (5 + i) & 1]
    tal = st['b1E53']
    talismans = [TALISMANS[i] for i in range(5) if tal >> (3 + i) & 1]
    containers = [i + 1 for i in range(16) if (st['b1E54'] | st['b1E55'] << 8) >> i & 1]
    flags = []
    if st['b1E58'] & 1:
        flags.append('BOSS-ONLY MODE')
    if st['b1E58'] >> 1 & 0x7:
        flags.append(f'unknown $1E58 bits: {st["b1E58"] >> 1 & 7:02b}')
    return {
        'HP': st['hp'],
        'crests': crests,
        'spells(vellum)': spells,
        'potions(urns)': potions,
        'talismans': talismans,
        'heart containers': containers,
        'flags': flags,
    }


def show(pw):
    idxs, nibs, out, src = _decode(pw)
    st = loader_extract(src)
    ns = named_state(st)
    print(f'\n{pw}')
    print(f'  HP            : {ns["HP"]}')
    print(f'  crests        : {", ".join(ns["crests"]) or "-"}')
    print(f'  spells        : {", ".join(ns["spells(vellum)"]) or "-"}')
    print(f'  potions       : {", ".join(ns["potions(urns)"]) or "-"}')
    print(f'  talismans     : {", ".join(ns["talismans"]) or "-"}')
    print(f'  containers    : {ns["heart containers"] or "-"}')
    print(f'  flags         : {", ".join(ns["flags"]) or "-"}`')


if __name__ == '__main__':
    passwords = sys.argv[1:]
    if not passwords:
        passwords = ['HDDSDTGXBQQZNDMN', 'LWDYMSQMVWDHGPSG', 'MRBLMFNPHGJBJRZB',
                     'QFFFKNRRDDLRXGTQ', 'RBNLXHGBVGBBLYLD']
    for pw in passwords:
        show(pw.replace(' ', ''))