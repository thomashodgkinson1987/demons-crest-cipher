
// ===== UI =====
const CREST_NAMES  = ['BUSTER','TORNADO','CLAW','DEMON FIRE','EARTH','AIR','WATER','TIME'];
const SPELL_NAMES  = ['SHADOW','HOLD','IMP','SHOCK','DEATH'];
const POTION_NAMES = ['MERCURY','SULFUR','HERB','ELIXIR','GINSENG'];
const TALI_NAMES   = ['CROWN','SKULL','ARMOR','FANG','HAND'];

const $ = id => document.getElementById(id);
const hex = (v, n=2) => '$' + v.toString(16).toUpperCase().padStart(n, '0');

// ---- build checkbox groups ----
function addChips(containerId, names, prefix, disabled, extra){
  const box = typeof containerId === 'string' ? $(containerId) : containerId;
  names.forEach((nm, i) => {
    const l = document.createElement('label');
    l.className = 'chip';
    const b = document.createElement('input');
    b.type = 'checkbox'; b.id = prefix + i; b.disabled = !!disabled;
    b.addEventListener('change', refreshChip);
    l.appendChild(b);
    l.appendChild(document.createTextNode(' ' + nm));
    l._bit = (extra && extra.bit !== undefined) ? extra.bit(i) : i;
    l._mask = 1 << l._bit;
    box.appendChild(l);
  });
  return box;
}
function refreshChip(e){
  const l = e.target.closest('.chip');
  if (l) l.classList.toggle('checked', e.target.checked);
  if (e.target.closest('#contBoxes') || e.target.id === 'cb-hp') syncHP();
  if (e.target.closest('#panelEnc')) liveEncodePreview();
}
function setChip(prefix, i, on){
  const b = $(prefix + i);
  if (b){ b.checked = !!on; const l = b.closest('.chip'); if (l) l.classList.toggle('checked', on); }
}

// decode display boxes (disabled), grouped into fieldsets
(function buildDecPanel(){
  const groups = [
    ['CRESTS / FORMS',    'dv-c', CREST_NAMES],
    ['',                  'dv-u', ['ULTIMATE GARGOYLE']],
    ['SPELLS (VELLUM)',   'dv-s', SPELL_NAMES],
    ['POTIONS (URNS)',    'dv-p', POTION_NAMES],
    ['TALISMANS',         'dv-t', TALI_NAMES, i => 3 + i],
    ['HEART CONTAINERS',  'dv-n', Array.from({length:16}, (_,i) => 'C'+(i+1))],
    ['FLAGS',             'dv-b', ['BOSS-ONLY MODE'], () => 0],
  ];
  $('decState').innerHTML = '<div class="big" id="dv-hp" style="color:var(--gold);margin:2px 0 8px">HP —</div>';
  for (const [title, prefix, names, bitFn] of groups){
    const fs = document.createElement('fieldset');
    if (title){ const lg = document.createElement('legend'); lg.textContent = title; fs.appendChild(lg); }
    const div = document.createElement('div'); div.className = 'chips';
    fs.appendChild(div);
    $('decState').appendChild(fs);
    addChips(div, names, prefix, true, bitFn !== undefined ? { bit: bitFn } : undefined);
  }
})();

// encode input boxes
addChips('contBoxes',  Array.from({length:16}, (_,i)=>'C'+(i+1)), 'cb-n', false);
addChips('crestBoxes', CREST_NAMES,  'cb-c', false);
addChips('ultBox',     ['ULTIMATE GARGOYLE (requires 100% state)'], 'cb-ult', false, { bit: () => 0 });
addChips('spellBoxes', SPELL_NAMES,  'cb-s', false);
addChips('potionBoxes',POTION_NAMES, 'cb-p', false);
addChips('taliBoxes',  TALI_NAMES,   'cb-t', false, { bit: i => 3 + i });
addChips('flagBoxes',  ['BOSS-ONLY MODE (boss fights, no regular enemies)'], 'cb-boss', false, { bit: () => 0 });

// ---- decode grid ----
const decInputs = [];
(function buildDecGrid(){
  for (let i = 0; i < 16; i++){
    const inp = document.createElement('input');
    inp.className = 'cell'; inp.maxLength = 1; inp.setAttribute('autocomplete','off');
    inp.addEventListener('input', () => {
      let v = inp.value.toUpperCase();
      v = [...v].filter(c => ALPHABET.includes(c)).join('');
      inp.value = v.slice(-1);
      if (inp.value && i < 15) decInputs[i+1].focus();
      renderDecode();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const t = (e.clipboardData.getData('text') || '').toUpperCase();
      const chars = [...t].filter(c => ALPHABET.includes(c)).slice(0, 16);
      if (!chars.length) return;
      for (let k = 0; k < 16; k++) decInputs[k].value = chars[k] || '';
      renderDecode();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && i > 0){ decInputs[i-1].focus(); }
    });
    $('decGrid').appendChild(inp);
    decInputs.push(inp);
  }
})();

