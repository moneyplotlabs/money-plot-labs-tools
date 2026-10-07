/* ============================================================
   strategylab.js — Spending Strategy Lab (Tool 6)
   The Stress Tester's Monte Carlo lifepath simulator, extended with
   retirement spending strategies (fixed, constant %, amortization,
   guardrails, utility-optimal) scored by quality of life.
   Math: docs/005-spending-strategies-and-quality-of-life.pdf
   Depends on: Chart.js 3.x (global), styles.css, common.js,
               engine.js, qol-engine.js
   ============================================================ */

// ── DOM References ────────────────────────────────────────────
const milestoneContainer  = document.getElementById('milestone-container');
const addEventBtn         = document.getElementById('add-event-btn');
const loader              = document.getElementById('chart-loader');

const sliderStartAge      = document.getElementById('slider-start-age');
const boxStartAge         = document.getElementById('box-start-age');
const sliderEndAge        = document.getElementById('slider-end-age');
const boxEndAge           = document.getElementById('box-end-age');
const sliderRetireAge     = document.getElementById('slider-retire-age');
const boxRetireAge        = document.getElementById('box-retire-age');

const retireModeAge       = document.getElementById('retire-mode-age');
const retireModeNW        = document.getElementById('retire-mode-nw');
const retireAgeGroup      = document.getElementById('retire-age-group');
const retireNWGroup       = document.getElementById('retire-nw-group');
const inputRetireNW       = document.getElementById('input-retire-nw');
const boxRetireNW         = document.getElementById('box-retire-nw');

const inputPrincipal      = document.getElementById('input-principal');
const boxPrincipal        = document.getElementById('box-principal');

const selectGrowthMethodAcc = document.getElementById('select-growth-method-acc');
const manualInputsAcc       = document.getElementById('manual-inputs-acc');
const boxGrowthMeanAcc      = document.getElementById('box-growth-mean-acc');
const boxGrowthStdAcc       = document.getElementById('box-growth-std-acc');

const selectGrowthMethodDec = document.getElementById('select-growth-method-dec');
const manualInputsDec       = document.getElementById('manual-inputs-dec');
const boxGrowthMeanDec      = document.getElementById('box-growth-mean-dec');
const boxGrowthStdDec       = document.getElementById('box-growth-std-dec');

const btnLinkRates        = document.getElementById('btn-link-rates');
const btnAdvanced         = document.getElementById('advanced-button');
const panelAdvanced       = document.getElementById('advanced-panel');

const sliderLegacyFloor   = document.getElementById('slider-legacy-floor');
const boxLegacyFloor      = document.getElementById('box-legacy-floor');

const boxAxisMin          = document.getElementById('box-axis-min');
const boxAxisMax          = document.getElementById('box-axis-max');
const boxYMax             = document.getElementById('box-y-max');
const boxYLeftMin         = document.getElementById('box-y-left-min');
const boxYLeftMax         = document.getElementById('box-y-left-max');

const mainLockBtn         = document.getElementById('main-chart-lock');
const btnLockX            = document.getElementById('btn-lock-x');
const btnLockY            = document.getElementById('btn-lock-y');
const btnLockYLeft        = document.getElementById('btn-lock-y-left');

const ssList              = document.getElementById('ss-list');
const windfallList        = document.getElementById('windfall-list');
const btnAddSs            = document.getElementById('btn-add-ss');
const btnAddWindfall      = document.getElementById('btn-add-windfall');
const expenseList         = document.getElementById('expense-list');
const btnAddExpense       = document.getElementById('btn-add-expense');

const mWorkYears          = document.getElementById('metric-work-years');
const mRetireAge          = document.getElementById('metric-retire-age');
const mSuccessRate        = document.getElementById('metric-success-rate');
const mQol                = document.getElementById('metric-qol');
const mQolSub             = document.getElementById('metric-qol-sub');

const btnQol              = document.getElementById('qol-button');
const selectQolModel      = document.getElementById('select-qol-model');
const boxQolLoss          = document.getElementById('box-qol-loss');
const selectQolGain       = document.getElementById('select-qol-gain');
const boxQolLegacy        = document.getElementById('box-qol-legacy');
const qolMeaning          = document.getElementById('qol-meaning');
const panelQol            = document.getElementById('qol-panel');
const selectQolDiscount   = document.getElementById('select-qol-discount');
const boxQolDiscount      = document.getElementById('box-qol-discount');
const boxQolEnjoy90       = document.getElementById('box-qol-enjoy90');
const boxQolEnjoyFrom     = document.getElementById('box-qol-enjoy-from');
const qolDiscountHint     = document.getElementById('qol-discount-hint');
const boxQolGamma         = document.getElementById('box-qol-gamma');
const boxQolFloor         = document.getElementById('box-qol-floor');
const selectQolSex        = document.getElementById('select-qol-sex');

const selectStrategy      = document.getElementById('select-strategy');
const boxStrategyRate     = document.getElementById('box-strategy-rate');
const boxStrategyRet      = document.getElementById('box-strategy-ret');
const boxStrategyBand     = document.getElementById('box-strategy-band');
const boxStrategyAdjust   = document.getElementById('box-strategy-adjust');
const strategyHint        = document.getElementById('strategy-hint');
const strategyTableBody   = document.getElementById('strategy-table-body');
const selectOptimalReturns = document.getElementById('select-optimal-returns');
const boxOptimalMean      = document.getElementById('box-optimal-mean');
const boxOptimalStd       = document.getElementById('box-optimal-std');
const optimalSolved       = document.getElementById('optimal-solved');

const displayToggle       = document.getElementById('display-mode-toggle');
const inflationGroup      = document.getElementById('inflation-group');
const inputInflation      = document.getElementById('input-inflation');
const boxInflation        = document.getElementById('box-inflation');
const chkBuyingPower      = document.getElementById('chk-buying-power');

// ── Historical Return Data ────────────────────────────────────
// All returns are REAL (inflation-adjusted via CPI), covering 1928–2024 (97 years).
//
// US Equities (S&P 500 incl. dividends):
//   Source: Nominal returns from Aswath Damodaran, NYU Stern
//           (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html)
//           CPI deflation from Robert Shiller / US Bureau of Labor Statistics
//   Arithmetic mean: 8.8% | Std dev: 19.6% | Geometric CAGR: 6.9%
//
// 60/40 Portfolio (60% S&P 500 + 40% 10-Year US Treasury Bond):
//   Source: S&P 500 and T-Bond nominal returns from Damodaran; deflated by CPI
//   T-Bond total return includes coupon + price appreciation (from FRED / Damodaran)
//   Arithmetic mean: 5.9% | Std dev: 12.5% | Geometric CAGR: 5.1%

// S&P 500 and 60/40 real annual return series (1928–2024) live in engine.js.
const histEquities = Engine.HIST_EQUITIES;
const hist6040     = Engine.HIST_6040;

// ── State ─────────────────────────────────────────────────────
let chartInstance         = null;
let ratesLinked           = false;
let computedPeakCache     = 0;
let retireMode            = 'age';   // 'age' | 'nw'
let displayMode           = 'real';  // 'real' (today's $) | 'nominal' (future $)
let lockedBpLevels        = null;    // frozen buying-power levels while an axis is locked
let lastQolRuns           = null;    // { startAge, selected, byStrategy } from the last Monte Carlo
let cachedSimRuns         = null;    // last return sequences, reused when only QoL settings change
let cachedPolicy          = null;    // { key, policy } — the optimal-spending solve is reused while its inputs match
let lastOptimalModel      = null;    // what the last Optimal solve assumed (see optimalReturnModel)

let milestones     = [];
let ssEvents       = [];
let windfallEvents = [];
let expenses       = [];

// ── Helpers ──────────────────────────────────────────
// formatCurrency, newId, snapCeiling, percentile → common.js (loaded first)

// ── Return Series Generation ──────────────────────────────────
const HIST_START_YEAR = 1928;
const HIST_YEARS      = histEquities.length;   // 97

// Pure return-series + cohort logic lives in engine.js. These thin wrappers
// inject the historical data so existing call sites are unchanged.
function getReturnSeries(method, mean, std, count, cohortOffset) {
    return Engine.getReturnSeries(method, mean, std, count, cohortOffset || 0,
                                  { equities: histEquities, sixtyForty: hist6040 });
}


// Determine whether a method is cohort-based
const isCohort = (m) => m === 'cohort-equities' || m === 'cohort-6040';

// Build the full list of simulation runs for cohort mode (delegates to engine).
function buildCohortRuns(methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
                         accHorizon, decHorizon, horizon, runsPerCohort) {
    return Engine.buildCohortRuns(methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
                                  accHorizon, decHorizon, horizon,
                                  { equities: histEquities, sixtyForty: hist6040 },
                                  runsPerCohort);
}

// Data-limited NW single-cohort builder (delegates to engine); injects live cashflow
// context and the historical data.
function buildCohortRunsNW(opts) {
    return Engine.buildCohortRunsNW({
        ...opts,
        ctx:  { milestones, ss: ssEvents, windfall: windfallEvents, expenses },
        hist: { equities: histEquities, sixtyForty: hist6040 },
    });
}

// ── Chart Init ────────────────────────────────────────────────
// Dataset index map:
//   0  Inflow (Income)              — bar, stack:flow
//   1  Outflow (Spending)           — bar, stack:flow
//   2  Asset Growth — downside run    — bar, stack:flow
//   3  NW p10  (cross-sectional)    — dashed line, blue-400,  visible
//   4  NW p25  (cross-sectional)    — dashed line, blue-300,  visible
//   5  NW p50  (cross-sectional)    — solid  line, blue-500,  visible
//   6  NW p75  (cross-sectional)    — dashed line, blue-300,  HIDDEN by default
//   7  NW p90  (cross-sectional)    — dashed line, blue-200,  HIDDEN by default, fill target
//   8  NW — downside run (~10th pct) — solid  line, orange,    visible  (single actual run, not the fan)

// Dataset index → percentile label mapping (for metric card sync)
// Indices 3–7 are the NW percentile lines; others are bars/scenario with no metric row.
let upperBandVisible = false;   // kept for initial hidden state of p75/p90 on chart creation

