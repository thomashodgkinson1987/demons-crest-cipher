// Minimal DOM shim + functional test for password_tool.html UI logic.
const registry = [];

class El {
  constructor(tag){
    this.tagName = tag.toUpperCase();
    this.children = []; this.parentNode = null;
    this.attrs = {}; this.listeners = {}; this.dataset = {};
    this.style = {}; this.value = ''; this.checked = false; this.disabled = false;
    this.hidden = false; this._html = ''; this._text = '';
    this.className = ''; this.id = ''; this.maxLength = 0;
    this.type = ''; this.clipboardData = { getData: () => '' };
    registry.push(this);
  }
  get innerHTML(){ return this._html; }
  set innerHTML(v){ this._html = v; this.children = []; }
  get textContent(){ return this._text; }
  set textContent(v){ this._text = v; this.children = []; }
  get classList(){
    const self = this;
    const set = () => new Set(self.className.split(/\s+/).filter(Boolean));
    return {
      add: c => { const s = set(); s.add(c); self.className = [...s].join(' '); },
      remove: c => { const s = set(); s.delete(c); self.className = [...s].join(' '); },
      toggle: (c, f) => { const s = set(); const on = f === undefined ? !s.has(c) : !!f;
        if (on) s.add(c); else s.delete(c); self.className = [...s].join(' '); return on; },
      contains: c => set().has(c),
    };
  }
  appendChild(c){ c.parentNode = this; this.children.push(c); return c; }
  remove(){ if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); }
  setAttribute(k, v){ this.attrs[k] = String(v); }
  addEventListener(t, fn){ (this.listeners[t] = this.listeners[t] || []).push(fn); }
  dispatch(t, ev){
    ev = ev || {}; ev.target = ev.target || this;
    ev.preventDefault = ev.preventDefault || (() => {});
    (this.listeners[t] || []).forEach(fn => fn.call(this, ev));
  }
  click(){
    this.dispatch('click');
    if (typeof this.onclick === 'function')
      this.onclick.call(this, { target: this, preventDefault(){} });
  }
  focus(){} select(){}
  closest(sel){
    let n = this;
    while (n){ if (matchToken(n, sel)) return n; n = n.parentNode; }
    return null;
  }
  querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel){
    const out = [];
    const walk = el => { for (const c of el.children){ if (matchChain(c, sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}

// token matcher: tag / .class / #id / [attr="value"] (single token)
function matchToken(el, tok){
  const m = tok.match(/^([a-zA-Z][-a-zA-Z0-9]*)?((?:[.#][\w-]+|\[[^\]]+\])*)$/);
  if (!m) return false;
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  const rest = m[2] || '';
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
  const ids = [...rest.matchAll(/#([\w-]+)/g)].map(x => x[1]);
  const attrs = [...rest.matchAll(/\[([^\]=]+)="([^"]*)"\]/g)].map(x => [x[1], x[2]]);
  for (const c of classes) if (!el.className.split(/\s+/).includes(c)) return false;
  for (const i of ids) if (el.id !== i) return false;
  for (const [k, v] of attrs) if (String((el.dataset && el.dataset[k.replace(/^data-/, '') ]) ?? el.attrs[k] ?? '') !== v) return false;
  return true;
}
// chain: 'A B C' → el matches last, ancestors match the rest in order
function matchChain(el, sel){
  const toks = sel.trim().split(/\s+/);
  if (!matchToken(el, toks[toks.length - 1])) return false;
  let anc = el.parentNode; let ti = toks.length - 2;
  while (ti >= 0 && anc){
    if (matchToken(anc, toks[ti])) ti--;
    anc = anc.parentNode;
  }
  return ti < 0;
}

// ---- pre-create the static HTML elements the UI expects ----
function mk(tag, id, cls){ const e = new El(tag); if (id) e.id = id; if (cls) e.className = cls; return e; }
const ids = ['panelDec','decGrid','decStatus','decState','decRaw','decCopy',
             'panelEnc','hpSlider','hpVal','contBoxes','crestBoxes','ultBox','spellBoxes',
             'potionBoxes','taliBoxes','flagBoxes','btnGen','btnVar','encGrid','encNotice',
             'encStatus','encRaw','encCopy','tabDec','tabEnc','btnTest','testOut'];
for (const id of ids) registry.push(mk('div', id));
const presetsDiv = mk('div', '', 'presets'); registry.push(presetsDiv);
const PWDS = ['HDDSDTGXBQQZNDMN','LWDYMSQMVWDHGPSG','MRBLMFNPHGJBJRZB','QFFFKNRRDDLRXGTQ',
              'RBNLXHGBVGBBLYLD','PDQMRRMVFWGXDTSG','GDBFYLFVHZJSZHCS','HDDMNTKBHQLFXKLD',
              'PBGXRVNGKGKXWRZB','FDQPQRMBFGNHGTKL'];
for (const pw of PWDS){
  const b = mk('button', '', ''); b.dataset.pw = pw; presetsDiv.appendChild(b); registry.push(b);
}
const document = {
  createElement: t => new El(t),
  createTextNode: t => { const e = new El('#text'); e.textContent = t; return e; },
  body: mk('body'),
  getElementById: id => registry.find(e => e.id === id) || null,
  querySelectorAll: sel => registry.filter(el => matchChain(el, sel)),
  querySelector: sel => document.querySelectorAll(sel)[0] || null,
};

// ---- load codec + UI blocks in one scope ----
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../password_tool.html', import.meta.url).pathname, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length !== 2) throw new Error('expected 2 script blocks, got ' + blocks.length);
const api = new Function('document', blocks[0] + '\n' + blocks[1] + `
;return { decodePassword, validate, extractState, autoFix, encodeState };`)(document);
const { decodePassword, extractState } = api;

// ---- assertions ----
const $id = id => registry.find(e => e.id === id);
const decCells = $id('decGrid').children;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond){ pass++; } else { fail++; console.log('FAIL: ' + msg); } };

// 1. init preloaded V1 into decode grid, status ok
ok(decCells.length === 16, 'decode grid has 16 cells');
ok(decCells.map(c => c.value).join('') === 'HDDSDTGXBQQZNDMN', 'V1 preloaded: ' + decCells.map(c=>c.value).join(''));
ok($id('decStatus').className.includes('ok'), 'V1 validates OK');
ok($id('dv-hp').textContent === 'HP 10', 'V1 HP shown: ' + $id('dv-hp').textContent);

// 2. clear everything → generate → exact empty shape
for (let i = 0; i < 8; i++){ $id('cb-c'+i).checked = false; $id('cb-c'+i).dispatch('change'); }
for (let i = 0; i < 5; i++){ for (const p of ['cb-s','cb-p','cb-t']){ $id(p+i).checked = false; $id(p+i).dispatch('change'); } }
for (let i = 0; i < 16; i++){ $id('cb-n'+i).checked = false; $id('cb-n'+i).dispatch('change'); }
$id('cb-ult0').checked = false; $id('cb-ult0').dispatch('change');
$id('cb-boss0').checked = false; $id('cb-boss0').dispatch('change');
$id('btnGen').click();
const encLetters = $id('encGrid').children.map(c => c.textContent).join('');
ok(encLetters.length === 16, 'generate produced 16 letters');
ok($id('encStatus').className.includes('ok'), 'generated password validates');
const s1 = extractState(decodePassword(encLetters).src);
ok(s1.hp === 4 && !s1.boss, 'empty state → HP 4, no boss (got HP ' + s1.hp + ' boss ' + s1.boss + ')');
ok($id('encNotice').innerHTML === '', 'no auto-fix notice for empty state');
ok($id('decGrid').children.map(c => c.value).join('') === encLetters, 'generate mirrors into decode grid');

// 3. check CLAW crest + HOLD spell → generate → state must contain them
$id('cb-c2').checked = true; $id('cb-c2').dispatch('change');
$id('cb-s1').checked = true; $id('cb-s1').dispatch('change');
$id('btnGen').click();
const s2 = extractState(decodePassword($id('encGrid').children.map(c=>c.textContent).join('')).src);
ok((s2.crest & 4) !== 0, 'CLAW crest encoded (crest=' + s2.crest.toString(2) + ')');
ok((s2.spell & 2) !== 0, 'HOLD spell encoded (spell=' + s2.spell.toString(2) + ')');
ok(s2.cont === 1, 'container 1 auto-enabled');
ok($id('encNotice').innerHTML.includes('Container 1'), 'auto-fix notice shown');

// 4. ULTIMATE → forced 100%
$id('cb-ult0').checked = true; $id('cb-ult0').dispatch('change');
$id('btnGen').click();
const s3 = extractState(decodePassword($id('encGrid').children.map(c=>c.textContent).join('')).src);
ok(s3.ult && s3.crest === 0xFF && s3.cont === 0xFFFF && s3.spell === 0x1F && s3.potion === 0x1F && s3.talis === 0xF8,
   'Ultimate forces exact 100% state');
ok($id('encNotice').innerHTML.includes('Ultimate'), 'Ultimate notice shown');
ok($id('hpVal').textContent === 'HP 20', 'HP slider synced to 20');

// 5. talisman checkbox → bit 3+ mapping
$id('cb-ult0').checked = false; $id('cb-ult0').dispatch('change');
// unchecking Ultimate keeps the 100% checkboxes (syncUIFromState forced them) — clear manually:
for (let i = 0; i < 8; i++) { $id('cb-c'+i).checked = false; $id('cb-c'+i).dispatch('change'); }
$id('cb-t0').checked = true; $id('cb-t0').dispatch('change');   // CROWN → bit 3
$id('cb-s0').checked = false; $id('cb-s0').dispatch('change');
for (let i = 1; i < 5; i++) { $id('cb-s'+i).checked = false; $id('cb-s'+i).dispatch('change'); }
for (let i = 0; i < 5; i++) { $id('cb-p'+i).checked = false; $id('cb-p'+i).dispatch('change'); }
for (let i = 1; i < 5; i++) { $id('cb-t'+i).checked = false; $id('cb-t'+i).dispatch('change'); }
$id('btnGen').click();
const s4 = extractState(decodePassword($id('encGrid').children.map(c=>c.textContent).join('')).src);
ok(s4.talis === 0x08, 'CROWN lands in $1E53 bit 3 (talis=$' + s4.talis.toString(16) + ')');

// 6. HP slider → 12 → containers 1..8, HP 12
$id('hpSlider').value = '12'; $id('hpSlider').dispatch('input');
ok($id('hpVal').textContent === 'HP 12', 'slider sets HP 12');
ok($id('cb-n7').checked && !$id('cb-n8').checked, 'slider fills containers 1..8');
$id('btnGen').click();
const s5 = extractState(decodePassword($id('encGrid').children.map(c=>c.textContent).join('')).src);
ok(s5.hp === 12, 'generated password has HP 12');

// 7. preset V5 loads boss flag into encode tab
document.querySelector('.presets button[data-pw="RBNLXHGBVGBBLYLD"]').click();
ok($id('cb-boss0').checked === true, 'V5 preset sets boss flag');
ok(Number($id('hpSlider').value) === 4, 'V5 preset HP 4');
ok($id('decGrid').children.map(c => c.value).join('') === 'RBNLXHGBVGBBLYLD', 'V5 into decode grid');

// 8. invalid password detection (flip a letter)
$id('decGrid').children[0].value = 'B'; $id('decGrid').children[0].dispatch('input');
ok($id('decStatus').className.includes('bad'), 'corrupted password flagged invalid');

// 9. self-test runs clean
$id('btnTest').click();
ok($id('testOut').innerHTML.includes('✓'), 'in-page self-test passes: ' + $id('testOut').innerHTML.replace(/<[^>]+>/g,''));

console.log(`\nUI FUNCTIONAL TESTS: ${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
console.log('ALL UI TESTS PASS');