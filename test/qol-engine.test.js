/* ============================================================
   test/qol-engine.test.js — quality-of-life (lifetime utility) scoring
   ============================================================ */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../qol-engine.js');

const close = (a, b, tol, msg) =>
    assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ≈${b}, got ${a} (tol ${tol})`);

const constPath = (startAge, years, spend) => ({ startAge, spend: Array(years).fill(spend) });

describe('mortality', () => {
    test('tables cover ages 0–119 and everyone dies by 119', () => {
        assert.equal(Q.MORTALITY.male.length, 120);
        assert.equal(Q.MORTALITY.female.length, 120);
        assert.equal(Q.qx(119), 1);
        assert.equal(Q.qx(130, { sex: 'female' }), 1);
    });
    test('death probability rises every year from age 30 on', () => {
        for (const sex of ['male', 'female']) {
            for (let a = 31; a <= 119; a++) {
                assert.ok(Q.qx(a, { sex }) >= Q.qx(a - 1, { sex }), `${sex} q(${a})`);
            }
        }
    });
    test('life expectancy at 65 matches the CDC 2023 tables', () => {
        close(Q.lifeExpectancy(65, { sex: 'male' }), 18.2, 0.1);
        close(Q.lifeExpectancy(65, { sex: 'female' }), 20.7, 0.1);
        const u = Q.lifeExpectancy(65, { sex: 'unisex' });
        assert.ok(u > 18.2 && u < 20.7);
    });
    test('a hazard multiplier below 1 lengthens life; q is capped at 1', () => {
        assert.ok(Q.lifeExpectancy(65, { mult: 0.7 }) > Q.lifeExpectancy(65, {}));
        assert.equal(Q.qx(110, { mult: 5 }), 1);
    });
    test('survivalCurve starts at 1, never rises, and has years + 1 entries', () => {
        const S = Q.survivalCurve(60, 40, {});
        assert.equal(S.length, 41);
        assert.equal(S[0], 1);
        for (let t = 1; t < S.length; t++) assert.ok(S[t] <= S[t - 1]);
        close(S[1], 1 - Q.qx(60), 1e-12);
    });
    test('null mortality means certain survival', () => {
        assert.deepEqual(Q.survivalCurve(60, 5, null), [1, 1, 1, 1, 1, 1]);
    });
});

describe('schedule', () => {
    test('a number is constant', () => assert.equal(Q.schedule(0.3, 50), 0.3));
    test('points interpolate linearly and hold flat past the ends (any input order)', () => {
        const s = [{ age: 80, value: 0.6 }, { age: 60, value: 1 }];
        assert.equal(Q.schedule(s, 50), 1);
        close(Q.schedule(s, 70), 0.8, 1e-12);
        assert.equal(Q.schedule(s, 95), 0.6);
    });
    test('null spec is undefined', () => assert.equal(Q.schedule(null, 50), undefined));
});

describe('CRRA utility', () => {
    const specs = [
        { type: 'crra', gamma: 1 },
        { type: 'crra', gamma: 2, floor: 20000 },
        { type: 'crra', gamma: 4, floor: 30000 },
        { type: 'crra', gamma: 0.5 }
    ];
    for (const spec of specs) {
        const U = Q.makeUtility(spec);
        test(`γ=${spec.gamma} floor=${spec.floor || 0}: increasing and concave`, () => {
            const cs = [5000, 25000, 40000, 60000, 100000, 250000];
            for (let i = 1; i < cs.length; i++) assert.ok(U.u(cs[i]) > U.u(cs[i - 1]));
            for (const c of [40000, 80000, 150000]) {
                assert.ok(U.u(c) >= (U.u(c * 0.8) + U.u(c * 1.2)) / 2);
            }
        });
        test(`γ=${spec.gamma} floor=${spec.floor || 0}: inv undoes u, including below the floor`, () => {
            for (const c of [1000, 20500, 31000, 50000, 120000, 2e6]) {
                close(U.inv(U.u(c)), c, Math.max(1e-6 * c, 1e-6));
            }
        });
    }
    test('γ = 1 is log utility', () => {
        const U = Q.makeUtility({ type: 'crra', gamma: 1 });
        close(U.u(100000) - U.u(50000), Math.log(2), 1e-12);
    });
    test('the linear continuation below floor + minExcess joins smoothly', () => {
        const U = Q.makeUtility({ type: 'crra', gamma: 3, floor: 20000, minExcess: 1000 });
        const at = U.u(21000), eps = 1e-3;
        close(U.u(21000 - eps), at, Math.abs(at) * 1e-5);
        close((U.u(21000) - U.u(21000 - eps)) / eps, (U.u(21000 + eps) - U.u(21000)) / eps, Math.pow(1000, -3) * 1e-3);
    });
    test('rejects a non-positive gamma', () => {
        assert.throws(() => Q.makeUtility({ type: 'crra', gamma: 0 }));
    });
});

describe('happiness curve utility', () => {
    const points = [{ spend: 30000, score: 4 }, { spend: 60000, score: 6.5 }, { spend: 100000, score: 7.5 }, { spend: 200000, score: 8.5 }];
    test('validateCurve accepts a concave, increasing curve (any order)', () => {
        assert.equal(Q.validateCurve([...points].reverse()).ok, true);
    });
    test('validateCurve rejects too few points, falling scores and upward bends', () => {
        assert.equal(Q.validateCurve([{ spend: 1, score: 1 }]).ok, false);
        assert.equal(Q.validateCurve([{ spend: 30000, score: 5 }, { spend: 60000, score: 4 }]).ok, false);
        const bend = Q.validateCurve([{ spend: 30000, score: 4 }, { spend: 60000, score: 5 }, { spend: 120000, score: 8 }]);
        assert.equal(bend.ok, false);
        assert.match(bend.errors[0], /bends upward/);
    });
    test('makeUtility throws on an invalid curve', () => {
        assert.throws(() => Q.makeUtility({ type: 'curve', points: [{ spend: 30000, score: 5 }, { spend: 60000, score: 4 }] }));
    });
    const U = Q.makeUtility({ type: 'curve', points });
    test('passes through every scored point', () => {
        for (const p of points) close(U.u(p.spend), p.score, 1e-12);
    });
    test('is linear in log(spend) between points', () => {
        close(U.u(Math.sqrt(30000 * 60000)), 5.25, 1e-12);
    });
    test('extends past both ends and stays increasing', () => {
        assert.ok(U.u(10000) < 4);
        assert.ok(U.u(400000) > 8.5);
    });
    test('inv undoes u across and beyond the scored range', () => {
        for (const c of [5000, 30000, 45000, 99000, 150000, 500000]) close(U.inv(U.u(c)), c, 1e-6 * c);
    });
});

describe('gammaFromGamble', () => {
    test('recovers γ = 2 from the harmonic-mean certainty equivalent', () => {
        close(Q.gammaFromGamble({ low: 50000, high: 100000, certain: 2 / (1 / 50000 + 1 / 100000) }), 2, 1e-6);
    });
    test('recovers γ = 1 from the geometric mean', () => {
        close(Q.gammaFromGamble({ low: 50000, high: 100000, certain: Math.sqrt(50000 * 100000) }), 1, 1e-6);
    });
    test('measures relative to the floor', () => {
        const ce = 20000 + 2 / (1 / 30000 + 1 / 80000);
        close(Q.gammaFromGamble({ low: 50000, high: 100000, certain: ce, floor: 20000 }), 2, 1e-6);
    });
    test('edge answers: risk-neutral and unbounded', () => {
        assert.equal(Q.gammaFromGamble({ low: 50000, high: 100000, certain: 75000 }), 0);
        assert.equal(Q.gammaFromGamble({ low: 50000, high: 100000, certain: 50000 }), Infinity);
    });
});

describe('lifetimeUtility', () => {
    const prefs = { utility: { type: 'crra', gamma: 2, floor: 20000 }, beta: 0.99, ageWeight: Q.PRESETS.balanced.ageWeight };

    test('constant spending has CE equal to that spending, whatever the weights', () => {
        for (const p of [prefs, { ...prefs, mortality: null, beta: 1 }, { ...prefs, utility: { type: 'crra', gamma: 1 } }]) {
            close(Q.lifetimeUtility(constPath(65, 35, 60000), p).ce, 60000, 1e-6);
        }
    });
    test('smooth spending beats the same dollars spent unevenly', () => {
        const p = { ...prefs, mortality: null, beta: 1, ageWeight: 1 };
        const smooth = Q.lifetimeUtility(constPath(65, 30, 60000), p);
        const lumpy = Q.lifetimeUtility({ startAge: 65, spend: Array.from({ length: 30 }, (_, t) => (t % 2 ? 40000 : 80000)) }, p);
        assert.ok(smooth.ce > lumpy.ce);
        assert.ok(lumpy.ce > 40000);
    });
    test('mortality makes earlier spending worth more; without it, order is irrelevant', () => {
        const front = { startAge: 65, spend: [...Array(15).fill(80000), ...Array(15).fill(40000)] };
        const back = { startAge: 65, spend: [...Array(15).fill(40000), ...Array(15).fill(80000)] };
        const noMort = { ...prefs, mortality: null, beta: 1, ageWeight: 1 };
        close(Q.lifetimeUtility(front, noMort).total, Q.lifetimeUtility(back, noMort).total, 1e-15);
        const mort = { ...noMort, mortality: {} };
        assert.ok(Q.lifetimeUtility(front, mort).ce > Q.lifetimeUtility(back, mort).ce);
    });
    test('survival weights match the survival curve and horizon is reported', () => {
        const r = Q.lifetimeUtility(constPath(65, 30, 60000), { ...prefs, beta: 1, ageWeight: 1 });
        const S = Q.survivalCurve(65, 30, {});
        r.years.forEach((y, t) => close(y.weight, S[t], 1e-12));
        close(r.survivalAtHorizon, S[30], 1e-12);
    });
    test('working years are flagged and can use their own target', () => {
        const target = (age, working) => (working ? 50000 : 40000);
        const r = Q.lifetimeUtility({ startAge: 60, spend: [50000, 50000, 40000], working: [true, true, false] },
            { utility: { type: 'target', target }, mortality: null });
        assert.deepEqual(r.years.map(y => y.working), [true, true, false]);
        r.years.forEach(y => assert.equal(y.utility, 0));
    });
    test('bequests add value only when weighted and wealth is supplied', () => {
        const path = { ...constPath(65, 30, 60000), wealth: Array(30).fill(500000) };
        const none = Q.lifetimeUtility(path, prefs);
        assert.equal(none.bequestUtility, 0);
        close(none.ce, 60000, 1e-6);
        const withB = Q.lifetimeUtility(path, { ...prefs, bequest: { weight: 5 } });
        assert.ok(withB.bequestUtility > 0);
        assert.ok(withB.ce > 60000);
        const zeroWealth = Q.lifetimeUtility({ ...path, wealth: Array(30).fill(0) }, { ...prefs, bequest: { weight: 5 } });
        assert.equal(zeroWealth.bequestUtility, 0);
    });
    test('death probabilities across years plus survival at the horizon sum to 1', () => {
        // Bequest weight on a constant-wealth path: total bequest = β-discounted Σ P(leave) · B(W).
        const p = { utility: { type: 'crra', gamma: 1 }, beta: 1, bequest: { weight: 1, shifter: 10000 } };
        const r = Q.lifetimeUtility({ ...constPath(65, 30, 60000), wealth: Array(30).fill(90000) }, p);
        close(r.bequestUtility, Math.log(100000) - Math.log(10000), 1e-12);
    });
});

describe('evaluatePaths', () => {
    const prefs = { utility: { type: 'crra', gamma: 2 }, mortality: null, beta: 1 };
    test('market risk lowers CE below the average outcome (γ=2 ⇒ harmonic mean)', () => {
        const r = Q.evaluatePaths([constPath(65, 30, 40000), constPath(65, 30, 80000)], prefs);
        close(r.ce, 2 / (1 / 40000 + 1 / 80000), 1e-6);
        assert.deepEqual(r.pathCE.map(Math.round), [40000, 80000]);
    });
    test('paths must share start age and horizon', () => {
        assert.throws(() => Q.evaluatePaths([constPath(65, 30, 1), constPath(65, 29, 1)], prefs));
        assert.throws(() => Q.evaluatePaths([], prefs));
    });
});

describe('expectedYearsBelow', () => {
    test('counts years below the threshold, weighted by survival', () => {
        const path = { startAge: 65, spend: [30000, 30000, 60000, 25000] };
        assert.equal(Q.expectedYearsBelow(Q.lifetimeUtility(path, { utility: { type: 'crra', gamma: 2 }, mortality: null }), 40000), 3);
        const S = Q.survivalCurve(65, 4, {});
        close(Q.expectedYearsBelow(Q.lifetimeUtility(path, { utility: { type: 'crra', gamma: 2 } }), 40000), S[0] + S[1] + S[3], 1e-12);
    });
});

describe('PRESETS', () => {
    test('every preset builds a working utility and scores a path', () => {
        for (const [name, p] of Object.entries(Q.PRESETS)) {
            const prefs = { ...p, utility: { ...p.utility, floor: 20000 } };
            close(Q.lifetimeUtility(constPath(60, 40, 70000), prefs).ce, 70000, 1e-6, name);
        }
    });
});

describe('return models', () => {
    test('normalReturns matches the normal’s mean, variance and kurtosis', () => {
        const { values, probs } = Q.normalReturns(0.05, 0.12);
        const m = k => values.reduce((s, v, i) => s + probs[i] * (v - 0.05) ** k, 0);
        close(probs.reduce((s, p) => s + p, 0), 1, 1e-12);
        close(values.reduce((s, v, i) => s + probs[i] * v, 0), 0.05, 1e-12);
        close(m(2), 0.12 ** 2, 1e-12);
        close(m(4), 3 * 0.12 ** 4, 1e-12);
    });
    test('empiricalReturns weights every observation equally', () => {
        assert.deepEqual(Q.empiricalReturns([0.1, -0.1]), { values: [0.1, -0.1], probs: [0.5, 0.5] });
    });
});

describe('solveSpendingPolicy', () => {
    const annuityDue = (pv, r, n) => pv * r / ((1 - Math.pow(1 + r, -n)) * (1 + r));
    // Spend along one deterministic path from X0 at startAge.
    const walk = (policy, startAge, endAge, X0, r, income = () => 0) => {
        const cs = [];
        let X = X0;
        for (let a = startAge; a <= endAge; a++) {
            const c = policy.consumption(a, X);
            cs.push(c);
            X = (X - c) * (1 + r) + income(a + 1);
        }
        return { cs, leftover: X };
    };
    const r = 0.04;
    const sure = { values: [r], probs: [1] };
    const solve = (prefs, extra = {}) => Q.solveSpendingPolicy({
        startAge: 65, endAge: 94, prefs, income: () => 0, returns: sure, xMax: 3e6, ...extra });

    test('no risk, β(1+r) = 1, no mortality: level spending that exhausts wealth (the annuity)', () => {
        const { cs, leftover } = walk(solve({ utility: { type: 'crra', gamma: 2 }, beta: 1 / (1 + r), mortality: null }), 65, 94, 1e6, r);
        close(cs[0], annuityDue(1e6, r, 30), 0.01 * cs[0]);
        for (const c of cs) close(c, cs[0], 0.02 * cs[0]);
        close(leftover, 0, 1);
    });

    test('impatience tilts spending down at the Euler rate (β(1+r))^(1/γ)', () => {
        const beta = 0.95, gamma = 2;
        const { cs } = walk(solve({ utility: { type: 'crra', gamma }, beta, mortality: null }), 65, 94, 1e6, r);
        close(cs[10] / cs[0], Math.pow(beta * (1 + r), 10 / gamma), 0.01);
    });

    test('mortality makes spending earlier worth more', () => {
        const prefs = { utility: { type: 'crra', gamma: 2 }, beta: 1 / (1 + r) };
        const withMort = walk(solve({ ...prefs, mortality: {} }), 65, 94, 1e6, r).cs;
        const without  = walk(solve({ ...prefs, mortality: null }), 65, 94, 1e6, r).cs;
        assert.ok(withMort[0] > without[0] * 1.05);
        assert.ok(withMort[25] < withMort[0]);
    });

    test('under market risk with no income or floor, spending is a fixed share of wealth', () => {
        const policy = solve({ utility: { type: 'crra', gamma: 2 }, beta: 0.99 },
                             { returns: Q.normalReturns(0.05, 0.12), xMax: 5e6 });
        const rate = policy.consumption(65, 1e6) / 1e6;
        for (const x of [2e5, 5e5, 2e6]) close(policy.consumption(65, x) / x, rate, 0.01 * rate);
        assert.ok(policy.consumption(85, 1e6) / 1e6 > rate, 'the share rises as the horizon shortens');
    });

    test('future income raises spending today but never beyond cash on hand', () => {
        const prefs = { utility: { type: 'crra', gamma: 2 }, beta: 1 / (1 + r), mortality: null };
        const ss = a => (a >= 75 ? 30000 : 0);
        const withSS = solve(prefs, { income: ss });
        const without = solve(prefs);
        assert.ok(withSS.consumption(65, 5e5) > without.consumption(65, 5e5) * 1.1);
        const poor = withSS.consumption(65, 20000);
        assert.ok(poor <= 20000 && poor > 1500, `can't borrow against Social Security, got ${poor}`);
    });

    test('on the same simulated markets, the optimal policy beats every heuristic strategy', () => {
        const E = require('../engine.js');
        const { withSeededRandom } = require('./helpers.js');
        const ctx = { milestones: [{ age: 30, income: 60000, savings: 15000, spending: 45000 }],
                      ss: [{ age: 67, amt: 24000 }], windfall: [], expenses: [] };
        const prefs = { utility: { type: 'crra', gamma: 2, floor: 20000 }, beta: 0.99, ageWeight: Q.PRESETS.balanced.ageWeight };
        const policy = Q.solveSpendingPolicy({
            startAge: 30, endAge: 95, prefs, income: a => (a >= 67 ? 24000 : 0),
            returns: Q.empiricalReturns(E.HIST_6040.map(v => v / 100)), xMax: 4e6 });
        const runs = withSeededRandom(11, () => Array.from({ length: 400 }, () =>
            ({ a: E.getReturnSeries('60-40', 0, 0, 67), d: E.getReturnSeries('60-40', 0, 0, 67) })));
        const score = strategy => Q.evaluatePaths(runs.map(({ a, d }) => {
            const s = E.simulateNWPath(30, 95, 0, 55, 0, 'age', a, d, { ...ctx, strategy });
            return { startAge: 30, spend: s.spendByAge, working: s.workFracByAge.map(w => w > 0) };
        }), prefs).ce;
        const best = score({ type: 'optimal', policy });
        for (const strategy of [{ type: 'fixed' }, { type: 'constant', rate: 0.04 }, { type: 'amortize', ret: 0.04 },
                                { type: 'guardrails', band: 0.2, adjust: 0.1 }]) {
            assert.ok(best > score(strategy), `optimal ${best} should beat ${strategy.type}`);
        }
    });
});

