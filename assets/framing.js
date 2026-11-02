// The website's stair and rafter maths: a line-by-line port of the parts of packages/framing_core
// the two free calculators use (stair/straight.dart B.1–B.5, pitch.dart C.1, roof/rafter.dart
// C.2–C.5, roof/solver.dart, rules/rule.dart + rules/check.dart for straight stairs). SI inside
// (metres, radians), like the engine. tools/site/calc.test.mjs checks every function against
// research/test-vectors.json and against tools/site/engine-samples.json, which the real Dart engine
// writes (tools/site/engine-sample/run.sh); a difference over 1e-9 or a different rule status fails.
// Pattern from Boxwright tools/site/static/boxcalc.js (studio §12). No network, no storage.

export const IN = 0.0254;
const GUARD = 1e-12; // straight.dart riserCountGuard
const SNAP = 1e-9; // rule.dart snapTolerance
export const ROOF_TOLERANCE = 0.001; // solver.dart roofTolerance
export const THROAT_PRACTICE = 5 * IN; // straight.dart stringerThroatPractice (AWC DCA 6, practice)

const ok = (value) => ({ value, issue: null });
const bad = (issue, field) => ({ value: null, issue, field });
const pos = (x) => Number.isFinite(x) && x > 0;

// ---- straight stairs (B.1–B.5) ------------------------------------------------------------------

/** n_min = ⌈H / R_max⌉ with the guard (B.1). */
export function riserCountMin(H, rMax) {
  if (!pos(H) || !pos(rMax)) return bad('invalid');
  const x = H / rMax;
  if (x > 10000) return bad('outOfRange', 'totalRise');
  return ok(Math.ceil(x * (1 - GUARD)));
}
/** n_max = ⌊H / R_min⌋ with the guard (B.1). */
export function riserCountMax(H, rMin) {
  if (!pos(H) || !pos(rMin)) return bad('invalid');
  const x = H / rMin;
  if (x > 10000) return bad('outOfRange', 'totalRise');
  return ok(Math.floor(x * (1 + GUARD)));
}
/** R = H / n (B.1). */
export function unitRise(H, n) {
  if (!pos(H)) return bad('invalid', 'totalRise');
  if (!(n >= 1)) return bad('invalid', 'risers');
  return ok(H / n);
}
/** G = target − 2R (B.2); none when nothing is left. */
export function goingFromStepRule(R, target) {
  if (!pos(R) || !pos(target)) return bad('invalid');
  const g = target - 2 * R;
  return g > 0 ? ok(g) : bad('noSolution', 'target');
}
/** (n − 1)·G, the upper floor being the top step (B.2). */
export function totalRun(n, G) {
  if (!pos(G)) return bad('invalid', 'going');
  if (!(n >= 1)) return bad('invalid', 'risers');
  return ok((n - 1) * G);
}
export const stairAngle = (R, G) => (pos(R) && pos(G) ? ok(Math.atan2(R, G)) : bad('invalid'));
export const stepLength = (R, G) => (pos(R) && pos(G) ? ok(2 * R + G) : bad('invalid'));
export const diagonalIncrement = (R, G) => (pos(R) && pos(G) ? ok(Math.hypot(R, G)) : bad('invalid'));
/** Bottom nosing to top nosing along the stringer: (n − 1)·d (B.4). */
export function nosingLineLength(n, R, G) {
  const d = diagonalIncrement(R, G);
  if (d.value == null) return d;
  if (!(n >= 1)) return bad('invalid', 'risers');
  return ok((n - 1) * d.value);
}
/** √(H² + run²), what most tools call "stringer length" (B.4). */
export const stringerHypotenuse = (H, run) => (pos(H) && pos(run) ? ok(Math.hypot(H, run)) : bad('invalid'));
/** Throat = D − R·G/d (B.5); warns under 5 in (practice, not code). */
export function throat(D, R, G) {
  if (!pos(D)) return bad('invalid', 'boardDepth');
  const d = diagonalIncrement(R, G);
  if (d.value == null) return d;
  const notch = (R * G) / d.value;
  const t = D - notch;
  if (t <= 0) return bad('noSolution', 'boardDepth');
  return { value: { notchDepth: notch, throat: t }, issue: null, warn: t < THROAT_PRACTICE };
}

