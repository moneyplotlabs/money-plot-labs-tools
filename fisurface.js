/* ============================================================
   fisurface.js — Years-to-FI Surface page controller
   ------------------------------------------------------------
   Reads the inputs, runs the pure math in fisurface-engine.js
   (FISurface.*), rasterizes label text with a <canvas>, and shows
   the printable model in three.js (3D preview) next to a 2D map
   of the surface. The preview is built at a draft resolution so
   edits stay fast; "Download STL" builds at the export resolution.
   ============================================================ */
'use strict';

// Order a print: a Google Form, opened prefilled with a link to this exact design.
// ORDER_FORM_URL: the form's ".../viewform" link. ORDER_FORM_DESIGN_ENTRY: the entry id
// of a short-answer question for the design link (Google Forms → ⋮ → "Get pre-filled
// link", fill that question, copy the link, and take the number after "entry.").
// ORDERS_OPEN: false hides the Order button, the price and the shipping notes (the tool and
// STL download stay). The button also stays hidden while ORDER_FORM_URL is empty.
const ORDERS_OPEN = false;
const ORDER_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfUVS1cdBybxPGuKF9pinA4B0pLfSR02kBj_mndhbYh2MX5qA/viewform';
const ORDER_FORM_DESIGN_ENTRY = '258278663';

// Filament colors offered for prints: basic PLA you can buy quickly. Mark the ones on your
// shelf inStock; the rest are ordered for the print and add ORDER_EXTRA_DAYS. Swatches are
// approximate (screens and brands vary). Add or remove rows as your stock changes.
const FILAMENTS = [
    { id: 'white',  name: 'White',  hex: '#f2f2ee', inStock: true },
    { id: 'beige',  name: 'Beige',  hex: '#d8c7a5', inStock: true },
    { id: 'black',  name: 'Black',  hex: '#26272b', inStock: true },
    { id: 'green',  name: 'Green',  hex: '#2e8b57', inStock: true },
    { id: 'gray',   name: 'Gray',   hex: '#8a8d91' },
    { id: 'navy',   name: 'Navy blue', hex: '#253a66' },
    { id: 'blue',   name: 'Blue',   hex: '#2f6fc0' },
    { id: 'red',    name: 'Red',    hex: '#c0392b' },
    { id: 'orange', name: 'Orange', hex: '#e67e22' },
    { id: 'yellow', name: 'Yellow', hex: '#f1c40f' },
    { id: 'purple', name: 'Purple', hex: '#7d4ba3' },
    { id: 'brown',  name: 'Brown',  hex: '#7a5230' },
];
const SHIP_DAYS = 2;            // business days to ship when both colors are in stock
// Price shown by the Order button (keep in step with the order form). Set LAUNCH_PRICE to null
// to show just the regular price.
const PRICE = 69, LAUNCH_PRICE = 49, LAUNCH_NOTE = 'launch price, first 25 orders';
const ORDER_EXTRA_DAYS = 2;     // extra days when a color has to be ordered first
const filamentById = id => FILAMENTS.find(f => f.id === id);

// Size. Auto scale fits the model (plot + ledges) inside TARGET_SIZE_MM, landscape, with the
// same mm per $10k on both axes. Orders are printed on the shop's printer, so the Order button
// only accepts designs within ORDER_MAX_MM (width, depth, height), whatever the visitor's
// own printer settings say.
const TARGET_SIZE_MM = [225, 150];

// Nozzle presets: the smallest text and line widths that print cleanly. Letter strokes and the
// gaps inside letters are about 0.15× the text size, and want two or more extrusion lines,
// as do the raised lines. (Orders print on the shop's 0.6 mm nozzle.)
const NOZZLES = {
    0.4: { tick: 5, title: 5.5, inline: 4.5, contour: 1.2, you: 1.6, grid: 0.8 },
    0.6: { tick: 6, title: 6.5, inline: 5.5, contour: 1.4, you: 1.8, grid: 1.2 },
};
const ORDER_MAX_MM = [230, 160, 70];
const ORDER_NOZZLE = '0.6';     // orders are printed with this nozzle's preset (or larger text)

// ── Auto window, grid and scale ────────────────────────────────
// Fitted to the income/expenses last committed (typed, or a slider released), so the surface
// holds still while a slider is being dragged.
const autoBasis = { I: 100000, X: 60000, R: 0.05, S: 0.04, P0: 250000 };
const NICE_STEPS = [1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000];
const niceStep = (range, maxTicks) => NICE_STEPS.find(s => range / s <= maxTicks) || 2000000;

function autoWindow() {
    const I = Math.max(autoBasis.I, 10000), X = Math.max(autoBasis.X, 5000);
    // incomes from about a third of yours to twice it (at least $100k above); expenses from 0
    // to twice yours or 80% of your income, whichever is more
    const iLo = I / 3, iHi = Math.max(2 * I, I + 100000);
    const incomeStep = niceStep(iHi - iLo, 8);
    const xHi = Math.max(2 * X, 0.8 * I);
    const expenseStep = niceStep(xHi, 8);
    return { iMin: Math.floor(iLo / incomeStep) * incomeStep, iMax: Math.ceil(iHi / incomeStep) * incomeStep,
             xMin: 0, xMax: Math.ceil(xHi / expenseStep) * expenseStep, incomeStep, expenseStep };
}

// Cap: the smallest round number of years at least 1.6× yours (and 5 more; past 30 years,
// 15 more), so your own point sits on the slope, not in the flat plateau. A bigger cap does not make the print taller
// (Height at cap is fixed); it lowers the surface and shrinks the plateau.
const CAP_CHOICES = [20, 25, 30, 40, 50, 60, 80];
function autoCap(nYou) {
    if (!isFinite(nYou)) return 60;                       // never: show plenty of the slope
    const want = nYou <= 30 ? Math.max(1.6 * nYou, nYou + 5) : nYou + 15;
    return CAP_CHOICES.find(c => c >= want) || CAP_CHOICES[CAP_CHOICES.length - 1];
}
// Contours: every 5 years up to a 30-year cap, 10 up to 60, 20 beyond (3–6 lines)
const autoContourStep = cap => [1, 2, 5, 10, 20].find(s => cap / s <= 6) || 20;

// mm per $10k (to 0.5 mm) so the whole model fits TARGET_SIZE_MM
function autoScale(spanI, spanX, margins) {
    const fitW = (TARGET_SIZE_MM[0] - margins.marginLeft - margins.marginRight) / (spanI / 1e4);
    const fitD = (TARGET_SIZE_MM[1] - margins.marginFront - margins.marginBack) / (spanX / 1e4);
    return Math.max(0.5, Math.floor(2 * Math.min(fitW, fitD)) / 2);
}

