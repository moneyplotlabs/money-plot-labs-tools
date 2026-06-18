/* ============================================================
   lifepath.js — Cash Flow Planner (Tool 2)
   Year-by-year lifepath simulator with milestone cash-flow engine.
   Depends on: Chart.js 3.x (global), styles.css
   ============================================================ */

// ── DOM References ────────────────────────────────────────────
const milestoneContainer = document.getElementById('milestone-container');
const addEventBtn        = document.getElementById('add-event-btn');
const loader             = document.getElementById('chart-loader');

const sliderStartAge     = document.getElementById('slider-start-age');
const boxStartAge        = document.getElementById('box-start-age');
const sliderEndAge       = document.getElementById('slider-end-age');
const boxEndAge          = document.getElementById('box-end-age');

const inputPrincipal     = document.getElementById('input-principal');
const boxPrincipal       = document.getElementById('box-principal');
const inputGrowth        = document.getElementById('input-growth');
const boxGrowth          = document.getElementById('box-growth');
const inputGrowthDec     = document.getElementById('input-growth-dec');
const boxGrowthDec       = document.getElementById('box-growth-dec');

const btnLinkRates       = document.getElementById('btn-link-rates');
const btnAdvanced        = document.getElementById('advanced-button');
const panelAdvanced      = document.getElementById('advanced-panel');

const sliderLegacyFloor  = document.getElementById('slider-legacy-floor');
const boxLegacyFloor     = document.getElementById('box-legacy-floor');

const boxAxisMin         = document.getElementById('box-axis-min');
const boxAxisMax         = document.getElementById('box-axis-max');
const boxYMax            = document.getElementById('box-y-max');
const boxYLeftMin        = document.getElementById('box-y-left-min');
const boxYLeftMax        = document.getElementById('box-y-left-max');

const mainLockBtn        = document.getElementById('main-chart-lock');
const btnLockX           = document.getElementById('btn-lock-x');
const btnLockY           = document.getElementById('btn-lock-y');
const btnLockYLeft       = document.getElementById('btn-lock-y-left');

const ssList             = document.getElementById('ss-list');
const windfallList       = document.getElementById('windfall-list');
const btnAddSs           = document.getElementById('btn-add-ss');
const btnAddWindfall     = document.getElementById('btn-add-windfall');

const mWorkYears         = document.getElementById('metric-work-years');
const mRetireAge         = document.getElementById('metric-retire-age');
const mPeakNw            = document.getElementById('metric-peak-nw');
const mPeakNwLabel       = document.getElementById('metric-peak-nw-label');
const mPeakNwRef         = document.getElementById('metric-peak-nw-ref');

const displayToggle      = document.getElementById('display-mode-toggle');
const inflationGroup     = document.getElementById('inflation-group');
const inputInflation     = document.getElementById('input-inflation');
const boxInflation       = document.getElementById('box-inflation');
const chkBuyingPower     = document.getElementById('chk-buying-power');

// ── State ─────────────────────────────────────────────────────
let chartInstance         = null;
let ratesLinked           = false;
let computedMinFlowCache  = 0;
let computedPeakFlowCache = 0;
let computedPeakCache     = 0;
let displayMode           = 'real';   // 'real' (today's $) or 'nominal' (future $)
let lockedBpLevels        = null;     // frozen buying-power levels while an axis is locked

let milestones    = [];
let ssEvents      = [];
let windfallEvents = [];

// ── Helpers ──────────────────────────────────────────
// formatCurrency, newId, snapCeiling, snapFloor, snapFlowCeiling → common.js

