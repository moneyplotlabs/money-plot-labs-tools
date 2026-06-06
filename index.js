/* ============================================================
   index.js — Macro Sandbox (Tool 1)
   Pure-math retirement timeline calculator.
   Depends on: Chart.js 3.x (global), styles.css
   ============================================================ */

// ── DOM References ────────────────────────────────────────────
const sliderStartAge   = document.getElementById('slider-start-age');
const boxStartAge      = document.getElementById('box-start-age');
const sliderEndAge     = document.getElementById('slider-end-age');
const boxEndAge        = document.getElementById('box-end-age');

const inputPrincipal   = document.getElementById('input-principal');
const inputSavings     = document.getElementById('input-savings');
const inputSpending    = document.getElementById('input-spending');
const inputGrowth      = document.getElementById('input-growth');
const inputGrowthDec   = document.getElementById('input-growth-dec');

const boxPrincipal     = document.getElementById('box-principal');
const boxSavings       = document.getElementById('box-savings');
const boxSpending      = document.getElementById('box-spending');
const boxGrowth        = document.getElementById('box-growth');
const boxGrowthDec     = document.getElementById('box-growth-dec');

const btnLinkRates     = document.getElementById('btn-link-rates');
const btnAdvanced      = document.getElementById('advanced-button');
const panelAdvanced    = document.getElementById('advanced-panel');

const boxAxisMin       = document.getElementById('box-axis-min');
const boxAxisMax       = document.getElementById('box-axis-max');
const boxYMax          = document.getElementById('box-y-max');
const sliderLegacyFloor = document.getElementById('slider-legacy-floor');
const boxLegacyFloor   = document.getElementById('box-legacy-floor');

const btnLockX         = document.getElementById('btn-lock-x');
const btnLockY         = document.getElementById('btn-lock-y');
const mainLockBtn      = document.getElementById('main-chart-lock');

const ssList           = document.getElementById('ss-list');
const windfallList     = document.getElementById('windfall-list');
const btnAddSs         = document.getElementById('btn-add-ss');
const btnAddWindfall   = document.getElementById('btn-add-windfall');

const mWorkYears       = document.getElementById('metric-work-years');
const mRetireAge       = document.getElementById('metric-retire-age');
const mPeakNw          = document.getElementById('metric-peak-nw');

// ── State ─────────────────────────────────────────────────────
let chartInstance      = null;
let computedPeakCache  = 0;
let ratesLinked        = false;
let ssEvents           = [];
let windfallEvents     = [];

// ── Helpers ──────────────────────────────────────────
// formatCurrency, newId, snapCeiling → common.js (loaded before this script)

// ── Core Simulation ─────────────────────────────────
// Pure math lives in engine.js (Engine.macroTimeline). This thin wrapper injects
// the live legacy-floor and event state so existing call sites are unchanged.
function calculateTimeline(currentAge, stopAge, a0, s, c, rAcc, rDec) {
    return Engine.macroTimeline(currentAge, stopAge, a0, s, c, rAcc, rDec, {
        floor:    parseFloat(boxLegacyFloor.value) || 0,
        ss:       ssEvents,
        windfall: windfallEvents,
    });
}