function initChart() {
    const ctx = document.getElementById('lifepathChart').getContext('2d');

    const lineBase = {
        type:        'line',
        borderWidth: 1.5,
        pointRadius: 0,
        yAxisID:     'yNetWorth',
        tension:     0.1,
        spanGaps:    true,
        fill:        false,
    };

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                // ── Bars ──────────────────────────────────────────────
                {
                    label:           'Inflow (Income)',
                    data:            [],
                    backgroundColor: 'rgba(16, 185, 129, 0.6)',
                    borderColor:     '#10b981',
                    borderWidth:     1,
                    stack:           'flow',
                    yAxisID:         'y',
                },
                {
                    label:           'Outflow (Spending)',
                    data:            [],
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor:     '#ef4444',
                    borderWidth:     1,
                    stack:           'flow',
                    yAxisID:         'y',
                },
                {
                    label:           'Asset Growth — downside run (~10th pct)',
                    data:            [],
                    backgroundColor: 'rgba(139, 92, 246, 0.6)',
                    borderColor:     '#8B5CF6',
                    borderWidth:     1,
                    stack:           'flow',
                    yAxisID:         'y',
                },
                // ── NW percentile lines ───────────────────────────────
                // p10 — dashed dark blue, shown
                {
                    ...lineBase,
                    label:       'NW p10 (10th pct)',
                    data:        [],
                    borderColor: 'rgba(96, 165, 250, 0.9)',
                    borderDash:  [4, 4],
                    hidden:      false,
                },
                // p25 — dashed medium blue, shown
                {
                    ...lineBase,
                    label:       'NW p25 (25th pct)',
                    data:        [],
                    borderColor: 'rgba(147, 197, 253, 0.85)',
                    borderDash:  [4, 4],
                    hidden:      false,
                },
                // p50 — solid blue, always shown
                {
                    ...lineBase,
                    label:       'NW p50 (median)',
                    data:        [],
                    borderColor: '#3b82f6',
                    borderWidth: 2.5,
                    hidden:      false,
                },
                // p75 — dashed light blue, hidden by default
                // fill: '+1' set by applyUpperBandVisibility() when shown
                {
                    ...lineBase,
                    label:           'NW p75 (75th pct)',
                    data:            [],
                    borderColor:     'rgba(99, 179, 237, 0.75)',
                    borderDash:      [4, 4],
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    hidden:          true,
                    fill:            false,
                },
                // p90 — dashed lighter blue, hidden by default (upper fill target for p75)
                {
                    ...lineBase,
                    label:       'NW p90 (90th pct)',
                    data:        [],
                    borderColor: 'rgba(147, 210, 252, 0.65)',
                    borderDash:  [4, 4],
                    hidden:      true,
                    fill:        false,
                },
                // p10 scenario — the single actual run closest to p10 terminal NW
                // Matches the growth bars; solid orange so it stands apart from the blue fan
                {
                    ...lineBase,
                    label:       'Net Worth — downside run (~10th pct)',
                    data:        [],
                    borderColor: 'rgba(251, 146, 60, 0.9)',
                    borderWidth: 2,
                    hidden:      false,
                    fill:        false,
                },
            ],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type:  'linear',
                    grid:  { color: '#334155' },
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    title: { display: true, text: 'Age', color: '#94a3b8' },
                },
                // Net worth on the LEFT — the equal-buying-power curves start here at
                // today's value and rise from it, so it reads as the primary axis.
                yNetWorth: {
                    position: 'left',
                    grid:     { color: '#334155' },
                    min:      0,
                    ticks:    {
                        color:    '#3b82f6',
                        callback: (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : '$' + (v / 1000).toFixed(0) + 'k',
                    },
                    title:    { display: true, text: 'Net Worth ($)', color: '#3b82f6' },
                },
                // Cash flow on the RIGHT.
                y: {
                    position:    'right',
                    stacked:     true,
                    grid:        { display: false },
                    beginAtZero: true,
                    ticks:       { color: '#94a3b8', callback: (v) => '$' + Math.abs(v).toLocaleString() },
                    title:       { display: true, text: 'Annual Cash Flow ($)', color: '#94a3b8' },
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc' },
                    onClick: (e, legendItem, legend) => {
                        const idx = legendItem.datasetIndex;
                        const ds  = legend.chart.data.datasets[idx];

                        // Toggle hidden state
                        ds.hidden = !ds.hidden;

                        // p75 (idx 6) owns the fill to p90 (idx 7) — sync fill with visibility
                        if (idx === 6) ds.fill = ds.hidden ? false : '+1';
                        // If p90 (idx 7) is hidden while p75 visible, disable fill too
                        if (idx === 7 && !legend.chart.data.datasets[6].hidden) {
                            legend.chart.data.datasets[6].fill = ds.hidden ? false : '+1';
                        }

                        // Toggling a net-worth line redistributes the buying-power curves
                        // and rescales the net-worth axis to the now-visible lines.
                        if (!ds.isBuyingPower) rescaleNetWorthOverlays();
                        legend.chart.update('none');
                    },

                },
                tooltip: {
                    mode:      'index',
                    axis:      'x',
                    intersect: false,
                    filter:    (item) => !item.dataset.isBuyingPower,
                    callbacks: {
                        title: (ctx) => 'Age ' + ctx[0].parsed.x,
                        label: (ctx) => {
                            if (ctx.dataset.hidden || ctx.parsed.y === null) return null;
                            return ctx.dataset.label + ': $' + Math.abs(Math.round(ctx.parsed.y)).toLocaleString();
                        },
                    },
                },
            },
        },
    });
    loader.style.display = 'none';
}

// ── Simulation ────────────────────────────────────────────────
// Pure simulation math lives in engine.js (Engine.simulateNWPath /
// simulateDeterministicBars). These thin wrappers inject milestones + events.
function simulateNWPath(startAge, endAge, principal, rAge, nwTarget, mode, returnsAcc, returnsDec, strategy) {
    return Engine.simulateNWPath(startAge, endAge, principal, rAge, nwTarget, mode, returnsAcc, returnsDec, {
        milestones: milestones,
        ss:         ssEvents,
        windfall:   windfallEvents,
        expenses:   expenses,
        strategy:   strategy,
    });
}

// ── Retirement spending strategies ────────────────────────────
const STRATEGY_INFO = {
    fixed:      { label: 'Fixed',          hint: 'Spends the milestone plan every year. If the money runs out, spending drops to Social Security / windfalls.' },
    constant:   { label: 'Constant %',     hint: 'Withdraws a fixed share of the current balance each year, plus Social Security. Never runs out, but spending swings with the market.' },
    amortize:   { label: 'Amortize (VPW)', hint: 'Each year, re-solves the level spending that would use up the balance plus future Social Security / windfalls by the Life Expectancy horizon at the assumed return.' },
    guardrails: { label: 'Guardrails',     hint: 'Starts at the plan; when the withdrawal rate drifts past the band around its starting value, cuts or raises spending by the adjustment.' },
    optimal:    { label: 'Optimal',        hint: 'The spending at every age and balance that maximizes your Quality of Life score, solved by dynamic programming from the return distribution, Social Security, mortality and your preferences. The ceiling the other strategies are measured against. Assumes returns are independent year to year.' },
};

// Engine strategy spec for `type`, read from the strategy inputs. `policy` is the
// solved optimal-spending policy (only used by 'optimal').
function getStrategy(type, policy) {
    const pct = (el, dflt) => { const v = parseFloat(el.value); return (isNaN(v) ? dflt : v) / 100; };
    if (type === 'optimal')    return { type, policy };
    if (type === 'constant')   return { type, rate: Math.max(0, pct(boxStrategyRate, 4)) };
    if (type === 'amortize')   return { type, ret: Math.max(-0.5, pct(boxStrategyRet, 4)) };
    if (type === 'guardrails') return { type, band: Math.max(0, pct(boxStrategyBand, 20)),
                                        adjust: Math.min(0.9, Math.max(0, pct(boxStrategyAdjust, 10))) };
    return { type: 'fixed' };
}

// Annual return distribution the optimal-spending solve assumes for retirement: the
// exact pool a bootstrap samples from (cohort methods: the same pool, treated as
// independent years), or a normal for manual inputs.
function retirementReturnModel(method, meanPct, stdPct) {
    if (method === 'manual') return Qol.normalReturns(meanPct / 100, stdPct / 100);
    const pool = (method === 'equities' || method === 'cohort-equities') ? histEquities : hist6040;
    return Qol.empiricalReturns(pool.map(v => v / 100));
}

// The return model the Optimal solve assumes: the decumulation method's own (the default) or
// the "Solve Optimal Against" choice. Returns { returns, key, short, long, matches }, where
// `matches` says whether it is the model the simulated markets are drawn from.
function optimalReturnModel(methodDec, meanDec, stdDec) {
    const kind   = m => (m === 'equities' || m === 'cohort-equities') ? 'equities' : m === 'manual' ? 'manual' : '60-40';
    const source = selectOptimalReturns.value;
    const k      = kind(source === 'match' ? methodDec : source);
    const mean   = k !== 'manual' ? null : (source === 'manual' ? parseFloat(boxOptimalMean.value) || 0 : meanDec);
    const std    = k !== 'manual' ? null : (source === 'manual' ? Math.max(0, parseFloat(boxOptimalStd.value) || 0) : stdDec);
    const returns = retirementReturnModel(k, mean, std);

    const mu   = returns.values.reduce((s, v, i) => s + returns.probs[i] * v, 0);
    // Historical pools report the sample std dev (n − 1), matching the growth-method labels.
    const n    = returns.values.length;
    const bessel = k === 'manual' ? 1 : n / (n - 1);
    const sd   = Math.sqrt(bessel * returns.values.reduce((s, v, i) => s + returns.probs[i] * (v - mu) ** 2, 0));
    const cagr = Math.exp(returns.values.reduce((s, v, i) => s + returns.probs[i] * Math.log(1 + v), 0)) - 1;
    const pct  = x => (x * 100).toFixed(1) + '%';
    const name = k === 'manual' ? 'a normal distribution' : `${k === 'equities' ? 'US Equities' : '60/40'} historical returns (1928–2024)`;
    const matches = kind(methodDec) === k && (k !== 'manual' || (mean === meanDec && std === stdDec));
    const cohortNote = matches && isCohort(methodDec) ? ', treating years as independent' : '';
    return {
        returns,
        key:   [k, mean, std],
        short: k === 'manual' ? `normal ${pct(mu)} / ${pct(sd)}` : `${k === 'equities' ? 'equities' : '60/40'} history`,
        mean:  mu,
        long:  `Solved for ${name}${cohortNote} — mean ${pct(mu)}, sd ${pct(sd)}, compound ${pct(cagr)}.`
             + (matches ? '' : ' The simulated markets use a different return model, so this tests the policy when its assumptions are off.'),
        matches,
    };
}