// ── Chart Init ────────────────────────────────────────────────
function initChart() {
    const ctx = document.getElementById('lifepathChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
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
                    label:           'Asset Growth',
                    data:            [],
                    backgroundColor: 'rgba(139, 92, 246, 0.6)',
                    borderColor:     '#8B5CF6',
                    borderWidth:     1,
                    stack:           'flow',
                    yAxisID:         'y',
                },
                {
                    label:       'Projected Net Worth',
                    data:        [],
                    type:        'line',
                    borderColor: '#3b82f6',
                    borderWidth: 3,
                    pointRadius: 0,
                    yAxisID:     'yNetWorth',
                    fill:        false,
                    tension:     0.1,
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
                    position:     'right',
                    stacked:      true,
                    grid:         { display: false },
                    beginAtZero:  true,
                    ticks:        { color: '#94a3b8', callback: (v) => '$' + Math.abs(v).toLocaleString() },
                    title:        { display: true, text: 'Annual Cash Flow ($)', color: '#94a3b8' },
                },
            },
            plugins: {
                legend:  {
                    labels: { color: '#f8fafc' },
                },
                tooltip: {
                    mode:      'nearest',
                    axis:      'x',
                    intersect: false,
                    callbacks: {
                        title: (ctx) => 'Age ' + ctx[0].parsed.x.toFixed(1),
                        label: (ctx) => ctx.dataset.isBuyingPower
                            ? 'Equal buying power: $' + Math.abs(Math.round((ctx.raw && ctx.raw.yReal) || 0)).toLocaleString() + " today"
                            : (ctx.dataset.label || '') + ': $' + Math.abs(ctx.parsed.y).toLocaleString(),
                        afterLabel: (ctx) => (displayMode === 'nominal' && !ctx.dataset.isBuyingPower
                                && ctx.raw != null && ctx.raw.yReal != null)
                            ? "≈ $" + Math.abs(Math.round(ctx.raw.yReal)).toLocaleString() + " in today's $"
                            : undefined,
                    },
                },
            },
        },
    });
    loader.style.display = 'none';
}

// ── Simulation ────────────────────────────────────────────────
// Pure year-by-year math lives in engine.js (Engine.simulateLife). This thin
// wrapper injects milestones + event state so existing call sites are unchanged.
function simulateLife(startAge, endAge, principal, rAcc, rDec, rAge, planningEndAge) {
    return Engine.simulateLife(startAge, endAge, principal, rAcc, rDec, rAge, planningEndAge, {
        milestones: milestones,
        ss:         ssEvents,
        windfall:   windfallEvents,
    });
}

// ── Nominal-display helpers ───────────────────────────────────
// Scale a real {x:age, y:value} series to nominal future dollars, preserving the
// real value as yReal for tooltip reference. Null gaps (post-planning) are kept.
function scaleNominal(series, currentAge, infl) {
    return series.map(pt => (pt.y === null || pt.y === undefined)
        ? { x: pt.x, y: null, yReal: null }
        : { x: pt.x, y: pt.y * Math.pow(1 + infl, pt.x - currentAge), yReal: pt.y });
}

// One family of dashed equal-buying-power curves: each constant today's-dollar
// level shown as it inflates into future dollars across the visible age range.
function buyingPowerFamily(levels, axisID, currentAge, infl, lo, hi, color, stackPrefix) {
    return levels.map((level, i) => {
        const data = [];
        for (let age = lo; age <= hi; age++) {
            data.push({ x: age, y: level * Math.pow(1 + infl, age - currentAge), yReal: level });
        }
        const ds = {
            label:        'Buying power: ' + formatCurrency(level) + " (today's $)",
            data,
            type:         'line',
            yAxisID:      axisID,
            borderColor:  color,
            borderDash:   [4, 4],
            borderWidth:  1,
            pointRadius:  0,
            fill:         false,
            tension:      0,
            order:        20,
            isBuyingPower: true,
        };
        if (stackPrefix) ds.stack = stackPrefix + i;   // keep each off the bar stack
        return ds;
    });
}