function fillDecGrid(pw){
  for (let i = 0; i < 16; i++) decInputs[i].value = pw[i] || '';
}

// ---- tabs ----
function setTab(dec){
  $('panelDec').hidden = !dec; $('panelEnc').hidden = dec;
  $('tabDec').classList.toggle('active', dec);
  $('tabEnc').classList.toggle('active', !dec);
}
$('tabDec').onclick = () => setTab(true);
$('tabEnc').onclick = () => setTab(false);

// ---- decode rendering ----
function renderDecode(){
  const pw = decInputs.map(i => i.value).join('');
  const st = $('decStatus');
  const raw = $('decRaw');
  const n = pw.length;
  if (n < 16){
    st.className = 'status idle';
    st.textContent = `Enter a 16-letter password (${n}/16)`;
    raw.hidden = true;
    showDecoded(null);
    return;
  }
  const d = decodePassword(pw);
  const v = validate(d.src);
  raw.hidden = false;
  raw.innerHTML = rawDump('payload+key+chk ($10-$17)', d.src);
  if (!v.ok){
    st.className = 'status bad';
    st.textContent = '✗ INVALID — ' + v.reason;
    showDecoded(null, d.src);
  } else {
    const s = extractState(d.src);
    st.className = 'status ok';
    st.textContent = '✓ VALID — accepted by the game';
    showDecoded(s, d.src);
  }
}

function showDecoded(s, src){
  const names = { crest: CREST_NAMES, spell: SPELL_NAMES, potion: POTION_NAMES, tali: TALI_NAMES };
  const set = (prefix, value, bitBase) => {
    for (let i = 0; i < 16; i++){
      const b = $(prefix + i);
      if (!b) continue;
      const bit = bitBase ? bitBase(i) : i;
      b.checked = !!(value & (1 << bit));
      const l = b.closest('.chip'); if (l) l.classList.toggle('checked', b.checked);
    }
  };
  $('dv-hp').textContent = s ? `HP ${s.hp}` : 'HP —';
  set('dv-c', s ? s.crest : 0);
  set('dv-u', s ? (s.ult ? 1 : 0) : 0, () => 0);
  set('dv-s', s ? s.spell : 0);
  set('dv-p', s ? s.potion : 0);
  set('dv-t', s ? s.talis : 0, i => 3 + i);
  set('dv-n', s ? s.cont : 0);
  set('dv-b', s && s.boss ? 1 : 0, () => 0);
  const u = s ? s.unknown58 : 0;
  const flagsEl = $('dv-b0').closest('.chips');
  let extra = flagsEl.querySelector('.unk');
  if (u){
    if (!extra){ extra = document.createElement('span'); extra.className = 'unk'; extra.style.color = 'var(--gold)'; flagsEl.appendChild(extra); }
    extra.textContent = ` (unknown flag bits set: ${u.toString(2).padStart(3,'0')})`;
  } else if (extra) extra.textContent = '';
}

function rawDump(label, src){
  return `<b>${label}:</b> ${src.map(b => hex(b)).join(' ')}`;
}

// ---- encode tab ----
function collectState(){
  const bits = prefix => {
    let v = 0;
    for (let i = 0; i < 16; i++){ const b = $(prefix + i); if (b && b.checked) v |= (1 << i); }
    return v;
  };
  return {
    crest: bits('cb-c'), ult: $('cb-ult0').checked,
    spell: bits('cb-s'), potion: bits('cb-p'),
    talis: bits('cb-t') << 3, cont: bits('cb-n'),
    boss: $('cb-boss0').checked
  };
}

function syncUIFromState(s){
  const set = (prefix, value, bitBase) => {
    for (let i = 0; i < 16; i++){
      const b = $(prefix + i);
      if (!b) continue;
      const bit = bitBase ? bitBase(i) : i;
      setChip(prefix, i, !!(value & (1 << bit)));
    }
  };
  set('cb-c', s.crest);
  setChip('cb-ult', 0, s.ult);
  set('cb-s', s.spell);
  set('cb-p', s.potion);
  set('cb-t', s.talis, i => 3 + i);
  set('cb-n', s.cont);
  setChip('cb-boss', 0, s.boss);
  syncHP();
}

function syncHP(){
  let cont = 0;
  for (let i = 0; i < 16; i++) if ($('cb-n' + i) && $('cb-n' + i).checked) cont |= (1 << i);
  $('hpSlider').value = 4 + popcount(cont);
  $('hpVal').textContent = 'HP ' + (4 + popcount(cont));
}

$('hpSlider').addEventListener('input', () => {
  const n = parseInt($('hpSlider').value, 10) - 4;
  for (let i = 0; i < 16; i++) setChip('cb-n', i, i < n);
  syncHP();
  liveEncodePreview();
});