// Solve (or reuse) the utility-maximizing spending policy for ages startAge..stopAge.
// `peakBalance` is the 95th-percentile balance at retirement; the grid top is rounded so
// ordinary slider moves keep hitting the cache.
function getOptimalPolicy(startAge, stopAge, model, peakBalance) {
    const income = (age) => ssEvents.reduce((acc, ss) => acc + (age >= ss.age ? ss.amt : 0), 0)
                          + windfallEvents.reduce((acc, wf) => age === wf.age ? acc + wf.amt : acc, 0);
    // Grid top: 4× that balance, rounded up to a power-of-two multiple of $1M (at least $1M);
    // wealth above it is handled by extrapolation.
    const xMax  = 1e6 * Math.pow(2, Math.max(0, Math.ceil(Math.log2(Math.max(1, 4 * peakBalance / 1e6)))));
    const prefs = getQolPrefs();
    const key   = JSON.stringify([startAge, stopAge, model.key, xMax, prefs, planKey(),
                                  ssEvents.map(e => [e.amt, e.age]), windfallEvents.map(e => [e.amt, e.age])]);
    if (!cachedPolicy || cachedPolicy.key !== key) {
        cachedPolicy = { key, policy: Qol.solveSpendingPolicy({
            startAge, endAge: stopAge, prefs, income, returns: model.returns, xMax,
        }) };
    }
    return cachedPolicy.policy;
}

// The plan's spending in a working / retired year: the quality-of-life target and the
// "below plan" yardstick.
function plannedSpending(age, working) {
    const m  = Engine.getMilestone(age, milestones);
    const ex = Engine.expenseRates(age, expenses);
    return m.spending + (working ? ex.work : ex.retired);
}

function applyStrategyUI() {
    const type = selectStrategy.value;
    document.querySelectorAll('.strategy-params [data-strategy]').forEach(el =>
        el.style.display = el.dataset.strategy === type ? '' : 'none');
    document.querySelector('.strategy-params').style.display = type === 'fixed' ? 'none' : '';
    document.querySelectorAll('[data-optimal-manual]').forEach(el =>
        el.style.display = type === 'optimal' && selectOptimalReturns.value === 'manual' ? '' : 'none');
    strategyHint.innerText = STRATEGY_INFO[type].hint;
    optimalSolved.style.display = type === 'optimal' && lastOptimalModel ? '' : 'none';
    if (lastOptimalModel) optimalSolved.innerText = lastOptimalModel.long;
}

// Deterministic inflow/outflow bars (delegates to engine).
function simulateDeterministicBars(startAge, endAge, principal, rAge) {
    return Engine.simulateDeterministicBars(startAge, endAge, principal, rAge, {
        milestones: milestones,
        ss:         ssEvents,
        windfall:   windfallEvents,
        expenses:   expenses,
    });
}

// percentile() → common.js (loaded before this script)

// ── Net-worth overlays (buying-power curves + left-axis scale) ──
// Rebuilds the equal-buying-power curves and rescales the net-worth (left) axis to
// the CURRENTLY VISIBLE net-worth lines (percentile fan idx 3–7 + downside run idx 8).
// It reads the display data already on the chart — each point carries its real value
// as yReal — so it can run on a legend show/hide WITHOUT re-running the Monte Carlo
// (which would re-randomise the fan). Levels recompute from the visible peak while
// unlocked (and are cached); once any axis is locked the frozen levels are reused.
function rescaleNetWorthOverlays() {
    if (!chartInstance) return;
    const ds         = chartInstance.data.datasets;
    const nominal    = displayMode === 'nominal';
    const currentAge = parseInt(boxStartAge.value);
    const stopAge    = parseInt(boxEndAge.value);
    const infl       = (parseFloat(boxInflation.value) || 0) / 100;
    const axisMin    = boxAxisMin.value !== "" ? parseInt(boxAxisMin.value) : currentAge;
    const axisMax    = boxAxisMax.value !== "" ? parseInt(boxAxisMax.value) : stopAge + 1;
    const yMaxCon    = boxYMax.value    !== "" ? parseFloat(boxYMax.value)  : undefined;

    // Peaks across the currently-visible net-worth lines (nominal y for axis, real
    // yReal for buying-power level anchoring).
    let visNomPeak = 0, visRealPeak = 0;
    for (let i = 3; i <= 8; i++) {
        if (!ds[i] || ds[i].hidden) continue;
        (ds[i].data || []).forEach(p => {
            if (!p || p.y == null) return;
            if (p.y > visNomPeak) visNomPeak = p.y;
            const r = (p.yReal != null) ? p.yReal : p.y;
            if (r > visRealPeak) visRealPeak = r;
        });
    }

    ds.splice(9);   // drop existing buying-power curves

    if (nominal && chkBuyingPower.checked) {
        const anyAxisLocked = boxAxisMin.value !== "" || boxAxisMax.value !== "" || boxYMax.value !== ""
                           || boxYLeftMin.value !== "" || boxYLeftMax.value !== "";
        let nwLevels = [];
        if (anyAxisLocked) {
            // Locked → frozen: reuse the cached levels. If nothing was cached yet
            // (e.g. locked before the curves first drew), capture them once and keep
            // them — never recompute while locked, so toggling lines can't move them.
            if (!lockedBpLevels && visRealPeak > 0) {
                const stepN = snapCeiling(visRealPeak) / 4;
                lockedBpLevels = [1, 2, 3, 4].map(k => k * stepN);
            }
            nwLevels = lockedBpLevels || [];
        } else if (visRealPeak > 0) {
            const stepN = snapCeiling(visRealPeak) / 4;
            nwLevels = [1, 2, 3, 4].map(k => k * stepN);
            lockedBpLevels = nwLevels;   // keep cache current while unlocked
        }
        // Start the curves at the current age ("today", where the factor is 1) — there
        // is no today's-dollar reference for ages before now, so don't draw to the left.
        const lo = Math.max(Math.floor(axisMin), currentAge), hi = Math.ceil(axisMax);
        nwLevels.forEach(level => {
            const data = [];
            for (let age = lo; age <= hi; age++) data.push({ x: age, y: level * Math.pow(1 + infl, age - currentAge), yReal: level });
            ds.push({
                type: 'line', label: 'Buying power: ' + formatCurrency(level) + " (today's $)", data, yAxisID: 'yNetWorth',
                borderColor: 'rgba(234, 179, 8, 0.55)', borderDash: [4, 4], borderWidth: 1,
                pointRadius: 0, fill: false, tension: 0, spanGaps: true, order: 20, isBuyingPower: true,
            });
        });
        chartInstance.options.scales.yNetWorth.max =
            yMaxCon !== undefined ? yMaxCon : (visNomPeak > 0 ? snapCeiling(visNomPeak) : undefined);
    } else {
        // Real mode (or curves off): Chart.js auto-scale already ignores hidden
        // datasets, so just honour an explicit locked max if present.
        chartInstance.options.scales.yNetWorth.max = yMaxCon;
    }
}

// ── Simulation Entry Point ────────────────────────────────────
// A run succeeds if it never ran out of money and ends at or above the legacy floor
// ($1 tolerance: strategies that spend down to exactly $0 land a hair either side of it).
function isSuccess(sim, floor) {
    return sim.ranOutAge === null && sim.finalBalance >= floor - 1;
}

