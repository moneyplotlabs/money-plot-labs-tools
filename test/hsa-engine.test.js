/* ============================================================
   test/hsa-engine.test.js — HSA partial-transfer optimization
   ============================================================ */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../hsa-engine.js');

const close = (a, b, tol, msg) =>
    assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ≈${b}, got ${a} (tol ${tol})`);

const baseInputs = { years: 3, cAnnual: 4000, cLump: 400, r: 0.04, fee: 25 };

describe('deriveParams', () => {
    test('derives day-level constants and yearly lump days', () => {
        const p = H.deriveParams(baseInputs);
        assert.equal(p.T, 1095);
        close(p.cDay, 4000 / 365, 1e-9);
        close(p.rDay, 0.04 / 365, 1e-12);
        assert.deepEqual(p.lumpDays, [0, 365, 730]);
    });
});

describe('cumCash', () => {
    const p = H.deriveParams(baseInputs);
    test('day 0 has no accrued daily cash and no lump yet (lump on day 0 counts from day >0)', () => {
        assert.equal(H.cumCash(0, p), 0);
    });
    test('accrues the daily drip plus lumps deposited strictly before t', () => {
        // by day 1: 1 day of drip + the day-0 lump
        close(H.cumCash(1, p), p.cDay * 1 + 400, 1e-9);
        // by day 366: 366 days of drip + lumps on days 0 and 365
        close(H.cumCash(366, p), p.cDay * 366 + 800, 1e-9);
    });
    test('by the end, all three lumps and a full term of drip are counted', () => {
        close(H.cumCash(1095, p), p.cDay * 1095 + 1200, 1e-9);
    });
});

describe('valueOfSchedule', () => {
    const p = H.deriveParams(baseInputs);
    test('k=0 (single transfer at T) equals total cash minus one fee', () => {
        // No compounding: everything sits at 0% then transfers once at T.
        close(H.valueOfSchedule([], p), H.cumCash(1095, p) - 25, 1e-6);
    });
    test('matches the reference value for the known k=5 optimum', () => {
        close(H.valueOfSchedule([165, 366, 549, 731, 913], p), 13756.82, 0.01);
    });
    test('a block worth less than the fee is clamped to zero, never negative', () => {
        // A transfer on day 1 captures ~ one day of drip + the day-0 lump ($400+),
        // still above the fee; force a pathological tiny block instead:
        const tiny = H.deriveParams({ years: 1, cAnnual: 0, cLump: 0, r: 0.04, fee: 25 });
        // No contributions at all → every block is 0, clamped, never negative.
        assert.ok(H.valueOfSchedule([100, 200], tiny) >= 0);
    });
});

describe('optimize', () => {
    const p = H.deriveParams(baseInputs);

    test('reproduces the exact per-k optimal values (day resolution)', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        const expected = [13175.00, 13571.40, 13701.06, 13734.04, 13750.49, 13756.82, 13747.13, 13735.08, 13722.47];
        expected.forEach((v, k) => close(res.perK[k].value, v, 0.01, `k=${k}`));
    });

    test('finds k*=5 as the global optimum for the reference scenario', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        assert.equal(res.bestK, 5);
        close(res.bestValue, 13756.82, 0.01);
    });

    test('recovered optimal schedule re-evaluates to the reported value', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        close(H.valueOfSchedule(res.bestDays, p), res.bestValue, 1e-6);
    });

    test('schedule transfer days are strictly increasing and within (0, T)', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        const d = res.bestDays;
        for (let i = 0; i < d.length; i++) {
            assert.ok(d[i] > 0 && d[i] < p.T);
            if (i > 0) assert.ok(d[i] > d[i - 1], 'days must be strictly increasing');
        }
        assert.equal(d.length, res.bestK);
    });

    test('gain is bestValue minus the k=0 baseline, and is non-negative', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        close(res.gain, res.bestValue - res.baselineValue, 1e-9);
        assert.ok(res.gain >= 0, 'optimizing can never do worse than the single-transfer baseline');
    });

    test('value is unimodal in k: rises to the optimum then falls', () => {
        const res = H.optimize(p, { kmax: 8, step: 1 });
        const vals = res.perK.map(e => e.value);
        const peak = res.bestK;
        for (let k = 1; k <= peak; k++)        assert.ok(vals[k] >= vals[k - 1] - 1e-9, `rising up to peak at k=${k}`);
        for (let k = peak + 1; k < vals.length; k++) assert.ok(vals[k] <= vals[k - 1] + 1e-9, `falling after peak at k=${k}`);
    });

    test('a punitive fee makes the single end-of-term transfer (k=0) optimal', () => {
        const pricey = H.deriveParams({ ...baseInputs, fee: 5000 });
        const res = H.optimize(pricey, { kmax: 8, step: 1 });
        assert.equal(res.bestK, 0, 'when fees dwarf compounding, transfer once at the end');
    });

    test('a zero fee pushes the optimum toward transferring as early/often as possible', () => {
        const free = H.deriveParams({ ...baseInputs, fee: 0 });
        const res = H.optimize(free, { kmax: 8, step: 1 });
        assert.ok(res.bestK >= 5, 'with no fee, more transfers only help (capped by kmax)');
    });

    test('higher return rate raises the value of every transfer schedule', () => {
        const lo = H.optimize(H.deriveParams({ ...baseInputs, r: 0.02 }), { kmax: 6, step: 1 });
        const hi = H.optimize(H.deriveParams({ ...baseInputs, r: 0.08 }), { kmax: 6, step: 1 });
        assert.ok(hi.bestValue > lo.bestValue);
    });
});

describe('portfolioValueOverTime', () => {
    const p = H.deriveParams(baseInputs);
    test('day 0 starts at zero (no contributions accrued yet)', () => {
        assert.equal(H.portfolioValueOverTime(0, [], p), 0);
    });
    test('end-of-term value equals the schedule value (within the final clamp)', () => {
        const days = [165, 366, 549, 731, 913];
        close(H.portfolioValueOverTime(p.T, days, p), H.valueOfSchedule(days, p), 1e-6);
    });
    test('is monotonically non-decreasing over time for a fixed schedule', () => {
        const days = [165, 366, 549, 731, 913];
        let prev = -Infinity;
        for (let t = 0; t <= p.T; t += 30) {
            const v = H.portfolioValueOverTime(t, days, p);
            assert.ok(v >= prev - 1e-6, `value should not drop at day ${t}`);
            prev = v;
        }
    });
});
