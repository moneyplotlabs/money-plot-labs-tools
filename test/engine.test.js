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

    // Solvent track (quality-of-life scoring): withdrawals stop at an empty portfolio.
    test('a funded plan: solvent track equals the net-worth path and spends exactly the plan', () => {
        const ret = Array(80).fill(0.04);
        const res = E.simulateNWPath(25, 95, 0, 60.5, 0, 'age', ret, ret, ctx);
        assert.ok(res.finalBalance > 0);
        assert.equal(res.spendByAge.length, 71);
        res.solventByAge.forEach((b, i) => close(b, res.nwByAge[i + 1], 1e-6, `age ${25 + i}`));
        res.spendByAge.forEach((c, i) => close(c, res.plannedSpendByAge[i], 1e-9));
        assert.equal(res.workFracByAge[0], 1);
        close(res.workFracByAge[60 - 25], 0.5, 1e-12);
        assert.equal(res.workFracByAge[70], 0);
        assert.equal(res.ranOutAge, null);
    });

    test('an empty portfolio earns nothing, even in a boom', () => {
        const boom = Array(80).fill(0.3);
        const res = E.simulateNWPath(25, 95, 0, 30, 0, 'age', boom, boom, ctx);   // retire at 30 with ~100k
        const out = res.ranOutAge - 25;
        assert.ok(out > 5 && out < 70);
        res.nwByAge.slice(out + 1).forEach(b => assert.equal(b, 0));
        res.growthByAge.slice(out + 1).forEach(g => assert.equal(g, 0));
    });

    test('an unfunded plan: spending falls to Social Security once the money runs out', () => {
        const ss = { ...ctx, ss: [{ age: 67, amt: 24000 }] };
        // r = 0, save 20k/yr for 25 years = 500k; spend 60k from 50 → empty at ~58, SS from 67.
        const res = E.simulateNWPath(25, 95, 0, 50, 0, 'age', zeros, zeros, ss);
        assert.equal(res.finalBalance, 0, 'the balance stops at $0 instead of going into debt');
        assert.equal(res.ranOutAge, 58);
        res.nwByAge.forEach(b => assert.ok(b >= 0));
        res.growthByAge.slice(58 - 25).forEach(g => assert.equal(g, 0));
        close(res.spendByAge[50 - 25], 60000, 1e-9, 'still funded at 50');
        close(res.spendByAge[58 - 25], 20000, 1e-6, 'last 20k at 58');
        close(res.spendByAge[60 - 25], 0, 1e-9, 'nothing left at 60');
        close(res.spendByAge[80 - 25], 24000, 1e-9, 'Social Security only at 80');
        close(res.plannedSpendByAge[80 - 25], 60000, 1e-9);
    });
});