let lastEncode = null;
function generate(){
  const collected = collectState();
  const { state, notices } = autoFix(collected);
  syncUIFromState(state);
  const e = encodeState(state, null, true);
  lastEncode = e;
  showEncodeResult(e, notices, true);
}
function newVariant(){
  if (!lastEncode) return generate();
  const state = collectState();          // already fixed from last generate
  const e = encodeState(state, null, true);
  lastEncode = e;
  showEncodeResult(e, [], true);
}
function showEncodeResult(e, notices, fillDecode){
  const grid = $('encGrid');
  grid.innerHTML = '';
  [...e.pw].forEach(c => {
    const d = document.createElement('div');
    d.className = 'cellview'; d.textContent = c;
    grid.appendChild(d);
  });
  const v = validate(e.src);
  const stEl = $('encStatus');
  stEl.className = 'status ' + (v.ok ? 'ok' : 'bad');
  stEl.textContent = v.ok ? '✓ VALID — accepted by the game' : '✗ ' + v.reason;
  $('encNotice').innerHTML = notices.map(n => '<div>▸ ' + n + '</div>').join('');
  const raw = $('encRaw');
  raw.hidden = false;
  const s = extractState(e.src);
  raw.innerHTML = rawDump('state $1E50-$1E58',
      [s.hp, s.raw.e51, s.raw.e52, s.raw.e53, s.raw.e54, s.raw.e55,
       s.raw.val & 0xFF, s.raw.val >> 8, s.raw.e58]) +
    '<br>' + rawDump('payload+key+chk ($10-$17)', e.src);
  if (fillDecode) fillDecGrid(e.pw);
  renderDecode();
}
function liveEncodePreview(){ /* intentionally lightweight: preview renders on Generate */ }

$('btnGen').onclick = generate;
$('btnVar').onclick = newVariant;

// ---- copy ----
function copyText(t, btn){
  const done = () => {
    const old = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => { btn.textContent = old; }, 1200);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    ta.remove(); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(t).then(done, fallback);
  else fallback();
}
$('decCopy').onclick = () => copyText(decInputs.map(i => i.value).join(''), $('decCopy'));
$('encCopy').onclick = () => lastEncode && copyText(lastEncode.pw, $('encCopy'));

// ---- presets ----
document.querySelectorAll('.presets button').forEach(btn => {
  btn.addEventListener('click', () => {
    const pw = btn.dataset.pw;
    fillDecGrid(pw);
    renderDecode();
    const d = decodePassword(pw);
    const v = validate(d.src);
    if (v.ok){
      const s = extractState(d.src);
      syncUIFromState({
        crest: s.crest, ult: s.ult, spell: s.spell, potion: s.potion,
        talis: s.talis, cont: s.cont, boss: s.boss
      });
      lastEncode = null;
    }
  });
});

// ---- self-test ----
$('btnTest').onclick = () => {
  const out = $('testOut');
  let knownPass = 0; const fails = [];
  for (const [name, pw] of KNOWN){
    try {
      const d = decodePassword(pw);
      const v = validate(d.src);
      if (!v.ok){ fails.push(`${name}: ${v.reason}`); continue; }
      const s = extractState(d.src);
      const st = { crest: s.crest, ult: s.ult, spell: s.spell, potion: s.potion,
                   talis: s.talis, cont: s.cont, boss: s.boss };
      const re = encodeState(st, d.src[6] >> 4, false);
      if (re.src.join(',') !== d.src.join(',')){ fails.push(`${name}: re-encode mismatch`); continue; }
      knownPass++;
    } catch (err){ fails.push(`${name}: ${err.message}`); }
  }
  let rndPass = 0;
  for (let i = 0; i < 300; i++){
    const st = {
      crest: Math.floor(Math.random()*256), ult: Math.random() < 0.1,
      spell: Math.floor(Math.random()*32), potion: Math.floor(Math.random()*32),
      talis: Math.floor(Math.random()*256) & 0xF8,
      cont: Math.floor(Math.random()*65536), boss: Math.random() < 0.1
    };
    const { state } = autoFix(st);
    const e = encodeState(state, null, false);
    const v = validate(e.src);
    if (!v.ok){ fails.push(`random#${i}: generated password rejected (${v.reason})`); continue; }
    const s = extractState(e.src);
    const good = s.crest === state.crest && s.ult === state.ult &&
                 s.spell === state.spell && s.potion === state.potion &&
                 s.talis === state.talis && s.cont === state.cont && s.boss === state.boss;
    if (!good){ fails.push(`random#${i}: state mismatch`); continue; }
    rndPass++;
  }
  out.innerHTML = fails.length
    ? `<span class="bad">✗ FAILURES: ${fails.length}</span> — ${fails.slice(0,5).join(' | ')}`
    : `<span class="ok">✓ ${knownPass}/${KNOWN.length} known passwords round-trip exactly · ${rndPass}/300 random states encode → decode → state identity</span>`;
};

// ---- init: preload V1 ----
document.querySelector('.presets button[data-pw="HDDSDTGXBQQZNDMN"]').click();
