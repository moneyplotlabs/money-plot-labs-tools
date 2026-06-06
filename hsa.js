/* ============================================================
   hsa.js — HSA Transfer Optimizer page controller
   ------------------------------------------------------------
   Wires the inputs, dynamic lump-sum rows, charts, and schedule
   display to the pure math in hsa-engine.js (Hsa.*). Mirrors the
   conventions of the other tools (linkInputs, dynamic rows,
   formatCurrency from common.js).
   ============================================================ */
'use strict';

// ── Theme colors (match styles.css) ───────────────────────────
const THEME = {
    textMuted:   '#94a3b8',
    border:      '#334155',
    accentBlue:  '#3b82f6',
    accentGreen: '#10b981',
    accentRed:   '#ef4444',
    cardBg:      '#1e293b',
};

const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_STARTS = [0,31,59,90,120,151,181,212,243,273,304,334]; // non-leap day-of-year offsets

// Month (0–11) + day (1–31) → 0-based day-of-year, clamped to a valid range.
function toDayOfYear(month, day) {
    const doy = MONTH_STARTS[month] + (Math.max(1, day) - 1);
    return Math.max(0, Math.min(364, doy));
}
// A day count from the start of the plan → "Yr Y, ~Mon D" label.
function dayLabel(dayFromStart) {
    const yearIdx = Math.floor(dayFromStart / 365);
    const doy     = dayFromStart - yearIdx * 365;
    let m = 11;
    while (m > 0 && MONTH_STARTS[m] > doy) m--;
    return `Yr ${yearIdx + 1}, ${MONTHS[m]} ${doy - MONTH_STARTS[m] + 1}`;
}

// ── State ──────────────────────────────────────────────────────
let lumps = [{ id: newId(), amount: 400, month: 0, day: 1 }];
let kChart = null, trajectoryChart = null;

// ── DOM refs ───────────────────────────────────────────────────
const sliderYears = document.getElementById('slider-years');
const boxYears    = document.getElementById('box-years');
const sliderAnnual= document.getElementById('slider-annual');
const boxAnnual   = document.getElementById('box-annual');
const sliderReturn= document.getElementById('slider-return');
const boxReturn   = document.getElementById('box-return');
const boxFee      = document.getElementById('box-fee');
const lumpList    = document.getElementById('lump-list');
const btnAddLump  = document.getElementById('btn-add-lump');

const labelYears  = document.getElementById('label-years');
const labelAnnual = document.getElementById('label-annual');
const labelReturn = document.getElementById('label-return');

const mK       = document.getElementById('metric-k');
const mValue   = document.getElementById('metric-value');
const mGain    = document.getElementById('metric-gain');
const summary  = document.getElementById('schedule-summary');

// ── Read inputs into engine params ─────────────────────────────
function readInputs() {
    return {
        years:   Math.max(1, parseInt(boxYears.value) || 1),
        cAnnual: Math.max(0, parseFloat(boxAnnual.value) || 0),
        r:       Math.max(0, parseFloat(boxReturn.value) || 0) / 100,
        fee:     Math.max(0, parseFloat(boxFee.value) || 0),
        lumps:   lumps.map(l => ({ amount: Math.max(0, l.amount || 0), dayOfYear: toDayOfYear(l.month, l.day) })),
    };
}