// opts.reuseRuns: keep the previous return sequences (used when only QoL settings change,
// so the fan doesn't re-randomise). Event listeners pass an Event here, which is ignored.
function updateSimulation(opts) {
    const reuseRuns = !!(opts && opts.reuseRuns);
    if (!chartInstance) initChart();
    if (milestones.length === 0) return;

    const currentAge = parseInt(boxStartAge.value);
    const stopAge    = parseInt(boxEndAge.value);
    const principal  = parseFloat(boxPrincipal.value) || 0;
    const floor      = parseFloat(boxLegacyFloor.value) || 0;

    const methodAcc = selectGrowthMethodAcc.value;
    const meanAcc   = parseFloat(boxGrowthMeanAcc.value) || 0;
    const stdAcc    = parseFloat(boxGrowthStdAcc.value)  || 0;

    const methodDec = selectGrowthMethodDec.value;
    const meanDec   = parseFloat(boxGrowthMeanDec.value) || 0;
    const stdDec    = parseFloat(boxGrowthStdDec.value)  || 0;

    const nAges   = stopAge - currentAge + 2;   // +1 for terminal balance
    const horizon = nAges;

    // Retirement target — either fixed age or NW threshold
    const rAge    = parseFloat(boxRetireAge.value);
    const nwTarget = parseFloat(boxRetireNW.value) || 0;

    // Phases: acc = working years, dec = retirement years
    const accHorizon = Math.round(Math.max(0, (retireMode === 'age' ? rAge : stopAge) - currentAge));
    const decHorizon = Math.max(0, horizon - accHorizon);

    const anyCohort  = isCohort(methodAcc) || isCohort(methodDec);
    const bothCohort = isCohort(methodAcc) && isCohort(methodDec);
    const accOnly    = isCohort(methodAcc) && !isCohort(methodDec);
    const decOnly    = !isCohort(methodAcc) && isCohort(methodDec);
    // In NW mode, single-cohort enumeration is data-limited and computed dynamically by
    // the engine (cohorts that can't reach the target / can't cover decumulation are
    // dropped), so the static fixed-window over-data check does not apply to it.
    const isNWSingleCohort = (retireMode === 'nw') && (accOnly || decOnly);

    const showCohortWarning = (msg) => {
        mWorkYears.innerText = '—';
        mRetireAge.innerText = '—';
        mSuccessRate.innerText = '—';
        lastQolRuns   = null;
        cachedSimRuns = null;
        renderQualityOfLife();
        document.getElementById('metric-work-years-label').innerText = 'Working Years';
        document.getElementById('metric-retire-age-label').innerText = 'Retirement Age';
        if (chartInstance) {
            chartInstance.data.datasets.forEach(ds => ds.data = []);
            chartInstance.update('none');
        }
        loader.style.display = 'flex';
        loader.innerHTML = `<span class="placeholder-text">⚠️ ${msg}</span>`;
    };

    // ── Over-data warning (fixed-length cohort windows only) ──
    if (!isNWSingleCohort) {
        const cohortHorizonNeeded = bothCohort ? horizon
            : isCohort(methodAcc) ? accHorizon : isCohort(methodDec) ? decHorizon : 0;
        if (cohortHorizonNeeded > HIST_YEARS) {
            showCohortWarning(`Horizon (${horizon - 1} years) exceeds 97 years of historical data.<br>Shorten the planning period or use a different growth method.`);
            return;
        }
    }
    // Hide loader if it was showing a warning
    loader.style.display = 'none';

    // ── Build simulation runs ─────────────────────────────────
    const ITERATIONS      = 1000;   // total runs for pure Monte Carlo (no cohort)
    const RUNS_PER_COHORT = 200;    // stochastic draws of the non-cohort phase, per cohort

    let simRuns;
    if (reuseRuns && cachedSimRuns) {
        simRuns = cachedSimRuns;
    } else if (isNWSingleCohort) {
        // Data-limited cohort enumeration + per-cohort stochastic nesting.
        simRuns = buildCohortRunsNW({
            cohortPhase: accOnly ? 'acc' : 'dec',
            methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
            currentAge, stopAge, principal, nwTarget,
            horizon, runsPerCohort: RUNS_PER_COHORT,
        });
        if (simRuns.length === 0) {
            showCohortWarning('No historical cohort reaches the target within the available data.<br>Lower the target, raise savings, or use a different growth method.');
            return;
        }
    } else if (anyCohort) {
        // Both-cohort is fully deterministic (one run per cohort); age-mode single-cohort
        // nests RUNS_PER_COHORT stochastic runs of the other phase inside each cohort.
        simRuns = buildCohortRuns(methodAcc, methodDec, meanAcc, stdAcc, meanDec, stdDec,
                                  accHorizon, decHorizon, horizon,
                                  bothCohort ? 1 : RUNS_PER_COHORT);
    } else {
        simRuns = Array.from({ length: ITERATIONS }, () => ({
            retAcc: getReturnSeries(methodAcc, meanAcc, stdAcc, horizon),
            retDec: getReturnSeries(methodDec, meanDec, stdDec, horizon),
        }));
    }
    cachedSimRuns = simRuns;

    const nAgesBar   = stopAge - currentAge + 1;
    const allNW      = Array.from({ length: nAges }, () => []);
    const allRunData = [];
    const allRAges   = [];
    let successes    = 0;

    // Every strategy runs on the same simulated markets so their scores compare like for like;
    // the chart and headline metrics follow the selected one.
    const selectedStrategy = selectStrategy.value;
    const byStrategy = {};
    let policy = null;
    for (const type of Engine.STRATEGIES) {
        if (type === 'optimal') {
            // Size the solve's wealth grid from balances at retirement (95th percentile across the
            // Fixed runs) — where retirement wealth actually starts — rather than lifetime peaks,
            // which can compound to many times that and coarsen the grid where it matters.
            const atRetirement = byStrategy.fixed.sims.map(sm =>
                sm.nwByAge[Math.max(0, Math.min(sm.nwByAge.length - 1, Math.floor(sm.resolvedRAge) - currentAge))]
            ).sort((a, b) => a - b);
            lastOptimalModel = optimalReturnModel(methodDec, meanDec, stdDec);
            policy = getOptimalPolicy(currentAge, stopAge, lastOptimalModel, percentile(atRetirement, 95));
            applyStrategyUI();   // refresh the "solved for" line
        }
        const strategy = getStrategy(type, policy);
        const sims = simRuns.map(({ retAcc, retDec }) =>
            simulateNWPath(currentAge, stopAge, principal, rAge, nwTarget, retireMode, retAcc, retDec, strategy));
        byStrategy[type] = { sims, successRate: 100 * sims.filter(sm => isSuccess(sm, floor)).length / sims.length };
    }

    for (const sim of byStrategy[selectedStrategy].sims) {
        if (isSuccess(sim, floor)) successes++;
        sim.nwByAge.forEach((bal, idx) => allNW[idx].push(bal));
        allRunData.push({ finalBalance: sim.finalBalance, growthByAge: sim.growthByAge, nwByAge: sim.nwByAge,
                          resolvedRAge: sim.resolvedRAge, ranOutAge: sim.ranOutAge, spendByAge: sim.spendByAge,
                          plannedSpendByAge: sim.plannedSpendByAge });
        if (retireMode === 'nw') allRAges.push(sim.resolvedRAge);
    }

    // Sort each NW bucket so percentile() works correctly
    allNW.forEach(bucket => bucket.sort((a, b) => a - b));

    // ── NW percentile series ──────────────────────────────────
    const ages = Array.from({ length: nAges }, (_, i) => currentAge + i);

    function makeNWPercentile(p) {
        return ages.map((age, idx) => ({ x: age, y: Math.max(0, percentile(allNW[idx], p)) }));
    }

    const nwP10 = makeNWPercentile(10);
    const nwP25 = makeNWPercentile(25);
    const nwP50 = makeNWPercentile(50);
    const nwP75 = makeNWPercentile(75);
    const nwP90 = makeNWPercentile(90);

    // Peak of p90 line drives the Y-axis auto-scale cache
    computedPeakCache = Math.max(...nwP90.map(d => d.y));

    // ── Representative downside run ───────────────────────────
    // The run at the 10th percentile of outcomes. Note this is a low-OUTCOME run, not a
    // "below-target" run: a run that ends in the bottom decile almost always crossed the
    // retirement target (that's why it retired) and then drew down on poor decumulation
    // returns. A run that never reaches the target keeps earning and ends HIGH, not low.
    let p10Run;
    const p10Index = Math.round(0.1 * (allRunData.length - 1));
    if (selectedStrategy === 'fixed') {
        // Rank runs that run out below those that don't — the earlier, the lower — and the
        // rest by ending balance. (Matching the p10 ending balance instead fails once that
        // outcome is depleted: every depleted run ends at $0, so it would pick one that only
        // runs out at the very end.)
        const outcome = run => run.ranOutAge === null ? run.finalBalance : run.ranOutAge - stopAge - 1;
        p10Run = [...allRunData].sort((a, b) => outcome(a) - outcome(b))[p10Index];
    } else {
        // Flexible strategies spend down toward $0, so the ending balance can't rank runs;
        // use the 10th-percentile run by quality of life instead.
        const prefs = getQolPrefs();
        const sims  = byStrategy[selectedStrategy].sims;
        const ranked = allRunData
            .map((run, idx) => ({ run, u: Qol.lifetimeUtility(toQolPath(sims[idx], currentAge), prefs).total }))
            .sort((a, b) => a.u - b.u);
        p10Run = ranked[p10Index].run;
    }
    const barAges       = Array.from({ length: nAgesBar }, (_, i) => currentAge + i);
    const growthP10Data     = barAges.map((age, idx) => ({ x: age, y: p10Run.growthByAge[idx] ?? 0 }));

    // NW path of that same downside run — bars and line tell one consistent story.
    // nwByAge has nAges entries (startAge..stopAge+1); map to {x,y} clamped to ≥0
    const nwP10ScenarioData = p10Run.nwByAge.map((bal, idx) => ({
        x: currentAge + idx,
        y: Math.max(0, bal),
    }));

    // Inflow / outflow bars retire at the SAME age as the p10 representative run
    // (the run driving the bold NW line and growth bars), so working income stops
    // exactly when that scenario's net worth crosses the target.
    const barsRAge = (retireMode === 'age') ? rAge : p10Run.resolvedRAge;
    const bars     = simulateDeterministicBars(currentAge, stopAge, principal, barsRAge);
    // Outflow bars show what that same downside run actually spent: the plan while the money
    // lasts (Fixed) or the strategy's market-driven spending, and only what came in once empty.
    bars.outflowData = bars.outflowData.map((pt, idx) => ({ x: pt.x, y: -(p10Run.spendByAge[idx] ?? 0) }));

    // ── Metrics ───────────────────────────────────────────────
    const successRate = (successes / simRuns.length) * 100;
    let runLabel;
    if (!anyCohort)       runLabel = `${ITERATIONS.toLocaleString()} runs`;
    else if (bothCohort)  runLabel = `${simRuns.length} cohorts`;
    else                  runLabel = `${simRuns.length / RUNS_PER_COHORT} cohorts × ${RUNS_PER_COHORT}`;
    mSuccessRate.innerText = successRate.toFixed(1) + '%';
    mSuccessRate.parentElement.querySelector('.metric-label').innerText = `Success Rate (${runLabel})`;
    mSuccessRate.parentElement.className = 'metric-card '
        + (successRate > 80 ? 'green' : successRate > 50 ? 'blue' : '');

    // Years the charted downside run spends below plan, so the card ties to the orange line.
    const downsideBelow = p10Run.spendByAge.filter((c, t) => c < p10Run.plannedSpendByAge[t] - 1).length;
    lastQolRuns = { startAge: currentAge, selected: selectedStrategy, byStrategy, downsideBelow };
    renderQualityOfLife();

    if (retireMode === 'age') {
        const w = Math.max(0, rAge - currentAge);
        mWorkYears.style.fontSize = '';
        mRetireAge.style.fontSize = '';
        mWorkYears.innerHTML = Math.round(w) + ' Years';
        mRetireAge.innerHTML = 'Age ' + Math.round(rAge);
        document.getElementById('metric-work-years-label').innerText = 'Working Years';
        document.getElementById('metric-retire-age-label').innerText = 'Retirement Age';
    } else {
        // Retirement timing is its OWN distribution, independent of the net-worth
        // outcome fan (in this model when you hit the target is driven by accumulation
        // returns, while whether the money lasts is driven by separate decumulation
        // returns — the two are uncorrelated). So we report retirement age as a plain
        // range with a median headline, and never cross-map it to an NW percentile.
        const sortedRAges = [...allRAges].sort((a, b) => a - b);
        const loAge  = percentile(sortedRAges, 10);
        const medAge = percentile(sortedRAges, 50);
        const hiAge  = percentile(sortedRAges, 90);

        mWorkYears.style.fontSize = '';
        mRetireAge.style.fontSize = '';
        mWorkYears.innerHTML = Math.round(medAge - currentAge) + ' Years';
        mRetireAge.innerHTML = 'Age ' + Math.round(medAge);
        document.getElementById('metric-work-years-label').innerText =
            `Working Years (median; 10–90%: ${Math.round(loAge - currentAge)}–${Math.round(hiAge - currentAge)})`;
        document.getElementById('metric-retire-age-label').innerText =
            `Retirement Age (median; 10–90%: ${Math.round(loAge)}–${Math.round(hiAge)})`;
    }

    document.getElementById('label-principal').innerText    = 'Starting Balance: '     + formatCurrency(principal);
    document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: ' + formatCurrency(floor);

    const nominal = displayMode === 'nominal';
    const infl    = (parseFloat(boxInflation.value) || 0) / 100;
    const f       = (age) => Math.pow(1 + infl, age - currentAge);   // real → nominal factor
    document.getElementById('label-inflation').innerText = 'Assumed Inflation Rate: ' + (infl * 100).toFixed(1) + '%';

    // ── View clamping ─────────────────────────────────────────
    const axisMin        = boxAxisMin.value  !== "" ? parseInt(boxAxisMin.value)    : currentAge;
    const axisMax        = boxAxisMax.value  !== "" ? parseInt(boxAxisMax.value)    : stopAge + 1;
    const yMaxConstraint = boxYMax.value     !== "" ? parseFloat(boxYMax.value)     : undefined;
    const yLeftMinCon    = boxYLeftMin.value !== "" ? parseFloat(boxYLeftMin.value) : undefined;
    const yLeftMaxCon    = boxYLeftMax.value !== "" ? parseFloat(boxYLeftMax.value) : undefined;

    // ── Display series (nominal scaling) ──────────────────────
    // Default to the real series; in nominal mode inflate everything to future
    // dollars. Net-worth / cash-flow values scale by f(age). Asset growth is the
    // exception: the nominal portfolio also grows WITH inflation, so the correct
    // nominal growth is the residual (nominal NW change − nominal contributions),
    // which keeps the stacked bars consistent with the nominal net-worth lines.
    let dInflow = bars.inflowData, dOutflow = bars.outflowData, dGrowth = growthP10Data;
    let dP10 = nwP10, dP25 = nwP25, dP50 = nwP50, dP75 = nwP75, dP90 = nwP90, dScen = nwP10ScenarioData;
    let nomPeakFlow = 0, nomMinFlow = 0;

    if (nominal) {
        const scaleLine = (arr) => arr.map(p => ({ x: p.x, y: p.y == null ? null : p.y * f(p.x), yReal: p.y }));
        dP10  = scaleLine(nwP10);  dP25 = scaleLine(nwP25);  dP50 = scaleLine(nwP50);
        dP75  = scaleLine(nwP75);  dP90 = scaleLine(nwP90);  dScen = scaleLine(nwP10ScenarioData);
        dInflow  = bars.inflowData.map(p  => ({ x: p.x, y: p.y * f(p.x), yReal: p.y }));
        dOutflow = bars.outflowData.map(p => ({ x: p.x, y: p.y * f(p.x), yReal: p.y }));
        dGrowth  = growthP10Data.map((p, idx) => {
            const nwNow  = dScen[idx]     ? dScen[idx].y     : null;
            const nwNext = dScen[idx + 1] ? dScen[idx + 1].y : null;
            const g = (nwNow != null && nwNext != null)
                ? (nwNext - nwNow) - ((dInflow[idx]?.y || 0) + (dOutflow[idx]?.y || 0))   // residual = true nominal growth
                : (p.y || 0) * f(p.x);                                                     // fallback (terminal year)
            return { x: p.x, y: g, yReal: g / f(p.x) };
        });
        for (let idx = 0; idx < dInflow.length; idx++) {
            const inf = dInflow[idx]?.y || 0, out = dOutflow[idx]?.y || 0, gr = dGrowth[idx]?.y || 0;
            const posTop = inf + Math.max(0, gr);
            const negBot = out + Math.min(0, gr);
            if (posTop > nomPeakFlow) nomPeakFlow = posTop;
            if (negBot < nomMinFlow)  nomMinFlow  = negBot;
        }
    }

    // ── Push to chart ─────────────────────────────────────────
    // Dataset indices: 0=inflow, 1=outflow, 2=growth(p10 scenario), 3=NWp10, 4=NWp25, 5=NWp50, 6=NWp75, 7=NWp90, 8=NWp10scenario
    chartInstance.data.labels                  = bars.labels;
    chartInstance.data.datasets[0].data        = dInflow;
    chartInstance.data.datasets[1].data        = dOutflow;
    chartInstance.data.datasets[2].data        = dGrowth;
    chartInstance.data.datasets[3].data        = dP10;
    chartInstance.data.datasets[4].data        = dP25;
    chartInstance.data.datasets[5].data        = dP50;
    chartInstance.data.datasets[6].data        = dP75;
    chartInstance.data.datasets[7].data        = dP90;
    chartInstance.data.datasets[8].data        = dScen;
    chartInstance.options.scales.x.type        = 'linear';
    chartInstance.options.scales.x.min         = axisMin;
    chartInstance.options.scales.x.max         = axisMax;

    if (nominal) {
        chartInstance.options.scales.y.min = yLeftMinCon !== undefined ? yLeftMinCon : (nomMinFlow < 0 ? snapFloor(nomMinFlow) : 0);
        chartInstance.options.scales.y.max = yLeftMaxCon !== undefined ? yLeftMaxCon : snapFlowCeiling(nomPeakFlow);
    } else {
        chartInstance.options.scales.y.min = yLeftMinCon;
        chartInstance.options.scales.y.max = yLeftMaxCon;
    }

    // Buying-power curves + net-worth (left) axis follow the currently VISIBLE NW
    // lines, so hiding p75/p90 keeps the curves/scale tied to the shown fan.
    rescaleNetWorthOverlays();

    chartInstance.update('none');

    updateButtonStates();
    updateURLParams();
}