// ============================================================
//  Retirement spending strategies (Stress Tester)
// ============================================================
describe('retirement spending strategies', () => {

    const ctx  = singleMilestone({ income: 80000, savings: 20000, spending: 60000 });
    const flat = (r) => Array(80).fill(r);
    const run  = (strategy, c = ctx, ret = flat(0.04), rAge = 60) =>
        E.simulateNWPath(25, 95, 0, rAge, 0, 'age', ret, ret, { ...c, strategy });
    const retired = (res) => res.spendByAge.slice(60 - 25);

    test('annuityDue: r = 0 splits evenly; otherwise exactly exhausts the balance', () => {
        close(E.annuityDue(300000, 0, 30), 10000, 1e-9);
        const c = E.annuityDue(500000, 0.04, 20);
        let b = 500000;
        for (let i = 0; i < 20; i++) b = (b - c) * 1.04;
        close(b, 0, 1e-6);
    });

    test('fixed is the default and leaves the original path untouched', () => {
        assert.deepEqual(run({ type: 'fixed' }), run(undefined));
    });

    test('amortize: when returns match the assumption, spending is level and ends at zero', () => {
        const res = run({ type: 'amortize', ret: 0.04 });
        const s = retired(res);
        for (const c of s) close(c, s[0], 1e-6);
        close(res.solventByAge[res.solventByAge.length - 1], 0, 1e-4);
    });

    test('amortize: future Social Security is spent down smoothly, not on arrival', () => {
        const withSS = { ...ctx, ss: [{ age: 67, amt: 24000 }] };
        const res = run({ type: 'amortize', ret: 0.04 }, withSS);
        const s = retired(res);
        for (const c of s) close(c, s[0], 1e-6);
        assert.ok(s[0] > retired(run({ type: 'amortize', ret: 0.04 }))[0], 'SS raises the level from day one');
    });

    test('constant %: spends rate × balance plus passive income', () => {
        const withSS = { ...ctx, ss: [{ age: 67, amt: 24000 }] };
        const res = run({ type: 'constant', rate: 0.04 }, withSS);
        close(res.spendByAge[61 - 25], 0.04 * res.nwByAge[61 - 25], 1e-6);
        close(res.spendByAge[70 - 25], 0.04 * res.nwByAge[70 - 25] + 24000, 1e-6);
    });

    test('guardrails: start at the plan, cut after losses, raise after gains', () => {
        close(retired(run({ type: 'guardrails', band: 0.2, adjust: 0.1 }, ctx, flat(0))) [0], 60000, 1e-9);
        const bad  = retired(run({ type: 'guardrails', band: 0.2, adjust: 0.1 }, ctx, flat(-0.03)));
        const good = retired(run({ type: 'guardrails', band: 0.2, adjust: 0.1 }, ctx, flat(0.08)));
        assert.ok(bad[10] < 60000 * 0.95, `a falling portfolio should trigger cuts, got ${bad[10]}`);
        assert.ok(good[20] > 60000 * 1.05, `a growing portfolio should trigger raises, got ${good[20]}`);
    });

    test('flexible strategies never borrow, even in a terrible market', () => {
        for (const strategy of [{ type: 'constant', rate: 0.05 }, { type: 'amortize', ret: 0.05 },
                                { type: 'guardrails', band: 0.2, adjust: 0.1 }]) {
            const res = run(strategy, ctx, flat(-0.05));
            res.nwByAge.forEach(b => assert.ok(b >= -1e-6, `${strategy.type}: balance ${b}`));
            assert.equal(res.ranOutAge, null, `${strategy.type} never asks for more than is there`);
        }
    });

    test('a fractional retirement age blends the strategy into the transition year', () => {
        const res = run({ type: 'amortize', ret: 0.04 }, ctx, flat(0.04), 60.5);
        close(res.workFracByAge[60 - 25], 0.5, 1e-12);
        assert.ok(res.spendByAge[60 - 25] > 0);
        res.nwByAge.forEach(b => assert.ok(b >= -1e-6));
    });
});

