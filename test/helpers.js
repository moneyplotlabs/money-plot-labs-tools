/* ============================================================
   test/helpers.js — shared test utilities
   ------------------------------------------------------------
   A seeded PRNG so any test touching Math.random (Monte Carlo,
   bootstrap, Box–Muller) is fully deterministic and never flaky.
   ============================================================ */
'use strict';

// mulberry32: tiny, fast, well-distributed seedable PRNG.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Run `fn` with Math.random replaced by a seeded sequence, then restore it.
function withSeededRandom(seed, fn) {
    const original = Math.random;
    Math.random = mulberry32(seed);
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

// Sample mean and (population) standard deviation of a numeric array.
function meanStd(arr) {
    const n = arr.length;
    const mean = arr.reduce((s, x) => s + x, 0) / n;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    return { mean, std: Math.sqrt(variance) };
}

// A simple single-stage milestone context for deterministic life-sim tests.
function singleMilestone({ income = 80000, savings = 20000, spending = 60000, age = 25 } = {}) {
    return { milestones: [{ id: 'm0', age, income, savings, spending }], ss: [], windfall: [] };
}

module.exports = { mulberry32, withSeededRandom, meanStd, singleMilestone };
