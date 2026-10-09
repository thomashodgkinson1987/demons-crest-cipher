#!/usr/bin/env python3
"""Linear 65C816 disassembler that tracks REP/SEP (M/X) flag changes."""
import sys
from dis65816 import ROM, T, SIZE

IMM = {'imm8', 'imm16'}
IDXOP = {'LDX', 'LDY', 'CPX', 'CPY'}


REPSEP = {'REP', 'SEP'}


def size_of(mn, mode, m, x):
    if mode in IMM:
        if mn in REPSEP:
            return 1  # REP/SEP immediates are always 8-bit
        if mn in ('PEA', 'PER'):
            return 2  # stack/relative immediates are always 16-bit
        return (2 if x == 0 else 1) if mn in IDXOP else (2 if m == 0 else 1)
    return SIZE[mode]


def fmt_op(rom, bank, pc, mn, mode, m, x):
    rb = lambda a: rom.read(bank, (a) & 0xffff)
    if mode == 'imp':
        return ''
    if mode == 'acc':
        return ' A'
    if mode in IMM:
        if mn in REPSEP:
            return f' #${rb(pc+1):02X}'
        n = (2 if x == 0 else 1) if mn in IDXOP else (2 if m == 0 else 1)
        if mn in ('PEA', 'PER'):
            n = 2  # stack/relative immediates are always 16-bit
        v = rb(pc + 1)
        if n == 2:
            v |= rb(pc + 2) << 8
        return f' #{v:0{n*2}X}'
    if mode == 'dp':
        return f' ${rb(pc+1):02X}'
    if mode == 'dpx':
        return f' ${rb(pc+1):02X},X'
    if mode == 'dpy':
        return f' ${rb(pc+1):02X},Y'
    if mode == 'sr':
        return f' ${rb(pc+1):02X},S'
    if mode == 'dp_sr_y':
        return f' (${rb(pc+1):02X},S),Y'
    if mode in ('abs', 'absx', 'absy', 'ind', 'indx', 'absind', 'indlong'):
        a = rb(pc + 1) | (rb(pc + 2) << 8)
        suf = {'abs': '', 'absx': ',X', 'absy': ',Y', 'ind': ')', 'indx': ',X)',
               'absind': ']', 'indlong': ']'}[mode]
        pre = '(' if mode in ('ind', 'indx', 'absind', 'indlong') else ''
        return f' {pre}${a:04X}{suf}'
    if mode in ('long', 'longx'):
        a = rb(pc + 1) | (rb(pc + 2) << 8) | (rb(pc + 3) << 16)
        return f' ${a:06X}' + (',X' if mode == 'longx' else '')
    if mode == 'dpind':
        return f' (${rb(pc+1):02X})'
    if mode == 'dpindx':
        return f' (${rb(pc+1):02X},X)'
    if mode == 'dpindy':
        return f' (${rb(pc+1):02X}),Y'
    if mode == 'dpindlong':
        return f' [${rb(pc+1):02X}]'
    if mode == 'dpindlongy':
        return f' [${rb(pc+1):02X}],Y'
    if mode == 'rel8':
        off = rb(pc + 1)
        if off >= 0x80:
            off -= 0x100
        return f' ${(pc + 2 + off) & 0xffff:04X}'
    if mode == 'rel16':
        off = rb(pc + 1) | (rb(pc + 2) << 8)
        if off >= 0x8000:
            off -= 0x10000
        return f' ${(pc + 3 + off) & 0xffff:04X}'
    if mode == 'mvn':
        return f' ${rb(pc+1):02X},${rb(pc+2):02X}'
    return '?'


def disasm(rom, bank, pc, count, m=1, x=1, out=print):
    for _ in range(count):
        op = rom.read(bank, pc)
        if op not in T:
            out(f'{bank:02X}:{pc:04X}  DCB ${op:02X}')
            pc = (pc + 1) & 0xffff
            continue
        mn, mode = T[op]
        n = size_of(mn, mode, m, x)
        raw = ' '.join(f'{rom.read(bank,(pc+i)&0xffff):02X}' for i in range(1 + n))
        out(f'{bank:02X}:{pc:04X}  {mn}{fmt_op(rom,bank,pc,mn,mode,m,x):<24}; {raw}')
        if mn == 'REP' and mode in IMM:
            v = rom.read(bank, pc + 1)
            if v & 0x20:
                m = 0
            if v & 0x10:
                x = 0
        elif mn == 'SEP' and mode in IMM:
            v = rom.read(bank, pc + 1)
            if v & 0x20:
                m = 1
            if v & 0x10:
                x = 1
        pc = (pc + 1 + n) & 0xffff
    return m, x


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    path = args[0]
    bank = int(args[1], 0)
    start = int(args[2], 0)
    count = int(args[3], 0) if len(args) > 3 else 40
    m = int(args[4], 0) if len(args) > 4 else 1
    x = int(args[5], 0) if len(args) > 5 else 1
    rom = ROM(path)
    disasm(rom, bank, start, count, m, x)