// ── Charts ─────────────────────────────────────────────────────
function initCharts() {
    Chart.defaults.color = THEME.textMuted;
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    kChart = new Chart(document.getElementById('kChart').getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [{
            label: 'Final Value', data: [],
            borderColor: THEME.accentBlue, backgroundColor: 'rgba(59,130,246,0.1)',
            fill: true, tension: 0.25,
            pointBackgroundColor: [], pointRadius: [], pointHoverRadius: 6,
        }]},
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { title: (i) => `${i[0].label} transfer(s)`,
                    label: (c) => formatCurrency(c.parsed.y) } } },
            scales: {
                x: { title: { display: true, text: 'Number of transfers (k)' },
                     grid: { color: THEME.border } },
                y: { grid: { color: THEME.border },
                     ticks: { callback: (v) => '$' + (v / 1000).toFixed(0) + 'k' } },
            },
        },
    });

    trajectoryChart = new Chart(document.getElementById('trajectoryChart').getContext('2d'), {
        type: 'line',
        data: { datasets: [
            { label: 'Portfolio value', data: [], parsing: false,
              borderColor: THEME.accentGreen, backgroundColor: 'rgba(16,185,129,0.08)',
              fill: true, borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: 'y' },
            { label: 'Idle (un-transferred) cash', data: [], parsing: false,
              borderColor: THEME.textMuted, backgroundColor: 'rgba(148,163,184,0.08)',
              borderWidth: 1.5, pointRadius: 0, tension: 0, yAxisID: 'yIdle' },
            { label: 'Transfers', data: [], parsing: false, showLine: false,
              borderColor: THEME.accentBlue, backgroundColor: THEME.accentBlue,
              pointRadius: 5, pointHoverRadius: 7, pointStyle: 'circle', yAxisID: 'y' },
            { label: 'Lump deposits', data: [], parsing: false, showLine: false,
              borderColor: THEME.accentRed, backgroundColor: THEME.accentRed,
              pointRadius: 5, pointHoverRadius: 7, pointStyle: 'rectRot', yAxisID: 'y' },
        ]},
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { boxWidth: 12 } },
                tooltip: { callbacks: { title: (i) => `Day ${Math.round(i[0].parsed.x)} (${dayLabel(Math.round(i[0].parsed.x))})`,
                    label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y)}` } } },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Day from start' },
                     grid: { color: THEME.border } },
                y: { position: 'left', grid: { color: THEME.border },
                     title: { display: true, text: 'Portfolio value ($)' },
                     ticks: { callback: (v) => '$' + (v / 1000).toFixed(0) + 'k' } },
                yIdle: { position: 'right', beginAtZero: true,
                     grid: { drawOnChartArea: false },
                     title: { display: true, text: 'Idle cash ($)' },
                     ticks: { callback: (v) => '$' + Math.round(v).toLocaleString() } },
            },
        },
    });
}

// ── Main update ────────────────────────────────────────────────
const KMAX = 36;   // search ceiling; covers all interior optima for fees ≳ $1

function update() {
    const inputs = readInputs();
    const p   = Hsa.deriveParams(inputs);
    const res = Hsa.optimize(p, { kmax: KMAX });
    const cad = Hsa.scheduleCadence(res.bestDays, p);

    // When the optimum is pinned at the search ceiling, more transfers were still
    // helping — i.e. the fee is low enough that the ideal is "transfer constantly",
    // which has no finite answer. Report that honestly rather than printing KMAX.
    const atCap = res.bestK === KMAX;

    // Metrics
    mK.innerText     = atCap ? `${KMAX}+` : String(res.bestK);
    mValue.innerText = formatCurrency(res.bestValue);
    mGain.innerText  = '+' + formatCurrency(res.gain);

    // Schedule summary: cadence + exact days (with friendly labels)
    const gap = Math.round(cad.avgGapDays);
    const cadencePhrase = gap >= 320 ? 'about once a year'
        : gap >= 150 ? 'about every 6 months'
        : gap >= 75  ? 'about quarterly'
        : gap >= 24  ? 'about monthly'
        : `about every ${gap} days`;
    if (atCap) {
        summary.innerHTML = `<strong>Transfer as often as you practically can.</strong> `
            + (inputs.fee <= 0
                ? `With no transfer fee there's no reason to let cash sit idle — move each contribution into investments as soon as it arrives.`
                : `At a $${inputs.fee} fee, transferring more keeps improving the result across the whole range tested, so the ideal is beyond ${KMAX} transfers. In practice: transfer every paycheck, or whenever cash builds up.`)
            + `<div class="sched-rule">The ${formatCurrency(res.bestValue)} shown is a floor (value at ${KMAX} transfers); transferring even more nudges it slightly higher.</div>`;
    } else if (res.bestK === 0) {
        summary.innerHTML = `<strong>Optimal: a single transfer at the end.</strong> `
            + `Fees outweigh the benefit of moving money in earlier — just transfer once at the end of the term.`;
    } else {
        const dayItems = res.bestDays
            .map(d => `<span class="sched-day">day ${d} <em>(${dayLabel(d)})</em></span>`).join('');
        // Idle-cash threshold rule of thumb: the cash captured at each transfer.
        const blocks = Hsa.transferBlockSizes(res.bestDays, p);
        const round50 = (x) => Math.round(x / 50) * 50;
        const lo = round50(Math.min(...blocks)), hi = round50(Math.max(...blocks));
        const thresh = (hi - lo < 200)
            ? `about ${formatCurrency((lo + hi) / 2)}`
            : `about ${formatCurrency(lo)}–${formatCurrency(hi)}`;
        summary.innerHTML = `<strong>Optimal: ${res.bestK} transfer${res.bestK > 1 ? 's' : ''}</strong> `
            + `— ${cadencePhrase} (${cad.transfers} transfers incl. final, ~${cad.perYear.toFixed(1)}/yr).`
            + `<div class="sched-rule">Rule of thumb: transfer whenever idle cash reaches ${thresh}.</div>`
            + `<div class="sched-days">${dayItems}</div>`;
    }

    // Chart 1: value vs k
    kChart.data.labels = res.perK.map(e => e.k);
    kChart.data.datasets[0].data = res.perK.map(e => e.value);
    kChart.data.datasets[0].pointBackgroundColor = res.perK.map(e => e.k === res.bestK ? THEME.accentGreen : THEME.accentBlue);
    kChart.data.datasets[0].pointRadius          = res.perK.map(e => e.k === res.bestK ? 7 : 3);
    kChart.update('none');

    // Chart 2: trajectory of the optimal schedule
    const T = p.T;
    const step = Math.max(1, Math.ceil(T / 400));
    const line = [];
    for (let d = 0; d <= T; d += step) line.push({ x: d, y: Hsa.portfolioValueOverTime(d, res.bestDays, p) });
    if (line[line.length - 1].x !== T) line.push({ x: T, y: Hsa.portfolioValueOverTime(T, res.bestDays, p) });

    // Idle (un-transferred) cash sawtooth: regular samples plus accurate pre-transfer
    // peaks and the drop to zero at each transfer day (and the final transfer at T).
    const idle = [];
    for (let d = 0; d <= T; d += step) idle.push({ x: d, y: Hsa.idleCashOverTime(d, res.bestDays, p) });
    let prevTd = 0;
    for (const td of [...res.bestDays, T]) {
        idle.push({ x: td, y: Hsa.cumCash(td, p) - Hsa.cumCash(prevTd, p) }); // peak just before transfer
        idle.push({ x: td, y: 0 });                                          // reset at transfer
        prevTd = td;
    }
    idle.sort((a, b) => a.x - b.x || b.y - a.y);

    const transferPts = [...res.bestDays, T].map(d => ({ x: d, y: Hsa.portfolioValueOverTime(d, res.bestDays, p) }));
    const lumpPts = p.lumpDeposits.map(dep => ({ x: dep.day, y: Hsa.portfolioValueOverTime(dep.day, res.bestDays, p) }));

    trajectoryChart.data.datasets[0].data = line;
    trajectoryChart.data.datasets[1].data = idle;
    trajectoryChart.data.datasets[2].data = transferPts;
    trajectoryChart.data.datasets[3].data = lumpPts;
    trajectoryChart.options.scales.x.max = T;
    trajectoryChart.update('none');
}

