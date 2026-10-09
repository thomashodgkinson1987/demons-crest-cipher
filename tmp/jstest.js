import { ALPHABET, KNOWN, popcount, decodePassword, validate, extractState, autoFix, encodeState } from './jscodec.js';
let knownPass = 0; const fails = [];
for (const [name, pw] of KNOWN){
  const d = decodePassword(pw);
  const v = validate(d.src);
  if (!v.ok){ fails.push(`${name}: ${v.reason}`); continue; }
  const s = extractState(d.src);
  const st = { crest: s.crest, ult: s.ult, spell: s.spell, potion: s.potion, talis: s.talis, cont: s.cont, boss: s.boss };
  const re = encodeState(st, d.src[6] >> 4, false);
  if (re.src.join(',') !== d.src.join(',')){ fails.push(`${name}: re-encode mismatch`); continue; }
  const re2 = encodeState(st, d.src[6] >> 4, true);  // with aliases
  const v2 = validate(decodePassword(re2.pw).src);
  if (!v2.ok){ fails.push(`${name}: alias variant rejected`); continue; }
  knownPass++;
  console.log(`OK ${name.padEnd(9)} ${pw}  HP=${s.hp} crest=${s.crest.toString(16)} val=${s.raw.val.toString(16)} talis=${s.talis.toString(16)} cont=${s.cont.toString(16)} boss=${s.boss} e58unk=${s.unknown58}`);
}
let rnd = 0;
for (let i = 0; i < 2000; i++){
  const st = { crest: Math.floor(Math.random()*256), ult: Math.random() < 0.1,
               spell: Math.floor(Math.random()*32), potion: Math.floor(Math.random()*32),
               talis: Math.floor(Math.random()*256) & 0xF8,
               cont: Math.floor(Math.random()*65536), boss: Math.random() < 0.1 };
  const { state } = autoFix(st);
  const e = encodeState(state, null, true);
  const v = validate(decodePassword(e.pw).src);
  if (!v.ok){ fails.push(`random#${i}: rejected (${v.reason})`); continue; }
  const s = extractState(decodePassword(e.pw).src);
  const good = s.crest === state.crest && s.ult === state.ult && s.spell === state.spell &&
               s.potion === state.potion && s.talis === state.talis && s.cont === state.cont && s.boss === state.boss;
  if (!good){ fails.push(`random#${i}: state mismatch`); continue; }
  rnd++;
}
console.log(`\nknown: ${knownPass}/${KNOWN.length}  random round-trips: ${rnd}/2000`);
if (fails.length){ console.log('FAILURES:\n' + fails.slice(0,10).join('\n')); Deno.exit(1); }
console.log('ALL PASS');
