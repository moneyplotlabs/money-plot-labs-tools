/* ============================================================
   test/engine.test.js — financial simulation math
   ------------------------------------------------------------
   Tests are organized by tool and, where possible, assert
   implementation-independent PROPERTIES drawn from the
   whitepapers (a solver's defining condition, a conservation
   law, a limiting case) rather than magic numbers copied out
   of the implementation.
   ============================================================ */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const { withSeededRandom, meanStd, singleMilestone } = require('./helpers.js');

const close = (a, b, tol, msg) =>
    assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ≈${b}, got ${a} (tol ${tol})`);

// ============================================================
//  Tool 1 — macroTimeline (Whitepaper 001)
// ============================================================
describe('macroTimeline — deterministic closed-form solver', () => {

    test('solver property: at the computed working-years, terminal balance meets the floor', () => {
        // Interior case (must work some-but-not-all of the horizon), floor = 0.
        const r = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03, { floor: 0 });
        assert.ok(r.workingYears > 0 && r.workingYears < 70, 'should be an interior solution');
        const terminal = r.depletionData[r.depletionData.length - 1].y;
        // The floor is enforced as a display clamp, so the *defining* check is that the
        // unclamped run lands the terminal essentially on the floor.
        close(terminal, 0, 1, 'terminal balance should sit on the floor');
    });

    test('linear baseline (r = 0): accumulation is purely additive', () => {
        // With r = 0 and no events, balance after i full working years = a0 + s*i.
        const a0 = 10000, s = 15000;
        const r = E.macroTimeline(25, 95, a0, s, 45000, 0, 0, { floor: 0 });
        // accumulationData records balance at the START of each working year.
        assert.equal(r.accumulationData[0].y, a0);
        assert.equal(r.accumulationData[1].y, a0 + s);
        assert.equal(r.accumulationData[2].y, a0 + 2 * s);
    });

    test('monotonicity: higher savings ⇒ fewer working years', () => {
        const base = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03, { floor: 0 });
        const more = E.macroTimeline(25, 95, 0, 25000, 45000, 0.03, 0.03, { floor: 0 });
        assert.ok(more.workingYears < base.workingYears,
            `saving more should shorten the career (${more.workingYears} < ${base.workingYears})`);
    });

    test('monotonicity: higher growth rate ⇒ fewer working years', () => {
        const lo = E.macroTimeline(25, 95, 0, 15000, 45000, 0.02, 0.02, { floor: 0 });
        const hi = E.macroTimeline(25, 95, 0, 15000, 45000, 0.06, 0.06, { floor: 0 });
        assert.ok(hi.workingYears < lo.workingYears,
            `higher returns should shorten the career (${hi.workingYears} < ${lo.workingYears})`);
    });

    test('a windfall shortens the required career', () => {
        const without = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03, { floor: 0 });
        const withWf  = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03,
            { floor: 0, windfall: [{ age: 30, amt: 200000 }] });
        assert.ok(withWf.workingYears < without.workingYears, 'windfall should reduce working years');
    });

    test('passive (Social Security) income shortens the required career', () => {
        const without = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03, { floor: 0 });
        const withSs  = E.macroTimeline(25, 95, 0, 15000, 45000, 0.03, 0.03,
            { floor: 0, ss: [{ age: 67, amt: 30000 }] });
        assert.ok(withSs.workingYears < without.workingYears, 'SS income should reduce working years');
    });

    test('already-funded scenario returns zero working years', () => {
        // Huge starting balance, modest spending → never needs to work.
        const r = E.macroTimeline(25, 95, 5_000_000, 15000, 45000, 0.03, 0.03, { floor: 0 });
        assert.equal(r.workingYears, 0);
    });

    test('unreachable goal caps working years at the full horizon', () => {
        // Spending dwarfs savings and growth; floor can never be met.
        const r = E.macroTimeline(25, 95, 0, 1000, 200000, 0.0, 0.0, { floor: 1_000_000 });
        assert.equal(r.workingYears, 70); // stopAge - currentAge
        // Accumulation runs the full horizon: one node per working year, last at age 94.
        assert.equal(r.accumulationData.length, 70);
        assert.equal(r.accumulationData[r.accumulationData.length - 1].x, 94);
        // The terminal node is clamped to the (unreachable) floor.
        const terminal = r.depletionData[r.depletionData.length - 1];
        assert.equal(terminal.x, 96); // currentAge + horizon + 1
        assert.equal(terminal.y, 1_000_000);
    });

    test('degenerate horizon (stopAge ≤ currentAge) is handled gracefully', () => {
        const r = E.macroTimeline(60, 60, 100000, 15000, 45000, 0.03, 0.03, { floor: 0 });
        assert.equal(r.workingYears, 0);
        assert.equal(r.peakNetWorth, 100000);
    });
});

// ============================================================
//  Tool 2 — simulateLife (year-by-year deterministic)
// ============================================================
describe('simulateLife — year-by-year deterministic path', () => {

    test('is a pure function: identical inputs ⇒ identical outputs', () => {
        const ctx = singleMilestone();
        const a = E.simulateLife(25, 95, 50000, 0.05, 0.04, 60, 95, ctx);
        const b = E.simulateLife(25, 95, 50000, 0.05, 0.04, 60, 95, ctx);
        assert.deepEqual(a, b);
    });

    test('r = 0 accumulation: each working year adds exactly the savings amount', () => {
        const ctx = singleMilestone({ savings: 20000, income: 80000, spending: 60000 });
        const res = E.simulateLife(25, 95, 0, 0, 0, 60, 95, ctx);
        // nwData[i] is balance at start of age 25+i during the working phase.
        assert.equal(res.nwData[0].y, 0);
        assert.equal(res.nwData[1].y, 20000);
        assert.equal(res.nwData[5].y, 100000);
    });

    test('r = 0 retirement: each retired year subtracts net spending', () => {
        // Retire immediately (rAge = startAge), no passive income → balance falls by spending/yr.
        const ctx = singleMilestone({ spending: 40000 });
        const res = E.simulateLife(25, 95, 500000, 0, 0, 25, 95, ctx);
        assert.equal(res.nwData[0].y, 500000);
        assert.equal(res.nwData[1].y, 460000);
        assert.equal(res.nwData[2].y, 420000);
    });

    test('peakNw is the maximum balance reached over the path', () => {
        const ctx = singleMilestone({ savings: 30000, spending: 50000 });
        const res = E.simulateLife(25, 95, 0, 0.05, 0.04, 60, 95, ctx);
        const maxSeen = Math.max(...res.nwData.filter(d => d.y !== null).map(d => d.y));
        // peak should be at least the largest node we can see (mid-year peaks may exceed nodes).
        assert.ok(res.peakNw >= maxSeen - 1e-6, 'peakNw should dominate visible nodes');
    });
});

// ============================================================
//  Tool 3 — simulateNWPath (Whitepaper 003, stochastic kernel)
// ============================================================
describe('simulateNWPath — stochastic single-realization kernel', () => {

    const ctx = singleMilestone({ income: 80000, savings: 20000, spending: 60000 });
    const zeros = Array(80).fill(0);

    test('r = 0 returns ⇒ growth is exactly zero every year', () => {
        const res = E.simulateNWPath(25, 95, 100000, 60, 0, 'age', zeros, zeros, ctx);
        for (const g of res.growthByAge) close(g, 0, 1e-6, 'growth with zero return');
    });

    test('age mode: resolvedRAge equals the supplied retirement age', () => {
        const res = E.simulateNWPath(25, 95, 0, 62, 0, 'age', zeros, zeros, ctx);
        assert.equal(res.resolvedRAge, 62);
    });

    test('nw mode: resolvedRAge is the first age the target is crossed', () => {
        // r = 0, save 20k/yr from 0 → crosses 100k between age 30 and 31 (i.e. resolved in [30,31)).
        const res = E.simulateNWPath(25, 95, 0, 0, 100000, 'nw', zeros, zeros, ctx);
        assert.ok(res.resolvedRAge >= 30 && res.resolvedRAge < 31,
            `crossing should land in [30,31), got ${res.resolvedRAge}`);
    });

    test('nw mode: a higher target pushes the crossing later', () => {
        const lo = E.simulateNWPath(25, 95, 0, 0, 100000, 'nw', zeros, zeros, ctx);
        const hi = E.simulateNWPath(25, 95, 0, 0, 300000, 'nw', zeros, zeros, ctx);
        assert.ok(hi.resolvedRAge > lo.resolvedRAge, 'bigger nest-egg target ⇒ work longer');
    });

    test('nwByAge has one more entry than the horizon (terminal balance appended)', () => {
        const res = E.simulateNWPath(25, 95, 0, 60, 0, 'age', zeros, zeros, ctx);
        assert.equal(res.nwByAge.length, (95 - 25) + 2);
    });
});

// ============================================================
//  Convergence to determinism (Whitepaper 003, σ → 0 limit)
// ============================================================
describe('σ → 0 limit: a zero-volatility Monte Carlo collapses to one path', () => {

    test('1,000 manual runs with std = 0 are all identical', () => {
        const ctx = singleMilestone();
        const horizon = 95 - 25;
        const runs = withSeededRandom(123, () =>
            Array.from({ length: 1000 }, () => ({
                retAcc: E.getReturnSeries('manual', 6, 0, horizon + 1),
                retDec: E.getReturnSeries('manual', 4, 0, horizon + 1),
            }))
        );
        const finals = runs.map(({ retAcc, retDec }) =>
            E.simulateNWPath(25, 95, 0, 60, 0, 'age', retAcc, retDec, ctx).finalBalance);
        const spread = Math.max(...finals) - Math.min(...finals);
        close(spread, 0, 1e-6, 'zero-volatility outcomes should have zero spread');
    });

    test('std = 0 manual return equals the deterministic constant mean', () => {
        const s = withSeededRandom(7, () => E.getReturnSeries('manual', 5, 0, 50));
        for (const v of s) close(v, 0.05, 1e-12, 'manual std=0');
    });
});

// ============================================================
//  Return-series generation
// ============================================================
describe('getReturnSeries', () => {

    test('produces the requested number of values', () => {
        for (const method of ['manual', 'equities', '6040']) {
            const s = withSeededRandom(1, () => E.getReturnSeries(method, 6, 12, 40));
            assert.equal(s.length, 40, `${method} length`);
        }
    });

    test('bootstrap samples come only from the historical pool', () => {
        const pool = new Set(E.HIST_EQUITIES.map(x => x / 100));
        const s = withSeededRandom(99, () => E.getReturnSeries('equities', 0, 0, 500));
        for (const v of s) assert.ok(pool.has(v), `bootstrapped value ${v} must be a real historical return`);
    });

    test('cohort slice is a verbatim chronological window of history', () => {
        const offset = 10, n = 30;
        const s = E.getReturnSeries('cohort-equities', 0, 0, n, offset,
            { equities: E.HIST_EQUITIES, sixtyForty: E.HIST_6040 });
        for (let i = 0; i < n; i++) {
            assert.equal(s[i], E.HIST_EQUITIES[offset + i] / 100, `cohort year ${i}`);
        }
    });

    test('manual returns recover the target mean and std at scale (seeded)', () => {
        const { mean, std } = withSeededRandom(2024, () => {
            const draws = E.getReturnSeries('manual', 6, 12, 200000);
            return meanStd(draws);
        });
        close(mean, 0.06, 0.005, 'sample mean ≈ 6%');
        close(std, 0.12, 0.005, 'sample std ≈ 12%');
    });
});

// ============================================================
//  Cohort window enumeration
// ============================================================
describe('getCohortOffsets', () => {

    test('count = historyYears − yearsNeeded + 1', () => {
        assert.equal(E.getCohortOffsets(40).length, E.HIST_EQUITIES.length - 40 + 1); // 58
        assert.equal(E.getCohortOffsets(1).length, E.HIST_EQUITIES.length);            // 97
        assert.equal(E.getCohortOffsets(E.HIST_EQUITIES.length).length, 1);            // exactly one full-history window
    });

    test('returns empty when the horizon exceeds available history', () => {
        assert.deepEqual(E.getCohortOffsets(E.HIST_EQUITIES.length + 1), []);
    });

    test('offsets are contiguous and start at 0', () => {
        const offs = E.getCohortOffsets(90);
        assert.equal(offs[0], 0);
        offs.forEach((o, i) => assert.equal(o, i));
    });
});

// ============================================================
//  Cohort run construction
// ============================================================
describe('buildCohortRuns', () => {
    const hist = { equities: E.HIST_EQUITIES, sixtyForty: E.HIST_6040 };

    test('both-cohort: one full-horizon slice per valid start year', () => {
        const horizon = 40;
        const runs = withSeededRandom(5, () => E.buildCohortRuns(
            'cohort-equities', 'cohort-6040', 0, 0, 0, 0, 20, 20, horizon, hist));
        assert.equal(runs.length, E.getCohortOffsets(horizon).length);
        for (const r of runs) {
            assert.equal(r.retAcc.length, horizon);
            assert.equal(r.retDec.length, horizon);
        }
        // First run, first accumulation year is the first historical equity return.
        assert.equal(runs[0].retAcc[0], E.HIST_EQUITIES[0] / 100);
    });

    test('acc-only cohort: run count keyed to the accumulation horizon', () => {
        const accH = 30, decH = 20, horizon = 50;
        const runs = withSeededRandom(6, () => E.buildCohortRuns(
            'cohort-equities', 'manual', 0, 0, 5, 10, accH, decH, horizon, hist));
        assert.equal(runs.length, E.getCohortOffsets(accH).length);
        for (const r of runs) {
            assert.equal(r.retAcc.length, horizon);
            assert.equal(r.retDec.length, horizon);
        }
    });

    test('dec-only cohort: run count keyed to the decumulation horizon', () => {
        const accH = 20, decH = 30, horizon = 50;
        const runs = withSeededRandom(8, () => E.buildCohortRuns(
            'manual', 'cohort-6040', 5, 10, 0, 0, accH, decH, horizon, hist));
        assert.equal(runs.length, E.getCohortOffsets(decH).length);
        for (const r of runs) {
            assert.equal(r.retAcc.length, horizon);
            assert.equal(r.retDec.length, horizon);
        }
        // The decumulation window begins exactly at accHorizon and draws from 60/40 history.
        assert.equal(runs[0].retDec[accH], E.HIST_6040[0] / 100);
    });

    test('neither-cohort returns no runs (handled by the Monte Carlo path)', () => {
        const runs = E.buildCohortRuns('manual', 'manual', 6, 12, 4, 8, 20, 20, 40, hist);
        assert.deepEqual(runs, []);
    });

    test('runsPerCohort nests N stochastic runs inside each accumulation cohort', () => {
        const accH = 30, decH = 20, horizon = 50, N = 50;
        const cohorts = E.getCohortOffsets(accH).length;
        const runs = withSeededRandom(11, () => E.buildCohortRuns(
            'cohort-equities', 'manual', 0, 0, 5, 10, accH, decH, horizon, hist, N));
        assert.equal(runs.length, cohorts * N, 'total runs = cohorts × runsPerCohort');
    });

    test('within a cohort, the cohort phase is fixed but the stochastic phase varies', () => {
        const accH = 30, decH = 20, horizon = 50, N = 20;
        const runs = withSeededRandom(12, () => E.buildCohortRuns(
            'cohort-equities', 'manual', 0, 0, 5, 10, accH, decH, horizon, hist, N));
        // First N runs all belong to the first cohort.
        const firstCohort = runs.slice(0, N);
        // Accumulation returns identical across the cohort...
        for (const r of firstCohort) {
            assert.deepEqual(r.retAcc, firstCohort[0].retAcc, 'cohort accumulation must be fixed');
        }
        // ...and the first cohort year is the first historical equity return.
        assert.equal(firstCohort[0].retAcc[0], E.HIST_EQUITIES[0] / 100);
        // Decumulation draws differ across the nested runs (not all identical).
        const decSignatures = new Set(firstCohort.map(r => r.retDec.join(',')));
        assert.ok(decSignatures.size > 1, 'stochastic decumulation should vary within a cohort');
    });

    test('dec-only cohort also nests N stochastic accumulation runs', () => {
        const accH = 20, decH = 30, horizon = 50, N = 40;
        const cohorts = E.getCohortOffsets(decH).length;
        const runs = withSeededRandom(13, () => E.buildCohortRuns(
            'manual', 'cohort-6040', 5, 10, 0, 0, accH, decH, horizon, hist, N));
        assert.equal(runs.length, cohorts * N);
        // Within the first cohort, decumulation is fixed and accumulation varies.
        const firstCohort = runs.slice(0, N);
        for (const r of firstCohort) {
            assert.deepEqual(r.retDec, firstCohort[0].retDec, 'cohort decumulation must be fixed');
        }
        const accSignatures = new Set(firstCohort.map(r => r.retAcc.join(',')));
        assert.ok(accSignatures.size > 1, 'stochastic accumulation should vary within a cohort');
    });

    test('both-cohort ignores runsPerCohort (fully deterministic)', () => {
        const horizon = 40;
        const a = E.buildCohortRuns('cohort-equities', 'cohort-6040', 0, 0, 0, 0, 20, 20, horizon, hist, 100);
        const b = E.buildCohortRuns('cohort-equities', 'cohort-6040', 0, 0, 0, 0, 20, 20, horizon, hist, 1);
        assert.equal(a.length, b.length, 'both-cohort run count must not scale with runsPerCohort');
        assert.equal(a.length, E.getCohortOffsets(horizon).length);
    });
});

describe('buildCohortRunsNW — data-limited NW cohort enumeration', () => {
    const hist = { equities: E.HIST_EQUITIES, sixtyForty: E.HIST_6040 };
    const ctx  = { milestones: [{ id: 'm', age: 30, income: 90000, savings: 30000, spending: 55000 }], ss: [], windfall: [] };
    const base = {
        methodAcc: 'cohort-6040', methodDec: 'manual',
        meanAcc: 0, stdAcc: 0, meanDec: 5, stdDec: 10,
        currentAge: 30, stopAge: 95, principal: 0, nwTarget: 1_000_000,
        horizon: 66, runsPerCohort: 50, ctx, hist,
    };

    test('accumulate-cohort: includes every start year that reaches the target in time', () => {
        const runs = withSeededRandom(1, () => E.buildCohortRunsNW({ ...base, cohortPhase: 'acc' }));
        const cohorts = runs.length / base.runsPerCohort;
        // Independently recompute the valid set and compare.
        let expected = 0;
        for (let off = 0; off < E.HIST_6040.length; off++) {
            const realYears = Math.min(E.HIST_6040.length - off, base.horizon);
            const accReal = Array.from({ length: realYears }, (_, i) => E.HIST_6040[off + i] / 100);
            if (E.accReachesTarget(30, 0, 1_000_000, ctx, accReal)) expected++;
        }
        assert.equal(cohorts, expected);
        assert.ok(cohorts > 33, 'should enumerate more than the old fixed-window count of 33');
    });

    test('accumulate-cohort: total runs = valid cohorts × runsPerCohort', () => {
        const runs = withSeededRandom(2, () => E.buildCohortRunsNW({ ...base, cohortPhase: 'acc' }));
        assert.equal(runs.length % base.runsPerCohort, 0);
    });

    test('accumulate-cohort: each cohort starts at the right chronological year', () => {
        const runs = withSeededRandom(3, () => E.buildCohortRunsNW({ ...base, cohortPhase: 'acc' }));
        // First valid cohort is offset 0 → 1928; its first accumulation return is HIST_6040[0].
        assert.equal(runs[0].retAcc[0], E.HIST_6040[0] / 100);
    });

    test('decumulate-cohort: enumeration stops when runway cannot cover the longest decumulation', () => {
        const decBase = { ...base, cohortPhase: 'dec',
            methodAcc: 'manual', methodDec: 'cohort-6040',
            meanAcc: 7, stdAcc: 16, meanDec: 0, stdDec: 0 };
        const runs = withSeededRandom(4, () => E.buildCohortRunsNW(decBase));
        const cohorts = runs.length / base.runsPerCohort;
        assert.ok(cohorts >= 1 && cohorts <= E.HIST_6040.length, 'cohort count within bounds');
        // Every retDec array is full horizon length.
        assert.ok(runs.every(r => r.retDec.length === base.horizon));
    });

    test('decumulate-cohort: within a cohort, decumulation slice is shared by retirement index, accumulation varies', () => {
        const decBase = { ...base, cohortPhase: 'dec', runsPerCohort: 10,
            methodAcc: 'manual', methodDec: 'cohort-6040',
            meanAcc: 7, stdAcc: 16, meanDec: 0, stdDec: 0 };
        const runs = withSeededRandom(5, () => E.buildCohortRunsNW(decBase));
        // Accumulation draws should differ across the nested runs of the first cohort.
        const firstCohort = runs.slice(0, 10);
        const accSigs = new Set(firstCohort.map(r => r.retAcc.join(',')));
        assert.ok(accSigs.size > 1, 'stochastic accumulation should vary within a cohort');
    });

    test('returns no runs when the target is unreachable from the data', () => {
        // Impossible target with zero savings and zero principal.
        const runs = withSeededRandom(6, () => E.buildCohortRunsNW({
            ...base, cohortPhase: 'acc', principal: 0, nwTarget: 1e12,
            ctx: { milestones: [{ id: 'm', age: 30, income: 0, savings: 0, spending: 0 }], ss: [], windfall: [] },
        }));
        assert.equal(runs.length, 0);
    });
});

// ============================================================
//  Historical data integrity
// ============================================================
describe('historical return data', () => {
    test('both series cover 97 years (1928–2024)', () => {
        assert.equal(E.HIST_EQUITIES.length, 97);
        assert.equal(E.HIST_6040.length, 97);
    });
    test('all entries are finite numbers', () => {
        for (const v of [...E.HIST_EQUITIES, ...E.HIST_6040]) {
            assert.equal(typeof v, 'number');
            assert.ok(Number.isFinite(v));
        }
    });
});