// ── Simulation Entry Point ────────────────────────────────────
function updateSimulation() {
    if (!chartInstance) initChart();
    if (milestones.length === 0) return;

    const currentAge = parseInt(boxStartAge.value);
    const stopAge    = parseInt(boxEndAge.value);
    const principal  = parseFloat(boxPrincipal.value) || 0;
    const rAcc       = (parseFloat(boxGrowth.value)    || 0) / 100;
    const rDec       = (parseFloat(boxGrowthDec.value) || 0) / 100;
    const floor      = parseFloat(boxLegacyFloor.value) || 0;

    // Bisection solver: find minimum working years
    const horizon    = stopAge - currentAge + 1;
    const resAtH     = simulateLife(currentAge, stopAge, principal, rAcc, rDec, currentAge + horizon, stopAge);
    const resAtStart = simulateLife(currentAge, stopAge, principal, rAcc, rDec, currentAge,           stopAge);

    let w;
    if (resAtStart.finalBalance >= floor) {
        w = 0;
    } else if (resAtH.finalBalance < floor) {
        w = horizon;
    } else {
        let low = currentAge, high = currentAge + horizon;
        for (let i = 0; i < 60; i++) {
            const mid = (low + high) / 2;
            if (simulateLife(currentAge, stopAge, principal, rAcc, rDec, mid, stopAge).finalBalance < floor) low = mid;
            else high = mid;
        }
        w = ((low + high) / 2) - currentAge;
    }

    const rAge    = currentAge + w;
    const finalSim = simulateLife(currentAge, stopAge, principal, rAcc, rDec, rAge, stopAge);

    const nominal = displayMode === 'nominal';
    const infl    = (parseFloat(boxInflation.value) || 0) / 100;

    // Nest egg at the moment of retirement (real). The right-axis net-worth line
    // peaks here and then declines in real terms; in nominal terms it keeps rising
    // afterward even as buying power falls, so we report the retirement value.
    let realNestEgg = finalSim.peakNw;
    {
        let best = null;
        finalSim.nwData.forEach(p => { if (p.y != null && p.x <= rAge + 1e-9 && (!best || p.x > best.x)) best = p; });
        if (best) realNestEgg = best.y;
    }

    // Metrics
    mWorkYears.innerText = w.toFixed(1) + ' Years';
    mRetireAge.innerText = (w >= (stopAge - currentAge) && resAtH.finalBalance < floor)
        ? 'Never' : 'Age ' + rAge.toFixed(1);
    if (nominal) {
        mPeakNwLabel.innerText = 'Nest Egg at Retirement';
        mPeakNw.innerText      = formatCurrency(realNestEgg * Math.pow(1 + infl, rAge - currentAge));
        mPeakNwRef.innerText   = '≈ ' + formatCurrency(realNestEgg) + " in today's $";
    } else {
        mPeakNwLabel.innerText = 'Peak Nest Egg Needed';
        mPeakNw.innerText      = formatCurrency(finalSim.peakNw);
        mPeakNwRef.innerText   = '';
    }

    // Dynamic labels
    document.getElementById('label-principal').innerText    = 'Starting Balance: '              + formatCurrency(principal);
    document.getElementById('label-growth').innerText       = 'Real Growth Rate during accumulation: ' + (rAcc * 100).toFixed(1) + '%';
    document.getElementById('label-growth-dec').innerText   = 'Real Growth Rate (Decumulation): '      + (rDec * 100).toFixed(1) + '%';
    document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: '          + formatCurrency(floor);
    document.getElementById('label-inflation').innerText    = 'Assumed Inflation Rate: '        + (infl * 100).toFixed(1) + '%';

    // View clamping
    const axisMin          = boxAxisMin.value   !== "" ? parseInt(boxAxisMin.value)   : currentAge;
    const axisMax          = boxAxisMax.value   !== "" ? parseInt(boxAxisMax.value)   : stopAge + 1;
    const yMaxConstraint   = boxYMax.value      !== "" ? parseFloat(boxYMax.value)    : undefined;
    const yLeftMinCon      = boxYLeftMin.value  !== "" ? parseFloat(boxYLeftMin.value): undefined;
    const yLeftMaxCon      = boxYLeftMax.value  !== "" ? parseFloat(boxYLeftMax.value): undefined;

    const viewSim = simulateLife(currentAge, Math.max(stopAge, axisMax), principal, rAcc, rDec, rAge, stopAge);

    // Plotted series — inflated to future dollars in nominal mode (real value kept
    // as yReal for tooltips). Track the nominal flow range / net-worth peak so the
    // axes can be scaled to the displayed data.
    let inflow = viewSim.inflowData, outflow = viewSim.outflowData, growth = viewSim.growthData, nw = viewSim.nwData;
    let nomPeakFlow = 0, nomMinFlow = 0, nomNwPeak = 0;
    if (nominal) {
        inflow  = scaleNominal(viewSim.inflowData,  currentAge, infl);
        outflow = scaleNominal(viewSim.outflowData, currentAge, infl);
        growth  = scaleNominal(viewSim.growthData,  currentAge, infl);
        nw      = scaleNominal(viewSim.nwData,      currentAge, infl);
        for (let i = 0; i < inflow.length; i++) {
            const pos = Math.max(0, inflow[i].y || 0) + Math.max(0, growth[i].y || 0);
            const neg = Math.min(0, outflow[i].y || 0);
            if (pos > nomPeakFlow) nomPeakFlow = pos;
            if (neg < nomMinFlow)  nomMinFlow  = neg;
        }
        nw.forEach(p => { if (p.y != null && p.y > nomNwPeak) nomNwPeak = p.y; });
    }

    // Lock-button caches reflect the displayed scale.
    computedPeakCache     = nominal ? nomNwPeak   : finalSim.peakNw;
    computedPeakFlowCache = nominal ? nomPeakFlow : finalSim.peakFlow;
    computedMinFlowCache  = nominal ? nomMinFlow  : finalSim.minFlow;

    // Equal-buying-power curves (nominal mode only) on the net-worth axis. The
    // cash-flow bars already represent constant real flows, so they are their own
    // buying-power reference and need no separate curves.
    // Buying-power levels: recompute from the current peak while unlocked (and cache
    // them); once any axis is locked, reuse the frozen levels so the curves stay put
    // for scale-locked comparisons.
    const anyAxisLocked = boxAxisMin.value !== "" || boxAxisMax.value !== "" || boxYMax.value !== ""
                       || boxYLeftMin.value !== "" || boxYLeftMax.value !== "";
    const showBp = nominal && chkBuyingPower.checked;
    let bpDatasets = [];
    if (showBp) {
        const lo = Math.floor(axisMin), hi = Math.ceil(axisMax);
        let nwLevels = [];
        if (anyAxisLocked && lockedBpLevels) {
            nwLevels = lockedBpLevels;
        } else if (finalSim.peakNw > 0) {
            const stepN = snapCeiling(finalSim.peakNw) / 4;
            nwLevels = [1, 2, 3, 4].map(k => k * stepN);
            if (!anyAxisLocked) lockedBpLevels = nwLevels;
        }
        if (nwLevels.length) {
            bpDatasets = buyingPowerFamily(nwLevels, 'yNetWorth', currentAge, infl, lo, hi, 'rgba(234, 179, 8, 0.55)', null);
        }
    }

    chartInstance.data.labels           = viewSim.labels;
    chartInstance.data.datasets[0].data = inflow;
    chartInstance.data.datasets[1].data = outflow;
    chartInstance.data.datasets[2].data = growth;
    chartInstance.data.datasets[3].data = nw;
    chartInstance.data.datasets.splice(4);                 // drop any prior buying-power lines
    bpDatasets.forEach(ds => chartInstance.data.datasets.push(ds));

    chartInstance.options.scales.x.min = axisMin;
    chartInstance.options.scales.x.max = axisMax;

    if (nominal) {
        const flowMax = yLeftMaxCon !== undefined ? yLeftMaxCon : snapFlowCeiling(nomPeakFlow);
        const flowMin = yLeftMinCon !== undefined ? yLeftMinCon : (nomMinFlow < 0 ? snapFloor(nomMinFlow) : 0);
        const nwMax   = yMaxConstraint !== undefined ? yMaxConstraint : (nomNwPeak > 0 ? snapCeiling(nomNwPeak) : undefined);
        chartInstance.options.scales.y.min         = flowMin;
        chartInstance.options.scales.y.max         = flowMax;
        chartInstance.options.scales.yNetWorth.max = nwMax;
    } else {
        chartInstance.options.scales.y.min         = yLeftMinCon;
        chartInstance.options.scales.y.max         = yLeftMaxCon;
        chartInstance.options.scales.yNetWorth.max = yMaxConstraint;
    }
    chartInstance.update('none');

    updateButtonStates();
    updateURLParams();
}

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
        boxAxisMin.value = parseInt(boxStartAge.value) || 0;
        boxAxisMax.value = (parseInt(boxEndAge.value) || 95) + 1;
    }
    updateSimulation();
});