// ---- pitch (C.1) --------------------------------------------------------------------------------

function pitchOf(radians) {
  const tan = Math.tan(radians);
  return { radians, tan, risePer12: 12 * tan, degrees: (radians * 180) / Math.PI, percent: tan * 100, slopeFactor: 1 / Math.cos(radians) };
}
const fromTan = (x, scale) => (Number.isFinite(x) && x >= 0 ? ok(pitchOf(Math.atan(x / scale))) : bad('invalid'));
export const pitchFromRisePer12 = (r) => fromTan(r, 12);
export const pitchFromPercent = (p) => fromTan(p, 100);
export function pitchFromDegrees(deg) {
  if (!Number.isFinite(deg) || deg < 0 || deg >= 90) return bad('invalid', 'degrees');
  return ok(pitchOf((deg * Math.PI) / 180));
}
export function pitchFromRiseRun(rise, run) {
  if (!pos(run)) return bad('invalid', 'run');
  return fromTan((rise / run) * 12, 12);
}

// ---- common rafter (C.2–C.5) --------------------------------------------------------------------

const r12 = (r, f) => {
  const p = pitchFromRisePer12(r);
  return p.value ? ok(f(p.value.slopeFactor)) : p;
};
export const commonFactor = (r) => r12(r, (k) => k);
export const commonUnitLength = (r) => r12(r, (k) => 12 * k);
export const commonLength = (run, r) => (pos(run) ? r12(r, (k) => run * k) : bad('invalid', 'run'));
export const overhangLength = (oh, r) => (Number.isFinite(oh) && oh >= 0 ? r12(r, (k) => oh * k) : bad('invalid', 'overhang'));

// ---- rule checks (rules/rule.dart, rules/check.dart) --------------------------------------------

const UNIT = {
  inch: [(si) => si / IN, (v) => v * IN],
  millimetre: [(si) => si * 1000, (v) => v / 1000],
  centimetre: [(si) => si * 100, (v) => v / 100],
  metre: [(si) => si, (v) => v],
  degree: [(si) => (si * 180) / Math.PI, (v) => (v * Math.PI) / 180],
  count: [(si) => si, (v) => v],
  ratio: [(si) => si, (v) => v],
};
export const fromSi = (unit, si) => UNIT[unit][0](si);
export const toSi = (unit, v) => UNIT[unit][1](v);

/** Rule.check: the value in the rule's own unit, snapped onto the limit within 1e-9. */
export function checkValue(rule, valueSi, width) {
  const lim = rule.limitCappedByWidth && width != null ? Math.min(rule.limit, fromSi(rule.unit, width)) : rule.limit;
  const v = fromSi(rule.unit, valueSi);
  const x = Math.abs(v - lim) <= SNAP * Math.max(1, Math.abs(lim)) ? lim : v;
  const pass = rule.bound === 'min' ? x >= lim : x <= lim;
  return { id: rule.id, rule, limit: lim, value: v, status: pass ? 'withinLimits' : 'outsideLimits' };
}
const skipped = (rule, status) => ({ id: rule.id, rule, limit: rule.limit, value: null, status });

/** The values a rule compares for one straight flight (check.dart _values with no tapered treads):
 *  null = not checked (unknown), [] = does not apply. */
function valuesOf(rule, m) {
  const g = m.going;
  const straight = rule.scope !== 'tapered' && g != null;
  const both = (f) => (straight ? [f(g)] : []);
  switch (rule.quantity) {
    case 'riser': return [m.riser];
    case 'going': return both((d) => d);
    case 'treadSurface': return both((d) => d + m.nosing);
    case 'stepLength': return both((d) => 2 * m.riser + d);
    case 'nosing': return g != null ? [m.nosing] : [];
    case 'pitch': return straight ? [Math.atan2(m.riser, g)] : [];
    case 'uniformity': return [m.uniformity ?? 0];
    case 'headroom': return m.headroom == null ? null : [m.headroom];
    case 'width': return m.width == null ? null : [m.width];
    case 'totalRise': return m.totalRise == null ? null : [m.totalRise];
    case 'flightRise': return m.flightRises ?? [];
    case 'risersPerFlight': return m.risersPerFlight ?? [];
    case 'landingDepth': return [];
    case 'winders': return [0];
    default: return []; // tapered, winder and roof quantities never apply to a straight flight
  }
}

