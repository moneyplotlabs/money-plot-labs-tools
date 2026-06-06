/* ============================================================
   hsa-engine.js — HSA partial-transfer fee optimization
   ------------------------------------------------------------
   Contributions land in a 0%-return cash account (a daily drip
   plus an annual lump sum). Moving cash into investments earning
   `r` costs a flat fee per transfer. Transferring often wastes
   money on fees; transferring rarely leaves cash idle at 0%.
   This finds how many transfers (k) and on which days maximize
   the final value.

   The search is an exact dynamic program over transfer days
   (O(k·T²)), which reproduces — and improves on — the brute-force
   grid search in the original notebook: it is exact at day
   resolution rather than limited to a coarse grid.

   Pure: no DOM, no Chart.js, no global state. Exposed as a browser
   global `Hsa` and as a CommonJS module for unit testing in Node.
   ============================================================ */

(function (global) {
    'use strict';

    // Derive the day-level simulation parameters from user-facing inputs.
    //   years    — investment duration (years)
    //   cAnnual  — regular annual contribution (spread evenly across 365 days)
    //   r        — expected annual return on the invested account (e.g. 0.04)
    //   fee      — flat fee per transfer (e.g. 25)
    //   lumps    — recurring lump sums, each { amount, dayOfYear }, deposited on
    //              that day-of-year every year (e.g. [{amount:800, dayOfYear:0},
    //              {amount:300, dayOfYear:45}]). Expanded across the full horizon.
    function deriveParams({ years, cAnnual, r, fee, lumps }) {
        const T = Math.round(years * 365);
        const Y = Math.round(years);
        const lumpDeposits = [];
        for (let n = 0; n < Y; n++) {
            for (const l of (lumps || [])) {
                const day = 365 * n + Math.round(l.dayOfYear || 0);
                if (day < T) lumpDeposits.push({ day, amount: l.amount || 0 });
            }
        }
        return {
            T,
            rDay:         r / 365.0,
            cDay:         cAnnual / 365.0,
            fee:          fee,
            lumpDeposits: lumpDeposits,   // [{ day, amount }] across the whole term
        };
    }

    // Nominal (0%-return) cash accumulated by day t: the daily drip plus every
    // lump sum deposited strictly before day t.
    function cumCash(t, p) {
        let c = p.cDay * t;
        for (const d of p.lumpDeposits) if (d.day < t) c += d.amount;
        return c;
    }

    // Final portfolio value for a specific set of intermediate transfer days.
    // Faithful to the notebook's calculate_V_corrected: the fee is deducted from
    // each transferred block, the remainder compounds to T, and a final transfer
    // at T closes out the remaining cash. A block worth less than the fee is
    // clamped to zero rather than going negative.
    function valueOfSchedule(transferDays, p) {
        const T = p.T, rDay = p.rDay, fee = p.fee;
        const allT = [0, ...[...transferDays].sort((a, b) => a - b), T];
        let total = 0;
        for (let i = 0; i < allT.length - 1; i++) {
            const tStart = allT[i], tTransfer = allT[i + 1];
            let A = p.cDay * (tTransfer - tStart);
            for (const d of p.lumpDeposits) if (tStart <= d.day && d.day < tTransfer) A += d.amount;
            const net = Math.max(0, A - fee);
            total += (tTransfer === T) ? net : net * Math.pow(1 + rDay, T - tTransfer);
        }
        return total;
    }

    // Portfolio value at an arbitrary day `t` (invested blocks already transferred,
    // compounding, plus cash still sitting in the 0% account). For trajectory plots.
    function portfolioValueOverTime(t, transferDays, p) {
        const T = p.T, rDay = p.rDay, fee = p.fee;
        const allT = [0, ...[...transferDays].sort((a, b) => a - b), T];
        let value = 0, tLast = 0;
        for (let i = 0; i < allT.length - 1; i++) {
            const tStart = allT[i], tTransfer = allT[i + 1];
            if (tTransfer <= t) {
                let A = p.cDay * (tTransfer - tStart);
                for (const d of p.lumpDeposits) if (tStart <= d.day && d.day < tTransfer) A += d.amount;
                value += Math.max(0, A - fee) * Math.pow(1 + rDay, t - tTransfer);
                tLast = tTransfer;
            } else break;
        }
        if (t < T) {
            let cash = p.cDay * (t - tLast);
            for (const d of p.lumpDeposits) if (tLast <= d.day && d.day < t) cash += d.amount;
            value += cash;
        }
        return value;
    }

    // The uninvested ("idle") cash balance at day t — money sitting in the 0%
    // account, not yet transferred to investments. Rises with contributions and
    // drops to zero at each transfer (a sawtooth). At/after T it is zero (the final
    // transfer clears it). Reading the peaks gives the "transfer once idle cash
    // reaches about $X" rule of thumb.
    function idleCashOverTime(t, transferDays, p) {
        if (t >= p.T) return 0;
        let tLast = 0;
        const sorted = [...transferDays].sort((a, b) => a - b);
        for (const td of sorted) { if (td <= t) tLast = td; else break; }
        let cash = p.cDay * (t - tLast);
        for (const d of p.lumpDeposits) if (tLast <= d.day && d.day < t) cash += d.amount;
        return cash;
    }

    // The cash captured by each transfer (the idle balance just before it fires):
    // cumulative cash since the previous transfer, for each intermediate transfer.
    // These are the sawtooth peaks — i.e. the transfer-threshold amounts.
    function transferBlockSizes(transferDays, p) {
        const sorted = [...transferDays].sort((a, b) => a - b);
        const blocks = [];
        let prev = 0;
        for (const td of sorted) { blocks.push(cumCash(td, p) - cumCash(prev, p)); prev = td; }
        return blocks;
    }
    //   opts.kmax — max intermediate transfers to consider (default 12)
    //   opts.step — day granularity for candidate transfer days. Defaults to a
    //               value that keeps the grid ≈1100 points so long horizons stay
    //               fast; pass 1 to force exact day resolution.
    // Returns { perK: [{k, value, days}], bestK, bestValue, bestDays,
    //           baselineValue, gain, step }.
    function optimize(p, opts) {
        opts = opts || {};
        const T = p.T, rDay = p.rDay, fee = p.fee;
        const kmax = opts.kmax || 12;
        const step = opts.step || Math.max(1, Math.ceil(T / 1095));
        const g = (t) => Math.pow(1 + rDay, T - t);

        // Candidate intermediate transfer days: step, 2·step, … (< T)
        const days = [];
        for (let d = step; d < T; d += step) days.push(d);
        const n     = days.length;
        const ccDay = days.map(d => cumCash(d, p));
        const gDay  = days.map(g);
        const ccT   = cumCash(T, p);

        const NEG = -Infinity;
        // k = 0: a single transfer at T.
        const baseline = (ccT - cumCash(0, p)) - fee;
        const perK = [{ k: 0, value: baseline, days: [] }];

        // DP across levels. val[j][i] = best value using j transfers with the j-th
        // exactly on days[i]; back[j][i] = index (into days) of the (j-1)-th transfer,
        // or -1 if j === 1 (the run starts at day 0).
        const val  = [];
        const back = [];

        // Level j = 1: first transfer at days[i] captures cash from day 0.
        val[1]  = new Array(n);
        back[1] = new Array(n).fill(-1);
        for (let i = 0; i < n; i++) val[1][i] = (ccDay[i] - fee) * gDay[i];

        const recordBestFinal = (j) => {
            // Append the mandatory final transfer at T after the j-th intermediate.
            let best = NEG, bi = -1;
            for (let i = 0; i < n; i++) {
                const v = val[j][i] + (ccT - ccDay[i]) - fee;
                if (v > best) { best = v; bi = i; }
            }
            // Recover the schedule by walking backpointers down the levels.
            const sched = [];
            let level = j, idx = bi;
            while (idx !== -1 && level >= 1) {
                sched.push(days[idx]);
                idx = back[level][idx];
                level--;
            }
            sched.reverse();
            return { value: best, days: sched };
        };

        let r1 = recordBestFinal(1);
        perK.push({ k: 1, value: r1.value, days: r1.days });

        for (let j = 2; j <= kmax && j <= n; j++) {
            val[j]  = new Array(n).fill(NEG);
            back[j] = new Array(n).fill(-1);
            for (let i = 0; i < n; i++) {
                const gi = gDay[i], cci = ccDay[i];
                let best = NEG, bm = -1;
                for (let m = 0; m < i; m++) {
                    const cand = val[j - 1][m] + (cci - ccDay[m]) * gi - fee * gi;
                    if (cand > best) { best = cand; bm = m; }
                }
                val[j][i] = best; back[j][i] = bm;
            }
            const rj = recordBestFinal(j);
            perK.push({ k: j, value: rj.value, days: rj.days });
        }

        let bestK = 0, bestValue = NEG;
        for (const e of perK) if (e.value > bestValue) { bestValue = e.value; bestK = e.k; }
        const bestEntry = perK.find(e => e.k === bestK);

        return {
            perK,
            bestK,
            bestValue,
            bestDays:      bestEntry.days,
            baselineValue: baseline,
            gain:          bestValue - baseline,
            step,
        };
    }

    // Describe a schedule's cadence for display: the intermediate transfer days
    // plus the mandatory final transfer at T, summarized as a transfer count, an
    // average gap in days, and transfers per year. (E.g. k=5 over 3 years → 6
    // transfers, ~182-day gap, ~2/yr → "about every 6 months".)
    function scheduleCadence(days, p) {
        const points = [0, ...[...days].sort((a, b) => a - b), p.T];
        const gaps = [];
        for (let i = 1; i < points.length; i++) gaps.push(points[i] - points[i - 1]);
        const transfers = days.length + 1;   // intermediate + final at T
        const avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        return { transfers, avgGapDays, perYear: transfers / (p.T / 365) };
    }

    const Hsa = { deriveParams, cumCash, valueOfSchedule, portfolioValueOverTime, idleCashOverTime, transferBlockSizes, optimize, scheduleCadence };

    global.Hsa = Hsa;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Hsa;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
