/* ============================================================
   test/fisurface-engine.test.js — Years-to-FI surface + STL
   ============================================================ */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fisurface-engine.js');

const close = (a, b, tol, msg) =>
    assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ≈${b}, got ${a} (tol ${tol})`);

const R = 0.05, S = 0.04, P0 = 1100000;

// Brute force: step P_n = P_{n-1}(1+R) + (I − X), interpolating within the crossing year.
function simulateYears(I, X, R, S, P0) {
    let P = P0;
    const target = X / S;
    if (P >= target) return 0;
    for (let k = 0; k < 500; k++) {
        const next = P * (1 + R) + (I - X);
        if (next >= target) return k + (target - P) / (next - P);
        P = next;
    }
    return Infinity;
}

// A deterministic stand-in for canvas text measurement: 0.62 em per character.
const measure = (text, size) => 0.62 * size * text.length;

// Is (x, y) on (or right beside) the raised dot where your lines cross?
const nearDot = (m, x, y, pad = 0.5) => !!m.marker && Math.hypot(x - m.marker.x, y - m.marker.y) < m.marker.r + pad;

describe('yearsToFI', () => {
    test('matches a year-by-year simulation (exact at whole years, within a year between)', () => {
        let seed = 7;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 500; i++) {
            const I = 20000 + rand() * 280000, X = rand() * 150000;
            const n = F.yearsToFI(I, X, R, S, P0), sim = simulateYears(I, X, R, S, P0);
            if (!isFinite(n)) assert.ok(!isFinite(sim) || sim > 400, `I=${I} X=${X}`);
            else close(n, sim, 1, `I=${I} X=${X}`);
        }
    });

    test('integer-year crossings are exact', () => {
        // pick X so the portfolio lands exactly on X/S after 10 years
        const I = 150000, g = Math.pow(1 + R, 10), s = (g - 1) / R;
        const X = (g * P0 + s * I) / (1 / S + s);
        close(F.yearsToFI(I, X, R, S, P0), 10, 1e-9);
        close(simulateYears(I, X, R, S, P0), 10, 1e-6);
    });

    test('already FI is 0, a shrinking portfolio is never', () => {
        assert.equal(F.yearsToFI(100000, 40000, R, S, P0), 0);           // 40k ≤ 4% of 1.1M
        assert.equal(F.yearsToFI(50000, 120000, R, S, P0), Infinity);    // spends 70k more than earns; growth only 55k
    });

    test('is exact at I = X and continuous as R → 0', () => {
        close(F.yearsToFI(90000, 90000, R, S, P0), Math.log(90000 / S / P0) / Math.log(1 + R), 1e-12);
        close(F.yearsToFI(150000, 90000, 1e-9, S, P0), F.yearsToFI(150000, 90000, 0, S, P0), 1e-5);
        close(F.yearsToFI(150000, 90000, 0, S, P0), (90000 / S - P0) / 60000, 1e-12);
    });
});

describe('balancePath', () => {
    test('matches the year-by-year recursion and reaches the FI number exactly at n', () => {
        const I = 190000, X = 90000, path = F.balancePath(I, X, R, P0, 10, 0.5);
        let P = P0;
        for (let k = 0; k <= 10; k++) {
            close(path[2 * k].balance, P, 1e-6, `year ${k}`);
            P = P * (1 + R) + (I - X);
        }
        const n = F.yearsToFI(I, X, R, S, P0);
        close(F.balancePath(I, X, R, P0, n, n)[1].balance, X / S, 1e-6);
        close(F.balancePath(150000, 90000, 0, P0, 4, 1)[4].balance, P0 + 4 * 60000, 1e-9);   // R = 0
    });

    test('a shrinking portfolio stops at $0', () => {
        const path = F.balancePath(20000, 120000, 0.03, 500000, 30, 1);
        assert.ok(path.some(p => p.balance === 0));
        const i = path.findIndex(p => p.balance === 0);
        assert.ok(path.slice(i).every(p => p.balance === 0));
    });
});

describe('contour geometry', () => {
    test('every point on X = X* + m_L (I − I*) is exactly L years from FI', () => {
        const f = F.focalPoint(R, S, P0);
        for (const L of [1, 5, 12.5, 30]) {
            const m = F.contourSlope(L, R, S);
            for (const I of [60000, 150000, 300000]) close(F.yearsToFI(I, f.X + m * (I - f.I), R, S, P0), L, 1e-9);
        }
    });

    test('slopes run from 0 toward the never line (slope 1)', () => {
        close(F.contourSlope(0, R, S), 0, 1e-12);
        assert.ok(F.contourSlope(10, R, S) < F.contourSlope(20, R, S));
        assert.ok(F.contourSlope(500, R, S) < 1 && F.contourSlope(500, R, S) > 0.999);
        close(F.contourSlope(10, 0, S), S * 10 / (1 + S * 10), 1e-12);
    });
});

describe('gradient and sensitivities', () => {
    test('analytic partials match finite differences', () => {
        for (const [I, X] of [[190000, 90000], [80000, 70000], [250000, 110000]]) {
            const g = F.gradient(I, X, R, S, P0), h = 1;
            close(g.dI, (F.yearsToFI(I + h, X, R, S, P0) - F.yearsToFI(I - h, X, R, S, P0)) / (2 * h), 1e-9);
            close(g.dX, (F.yearsToFI(I, X + h, R, S, P0) - F.yearsToFI(I, X - h, R, S, P0)) / (2 * h), 1e-9);
        }
    });

    test('n depends only on the direction from the focal point', () => {
        const f = F.focalPoint(R, S, P0), I = 190000, X = 90000, g = F.gradient(I, X, R, S, P0);
        close((I - f.I) * g.dI + (X - f.X) * g.dX, 0, 1e-12);
        close(F.sensitivities(I, X, R, S, P0).spendVsIncome, (I - f.I) / (X - f.X), 1e-9);
    });

    test('reference case: 6.47 years, $1 less spending ≈ $4.37 more income', () => {
        const s = F.sensitivities(190000, 90000, R, S, P0);
        close(s.years, 6.4668, 1e-3);
        close(s.fiNumber, 2250000, 1e-6);
        close(s.perKExpenses, 0.1563, 1e-3);
        close(s.perKIncome, 0.0358, 1e-3);
        close(s.spendVsIncome, 4.3696, 1e-3);
        assert.ok(s.perPointReturn > 0.5 && s.perPointReturn < 0.6);
    });

    test('outside the reachable region the partials are null', () => {
        assert.equal(F.gradient(100000, 40000, R, S, P0), null);
        assert.equal(F.sensitivities(50000, 120000, R, S, P0).perKIncome, null);
    });
});

describe('buildModel', () => {
    const model = F.buildModel({ cellMm: 0.5 });
    const p = model.p, cell = model.cell;
    const at = (x, y) => model.z[Math.round(y / cell) * model.nx + Math.round(x / cell)];
    const surface = (I, X) => p.baseMm + p.liftMm + Math.min(F.yearsToFI(I, X, p.R, p.S, p.P0), p.capYears) * p.heightMm / p.capYears;

    test('grid covers plot plus ledges', () => {
        assert.equal(model.nx, Math.round((p.marginLeft + p.widthMm + p.marginRight) / cell) + 1);
        assert.equal(model.z.length, model.nx * model.ny);
    });

    test('heights: ledge = base, surface = years scaled, never = plateau at the cap', () => {
        close(at(2, 2), p.baseMm, 1e-6);
        // a point away from every ridge: I = 237.5k, X = 50k
        close(at(model.toX(237500), model.toY(50000)), surface(237500, 50000), 0.05);
        // top-left corner: never reaches FI → plateau (a little inside the edge)
        close(at(model.toX(52000), model.toY(118000)), p.baseMm + p.liftMm + p.heightMm, 1e-4);
    });

    test('a raised line has its full height across exactly its width', () => {
        const y = model.toY(5000), x0 = model.toX(p.youIncome);    // $5k: already FI, so the surface is flat
        let full = 0;
        for (let x = x0 - 3; x <= x0 + 3; x += cell) {
            const base = surface(p.incomeRange[0] + (x - p.marginLeft) / p.widthMm * (p.incomeRange[1] - p.incomeRange[0]), 5000);
            if (Math.abs(at(x, y) - base - p.youRidge.height) < 1e-3) full++;
        }
        close(full * cell, p.youRidge.width, cell + 1e-9);
    });
});

describe('printability', () => {
    test('every contour shape is level, starts at its line, and lies uphill of it', () => {
        const opts = { cellMm: 0.25, layerMm: 0.2, firstLayerMm: 0.3, heightMm: 47 };
        const onLayer = (z, what) => close((z - 0.3) / 0.2, Math.round((z - 0.3) / 0.2), 1e-9, what);
        const plain = F.buildModel(Object.assign({ contourShape: 'none' }, opts));
        for (const shape of ['step', 'shelf']) {
            const model = F.buildModel(Object.assign({ contourShape: shape }, opts));
            const others = model.lines.filter(l => l.kind !== 'contour');
            for (const ln of model.lines.filter(l => l.kind === 'contour')) {
                onLayer(ln.zLine, `${ln.value}-year line height`);
                onLayer(ln.top(), `${ln.value}-year step top`);
                let inside = 0;
                for (let iy = 0; iy < model.ny; iy++) for (let ix = 0; ix < model.nx; ix++) {
                    const k = iy * model.nx + ix, x = ix * model.cell, y = iy * model.cell;
                    if (!model.plot[k] || nearDot(model, x, y) || others.some(o => Math.abs(o.dist(x, y)) <= o.width / 2 + 0.01)) continue;
                    const d = ln.dist(x, y);
                    if (d > 0.05 && d < 1.5) close(model.z[k], plain.z[k], 1e-5, 'downhill of the line is untouched');
                    if (d > 0 || d < -ln.width) continue;
                    inside++;
                    if (shape === 'step') assert.ok(model.z[k] >= Math.min(ln.top(), model.zCap) - 1e-4, `${ln.value}-year step dips below its top`);   // (capped at the plateau)
                    else close(model.z[k], ln.zLine, 1e-4, `${ln.value}-year shelf floor`);
                }
                assert.ok(inside > 0, `${shape} ${ln.value}`);
            }
        }
    });

    test('a shelf is cut level into the slope; no shape leaves the plain surface', () => {
        const opts = { cellMm: 0.5 };
        const shelf = F.buildModel(Object.assign({ contourShape: 'shelf' }, opts));
        const none = F.buildModel(Object.assign({ contourShape: 'none' }, opts));
        const noContours = F.buildModel(Object.assign({ contourShape: 'none', contourYears: [] }, opts));
        let cut = 0;
        for (let k = 0; k < shelf.z.length; k++) {
            assert.ok(shelf.z[k] <= none.z[k] + 0.1 + 1e-5, 'a shelf cuts down (lifting at most half a layer to stay level)');
            if (shelf.z[k] < none.z[k] - 1e-5) cut++;
            close(none.z[k], noContours.z[k], 1e-6, 'shape none adds no geometry');
        }
        assert.ok(cut > 0);
    });

    test('contour tops are filled level up to the slope, uphill only, so the top layer is one band', () => {
        const opts = { cellMm: 0.5, widthMm: 200, depthMm: 96 };
        const filled = F.buildModel(opts), bare = F.buildModel(Object.assign({ contourFillMm: 0 }, opts));
        const p = filled.p, [I0, I1] = p.incomeRange, [X0, X1] = p.expenseRange;
        const contours = filled.lines.filter(l => l.kind === 'contour' && l.value < p.capYears);
        let gapsBare = 0, raised = 0;
        for (let iy = 0; iy < filled.ny; iy++) for (let ix = 0; ix < filled.nx; ix++) {
            const k = iy * filled.nx + ix, x = ix * filled.cell, y = iy * filled.cell;
            if (x < p.marginLeft + 1 || x > p.marginLeft + p.widthMm - 1 || y < p.marginFront + 1 || y > p.marginFront + p.depthMm - 1) continue;
            for (const ln of contours) {
                const d = ln.dist(x, y);
                if (d > 0 || d < -3) continue;
                assert.ok(filled.z[k] >= ln.top() - 1e-4, `dip below the ${ln.value}-year top`);
                if (bare.z[k] < ln.top() - 1e-4) gapsBare++;
            }
            if (filled.z[k] > bare.z[k] + 1e-6) {                     // filled: must be uphill (more years)
                raised++;
                const n = F.yearsToFI(I0 + (x - p.marginLeft) / p.widthMm * (I1 - I0), X0 + (y - p.marginFront) / p.depthMm * (X1 - X0), p.R, p.S, p.P0);
                const ln = contours.reduce((a, b) => Math.abs(b.dist(x, y)) < Math.abs(a.dist(x, y)) ? b : a);
                assert.ok(n >= ln.value, `filled point below the ${ln.value}-year line`);
            }
        }
        assert.ok(gapsBare > 0 && raised > 0);
    });

    test('the plateau stays flat: no line or step rises above it', () => {
        for (const shape of ['step', 'shelf']) {
            const m = F.buildModel({ cellMm: 0.5, contourShape: shape }), p = m.p;
            const [I0, I1] = p.incomeRange, [X0, X1] = p.expenseRange;
            let plateau = 0;
            for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
                const k = iy * m.nx + ix;
                if (!m.plot[k]) continue;
                assert.ok(m.z[k] <= m.zCap + 1e-4, `${shape}: above the plateau`);
                const x = ix * m.cell, y = iy * m.cell;
                const n = F.yearsToFI(I0 + (x - p.marginLeft) / p.widthMm * (I1 - I0), X0 + (y - p.marginFront) / p.depthMm * (X1 - X0), p.R, p.S, p.P0);
                if (n >= p.capYears) { plateau++; close(m.z[k], m.zCap, 1e-4, `${shape}: plateau not flat`); }
            }
            assert.ok(plateau > 0);
        }
    });

    test('base, lift and text depth snap to layers; layerMm 0 leaves them alone', () => {
        const snapped = F.buildModel({ cellMm: 1, baseMm: 2.5, liftMm: 0.9, textDepthMm: 0.5, layerMm: 0.2, firstLayerMm: 0.2 }).p;
        for (const v of [snapped.baseMm, snapped.baseMm + snapped.liftMm]) close((v - 0.2) / 0.2, Math.round((v - 0.2) / 0.2), 1e-9);
        close(snapped.textDepthMm / 0.2, Math.round(snapped.textDepthMm / 0.2), 1e-9);
        const raw = F.buildModel({ cellMm: 1, baseMm: 2.5, liftMm: 0.9, textDepthMm: 0.5, layerMm: 0 }).p;
        assert.equal(raw.baseMm, 2.5); close(raw.liftMm, 0.9, 1e-12); assert.equal(raw.textDepthMm, 0.5);
    });

    test('ridges have sharp edges: no heights between the surface and the ridge top', () => {
        const model = F.buildModel({ cellMm: 0.5 });
        const ln = model.lines.find(l => l.kind === 'youExpenses');
        for (let ix = 0; ix < model.nx; ix++) {
            for (const dy of [-1, -0.5, 0, 0.5, 1]) {
                const y = model.toY(model.p.youExpenses) + dy, iy = Math.round(y / model.cell), k = iy * model.nx + ix;
                if (!model.plot[k] || Math.abs(ln.dist(ix * model.cell, iy * model.cell)) > ln.width / 2) continue;
                const x0 = ix * model.cell, y0 = iy * model.cell;       // the highest line covering this point wins
                if (model.lines.some(l => l.kind === 'contour' && l.dist(x0, y0) <= 0.1 && l.dist(x0, y0) >= -9)) continue;  // contour steps
                const tops = model.lines.filter(l => l.kind !== 'contour' && Math.abs(l.dist(x0, y0)) <= l.width / 2).map(l => l.top(x0, y0));
                // just downhill of a step, no line rises above its top
                const lids = model.lines.filter(l => l.kind === 'contour' && l.dist(x0, y0) > 0 && l.top() < model.zCap).map(l => l.top());
                close(model.z[k], Math.min(Math.max(...tops), model.zCap, ...lids), 1e-4);   // nothing rises above the plateau
            }
        }
    });
});

describe('layoutLabels', () => {
    const model = F.buildModel({ cellMm: 0.5 });
    const { labels, skipped } = F.layoutLabels(model, measure);

    test('labels every tick, both titles, both "you" lines and every contour at the defaults', () => {
        assert.deepEqual(skipped, []);
        const texts = labels.map(l => l.text);
        for (const t of ['50k', '300k', '0', '120k', 'INCOME ($/YR)', 'EXPENSES ($/YR)', 'YOU 100k', 'YOU 60k'])
            assert.ok(texts.includes(t), t);
        for (const L of model.p.contourYears)
            assert.ok(texts.some(t => t.startsWith(String(L))), `contour ${L}`);
    });

    test('labels stay on the model and never overlap each other', () => {
        const boxes = labels.map(l => {
            const w = measure(l.text, l.size) / 2, h = l.size * 0.4, a = l.angle * Math.PI / 180;
            const pts = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([u, v]) =>
                [l.x + u * Math.cos(a) - v * Math.sin(a), l.y + u * Math.sin(a) + v * Math.cos(a)]);
            for (const [x, y] of pts) assert.ok(x >= 0 && y >= 0 && x <= model.widthMm && y <= model.depthMm, l.text);
            return pts;
        });
        // separating-axis test on every pair of rotated rectangles
        const overlap = (A, B) => [A, B].every(poly => poly.every((p, i) => {
            const q = poly[(i + 1) % 4], ax = q[1] - p[1], ay = p[0] - q[0];
            const proj = P => P.map(([x, y]) => x * ax + y * ay);
            const a = proj(A), b = proj(B);
            return Math.max(...a) > Math.min(...b) + 1e-6 && Math.max(...b) > Math.min(...a) + 1e-6;
        }));
        for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++)
                assert.ok(!overlap(boxes[i], boxes[j]), `${labels[i].text} overlaps ${labels[j].text}`);
    });

    test('every contour label sits just uphill of its own line (one label per year band)', () => {
        let inline = 0;
        for (const l of labels) {
            const m = l.text.match(/^(\d+)\+? YRS$/);
            if (!m) continue;
            const ln = model.lines.find(q => q.kind === 'contour' && q.value === +m[1]);
            assert.ok(ln.dist(l.x, l.y) < 0, `${l.text} is downhill of its line`);
            inline++;
        }
        assert.ok(inline > 0);
    });

    test('the auto caption names its month, and shrinks to fit beside the title', () => {
        const m = F.buildModel({ cellMm: 0.5, captionDate: 'OCT 2026' });
        const cap = F.layoutLabels(m, measure).labels.find(l => l.text.startsWith('OCT 2026'));
        assert.ok(cap, 'caption placed');
        for (const part of ['$250k SAVED', '5% RETURN', '4% SWR']) assert.ok(cap.text.includes(part), part);
        assert.ok(cap.size <= m.p.titleTextMm * 0.8 + 1e-9 && cap.size >= m.p.tickTextMm * 0.75 - 1e-9);
        const mid = 'M'.repeat(70);                         // too long beside the title: moves to the back ledge
        const mm = F.buildModel({ cellMm: 0.5, captionText: mid, contourYears: [] });   // (contour labels outrank it)
        const placed = F.layoutLabels(mm, measure).labels.find(l => l.text === mid);
        close(placed.y, mm.p.marginFront + mm.p.depthMm + mm.p.marginBack / 2, 1e-9);
        const long = 'X'.repeat(200);                       // too long even when shrunk: reported, not drawn
        assert.ok(F.layoutLabels(F.buildModel({ cellMm: 0.5, captionText: long }), measure).skipped.includes(long));
    });

    test('inline text never reads upside down', () => {
        for (const l of labels) assert.ok(l.angle > -90 && l.angle <= 90, `${l.text} at ${l.angle}`);
    });

    test('ledge text is configurable and the ledges resize to fit it', () => {
        const m = F.buildModel({ cellMm: 0.5, incomeTitle: 'TAKE-HOME', expenseTitle: '', captionText: 'MY PLAN',
                                 youLabel: 'ME', tickTextMm: 7, titleTextMm: 8 });
        const texts = F.layoutLabels(m, measure).labels.map(l => l.text);
        for (const t of ['TAKE-HOME', 'MY PLAN', 'ME 100k', 'ME 60k']) assert.ok(texts.includes(t), t);
        assert.ok(!texts.includes('EXPENSES ($/YR)') && !texts.includes('YOU 100k'));
        assert.equal(m.p.marginFront, 1.5 + 7 + 1.5 + 8 + 2.5);       // ticks + title row
        assert.equal(m.p.marginLeft, 1.5 + 7 + 2.5);                  // ticks only: no expense title
        assert.equal(F.buildModel({ cellMm: 1 }).p.marginFront, 16);  // the defaults
        const none = F.layoutLabels(F.buildModel({ cellMm: 0.5, tickLabels: false, caption: false }), measure).labels;
        assert.ok(!none.some(l => /^\d|^0$/.test(l.text) && !/YRS|y$/.test(l.text)), 'no tick labels');
    });
});

describe('text outline', () => {
    // Fraction of each grid cell inside a shape (supersampled), like the page's canvas rasterizer.
    function cellCoverage(nx, ny, cell, inside, ss = 16) {
        const cx = nx - 1, cy = ny - 1, cov = new Float32Array(cx * cy);
        for (let iy = 0; iy < cy; iy++) for (let ix = 0; ix < cx; ix++) {
            let n = 0;
            for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++)
                n += inside((ix + (i + 0.5) / ss) * cell, (iy + (j + 0.5) / ss) * cell) ? 1 : 0;
            cov[iy * cx + ix] = n / (ss * ss);
        }
        return cov;
    }

    test('textField averages the four cells around each point and keeps the outer points clear', () => {
        const nx = 6, ny = 5, f = F.textField(new Float32Array(5 * 4).fill(1), nx, ny);
        for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
            const edge = ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1;
            assert.equal(f[iy * nx + ix], edge ? 0 : 1);
        }
    });

    test('a straight letter edge lands exactly where it is, not on the grid', () => {
        const nx = 20, ny = 12, cell = 0.5, x0 = 4.37, z = new Float32Array(nx * ny).fill(3);
        const field = F.textField(cellCoverage(nx, ny, cell, (x, y) => x < x0 && y > 1.5 && y < 4), nx, ny);
        const mesh = F.buildMesh(z, nx, ny, cell, { field, offset: -0.6 });
        let crossings = 0;
        for (let v = mesh.topVertices; v < mesh.textEnd; v++) {
            const x = mesh.positions[3 * v];
            const y = mesh.positions[3 * v + 1];
            if (y < 2.4 || y > 3.1) continue;                  // the straight stretch, away from the corners
            if (x > 2 && Math.abs(x - Math.round(x / cell) * cell) > 1e-6) { close(x, x0, cell / 16); crossings++; }   // to the sampling step; (x < 2: the cleared border)
        }
        assert.ok(crossings > 0);
    });

    test('a round letter: closed, vertical walls, volume change = its area × depth', () => {
        const nx = 40, ny = 40, cell = 0.25, r = 3, c = 5, z = new Float32Array(nx * ny).fill(3);
        const field = F.textField(cellCoverage(nx, ny, cell, (x, y) => Math.hypot(x - c, y - c) < r), nx, ny);
        const slab = (nx - 1) * cell * (ny - 1) * cell * 3;
        for (const offset of [-0.6, 0.6]) {
            const mesh = F.buildMesh(z, nx, ny, cell, { field, offset });
            const { manifold, volume } = F.checkClosed(mesh);
            assert.ok(manifold, `offset ${offset}`);
            close((volume - slab) / offset, Math.PI * r * r, 0.01 * Math.PI * r * r);
            for (let i = 2; i < mesh.positions.length; i += 3)
                assert.ok([0, 3, 3 + offset].some(v => Math.abs(mesh.positions[i] - v) < 1e-5));
        }
    });

    test('any pattern, including saddles both ways, stays watertight', () => {
        const nx = 30, ny = 25, cell = 0.5, z = new Float32Array(nx * ny);
        let seed = 11;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < z.length; k++) z[k] = 3 + rand();
        const field = F.textField(Float32Array.from({ length: (nx - 1) * (ny - 1) }, () => rand()), nx, ny);
        for (const offset of [-0.6, 0.6]) {
            const { manifold, volume } = F.checkClosed(F.buildMesh(z, nx, ny, cell, { field, offset }));
            assert.ok(manifold, `offset ${offset}`);
            assert.ok(volume > 0);
        }
    });

    test('the full print model with debossed text stays watertight', () => {
        const model = F.buildModel({ cellMm: 0.5 });
        let seed = 3;
        const field = F.textField(Float32Array.from({ length: (model.nx - 1) * (model.ny - 1) },
            () => ((seed = (seed * 16807) % 2147483647) % 7 === 0 ? 1 : 0)), model.nx, model.ny);
        const { manifold, volume } = F.checkClosed(F.buildMesh(model.z, model.nx, model.ny, model.cell, { field, offset: -0.6 }));
        assert.ok(manifold);
        assert.ok(volume > 0);
    });
});

describe('contour shape edges', () => {
    const meshOf = (m, text) => F.buildMesh(m.zOut, m.nx, m.ny, m.cell, text, { field: m.bandField, z: m.bandZ, hard: m.hard });

    test('shelf edges are traced on their exact lines, not stair-stepped along the grid', () => {
        const m = F.buildModel({ cellMm: 0.5, contourShape: 'shelf' });
        const mesh = meshOf(m), P = mesh.positions, cell = m.cell;
        const contours = m.lines.filter(l => l.kind === 'contour');
        let onLine = 0;
        for (let v = mesh.topVertices; v < mesh.textEnd; v++) {
            const x = P[3 * v], y = P[3 * v + 1], zz = P[3 * v + 2];
            const offGrid = Math.abs(x / cell - Math.round(x / cell)) > 1e-4 || Math.abs(y / cell - Math.round(y / cell)) > 1e-4;
            const ln = contours.find(l => Math.abs(zz - l.zLine) < 1e-3);
            const { marginLeft: ml, marginFront: mf, widthMm: W, depthMm: D } = m.p;
            const border = x < ml + cell || x > ml + W - cell || y < mf + cell || y > mf + D - cell;   // (shelf meets the plot's edge)
            // (raised lines cross the shelf as their own strips, and the dot sits in a moat: their
            // corners with the shelf edge round off over a cell or two)
            const byRidge = m.lines.some(l => l.kind !== 'contour' && Math.abs(Math.abs(l.dist(x, y)) - l.width / 2) < 2 * cell);
            if (!offGrid || !ln || border || byRidge || nearDot(m, x, y, 3 * cell)) continue;   // a shelf-floor crossing
            const d = ln.dist(x, y);
            assert.ok(Math.min(Math.abs(d), Math.abs(d + ln.width)) < 0.06 * cell,   // (crossings stay 5% of a cell off the corners)
                 `crossing ${Math.min(Math.abs(d), Math.abs(d + ln.width)).toFixed(3)} mm off the ${ln.value}-year shelf edge`);
            onLine++;
        }
        assert.ok(onLine > 50, 'checked ' + onLine);
    });

    test('shelves and steps (with text) stay watertight', () => {
        for (const shape of ['shelf', 'step']) {
            const m = F.buildModel({ cellMm: 0.5, contourShape: shape });
            let seed = 5;
            const field = F.textField(Float32Array.from({ length: (m.nx - 1) * (m.ny - 1) },
                () => ((seed = (seed * 16807) % 2147483647) % 9 === 0 ? 1 : 0)), m.nx, m.ny);
            for (const text of [null, { field, offset: -0.6 }]) {
                const { manifold, volume } = F.checkClosed(meshOf(m, text));
                assert.ok(manifold, `${shape}${text ? ' + text' : ''}`);
                assert.ok(volume > 0);
            }
        }
    });

    test('the traced mesh matches the grid model away from the edges (same volume within 1%)', () => {
        for (const shape of ['shelf', 'step']) {
            const m = F.buildModel({ cellMm: 0.5, contourShape: shape });
            const traced = F.checkClosed(meshOf(m)).volume, grid = F.checkClosed(F.buildMesh(m.z, m.nx, m.ny, m.cell)).volume;
            close(traced / grid, 1, 0.01, shape);
        }
    });
});

describe('mesh quality', () => {
    test('no zero-area triangles: walls with no height are welded shut, and it stays watertight', () => {
        for (const shape of ['shelf', 'step', 'none']) {
            const m = F.buildModel({ cellMm: 0.5, contourShape: shape });
            const mesh = F.buildMesh(m.zOut, m.nx, m.ny, m.cell, null, { field: m.bandField, z: m.bandZ, hard: m.hard });
            const P = mesh.positions, T = mesh.indices;
            let flat = 0;
            for (let t = 0; t < T.length; t += 3) {
                const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
                const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
                const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
                if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2 < 1e-5) flat++;
            }
            assert.equal(flat, 0, shape);
            assert.ok(F.checkClosed(mesh).manifold, shape);
        }
    });
});

describe('your dot', () => {
    const m = F.buildModel({ cellMm: 0.25, contourShape: 'shelf' });
    const at = (x, y) => m.z[Math.round(y / m.cell) * m.nx + Math.round(x / m.cell)];

    test('a level disc on a layer boundary, standing above everything around it', () => {
        const { x, y, r, top } = m.marker;
        close((top - 0.2) / 0.2, Math.round((top - 0.2) / 0.2), 1e-6, 'top on a layer');
        for (let a = 0; a < 360; a += 15) {
            const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
            for (const f of [0, 0.3, 0.6, 0.85]) close(at(x + f * r * c, y + f * r * s), top, 1e-4, 'level top');
            assert.ok(at(x + (r + 1) * c, y + (r + 1) * s) < top - 1, 'stands at least 1 mm proud (uphill, on your line)');
        }
    });

    test('its edge is traced as a circle, watertight', () => {
        const m = F.buildModel({ cellMm: 0.25, contourShape: 'none' });     // (no shelf beside it)
        const mesh = F.buildMesh(m.zOut, m.nx, m.ny, m.cell, null, { field: m.bandField, z: m.bandZ, hard: m.hard });
        const P = mesh.positions, { x, y, r, top } = m.marker;
        let n = 0;
        for (let v = mesh.topVertices; v < mesh.textEnd; v++) {
            const offGrid = [P[3 * v], P[3 * v + 1]].some(c => Math.abs(c / m.cell - Math.round(c / m.cell)) > 1e-4);
            if (!offGrid || Math.abs(P[3 * v + 2] - top) > 1e-4) continue;    // a crossing on the dot's top
            const d = Math.hypot(P[3 * v] - x, P[3 * v + 1] - y);
            if (d > r - 0.3) { assert.ok(Math.abs(d - r) < 0.06 * m.cell + 0.01, `edge ${d.toFixed(3)} vs ${r}`); n++; }
        }
        assert.ok(n > 50, 'checked ' + n);
        assert.ok(F.checkClosed(mesh).manifold);
    });

    test('it meets a step beside it with a vertical wall, not a ramp', () => {
        // the 15-year step's fill runs into the dot; at 0.2 mm, grid points fall on its rim
        for (const cellMm of [0.35, 0.2]) {
            const m = F.buildModel({ cellMm });
            const mesh = F.buildMesh(m.zOut, m.nx, m.ny, m.cell, null, { field: m.bandField, z: m.bandZ, hard: m.hard });
            const P = mesh.positions, I = mesh.indices, { x, y, r, top } = m.marker;
            let ramps = 0, touching = 0;
            for (let t = 0; t < I.length; t += 3) {
                const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
                const atTop = v.filter(q => Math.abs(q[2] - top) < 1e-4).length;
                if (atTop === 0 || atTop === 3 || v.some(q => Math.hypot(q[0] - x, q[1] - y) > r + 2)) continue;
                touching++;
                const area = Math.abs((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])) / 2;
                if (area > 1e-6) ramps++;                      // not a wall: it slopes down off the top
            }
            assert.ok(touching > 50, 'checked ' + touching);
            assert.equal(ramps, 0, `ramps at ${cellMm} mm`);
        }
    });

    test('grid points exactly on its rim take its top (no notches where your lines meet it)', () => {
        const m = F.buildModel({ cellMm: 0.5 });          // center on the grid, r a whole number of cells
        const { x, y, r, top } = m.marker;
        let n = 0;
        for (const [u, v] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
            const k = Math.round((y + v) / m.cell) * m.nx + Math.round((x + u) / m.cell);
            if (m.bandField[k] < 0.5) continue;
            close(m.bandZ[k], top, 1e-4, `rim point at (${u}, ${v})`);
            n++;
        }
        assert.equal(n, 4);
    });

    test('labels keep clear of it; youMarker null leaves no dot', () => {
        const { x, y, r } = m.marker;
        for (const l of F.layoutLabels(m, measure).labels)
            assert.ok(Math.hypot(l.x - x, l.y - y) > r + l.size * 0.4, l.text);
        assert.equal(F.buildModel({ cellMm: 1, youMarker: null }).marker, null);
    });
});

describe('site label', () => {
    test('on the right ledge near the back, only when set', () => {
        const m = F.buildModel({ cellMm: 0.5, siteText: 'MONEYPLOTLABS.COM' });
        const l = F.layoutLabels(m, measure).labels.find(l => l.text === 'MONEYPLOTLABS.COM');
        assert.ok(l, 'placed');
        assert.equal(l.angle, 90);
        assert.ok(l.x > m.p.marginLeft + m.p.widthMm && l.y > m.p.marginFront + m.p.depthMm / 2);
        assert.ok(!F.layoutLabels(F.buildModel({ cellMm: 0.5 }), measure).labels.some(l => l.text.includes('MONEYPLOT')));
    });
});

describe('colorPlan', () => {
    const model = F.buildModel({ cellMm: 1, layerMm: 0.2, firstLayerMm: 0.2 });
    const onLayer = z => close((z - 0.2) / 0.2, Math.round((z - 0.2) / 0.2), 1e-9, `z ${z} on a layer`);

    test('contour lines: accent on exactly the top layer of every contour ridge', () => {
        const plan = F.colorPlan(model, { contours: 'lines', baseLabels: false });
        assert.equal(plan.start, 'body');
        const tops = model.lines.filter(l => l.kind === 'contour').map(l => Math.min(l.top(), model.zCap)).sort((a, b) => a - b);   // (the cap step is the plateau)
        // the cap line is the plateau's top layer, the model's last: no swap back after it
        assert.equal(plan.changes.length, 2 * tops.length - 1);
        tops.forEach((t, i) => {
            assert.equal(plan.changes[2 * i].to, 'accent');
            close(plan.changes[2 * i].z, t, 1e-9);
            if (i < tops.length - 1) { assert.equal(plan.changes[2 * i + 1].to, 'body'); close(plan.changes[2 * i + 1].z, t + 0.2, 1e-9); }
        });
        plan.changes.forEach(c => onLayer(c.z));
    });

    test('with a cut shelf or no shape, the accent line is the layer at the line height', () => {
        for (const shape of ['shelf', 'none']) {
            const m = F.buildModel({ cellMm: 1, layerMm: 0.2, firstLayerMm: 0.2, contourShape: shape });
            const plan = F.colorPlan(m, { contours: 'lines', baseLabels: false });
            const heights = m.lines.filter(l => l.kind === 'contour').map(l => l.zLine).sort((a, b) => a - b);
            heights.forEach((z, i) => {
                close(plan.changes[2 * i].z, z, 1e-9);
                if (i < heights.length - 1) close(plan.changes[2 * i + 1].z, z + 0.2, 1e-9);   // none after the top layer
            });
            const bands = F.colorPlan(m, { contours: 'bands', baseLabels: false });
            heights.forEach((z, i) => close(bands.changes[i].z, z + (i === heights.length - 1 ? 0 : 0.2), 1e-9));   // the plateau's band starts on its top layer
        }
    });

    test('debossed base labels: start in the accent, switch just above the letter floors', () => {
        const plan = F.colorPlan(model, { contours: 'none', baseLabels: true });
        assert.equal(plan.start, 'accent');
        assert.equal(plan.changes.length, 1);
        close(plan.changes[0].z, model.p.baseMm - model.p.textDepthMm + 0.2, 1e-9);
    });

    test('bands alternate at each contour; never two swaps to the same color in a row', () => {
        const plan = F.colorPlan(model, { contours: 'bands', baseLabels: true });
        let color = plan.start;
        for (const c of plan.changes) { assert.notEqual(c.to, color); color = c.to; onLayer(c.z); }
        assert.equal(F.colorPlan(F.buildModel({ cellMm: 1, layerMm: 0 }), { contours: 'lines' }), null);
    });
});

describe('mesh and STL', () => {
    test('a flat slab is closed, outward-facing, with the right volume and triangle count', () => {
        const nx = 7, ny = 5, cell = 2, z = new Float32Array(nx * ny).fill(3);
        const mesh = F.buildMesh(z, nx, ny, cell);
        const { manifold, volume } = F.checkClosed(mesh);
        assert.ok(manifold);
        close(volume, (nx - 1) * cell * (ny - 1) * cell * 3, 1e-6);
        const nb = 2 * (nx - 1) + 2 * (ny - 1);
        assert.equal(mesh.indices.length / 3, 2 * (nx - 1) * (ny - 1) + 3 * nb);
    });

    test('the full print model is watertight with positive volume', () => {
        const model = F.buildModel({ cellMm: 1 });
        const mesh = F.buildMesh(model.z, model.nx, model.ny, model.cell);
        const { manifold, volume } = F.checkClosed(mesh);
        assert.ok(manifold);
        assert.ok(volume > 0);
    });

    test('binary STL has the standard layout and unit normals', () => {
        const z = new Float32Array(9).fill(1);
        const mesh = F.buildMesh(z, 3, 3, 1);
        const buf = F.toBinarySTL(mesh), dv = new DataView(buf);
        const n = mesh.indices.length / 3;
        assert.equal(buf.byteLength, 84 + 50 * n);
        assert.equal(dv.getUint32(80, true), n);
        // first triangle is on top: normal (0, 0, 1)
        close(dv.getFloat32(84 + 8, true), 1, 1e-6);
    });
});