// ── Quality of Life ───────────────────────────────────────────
// Scores each run's realized spending (qol-engine.js): planned spending while the
// portfolio lasts, Social Security / windfalls only once it's empty. Kept apart from
// updateSimulation so QoL edits re-score the same runs instead of re-randomising the fan.
// Target model: happiness relative to the plan's spending that year (plannedSpending),
// so a target that changes by life stage is judged stage by stage.
// The yearly time discount (as a rate) and where it comes from: matched to the mean return of
// the model Optimal is solved against (→ level spending when returns are steady), or custom.
function getTimeDiscount() {
    if (selectQolDiscount.value === 'custom') {
        return { rate: Math.max(0, (parseFloat(boxQolDiscount.value) || 0) / 100), matched: false };
    }
    const model = optimalReturnModel(selectGrowthMethodDec.value,
        parseFloat(boxGrowthMeanDec.value) || 0, parseFloat(boxGrowthStdDec.value) || 0);
    return { rate: Math.max(0, model.mean), matched: true, model };
}

// Enjoyment by age: full until the "declines from" age, linear to the age-90 value, then held.
function getAgeWeight() {
    const at90 = Math.min(1, Math.max(0, (parseFloat(boxQolEnjoy90.value) || 0) / 100));
    if (at90 >= 1) return 1;
    const from = Math.min(89, Math.max(0, parseFloat(boxQolEnjoyFrom.value) || 0));
    return [{ age: from, value: 1 }, { age: 90, value: at90 }];
}

function getQolPrefs() {
    const sex    = selectQolSex.value;
    const floor  = Math.max(0, parseFloat(boxQolFloor.value) || 0);
    const target = selectQolModel.value === 'target';
    return {
        utility: target
            ? { type: 'target', target: plannedSpending, floor,
                lossAversion:  Math.max(1, parseFloat(boxQolLoss.value) || 2.5),
                gainCurvature: parseFloat(selectQolGain.value) || 2 }
            : { type: 'crra', gamma: Math.max(0.1, parseFloat(boxQolGamma.value) || 2), floor },
        legacyValue: target ? Math.max(0, (parseFloat(boxQolLegacy.value) || 0) / 100) : 0,
        beta:      1 / (1 + getTimeDiscount().rate),
        ageWeight: getAgeWeight(),
        mortality: sex === 'off' ? null : { sex },
    };
}

// Plan inputs the target model depends on (prefs serialise without the target function).
function planKey() {
    return [milestones.map(m => [m.age, m.income, m.spending]), expenses.map(e => [e.amt, e.start, e.end])];
}

// Show the inputs for the chosen happiness model, and spell out what the settings mean
// at the plan's spending (target model) or for a sample gamble (smooth curve).
function applyQolModelUI() {
    const d = getTimeDiscount();
    boxQolDiscount.disabled = d.matched;
    qolDiscountHint.innerText = d.matched
        ? `Time discount in use: ${(d.rate * 100).toFixed(1)}%/yr — the mean return Optimal is solved for (${d.model.short}).`
        : `Time discount in use: ${(d.rate * 100).toFixed(1)}%/yr (custom).`;
    const model = selectQolModel.value;
    document.querySelectorAll('[data-qol-model]').forEach(el =>
        el.style.display = el.dataset.qolModel === model ? '' : 'none');
    if (milestones.length === 0) return;
    const prefs = getQolPrefs();
    const age   = parseInt(boxStartAge.value) || 30;
    const U     = Qol.makeUtility(prefs.utility);
    const solve = (f, lo, hi) => { for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; };
    if (model === 'target') {
        const T    = plannedSpending(age, false);
        const u    = c => U.u(c, age, false);
        const cut  = -u(0.9 * T);
        const cap  = parseFloat(selectQolGain.value) > 1 ? 1 / (parseFloat(selectQolGain.value) - 1) : Infinity;
        const raise = cut >= cap ? null : solve(x => u(x * T) - cut, 1, 1e3);
        const dbl  = solve(x => u(x * T) + u(2 * T), 0, 1);
        const legacy = prefs.legacyValue;
        qolMeaning.innerHTML = `<strong>At your plan's ${formatCurrency(T)}/yr:</strong> `
            + `a 10% cut (to ${formatCurrency(0.9 * T)}) needs `
            + (raise ? `a ${Math.round((raise - 1) * 100)}% raise (to ${formatCurrency(raise * T)}) to make up for it` : 'more than any raise can make up for')
            + ` · a year at double the plan makes up for a ${Math.round((1 - dbl) * 100)}% cut`
            + (legacy > 0 ? ` · leaving $1 is worth ${Math.round(legacy * 100)}¢ of extra spending.` : ' · leftover money is worth nothing.');
    } else {
        const floor = prefs.utility.floor, a = floor + 50000, b = floor + 100000;
        const ce = U.inv((U.u(a) + U.u(b)) / 2);
        qolMeaning.innerHTML = `<strong>At γ = ${prefs.utility.gamma}:</strong> a 50/50 shot at ${formatCurrency(a)} or `
            + `${formatCurrency(b)} a year feels like a sure ${formatCurrency(ce)}.`;
    }
}

// A simulated run as a Qol path. Working years are flagged so the target uses the plan's
// working-year spending (working-years-only recurring expenses) for them.
function toQolPath(run, startAge) {
    return {
        startAge,
        spend:   run.spendByAge,
        wealth:  run.solventByAge,
        working: run.workFracByAge.map(w => w > 0),
    };
}