describe('target utility (plan spending as the goal)', () => {
    const U = Q.makeUtility({ type: 'target', target: 110000, floor: 40000, lossAversion: 2.5 });
    test('scores 0 at the target, with a λ-times steeper slope just below it', () => {
        assert.equal(U.u(110000), 0);
        const d = 1;
        close((U.u(110000) - U.u(110000 - d)) / d * 110000, 2.5, 1e-3);
        close((U.u(110000 + d) - U.u(110000)) / d * 110000, 1, 1e-3);
    });
    test('a cut hurts more than the same raise helps, and deeper cuts hurt faster', () => {
        assert.ok(-U.u(99000) > 2.5 * U.u(121000));
        assert.ok(-U.u(88000) > 2 * -U.u(99000));
    });
    test('is increasing and concave, and inv undoes u (including below the floor)', () => {
        const cs = [20000, 40500, 60000, 99000, 110000, 121000, 200000, 500000];
        for (let i = 1; i < cs.length; i++) assert.ok(U.u(cs[i]) > U.u(cs[i - 1]));
        for (const c of [60000, 105000, 110000, 115000, 200000]) assert.ok(U.u(c) >= (U.u(c * 0.9) + U.u(c * 1.1)) / 2);
        for (const c of cs) close(U.inv(U.u(c)), c, 1e-6 * c);
    });
    test('gain curvature caps the upside at 1/(η − 1)', () => {
        const V = Q.makeUtility({ type: 'target', target: 50000, gainCurvature: 2 });
        close(V.u(100000), 0.5, 1e-12);
        assert.ok(V.u(1e9) < 1);
        close(V.inv(0.5), 100000, 1e-6);
    });
    test('the target can depend on age and on working years', () => {
        const V = Q.makeUtility({ type: 'target', target: (age, working) => (working ? 60000 : 50000) + (age >= 70 ? -10000 : 0) });
        assert.equal(V.u(60000, 40, true), 0);
        assert.equal(V.u(50000, 40, false), 0);
        assert.equal(V.u(40000, 75, false), 0);
    });
    test('rejects shortfall pain below 1', () => {
        assert.throws(() => Q.makeUtility({ type: 'target', target: 50000, lossAversion: 0.5 }));
    });
    test('always spending the target scores 100% of plan, at the average target', () => {
        const target = age => (age < 70 ? 60000 : 40000);
        const r = Q.lifetimeUtility({ startAge: 60, spend: Array.from({ length: 30 }, (_, t) => target(60 + t)) },
            { utility: { type: 'target', target, floor: 20000 }, beta: 0.99 });
        close(r.total, 0, 1e-12);
        close(r.ce, r.refSpend, 1e-6);
        assert.ok(r.refSpend > 40000 && r.refSpend < 60000);
    });
});