// ============================================================
//  Recurring expenses (Cash Flow Planner + Stress Tester)
// ============================================================
describe('recurring expenses — additive spending windows', () => {

    const R            = E.RETIREMENT;
    const withExpenses = (expenses, opts) => ({ ...singleMilestone(opts), expenses });
    const bridge       = { amt: 15000, start: R,    end: 65 };   // pre-Medicare health insurance
    const commute      = { amt: 5000,  start: null, end: R  };   // a cost that stops at retirement
    const zeros        = Array(80).fill(0);

    test('expenseRates splits each active row into working and retired rates', () => {
        const rows = [bridge, commute, { amt: 1000, start: 48, end: 52 }, { amt: -2000, start: 70, end: null }];
        assert.deepEqual(E.expenseRates(40, rows), { work: 5000, retired: 15000 });
        assert.deepEqual(E.expenseRates(48, rows), { work: 6000, retired: 16000 });   // start is inclusive
        assert.deepEqual(E.expenseRates(52, rows), { work: 5000, retired: 15000 });   // end is exclusive
        assert.deepEqual(E.expenseRates(65, rows), { work: 5000, retired: 0 });       // "until 65" last charges 64
        assert.deepEqual(E.expenseRates(70, rows), { work: 3000, retired: -2000 });   // negative = spending cut
        assert.deepEqual(E.expenseRates(50, [{ amt: 9000, start: R, end: R }]), { work: 0, retired: 0 });
    });

    test('an empty expense list is identical to having none', () => {
        const plain = singleMilestone();
        const empty = withExpenses([]);
        assert.deepEqual(E.simulateLife(25, 95, 50000, 0.05, 0.04, 60.3, 95, empty),
                         E.simulateLife(25, 95, 50000, 0.05, 0.04, 60.3, 95, plain));
        assert.deepEqual(E.simulateNWPath(25, 95, 0, 0, 500000, 'nw', zeros, zeros, empty),
                         E.simulateNWPath(25, 95, 0, 0, 500000, 'nw', zeros, zeros, plain));
        assert.deepEqual(E.simulateDeterministicBars(25, 95, 0, 60.3, empty),
                         E.simulateDeterministicBars(25, 95, 0, 60.3, plain));
    });

    test('r = 0: the bridge adds to withdrawals from retirement until 65', () => {
        const res = E.simulateLife(25, 95, 2_000_000, 0, 0, 60, 95, withExpenses([bridge], { spending: 40000 }));
        const nw  = (age) => res.nwData[age - 25].y;
        for (let age = 60; age < 65; age++) assert.equal(nw(age + 1) - nw(age), -55000, `age ${age}`);
        for (let age = 65; age < 95; age++) assert.equal(nw(age + 1) - nw(age), -40000, `age ${age}`);
        const out = (age) => res.outflowData[age - 25].y;
        assert.equal(out(59), -40000);
        assert.equal(out(60), -55000);
        assert.equal(out(65), -40000);
    });

    test('retiring at or after 65 means the bridge costs nothing', () => {
        for (const rAge of [65, 65.5, 70]) {
            const base = E.simulateLife(25, 95, 0, 0.03, 0.03, rAge, 95, singleMilestone());
            const with_ = E.simulateLife(25, 95, 0, 0.03, 0.03, rAge, 95, withExpenses([bridge]));
            assert.equal(with_.finalBalance, base.finalBalance, `rAge ${rAge}`);
        }
    });

    test('r = 0: the transition year prorates a from-retirement row', () => {
        const base = E.simulateLife(25, 95, 0, 0, 0, 62.5, 95, singleMilestone());
        const with_ = E.simulateLife(25, 95, 0, 0, 0, 62.5, 95, withExpenses([bridge]));
        close(base.finalBalance - with_.finalBalance, 15000 * 2.5, 1e-6);
    });

    test('r = 0: the transition year prorates an until-retirement row', () => {
        const base = E.simulateLife(25, 95, 0, 0, 0, 60.5, 95, singleMilestone());
        const with_ = E.simulateLife(25, 95, 0, 0, 0, 60.5, 95, withExpenses([commute]));
        close(base.finalBalance - with_.finalBalance, 5000 * 35.5, 1e-6);
    });

    test('r = 0: a fixed-age window costs the same wherever retirement lands', () => {
        const window = { amt: 30000, start: 48, end: 52 };
        for (const rAge of [45, 50, 50.25, 55]) {
            const base = E.simulateLife(25, 95, 1_000_000, 0, 0, rAge, 95, singleMilestone());
            const with_ = E.simulateLife(25, 95, 1_000_000, 0, 0, rAge, 95, withExpenses([window]));
            close(base.finalBalance - with_.finalBalance, 120000, 1e-6, `rAge ${rAge}`);
        }
    });

    test('a negative amount mirrors a positive one', () => {
        const fb = (ctx) => E.simulateLife(25, 95, 0, 0.05, 0.03, 60.3, 95, ctx).finalBalance;
        const base = fb(singleMilestone());
        const up   = fb(withExpenses([{ amt:  8000, start: R, end: null }]));
        const cut  = fb(withExpenses([{ amt: -8000, start: R, end: null }]));
        close(base - up, cut - base, 1e-6);
        assert.ok(cut > base, 'a spending cut should end above the baseline');
    });

    test('solver property: final balance never falls as retirement moves later', () => {
        // Anchoring the bridge to a milestone broke this (and the planner's bisection).
        const ctx = { ...withExpenses([bridge]),
            milestones: [{ id: 'm0', age: 30, income: 60000, savings: 15000, spending: 45000 }] };
        let prev = -Infinity;
        for (let rAge = 55; rAge <= 75; rAge += 0.25) {
            const fb = E.simulateLife(30, 95, 0, 0.03, 0.03, rAge, 95, ctx).finalBalance;
            assert.ok(fb >= prev, `final balance fell at rAge ${rAge} (${fb} < ${prev})`);
            prev = fb;
        }
    });

    test('simulateNWPath age mode: the bridge is paid from the fixed retirement age', () => {
        const base = E.simulateNWPath(25, 95, 0, 61, 0, 'age', zeros, zeros, singleMilestone());
        const with_ = E.simulateNWPath(25, 95, 0, 61, 0, 'age', zeros, zeros, withExpenses([bridge]));
        // Compared at 66, before either runs out (both plans deplete later at r = 0).
        close(base.nwByAge[66 - 25] - with_.nwByAge[66 - 25], 15000 * 4, 1e-6);
    });

    test('simulateNWPath nw mode: each run pays the bridge from its own retirement age', () => {
        const run = (target, ctx) => E.simulateNWPath(25, 95, 0, 0, target, 'nw', zeros, zeros, ctx);

        const early     = run(600000, singleMilestone());
        const earlyWith = run(600000, withExpenses([bridge]));
        assert.equal(earlyWith.resolvedRAge, 55, 'a from-retirement row does not move retirement');
        close(early.nwByAge[58 - 25] - earlyWith.nwByAge[58 - 25], 15000 * 3, 1e-6);   // 55, 56, 57

        const late     = run(900000, singleMilestone());
        const lateWith = run(900000, withExpenses([bridge]));
        assert.equal(lateWith.resolvedRAge, 70);
        assert.deepEqual(lateWith.nwByAge, late.nwByAge);
    });

    test('simulateNWPath nw mode: an until-retirement row delays the crossing', () => {
        const run = (ctx, target = 600000) => E.simulateNWPath(25, 95, 0, 0, target, 'nw', zeros, zeros, ctx);
        assert.equal(run(singleMilestone()).resolvedRAge, 55);
        assert.equal(run(withExpenses([commute])).resolvedRAge, 65);   // saves 15k/yr instead of 20k
        // A mid-year crossing: the target test and its interpolation both use the reduced savings.
        close(run(withExpenses([commute]), 590000).resolvedRAge, 64 + 1 / 3, 1e-9);
    });

    test('simulateDeterministicBars matches simulateLife inflow and outflow', () => {
        const ctx  = withExpenses([bridge, commute, { amt: -3000, start: 70, end: null }]);
        const life = E.simulateLife(25, 95, 0, 0.03, 0.03, 60.4, 95, ctx);
        const bars = E.simulateDeterministicBars(25, 95, 0, 60.4, ctx);
        assert.deepEqual(bars.inflowData,  life.inflowData);
        assert.deepEqual(bars.outflowData, life.outflowData);
        // Transition year (60.4): 40% of the working rate, 60% of the retired rate.
        close(bars.outflowData[60 - 25].y, -(60000 + 5000 * 0.4 + 15000 * 0.6), 1e-6);
    });

    test('accReachesTarget: until-retirement rows slow the accumulation', () => {
        const years = Array(5).fill(0);
        assert.equal(E.accReachesTarget(30, 0, 100000, singleMilestone({ savings: 20000 }), years), true);
        const ctx = { ...singleMilestone({ savings: 20000 }), expenses: [{ amt: 10000, start: null, end: R }] };
        assert.equal(E.accReachesTarget(30, 0, 100000, ctx, years), false);
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