function scoreQualityOfLife(runs, startAge) {
    const prefs = getQolPrefs();
    const paths = runs.map(r => toQolPath(r, startAge));
    const { ce, pathCE, refSpend } = Qol.evaluatePaths(paths, prefs);
    const S = Qol.survivalCurve(startAge, paths[0].spend.length, prefs.mortality);
    // Years below plan (any shortfall over $1), counted per run, survival-weighted when mortality is on.
    const belowByRun = runs.map(r => r.spendByAge.reduce((acc, c, t) =>
        acc + (c < r.plannedSpendByAge[t] - 1 ? S[t] : 0), 0)).sort((a, b) => a - b);
    const shortYears = belowByRun.reduce((s, v) => s + v, 0) / runs.length;
    const retiredSpend = [];
    runs.forEach(r => r.spendByAge.forEach((c, t) => { if (r.workFracByAge[t] === 0) retiredSpend.push(c); }));
    retiredSpend.sort((a, b) => a - b);
    return {
        ce,
        p10: percentile(pathCE, 10),
        p90: percentile(pathCE, 90),
        shortYears,
        shortYearsP90: percentile(belowByRun, 90),
        survivalAtHorizon: S[S.length - 1],
        pctOfPlan: refSpend ? ce / refSpend : null,
        retiredP10: retiredSpend.length ? percentile(retiredSpend, 10) : null,
        retiredP50: retiredSpend.length ? percentile(retiredSpend, 50) : null,
    };
}

function renderQualityOfLife() {
    applyQolModelUI();   // the "what this means" line follows the plan's spending
    if (!lastQolRuns) {
        mQol.innerText    = '—';
        mQolSub.innerText = '';
        strategyTableBody.innerHTML = '';
        return;
    }
    const kd = v => '$' + Math.round(v / 1000).toLocaleString() + 'k';
    const scores = {};
    for (const type of Engine.STRATEGIES) {
        scores[type] = scoreQualityOfLife(lastQolRuns.byStrategy[type].sims, lastQolRuns.startAge);
    }
    renderStrategyTable(scores, kd);

    const q = scores[lastQolRuns.selected];
    mQol.innerText = formatCurrency(q.ce) + '/yr';
    const parts = [(displayMode === 'nominal' ? "steady-spend equiv., today's $" : 'steady-spend equiv.')
                   + (q.pctOfPlan != null ? ` (${Math.round(q.pctOfPlan * 100)}% of plan)` : ''),
                   `10–90%: ${kd(q.p10)}–${kd(q.p90)}`, `avg ${q.shortYears.toFixed(1)} yrs below plan`
                   + (lastQolRuns.downsideBelow != null ? ` (orange run: ${lastQolRuns.downsideBelow})` : '')];
    // With mortality off, everyone "reaches" the horizon by assumption, so there is nothing to warn about.
    if (selectQolSex.value !== 'off' && q.survivalAtHorizon > 0.05) parts.push(`${Math.round(q.survivalAtHorizon * 100)}% outlive horizon`);
    mQolSub.innerText = parts.join(' · ');
}