btnLockY.addEventListener('click', () => {
    if (boxYMax.value !== "") {
        boxYMax.value = "";
    } else if (computedPeakCache > 0) {
        boxYMax.value = snapCeiling(computedPeakCache);
    }
    updateSimulation();
});

btnLockYLeft.addEventListener('click', () => {
    if (boxYLeftMin.value !== "" || boxYLeftMax.value !== "") {
        boxYLeftMin.value = "";
        boxYLeftMax.value = "";
    } else {
        boxYLeftMin.value = computedMinFlowCache < 0 ? snapFloor(computedMinFlowCache) : "0";
        boxYLeftMax.value = snapFlowCeiling(computedPeakFlowCache);
    }
    updateSimulation();
});

mainLockBtn.addEventListener('click', () => {
    const allLocked = boxAxisMin.value !== "" && boxAxisMax.value !== ""
                   && boxYMax.value    !== "" && boxYLeftMin.value !== ""
                   && boxYLeftMax.value !== "";

    if (!allLocked) {
        boxAxisMin.value  = parseInt(boxStartAge.value) || 0;
        boxAxisMax.value  = (parseInt(boxEndAge.value) || 95) + 1;
        if (computedPeakCache > 0) boxYMax.value = snapCeiling(computedPeakCache);
        boxYLeftMin.value = computedMinFlowCache < 0 ? snapFloor(computedMinFlowCache) : "0";
        boxYLeftMax.value = snapFlowCeiling(computedPeakFlowCache);
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
        btnLinkRates.textContent     = "Rates Linked";
        btnLinkRates.classList.add('locked');
        boxGrowthDec.value           = boxGrowth.value;
        inputGrowthDec.value         = inputGrowth.value;
        inputGrowthDec.disabled      = true;
        boxGrowthDec.disabled        = true;
    } else {
        btnLinkRates.textContent     = "Link to Accumulation";
        btnLinkRates.classList.remove('locked');
        inputGrowthDec.disabled      = false;
        boxGrowthDec.disabled        = false;
    }
    updateSimulation();
});