// ── Visualization ─────────────────────────────────────────────
function updateVisualization() {
    let currentAge = parseInt(boxStartAge.value) || 0;
    let stopAge    = parseInt(boxEndAge.value)   || 95;

    // Guard: start < stop
    if (currentAge >= stopAge) {
        stopAge = Math.min(currentAge + 1, 120);
        if (stopAge === 120) currentAge = 119;
        boxStartAge.value    = currentAge;
        sliderStartAge.value = currentAge;
        boxEndAge.value      = stopAge;
        sliderEndAge.value   = stopAge;
    }

    let axisMin = boxAxisMin.value !== "" ? parseInt(boxAxisMin.value)   : currentAge;
    let axisMax = boxAxisMax.value !== "" ? parseInt(boxAxisMax.value)   : stopAge + 1;
    if (isNaN(axisMin)) axisMin = currentAge;
    if (isNaN(axisMax)) axisMax = stopAge;
    if (axisMin >= axisMax) {
        axisMax = axisMin + 10;
        if (boxAxisMax.value !== "") boxAxisMax.value = axisMax;
    }

    const p0   = parseFloat(boxPrincipal.value) || 0;
    const c    = parseFloat(boxSavings.value)   || 0;
    const b    = parseFloat(boxSpending.value)  || 0;
    const r    = (parseFloat(boxGrowth.value)    || 0) / 100;
    const rDec = (parseFloat(boxGrowthDec.value) || 0) / 100;
    const floor = parseFloat(boxLegacyFloor.value) || 0;

    // Update dynamic labels
    document.getElementById('label-principal').innerText  = 'Starting Balance: '              + formatCurrency(p0);
    document.getElementById('label-savings').innerText    = 'Annual Savings: '                + formatCurrency(c) + '/yr';
    document.getElementById('label-spending').innerText   = 'Annual Retirement Spending: '    + formatCurrency(b) + '/yr';
    document.getElementById('label-growth').innerText     = 'Real Growth Rate during accumulation: ' + (r * 100).toFixed(1) + '%';
    document.getElementById('label-growth-dec').innerText = 'Real Growth Rate (Decumulation): '      + (rDec * 100).toFixed(1) + '%';
    document.getElementById('label-legacy-floor').innerText = 'Desired Legacy Floor: '        + formatCurrency(floor);

    const results       = calculateTimeline(currentAge, stopAge, p0, c, b, r, rDec);
    computedPeakCache   = results.peakNetWorth;

    mWorkYears.innerText = results.workingYears.toFixed(1) + ' Years';
    mRetireAge.innerText = (results.workingYears >= (stopAge - currentAge) && results.finalBalanceAtMaxWork < floor)
        ? 'Never'
        : 'Age ' + results.retirementAge.toFixed(1);
    mPeakNw.innerText   = formatCurrency(results.peakNetWorth);

    const yMaxConstraint = boxYMax.value !== "" ? parseFloat(boxYMax.value) : undefined;

    if (chartInstance) {
        chartInstance.data.datasets[0].data  = results.accumulationData;
        chartInstance.data.datasets[1].data  = results.depletionData;
        chartInstance.options.scales.x.min   = axisMin;
        chartInstance.options.scales.x.max   = axisMax;
        chartInstance.options.scales.y.max   = yMaxConstraint;
        chartInstance.update('none');
    } else {
        const ctx = document.getElementById('timelineChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label:           'Accumulation Phase',
                        data:            results.accumulationData,
                        borderColor:     '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        fill:            true,
                        tension:         0.1,
                        borderWidth:     3,
                        pointRadius:     0,
                    },
                    {
                        label:           'Depletion Phase',
                        data:            results.depletionData,
                        borderColor:     '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        fill:            true,
                        tension:         0.1,
                        borderWidth:     3,
                        pointRadius:     0,
                    },
                ],
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f8fafc' } },
                    tooltip: {
                        mode:      'nearest',
                        axis:      'x',
                        intersect: false,
                        callbacks: {
                            title: (ctx) => 'Age ' + ctx[0].parsed.x.toFixed(1),
                            label: (ctx) => ctx.raw !== null
                                ? ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y)
                                : null,
                        },
                    },
                },
                scales: {
                    x: {
                        type: 'linear',
                        min:  axisMin,
                        max:  axisMax,
                        grid:  { color: '#334155' },
                        ticks: { color: '#94a3b8', stepSize: 10, callback: (v) => 'Age ' + v },
                    },
                    y: {
                        min:  0,
                        max:  yMaxConstraint,
                        grid:  { color: '#334155' },
                        ticks: {
                            color:    '#94a3b8',
                            callback: (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M'
                                           : v >= 1000    ? '$' + (v / 1000) + 'k'
                                           : '$' + v,
                        },
                    },
                },
            },
        });
    }

    updateButtonStates();
    updateURLParams();
}

