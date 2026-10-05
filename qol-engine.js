/* ============================================================
   qol-engine.js — Quality-of-life (lifetime utility) scoring
   ------------------------------------------------------------
   Replaces "did the plan fail?" with "how good was the life it
   bought?". A spending path (and optional working years and
   end-of-year wealth) is scored as expected discounted lifetime
   utility:

     E[ Σ_t  β^t · S(t) · a(age_t) · u(spend_t) ]
       + Σ_t  β^(t+1) · P(die in year t) · B(wealth_t)

   where S(t) is the probability of being alive at the start of
   year t and a(age) is an age weight on enjoyment. The
   total is reported back in dollars as certainty-equivalent (CE)
   spending: the constant real annual spend, retired, with nothing
   left over, that would be just as good.

   Building blocks for the QoL offshoots of the three retirement
   tools and the later dynamic-programming optimizer. Spending is
   in real (inflation-adjusted) dollars, like the rest of the suite.

   Pure: no DOM, no Chart.js, no global state. Exposed as a browser
   global `Qol` and as a CommonJS module for unit testing in Node.
   ============================================================ */

(function (global) {
    'use strict';

    // ── Mortality ───────────────────────────────────────────────
    // One-year death probabilities q(x), ages 0–119. Ages 0–99 are the
    // CDC/NCHS 2023 US period life tables (NVSR vol. 74 no. 6, Tables 2–3):
    //   report  https://www.cdc.gov/nchs/data/nvsr/nvsr74/nvsr74-06.pdf
    //   males   https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/NVSR/74-06/Table02.xlsx
    //   females https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/NVSR/74-06/Table03.xlsx
    // The source closes with an open "100 and older" bracket, so ages
    // 100–118 extend the Gompertz hazard fitted to ages 90–99 and q(119) = 1.
    // Period life expectancy at 65: male 18.2, female 20.7.
    const MORTALITY = {
        source: 'CDC/NCHS United States Life Tables, 2023 (NVSR 74-6); ages 100+ Gompertz-extended',
        male: [
            0.00602267, 0.000481406, 0.000332318, 0.000237277, 0.000179428, 0.00016528, 0.000151382, 0.000138963, 0.000121715, 0.000101203,
            8.7208e-05, 9.68059e-05, 0.000149788, 0.000255575, 0.000397125, 0.000551307, 0.000697787, 0.000833385, 0.0009525, 0.00106079,
            0.00117532, 0.00129481, 0.00140078, 0.00148725, 0.00156004, 0.00162518, 0.00169652, 0.0017832, 0.00189005, 0.00200786,
            0.00212701, 0.00223706, 0.0023359, 0.00242282, 0.00250468, 0.00258791, 0.00267994, 0.00278432, 0.00290296, 0.00303175,
            0.00317622, 0.00332558, 0.00346403, 0.00358837, 0.00371379, 0.00386181, 0.00405162, 0.00428428, 0.00455679, 0.00485904,
            0.00518182, 0.00553519, 0.00593797, 0.00641085, 0.00696007, 0.00754856, 0.00818283, 0.00890896, 0.00972128, 0.0105813,
            0.0114568, 0.0123331, 0.0132225, 0.0141472, 0.0151318, 0.0161965, 0.0174939, 0.0186952, 0.0199853, 0.0213599,
            0.0226419, 0.0243173, 0.0261701, 0.0283282, 0.0307866, 0.0335218, 0.0360277, 0.0406073, 0.0440198, 0.0493481,
            0.054164, 0.0610404, 0.0680337, 0.0751816, 0.082862, 0.0921603, 0.103004, 0.115464, 0.129086, 0.143895,
            0.159898, 0.177078, 0.195392, 0.214769, 0.235109, 0.256283, 0.278136, 0.300487, 0.32314, 0.345888,
            0.380671, 0.410834, 0.442435, 0.475365, 0.509471, 0.544561, 0.580399, 0.616705, 0.653155, 0.689391,
            0.725021, 0.759635, 0.792817, 0.824162, 0.853293, 0.879887, 0.903689, 0.924531, 0.942347, 1
        ],
        female: [
            0.0051322, 0.000394252, 0.00023205, 0.000187165, 0.000141822, 0.00013253, 0.000119203, 0.000109978, 0.000102998, 9.82329e-05,
            9.75534e-05, 0.000104472, 0.000123052, 0.000154961, 0.000196035, 0.00024142, 0.000286047, 0.000328191, 0.000366399, 0.000402463,
            0.000442583, 0.00048554, 0.000523972, 0.000555444, 0.000583176, 0.000608617, 0.000640076, 0.000685438, 0.000748093, 0.000821307,
            0.000898406, 0.000971142, 0.00103684, 0.00109449, 0.00114939, 0.00120567, 0.00127026, 0.00134798, 0.00144105, 0.00154448,
            0.0016604, 0.00177793, 0.00188333, 0.00197251, 0.0020572, 0.00215336, 0.00227738, 0.0024329, 0.0026208, 0.00283212,
            0.0030623, 0.00330866, 0.0035717, 0.00385843, 0.00417894, 0.00451932, 0.00489728, 0.0053476, 0.00587277, 0.006443,
            0.0070337, 0.00762483, 0.00821599, 0.008816, 0.00944832, 0.0101349, 0.0109608, 0.0117819, 0.0126963, 0.0137278,
            0.0147551, 0.0160663, 0.0175239, 0.019299, 0.0213258, 0.0237117, 0.0259144, 0.029447, 0.0324196, 0.0364504,
            0.0404928, 0.0455574, 0.0510247, 0.0569036, 0.0641183, 0.0709313, 0.0802533, 0.0906141, 0.10208, 0.114707,
            0.128541, 0.143609, 0.159919, 0.177452, 0.196164, 0.215977, 0.236785, 0.258448, 0.280798, 0.303644,
            0.337245, 0.367523, 0.399618, 0.433448, 0.468885, 0.505748, 0.543799, 0.582737, 0.622203, 0.661778,
            0.700992, 0.739338, 0.776283, 0.811299, 0.843885, 0.873597, 0.900082, 0.9231, 0.942551, 1
        ]
    };
    const MAX_AGE = MORTALITY.male.length - 1;   // 119

    // One-year death probability at (integer) age. `sex` is 'male', 'female'
    // or 'unisex' (the average of the two). `mult` scales the hazard, e.g. 0.8
    // for above-average health (population tables overstate mortality for
    // wealthier retirees). Ages past the table always die.
    function qx(age, { sex = 'unisex', mult = 1 } = {}) {
        const a = Math.floor(age);
        if (a >= MAX_AGE) return 1;
        const i = Math.max(0, a);
        let q;
        if (sex === 'male') q = MORTALITY.male[i];
        else if (sex === 'female') q = MORTALITY.female[i];
        else q = (MORTALITY.male[i] + MORTALITY.female[i]) / 2;
        return Math.min(1, q * mult);
    }

    // Survival from startAge: S[t] = P(alive at start of year t | alive at
    // startAge), for t = 0..years. S[0] = 1. `mortality` = null means certain
    // survival through the horizon (the deterministic tools' assumption).
    function survivalCurve(startAge, years, mortality) {
        const S = [1];
        for (let t = 0; t < years; t++) {
            const q = mortality ? qx(startAge + t, mortality) : 0;
            S.push(S[t] * (1 - q));
        }
        return S;
    }

    // Remaining life expectancy at `age` (person-years, mid-year deaths).
    function lifeExpectancy(age, mortality = {}) {
        const S = survivalCurve(age, MAX_AGE + 1 - Math.floor(age), mortality);
        let e = 0;
        for (let t = 1; t < S.length; t++) e += (S[t - 1] + S[t]) / 2;
        return e;
    }

    // ── Age schedules ───────────────────────────────────────────
    // A value that may vary with age: either a plain number, or points
    // [{ age, value }, ...] interpolated linearly and held flat past the ends.
    function schedule(spec, age) {
        if (spec == null) return undefined;
        if (typeof spec === 'number') return spec;
        const pts = [...spec].sort((p, q) => p.age - q.age);
        if (pts.length === 0) return undefined;
        if (age <= pts[0].age) return pts[0].value;
        const last = pts[pts.length - 1];
        if (age >= last.age) return last.value;
        let i = 1;
        while (pts[i].age < age) i++;
        const lo = pts[i - 1], hi = pts[i];
        return lo.value + (hi.value - lo.value) * (age - lo.age) / (hi.age - lo.age);
    }

    // ── Utility of spending ─────────────────────────────────────
    // Check a user-drawn happiness curve [{ spend, score }, ...]. Scores are
    // interpolated linearly in log(spend), so the curve is concave in dollars
    // exactly when each segment's log-slope is ≤ the previous one's. Concavity
    // is what makes the optimizer prefer smooth spending to feast-or-famine.
    function validateCurve(points) {
        const errors = [];
        if (!Array.isArray(points) || points.length < 2) {
            return { ok: false, errors: ['need at least two points'] };
        }
        const pts = [...points].sort((p, q) => p.spend - q.spend);
        if (pts[0].spend <= 0) errors.push('spend levels must be positive');
        const slopes = [];
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].spend === pts[i - 1].spend) { errors.push(`duplicate spend level ${pts[i].spend}`); continue; }
            if (pts[i].score <= pts[i - 1].score) errors.push(`score must rise with spending (at ${pts[i].spend})`);
            slopes.push((pts[i].score - pts[i - 1].score) / Math.log(pts[i].spend / pts[i - 1].spend));
        }
        for (let i = 1; i < slopes.length; i++) {
            if (slopes[i] > slopes[i - 1] * (1 + 1e-9)) {
                errors.push(`curve bends upward at ${pts[i].spend}: each extra doubling should add no more happiness than the last`);
            }
        }
        return { ok: errors.length === 0, errors };
    }

    // Build a utility function from a spec. Returns { u, inv, invAt, base, spec, target? }:
    //   u(c, age, working)   — utility of spending c in one year
    //   inv(v, age, working) — the spending that yields utility v (u⁻¹)
    //   invAt(v, T)          — u⁻¹ against target T ('target' type; others ignore T)
    //   base(x)              — floor-free utility, used to value bequests
    //   target(age, working) — the target spending ('target' type only)
    // age / working only matter for the 'target' type, whose target can vary by
    // age and by whether that year is a working one.
    //
    // Specs:
    //   { type: 'target', target, floor = 0, lossAversion = 2.5, gainCurvature = 1, minExcess = 1000 }
    //     Happiness relative to the spending you planned. `target` is a number or a
    //     function (age, working) → dollars. With x = spend / target and f = floor / target:
    //       x ≥ 1:  u = (x^(1−η) − 1)/(1 − η)  (ln x at η = 1) — more is better, diminishing;
    //                                                         η = gainCurvature, and for η > 1
    //                                                         the upside is capped at 1/(η − 1)
    //       x < 1:  u = λ·(1 − f)·ln((x − f) / (1 − f))     — shortfalls hurt λ× as much per
    //                                                         dollar at the target, ever faster
    //                                                         toward the floor
    //     u = 0 at the target. λ (lossAversion, ≥ 1) is the kink: a dollar below target
    //     hurts λ times as much as a dollar above feels good. Below floor + minExcess the
    //     shortfall branch continues linearly (steep, finite), as for 'crra'.
    //   { type: 'crra', gamma, floor = 0, minExcess = 1000 }
    //     u(c) = (c − floor)^(1−γ) / (1−γ)   (log when γ = 1). γ is relative risk
    //     aversion: how much you dislike swings in spending (≈1–5). Spending at
    //     the floor would be infinitely bad, so below floor + minExcess u is
    //     continued linearly with the slope at that point — very steep, finite.
    //     The usual "− 1" in the numerator is dropped: rankings and CE values are
    //     unchanged and it avoids catastrophic cancellation at large γ.
    //   { type: 'curve', points: [{ spend, score }, ...] }
    //     A user-scored happiness curve (see validateCurve), linear in log(spend)
    //     and extended past both ends along the end segments. Spending below
    //     $1 is clamped to $1.
    function makeUtility(spec) {
        let U;
        if (spec.type === 'target') U = makeTarget(spec);
        else if (spec.type === 'crra') U = makeCrra(spec);
        else if (spec.type === 'curve') U = makeCurve(spec);
        else throw new Error(`unknown utility type: ${spec.type}`);
        if (!U.invAt) U.invAt = v => U.inv(v);
        return U;
    }

    function makeTarget(spec) {
        const lambda = spec.lossAversion != null ? spec.lossAversion : 2.5;
        if (!(lambda >= 1)) throw new Error('lossAversion must be ≥ 1 (otherwise shortfalls would hurt less than gains help)');
        const floor = Math.max(0, spec.floor || 0);
        const minExcess = spec.minExcess != null ? spec.minExcess : 1000;
        const eta = spec.gainCurvature != null ? spec.gainCurvature : 1;
        if (!(eta > 0)) throw new Error('gainCurvature must be > 0');
        const isLog = Math.abs(eta - 1) < 1e-9;
        const targetOf = typeof spec.target === 'function' ? spec.target : () => spec.target;
        // Floor share f (kept below the target) and where the linear tail starts (xm, as a share).
        const shape = T => {
            const f = Math.min(floor / T, 0.9);
            return { f, xm: Math.min(f + minExcess / T, (1 + f) / 2), k: lambda * (1 - f) };
        };
        const g = (x, { f, xm, k }) => {
            if (x >= 1) return isLog ? Math.log(x) : (Math.pow(x, 1 - eta) - 1) / (1 - eta);
            if (x >= xm) return k * Math.log((x - f) / (1 - f));
            return k * Math.log((xm - f) / (1 - f)) + k / (xm - f) * (x - xm);
        };
        const gInv = (v, { f, xm, k }) => {
            if (v >= 0) {
                if (isLog) return Math.exp(v);
                const b = 1 + (1 - eta) * v;
                return b > 0 ? Math.pow(b, 1 / (1 - eta)) : 1e6;   // at/above the upside cap
            }
            const vm = k * Math.log((xm - f) / (1 - f));
            if (v >= vm) return f + (1 - f) * Math.exp(v / k);
            return xm + (v - vm) * (xm - f) / k;
        };
        const tgt = (age, working) => Math.max(1, targetOf(age, working));
        const u = (c, age, working) => { const T = tgt(age, working); return g(c / T, shape(T)); };
        const invAt = (v, T) => T * gInv(v, shape(T));
        const inv = (v, age, working) => invAt(v, tgt(age, working));
        return { u, inv, invAt, target: tgt, base: x => Math.log(Math.max(x, 1)), spec };
    }

    function makeCrra(spec) {
        const gamma = spec.gamma;
        const floor = spec.floor || 0;
        const xMin = spec.minExcess != null ? spec.minExcess : 1000;
        if (!(gamma > 0)) throw new Error('gamma must be > 0');
        if (!(xMin > 0)) throw new Error('minExcess must be > 0');
        const isLog = Math.abs(gamma - 1) < 1e-9;
        const base = x => isLog ? Math.log(x) : Math.pow(x, 1 - gamma) / (1 - gamma);
        const baseInv = v => isLog ? Math.exp(v) : Math.pow(v * (1 - gamma), 1 / (1 - gamma));
        const uMin = base(xMin);
        const slopeMin = Math.pow(xMin, -gamma);     // u'(xMin)
        const u = c => {
            const x = c - floor;
            return x >= xMin ? base(x) : uMin + slopeMin * (x - xMin);
        };
        const inv = v => v >= uMin ? floor + baseInv(v) : floor + xMin + (v - uMin) / slopeMin;
        return { u, inv, base, spec };
    }

    function makeCurve(spec) {
        const check = validateCurve(spec.points);
        if (!check.ok) throw new Error('invalid happiness curve: ' + check.errors.join('; '));
        const pts = [...spec.points].sort((p, q) => p.spend - q.spend);
        const L = pts.map(p => Math.log(p.spend));
        const S = pts.map(p => p.score);
        const n = pts.length;
        // Segment k spans points k..k+1; segment 0 also covers the low tail
        // and segment n−2 the high tail.
        const seg = k => ({ k, slope: (S[k + 1] - S[k]) / (L[k + 1] - L[k]) });
        const u = c => {
            const l = Math.log(Math.max(c, 1));
            let k = 0;
            while (k < n - 2 && l > L[k + 1]) k++;
            return S[k] + seg(k).slope * (l - L[k]);
        };
        const inv = v => {
            let k = 0;
            while (k < n - 2 && v > S[k + 1]) k++;
            return Math.exp(L[k] + (v - S[k]) / seg(k).slope);
        };
        return { u, inv, base: u, spec };
    }

    // Infer γ from one gamble question: "Would you take a 50/50 chance of
    // spending `low` or `high` every year, or a certain `certain`?" — answered
    // with the certain amount that makes you indifferent. Measured relative to
    // `floor`. A certain amount at or above the gamble's average means no
    // aversion to risk (returns 0); at or below `low`, unbounded (Infinity).
    function gammaFromGamble({ low, high, certain, floor = 0 }) {
        const a = low - floor, b = high - floor, c = certain - floor;
        if (!(a > 0 && b > a)) throw new Error('need floor < low < high');
        if (c >= (a + b) / 2) return 0;
        if (c <= a) return Infinity;
        // Certainty equivalent of the gamble, scaled by b to stay in range.
        const ce = g => {
            const r = a / b;
            if (Math.abs(g - 1) < 1e-9) return b * Math.sqrt(r);
            return b * Math.pow(0.5 * Math.pow(r, 1 - g) + 0.5, 1 / (1 - g));
        };
        let lo = 0, hi = 1;
        while (ce(hi) > c && hi < 1e4) hi *= 2;   // CE falls as γ rises
        for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2;
            if (ce(mid) > c) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    // ── Preferences ─────────────────────────────────────────────
    // Starting points for the preference knobs. Each supplies utility
    // curvature (γ), time preference (β) and age weights; the spending floor
    // is personal, so the caller adds it to `utility`.
    //   ageWeight — how much a year's enjoyment counts at each age (1 = full)
    //   beta      — per-year discount on the future beyond mortality
    const PRESETS = {
        steady: {
            label: 'Steady — protect against lean years',
            utility: { type: 'crra', gamma: 4 },
            beta: 1,
            ageWeight: 1
        },
        balanced: {
            label: 'Balanced',
            utility: { type: 'crra', gamma: 2 },
            beta: 0.99,
            ageWeight: [{ age: 70, value: 1 }, { age: 90, value: 0.8 }]
        },
        frontLoaded: {
            label: 'Front-loaded — enjoy it while active',
            utility: { type: 'crra', gamma: 1.5 },
            beta: 0.97,
            ageWeight: [{ age: 65, value: 1 }, { age: 85, value: 0.6 }]
        }
    };

    // Value of wealth left at death (or at the horizon), or null if not valued.
    //   prefs.legacyValue = θ with a 'target' utility: the first dollars left are worth θ of a
    //     dollar of extra spending at the target, tapering with the same curvature η as spending
    //     above target, over a scale of L = legacyScaleYears (default 100) years of target spending:
    //       B = θ·L·G(W / (L·target)),  G(y) = ((1 + y)^(1−η) − 1)/(1 − η)  (ln(1 + y) at η = 1)
    //     so B'(0) = θ/target and a pile of y·L years' spending keeps (1 + y)^(−η) of that marginal
    //     value (at η = 2, half until about 40 years' worth) — a huge estate can't swamp the score,
    //     and for η > 1 B never exceeds θ·L/(η − 1). Spending above target stops once its next
    //     dollar is worth less than keeping it.
    //   prefs.bequest = { weight, shifter = 10000 }: B = weight·(base(shifter + W) − base(shifter)).
    function bequestFn(U, prefs) {
        if (prefs.legacyValue > 0 && U.target) {
            const eta = U.spec.gainCurvature != null ? U.spec.gainCurvature : 1;
            const G = Math.abs(eta - 1) < 1e-9 ? y => Math.log(1 + y) : y => (Math.pow(1 + y, 1 - eta) - 1) / (1 - eta);
            const L = prefs.legacyScaleYears != null ? prefs.legacyScaleYears : 100;
            return (W, age) => prefs.legacyValue * L * G(Math.max(W, 0) / (L * U.target(age, false)));
        }
        const bq = prefs.bequest;
        if (bq && bq.weight > 0) {
            const k = bq.shifter != null ? bq.shifter : 10000;
            return W => bq.weight * (U.base(k + Math.max(W, 0)) - U.base(k));
        }
        return null;
    }

    // ── Scoring ─────────────────────────────────────────────────
    // Score one path. `path` = {
    //   startAge,
    //   spend:  [c_0, c_1, …]          real spending in each year
    //   working?: [bool, …]            working years (a 'target' utility can use a different
    //                                   target for them, e.g. working-years-only expenses)
    //   wealth?:[W_0, W_1, …]          end-of-year wealth (enables the bequest term)
    // }
    // `prefs` = {
    //   utility:   utility spec (see makeUtility)
    //   beta:      time preference, default 1
    //   ageWeight: number or age schedule, default 1
    //   mortality: { sex, mult } or null for certain survival, default unisex
    //   legacyValue / bequest — value of wealth left over (see bequestFn); needs path.wealth
    // }
    // The horizon is the path length. Wealth left at the horizon is valued as a
    // bequest too; survivalAtHorizon reports how much life the path truncates.
    function lifetimeUtility(path, prefs) {
        const U = makeUtility(prefs.utility);
        const beta = prefs.beta != null ? prefs.beta : 1;
        const mortality = prefs.mortality === undefined ? {} : prefs.mortality;
        const N = path.spend.length;
        const S = survivalCurve(path.startAge, N, mortality);
        const B = path.wealth ? bequestFn(U, prefs) : null;

        let total = 0, weightSum = 0, bequestUtility = 0, targetSum = 0;
        const years = [];
        for (let t = 0; t < N; t++) {
            const age = path.startAge + t;
            const disc = Math.pow(beta, t);
            const a = schedule(prefs.ageWeight, age);
            const w = disc * S[t] * (a != null ? a : 1);
            const working = !!(path.working && path.working[t]);
            const util = U.u(path.spend[t], age, working);
            total += w * util;
            weightSum += w;
            if (U.target) targetSum += w * U.target(age, working);
            if (B) {
                // Dying during year t (or reaching the horizon) leaves end-of-year wealth.
                const pLeave = t === N - 1 ? S[t] : S[t] - S[t + 1];
                const b = disc * beta * pLeave * B(path.wealth[t], age);
                total += b;
                bequestUtility += b;
            }
            years.push({ age, survival: S[t], weight: w, spend: path.spend[t], working, utility: util });
        }
        // With a target, CE is the steady share of target that's as good, shown in dollars at
        // the (weighted) average target; refSpend reports that average.
        const refSpend = U.target && weightSum > 0 ? targetSum / weightSum : null;
        return {
            total,
            weightSum,
            refSpend,
            ce: weightSum > 0 ? U.invAt(total / weightSum, refSpend) : NaN,
            bequestUtility,
            survivalAtHorizon: S[N],
            years
        };
    }

    // Score many simulated paths (same start age and horizon) under market
    // uncertainty. `ce` comes from the *average* lifetime utility, so it
    // charges for risk via the curvature of u; `pathCE` is each path's own CE
    // (for percentile fans), sorted ascending.
    function evaluatePaths(paths, prefs) {
        if (paths.length === 0) throw new Error('no paths to evaluate');
        const U = makeUtility(prefs.utility);
        const N = paths[0].spend.length;
        let sum = 0, weightSum = 0, refSpend = null;
        const pathCE = [];
        for (const p of paths) {
            if (p.spend.length !== N || p.startAge !== paths[0].startAge) {
                throw new Error('all paths must share a start age and horizon');
            }
            const r = lifetimeUtility(p, prefs);
            sum += r.total;
            weightSum = r.weightSum;
            refSpend = r.refSpend;
            pathCE.push(r.ce);
        }
        pathCE.sort((x, y) => x - y);
        const meanTotal = sum / paths.length;
        // refSpend differs slightly across paths when the target depends on working years;
        // the last path's is used to express the mean in dollars.
        return { ce: U.invAt(meanTotal / weightSum, refSpend), meanTotal, pathCE, refSpend };
    }

    // Survival-weighted expected number of years with spending below
    // `threshold`, from a lifetimeUtility result.
    function expectedYearsBelow(result, threshold) {
        return result.years.reduce((s, y) => s + (y.spend < threshold ? y.survival : 0), 0);
    }

    // ── Optimal spending (dynamic programming) ──────────────────
    // 9-point Gauss–Hermite rule for a normal return: { values, probs } with the
    // exact mean, variance and kurtosis of N(mean, std²).
    const GH9_Z = [-4.512745863399783, -3.20542900285647, -2.07684797867783, -1.0232556637891326, 0,
                   1.0232556637891326, 2.07684797867783, 3.20542900285647, 4.512745863399783];
    const GH9_P = [2.2345844007746607e-05, 0.0027891413212317692, 0.04991640676521782, 0.24409750289493953,
                   0.40634920634920635, 0.24409750289493953, 0.04991640676521782, 0.0027891413212317692,
                   2.2345844007746607e-05];
    function normalReturns(mean, std) {
        return { values: GH9_Z.map(z => mean + std * z), probs: GH9_P.slice() };
    }

    // Equal-weight empirical distribution, e.g. the historical annual returns
    // a bootstrap samples from. Values are decimal returns (0.05 = 5%).
    function empiricalReturns(values) {
        return { values: values.slice(), probs: values.map(() => 1 / values.length) };
    }

    // Retirement spending policy that maximizes the expected lifetime utility
    // lifetimeUtility scores, by backward induction on cash on hand X (portfolio
    // plus this year's income) at each age. Each year: spend c ∈ [0, X], the rest
    // earns a random return R, then next year's income arrives:
    //   X' = (X − c)(1 + R) + income(age + 1)
    //   V_age(X) = max_c  a(age)·u(c) + β·(1 − q(age))·E[V_age+1(X')],  V_endAge+1 = 0
    // Same timing as Engine.simulateNWPath's retired years. Returns are assumed
    // independent year to year. Wealth left at death or at the horizon is valued as
    // lifetimeUtility values it with a wealth path (prefs.legacyValue / bequest; none = wasted).
    //
    // opts = {
    //   startAge, endAge — ages covered (inclusive); the policy is the same whatever
    //                      the retirement age, so one solve serves every run
    //   prefs            — as for lifetimeUtility
    //   income(age)      — passive income + windfalls arriving at that age
    //   returns          — { values, probs } (normalReturns / empiricalReturns)
    //   xMax             — top of the wealth grid (extrapolated linearly beyond)
    //   gridSize         — grid points, default 300, spaced densely near zero
    // }
    // Returns { consumption(age, X), value(age, X), grid }.
    function solveSpendingPolicy(opts) {
        const { startAge, endAge, prefs, income, returns, xMax } = opts;
        const n = opts.gridSize || 300;
        const U = makeUtility(prefs.utility);
        const beta = prefs.beta != null ? prefs.beta : 1;
        const mortality = prefs.mortality === undefined ? {} : prefs.mortality;
        const R = returns.values, P = returns.probs;
        const Bq = bequestFn(U, prefs);

        // Quadratic spacing: fine where curvature (and the floor) bites, coarse at the top.
        const grid = new Float64Array(n);
        for (let i = 0; i < n; i++) grid[i] = xMax * (i / (n - 1)) ** 2;
        const cell = x => Math.min(n - 2, Math.floor((n - 1) * Math.sqrt(x / xMax)));
        // Value functions are strongly curved, and straight lines between grid points bend the
        // timing of spending (a slow upward drift where the solution should be level). They are
        // interpolated with monotone cubic Hermite splines (PCHIP) instead: slopes(y) precomputes
        // the node slopes, interp(y, d, x) evaluates; linear extrapolation beyond xMax.
        const slopes = y => {
            const d = new Float64Array(n), del = new Float64Array(n - 1);
            for (let i = 0; i < n - 1; i++) del[i] = (y[i + 1] - y[i]) / (grid[i + 1] - grid[i]);
            d[0] = del[0]; d[n - 1] = del[n - 2];
            for (let i = 1; i < n - 1; i++) {
                if (del[i - 1] * del[i] <= 0) { d[i] = 0; continue; }
                const h0 = grid[i] - grid[i - 1], h1 = grid[i + 1] - grid[i];
                const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
                d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]);
            }
            return d;
        };
        const interp = (y, d, x) => {
            if (x <= 0) return y[0];
            if (x >= xMax) return y[n - 1] + d[n - 1] * (x - xMax);
            const i = cell(x), h = grid[i + 1] - grid[i], t = (x - grid[i]) / h, t2 = t * t, t3 = t2 * t;
            return y[i] * (2 * t3 - 3 * t2 + 1) + h * d[i] * (t3 - 2 * t2 + t)
                 + y[i + 1] * (3 * t2 - 2 * t3) + h * d[i + 1] * (t3 - t2);
        };
        // The stored policy is interpolated linearly (it is close to linear in wealth).
        const interpLinear = (arr, x) => {
            if (x <= 0) return arr[0];
            if (x >= xMax) return arr[n - 1] + (arr[n - 1] - arr[n - 2]) / (grid[n - 1] - grid[n - 2]) * (x - xMax);
            const i = cell(x);
            return arr[i] + (arr[i + 1] - arr[i]) * (x - grid[i]) / (grid[i + 1] - grid[i]);
        };

        const years = endAge - startAge + 1;
        const V = new Array(years), C = new Array(years);
        let next = null, nextD = null;   // V at age + 1 and its spline slopes
        const EV = new Float64Array(n), EB = new Float64Array(n);
        let EVd = null, EBd = null;
        for (let y = years - 1; y >= 0; y--) {
            const age = startAge + y;
            const a = schedule(prefs.ageWeight, age);
            const w = a != null ? a : 1;
            const surv = 1 - (mortality ? qx(age, mortality) : 0);
            const cont = next ? beta * surv : 0;
            const leave = Bq ? beta * (next ? 1 - surv : 1) : 0;   // weight on leaving next year's wealth
            if (leave > 0) {
                for (let j = 0; j < n; j++) {
                    let e = 0;
                    for (let r = 0; r < R.length; r++) e += P[r] * Bq(grid[j] * (1 + R[r]), age);
                    EB[j] = e;
                }
                EBd = slopes(EB);
            }
            const v = new Float64Array(n), c = new Float64Array(n);
            if (cont > 0) {
                // Expected continuation value of saving s = grid[j].
                const inc = income(age + 1);
                for (let j = 0; j < n; j++) {
                    let e = 0;
                    for (let r = 0; r < R.length; r++) e += P[r] * interp(next, nextD, grid[j] * (1 + R[r]) + inc);
                    EV[j] = e;
                }
                EVd = slopes(EV);
            }
            const obj = (x, s) => w * U.u(x - s, age, false) + (cont > 0 ? cont * interp(EV, EVd, s) : 0)
                                                             + (leave > 0 ? leave * interp(EB, EBd, s) : 0);
            for (let i = 0; i < n; i++) {
                const x = grid[i];
                let s = 0;
                if ((cont > 0 || leave > 0) && i > 0) {
                    // Coarse search over savings on the grid, then golden-section refinement.
                    let best = -Infinity, bj = 0;
                    for (let j = 0; j <= i; j++) {
                        const f = w * U.u(x - grid[j], age, false) + (cont > 0 ? cont * EV[j] : 0) + (leave > 0 ? leave * EB[j] : 0);
                        if (f > best) { best = f; bj = j; }
                    }
                    let lo = grid[Math.max(0, bj - 1)], hi = grid[Math.min(i, bj + 1)];
                    const g = (Math.sqrt(5) - 1) / 2;
                    let m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
                    let f1 = obj(x, m1), f2 = obj(x, m2);
                    for (let k = 0; k < 40 && hi - lo > 1e-6 * (1 + x); k++) {
                        if (f1 < f2) { lo = m1; m1 = m2; f1 = f2; m2 = lo + g * (hi - lo); f2 = obj(x, m2); }
                        else         { hi = m2; m2 = m1; f2 = f1; m1 = hi - g * (hi - lo); f1 = obj(x, m1); }
                    }
                    s = (lo + hi) / 2;
                    if (obj(x, s) < best) s = grid[bj];
                }
                c[i] = x - s;
                v[i] = obj(x, s);
            }
            V[y] = v; C[y] = c;
            next = v; nextD = slopes(v);
        }

        const idx = age => Math.max(0, Math.min(years - 1, Math.floor(age) - startAge));
        return {
            consumption: (age, x) => Math.max(0, Math.min(Math.max(0, x), interpLinear(C[idx(age)], x))),
            value: (age, x) => interpLinear(V[idx(age)], x),
            grid
        };
    }

    const Qol = {
        MORTALITY, PRESETS,
        qx, survivalCurve, lifeExpectancy, schedule,
        validateCurve, makeUtility, gammaFromGamble,
        lifetimeUtility, evaluatePaths, expectedYearsBelow,
        normalReturns, empiricalReturns, solveSpendingPolicy
    };

    global.Qol = Qol;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Qol;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