/** checkRule for a straight flight. */
export function checkRule(rule, m) {
  if (!rule.kinds.includes('straight')) return skipped(rule, 'notApplicable');
  if (rule.whenGoingBelow != null && m.going != null && fromSi(rule.unit, m.going) >= rule.whenGoingBelow) return skipped(rule, 'notApplicable');
  const values = valuesOf(rule, m);
  if (values == null) return skipped(rule, 'notChecked');
  if (!values.length) return skipped(rule, 'notApplicable');
  const v = rule.bound === 'min' ? Math.min(...values) : Math.max(...values);
  return checkValue(rule, v, m.width);
}
export const checkStraight = (set, m) => set.rules.map((r) => checkRule(r, m));

/** RuleSet.limit for a straight flight: the tightest SI limit (largest floor, lowest ceiling). */
export function limitOf(set, quantity, bound) {
  let best = null;
  for (const r of set.rules) {
    if (r.quantity !== quantity || r.bound !== bound || !r.kinds.includes('straight') || r.limitCappedByWidth || r.whenGoingBelow != null || r.scope === 'tapered') continue;
    const v = toSi(r.unit, r.limit);
    if (best == null || (bound === 'min' ? v > best : v < best)) best = v;
  }
  return best;
}

/** By how much a failed rule misses, in its own unit (RuleCheck.shortfall). */
export const shortfall = (c) => (c.status !== 'outsideLimits' ? 0 : c.rule.bound === 'min' ? c.limit - c.value : c.value - c.limit);

/** The website's straight stair: the riser count nearest the rule set's comfort riser that stays
 *  under its riser ceiling (or the one the user gives), the going from the set's comfort step
 *  (2R + G) kept inside its going limits (or the one the user gives), and every straight-flight
 *  rule of the set. The app's fit search goes further: it also tries turns and checks headroom
 *  against the opening (fit.dart). */
export function straightStair(set, { H, n = null, G = null, width = null, nosing = null } = {}) {
  if (!pos(H)) return bad('invalid', 'totalRise');
  const rMax = limitOf(set, 'riser', 'max');
  const nMin = rMax ? riserCountMin(H, rMax).value : 1;
  const risers = n ?? Math.max(nMin ?? 1, Math.round(H / set.comfortRiser), 1);
  const R = unitRise(H, risers);
  if (R.value == null) return R;
  let going = G;
  if (going == null) {
    going = goingFromStepRule(R.value, set.comfortStep).value ?? limitOf(set, 'going', 'min') ?? 0.25;
    const gMin = limitOf(set, 'going', 'min');
    const gMax = limitOf(set, 'going', 'max');
    if (gMin != null && going < gMin) going = gMin;
    if (gMax != null && going > gMax) going = gMax;
  }
  if (!pos(going)) return bad('invalid', 'going');
  const nos = nosing ?? set.defaultNosing ?? 0;
  const m = { riser: R.value, going, nosing: nos, width, totalRise: H, flightRises: [H], risersPerFlight: [risers], uniformity: 0 };
  const run = totalRun(risers, going).value;
  return ok({
    risers,
    treads: risers - 1,
    riser: R.value,
    going,
    nosing: nos,
    run,
    angle: stairAngle(R.value, going).value,
    step: stepLength(R.value, going).value,
    nosingLine: nosingLineLength(risers, R.value, going).value,
    hypotenuse: run > 0 ? stringerHypotenuse(H, run).value : null,
    options: [risers - 1, risers, risers + 1].filter((k) => k >= 1).map((k) => ({ risers: k, riser: H / k })),
    checks: checkStraight(set, m),
  });
}

// ---- roof solver (roof/solver.dart, the common-rafter triangle) ---------------------------------

/** Any two of run or span, rise, slope (tan of the pitch) and length give the rest; given values
 *  that disagree beyond ROOF_TOLERANCE are reported, never overwritten. */