// ── Input Linking ─────────────────────────────────────────────

// Standard 1:1 link (slider range === box range)
function linkInputs(slider, box) {
    slider.addEventListener('input', () => {
        box.value = slider.value;
        updateVisualization();
    });
    box.addEventListener('change', () => {
        if (box.value === "") box.value = slider.value;
        slider.value = box.value;
        updateVisualization();
    });
}

// Decoupled link: slider and box can have different min/max ranges
function linkInputsDecoupled(slider, box, sMin, sMax, bMin, bMax) {
    slider.addEventListener('input', () => {
        box.value = slider.value;
        updateVisualization();
    });
    box.addEventListener('change', () => {
        if (box.value === "") box.value = slider.value;
        let val = parseFloat(box.value);
        if (val < bMin) { val = bMin; box.value = bMin.toFixed(1); }
        if (val > bMax) { val = bMax; box.value = bMax.toFixed(1); }
        slider.value = Math.max(sMin, Math.min(sMax, val));
        updateVisualization();
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
    updateVisualization();
});

btnLockY.addEventListener('click', () => {
    if (boxYMax.value !== "") {
        boxYMax.value = "";
    } else if (computedPeakCache > 0) {
        boxYMax.value = snapCeiling(computedPeakCache);
    }
    updateVisualization();
});

mainLockBtn.addEventListener('click', () => {
    const isUnlocked = boxAxisMin.value === "" && boxYMax.value === "";
    if (isUnlocked) {
        boxAxisMin.value = parseInt(boxStartAge.value) || 0;
        boxAxisMax.value = (parseInt(boxEndAge.value) || 95) + 1;
        if (computedPeakCache > 0) boxYMax.value = snapCeiling(computedPeakCache);
        mainLockBtn.textContent = "Unlock Auto-Scale";
        mainLockBtn.classList.add('locked');
    } else {
        boxAxisMin.value = "";
        boxAxisMax.value = "";
        boxYMax.value    = "";
        mainLockBtn.textContent = "Lock Scale for Comparison";
        mainLockBtn.classList.remove('locked');
    }
    updateVisualization();
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
        boxGrowthDec.value   = boxGrowth.value;
        inputGrowthDec.value = inputGrowth.value;
        inputGrowthDec.disabled = true;
        boxGrowthDec.disabled   = true;
    } else {
        btnLinkRates.textContent = "Link to Accumulation";
        btnLinkRates.classList.remove('locked');
        inputGrowthDec.disabled = false;
        boxGrowthDec.disabled   = false;
    }
    updateVisualization();
});

// Keep decumulation in sync when accumulation changes while linked
inputGrowth.addEventListener('input',  () => { if (ratesLinked) inputGrowthDec.value = boxGrowthDec.value = inputGrowth.value; });
boxGrowth.addEventListener('change',   () => { if (ratesLinked) inputGrowthDec.value = boxGrowthDec.value = boxGrowth.value; });

// ── Dynamic Events (SS / Windfalls) ───────────────────────────
function renderDynamicEvents() {
    ssList.innerHTML       = '';
    windfallList.innerHTML = '';
    ssEvents.forEach(e        => ssList.appendChild(createEventUI(e, 'ss')));
    windfallEvents.forEach(e  => windfallList.appendChild(createEventUI(e, 'wf')));
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

    inpAmt.addEventListener('change', () => { event.amt = parseFloat(inpAmt.value) || 0; updateVisualization(); });
    inpAge.addEventListener('change', () => { event.age = parseInt(inpAge.value)   || 0; updateVisualization(); });
    btnDel.addEventListener('click',  () => {
        if (type === 'ss') ssEvents       = ssEvents.filter(x => x.id !== event.id);
        else               windfallEvents = windfallEvents.filter(x => x.id !== event.id);
        renderDynamicEvents();
        updateVisualization();
    });
    return row;
}