const THEME = {
    textMuted: '#94a3b8',
    border:    '#334155',
    bg:        '#0f172a',
    accentRed: '#ef4444',
    ledge:     [0.55, 0.60, 0.68],
};
const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const PREVIEW_CELL_MM = 0.35;        // the preview never builds finer than this

// Viridis, sampled at 9 stops.
const VIRIDIS = [[68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142], [33, 144, 141],
                 [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37]];
function viridis(t) {
    t = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
    const i = Math.min(Math.floor(t), VIRIDIS.length - 2), f = t - i, a = VIRIDIS[i], b = VIRIDIS[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

// ── DOM refs ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const INPUTS = {           // URL key → input id
    i: 'in-income', x: 'in-expenses', p: 'in-portfolio', r: 'in-return', s: 'in-swr', age: 'in-age',
    imin: 'in-imin', imax: 'in-imax', xmin: 'in-xmin', xmax: 'in-xmax', cap: 'in-cap', cs: 'in-cstep',
    isc: 'in-iscale', xsc: 'in-xscale', h: 'in-height', b: 'in-base', is: 'in-istep', xs: 'in-xstep',
    t: 'in-text', td: 'in-tdepth', cell: 'in-cell', ts: 'in-tsize',
    it: 'in-ititle', xt: 'in-xtitle', ct: 'in-caption', you: 'in-you', tks: 'in-ticksize', tts: 'in-titlesize',
    stk: 'in-showticks', scap: 'in-showcaption', lh: 'in-layer', fl: 'in-first', nz: 'in-nozzle',
    bx: 'in-bedx', by: 'in-bedy', bz: 'in-bedz', inf: 'in-inflation', bp: 'in-bp',
    cc: 'in-ccontours', cl: 'in-clabels', csh: 'in-cshape', cb: 'in-cbody', ca: 'in-caccent', pc: 'in-colors',
    dot: 'in-youdot', site: 'in-site',
};
const SITE_TEXT = 'MONEYPLOTLABS.COM';
const isCheck = id => $(id).type === 'checkbox';
const getVal = id => isCheck(id) ? ($(id).checked ? '1' : '0') : $(id).value;
const setVal = (id, v) => { if (isCheck(id)) $(id).checked = v !== '0'; else $(id).value = v; };
const num = (id, fallback) => { const v = parseFloat($(id).value); return isFinite(v) ? v : fallback; };

// The month the design was made: its amounts are that month's (real) dollars. Kept in the link
// (?dt=YYYY-MM), so a design opened later (e.g. to print an order) keeps its original month.
const MONTHS_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const designMonth = (() => {
    const dt = new URLSearchParams(window.location.search).get('dt');
    if (dt && /^\d{4}-(0[1-9]|1[0-2])$/.test(dt)) return dt;
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
const designMonthLabel = () => MONTHS_ABBR[+designMonth.slice(5) - 1] + ' ' + designMonth.slice(0, 4);

// ── Inputs → engine params ─────────────────────────────────────
function readParams() {
    const auto = autoWindow();
    let iMin = Math.max(0, num('in-imin', auto.iMin)), iMax = num('in-imax', auto.iMax);
    let xMin = Math.max(0, num('in-xmin', auto.xMin)), xMax = num('in-xmax', auto.xMax);
    if (iMax <= iMin) iMax = iMin + 10000;
    if (xMax <= xMin) xMax = xMin + 10000;
    const R = Math.max(0, num('in-return', 5)) / 100;
    const S = Math.max(0.005, num('in-swr', 4) / 100);
    const P0 = Math.max(0, num('in-portfolio', 0));
    const b = autoBasis;
    const capAuto = autoCap(FISurface.yearsToFI(b.I, b.X, b.R, b.S, b.P0));
    const cap = Math.min(80, Math.max(5, num('in-cap', capAuto)));
    const cstepAuto = autoContourStep(cap);
    const cstep = Math.max(1, num('in-cstep', cstepAuto));
    const contourYears = [];
    for (let L = cstep; L <= cap + 1e-9; L += cstep) contourYears.push(Math.round(L * 100) / 100);
    const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    // Size by scale: mm per $10k/yr. The same scale on both axes (the default) keeps a dollar
    // of income and a dollar of spending the same distance apart, so slopes compare fairly.
    const nozzle = NOZZLES[$('in-nozzle').value] ? $('in-nozzle').value : '0.6';
    const nz = NOZZLES[nozzle];
    const textSizes = {
        tickTextMm: clampTo(num('in-ticksize', nz.tick), 3, 10), titleTextMm: clampTo(num('in-titlesize', nz.title), 3, 12),
        inlineTextMm: clampTo(num('in-tsize', nz.inline), 3, 10), tickLabels: $('in-showticks').checked,
        incomeTitle: $('in-ititle').value.trim(), expenseTitle: $('in-xtitle').value.trim(), caption: $('in-showcaption').checked,
    };
    const margins = FISurface.resolveMargins(Object.assign({}, FISurface.DEFAULTS, textSizes));
    const scaleAuto = autoScale(iMax - iMin, xMax - xMin, margins);
    const iScale = clampTo(num('in-iscale', scaleAuto), 0.5, 100);
    const xScale = clampTo(num('in-xscale', iScale), 0.5, 100);
    const exportCell = parseFloat($('in-cell').value) || 0.25;
    // show what "auto" means right now
    const ph = { 'in-imin': auto.iMin, 'in-imax': auto.iMax, 'in-xmin': auto.xMin, 'in-xmax': auto.xMax,
                 'in-istep': auto.incomeStep, 'in-xstep': auto.expenseStep, 'in-iscale': scaleAuto,
                 'in-cap': capAuto, 'in-cstep': cstepAuto,
                 'in-ticksize': nz.tick, 'in-titlesize': nz.title, 'in-tsize': nz.inline };
    for (const [id, v] of Object.entries(ph)) $(id).placeholder = 'auto: ' + v;
    return {
        R, S, P0, nozzle,
        youIncome: clampTo(num('in-income', 0), iMin, iMax),
        youExpenses: clampTo(num('in-expenses', 0), xMin, xMax),
        rawIncome: num('in-income', 0), rawExpenses: num('in-expenses', 0),
        incomeRange: [iMin, iMax], expenseRange: [xMin, xMax],
        capYears: cap, contourYears,
        incomeStep: Math.max((iMax - iMin) / 20, num('in-istep', auto.incomeStep)),
        expenseStep: Math.max((xMax - xMin) / 20, num('in-xstep', auto.expenseStep)),
        incomeScale: iScale, expenseScale: xScale,
        widthMm: clampTo((iMax - iMin) / 1e4 * iScale, 20, 1000),
        depthMm: clampTo((xMax - xMin) / 1e4 * xScale, 20, 1000),
        heightMm: clampTo(num('in-height', 60), 5, 200),
        baseMm: clampTo(num('in-base', 2.4), 1, 10),
        layerMm: clampTo(num('in-layer', 0.2), 0, 1),
        firstLayerMm: clampTo(num('in-first', 0.2), 0.04, 1),
        textMode: $('in-text').value,
        textDepthMm: clampTo(num('in-tdepth', 0.6), 0.2, 2),
        exportCellMm: exportCell,
        cellMm: Math.max(exportCell, PREVIEW_CELL_MM),
        ...textSizes,
        captionText: $('in-caption').value.trim(),
        captionDate: designMonthLabel(),
        youLabel: $('in-you').value.trim(),
        youMarker: $('in-youdot').checked ? { diameterMm: 8, heightMm: 3 } : null,
        siteText: $('in-site').checked ? SITE_TEXT : '',
        bed: [num('in-bedx', 250), num('in-bedy', 210), num('in-bedz', 210)],
        // Auto: a step reads in one color; a cut shelf gives an accent line an even width;
        // bands need no shape (the color change at the line's height is the line)
        contourRidge: { width: nz.contour, height: 1.0 },
        youRidge: { width: nz.you, height: 1.4 },
        gridRidge: { width: nz.grid, height: 0.5 },
        contourShape: $('in-cshape').value !== 'auto' ? $('in-cshape').value
            : ({ none: 'step', lines: 'shelf', bands: 'none' })[$('in-ccontours').value] || 'step',
        colors: { contours: $('in-ccontours').value, baseLabels: $('in-clabels').checked,
                  body: (filamentById($('in-cbody').value) || FILAMENTS[0]).hex,
                  accent: (filamentById($('in-caccent').value) || FILAMENTS[2]).hex },
        previewColors: $('in-colors').value,
    };
}

// ── Metrics ────────────────────────────────────────────────────
function fmtYears(n) {
    if (n === 0) return 'Already FI';
    if (!isFinite(n)) return 'Never';
    return n.toFixed(1) + ' yrs';
}

function updateMetrics(p) {
    const s = FISurface.sensitivities(p.rawIncome, p.rawExpenses, p.R, p.S, p.P0);
    $('metric-years').textContent = fmtYears(s.years);
    $('metric-years-sub').textContent = `FI number ${formatCurrency(s.fiNumber)}`;
    const yrs = v => v === null ? '–' : v.toFixed(2);
    $('metric-spend').textContent = yrs(s.perKExpenses);
    $('metric-spend-sub').textContent = s.spendVsIncome === null ? 'years sooner'
        : `years sooner · $1 cut = $${s.spendVsIncome.toFixed(2)} raise`;
    $('metric-income').textContent = yrs(s.perKIncome);
    $('metric-return').textContent = yrs(s.perPointReturn);
}

// ── Text: measure + rasterize with a canvas ────────────────────
const measureCtx = document.createElement('canvas').getContext('2d');
function measure(text, sizeMm) {
    measureCtx.font = `bold 100px ${FONT}`;
    return measureCtx.measureText(text).width * sizeMm / 100;
}

// Coverage (0..1) of every grid cell by the labels, supersampled 4×. Cells are the
// squares between grid points: (nx−1)·(ny−1), row-major from the front edge.
function rasterizeLabels(model, labels) {
    const ss = 4, { nx, ny, cell } = model, cx = nx - 1, cy = ny - 1;
    const cv = document.createElement('canvas');
    cv.width = cx * ss; cv.height = cy * ss;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
        ctx.save();
        // canvas row 0 is the back edge (max y), so text reads correctly from above
        ctx.translate(l.x / cell * ss, (cy - l.y / cell) * ss);
        ctx.rotate(-l.angle * Math.PI / 180);
        ctx.font = `bold ${l.size / cell * ss}px ${FONT}`;
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
    }
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const cov = new Float32Array(cx * cy), norm = 1 / (255 * ss * ss);
    for (let r = 0; r < cv.height; r++) {
        const row = (cy - 1 - Math.floor(r / ss)) * cx;
        for (let c = 0; c < cv.width; c++) {
            const a = px[4 * (r * cv.width + c) + 3];
            if (a) cov[row + Math.floor(c / ss)] += a * norm;
        }
    }
    return cov;
}

// ── Build the printable model ──────────────────────────────────
let current = null;      // { params, model, mesh, skipped, plan }

function buildPrint(p, cellMm) {
    const model = FISurface.buildModel(Object.assign({}, p, { cellMm }));
    let text = null, skipped = [];
    if (p.textMode !== 'none') {
        const lay = FISurface.layoutLabels(model, measure);
        skipped = lay.skipped;
        const field = FISurface.textField(rasterizeLabels(model, lay.labels), model.nx, model.ny);
        text = { field, offset: (p.textMode === 'emboss' ? 1 : -1) * model.p.textDepthMm };
    }
    // contour shelves/steps and letters are traced exactly, with vertical walls
    const mesh = FISurface.buildMesh(model.zOut, model.nx, model.ny, model.cell, text, { field: model.bandField, z: model.bandZ });
    const plan = FISurface.colorPlan(model, p.colors);
    return { params: p, model, mesh, skipped, plan };
}

const warn = s => `<span style="color:${THEME.accentRed}">${s}</span>`;

function updateStats(c) {
    const { model, params: p } = c;
    let zMax = 0;
    for (const v of model.z) zMax = Math.max(zMax, v);
    if (p.textMode === 'emboss') zMax += model.p.textDepthMm;
    // size of the exported STL: scale the preview's triangle count to the export grid
    const ratio = (model.cell / p.exportCellMm) ** 2;
    const tris = c.mesh.indices.length / 3 * ratio;
    const W = model.widthMm, D = model.depthMm, [bx, by, bz] = p.bed;
    const fits = (W <= bx && D <= by) || (W <= by && D <= bx);
    let html = `${W.toFixed(0)} × ${D.toFixed(0)} × ${zMax.toFixed(0)} mm · `
             + `STL at ${p.exportCellMm} mm ≈ ${(tris / 1e6).toFixed(1)}M triangles, ${((84 + 50 * tris) / 1e6).toFixed(0)} MB · watertight`;
    if (!fits || zMax > bz) html += ' · ' + warn(`too big for a ${bx} × ${by} × ${bz} mm printer: lower the scale or height`);
    else html += ` · fits a ${bx} × ${by} × ${bz} mm bed` + (W <= bx && D <= by ? '' : ' (turned 90°)');
    if (c.skipped.length) html += ' · ' + warn(`no room for: ${c.skipped.join(', ')}`);
    // Orders print on the shop's printer: up to ORDER_MAX_MM, on a 0.6 mm nozzle, so text may be
    // larger than that nozzle's preset but not smaller. (Downloads are not limited.)
    const [ow, od, oh] = ORDER_MAX_MM, min = NOZZLES[ORDER_NOZZLE];
    const problems = [];                                 // { kind, text }: each has a one-click fix
    if (!(((W <= ow && D <= od) || (W <= od && D <= ow)) && zMax <= oh))
        problems.push({ kind: 'size', text: `It's larger than we print (up to ${ow / 10} × ${od / 10} × ${oh / 10} cm).` });
    if (p.nozzle !== ORDER_NOZZLE)
        problems.push({ kind: 'nozzle', text: `Orders are printed with a ${ORDER_NOZZLE} mm nozzle (Nozzle is set to ${p.nozzle}).` });
    else if (p.tickTextMm < min.tick || p.titleTextMm < min.title || p.inlineTextMm < min.inline)
        problems.push({ kind: 'text', text: `Some text is smaller than we can print cleanly (at least ${min.tick} / ${min.title} / ${min.inline} mm for tick labels / titles / line labels).` });
    orderProblems = problems;
    $('btn-order').classList.toggle('fis-needs-fix', problems.length > 0);
    $('btn-order').title = problems.length ? 'Needs a change before ordering: click for details' : 'Order this design as a print';
    if (ORDERS_OPEN) for (const pr of problems) html += ' · ' + warn('to order: ' + pr.text);
    if (!$('order-help').hidden) showOrderHelp(false);   // keep an open help box current
    if (p.rawIncome !== p.youIncome || p.rawExpenses !== p.youExpenses)
        html += ' · ' + warn('your income/expenses are outside the window (line drawn at the edge): widen the window or unlock the axes');
    $('print-stats').innerHTML = html;
}

// Which colors are on hand, and what that means for shipping.
function updateFilamentNote() {
    if (!ORDERS_OPEN) { $('filament-note').textContent = ''; $('order-note').textContent = ''; return; }
    const chosen = [$('in-cbody').value, $('in-caccent').value].map(filamentById).filter(Boolean);
    const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    const stock = list(FILAMENTS.filter(f => f.inStock).map(f => f.name));
    const toOrder = [...new Set(chosen.filter(f => !f.inStock).map(f => f.name))];
    $('filament-note').innerHTML = toOrder.length
        ? `${list(toOrder)} ${toOrder.length > 1 ? 'are' : 'is'} ordered for your print: ships in about ${SHIP_DAYS + ORDER_EXTRA_DAYS} business days. In stock now: ${stock} (ships in ${SHIP_DAYS}).`
        : `Both colors in stock: ships in about ${SHIP_DAYS} business days.`;
    const names = chosen.map(f => f.name).join(' + ');
    const days = SHIP_DAYS + (toOrder.length ? ORDER_EXTRA_DAYS : 0);
    const price = LAUNCH_PRICE ? '$' + LAUNCH_PRICE + ' ' + LAUNCH_NOTE + ' (regular $' + PRICE + ')' : '$' + PRICE;
    $('order-note').textContent = `${price}, US shipping and tax included · printed in ${names} PLA · ships in about ${days} business days after payment (change colors in 3D Print Settings → Colors)`;
}

// Filament swaps, as a list for the slicer.
function updateColorPlan(c) {
    const plan = c.plan, out = $('color-plan'), cols = c.params.colors;
    if (!plan) { out.innerHTML = 'Set a layer height to plan color changes.'; return; }
    const name = to => to === 'accent' ? 'accent' : 'body';
    const swatch = to => `<span class="fis-swatch" style="background:${to === 'accent' ? cols.accent : cols.body}"></span>`;
    if (!plan.changes.length && plan.start === 'body') { out.innerHTML = `One color: ${swatch('body')} body only.`; return; }
    out.innerHTML = `Start with ${swatch(plan.start)} ${name(plan.start)}. Then add a color change at each Z `
        + `(${plan.changes.length} swap${plan.changes.length === 1 ? '' : 's'}):`
        + '<ol class="fis-plan">' + plan.changes.map(ch =>
            `<li>Z ${ch.z.toFixed(2)} mm → ${swatch(ch.to)} ${name(ch.to)}${ch.why ? ` <span class="fis-why">(${ch.why})</span>` : ''}</li>`).join('') + '</ol>';
}

// ── 3D preview (three.js) ──────────────────────────────────────
const viewer = { renderer: null, scene: null, camera: null, controls: null, object: null, framedFor: '' };

function initViewer() {
    const host = $('view-print');
    if (typeof THREE === 'undefined') {
        host.innerHTML = '<span class="placeholder-text">3D preview unavailable (three.js failed to load). Download still works.</span>';
        return false;
    }
    viewer.renderer = new THREE.WebGLRenderer({ antialias: true });
    viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    viewer.renderer.setClearColor(0x131c31, 1);
    host.appendChild(viewer.renderer.domElement);
    viewer.scene = new THREE.Scene();
    viewer.camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    viewer.camera.up.set(0, 0, 1);                       // model z is up
    viewer.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-1, -1.4, 2);
    viewer.scene.add(sun);
    viewer.controls = new THREE.OrbitControls(viewer.camera, viewer.renderer.domElement);
    viewer.controls.enableDamping = true;
    viewer.controls.addEventListener('change', render);
    (function loop() { requestAnimationFrame(loop); if (viewer.controls.update()) render(); })();
    new ResizeObserver(resizeViewer).observe(host);
    resizeViewer();
    return true;
}

function resizeViewer() {
    if (!viewer.renderer) return;
    const host = $('view-print'), w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    viewer.renderer.setSize(w, h, false);
    viewer.camera.aspect = w / h;
    viewer.camera.updateProjectionMatrix();
    render();
}

function render() {
    if (viewer.renderer) viewer.renderer.render(viewer.scene, viewer.camera);
}

function showPrint(c) {
    if (!viewer.renderer) return;
    const { model, mesh, plan, params } = c, p = model.p;
    const N = model.nx * model.ny, P = mesh.positions;
    const nVerts = P.length / 3;
    const colors = new Float32Array(nVerts * 3);
    const zTop = p.baseMm + p.liftMm;
    const asPrinted = params.previewColors === 'filament' && plan;
    const body = hexToRgb(params.colors.body), accent = hexToRgb(params.colors.accent);
    // filament at height z: the color in force when the layer holding z is printed
    const filament = z => {
        const top = FISurface.layerTop(z - 1e-6, p);
        let col = plan.start;
        for (const ch of plan.changes) { if (ch.z <= top + 1e-9) col = ch.to; else break; }
        return col === 'accent' ? accent : body;
    };
    for (let k = 0; k < nVerts && !asPrinted; k++) {                      // height colors, per vertex
        // the grid point this vertex sits on (text and base vertices copy or lie between them)
        const g = k < N ? k : Math.round(P[3 * k + 1] / model.cell) * model.nx + Math.round(P[3 * k] / model.cell);
        let rgb;
        if (model.plot[g]) {
            const v = viridis((model.z[g] - zTop) / p.heightMm);
            rgb = [v[0] / 255, v[1] / 255, v[2] / 255];
        } else {
            rgb = THEME.ledge;
        }
        if (mesh.isLetter[k]) rgb = rgb.map(v => v * 0.55);                    // make labels readable
        colors[3 * k] = rgb[0]; colors[3 * k + 1] = rgb[1]; colors[3 * k + 2] = rgb[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    const material = asPrinted
        ? filamentMaterial(filament, P)
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
    const obj = new THREE.Mesh(geo, material);
    obj.position.set(-model.widthMm / 2, -model.depthMm / 2, 0);
    if (viewer.object) {
        viewer.scene.remove(viewer.object);
        viewer.object.geometry.dispose();
        if (viewer.object.material.userData.layerTex) viewer.object.material.userData.layerTex.dispose();
        viewer.object.material.dispose();
    }
    viewer.object = obj;
    viewer.scene.add(obj);

    // Re-frame the camera only when the model's size changes, so orbiting survives edits.
    const key = `${model.widthMm}|${model.depthMm}|${p.heightMm}`;
    if (key !== viewer.framedFor) {
        viewer.framedFor = key;
        const span = Math.max(model.widthMm, model.depthMm);
        viewer.camera.position.set(-0.25 * span, -1.25 * span, 0.85 * span);
        viewer.controls.target.set(0, 0, p.heightMm * 0.25);
        viewer.camera.near = span / 100; viewer.camera.far = span * 20;
        viewer.camera.updateProjectionMatrix();
    }
    viewer.controls.update();
    render();
}

// Filament colors as printed: each pixel takes the color of the layer at its own height,
// so a swap shows as a horizontal band everywhere, walls and cliffs included. (Per-vertex
// colors would blend between a wall's top and bottom and smear swaps into vertical streaks.)
// The colors live in a tall 1-pixel texture indexed by height.
function filamentMaterial(filament, P) {
    let zMax = 0;
    for (let i = 2; i < P.length; i += 3) zMax = Math.max(zMax, P[i]);
    zMax += 1;
    const H = 4096, data = new Uint8Array(4 * H);
    for (let r = 0; r < H; r++) {
        const rgb = filament(r * zMax / H);              // each row: the color at its lower edge
        data[4 * r] = rgb[0] * 255; data[4 * r + 1] = rgb[1] * 255; data[4 * r + 2] = rgb[2] * 255; data[4 * r + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 1, H, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    // flat shading: each facet lit on its own, as printed (smoothed normals would shade the
    // vertical walls of shelves and letters into a false sawtooth)
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
    m.userData.layerTex = tex;
    m.onBeforeCompile = shader => {
        shader.uniforms.layerTex = { value: tex };
        shader.uniforms.zMax = { value: zMax };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vModelZ;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelZ = position.z;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vModelZ;\nuniform sampler2D layerTex;\nuniform float zMax;')
            .replace('#include <color_fragment>',
                     'diffuseColor.rgb = texture2D(layerTex, vec2(0.5, clamp(vModelZ / zMax, 0.0, 1.0))).rgb;');
    };
    return m;
}

// ── Timeline ───────────────────────────────────────────────────
// The portfolio by age, the FI number as a line, and where they meet. Cheap to redraw, so it
// follows the income/expense sliders live (the 3D model waits until the slider stops).
let timeChart = null;
const COLORS_T = { balance: '#10b981', target: '#f59e0b' };
const money = v => v === 0 ? '$0' : Math.abs(v) >= 1e6 ? '$' + parseFloat((v / 1e6).toFixed(v >= 1e7 ? 1 : 2)) + 'M' : '$' + Math.round(v / 1e3) + 'k';

function initTimeline() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = THEME.textMuted;
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    timeChart = new Chart($('time-chart').getContext('2d'), {
        type: 'line',
        data: { datasets: [
            { label: 'Portfolio', data: [], parsing: false, borderColor: COLORS_T.balance,
              backgroundColor: 'rgba(16,185,129,0.08)', fill: true, borderWidth: 2, pointRadius: 0 },
            { label: 'Without growth', data: [], parsing: false, borderColor: THEME.textMuted,
              borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
            { label: 'FI number (expenses ÷ SWR)', data: [], parsing: false, borderColor: COLORS_T.target,
              borderDash: [6, 4], borderWidth: 2, pointRadius: 0 },
            { label: 'FI reached', data: [], parsing: false, showLine: false, pointRadius: 6, pointHoverRadius: 7,
              backgroundColor: '#fff', borderColor: COLORS_T.target, borderWidth: 2 },
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { labels: { boxWidth: 12, filter: (item, data) => !data.datasets[item.datasetIndex].isBuyingPower } },
                title: { display: true, text: '', color: '#f8fafc', font: { size: 14, weight: '600' } },
                tooltip: { filter: item => !item.dataset.isBuyingPower, callbacks: {
                    title: i => 'Age ' + i[0].parsed.x.toFixed(1),
                    label: c => c.dataset.label + ': ' + formatCurrency(c.parsed.y)
                        + (dollarMode === 'nominal' && c.raw.yReal != null ? " (today's " + formatCurrency(c.raw.yReal) + ')' : '') } },
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Age' }, grid: { color: THEME.border } },
                y: { beginAtZero: true, grid: { color: THEME.border },
                     title: { display: true, text: "Portfolio (today's $)" }, ticks: { callback: money } },
            },
        },
    });
}

// Today's $ (real) or future $ (nominal, inflated from today) on the timeline only.
let dollarMode = 'real';
function setDollarMode(mode, redraw = true) {
    dollarMode = mode === 'nominal' ? 'nominal' : 'real';
    document.querySelectorAll('#dollar-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === dollarMode));
    $('inflation-group').style.display = dollarMode === 'nominal' ? 'flex' : 'none';
    if (!redraw) return;
    if (view !== 'time') setView('time');                // the toggle only changes the timeline
    else { drawTimeline(readParams()); updateURLParams(); }
}

// Dashed equal-buying-power curves (as in the other tools): each is a constant today's-dollar
// amount inflating into future dollars, so where one crosses the portfolio they buy the same.
function buyingPowerDatasets(levels, age0, horizon, infl) {
    return levels.map(level => ({
        label: formatCurrency(level) + " (today's $)", isBuyingPower: true, parsing: false,
        data: Array.from({ length: horizon + 1 }, (_, t) => ({ x: age0 + t, y: level * Math.pow(1 + infl, t), yReal: level })),
        borderColor: 'rgba(234, 179, 8, 0.55)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false, order: 10,
    }));
}

function drawTimeline(p) {
    if (!timeChart) return;
    const age0 = num('in-age', 35), I = p.rawIncome, X = p.rawExpenses, F = X / p.S;
    const n = FISurface.yearsToFI(I, X, p.R, p.S, p.P0);
    const horizon = isFinite(n) ? Math.min(80, Math.max(10, Math.ceil(n * 1.3 + 3))) : 40;
    const path = FISurface.balancePath(I, X, p.R, p.P0, horizon, horizon / 160);
    const nominal = dollarMode === 'nominal';
    const infl = nominal ? Math.max(0, num('in-inflation', 3)) / 100 : 0;
    const grow = t => Math.pow(1 + infl, t);              // today's $ → $ of year t
    const pt = (t, real) => ({ x: age0 + t, y: real * grow(t), yReal: real });
    const [bal, flat, target, hit] = timeChart.data.datasets;
    bal.data = path.map(q => pt(q.t, q.balance));
    flat.data = path.map(q => pt(q.t, Math.max(0, p.P0 + (I - X) * q.t)));
    target.data = nominal ? path.map(q => pt(q.t, F)) : [pt(0, F), pt(horizon, F)];
    target.label = nominal ? 'FI number (grows with inflation)' : 'FI number (expenses ÷ SWR)';
    hit.data = isFinite(n) ? [pt(n, F)] : [];
    timeChart.data.datasets.splice(4);                   // drop old buying-power curves
    let yMax;
    if (nominal) {
        $('label-inflation').textContent = 'Assumed Inflation Rate: ' + (infl * 100).toFixed(1) + '%';
        const peak = Math.max(...bal.data.map(d => d.y), ...target.data.map(d => d.y));
        yMax = snapCeiling(peak);                        // the curves then read as curved gridlines
        if ($('in-bp').checked) {
            const realPeak = Math.max(F, ...path.map(q => q.balance));
            const step = snapCeiling(realPeak) / 4;
            const levels = [step, 2 * step, 3 * step, 4 * step].filter(v => Math.abs(v - F) > 0.05 * F);   // the FI curve is one already
            timeChart.data.datasets.push(...buyingPowerDatasets(levels, age0, horizon, infl));
        }
    }
    const then = isFinite(n) ? ' (' + money(F * grow(n)) + ' in ' + Math.round(+designMonth.slice(0, 4) + n) + ' dollars)' : '';
    timeChart.options.plugins.title.text = n === 0
        ? 'Already FI: ' + money(p.P0) + ' today covers the FI number of ' + money(F)
        : !isFinite(n)
            ? 'Never: spending outpaces income plus growth, so ' + money(F) + ' is out of reach'
            : 'FI at age ' + (age0 + n).toFixed(1) + ': ' + n.toFixed(1) + ' years to reach ' + money(F)
              + (nominal ? " in today's $" + then : '');
    timeChart.options.scales.x.min = age0;
    timeChart.options.scales.x.max = age0 + horizon;
    timeChart.options.scales.y.max = yMax;
    timeChart.options.scales.y.title.text = nominal ? 'Portfolio (future $)' : "Portfolio (today's $)";
    timeChart.update('none');
}

// ── 2D map ─────────────────────────────────────────────────────
const map = { pad: { l: 58, r: 14, t: 12, b: 40 } };

function drawMap(p) {
    const cv = $('map-canvas'), host = $('view-map');
    const dpr = window.devicePixelRatio || 1, W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // the same aspect as the print, so slopes look as they will on the model
    let { l, t } = map.pad;
    let pw = W - l - map.pad.r, ph = H - t - map.pad.b;
    const aspect = p.widthMm / p.depthMm;
    if (pw / ph > aspect) { const w = ph * aspect; l += (pw - w) / 2; pw = w; }
    else { const h = pw / aspect; t += (ph - h) / 2; ph = h; }
    const [I0, I1] = p.incomeRange, [X0, X1] = p.expenseRange;
    const sx = I => l + (I - I0) / (I1 - I0) * pw, sy = X => t + ph - (X - X0) / (X1 - X0) * ph;
    Object.assign(map, { p, sx, sy, l, t, pw, ph, W, H });

    // heat map at half screen resolution
    const res = 2, gw = Math.ceil(pw / res), gh = Math.ceil(ph / res);
    const img = ctx.createImageData(gw, gh);
    for (let j = 0; j < gh; j++) {
        const X = X1 - (j + 0.5) / gh * (X1 - X0);
        for (let i = 0; i < gw; i++) {
            const I = I0 + (i + 0.5) / gw * (I1 - I0);
            const n = FISurface.yearsToFI(I, X, p.R, p.S, p.P0);
            const c = viridis(Math.min(n, p.capYears) / p.capYears), o = 4 * (j * gw + i);
            img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
    }
    const tmp = document.createElement('canvas');
    tmp.width = gw; tmp.height = gh;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, l, t, pw, ph);

    // contours: straight rays from the focal point
    ctx.save();
    ctx.beginPath(); ctx.rect(l, t, pw, ph); ctx.clip();
    const f = FISurface.focalPoint(p.R, p.S, p.P0);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    for (const L of p.contourYears) {
        const m = FISurface.contourSlope(L, p.R, p.S);
        const Iend = I1 + (I1 - I0);                      // far enough to leave the window
        ctx.beginPath();
        ctx.moveTo(sx(f.I), sy(f.X));
        ctx.lineTo(sx(Iend), sy(f.X + m * (Iend - f.I)));
        ctx.stroke();
    }
    // your point
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(sx(p.rawIncome), t); ctx.lineTo(sx(p.rawIncome), t + ph);
    ctx.moveTo(l, sy(p.rawExpenses)); ctx.lineTo(l + pw, sy(p.rawExpenses)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(sx(p.rawIncome), sy(p.rawExpenses), 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = THEME.bg; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // contour labels just inside the window edge where each ray leaves
    ctx.fillStyle = '#fff'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    for (const L of p.contourYears) {
        const m = FISurface.contourSlope(L, p.R, p.S), Xr = f.X + m * (I1 - f.I);
        const exit = Xr <= X1 ? [I1, Xr] : [f.I + (X1 - f.X) / m, X1];
        if (exit[0] < I0 || exit[1] < X0) continue;           // contour misses the window
        const ex = Math.min(sx(exit[0]) - 6, l + pw - 16), ey = Math.max(sy(exit[1]) - 8, t + 9);
        if (placed.some(([x, y]) => Math.abs(x - ex) < 30 && Math.abs(y - ey) < 14)) continue;   // too crowded
        placed.push([ex, ey]);
        ctx.fillText(`${L}${L >= p.capYears ? '+' : ''}y`, ex, ey);
    }

    // axes
    ctx.strokeStyle = THEME.border; ctx.strokeRect(l, t, pw, ph);
    ctx.fillStyle = THEME.textMuted; ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of FISurface.ticks(I0, I1, p.incomeStep)) ctx.fillText('$' + FISurface.kLabel(v), sx(v), t + ph + 5);
    ctx.fillText('Income ($/yr, after tax)', l + pw / 2, t + ph + 22);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of FISurface.ticks(X0, X1, p.expenseStep)) ctx.fillText('$' + FISurface.kLabel(v), l - 6, sy(v));
    ctx.save(); ctx.translate(l - 46, t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('Expenses ($/yr)', 0, 0); ctx.restore();
}

function onMapHover(e) {
    const tip = $('map-tip');
    if (!map.p) return;
    const rect = $('map-canvas').getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const { l, t, p } = map;
    if (x < l || x > l + map.pw || y < t || y > t + map.ph) { tip.hidden = true; return; }
    const I = p.incomeRange[0] + (x - l) / map.pw * (p.incomeRange[1] - p.incomeRange[0]);
    const X = p.expenseRange[1] - (y - t) / map.ph * (p.expenseRange[1] - p.expenseRange[0]);
    const n = FISurface.yearsToFI(I, X, p.R, p.S, p.P0);
    tip.innerHTML = `Income ${formatCurrency(I)} · Expenses ${formatCurrency(X)}<br><strong>${fmtYears(n)}</strong>`;
    tip.hidden = false;
    tip.style.left = Math.min(x + 14, map.W - tip.offsetWidth - 4) + 'px';
    tip.style.top = Math.max(y - tip.offsetHeight - 10, 4) + 'px';
}

// ── Update cycle ───────────────────────────────────────────────
let view = 'print', pending = null;

function update() {
    syncAxisLock();
    const p = readParams();
    $('label-return').textContent = `Real Return: ${(p.R * 100).toFixed(1)}%`;
    $('label-swr').textContent = `Safe Withdrawal Rate: ${(p.S * 100).toFixed(1)}%`;
    $('note-step').textContent = p.contourYears.length > 1 ? p.contourYears[1] - p.contourYears[0] : p.capYears;
    $('note-cap').textContent = p.capYears;
    $('in-xscale').placeholder = 'same: ' + p.incomeScale;
    updateMetrics(p);                                    // instant: closed-form numbers
    updateFilamentNote();
    if (view === 'map') drawMap(p);
    if (view === 'time') drawTimeline(p);
    updateURLParams();
    // The 3D model is the slow part: it waits until edits pause (a slider being dragged keeps
    // pushing it back), and is only built while its tab is showing. Other tabs get a coarse
    // stand-in that keeps the size, bed check and color plan current.
    clearTimeout(pending);
    printDirty = true;
    if (view === 'print') {
        $('viewer-msg').hidden = false;
        pending = setTimeout(() => refreshPrint(p), 250);
    } else {
        pending = setTimeout(() => { const c = buildPrint(p, 0.5); updateStats(c); updateColorPlan(c); }, 400);
    }
}

let printDirty = true;
function refreshPrint(p) {
    current = buildPrint(p, p.cellMm);
    printDirty = false;
    updateStats(current);
    updateColorPlan(current);
    showPrint(current);
    $('viewer-msg').hidden = true;
}

function setView(v) {
    view = v;
    document.querySelectorAll('#view-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $('view-print').hidden = v !== 'print';
    $('view-map').hidden = v !== 'map';
    $('view-time').hidden = v !== 'time';
    $('in-colors').hidden = v !== 'print';               // preview colors only apply to the 3D view
    const p = readParams();
    if (v === 'map') drawMap(p);
    if (v === 'time') { if (timeChart) timeChart.resize(); drawTimeline(p); }
    if (v === 'print') {
        resizeViewer();
        if (printDirty) {                                 // catch up on edits made on other tabs
            clearTimeout(pending);
            $('viewer-msg').hidden = false;
            pending = setTimeout(() => refreshPrint(p), 30);
        }
    }
    updateURLParams();
}

// The STL is built at the export resolution (finer than the preview) when downloaded.
function downloadSTL() {
    const p = readParams(), btn = $('btn-download');
    btn.disabled = true;
    btn.textContent = `Building ${p.exportCellMm} mm STL…`;
    setTimeout(() => {                                   // let the button repaint first
        try {
            const fresh = !printDirty && current && current.model.cell === p.exportCellMm;
            const c = fresh ? current : buildPrint(p, p.exportCellMm);
            const buf = FISurface.toBinarySTL(c.mesh, 'Money Plot Labs - years to FI surface');
            const name = `fi-surface-${FISurface.kLabel(p.youIncome)}-income-${FISurface.kLabel(p.youExpenses)}-expenses.stl`;
            const url = URL.createObjectURL(new Blob([buf], { type: 'model/stl' }));
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Download STL';
        }
    }, 30);
}

// The design link sent with an order has every "auto" value written out, so the order opens
// exactly as previewed even if the auto rules or presets change later.
// Every auto value as it resolves right now (URL key → value)
function resolvedAuto(p) {
    return {
        imin: p.incomeRange[0], imax: p.incomeRange[1], xmin: p.expenseRange[0], xmax: p.expenseRange[1],
        is: p.incomeStep, xs: p.expenseStep, isc: p.incomeScale, xsc: p.expenseScale,
        cap: p.capYears, cs: p.contourYears.length > 1 ? p.contourYears[1] - p.contourYears[0] : p.capYears,
        tks: p.tickTextMm, tts: p.titleTextMm, ts: p.inlineTextMm,
    };
}
function frozenDesignLink() {
    const url = new URL(window.location.href);
    for (const [key, v] of Object.entries(resolvedAuto(readParams()))) url.searchParams.set(key, v);
    return url.toString();
}

// Lock axes: write the window, grid, scale, cap and contour step into their fields, so changing
// income or expenses only moves your lines and dot. Unlocking clears them back to auto.
const LOCK_KEYS = ['imin', 'imax', 'xmin', 'xmax', 'is', 'xs', 'isc', 'cap', 'cs'];
function setAxisLock(on) {
    const v = resolvedAuto(readParams());
    for (const key of LOCK_KEYS) $(INPUTS[key]).value = on ? ($(INPUTS[key]).value || v[key]) : '';
    commitBasis();
    update();
}
const syncAxisLock = () => { $('in-lockaxes').checked = LOCK_KEYS.every(key => $(INPUTS[key]).value !== ''); };

// Order button: open the form, or explain what to change (with a one-click fix) if this design
// can't be printed as it is. The button stays clickable so nobody is left wondering why.
let orderProblems = [];
function onOrderClick() {
    if (!orderProblems.length) { $('order-help').hidden = true; orderPrint(); return; }
    showOrderHelp(false);
}
function showOrderHelp(justFixed) {
    const box = $('order-help');
    box.hidden = false;
    if (!orderProblems.length) {
        box.innerHTML = (justFixed ? 'Done: your design is ready to order. Check the preview, then click <strong>Order a Print</strong> again.'
            : 'Your design is ready to order.') + ' <button type="button" class="fis-link-btn" id="order-help-close">Close</button>';
        $('order-help-close').onclick = () => { box.hidden = true; };
        return;
    }
    box.innerHTML = '<strong>Almost there.</strong> This design needs a change before we can print it:<ul>'
        + orderProblems.map(pr => '<li>' + pr.text + '</li>').join('') + '</ul>'
        + '<button type="button" class="btn-lock" id="order-help-fix">Make it orderable</button> '
        + '<button type="button" class="fis-link-btn" id="order-help-close">Not now</button>'
        + '<div class="control-hint">This switches to the 0.6 mm nozzle, returns text sizes and scale to auto (they fit '
        + 'automatically), and lowers the height if needed. Your numbers and colors stay the same.</div>';
    $('order-help-fix').onclick = fixForOrder;
    $('order-help-close').onclick = () => { box.hidden = true; };
}
function fixForOrder() {
    const min = NOZZLES[ORDER_NOZZLE];
    for (const pr of orderProblems) {
        if (pr.kind === 'nozzle') $('in-nozzle').value = ORDER_NOZZLE;
        if (pr.kind === 'text' || pr.kind === 'nozzle') {
            for (const [id, m] of [['in-ticksize', min.tick], ['in-titlesize', min.title], ['in-tsize', min.inline]])
                if ($(id).value !== '' && parseFloat($(id).value) < m) $(id).value = '';
        }
        if (pr.kind === 'size') {
            $('in-iscale').value = ''; $('in-xscale').value = '';
            if (num('in-height', 60) > 60) $('in-height').value = 60;
        }
    }
    commitBasis();
    update();
    setTimeout(() => showOrderHelp(true), 700);          // after the stats refresh
}

function orderPrint() {
    const params = new URLSearchParams({ usp: 'pp_url' });
    if (ORDER_FORM_DESIGN_ENTRY) params.set(`entry.${ORDER_FORM_DESIGN_ENTRY}`, frozenDesignLink());
    window.open(`${ORDER_FORM_URL}?${params}`, '_blank', 'noopener');
}

// ── URL persistence ────────────────────────────────────────────
function updateURLParams() {
    const params = new URLSearchParams();
    for (const [key, id] of Object.entries(INPUTS)) params.set(key, getVal(id));
    if (view !== 'print') params.set('view', view);
    if (dollarMode !== 'real') params.set('dm', dollarMode);
    params.set('dt', designMonth);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function loadParamsFromURL() {
    const params = new URLSearchParams(window.location.search);
    for (const [key, id] of Object.entries(INPUTS)) if (params.has(key)) setVal(id, params.get(key));
    $('slider-return').value = $('in-return').value;
    $('slider-swr').value = $('in-swr').value;
    $('slider-income').value = $('in-income').value;
    $('slider-expenses').value = $('in-expenses').value;
    $('slider-inflation').value = $('in-inflation').value;
    if (params.get('dm') === 'nominal') setDollarMode('nominal', false);
    return ['map', 'time'].includes(params.get('view')) ? params.get('view') : 'print';
}

// ── Wire up ────────────────────────────────────────────────────
// Re-fit the auto window to the income/expenses as committed (not while a slider is dragged).
function commitBasis() {
    autoBasis.I = num('in-income', autoBasis.I);
    autoBasis.X = num('in-expenses', autoBasis.X);
    autoBasis.R = Math.max(0, num('in-return', 5)) / 100;
    autoBasis.S = Math.max(0.005, num('in-swr', 4) / 100);
    autoBasis.P0 = Math.max(0, num('in-portfolio', 0));
}

function linkSlider(slider, box) {
    slider.addEventListener('input', () => { box.value = slider.value; update(); });
    slider.addEventListener('change', () => { commitBasis(); update(); });          // released
    box.addEventListener('change', () => { if (box.value === '') box.value = slider.value; slider.value = box.value; commitBasis(); update(); });
}
linkSlider($('slider-return'), $('in-return'));
linkSlider($('slider-swr'), $('in-swr'));
linkSlider($('slider-income'), $('in-income'));
linkSlider($('slider-expenses'), $('in-expenses'));
linkSlider($('slider-inflation'), $('in-inflation'));
document.querySelectorAll('#dollar-toggle .seg-btn').forEach(b => b.addEventListener('click', () => setDollarMode(b.dataset.mode)));
for (const id of Object.values(INPUTS)) {
    if (['in-return', 'in-swr', 'in-income', 'in-expenses', 'in-inflation'].includes(id)) continue;
    $(id).addEventListener('change', () => { commitBasis(); update(); });
}
document.querySelectorAll('#view-toggle .seg-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('print-button').addEventListener('click', () => {
    $('print-button').classList.toggle('open');
    $('print-panel').classList.toggle('visible');
});
$('btn-download').addEventListener('click', downloadSTL);
$('in-lockaxes').addEventListener('change', e => setAxisLock(e.target.checked));
if (ORDERS_OPEN && ORDER_FORM_URL) {
    $('btn-order').hidden = false;
    $('btn-order').textContent = 'Order a Print · $' + (LAUNCH_PRICE || PRICE);
    $('btn-order').addEventListener('click', onOrderClick);
}
$('map-canvas').addEventListener('mousemove', onMapHover);
$('map-canvas').addEventListener('mouseleave', () => { $('map-tip').hidden = true; });
window.addEventListener('resize', () => { if (view === 'map') drawMap(readParams()); });

for (const [id, def] of [['in-cbody', 'white'], ['in-caccent', 'black']]) {
    $(id).innerHTML = FILAMENTS.map(f =>
        `<option value="${f.id}"${f.id === def ? ' selected' : ''}>${f.name}${ORDERS_OPEN && f.inStock ? ' (in stock)' : ''}</option>`).join('');
}
const startView = loadParamsFromURL();
commitBasis();
for (const [id, def] of [['in-cbody', 'white'], ['in-caccent', 'black']]) if (!filamentById($(id).value)) $(id).value = def;
initViewer();
initTimeline();
view = startView;               // so the first update only builds the 3D model if it is showing
update();
if (startView !== 'print') setView(startView);