export function solveRoof(given, tol = ROOF_TOLERANCE) {
  const vals = {};
  const inputs = new Set();
  for (const k of ['run', 'span', 'rise', 'slope', 'length']) {
    const v = given[k];
    if (v == null) continue;
    if (!Number.isFinite(v)) return bad('invalid', k);
    if ((k === 'run' || k === 'span' || k === 'length') && !(v > 0)) return bad('invalid', k);
    if ((k === 'rise' || k === 'slope') && v < 0) return bad('invalid', k);
    vals[k] = { value: v, derived: null };
    inputs.add(k);
  }
  const v = (k) => vals[k]?.value;
  const has = (k) => k in vals;
  const set = (k, x, by) => { if (has(k)) return false; vals[k] = { value: x, derived: by }; return true; };
  for (let changed = true; changed;) {
    changed = false;
    const run = v('run'), span = v('span'), rise = v('rise'), t = v('slope'), len = v('length');
    if (run == null && span != null) changed = set('run', span / 2, 'span') || changed;
    if (span == null && run != null) changed = set('span', 2 * run, 'span') || changed;
    if (t === 0 && rise != null && rise > tol) return bad('noSolution', 'rise');
    if (run != null && t != null) {
      changed = set('rise', run * t, 'rise') || changed;
      changed = set('length', run * Math.sqrt(1 + t * t), 'length') || changed;
    }
    if (run == null && t != null && t > 0 && rise != null) changed = set('run', rise / t, 'rise') || changed;
    if (run == null && t != null && len != null) changed = set('run', len / Math.sqrt(1 + t * t), 'length') || changed;
    if (t == null && run != null && rise != null) changed = set('slope', rise / run, 'rise') || changed;
    if (rise == null && t == null && run != null && len != null) {
      if (len < run * (1 - 1e-12)) return bad('noSolution', 'length');
      changed = set('rise', Math.sqrt(Math.max(0, len * len - run * run)), 'length') || changed;
    }
    if (run == null && t == null && rise != null && len != null) {
      if (len <= rise) return bad('noSolution', 'length');
      changed = set('run', Math.sqrt(len * len - rise * rise), 'length') || changed;
    }
  }
  const conflicts = [];
  const check = (relation, vars, gap) => {
    if (!vars.every(has)) return;
    const ins = vars.filter((x) => inputs.has(x));
    if (ins.length < 2) return;
    const g = Math.abs(gap());
    if (g > tol) conflicts.push({ relation, inputs: ins, gap: g });
  };
  check('span', ['span', 'run'], () => v('span') - 2 * v('run'));
  check('rise', ['rise', 'run', 'slope'], () => v('rise') - v('run') * v('slope'));
  check('length', ['length', 'run', 'rise'], () => v('length') - Math.hypot(v('run'), v('rise')));
  const complete = ['run', 'rise', 'slope', 'length'].every(has);
  return ok({ values: vals, conflicts, complete });
}

// ---- birdsmouth (roof/rafter.dart C.4) ----------------------------------------------------------

/** IRC 2021 roof rules plus the one-third rule of thumb (labelled), rafter.dart roofRules. */
export function roofRules(bearing) {
  const r = (id, quantity, bound, limit, unit, clause, thumb = false) => ({
    id, quantity, bound, limit, unit, clause, kinds: [], scope: 'both', whenGoingBelow: null, limitCappedByWidth: false,
    jurisdiction: thumb ? 'rule-of-thumb' : 'US-IRC', edition: thumb ? '-' : '2021', confidence: thumb ? 'practice' : 'primary',
  });
  return [
    r('notch.end.max', 'notchFraction', 'max', 0.25, 'ratio', 'R802.7.1, R502.8.1'),
    bearing === 'masonry' ? r('bearing.masonry.min', 'bearing', 'min', 3, 'inch', 'R802.6') : r('bearing.wood.min', 'bearing', 'min', 1.5, 'inch', 'R802.6'),
    r('tail.remainingDepth.min', 'tailRemainingDepth', 'min', 3.5, 'inch', 'R802.7.1.1'),
    r('tail.cantilever.max', 'tailCantilever', 'max', 24, 'inch', 'R802.7.1.1'),
    r('notch.oneThird', 'notchFraction', 'max', 1 / 3, 'ratio', 'rule of thumb', true),
  ];
}