btnAddSs.addEventListener('click', () => {
    if (ssEvents.length >= 100) return;
    ssEvents.push({ id: newId(), amt: 10000, age: 67 });
    renderDynamicEvents();
    updateVisualization();
});

btnAddWindfall.addEventListener('click', () => {
    if (windfallEvents.length >= 100) return;
    windfallEvents.push({ id: newId(), amt: 50000, age: 50 });
    renderDynamicEvents();
    updateVisualization();
});

// ── URL Persistence ───────────────────────────────────────────
function updateURLParams() {
    const params = new URLSearchParams();
    params.set('startAge',    boxStartAge.value);
    params.set('endAge',      boxEndAge.value);
    params.set('principal',   boxPrincipal.value);
    params.set('savings',     boxSavings.value);
    params.set('spending',    boxSpending.value);
    params.set('growth',      boxGrowth.value);
    params.set('growthDec',   boxGrowthDec.value);
    params.set('legacyFloor', boxLegacyFloor.value);
    params.set('ss',          JSON.stringify(ssEvents.map(e => [e.amt, e.age])));
    params.set('wf',          JSON.stringify(windfallEvents.map(e => [e.amt, e.age])));
    if (boxAxisMin.value !== "") params.set('xMin', boxAxisMin.value);
    if (boxAxisMax.value !== "") params.set('xMax', boxAxisMax.value);
    if (boxYMax.value    !== "") params.set('yMax', boxYMax.value);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function loadParamsFromURL() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('startAge'))    boxStartAge.value    = sliderStartAge.value   = p.get('startAge');
    if (p.has('endAge'))      boxEndAge.value      = sliderEndAge.value     = p.get('endAge');
    if (p.has('principal'))   boxPrincipal.value   = inputPrincipal.value   = p.get('principal');
    if (p.has('savings'))     boxSavings.value     = inputSavings.value     = p.get('savings');
    if (p.has('spending'))    boxSpending.value     = inputSpending.value   = p.get('spending');
    if (p.has('growth'))      boxGrowth.value      = inputGrowth.value      = p.get('growth');
    if (p.has('growthDec'))   boxGrowthDec.value   = inputGrowthDec.value   = p.get('growthDec');
    if (p.has('legacyFloor')) boxLegacyFloor.value = sliderLegacyFloor.value = p.get('legacyFloor');
    if (p.has('xMin'))        boxAxisMin.value = p.get('xMin');
    if (p.has('xMax'))        boxAxisMax.value = p.get('xMax');
    if (p.has('yMax'))        boxYMax.value    = p.get('yMax');
    if (p.has('ss')) ssEvents       = JSON.parse(p.get('ss')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));
    if (p.has('wf')) windfallEvents = JSON.parse(p.get('wf')).map(d => ({ id: newId(), amt: d[0], age: d[1] }));
}

// ── Wire Up All Inputs ────────────────────────────────────────
linkInputsDecoupled(inputPrincipal,  boxPrincipal,  0,       1000000, 0,        10000000);
linkInputsDecoupled(inputSavings,    boxSavings,    -100000, 500000,  -1000000, 1000000);
linkInputsDecoupled(inputSpending,   boxSpending,   0,       100000,  0,        1000000);
linkInputsDecoupled(inputGrowth,     boxGrowth,     -3.0,    7.0,     -5.0,     15.0);
linkInputsDecoupled(inputGrowthDec,  boxGrowthDec,  -3.0,    7.0,     -5.0,     15.0);
linkInputsDecoupled(sliderLegacyFloor, boxLegacyFloor, 0,   1000000, 0,        5000000);
linkInputs(sliderStartAge, boxStartAge);
linkInputs(sliderEndAge,   boxEndAge);

boxAxisMin.addEventListener('change', updateVisualization);
boxAxisMax.addEventListener('change', updateVisualization);
boxYMax.addEventListener('change',    updateVisualization);

// ── Boot ──────────────────────────────────────────────────────
loadParamsFromURL();
renderDynamicEvents();
updateVisualization();
