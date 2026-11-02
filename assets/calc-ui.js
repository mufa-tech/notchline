// Page wiring for the two free calculators on the Notchline site. The maths is framing.js (a port of
// packages/framing_core); this file reads the page's strings and rule sets from its JSON block
// (#calc-i18n; the words are the app's own, from its ARB files), parses numbers with a comma or a
// dot or as feet, inches and fractions, and writes the result with its formula and every rule with
// clause, limit, your value and a status word. Results update while you type. Nothing is sent or
// stored. Pattern from Boxwright tools/site/static/calc-ui.js (studio §12).
import * as F from './framing.js';

/** A number typed with a comma or a dot as the decimal mark, with optional thousands separators.
 *  Returns null for anything else. */
export function parseNumber(raw, decimal = '.') {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[\s  ']/g, '').replace(/−/g, '-');
  if (!s || !/^-?[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  let dec = null;
  if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) dec = s.split(',').length === 2 && (decimal === ',' || !/^\d{1,3},\d{3}$/.test(s)) ? ',' : null;
  else if (lastDot >= 0) dec = s.split('.').length === 2 && (decimal === '.' || !/^\d{1,3}\.\d{3}$/.test(s)) ? '.' : null;
  const group = dec === ',' ? '.' : dec === '.' ? ',' : null;
  if (group) s = s.split(group).join('');
  if (!dec) s = s.replace(/[.,]/g, '');
  else s = s.replace(dec, '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON = {
  within: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
  outside: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>',
  unchecked: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"><circle cx="12" cy="12" r="9"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>',
};

function setup() {
  const form = document.getElementById('calc-form');
  const data = document.getElementById('calc-i18n');
  const res = document.getElementById('res');
  if (!form || !data || !res) return;
  const T = JSON.parse(data.textContent);
  const A = T.app; // the app's own words (ARB)
  const nojs = document.getElementById('calc-nojs');
  if (nojs) nojs.hidden = true;
  res.hidden = false;

  const NB = ' ';
  const nf = (d, min = 0) => new Intl.NumberFormat(T.locale, { maximumFractionDigits: d, minimumFractionDigits: min, useGrouping: false });
  const num = (n, d = 1, min = d) => nf(d, min).format(Math.abs(n) < 0.5 * 10 ** -d ? 0 : n);
  const fill = (tpl, o) => tpl.replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (k in o ? o[k] : m));
  const radio = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const units = () => radio('units') || T.units;

  // Lengths: metres inside; mm, cm or feet-inch outside.
  const len = (m) => {
    const u = units();
    if (u === 'ftIn') return F.formatFeetInches(m / F.IN);
    if (u === 'cm') return `${num(m * 100, 1, 1)}${NB}cm`;
    return `${num(m * 1000, 0)}${NB}mm`;
  };
  const deg = (rad) => `${num((rad * 180) / Math.PI, 1, 1)}°`;
  /** A rule's number in the rule's own unit (limits are compared in the code's unit). */
  const ruleNum = (v, unit) => {
    switch (unit) {
      case 'inch': return F.formatFeetInches(v, { feet: false });
      case 'millimetre': return `${num(v, 0)}${NB}mm`;
      case 'centimetre': return `${num(v, 1, 0)}${NB}cm`;
      case 'metre': return `${num(v, 2, 2)}${NB}m`;
      case 'degree': return `${num(v, 1, 1)}°`;
      case 'ratio': return `${num(v * 100, 0)}${NB}%`;
      default: return num(v, 0);
    }
  };

  function toggle() {
    for (const el of form.querySelectorAll('[data-show]')) {
      const [name, value] = el.dataset.show.split(':');
      el.hidden = radio(name) !== value;
    }
    for (const el of form.querySelectorAll('[data-unit]')) el.textContent = T.unitNames[units()][el.dataset.unit];
    for (const el of form.querySelectorAll('[data-ph]')) el.placeholder = T.placeholders[units()]?.[el.dataset.ph] ?? '';
  }

  /** Reads a field: { v } (null when empty and optional) or { err }. Lengths come back in metres. */
  function read(id, { kind = 'number', min = null, max = null, optional = false, integer = false } = {}) {
    const input = document.getElementById(id);
    const err = document.getElementById(`${id}-err`);
    const show = (msg) => {
      if (msg) { input.setAttribute('aria-invalid', 'true'); err.textContent = msg; err.hidden = false; } else { input.removeAttribute('aria-invalid'); err.hidden = true; err.textContent = ''; }
    };
    if (!input || input.closest('[hidden]')) return { v: null };
    const raw = input.value.trim();
    if (!raw) { show(''); if (optional) return { v: null }; show(T.errEmpty); return { err: true }; }
    let v;
    if (kind === 'length' && units() === 'ftIn') {
      const inches = F.parseFeetInches(raw, T.decimal);
      v = Number.isFinite(inches) ? inches * F.IN : null;
    } else {
      v = parseNumber(raw, T.decimal);
      if (v !== null && kind === 'length') v = units() === 'cm' ? v / 100 : v / 1000;
    }
    if (v === null) { show(kind === 'length' && units() === 'ftIn' ? T.errFeet : T.errNumber); return { err: true }; }
    if (integer && !Number.isInteger(v)) { show(T.errInteger); return { err: true }; }
    if ((min !== null && v < min) || (max !== null && v > max)) { show(T.errRange); return { err: true }; }
    show('');
    return { v };
  }

  function ruleRow(c, set) {
    const status = c.status === 'withinLimits' ? 'within' : c.status === 'outsideLimits' ? 'outside' : 'unchecked';
    const by = ruleNum(F.shortfall(c), c.rule.unit);
    const word = {
      withinLimits: A.rule_within,
      outsideLimits: fill(c.rule.bound === 'min' ? A.rule_under : A.rule_over, { by }),
      notChecked: c.rule.quantity === 'headroom' ? A.rule_notCheckedOpening : A.rule_notChecked,
      notApplicable: A.rule_notApplicable,
    }[c.status];
    const sign = c.rule.bound === 'min' ? '≥' : '≤';
    const clause = c.rule.confidence === 'practice' ? '' : `${set.code} ${c.rule.clause}`;
    const src = c.rule.confidence === 'secondary' ? A.source_secondary : c.rule.confidence === 'practice' ? A.source_practice : '';
    const vals = c.value == null ? `${sign}${NB}${ruleNum(c.limit, c.rule.unit)}` : `${fill(A.yourValue, { value: ruleNum(c.value, c.rule.unit) })}${NB}${NB}${sign}${NB}${ruleNum(c.limit, c.rule.unit)}`;
    return `<li class="${status}">${ICON[status]}<div><span class="r-name">${esc(T.quantity[c.rule.quantity] || c.rule.quantity)}</span>${clause ? `<span class="r-clause">${esc(clause)}</span>` : ''}${src ? `<span class="r-src">${esc(src)}</span>` : ''}<span class="r-vals">${esc(vals)}</span><span class="r-word">${esc(word)}</span></div></li>`;
  }

  // ---- stairs -----------------------------------------------------------------------------------
  let chosenN = null;
  function stairs() {
    const set = T.ruleSets.find((s) => s.id === form.querySelector('#s-set').value) || T.ruleSets[0];
    const H = read('s-h', { kind: 'length', min: 0.2, max: 12 });
    const n = read('s-n', { optional: true, integer: true, min: 1, max: 80 });
    const G = read('s-g', { kind: 'length', optional: true, min: 0.05, max: 1 });
    const W = read('s-w', { kind: 'length', optional: true, min: 0.3, max: 5 });
    const N = read('s-nos', { kind: 'length', optional: true, min: 0, max: 0.1 });
    if (H.err || n.err || G.err || W.err || N.err || H.v == null) { res.innerHTML = `<p class="note">${esc(T.waiting)}</p>`; return; }
    const r = F.straightStair(set, { H: H.v, n: n.v ?? chosenN, G: G.v, width: W.v, nosing: N.v });
    if (!r.value) { res.innerHTML = `<p class="note">${esc(T.errNumber)}</p>`; return; }
    const s = r.value;
    const outside = s.checks.filter((c) => c.status === 'outsideLimits').length;
    const checked = s.checks.filter((c) => c.status === 'withinLimits' || c.status === 'outsideLimits').length;
    const verdict = outside
      ? `<div class="flag stop">${ICON.outside}<p>${esc(fill(T.stair.outside, { count: outside }))}</p></div>`
      : `<div class="flag good">${ICON.within}<p>${esc(fill(T.stair.within, { count: checked }))}</p></div>`;
    res.innerHTML = `<h3>${esc(A.r_riser)}</h3>
<p class="big">${esc(len(s.riser))}</p>
<p class="res-what">${esc(fill(T.stair.caption, { risers: s.risers, treads: s.treads, going: len(s.going) }))}</p>
<p class="how">${esc(fill(A.formula_riser, { rise: len(H.v), risers: s.risers, riser: len(s.riser) }))}</p>
<p class="small">${esc(T.stair.options)}</p>
<div class="opts">${s.options.map((o) => `<button type="button" data-n="${o.risers}" aria-pressed="${o.risers === s.risers}">${esc(`${o.risers} × ${len(o.riser)}`)}</button>`).join('')}</div>
<ul class="kv">
<li><span>${esc(A.r_going)}</span><b>${esc(len(s.going))}</b></li>
<li><span>${esc(A.r_totalRun)}</span><b>${esc(len(s.run))}</b></li>
<li><span>${esc(A.r_stringer)}</span><b>${esc(s.hypotenuse == null ? '–' : len(s.hypotenuse))}</b></li>
<li><span>${esc(T.stair.nosingLine)}</span><b>${esc(len(s.nosingLine))}</b></li>
<li><span>${esc(A.r_angle)}</span><b>${esc(deg(s.angle))}</b></li>
<li><span>${esc(A.r_step)}</span><b>${esc(units() === 'ftIn' ? F.formatFeetInches(s.step / F.IN, { feet: false }) : len(s.step))}</b></li>
</ul>
<h3>${esc(set.title)}</h3>
${verdict}
<ul class="rules">${s.checks.filter((c) => c.status !== 'notApplicable').map((c) => ruleRow(c, set)).join('')}</ul>
<p class="small">${esc(T.stair.after)}</p>`;
    for (const b of res.querySelectorAll('.opts button')) {
      b.addEventListener('click', () => { chosenN = Number(b.dataset.n); document.getElementById('s-n').value = ''; stairs(); });
    }
  }

  // ---- rafters ----------------------------------------------------------------------------------
  function rafters() {
    const pitchAs = radio('pitchas') || T.pitch;
    const runKind = radio('runkind') || 'run';
    const run = read('r-run', { kind: 'length', optional: true, min: 0.01, max: 100 });
    const rise = read('r-rise', { kind: 'length', optional: true, min: 0, max: 100 });
    const pitch = read('r-pitch', { optional: true, min: 0, max: pitchAs === 'degrees' ? 89.9 : 1e4 });
    const length = read('r-len', { kind: 'length', optional: true, min: 0.01, max: 100 });
    const oh = read('r-oh', { kind: 'length', optional: true, min: 0, max: 5 });
    const depth = read('r-depth', { kind: 'length', optional: true, min: 0.02, max: 1 });
    const seat = read('r-seat', { kind: 'length', optional: true, min: 0.005, max: 1 });
    if ([run, rise, pitch, length, oh, depth, seat].some((x) => x.err)) { res.innerHTML = `<p class="note">${esc(T.waiting)}</p>`; return; }
    const slope = pitch.v == null ? null : pitchAs === 'per12' ? pitch.v / 12 : pitchAs === 'percent' ? pitch.v / 100 : Math.tan((pitch.v * Math.PI) / 180);
    const given = { rise: rise.v, slope, length: length.v };
    if (runKind === 'span') given.span = run.v; else given.run = run.v;
    if (Object.values(given).filter((x) => x != null).length < 2) { res.innerHTML = `<p class="note">${esc(A.roofEmptyBody)}</p>`; return; }
    const sol = F.solveRoof(given);
    if (!sol.value) { res.innerHTML = `<div class="flag stop">${ICON.outside}<p>${esc(T.roof.noSolution)}</p></div>`; return; }
    const V = sol.value.values;
    const conflict = sol.value.conflicts.length
      ? `<div class="flag warn">${ICON.warn}<p>${esc(A.roofConflict)} ${esc(fill(A.roofFieldConflict, { gap: len(Math.max(...sol.value.conflicts.map((c) => c.gap))) }))}</p></div>` : '';
    if (!sol.value.complete) { res.innerHTML = `${conflict}<p class="note">${esc(A.roofEmptyBody)}</p>`; return; }
    const t = V.slope.value;
    const p = F.pitchFromRisePer12(12 * t).value;
    const k = p.slopeFactor;
    const tag = (key) => (V[key].derived ? ` <small>· ${esc(A.derived)}</small>` : '');
    const ohLen = oh.v ? F.overhangLength(oh.v, p.risePer12).value : 0;
    let notch = '';
    if (depth.v && seat.v) {
      const b = F.birdsmouth(depth.v, seat.v, p.risePer12, { overhangRun: oh.v ?? 0, bearing: radio('bearing') || 'woodOrMetal' });
      if (!b.value) notch = `<h3>${esc(A.notchTitle)}</h3><div class="flag stop">${ICON.outside}<p>${esc(A.notchNoSeat)}</p></div>`;
      else {
        const q = b.value.checks.find((c) => c.id === 'notch.end.max');
        const third = b.value.checks.find((c) => c.id === 'notch.oneThird');
        const rows = b.value.checks.filter((c) => c.status !== 'notApplicable' && c.id !== 'notch.oneThird').map((c) => ruleRow(c, { code: 'IRC 2021' })).join('');
        notch = `<h3>${esc(A.notchTitle)}</h3>
<ul class="kv">
<li><span>${esc(A.notchHeel)}</span><b>${esc(len(b.value.heel))}</b></li>
<li><span>${esc(A.notchDepth)}</span><b>${esc(len(b.value.notch))} · ${esc(fill(A.notchShare, { percent: `${num(b.value.fraction * 100, 0)}${NB}%` }))}</b></li>
<li><span>${esc(T.roof.maxSeat)}</span><b>${esc(Number.isFinite(b.value.maxSeat) ? len(b.value.maxSeat) : '–')}</b></li>
</ul>
<p class="how">${esc(fill(A.notchFormula, { angle: deg(p.radians), seat: len(seat.v), sin: num(Math.sin(p.radians), 4, 4), notch: len(b.value.notch) }))}</p>
<ul class="rules">${rows}</ul>
${q.status === 'outsideLimits' ? `<p class="small">${esc(fill(A.notchFix, { seat: len(b.value.maxSeat) }))}</p>` : ''}
<div class="flag info">${ICON.info}<p>${esc(A.notchThumbTitle)}. ${esc(A.notchThumb)}. ${esc(fill(A.notchThumbLimit, { limit: len(depth.v / 3), depth: len(depth.v) }))} · ${esc(third.status === 'withinLimits' ? A.rule_within : fill(A.rule_over, { by: `${num((b.value.fraction - 1 / 3) * 100, 0)}${NB}%` }))}</p></div>`;
      }
    } else notch = `<p class="small">${esc(T.roof.notchHint)}</p>`;
    res.innerHTML = `${conflict}<h3>${esc(A.f_length)}</h3>
<p class="big">${esc(len(V.length.value))}</p>
<p class="res-what">${esc(fill(A.roofPitchCaption, { per12: `${num(p.risePer12, 2, 0)}/12`, degrees: deg(p.radians), percent: `${num(p.percent, 1, 1)}${NB}%` }))}</p>
<p class="how">${esc(fill(A.formula_rafter, { run: len(V.run.value), factor: num(k, 4, 4), length: len(V.length.value) }))}</p>
<ul class="kv">
<li><span>${esc(A.f_run)}</span><b>${esc(len(V.run.value))}${tag('run')}</b></li>
<li><span>${esc(A.f_span)}</span><b>${esc(len(V.span.value))}${tag('span')}</b></li>
<li><span>${esc(A.f_rise)}</span><b>${esc(len(V.rise.value))}${tag('rise')}</b></li>
<li><span>${esc(A.f_pitch)}</span><b>${esc(deg(p.radians))}${tag('slope')}</b></li>
${oh.v ? `<li><span>${esc(T.roof.tail)}</span><b>${esc(len(ohLen))}</b></li><li><span>${esc(T.roof.total)}</span><b>${esc(len(V.length.value + ohLen))}</b></li>` : ''}
</ul>
<p class="small">${esc(A.measuringLine)}</p>
${notch}`;
  }

  // Switching units converts what is already typed, so 2730 mm becomes 273,0 cm or 8′ 11 ½″.
  let lastUnits = units();
  function convertUnits() {
    const now = units();
    if (now === lastUnits) return;
    for (const input of form.querySelectorAll('input[data-kind="length"]')) {
      const raw = input.value.trim();
      if (!raw) continue;
      const m = lastUnits === 'ftIn'
        ? F.parseFeetInches(raw, T.decimal) * F.IN
        : (parseNumber(raw, T.decimal) ?? NaN) / (lastUnits === 'cm' ? 100 : 1000);
      if (!Number.isFinite(m)) continue;
      input.value = now === 'ftIn' ? F.formatFeetInches(m / F.IN, { ascii: true })
        : now === 'cm' ? num(m * 100, 1, 0) : num(m * 1000, 0);
    }
    lastUnits = now;
  }

  const calc = form.dataset.calc === 'stairs' ? stairs : rafters;
  const run = () => { toggle(); calc(); };
  form.addEventListener('input', (e) => { if (e.target.id === 's-h' || e.target.id === 's-set') chosenN = null; run(); });
  form.addEventListener('change', () => { convertUnits(); run(); });
  form.addEventListener('submit', (e) => e.preventDefault());
  run();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
}