/** Birdsmouth for rafter depth D, seat length (usually the plate width), at x-in-12. */
export function birdsmouth(D, seat, risePer12, { overhangRun = 0, bearing = 'woodOrMetal' } = {}) {
  const p = pitchFromRisePer12(risePer12);
  if (!p.value) return p;
  if (!pos(D)) return bad('invalid', 'rafterDepth');
  if (!pos(seat)) return bad('invalid', 'seat');
  if (!(Number.isFinite(overhangRun) && overhangRun >= 0)) return bad('invalid', 'overhang');
  const th = p.value.radians;
  const heel = seat * Math.tan(th);
  const perp = seat * Math.sin(th);
  const plumb = D / Math.cos(th);
  const hap = plumb - heel;
  if (!(Number.isFinite(hap) && Number.isFinite(plumb))) return bad('outOfRange', 'result');
  if (hap <= 0) return bad('noSolution', 'seat');
  const frac = perp / D;
  const checks = roofRules(bearing).map((r) => {
    switch (r.quantity) {
      case 'notchFraction': return checkValue(r, frac);
      case 'bearing': return checkValue(r, seat);
      case 'tailRemainingDepth': return overhangRun > 0 ? checkValue(r, D - perp) : skipped(r, 'notApplicable');
      default: return overhangRun > 0 ? checkValue(r, overhangRun) : skipped(r, 'notApplicable');
    }
  });
  return ok({ heel, notch: perp, hap, plumb, fraction: frac, maxSeat: th === 0 ? Infinity : D / 4 / Math.sin(th), checks });
}

// ---- numbers people type ---------------------------------------------------------------------

/** Feet, inches and fractions as people write them: 9' 0 3/4", 9'-0¾, 108.75, 108 3/4, 7½, 3/4.
 *  Returns inches, or NaN. A comma is a decimal mark when the page's language uses one. */
export function parseFeetInches(text, decimal = '.') {
  let s = String(text).trim().toLowerCase().replace(/[″”"]|in(ches)?\b/g, ' ').replace(/[′’']|ft|feet/g, "'");
  if (decimal === ',') s = s.replace(/(\d),(\d)/g, '$1.$2');
  const glyph = { '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8' };
  s = s.replace(/[¼½¾⅛⅜⅝⅞]/g, (c) => glyph[c]).replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return NaN;
  let feet = 0;
  const f = /^(\d+(?:\.\d+)?)\s*'\s*(.*)$/.exec(s);
  if (f) { feet = Number(f[1]); s = f[2].trim(); }
  if (!s) return feet * 12;
  const m = /^(?:(\d+(?:\.\d+)?)\s+)?(?:(\d+)\/(\d+))$/.exec(s) || /^(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return NaN;
  if (m.length === 2) return feet * 12 + Number(m[1]);
  const whole = m[1] ? Number(m[1]) : 0;
  const den = Number(m[3]);
  if (!den) return NaN;
  return feet * 12 + whole + Number(m[2]) / den;
}

/** Tape-measure text to the nearest 1/16 in: 9′ 0 ¾″, 7 ¼″, 10 ⁵⁄₁₆″ (ascii: 9' 0 3/4" for an input). */
export function formatFeetInches(inches, { feet = true, sixteenths = 16, ascii = false } = {}) {
  if (!Number.isFinite(inches)) return '';
  const neg = inches < 0;
  let t = Math.round(Math.abs(inches) * sixteenths);
  let ft = feet ? Math.floor(t / (12 * sixteenths)) : 0;
  t -= ft * 12 * sixteenths;
  let whole = Math.floor(t / sixteenths);
  let num = t - whole * sixteenths;
  let den = sixteenths;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? (ascii ? `${num}/${den}` : fraction(num, den)) : '';
  const inch = `${!ft && !whole && frac ? '' : whole}${frac ? `${!ft && !whole ? '' : ' '}${frac}` : ''}${ascii ? '"' : '″'}`;
  return `${neg ? (ascii ? '-' : '−') : ''}${ft ? `${ft}${ascii ? "'" : '′'} ${inch}` : inch}`;
}
const VULGAR = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';
function fraction(n, d) {
  const k = `${n}/${d}`;
  if (VULGAR[k]) return VULGAR[k];
  return `${String(n).replace(/\d/g, (x) => SUP[x])}⁄${String(d).replace(/\d/g, (x) => SUB[x])}`;
}