describe('leftover-money value (target model)', () => {
    const utility = { type: 'target', target: 50000, floor: 20000, gainCurvature: 2 };
    test('the first dollars left are worth θ of a dollar of extra spending at the target, tapering off', () => {
        const prefs = { utility, legacyValue: 0.25, mortality: null };
        const path = W => ({ startAge: 90, spend: [50000], wealth: [W] });
        const B = W => Q.lifetimeUtility(path(W), prefs).bequestUtility;
        close(B(1) * 50000, 0.25, 1e-4);
        assert.ok(B(5e6) < 0.25 * 5e6 / 50000 * 0.6, 'a big estate is worth well under its linear value');
        assert.ok(B(1e12) < 0.25 * 100, 'capped at θ·L/(η − 1)');
        assert.ok(B(1e6) - B(5e5) < B(5e5) - B(0));
    });
    test('no wealth path or θ = 0 means leftover money is ignored', () => {
        assert.equal(Q.lifetimeUtility({ startAge: 90, spend: [50000] }, { utility, legacyValue: 0.25 }).bequestUtility, 0);
        assert.equal(Q.lifetimeUtility({ startAge: 90, spend: [50000], wealth: [1e6] }, { utility, legacyValue: 0 }).bequestUtility, 0);
    });
    test('with leftover value, the optimal policy stays near the target instead of spending a surplus', () => {
        const E = require('../engine.js');
        const hist = Q.empiricalReturns(E.HIST_6040.map(v => v / 100));
        const solve = legacyValue => Q.solveSpendingPolicy({ startAge: 60, endAge: 95, income: a => (a >= 67 ? 20000 : 0),
            prefs: { utility: { type: 'target', target: 45000, floor: 20000, gainCurvature: 2 }, legacyValue, beta: 0.99 },
            returns: hist, xMax: 4e6 });
        const held = solve(0.5), spent = solve(0);
        close(held.consumption(65, 8e5), 45000, 0.1 * 45000);
        assert.ok(held.consumption(65, 2e6) < 1.6 * 45000, 'even a big surplus only lifts spending modestly');
        assert.ok(spent.consumption(65, 2e6) > 2 * held.consumption(65, 2e6), 'without it, a surplus gets spent');
    });
});
