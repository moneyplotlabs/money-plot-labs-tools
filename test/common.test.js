/* ============================================================
   test/common.test.js — utility helpers
   ============================================================ */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../common.js');

describe('formatCurrency', () => {
    test('formats whole dollars with thousands separators', () => {
        assert.equal(C.formatCurrency(1234567), '$1,234,567');
    });
    test('rounds to the nearest dollar', () => {
        assert.equal(C.formatCurrency(1234.49), '$1,234');
        assert.equal(C.formatCurrency(1234.5), '$1,235');
    });
    test('handles zero and negatives', () => {
        assert.equal(C.formatCurrency(0), '$0');
        assert.equal(C.formatCurrency(-2500), '$-2,500');
    });
});

describe('newId', () => {
    test('returns a non-empty alphanumeric string', () => {
        const id = C.newId();
        assert.equal(typeof id, 'string');
        assert.ok(id.length > 0);
        assert.match(id, /^[a-z0-9]+$/);
    });
    test('is collision-resistant across many calls', () => {
        const ids = new Set(Array.from({ length: 10000 }, () => C.newId()));
        // Allow for the astronomically unlikely collision but flag systemic dupes.
        assert.ok(ids.size > 9990, `expected ~10000 unique ids, got ${ids.size}`);
    });
});

describe('percentile', () => {
    test('returns 0 for an empty array', () => {
        assert.equal(C.percentile([], 50), 0);
    });
    test('returns the element for a single-element array', () => {
        assert.equal(C.percentile([42], 0), 42);
        assert.equal(C.percentile([42], 50), 42);
        assert.equal(C.percentile([42], 100), 42);
    });
    test('p0 is the min and p100 is the max', () => {
        const a = [10, 20, 30, 40];
        assert.equal(C.percentile(a, 0), 10);
        assert.equal(C.percentile(a, 100), 40);
    });
    test('linearly interpolates between ranks', () => {
        // idx = (p/100)*(n-1); for [10,20,30,40], p50 → idx 1.5 → 25
        assert.equal(C.percentile([10, 20, 30, 40], 50), 25);
        // p25 → idx 0.75 → 10 + 0.75*10 = 17.5
        assert.equal(C.percentile([10, 20, 30, 40], 25), 17.5);
    });
    test('matches the classic 5-number summary on a known set', () => {
        const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        assert.equal(C.percentile(sorted, 50), 5.5);
        assert.equal(C.percentile(sorted, 10), 1.9);
        assert.equal(C.percentile(sorted, 90), 9.1);
    });
});

describe('snapCeiling', () => {
    test('rounds up to tiered "nice" ceilings', () => {
        assert.equal(C.snapCeiling(40000), 40000);    // <50k → 5k tier
        assert.equal(C.snapCeiling(41000), 45000);
        assert.equal(C.snapCeiling(60000), 60000);    // ≥50k → 10k tier
        assert.equal(C.snapCeiling(61000), 70000);
        assert.equal(C.snapCeiling(260000), 300000);  // ≥250k → 50k tier
        assert.equal(C.snapCeiling(1100000), 1250000);// ≥1M → 250k tier
    });
    test('never returns less than its input', () => {
        for (const v of [1, 999, 49999, 123456, 987654, 5_000_001]) {
            assert.ok(C.snapCeiling(v) >= v, `snapCeiling(${v}) should be ≥ input`);
        }
    });
});

describe('snapFloor', () => {
    test('rounds down to tiered "nice" floors', () => {
        assert.equal(C.snapFloor(-30000), -30000);    // >-100k → 5k tier
        assert.equal(C.snapFloor(-31000), -35000);
        assert.equal(C.snapFloor(-120000), -125000);  // ≤-100k → 25k tier
    });
    test('never returns more than its input', () => {
        for (const v of [-1, -4999, -100001, -250000]) {
            assert.ok(C.snapFloor(v) <= v, `snapFloor(${v}) should be ≤ input`);
        }
    });
});

describe('snapFlowCeiling', () => {
    test('rounds up across coarser flow tiers', () => {
        assert.equal(C.snapFlowCeiling(12000), 15000);   // <50k → 5k
        assert.equal(C.snapFlowCeiling(60000), 60000);   // ≥50k → 10k
        assert.equal(C.snapFlowCeiling(120000), 125000); // ≥100k → 25k
        assert.equal(C.snapFlowCeiling(600000), 600000); // ≥500k → 100k
        assert.equal(C.snapFlowCeiling(610000), 700000);
    });
});
