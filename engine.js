/* ============================================================
   engine.js — Pure financial-simulation math
   ------------------------------------------------------------
   Every function here is a pure function of its arguments: no DOM
   access, no Chart.js, no module-level mutable state. Dynamic
   per-page state (legacy floor, Social-Security / windfall events,
   milestones, historical return data) is passed in explicitly via a
   `ctx` object so each tool injects its own live values.

   The arithmetic is a faithful copy of the original per-tool engines;
   only the *source* of the inputs changed (parameters instead of
   globals). The functions map directly onto the whitepapers:
     • macroTimeline          → Whitepaper 001 (deterministic closed form)
     • simulateLife           → year-by-year deterministic lifepath
     • simulateNWPath / runs  → Whitepaper 003 (stochastic framework)

   Loaded as a plain <script> in the browser (exposes `Engine`); also
   exported under CommonJS for unit testing in Node.
   ============================================================ */

(function (global) {
    'use strict';

    // Active milestone for a given age: the most recent one whose start age
    // is ≤ age, falling back to the first defined milestone.
    function getMilestone(age, milestones) {
        return milestones.filter(m => m.age <= age).pop() || milestones[0];
    }

    // ── Tool 1: Macro Sandbox — deterministic closed-form timeline ──
    // ctx = { floor, ss: [{age, amt}], windfall: [{age, amt}] }
    function macroTimeline(currentAge, stopAge, a0, s, c, rAcc, rDec, ctx) {
        const floor          = (ctx && ctx.floor)    || 0;
        const ssEvents       = (ctx && ctx.ss)       || [];
        const windfallEvents = (ctx && ctx.windfall) || [];

        const totalHorizon = stopAge - currentAge;

        if (totalHorizon <= 0) {
            return { workingYears: 0, retirementAge: currentAge, peakNetWorth: a0, accumulationData: [], depletionData: [], finalBalanceAtMaxWork: a0 };
        }

        const simulate = (testW) => {
            let bal  = a0;
            let peak = a0;
            const accData = [];
            const depData = [];

            const k     = Math.floor(testW);
            const delta = testW - k;

            for (let i = 0; i <= totalHorizon; i++) {
                const age = currentAge + i;

                // Apply one-time windfalls
                windfallEvents.forEach(wf => { if (age === wf.age) bal += wf.amt; });

                // Sum passive income sources active this year
                const p = ssEvents.reduce((acc, ss) => acc + (age >= ss.age ? ss.amt : 0), 0);

                if (i < k) {
                    // Full working year
                    accData.push({ x: age, y: bal });
                    bal  = bal * (1 + rAcc) + s + p;
                    peak = Math.max(peak, bal);

                } else if (i === k) {
                    // Transition year (fractional retirement)
                    if (delta > 0) {
                        accData.push({ x: age, y: bal });
                        const balMid = bal * Math.pow(1 + rAcc, delta) + (s + p) * delta;
                        bal  = (balMid - (c - p) * (1 - delta)) * Math.pow(1 + rDec, 1 - delta);
                        peak = Math.max(peak, balMid, bal);
                        const midPoint = { x: age + delta, y: Math.max(floor, balMid) };
                        accData.push(midPoint);
                        depData.push(midPoint);
                    } else {
                        // Integer transition
                        depData.push({ x: age, y: Math.max(floor, bal) });
                        bal  = (bal - c + p) * (1 + rDec);
                        peak = Math.max(peak, bal);
                    }

                } else {
                    // Full retirement year
                    depData.push({ x: age, y: Math.max(floor, bal) });
                    bal  = (bal - c + p) * (1 + rDec);
                    peak = Math.max(peak, bal);
                }
            }

            // Terminal point at end of planning horizon
            const terminalAge = currentAge + totalHorizon + 1;
            if (totalHorizon >= testW) {
                depData.push({ x: terminalAge, y: Math.max(floor, bal) });
            } else {
                accData.push({ x: terminalAge, y: bal });
            }

            return { finalBal: bal, peak, accData, depData };
        };

        // Binary-search for optimal working years
        const resAtH    = simulate(totalHorizon);
        const resAtZero = simulate(0);

        let w;
        if (resAtZero.finalBal >= floor) {
            w = 0;
        } else if (resAtH.finalBal < floor) {
            w = totalHorizon;
        } else {
            let low = 0, high = totalHorizon;
            for (let i = 0; i < 60; i++) {
                const mid = (low + high) / 2;
                if (simulate(mid).finalBal < floor) low = mid;
                else high = mid;
            }
            w = (low + high) / 2;
        }

        const final = simulate(w);

        return {
            workingYears:          w,
            retirementAge:         currentAge + w,
            peakNetWorth:          final.peak,
            accumulationData:      final.accData,
            depletionData:         final.depData,
            finalBalanceAtMaxWork: resAtH.finalBal,
        };
    }

    // ── Tool 2: Cash Flow Planner — year-by-year deterministic sim ──
    // ctx = { milestones, ss, windfall }
    function simulateLife(startAge, endAge, principal, rAcc, rDec, rAge, planningEndAge, ctx) {
        const milestones     = (ctx && ctx.milestones) || [];
        const ssEvents       = (ctx && ctx.ss)         || [];
        const windfallEvents = (ctx && ctx.windfall)   || [];

        const labels      = [];
        const inflowData  = [];
        const growthData  = [];
        const outflowData = [];
        const nwData      = [];

        let balance = principal;
        let peakNw  = principal;
        let peakFlow = 0;
        let minFlow  = 0;

        const k     = Math.floor(rAge);
        const delta = rAge - k;

        for (let t = startAge; t <= endAge; t++) {
            labels.push(t);

            nwData.push(t <= planningEndAge + 1 ? { x: t, y: balance } : { x: t, y: null });

            if (t > planningEndAge) {
                inflowData.push({ x: t, y: null });
                outflowData.push({ x: t, y: null });
                growthData.push({ x: t, y: null });
                continue;
            }

            const startBal = balance;
            const m        = getMilestone(t, milestones);
            const passive  = ssEvents.reduce((acc, ss) => acc + (t >= ss.age ? ss.amt : 0), 0);
            const windfall = windfallEvents.reduce((acc, wf) => t === wf.age ? acc + wf.amt : acc, 0);

            let growth = 0;

            if (t < k) {
                // Full working year
                inflowData.push({ x: t, y: m.income + passive + windfall });
                outflowData.push({ x: t, y: -m.spending });
                balance  = balance * (1 + rAcc) + m.savings + passive + windfall;
                growth   = balance - startBal - m.savings - passive - windfall;
                peakNw   = Math.max(peakNw, balance);

            } else if (t === k) {
                // Transition year (fractional retirement)
                const workFrac   = delta;
                const retireFrac = 1 - delta;

                inflowData.push({ x: t, y: (m.income * workFrac) + passive + windfall });
                outflowData.push({ x: t, y: -m.spending });

                const balanceMid = balance * Math.pow(1 + rAcc, workFrac)
                    + (m.savings * workFrac) + (passive * workFrac) + (windfall * workFrac);

                if (delta > 0 && t <= planningEndAge) {
                    nwData.push({ x: t + delta, y: balanceMid });
                }

                balance = (balanceMid - m.spending * retireFrac + (passive * retireFrac) + (windfall * retireFrac))
                    * Math.pow(1 + rDec, retireFrac);
                growth  = balance - startBal - (m.savings * workFrac) + (m.spending * retireFrac) - passive - windfall;
                peakNw  = Math.max(peakNw, balanceMid, balance);

            } else {
                // Full retirement year
                inflowData.push({ x: t, y: passive + windfall });
                outflowData.push({ x: t, y: -m.spending });
                balance  = (balance - m.spending + passive + windfall) * (1 + rDec);
                growth   = balance - startBal + m.spending - passive - windfall;
                peakNw   = Math.max(peakNw, balance);
            }

            growthData.push({ x: t, y: growth });

            const posFlow = Math.max(0, inflowData[inflowData.length - 1].y || 0)
                          + Math.max(0, growthData[growthData.length - 1].y || 0);
            const negFlow = outflowData[outflowData.length - 1].y || 0;
            peakFlow = Math.max(peakFlow, posFlow);
            minFlow  = Math.min(minFlow,  negFlow);
        }

        return { labels, inflowData, growthData, outflowData, nwData, finalBalance: balance, peakNw, peakFlow, minFlow };
    }

    // ── Tool 3: Stress Tester — historical return data ──
    // S&P 500 real annual returns, 1928–2024 (%)
    const HIST_EQUITIES = [
         45.3,  -8.9, -19.8, -37.5,   2.3,  52.8,  -2.9,  43.4,  32.0, -36.8,
         34.9,  -0.4, -10.4, -19.6,  10.4,  22.3,  17.1,  33.4, -22.2,  -2.9,
          2.4,  21.3,  24.3,  17.0,  17.5,  -1.7,  53.8,  31.1,   3.5, -13.3,
         40.9,  10.1,  -0.9,  26.1,  -9.9,  20.8,  15.4,  10.3, -13.1,  20.3,
          6.0, -13.8,  -1.5,  10.7,  15.1, -21.5, -34.5,  28.3,  18.1, -13.0,
         -2.3,   4.5,  17.7, -12.7,  17.1,  18.1,   2.2,  26.9,  17.4,   0.8,
         11.7,  25.8,  -8.7,  26.6,   4.6,   7.1,  -1.3,  34.2,  19.0,  31.1,
         26.5,  17.9, -12.1, -13.2, -23.9,  26.3,   7.4,   1.4,  12.9,   1.4,
        -37.1,  23.1,  13.4,  -0.8,  14.0,  30.4,  12.8,   0.7,   9.7,  19.3,
         -6.2,  28.6,  16.8,  20.2, -23.1,  22.2,  21.5,
    ];

    // 60/40 portfolio real annual returns, 1928–2024 (%)
    const HIST_6040 = [
         28.1,  -3.9,  -7.3, -19.9,   9.6,  29.8,   0.9,  26.1,  19.4, -22.9,
         22.7,   1.1,  -4.9, -16.7,   3.1,  12.7,   9.9,  20.3, -18.6,  -4.9,
          1.2,  15.2,  12.0,   7.6,  11.0,   0.2,  33.8,  18.6,   0.6,  -6.3,
         23.2,   4.4,   3.5,  16.0,  -4.3,  12.4,  10.3,   5.7,  -8.0,  10.3,
          2.9, -12.4,   3.1,   8.9,   8.7, -14.6, -24.1,  15.6,  15.1,  -9.7,
         -5.0,  -1.7,   4.7,  -7.8,  20.8,  10.5,   5.0,  24.3,  19.5,  -2.8,
          8.4,  20.4,  -5.1,  20.4,   5.2,   8.7,  -5.0,  28.4,  10.5,  21.8,
         21.0,   6.4,  -2.1,  -6.3,  -9.3,  15.0,   4.8,   0.6,   7.4,   3.2,
        -14.0,   8.2,  10.6,   4.6,   8.8,  13.9,  11.6,   0.6,   5.2,  11.7,
         -4.4,  20.0,  14.0,   7.9, -23.0,  13.6,  11.1,
    ];

    const isCohort = (m) => m === 'cohort-equities' || m === 'cohort-6040';

    // One return series of `count` values for the given method.
    // hist = { equities, sixtyForty }. cohortOffset = index into history for year 0.
    function getReturnSeries(method, mean, std, count, cohortOffset, hist) {
        cohortOffset = cohortOffset || 0;
        const equities   = (hist && hist.equities)   || HIST_EQUITIES;
        const sixtyForty = (hist && hist.sixtyForty) || HIST_6040;

        if (method === 'manual') {
            return Array.from({ length: count }, () => {
                const u1 = Math.random();
                const u2 = Math.random();
                const z  = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                return (mean / 100) + (z * (std / 100));
            });
        }
        const pool = method === 'equities' ? equities : sixtyForty;
        if (method === 'cohort-equities' || method === 'cohort-6040') {
            // Chronological slice starting at cohortOffset
            const cpool = method === 'cohort-equities' ? equities : sixtyForty;
            return Array.from({ length: count }, (_, i) => cpool[cohortOffset + i] / 100);
        }
        // Bootstrap resampling
        return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)] / 100);
    }

    // All valid cohort start offsets given the years of history needed.
    function getCohortOffsets(yearsNeeded, histYears) {
        const total = (histYears || HIST_EQUITIES.length);
        const count = total - yearsNeeded + 1;
        if (count <= 0) return [];
        return Array.from({ length: count }, (_, i) => i);
    }

    // Build the full list of { retAcc, retDec } runs for cohort mode.
    //   hist          = { equities, sixtyForty }
    //   runsPerCohort = how many stochastic realizations of the NON-cohort phase to
    //                   draw within each cohort (default 1 for backward compatibility).
    //
    // When both phases are cohorts the result is fully deterministic, so runsPerCohort
    // is ignored. When only one phase is a cohort, that phase is held fixed per cohort
    // (e.g. the chronological 1928→… accumulation slice) and the other phase is sampled
    // runsPerCohort times — so each cohort contributes a distribution, not a single
    // noisy draw. Total runs = (number of cohorts) × runsPerCohort.
    function buildCohortRuns(methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
                             accHorizon, decHorizon, horizon, hist, runsPerCohort) {
        const equities   = (hist && hist.equities)   || HIST_EQUITIES;
        const sixtyForty = (hist && hist.sixtyForty) || HIST_6040;
        const h = { equities, sixtyForty };
        const N = Math.max(1, runsPerCohort || 1);

        const bothCohort = isCohort(methodAcc) && isCohort(methodDec);
        const accOnly    = isCohort(methodAcc) && !isCohort(methodDec);
        const decOnly    = !isCohort(methodAcc) && isCohort(methodDec);

        const poolAcc = methodAcc === 'cohort-equities' ? equities : sixtyForty;
        const poolDec = methodDec === 'cohort-equities' ? equities : sixtyForty;

        if (bothCohort) {
            // One contiguous slice per cohort covering the full horizon — deterministic.
            return getCohortOffsets(horizon, equities.length).map(offset => ({
                retAcc: Array.from({ length: horizon }, (_, i) => poolAcc[offset + i] / 100),
                retDec: Array.from({ length: horizon }, (_, i) => poolDec[offset + i] / 100),
            }));
        }
        if (accOnly) {
            const runs = [];
            getCohortOffsets(accHorizon, equities.length).forEach(offset => {
                // Fixed chronological accumulation returns for this cohort. The tail
                // beyond the accumulation window is never read (decumulation uses retDec),
                // so it is filled with the chronological continuation where data exists.
                const cohortAcc = Array.from({ length: horizon }, (_, i) =>
                    (offset + i) < poolAcc.length
                        ? poolAcc[offset + i] / 100
                        : (meanDec / 100));
                // Nest N stochastic decumulation realizations within this cohort.
                for (let r = 0; r < N; r++) {
                    runs.push({
                        retAcc: cohortAcc,   // shared (read-only) across this cohort's runs
                        retDec: getReturnSeries(methodDec, meanDec, stdDec, horizon, 0, h),
                    });
                }
            });
            return runs;
        }
        if (decOnly) {
            const runs = [];
            getCohortOffsets(decHorizon, equities.length).forEach(offset => {
                // Fixed chronological decumulation returns for this cohort, positioned to
                // begin at the start of the decumulation window. The pre-decumulation
                // portion is never read (accumulation uses retAcc).
                const cohortDec = Array.from({ length: horizon }, (_, i) =>
                    i >= accHorizon && (offset + (i - accHorizon)) < poolDec.length
                        ? poolDec[offset + (i - accHorizon)] / 100
                        : (meanAcc / 100));
                // Nest N stochastic accumulation realizations within this cohort.
                for (let r = 0; r < N; r++) {
                    runs.push({
                        retAcc: getReturnSeries(methodAcc, meanAcc, stdAcc, horizon, 0, h),
                        retDec: cohortDec,   // shared (read-only) across this cohort's runs
                    });
                }
            });
            return runs;
        }
        return [];   // neither cohort — handled by regular Monte Carlo path
    }

    // Does a deterministic chronological accumulation reach the target within the
    // supplied (real-data-only) return series? ctx = { milestones, ss, windfall }.
    function accReachesTarget(currentAge, principal, nwTarget, ctx, accReal) {
        const milestones = (ctx && ctx.milestones) || [];
        const ssEvents   = (ctx && ctx.ss)         || [];
        const windfall   = (ctx && ctx.windfall)   || [];
        let bal = principal;
        if (bal >= nwTarget) return true;
        for (let i = 0; i < accReal.length; i++) {
            const t = currentAge + i;
            const m = getMilestone(t, milestones);
            const passive = ssEvents.reduce((a, x) => a + (t >= x.age ? x.amt : 0), 0);
            const wf      = windfall.reduce((a, x) => t === x.age ? a + x.amt : a, 0);
            bal = bal * (1 + accReal[i]) + m.savings + passive + wf;
            if (bal >= nwTarget) return true;
        }
        return false;
    }

    // Simulation-aware cohort builder for NET-WORTH-target mode when exactly one phase
    // is a cohort. Unlike buildCohortRuns (which assumes a fixed-length window), this
    // enumerates only the cohort start years the historical data can actually support,
    // and nests `runsPerCohort` stochastic realizations of the other phase.
    //
    //   cohortPhase 'acc': each start year's chronological accumulation is run to the
    //     target. Start years whose data runs out before the target is reached are
    //     dropped. Each surviving cohort gets N random decumulation runs.
    //   cohortPhase 'dec': accumulation is random (N draws → N retirement ages, hence
    //     N decumulation lengths). A decumulation start year is kept only while it has
    //     enough remaining history to cover the LONGEST decumulation among the draws;
    //     enumeration stops at the first start year that can't. The decumulation slice
    //     is aligned to each run's actual retirement age.
    //
    // opts = { cohortPhase, methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
    //          currentAge, stopAge, principal, nwTarget, horizon, runsPerCohort, ctx, hist }
    function buildCohortRunsNW(opts) {
        const equities   = (opts.hist && opts.hist.equities)   || HIST_EQUITIES;
        const sixtyForty = (opts.hist && opts.hist.sixtyForty) || HIST_6040;
        const h = { equities, sixtyForty };
        const N = Math.max(1, opts.runsPerCohort || 1);
        const { methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
                currentAge, stopAge, principal, nwTarget, horizon, ctx } = opts;
        const fallbackAcc = meanAcc / 100;
        const fallbackDec = meanDec / 100;
        const runs = [];

        if (opts.cohortPhase === 'acc') {
            const pool = methodAcc === 'cohort-equities' ? equities : sixtyForty;
            for (let offset = 0; offset < pool.length; offset++) {
                const realYears = Math.min(pool.length - offset, horizon);
                const accReal = Array.from({ length: realYears }, (_, i) => pool[offset + i] / 100);
                if (!accReachesTarget(currentAge, principal, nwTarget, ctx, accReal)) continue;
                // Cohort accumulation returns; the tail past real data is never read
                // (decumulation reads retDec), but fill it so the array is full length.
                const cohortAcc = Array.from({ length: horizon }, (_, i) =>
                    i < realYears ? pool[offset + i] / 100 : fallbackDec);
                for (let r = 0; r < N; r++) {
                    runs.push({ retAcc: cohortAcc,
                                retDec: getReturnSeries(methodDec, meanDec, stdDec, horizon, 0, h) });
                }
            }
            return runs;
        }

        // cohortPhase === 'dec'
        const pool   = methodDec === 'cohort-equities' ? equities : sixtyForty;
        const zeros  = new Array(horizon).fill(0);
        // 1. N random accumulation draws → retirement ages (decumulation returns don't
        //    affect when the target is crossed, so a zero decumulation series is fine).
        const accDraws = [];
        let maxDecYears = 0;
        for (let r = 0; r < N; r++) {
            const retAcc = getReturnSeries(methodAcc, meanAcc, stdAcc, horizon, 0, h);
            const sim = simulateNWPath(currentAge, stopAge, principal, 0, nwTarget, 'nw', retAcc, zeros, ctx);
            accDraws.push({ retAcc, kIdx: Math.floor(sim.resolvedRAge - currentAge) });
            maxDecYears = Math.max(maxDecYears, Math.ceil(stopAge - sim.resolvedRAge));
        }
        // 2. Walk decumulation start years forward while history covers the longest
        //    decumulation any draw needs; stop at the first that can't.
        for (let offset = 0; offset + maxDecYears <= pool.length; offset++) {
            for (const draw of accDraws) {
                // Align the chronological decumulation slice to THIS run's retirement
                // index: decumulation year j (= i - kIdx) uses pool[offset + j].
                const retDec = Array.from({ length: horizon }, (_, i) =>
                    (i >= draw.kIdx && (offset + (i - draw.kIdx)) < pool.length)
                        ? pool[offset + (i - draw.kIdx)] / 100
                        : fallbackAcc);
                runs.push({ retAcc: draw.retAcc, retDec });
            }
        }
        return runs;
    }

    // Per-age net-worth path for one return realization. Deterministic given
    // returnsAcc / returnsDec. ctx = { milestones, ss, windfall }.
    function simulateNWPath(startAge, endAge, principal, rAge, nwTarget, mode, returnsAcc, returnsDec, ctx) {
        const milestones     = (ctx && ctx.milestones) || [];
        const ssEvents       = (ctx && ctx.ss)         || [];
        const windfallEvents = (ctx && ctx.windfall)   || [];

        let balance = principal;
        const nwByAge     = [];
        const growthByAge = [];

        // In NW mode we don't know rAge yet — find the first crossing during accumulation
        let resolvedRAge = (mode === 'age') ? rAge : endAge;   // default: never crossed → work until end
        let crossingFound = (mode === 'age');

        const horizon = endAge - startAge;

        for (let i = 0; i <= horizon; i++) {
            const t = startAge + i;
            nwByAge.push(balance);

            const startBal = balance;
            const m        = getMilestone(t, milestones);
            const passive  = ssEvents.reduce((acc, ss) => acc + (t >= ss.age ? ss.amt : 0), 0);
            const windfall = windfallEvents.reduce((acc, wf) => t === wf.age ? acc + wf.amt : acc, 0);

            const rAcc = returnsAcc[i];
            const rDec = returnsDec[i];

            // Compute end-of-year accumulation balance (used for crossing interpolation)
            const balanceAfterAcc = startBal * (1 + rAcc) + m.savings + passive + windfall;

            // NW mode: if not yet crossed, check if this year's accumulation crosses the target
            if (mode === 'nw' && !crossingFound) {
                if (balanceAfterAcc >= nwTarget) {
                    // Interpolate fractional crossing point within this year
                    const fraction = startBal >= nwTarget ? 0
                        : (balanceAfterAcc - startBal) > 0
                            ? (nwTarget - startBal) / (balanceAfterAcc - startBal)
                            : 0;
                    resolvedRAge  = t + Math.max(0, Math.min(1, fraction));
                    crossingFound = true;
                }
            }

            const k     = Math.floor(resolvedRAge);
            const delta = resolvedRAge - k;

            if (t < k) {
                balance = balanceAfterAcc;
                growthByAge.push(balance - startBal - m.savings - passive - windfall);
            } else if (t === k) {
                const workFrac   = delta;
                const retireFrac = 1 - delta;
                const balanceMid = startBal * Math.pow(1 + rAcc, workFrac)
                    + (m.savings + passive + windfall) * workFrac;
                balance = (balanceMid - m.spending * retireFrac + (passive + windfall) * retireFrac)
                    * Math.pow(1 + rDec, retireFrac);
                growthByAge.push(balance - startBal - (m.savings * workFrac) + (m.spending * retireFrac) - passive - windfall);
            } else {
                balance = (startBal - m.spending + passive + windfall) * (1 + rDec);
                growthByAge.push(balance - startBal + m.spending - passive - windfall);
            }
        }
        nwByAge.push(balance);

        return { nwByAge, growthByAge, finalBalance: balance, resolvedRAge };
    }

    // Deterministic inflow/outflow bars (no growth rate needed). ctx = { milestones, ss, windfall }.
    function simulateDeterministicBars(startAge, endAge, principal, rAge, ctx) {
        const milestones     = (ctx && ctx.milestones) || [];
        const ssEvents       = (ctx && ctx.ss)         || [];
        const windfallEvents = (ctx && ctx.windfall)   || [];

        const labels      = [];
        const inflowData  = [];
        const outflowData = [];

        let peakFlow = 0;
        let minFlow  = 0;

        const k     = Math.floor(rAge);
        const delta = rAge - k;

        for (let t = startAge; t <= endAge; t++) {
            labels.push(t);

            const m        = getMilestone(t, milestones);
            const passive  = ssEvents.reduce((acc, ss) => acc + (t >= ss.age ? ss.amt : 0), 0);
            const windfall = windfallEvents.reduce((acc, wf) => t === wf.age ? acc + wf.amt : acc, 0);

            if (t < k) {
                inflowData.push({ x: t, y: m.income + passive + windfall });
                outflowData.push({ x: t, y: -m.spending });
            } else if (t === k) {
                inflowData.push({ x: t, y: (m.income * delta) + passive + windfall });
                outflowData.push({ x: t, y: -m.spending });
            } else {
                inflowData.push({ x: t, y: passive + windfall });
                outflowData.push({ x: t, y: -m.spending });
            }

            peakFlow = Math.max(peakFlow, inflowData[inflowData.length - 1].y || 0);
            minFlow  = Math.min(minFlow,  outflowData[outflowData.length - 1].y || 0);
        }

        return { labels, inflowData, outflowData, peakFlow, minFlow };
    }

    const Engine = {
        getMilestone,
        macroTimeline,
        simulateLife,
        simulateNWPath,
        simulateDeterministicBars,
        getReturnSeries,
        getCohortOffsets,
        buildCohortRuns,
        buildCohortRunsNW,
        accReachesTarget,
        isCohort,
        HIST_EQUITIES,
        HIST_6040,
    };

    // Expose as a browser global and (when present) a CommonJS module.
    global.Engine = Engine;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Engine;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
