/* ============================================================
   common.js — Shared utility helpers
   Pure, dependency-free functions used across all three tools.
   No DOM access, no Chart.js, no global state.

   Loaded as a plain <script> before each tool's page script, so
   these names are available as globals in the browser. The footer
   also exports them under CommonJS so they can be unit-tested in Node.
   ============================================================ */

// Format a number as a whole-dollar currency string, e.g. 1234.5 → "$1,235".
function formatCurrency(num) {
    return '$' + Math.round(num).toLocaleString();
}

// Short, collision-resistant id for dynamic UI rows / state records.
function newId() {
    return Math.random().toString(36).substring(2, 11);
}

// Round a peak value UP to a "nice" axis ceiling. Granularity widens as the
// value grows so axes stay readable. (Unified superset of the per-tool copies:
// identical to the previous versions for peaks ≥ $50k, slightly finer below.)
function snapCeiling(rawPeak) {
    if (rawPeak >= 1000000) return Math.ceil(rawPeak / 250000) * 250000;
    if (rawPeak >= 250000)  return Math.ceil(rawPeak / 50000)  * 50000;
    if (rawPeak >= 50000)   return Math.ceil(rawPeak / 10000)  * 10000;
    return Math.ceil(rawPeak / 5000) * 5000;
}

// Round a (typically negative) value DOWN to a nice axis floor.
function snapFloor(rawMin) {
    if (rawMin <= -100000) return Math.floor(rawMin / 25000) * 25000;
    return Math.floor(rawMin / 5000) * 5000;
}

// Round a cash-flow peak UP to a nice axis ceiling (coarser tiers than snapCeiling).
function snapFlowCeiling(rawPeak) {
    if (rawPeak >= 500000) return Math.ceil(rawPeak / 100000) * 100000;
    if (rawPeak >= 100000) return Math.ceil(rawPeak / 25000)  * 25000;
    if (rawPeak >= 50000)  return Math.ceil(rawPeak / 10000)  * 10000;
    return Math.ceil(rawPeak / 5000) * 5000;
}

// Linearly-interpolated p-th percentile (p in 0–100) of an already-sorted array.
function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lo  = Math.floor(idx);
    const hi  = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Node / test export (ignored in the browser) ───────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatCurrency, newId, snapCeiling, snapFloor, snapFlowCeiling, percentile };
}
