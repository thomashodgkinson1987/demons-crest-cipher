#!/usr/bin/env python3
"""Minimal 65C816 disassembler for LoROM SNES ROMs."""
import sys

# opcode -> (mnemonic, mode)
# modes: imp acc imm8 imm16 dp dpx dpy abs absx absy long longx
#        ind indx indy indlong indlongy dpind dpindx dpindy dpindlong dpindlongy
#        rel8 rel16 sr sry dp_sr_y absind indlong
T = {}
def d(op, mn, mode): T[op] = (mn, mode)

# 0x00-0x0F
d(0x00,'BRK','imm8'); d(0x01,'ORA','dpindx'); d(0x02,'COP','imm8'); d(0x03,'ORA','sr')
d(0x04,'TSB','dp'); d(0x05,'ORA','dp'); d(0x06,'ASL','dp'); d(0x07,'ORA','dpindlong')
d(0x08,'PHP','imp'); d(0x09,'ORA','imm8'); d(0x0a,'ASL','acc'); d(0x0b,'PHD','imp')
d(0x0c,'TSB','abs'); d(0x0d,'ORA','abs'); d(0x0e,'ASL','abs'); d(0x0f,'ORA','long')
# 0x10-0x1F
d(0x10,'BPL','rel8'); d(0x11,'ORA','dpindy'); d(0x12,'ORA','dpind'); d(0x13,'ORA','dp_sr_y')
d(0x14,'TRB','dp'); d(0x15,'ORA','dpx'); d(0x16,'ASL','dpx'); d(0x17,'ORA','dpindlongy')
d(0x18,'CLC','imp'); d(0x19,'ORA','absy'); d(0x1a,'INC','acc'); d(0x1b,'TCS','imp')
d(0x1c,'TRB','abs'); d(0x1d,'ORA','absx'); d(0x1e,'ASL','absx'); d(0x1f,'ORA','longx')
# 0x20-0x2F
d(0x20,'JSR','abs'); d(0x21,'AND','dpindx'); d(0x22,'JSL','long'); d(0x23,'AND','sr')
d(0x24,'BIT','dp'); d(0x25,'AND','dp'); d(0x26,'ROL','dp'); d(0x27,'AND','dpindlong')
d(0x28,'PLP','imp'); d(0x29,'AND','imm8'); d(0x2a,'ROL','acc'); d(0x2b,'PLD','imp')
d(0x2c,'BIT','abs'); d(0x2d,'AND','abs'); d(0x2e,'ROL','abs'); d(0x2f,'AND','long')
# 0x30-0x3F
d(0x30,'BMI','rel8'); d(0x31,'AND','dpindy'); d(0x32,'AND','dpind'); d(0x33,'AND','dp_sr_y')
d(0x34,'BIT','dpx'); d(0x35,'AND','dpx'); d(0x36,'ROL','dpx'); d(0x37,'AND','dpindlongy')
d(0x38,'SEC','imp'); d(0x39,'AND','absy'); d(0x3a,'DEC','acc'); d(0x3b,'TSC','imp')
d(0x3c,'BIT','absx'); d(0x3d,'AND','absx'); d(0x3e,'ROL','absx'); d(0x3f,'AND','longx')
# 0x40-0x4F
d(0x40,'RTI','imp'); d(0x41,'EOR','dpindx'); d(0x42,'WDM','imm8'); d(0x43,'EOR','sr')
d(0x44,'MVP','mvn'); d(0x45,'EOR','dp'); d(0x46,'LSR','dp'); d(0x47,'EOR','dpindlong')
d(0x48,'PHA','imp'); d(0x49,'EOR','imm8'); d(0x4a,'LSR','acc'); d(0x4b,'PHK','imp')
d(0x4c,'JMP','abs'); d(0x4d,'EOR','abs'); d(0x4e,'LSR','abs'); d(0x4f,'EOR','long')
# 0x50-0x5F
d(0x50,'BVC','rel8'); d(0x51,'EOR','dpindy'); d(0x52,'EOR','dpind'); d(0x53,'EOR','dp_sr_y')
d(0x54,'MVN','mvn'); d(0x55,'EOR','dpx'); d(0x56,'LSR','dpx'); d(0x57,'EOR','dpindlongy')
d(0x58,'CLI','imp'); d(0x59,'EOR','absy'); d(0x5a,'PHY','imp'); d(0x5b,'TCD','imp')
d(0x5c,'JML','long'); d(0x5d,'EOR','absx'); d(0x5e,'LSR','absx'); d(0x5f,'EOR','longx')
# 0x60-0x6F
d(0x60,'RTS','imp'); d(0x61,'ADC','dpindx'); d(0x62,'PER','rel16'); d(0x63,'ADC','sr')
d(0x64,'STZ','dp'); d(0x65,'ADC','dp'); d(0x66,'ROR','dp'); d(0x67,'ADC','dpindlong')
d(0x68,'PLA','imp'); d(0x69,'ADC','imm8'); d(0x6a,'ROR','acc'); d(0x6b,'RTL','imp')
d(0x6c,'JMP','absind'); d(0x6d,'ADC','abs'); d(0x6e,'ROR','abs'); d(0x6f,'ADC','long')
# 0x70-0x7F
d(0x70,'BVS','rel8'); d(0x71,'ADC','dpindy'); d(0x72,'ADC','dpind'); d(0x73,'ADC','dp_sr_y')
d(0x74,'STZ','dpx'); d(0x75,'ADC','dpx'); d(0x76,'ROR','dpx'); d(0x77,'ADC','dpindlongy')
d(0x78,'SEI','imp'); d(0x79,'ADC','absy'); d(0x7a,'PLY','imp'); d(0x7b,'TDC','imp')
d(0x7c,'JMP','indx'); d(0x7d,'ADC','absx'); d(0x7e,'ROR','absx'); d(0x7f,'ADC','longx')
# 0x80-0x8F
d(0x80,'BRA','rel8'); d(0x81,'STA','dpindx'); d(0x82,'BRL','rel16'); d(0x83,'STA','sr')
d(0x84,'STY','dp'); d(0x85,'STA','dp'); d(0x86,'STX','dp'); d(0x87,'STA','dpindlong')
d(0x88,'DEY','imp'); d(0x89,'BIT','imm8'); d(0x8a,'TXA','imp'); d(0x8b,'PHB','imp')
d(0x8c,'STY','abs'); d(0x8d,'STA','abs'); d(0x8e,'STX','abs'); d(0x8f,'STA','long')
# 0x90-0x9F
d(0x90,'BCC','rel8'); d(0x91,'STA','dpindy'); d(0x92,'STA','dpind'); d(0x93,'STA','dp_sr_y')
d(0x94,'STY','dpx'); d(0x95,'STA','dpx'); d(0x96,'STX','dpy'); d(0x97,'STA','dpindlongy')
d(0x98,'TYA','imp'); d(0x99,'STA','absy'); d(0x9a,'TXS','imp'); d(0x9b,'TXY','imp')
d(0x9c,'STZ','abs'); d(0x9d,'STA','absx'); d(0x9e,'STZ','absx'); d(0x9f,'STA','longx')
# 0xA0-0xAF
d(0xa0,'LDY','imm16'); d(0xa1,'LDA','dpindx'); d(0xa2,'LDX','imm16'); d(0xa3,'LDA','sr')
d(0xa4,'LDY','dp'); d(0xa5,'LDA','dp'); d(0xa6,'LDX','dp'); d(0xa7,'LDA','dpindlong')
d(0xa8,'TAY','imp'); d(0xa9,'LDA','imm8'); d(0xaa,'TAX','imp'); d(0xab,'PLB','imp')
d(0xac,'LDY','abs'); d(0xad,'LDA','abs'); d(0xae,'LDX','abs'); d(0xaf,'LDA','long')
# 0xB0-0xBF
d(0xb0,'BCS','rel8'); d(0xb1,'LDA','dpindy'); d(0xb2,'LDA','dpind'); d(0xb3,'LDA','dp_sr_y')
d(0xb4,'LDY','dpx'); d(0xb5,'LDA','dpx'); d(0xb6,'LDX','dpy'); d(0xb7,'LDA','dpindlongy')
d(0xb8,'CLV','imp'); d(0xb9,'LDA','absy'); d(0xba,'TSX','imp'); d(0xbb,'TYX','imp')
d(0xbc,'LDY','absx'); d(0xbd,'LDA','absx'); d(0xbe,'LDX','absy'); d(0xbf,'LDA','longx')
# 0xC0-0xCF
d(0xc0,'CPY','imm16'); d(0xc1,'CMP','dpindx'); d(0xc2,'REP','imm8'); d(0xc3,'CMP','sr')
d(0xc4,'CPY','dp'); d(0xc5,'CMP','dp'); d(0xc6,'DEC','dp'); d(0xc7,'CMP','dpindlong')
d(0xc8,'INY','imp'); d(0xc9,'CMP','imm8'); d(0xca,'DEX','imp'); d(0xcb,'WAI','imp')
d(0xcc,'CPY','abs'); d(0xcd,'CMP','abs'); d(0xce,'DEC','abs'); d(0xcf,'CMP','long')
# 0xD0-0xDF
d(0xd0,'BNE','rel8'); d(0xd1,'CMP','dpindy'); d(0xd2,'CMP','dpind'); d(0xd3,'CMP','dp_sr_y')
d(0xd4,'PEI','dpind'); d(0xd5,'CMP','dpx'); d(0xd6,'DEC','dpx'); d(0xd7,'CMP','dpindlongy')
d(0xd8,'CLD','imp'); d(0xd9,'CMP','absy'); d(0xda,'PHX','imp'); d(0xdb,'STP','imp')
d(0xdc,'JML','absind'); d(0xdd,'CMP','absx'); d(0xde,'DEC','absx'); d(0xdf,'CMP','longx')
# 0xE0-0xEF
d(0xe0,'CPX','imm16'); d(0xe1,'SBC','dpindx'); d(0xe2,'SEP','imm8'); d(0xe3,'SBC','sr')
d(0xe4,'CPX','dp'); d(0xe5,'SBC','dp'); d(0xe6,'INC','dp'); d(0xe7,'SBC','dpindlong')
d(0xe8,'INX','imp'); d(0xe9,'SBC','imm8'); d(0xea,'NOP','imp'); d(0xeb,'XBA','imp')
d(0xec,'CPX','abs'); d(0xed,'SBC','abs'); d(0xee,'INC','abs'); d(0xef,'SBC','long')
# 0xF0-0xFF
d(0xf0,'BEQ','rel8'); d(0xf1,'SBC','dpindy'); d(0xf2,'SBC','dpind'); d(0xf3,'SBC','dp_sr_y')
d(0xf4,'PEA','imm16'); d(0xf5,'SBC','dpx'); d(0xf6,'INC','dpx'); d(0xf7,'SBC','dpindlongy')
d(0xf8,'SED','imp'); d(0xf9,'SBC','absy'); d(0xfa,'PLX','imp'); d(0xfb,'XCE','imp')
d(0xfc,'JSR','indx'); d(0xfd,'SBC','absx'); d(0xfe,'INC','absx'); d(0xff,'SBC','longx')