function renderStrategyTable(scores, kd) {
    const best = Math.max(...Engine.STRATEGIES.map(t => scores[t].ce));
    strategyTableBody.innerHTML = Engine.STRATEGIES.map(type => {
        const q     = scores[type];
        const gap   = best - q.ce;
        const spend = q.retiredP50 == null ? '—' : `${kd(q.retiredP10)} / ${kd(q.retiredP50)}`;
        return `<tr data-strategy="${type}" class="${type === lastQolRuns.selected ? 'selected' : ''}">
            <td>${STRATEGY_INFO[type].label}${type === 'optimal' && lastOptimalModel
                ? `<span class="gap">solved for ${lastOptimalModel.short}${lastOptimalModel.matches ? '' : ' (≠ markets)'}</span>` : ''}</td>
            <td class="${gap < 1 ? 'best' : ''}">${formatCurrency(q.ce)}${gap >= 1 ? `<span class="gap">−${gap >= 1000 ? kd(gap) : '$' + Math.round(gap)}</span>` : ''}</td>
            <td>${kd(q.p10)}–${kd(q.p90)}</td>
            <td>${spend}</td>
            <td>${q.shortYears.toFixed(1)} / ${Math.round(q.shortYearsP90)}</td>
            <td>${lastQolRuns.byStrategy[type].successRate.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}

strategyTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-strategy]');
    if (!row || row.dataset.strategy === selectStrategy.value) return;
    selectStrategy.value = row.dataset.strategy;
    applyStrategyUI();
    updateSimulation();
});

selectStrategy.addEventListener('change', () => { applyStrategyUI(); updateSimulation(); });
[boxStrategyRate, boxStrategyRet, boxStrategyBand, boxStrategyAdjust].forEach(el =>
    el.addEventListener('change', updateSimulation));
// The Optimal return model changes only the solve, so keep the same simulated markets.
selectOptimalReturns.addEventListener('change', () => { applyStrategyUI(); updateSimulation({ reuseRuns: true }); });
[boxOptimalMean, boxOptimalStd].forEach(el => el.addEventListener('change', () => updateSimulation({ reuseRuns: true })));

// The optimal strategy depends on the QoL settings, so re-solve and re-run it — on the
// same return sequences, so only the scores move.
function onQolChange() {
    updateSimulation({ reuseRuns: true });
}

btnQol.addEventListener('click', () => {
    btnQol.classList.toggle('open');
    panelQol.classList.toggle('visible');
});
[selectQolDiscount, boxQolDiscount, boxQolEnjoy90, boxQolEnjoyFrom].forEach(el =>
    el.addEventListener('change', () => { applyQolModelUI(); onQolChange(); }));
boxQolGamma.addEventListener('change', () => { applyQolModelUI(); onQolChange(); });
selectQolSex.addEventListener('change', onQolChange);
[selectQolModel, selectQolGain].forEach(el => el.addEventListener('change', () => { applyQolModelUI(); onQolChange(); }));
[boxQolLoss, boxQolLegacy, boxQolFloor].forEach(el => el.addEventListener('change', () => { applyQolModelUI(); onQolChange(); }));

// ── Retire Mode Toggle ────────────────────────────────────────
function applyRetireMode() {
    const isNW = retireMode === 'nw';
    retireAgeGroup.style.display = isNW ? 'none'  : '';     // '' → controlled by .control-group CSS
    retireNWGroup.style.display  = isNW ? ''      : 'none'; // '' → controlled by .control-group CSS
    retireModeAge.classList.toggle('locked', !isNW);
    retireModeNW.classList.toggle('locked',   isNW);
}

retireModeAge.addEventListener('click', () => {
    if (retireMode === 'age') return;
    retireMode = 'age';
    applyRetireMode();
    updateSimulation();
});

retireModeNW.addEventListener('click', () => {
    if (retireMode === 'nw') return;
    retireMode = 'nw';
    applyRetireMode();
    updateSimulation();
});

// NW target input change
boxRetireNW.addEventListener('change', () => {
    document.getElementById('label-retire-nw').innerText = 'Retire at Net Worth: ' + formatCurrency(boxRetireNW.value);
    updateSimulation();
});
inputRetireNW.addEventListener('input', () => {
    boxRetireNW.value = inputRetireNW.value;
    document.getElementById('label-retire-nw').innerText = 'Retire at Net Worth: ' + formatCurrency(boxRetireNW.value);
    updateSimulation();
});
function toggleManualInputs() {
    const showAcc = selectGrowthMethodAcc.value === 'manual';
    const showDec = selectGrowthMethodDec.value === 'manual';
    manualInputsAcc.style.display = showAcc ? 'grid' : 'none';
    if (ratesLinked) {
        manualInputsDec.style.display = showAcc ? 'grid' : 'none';
    } else {
        manualInputsDec.style.display = showDec ? 'grid' : 'none';
    }
}

selectGrowthMethodAcc.addEventListener('change', () => {
    if (ratesLinked) {
        selectGrowthMethodDec.value = selectGrowthMethodAcc.value === 'cohort-equities' ? 'cohort-equities'
                                    : selectGrowthMethodAcc.value === 'cohort-6040'     ? 'cohort-6040'
                                    : selectGrowthMethodAcc.value;
    }
    toggleManualInputs();
    updateSimulation();
});
selectGrowthMethodDec.addEventListener('change', () => { toggleManualInputs(); updateSimulation(); });

// ── Input Linking ─────────────────────────────────────────────
function linkInputs(slider, box, labelUpdateFn) {
    slider.addEventListener('input', () => {
        box.value = slider.value;
        if (labelUpdateFn) labelUpdateFn(slider.value);
        updateSimulation();
    });
    box.addEventListener('change', () => {
        if (box.value === "") box.value = slider.value;
        slider.value = box.value;
        if (labelUpdateFn) labelUpdateFn(box.value);
        updateSimulation();
    });
}

// ── Button State Sync ─────────────────────────────────────────
function updateButtonStates() {
    const xLocked = boxAxisMin.value !== "" || boxAxisMax.value !== "";
    btnLockX.textContent = xLocked ? "Unlock Auto" : "Lock Current";
    btnLockX.classList.toggle('locked', xLocked);

    const yLocked = boxYMax.value !== "";
    btnLockY.textContent = yLocked ? "Unlock Auto" : "Lock Current";
    btnLockY.classList.toggle('locked', yLocked);

    const yLeftLocked = boxYLeftMin.value !== "" || boxYLeftMax.value !== "";
    btnLockYLeft.textContent = yLeftLocked ? "Unlock Auto" : "Lock Current";
    btnLockYLeft.classList.toggle('locked', yLeftLocked);
}

// ── Axis Lock Buttons ─────────────────────────────────────────
btnLockX.addEventListener('click', () => {
    if (boxAxisMin.value !== "" || boxAxisMax.value !== "") {
        boxAxisMin.value = "";
        boxAxisMax.value = "";
    } else {
        const xScale = chartInstance?.scales?.x;
        boxAxisMin.value = xScale ? Math.round(xScale.min) : parseInt(boxStartAge.value) || 0;
        boxAxisMax.value = xScale ? Math.round(xScale.max) : (parseInt(boxEndAge.value) || 95) + 1;
    }
    updateSimulation();
});

btnLockY.addEventListener('click', () => {
    if (boxYMax.value !== "") {
        boxYMax.value = "";
    } else {
        const yNwScale = chartInstance?.scales?.yNetWorth;
        if (yNwScale) boxYMax.value = Math.round(yNwScale.max);
    }
    updateSimulation();
});

btnLockYLeft.addEventListener('click', () => {
    if (boxYLeftMin.value !== "" || boxYLeftMax.value !== "") {
        boxYLeftMin.value = "";
        boxYLeftMax.value = "";
    } else {
        const yScale = chartInstance?.scales?.y;
        if (yScale) {
            boxYLeftMin.value = Math.round(yScale.min);
            boxYLeftMax.value = Math.round(yScale.max);
        }
    }
    updateSimulation();
});

mainLockBtn.addEventListener('click', () => {
    const allLocked = boxAxisMin.value  !== "" && boxAxisMax.value  !== ""
                   && boxYMax.value     !== "" && boxYLeftMin.value !== ""
                   && boxYLeftMax.value !== "";
    if (!allLocked) {
        const xScale   = chartInstance?.scales?.x;
        const yNwScale = chartInstance?.scales?.yNetWorth;
        const yScale   = chartInstance?.scales?.y;
        if (xScale)   { boxAxisMin.value  = Math.round(xScale.min);   boxAxisMax.value  = Math.round(xScale.max); }
        if (yNwScale) { boxYMax.value     = Math.round(yNwScale.max); }
        if (yScale)   { boxYLeftMin.value = Math.round(yScale.min);   boxYLeftMax.value = Math.round(yScale.max); }
        mainLockBtn.textContent = "Unlock Auto-Scale";
        mainLockBtn.classList.add('locked');
    } else {
        boxAxisMin.value  = "";
        boxAxisMax.value  = "";
        boxYMax.value     = "";
        boxYLeftMin.value = "";
        boxYLeftMax.value = "";
        mainLockBtn.textContent = "Lock Scale for Comparison";
        mainLockBtn.classList.remove('locked');
    }
    updateSimulation();
});

// ── Advanced Panel Toggle ─────────────────────────────────────
btnAdvanced.addEventListener('click', () => {
    btnAdvanced.classList.toggle('open');
    panelAdvanced.classList.toggle('visible');
});

// ── Rate Linking ──────────────────────────────────────────────
btnLinkRates.addEventListener('click', () => {
    ratesLinked = !ratesLinked;
    if (ratesLinked) {
        btnLinkRates.textContent = "Rates Linked";
        btnLinkRates.classList.add('locked');
        selectGrowthMethodDec.value = selectGrowthMethodAcc.value;
        boxGrowthMeanDec.value      = boxGrowthMeanAcc.value;
        boxGrowthStdDec.value       = boxGrowthStdAcc.value;
        selectGrowthMethodDec.disabled = boxGrowthMeanDec.disabled = boxGrowthStdDec.disabled = true;
    } else {
        btnLinkRates.textContent = "Link to Accumulation";
        btnLinkRates.classList.remove('locked');
        selectGrowthMethodDec.disabled = boxGrowthMeanDec.disabled = boxGrowthStdDec.disabled = false;
    }
    toggleManualInputs();
    updateSimulation();
});

// Keep decumulation in sync when accumulation changes while linked
boxGrowthMeanAcc.addEventListener('input', () => { if (ratesLinked) boxGrowthMeanDec.value = boxGrowthMeanAcc.value; updateSimulation(); });
boxGrowthStdAcc.addEventListener('input',  () => { if (ratesLinked) boxGrowthStdDec.value  = boxGrowthStdAcc.value;  updateSimulation(); });
boxGrowthMeanDec.addEventListener('input', updateSimulation);
boxGrowthStdDec.addEventListener('input',  updateSimulation);

// ── Dynamic Events ────────────────────────────────────────────
function renderDynamicEvents() {
    ssList.innerHTML       = '';
    windfallList.innerHTML = '';
    expenseList.innerHTML  = '';
    ssEvents.forEach(e       => ssList.appendChild(createEventUI(e, 'ss')));
    windfallEvents.forEach(e => windfallList.appendChild(createEventUI(e, 'wf')));
    expenses.forEach(e       => expenseList.appendChild(createExpenseUI(e)));
}

function createEventUI(event, type) {
    const row = document.createElement('div');
    row.className = 'interactive-row';
    row.innerHTML = `
        <input type="number" class="manual-box inp-amt" value="${event.amt}" placeholder="Amount ($)" style="flex:1;">
        <input type="number" class="manual-box inp-age" value="${event.age}" placeholder="Age" style="width:60px;">
        <button class="btn-delete">✕</button>
    `;
    const inpAmt = row.querySelector('.inp-amt');
    const inpAge = row.querySelector('.inp-age');
    const btnDel = row.querySelector('.btn-delete');

    inpAmt.addEventListener('change', () => { event.amt = parseFloat(inpAmt.value) || 0; updateSimulation(); });
    inpAge.addEventListener('change', () => { event.age = parseInt(inpAge.value)   || 0; updateSimulation(); });
    btnDel.addEventListener('click',  () => {
        if (type === 'ss') ssEvents       = ssEvents.filter(x => x.id !== event.id);
        else               windfallEvents = windfallEvents.filter(x => x.id !== event.id);
        renderDynamicEvents();
        updateSimulation();
    });
    return row;
}

btnAddSs.addEventListener('click', () => {
    if (ssEvents.length >= 100) return;
    ssEvents.push({ id: newId(), amt: 10000, age: 67 });
    renderDynamicEvents();
    updateSimulation();
});

btnAddWindfall.addEventListener('click', () => {
    if (windfallEvents.length >= 100) return;
    windfallEvents.push({ id: newId(), amt: 50000, age: 50 });
    renderDynamicEvents();
    updateSimulation();
});

// ── Recurring Expenses ────────────────────────────────────────
// Each end of the window is an age, retirement (each run's own retirement age in
// net-worth mode), or open (from now / to the end of the plan). The select picks
// which; the age box only shows for "age".
function createExpenseUI(expense) {
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.innerHTML = `
        <div class="interactive-row">
            <input type="number" class="manual-box inp-amt" value="${expense.amt}" step="1000" placeholder="Amount ($/yr)" style="flex:1;">
            <button class="btn-delete">✕</button>
        </div>
        <div class="expense-window">
            <div class="expense-anchor">
                <select class="sel-start">
                    <option value="open">From now</option>
                    <option value="age">From age</option>
                    <option value="R">From retirement</option>
                </select>
                <input type="number" class="inp-start" min="0" max="120" placeholder="Age">
            </div>
            <div class="expense-anchor">
                <select class="sel-end">
                    <option value="age">Until age</option>
                    <option value="R">Until retirement</option>
                    <option value="open">Until end of plan</option>
                </select>
                <input type="number" class="inp-end" min="0" max="120" placeholder="Age">
            </div>
        </div>
    `;

    const bindAnchor = (key, defaultAge) => {
        const sel  = row.querySelector('.sel-' + key);
        const inp  = row.querySelector('.inp-' + key);
        const read = () => {
            if (sel.value === 'R')    return Engine.RETIREMENT;
            if (sel.value === 'open') return null;
            const age = parseInt(inp.value);
            return Number.isNaN(age) ? null : age;   // blank age = open end
        };
        const v    = expense[key];
        sel.value  = v === Engine.RETIREMENT ? 'R' : typeof v === 'number' ? 'age' : 'open';
        inp.value  = typeof v === 'number' ? v : '';
        inp.hidden = sel.value !== 'age';

        sel.addEventListener('change', () => {
            inp.hidden = sel.value !== 'age';
            if (sel.value === 'age' && inp.value === '') inp.value = defaultAge;
            expense[key] = read();
            updateSimulation();
        });
        inp.addEventListener('change', () => { expense[key] = read(); updateSimulation(); });
    };
    bindAnchor('start', parseInt(boxStartAge.value) || 0);
    bindAnchor('end',   65);

    const inpAmt = row.querySelector('.inp-amt');
    inpAmt.addEventListener('change', () => { expense.amt = parseFloat(inpAmt.value) || 0; updateSimulation(); });
    row.querySelector('.btn-delete').addEventListener('click', () => {
        expenses = expenses.filter(x => x.id !== expense.id);
        renderDynamicEvents();
        updateSimulation();
    });
    return row;
}

btnAddExpense.addEventListener('click', () => {
    if (expenses.length >= 100) return;
    // Default: pre-Medicare health insurance, from retirement until 65.
    expenses.push({ id: newId(), amt: 15000, start: Engine.RETIREMENT, end: 65 });
    renderDynamicEvents();
    updateSimulation();
});

// ── Milestone UI ──────────────────────────────────────────────
function createMilestoneUI(milestone) {
    const block = document.createElement('div');
    block.className  = 'milestone-block';
    block.dataset.id = milestone.id;
    block.innerHTML  = `
        <div class="milestone-header">
            <div class="milestone-title">Event Milestone</div>
            <button class="btn-delete" onclick="removeMilestone('${milestone.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
        <div class="input-row">
            <div class="control-group">
                <label class="control-label">Start Age</label>
                <input type="number" class="inp-age"      value="${milestone.age}"      min="0" max="120">
            </div>
            <div class="control-group">
                <label class="control-label">Net Income</label>
                <input type="number" class="inp-income"   value="${milestone.income}"   step="1000">
            </div>
        </div>
        <div class="input-row">
            <div class="control-group">
                <label class="control-label">Lifestyle Spending</label>
                <input type="number" class="inp-spending" value="${milestone.spending}" step="1000">
            </div>
            <div class="control-group">
                <label class="control-label">Annual Savings</label>
                <input type="number" class="inp-savings"  value="${milestone.savings}"  step="1000">
            </div>
        </div>
    `;

    const inpAge      = block.querySelector('.inp-age');
    const inpIncome   = block.querySelector('.inp-income');
    const inpSpending = block.querySelector('.inp-spending');
    const inpSavings  = block.querySelector('.inp-savings');

    // I = S + C: keep the three fields consistent
    inpAge.addEventListener('change',     () => syncDataAndSort());
    inpIncome.addEventListener('input',   () => { inpSavings.value  = inpIncome.value - inpSpending.value; syncDataAndSort(); });
    inpSpending.addEventListener('input', () => { inpSavings.value  = inpIncome.value - inpSpending.value; syncDataAndSort(); });
    inpSavings.addEventListener('input',  () => { inpSpending.value = inpIncome.value - inpSavings.value;  syncDataAndSort(); });

    return block;
}

function addMilestone(age = 30, income = 60000, savings = 15000, spending = 45000) {
    milestones.push({ id: newId(), age, income, savings, spending });
    renderMilestones();
}

function removeMilestone(id) {
    if (milestones.length <= 1) return;
    milestones = milestones.filter(m => m.id !== id);
    renderMilestones();
}

function syncDataAndSort() {
    const blocks = document.querySelectorAll('.milestone-block');
    milestones = Array.from(blocks).map(block => ({
        id:       block.dataset.id,
        age:      parseInt(block.querySelector('.inp-age').value)       || 0,
        income:   parseFloat(block.querySelector('.inp-income').value)  || 0,
        spending: parseFloat(block.querySelector('.inp-spending').value) || 0,
        savings:  parseFloat(block.querySelector('.inp-savings').value)  || 0,
    }));
    milestones.sort((a, b) => a.age - b.age);
    updateSimulation();
}

function renderMilestones() {
    const scrollPos = milestoneContainer.parentElement.scrollTop;
    milestoneContainer.innerHTML = '';
    milestones.sort((a, b) => a.age - b.age);
    milestones.forEach(m => milestoneContainer.appendChild(createMilestoneUI(m)));
    milestoneContainer.parentElement.scrollTop = scrollPos;
    updateSimulation();
}

addEventBtn.addEventListener('click', () => {
    const last = milestones.length > 0 ? milestones[milestones.length - 1] : { age: 30, income: 60000, spending: 45000, savings: 15000 };
    addMilestone(last.age + 10, last.income, last.savings, last.spending);
});

// ── Display Mode (Real / Nominal) ─────────────────────────────
function setDisplayMode(mode) {
    displayMode = (mode === 'nominal') ? 'nominal' : 'real';
    displayToggle.querySelectorAll('.seg-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.mode === displayMode));
    inflationGroup.style.display = displayMode === 'nominal' ? 'flex' : 'none';
}

displayToggle.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setDisplayMode(btn.dataset.mode);
        updateSimulation();
    });
});

chkBuyingPower.addEventListener('change', updateSimulation);
linkInputs(inputInflation, boxInflation, (val) => {
    document.getElementById('label-inflation').innerText = 'Assumed Inflation Rate: ' + parseFloat(val).toFixed(1) + '%';
});

// ── URL Persistence ───────────────────────────────────────────
function updateURLParams() {
    const params = new URLSearchParams();
    params.set('startAge',    boxStartAge.value);
    params.set('endAge',      boxEndAge.value);
    params.set('retireMode',  retireMode);
    params.set('mode',        displayMode);
    params.set('inflation',   boxInflation.value);
    params.set('bp',          chkBuyingPower.checked ? '1' : '0');
    params.set('principal',   boxPrincipal.value);
    params.set('legacyFloor', boxLegacyFloor.value);
    if (retireMode === 'age') params.set('retireAge', boxRetireAge.value);
    else                      params.set('retireNW',  boxRetireNW.value);
    params.set('linked',      ratesLinked);
    params.set('ss',          JSON.stringify(ssEvents.map(e => [e.amt, e.age])));
    params.set('wf',          JSON.stringify(windfallEvents.map(e => [e.amt, e.age])));
    params.set('ex',          JSON.stringify(expenses.map(e => [e.amt, e.start, e.end])));
    params.set('m',          JSON.stringify(milestones.map(m => [m.age, m.income, m.savings, m.spending])));
    params.set('qd',          selectQolDiscount.value);
    params.set('qdr',         boxQolDiscount.value);
    params.set('qa90',        boxQolEnjoy90.value);
    params.set('qaf',         boxQolEnjoyFrom.value);
    params.set('qg',          boxQolGamma.value);
    params.set('qf',          boxQolFloor.value);
    params.set('qm',          selectQolModel.value);
    params.set('ql',          boxQolLoss.value);
    params.set('qe',          selectQolGain.value);
    params.set('qlv',         boxQolLegacy.value);
    params.set('qs',          selectQolSex.value);
    params.set('st',          selectStrategy.value);
    params.set('sr',          boxStrategyRate.value);
    params.set('sret',        boxStrategyRet.value);
    params.set('sb',          boxStrategyBand.value);
    params.set('sa',          boxStrategyAdjust.value);
    params.set('osrc',        selectOptimalReturns.value);
    params.set('om',          boxOptimalMean.value);
    params.set('osd',         boxOptimalStd.value);
    if (boxAxisMin.value  !== "") params.set('xMin',     boxAxisMin.value);
    if (boxAxisMax.value  !== "") params.set('xMax',     boxAxisMax.value);
    if (boxYMax.value     !== "") params.set('yMax',     boxYMax.value);
    if (boxYLeftMin.value !== "") params.set('yLeftMin', boxYLeftMin.value);
    if (boxYLeftMax.value !== "") params.set('yLeftMax', boxYLeftMax.value);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function loadParamsFromURL() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('startAge'))    boxStartAge.value    = sliderStartAge.value    = p.get('startAge');
    if (p.has('endAge'))      boxEndAge.value      = sliderEndAge.value      = p.get('endAge');
    if (p.has('retireAge'))   boxRetireAge.value   = sliderRetireAge.value   = p.get('retireAge');
    if (p.has('retireNW'))    boxRetireNW.value    = inputRetireNW.value     = p.get('retireNW');
    if (p.has('retireMode'))  retireMode           = p.get('retireMode');
    if (p.has('principal'))   boxPrincipal.value   = inputPrincipal.value    = p.get('principal');
    if (p.has('legacyFloor')) boxLegacyFloor.value = sliderLegacyFloor.value = p.get('legacyFloor');
    if (p.has('inflation'))   boxInflation.value   = inputInflation.value    = p.get('inflation');
    if (p.has('bp'))          chkBuyingPower.checked = p.get('bp') !== '0';
    if (p.has('mode'))        setDisplayMode(p.get('mode'));
    if (p.has('xMin'))     boxAxisMin.value  = p.get('xMin');
    if (p.has('xMax'))     boxAxisMax.value  = p.get('xMax');
    if (p.has('yMax'))     boxYMax.value     = p.get('yMax');
    if (p.has('yLeftMin')) boxYLeftMin.value = p.get('yLeftMin');
    if (p.has('yLeftMax')) boxYLeftMax.value = p.get('yLeftMax');
    if (p.has('qd') && ['match', 'custom'].includes(p.get('qd'))) selectQolDiscount.value = p.get('qd');
    if (p.has('qdr'))  boxQolDiscount.value  = p.get('qdr');
    if (p.has('qa90')) boxQolEnjoy90.value   = p.get('qa90');
    if (p.has('qaf'))  boxQolEnjoyFrom.value = p.get('qaf');
    if (p.has('qg')) boxQolGamma.value = p.get('qg');
    if (p.has('qf')) boxQolFloor.value = p.get('qf');
    if (p.has('qm') && ['target', 'crra'].includes(p.get('qm'))) selectQolModel.value = p.get('qm');
    if (p.has('ql'))    boxQolLoss.value   = p.get('ql');
    if (p.has('qe') && ['1', '2', '4'].includes(p.get('qe'))) selectQolGain.value = p.get('qe');
    if (p.has('qlv'))   boxQolLegacy.value = p.get('qlv');
    if (p.has('qs') && ['unisex', 'female', 'male', 'off'].includes(p.get('qs'))) selectQolSex.value = p.get('qs');
    if (p.has('st') && Engine.STRATEGIES.includes(p.get('st'))) selectStrategy.value = p.get('st');
    if (p.has('sr'))   boxStrategyRate.value   = p.get('sr');
    if (p.has('sret')) boxStrategyRet.value    = p.get('sret');
    if (p.has('sb'))   boxStrategyBand.value   = p.get('sb');
    if (p.has('sa'))   boxStrategyAdjust.value = p.get('sa');
    if (p.has('osrc') && ['match', '60-40', 'equities', 'manual'].includes(p.get('osrc'))) selectOptimalReturns.value = p.get('osrc');
    if (p.has('om'))   boxOptimalMean.value    = p.get('om');
    if (p.has('osd'))  boxOptimalStd.value     = p.get('osd');

    if (p.has('ss')) ssEvents       = JSON.parse(p.get('ss')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));
    if (p.has('wf')) windfallEvents = JSON.parse(p.get('wf')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));
    if (p.has('ex')) {
        try {
            expenses = JSON.parse(p.get('ex')).map(d => ({ id: newId(), amt: d[0], start: d[1], end: d[2] }));
        } catch (e) { console.error("Failed to parse recurring expenses from URL", e); }
    }

    if (p.get('linked') === 'true') {
        ratesLinked = true;
        btnLinkRates.textContent = "Rates Linked";
        btnLinkRates.classList.add('locked');
        selectGrowthMethodDec.disabled = true;
        boxGrowthMeanDec.disabled      = true;
        boxGrowthStdDec.disabled       = true;
        toggleManualInputs();
    }

    if (p.has('xMin') || p.has('xMax') || p.has('yMax') || p.has('yLeftMin') || p.has('yLeftMax')) {
        mainLockBtn.textContent = "Unlock Auto-Scale";
        mainLockBtn.classList.add('locked');
    }

    if (p.has('m')) {
        try {
            milestones = JSON.parse(p.get('m')).map(m => ({ id: newId(), age: m[0], income: m[1], savings: m[2], spending: m[3] }));
        } catch (e) { console.error("Failed to parse milestones from URL", e); }
    }
}

// ── Wire Up All Inputs ────────────────────────────────────────
linkInputs(sliderStartAge,   boxStartAge);
linkInputs(sliderEndAge,     boxEndAge);
linkInputs(sliderRetireAge,  boxRetireAge);
linkInputs(inputPrincipal,   boxPrincipal, (val) => {
    document.getElementById('label-principal').innerText = 'Starting Balance: ' + formatCurrency(val);
});
linkInputs(sliderLegacyFloor, boxLegacyFloor, (val) => {
    document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: ' + formatCurrency(val);
});

boxAxisMin.addEventListener('change', updateSimulation);
boxAxisMax.addEventListener('change', updateSimulation);
boxYMax.addEventListener('change',    updateSimulation);
boxYLeftMin.addEventListener('change', updateSimulation);
boxYLeftMax.addEventListener('change', updateSimulation);

// ── Boot ──────────────────────────────────────────────────────
loadParamsFromURL();
applyRetireMode();
applyStrategyUI();

document.getElementById('label-principal').innerText    = 'Starting Balance: '     + formatCurrency(boxPrincipal.value);
document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: ' + formatCurrency(boxLegacyFloor.value);
document.getElementById('label-inflation').innerText    = 'Assumed Inflation Rate: ' + parseFloat(boxInflation.value).toFixed(1) + '%';

if (milestones.length === 0) {
    addMilestone(30, 60000, 15000, 45000);
} else {
    renderMilestones();
}
renderDynamicEvents();