// ── Lump-sum rows ──────────────────────────────────────────────
function renderLumps() {
    lumpList.innerHTML = '';
    lumps.forEach(l => lumpList.appendChild(createLumpRow(l)));
}

function createLumpRow(lump) {
    const row = document.createElement('div');
    row.className = 'interactive-row';
    const monthOpts = MONTHS.map((m, i) => `<option value="${i}" ${i === lump.month ? 'selected' : ''}>${m}</option>`).join('');
    row.innerHTML = `
        <input type="number" class="manual-box inp-amt" value="${lump.amount}" placeholder="Amount ($)" style="flex:1;">
        <select class="inp-month" style="width:78px;">${monthOpts}</select>
        <input type="number" class="manual-box inp-day" value="${lump.day}" min="1" max="31" placeholder="Day" style="width:56px;">
        <button class="btn-delete">✕</button>
    `;
    const inpAmt   = row.querySelector('.inp-amt');
    const inpMonth = row.querySelector('.inp-month');
    const inpDay   = row.querySelector('.inp-day');
    const btnDel   = row.querySelector('.btn-delete');

    inpAmt.addEventListener('change',   () => { lump.amount = parseFloat(inpAmt.value) || 0; update(); });
    inpMonth.addEventListener('change', () => { lump.month  = parseInt(inpMonth.value) || 0; update(); });
    inpDay.addEventListener('change',   () => { lump.day    = Math.max(1, Math.min(31, parseInt(inpDay.value) || 1)); inpDay.value = lump.day; update(); });
    btnDel.addEventListener('click',    () => { lumps = lumps.filter(x => x.id !== lump.id); renderLumps(); update(); });
    return row;
}

btnAddLump.addEventListener('click', () => {
    if (lumps.length >= 50) return;
    lumps.push({ id: newId(), amount: 300, month: 1, day: 15 });
    renderLumps();
    update();
});

// ── Input linking ──────────────────────────────────────────────
function linkInputs(slider, box, labelFn) {
    slider.addEventListener('input', () => { box.value = slider.value; if (labelFn) labelFn(slider.value); update(); });
    box.addEventListener('change',   () => { if (box.value === '') box.value = slider.value; slider.value = box.value; if (labelFn) labelFn(box.value); update(); });
}

linkInputs(sliderYears,  boxYears,  (v) => labelYears.innerText  = `Investment Horizon: ${v} year${v == 1 ? '' : 's'}`);
linkInputs(sliderAnnual, boxAnnual, (v) => labelAnnual.innerText = `Annual Contribution (drip): ${formatCurrency(parseFloat(v) || 0)}`);
linkInputs(sliderReturn, boxReturn, (v) => labelReturn.innerText = `Expected Return on Investments: ${(parseFloat(v) || 0).toFixed(1)}%`);
boxFee.addEventListener('change', update);

// ── Boot ───────────────────────────────────────────────────────
function boot() {
    if (typeof Chart === 'undefined')          throw new Error('Chart.js did not load (check the CDN / network).');
    if (typeof Hsa === 'undefined')            throw new Error('hsa-engine.js did not load (check the file is deployed next to hsa.js).');
    if (typeof formatCurrency === 'undefined') throw new Error('common.js did not load.');
    initCharts();
    renderLumps();
    update();
}

try {
    boot();
} catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error('HSA tool failed to start:', err);
    if (summary) {
        summary.innerHTML = `<strong style="color:var(--accent-red)">Couldn't start the tool:</strong> ${msg}`
            + `<div class="sched-rule" style="color:var(--text-muted);font-weight:400">`
            + `Try a hard refresh (Ctrl/Cmd-Shift-R). If it persists, open the browser console (F12) and send me the red error.</div>`;
    }
}