# number of operand bytes per mode
SIZE = {
 'imp':0,'acc':0,'imm8':1,'imm16':2,'mvn':2,
 'dp':1,'dpx':1,'dpy':1,'sr':1,'sry':1,
 'abs':2,'absx':2,'absy':2,
 'long':3,'longx':3,
 'ind':2,'indx':2,'indy':2,'absind':2,'indlong':2,
 'dpind':1,'dpindx':1,'dpindy':1,'dpindlong':1,'dpindlongy':1,
 'dp_sr_y':1,
 'rel8':1,'rel16':2,
}

class ROM:
    def __init__(self, path):
        self.data = open(path,'rb').read()
    def offset(self, bank, addr):
        # LoROM
        return ((bank & 0x3f) << 15) | (addr & 0x7fff)
    def read(self, bank, addr):
        return self.data[self.offset(bank, addr)]
    def read16(self, bank, addr):
        lo = self.read(bank,addr); hi = self.read(bank,(addr+1)&0xffff)
        return lo | (hi<<8)
    def read24(self, bank, addr):
        b0=self.read(bank,addr); b1=self.read(bank,(addr+1)&0xffff); b2=self.read(bank,(addr+2)&0xffff)
        return b0 | (b1<<8) | (b2<<16)

def disasm_one(rom, bank, pc, m=1, x=1):
    op = rom.read(bank, pc)
    if op not in T:
        return (pc, 1, f'DCB ${op:02X}', None)
    mn, mode = T[op]
    n = SIZE[mode]
    oper = [rom.read(bank,(pc+1+i)&0xffff) for i in range(n)]
    txt = mn
    target = None
    if mode=='imp': pass
    elif mode=='acc': txt += ' A'
    elif mode=='imm8':
        imm = oper[0]
        if mn in ('LDA','ORA','AND','EOR','ADC','SBC','CMP','BIT'):
            txt += f' #{imm:02X}' if m else f' #{imm:02X}{rom.read(bank,(pc+2)&0xffff):02X}'
            if m==0 and n==1: n=2
        else:
            txt += f' #{imm:02X}'
    elif mode=='imm16':
        v = oper[0]|(oper[1]<<8)
        if mn in ('LDY','LDX','CPY','CPX') and x:
            txt += f' #{v:04X}'
        else:
            txt += f' #{oper[0]:02X}' if x else f' #{v:04X}'
    elif mode=='dp': txt += f' ${oper[0]:02X}'
    elif mode=='dpx': txt += f' ${oper[0]:02X},X'
    elif mode=='dpy': txt += f' ${oper[0]:02X},Y'
    elif mode=='sr': txt += f' ${oper[0]:02X},S'
    elif mode=='dp_sr_y': txt += f' (${oper[0]:02X},S),Y'
    elif mode=='abs': 
        a=oper[0]|(oper[1]<<8); txt += f' ${a:04X}'; target=(bank,a)
    elif mode=='absx':
        a=oper[0]|(oper[1]<<8); txt += f' ${a:04X},X'; target=(bank,a)
    elif mode=='absy':
        a=oper[0]|(oper[1]<<8); txt += f' ${a:04X},Y'; target=(bank,a)
    elif mode=='long':
        a=oper[0]|(oper[1]<<8)|(oper[2]<<16); txt += f' ${a:06X}'; target=((a>>16)&0x3f, a&0xffff)
    elif mode=='longx':
        a=oper[0]|(oper[1]<<8)|(oper[2]<<16); txt += f' ${a:06X},X'
    elif mode=='ind': 
        a=oper[0]|(oper[1]<<8); txt += f' (${a:04X})'
    elif mode=='indx':
        a=oper[0]|(oper[1]<<8); txt += f' (${a:04X},X)'; target=(bank,a)
    elif mode=='absind':
        a=oper[0]|(oper[1]<<8); txt += f' [${a:04X}]'
    elif mode=='indlong':
        a=oper[0]|(oper[1]<<8); txt += f' [${a:04X}]'
    elif mode=='dpind': txt += f' (${oper[0]:02X})'
    elif mode=='dpindx': txt += f' (${oper[0]:02X},X)'
    elif mode=='dpindy': txt += f' (${oper[0]:02X}),Y'
    elif mode=='dpindlong': txt += f' [${oper[0]:02X}]'
    elif mode=='dpindlongy': txt += f' [${oper[0]:02X}],Y'
    elif mode=='rel8':
        off = oper[0]
        if off>=0x80: off-=0x100
        t = (pc+2+off)&0xffff
        txt += f' ${t:04X}'; target=(bank,t)
    elif mode=='rel16':
        off = oper[0]|(oper[1]<<8)
        if off>=0x8000: off-=0x10000
        t = (pc+3+off)&0xffff
        txt += f' ${t:04X}'; target=(bank,t)
    elif mode=='mvn':
        txt += f' ${oper[0]:02X},${oper[1]:02X}'
    raw = ' '.join(f'{rom.read(bank,(pc+i)&0xffff):02X}' for i in range(1+n))
    return (pc, 1+n, f'{txt:<28}; {raw}', target)

if __name__ == '__main__':
    rom = ROM(sys.argv[1] if len(sys.argv)>1 else "Demon's Crest (USA).sfc")
    bank = int(sys.argv[2],0)
    start = int(sys.argv[3],0)
    count = int(sys.argv[4]) if len(sys.argv)>4 else 40
    pc = start
    for _ in range(count):
        addr, n, txt, t = disasm_one(rom, bank, pc)
        print(f'{bank:02X}:{pc:04X}  {txt}')
        pc = (pc+n)&0xffff