// ── Dynamic Events ────────────────────────────────────────────
function renderDynamicEvents() {
    ssList.innerHTML       = '';
    windfallList.innerHTML = '';
    ssEvents.forEach(e       => ssList.appendChild(createEventUI(e, 'ss')));
    windfallEvents.forEach(e => windfallList.appendChild(createEventUI(e, 'wf')));
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
                <input type="number" class="inp-age"     value="${milestone.age}"     min="0" max="120">
            </div>
            <div class="control-group">
                <label class="control-label">Gross Income</label>
                <input type="number" class="inp-income"  value="${milestone.income}"  step="1000">
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

    const inpAge     = block.querySelector('.inp-age');
    const inpIncome  = block.querySelector('.inp-income');
    const inpSpending = block.querySelector('.inp-spending');
    const inpSavings = block.querySelector('.inp-savings');

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
        age:      parseInt(block.querySelector('.inp-age').value)      || 0,
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
    params.set('principal',   boxPrincipal.value);
    params.set('growth',      boxGrowth.value);
    params.set('growthDec',   boxGrowthDec.value);
    params.set('legacyFloor', boxLegacyFloor.value);
    params.set('linked',      ratesLinked);
    params.set('mode',        displayMode);
    params.set('inflation',   boxInflation.value);
    params.set('bp',          chkBuyingPower.checked ? '1' : '0');
    params.set('ss',          JSON.stringify(ssEvents.map(e => [e.amt, e.age])));
    params.set('wf',          JSON.stringify(windfallEvents.map(e => [e.amt, e.age])));
    params.set('m',           JSON.stringify(milestones.map(m => [m.age, m.income, m.savings, m.spending])));
    if (boxAxisMin.value   !== "") params.set('xMin',     boxAxisMin.value);
    if (boxAxisMax.value   !== "") params.set('xMax',     boxAxisMax.value);
    if (boxYMax.value      !== "") params.set('yMax',     boxYMax.value);
    if (boxYLeftMin.value  !== "") params.set('yLeftMin', boxYLeftMin.value);
    if (boxYLeftMax.value  !== "") params.set('yLeftMax', boxYLeftMax.value);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function loadParamsFromURL() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('startAge'))    boxStartAge.value    = sliderStartAge.value    = p.get('startAge');
    if (p.has('endAge'))      boxEndAge.value      = sliderEndAge.value      = p.get('endAge');
    if (p.has('principal'))   boxPrincipal.value   = inputPrincipal.value    = p.get('principal');
    if (p.has('growth'))      boxGrowth.value      = inputGrowth.value       = p.get('growth');
    if (p.has('growthDec'))   boxGrowthDec.value   = inputGrowthDec.value    = p.get('growthDec');
    if (p.has('legacyFloor')) boxLegacyFloor.value = sliderLegacyFloor.value = p.get('legacyFloor');
    if (p.has('inflation'))   boxInflation.value   = inputInflation.value    = p.get('inflation');
    if (p.has('bp'))          chkBuyingPower.checked = p.get('bp') !== '0';
    if (p.has('mode'))        setDisplayMode(p.get('mode'));
    if (p.has('xMin'))        boxAxisMin.value  = p.get('xMin');
    if (p.has('xMax'))        boxAxisMax.value  = p.get('xMax');
    if (p.has('yMax'))        boxYMax.value     = p.get('yMax');
    if (p.has('yLeftMin'))    boxYLeftMin.value = p.get('yLeftMin');
    if (p.has('yLeftMax'))    boxYLeftMax.value = p.get('yLeftMax');
    if (p.has('ss')) ssEvents       = JSON.parse(p.get('ss')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));
    if (p.has('wf')) windfallEvents = JSON.parse(p.get('wf')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));

    if (p.get('linked') === 'true') {
        ratesLinked                  = true;
        btnLinkRates.textContent     = "Rates Linked";
        btnLinkRates.classList.add('locked');
        inputGrowthDec.disabled      = true;
        boxGrowthDec.disabled        = true;
    }

    const anyAxisLocked = p.has('xMin') || p.has('xMax') || p.has('yMax') || p.has('yLeftMin') || p.has('yLeftMax');
    if (anyAxisLocked) {
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
linkInputs(sliderStartAge, boxStartAge);
linkInputs(sliderEndAge,   boxEndAge);
linkInputs(inputPrincipal, boxPrincipal, (val) => {
    document.getElementById('label-principal').innerText = 'Starting Balance: ' + formatCurrency(val);
});
linkInputs(inputGrowth, boxGrowth, (val) => {
    document.getElementById('label-growth').innerText = 'Real Growth Rate during accumulation: ' + parseFloat(val).toFixed(1) + '%';
    if (ratesLinked) {
        inputGrowthDec.value = boxGrowthDec.value = val;
        document.getElementById('label-growth-dec').innerText = 'Real Growth Rate (Decumulation): ' + parseFloat(val).toFixed(1) + '%';
    }
});
linkInputs(inputGrowthDec, boxGrowthDec, (val) => {
    document.getElementById('label-growth-dec').innerText = 'Real Growth Rate (Decumulation): ' + parseFloat(val).toFixed(1) + '%';
});
linkInputs(sliderLegacyFloor, boxLegacyFloor, (val) => {
    document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: ' + formatCurrency(val);
});

boxAxisMin.addEventListener('change',   updateSimulation);
boxAxisMax.addEventListener('change',   updateSimulation);
boxYMax.addEventListener('change',      updateSimulation);
boxYLeftMin.addEventListener('change',  updateSimulation);
boxYLeftMax.addEventListener('change',  updateSimulation);

// ── Boot ──────────────────────────────────────────────────────
loadParamsFromURL();

// Set initial dynamic labels
document.getElementById('label-principal').innerText    = 'Starting Balance: '              + formatCurrency(boxPrincipal.value);
document.getElementById('label-growth').innerText       = 'Real Growth Rate during accumulation: ' + parseFloat(boxGrowth.value).toFixed(1) + '%';
document.getElementById('label-growth-dec').innerText   = 'Real Growth Rate (Decumulation): '      + parseFloat(boxGrowthDec.value).toFixed(1) + '%';
document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: '          + formatCurrency(boxLegacyFloor.value);
document.getElementById('label-inflation').innerText    = 'Assumed Inflation Rate: '        + parseFloat(boxInflation.value).toFixed(1) + '%';

if (milestones.length === 0) {
    addMilestone(30, 60000, 15000, 45000);
} else {
    renderMilestones();
}
renderDynamicEvents();
