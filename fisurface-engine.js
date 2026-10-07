/* ============================================================
   fisurface-engine.js — Years-to-FI surface + printable model
   ------------------------------------------------------------
   The years to financial independence n(I, X) as a function of
   income I and expenses X (Whitepaper 006), and everything needed
   to turn that surface into a 3D-printable STL:

     • yearsToFI / gradient / sensitivities — the closed form, its
       analytic partial derivatives, and per-$1k / per-1% effects
     • focalPoint / contourSlope — every iso-year contour is a
       straight line through one focal point
     • buildModel — heightmap (mm) with constant-width raised lines
     • layoutLabels / textField — tick labels, axis titles and an
       inline label beside every raised line, cut in (deboss) or
       raised (emboss) with vertical walls
     • buildMesh / checkClosed / toBinarySTL — watertight mesh and
       binary STL
     • colorPlan — filament color changes (by layer) for contour
       lines, year bands and the base labels

   Text needs a font, so measuring and rasterizing it is injected
   (the page uses a <canvas>); everything else is pure. Exposed as a
   browser global `FISurface` and as a CommonJS module for Node tests.
   ============================================================ */

(function (global) {
    'use strict';

    // ── Closed form ─────────────────────────────────────────────
    // Years n until P_n = P_{n-1}(1+R) + (I - X) reaches the FI number X/S.
    // 0 if already FI (P0 ≥ X/S); Infinity if the portfolio is not growing
    // (R·P0 + I − X ≤ 0). Written as ln(1 + R·gap/u) / ln(1+R) so it stays exact
    // at I = X and as R → 0 (where it tends to gap / u).
    function yearsToFI(I, X, R, S, P0) {
        const gap = X / S - P0;            // how far below the FI number you are today
        if (gap <= 0) return 0;
        const u = R * P0 + (I - X);        // how much the portfolio grows in year one
        if (u <= 0) return Infinity;
        return R > 0 ? Math.log1p(R * gap / u) / Math.log1p(R) : gap / u;
    }

    // Analytic partials in years per dollar, or null outside the reachable region.
    //   ∂n/∂I = −ρ·gap / (u·D),  ∂n/∂X = ρ·(1/S + gap/u) / D,
    // with D = u + R·gap and ρ = R / ln(1+R) (→ 1 as R → 0).
    function gradient(I, X, R, S, P0) {
        const gap = X / S - P0;
        const u = R * P0 + (I - X);
        if (gap <= 0 || u <= 0) return null;
        const D = u + R * gap;
        const rho = R > 0 ? R / Math.log1p(R) : 1;
        return { dI: -rho * gap / (u * D), dX: rho * (1 / S + gap / u) / D };
    }

    // Every iso-year contour is the line X = X* + m_L (I − I*) through this point:
    // exactly at FI (X = S·P0) while spending exactly the portfolio's growth (I − X = −R·P0).
    function focalPoint(R, S, P0) {
        return { I: P0 * (S - R), X: S * P0 };
    }

    // Slope m_L of the L-year contour: 0 for L = 0 (the "already FI" line), → 1 as
    // L → ∞ (the "never" line X = I + R·P0).
    function contourSlope(L, R, S) {
        const s = R > 0 ? (Math.pow(1 + R, L) - 1) / R : L;   // future value of $1/yr for L years
        return S * s / (1 + S * s);
    }

    // Portfolio over time, P(t) = P0(1+R)^t + (I−X)·((1+R)^t − 1)/R (P0 + (I−X)·t at R = 0):
    // the same model as yearsToFI, so it meets the FI number X/S exactly at t = n. Sampled
    // every `step` years from 0 to `years`; a portfolio that runs out stays at $0.
    function balancePath(I, X, R, P0, years, step) {
        const C = I - X, out = [];
        let empty = false;
        for (let i = 0; i * step <= years + 1e-9; i++) {
            const t = i * step, g = Math.pow(1 + R, t);
            let b = R > 0 ? P0 * g + C * (g - 1) / R : P0 + C * t;
            if (b <= 0 || empty) { b = 0; empty = true; }
            out.push({ t, balance: b });
        }
        return out;
    }

    // What one more unit of each lever is worth at (I, X), in years sooner.
    function sensitivities(I, X, R, S, P0) {
        const years = yearsToFI(I, X, R, S, P0);
        const g = gradient(I, X, R, S, P0);
        const lo = yearsToFI(I, X, Math.max(0, R - 0.005), S, P0);
        const hi = yearsToFI(I, X, R + 0.005, S, P0);
        return {
            years,
            fiNumber: X / S,
            perKExpenses: g ? g.dX * 1000 : null,            // years sooner per $1k/yr less spending
            perKIncome:   g ? -g.dI * 1000 : null,           // years sooner per $1k/yr more income
            spendVsIncome: g ? g.dX / -g.dI : null,          // $ of raise that $1 less spending is worth
            perPointReturn: (isFinite(lo) && isFinite(hi)) ? (lo - hi) / ((R + 0.005) - Math.max(0, R - 0.005)) * 0.01 : null,
        };
    }

    // ── Print model ─────────────────────────────────────────────
    const DEFAULTS = {
        R: 0.05, S: 0.04, P0: 250000,
        youIncome: 100000, youExpenses: 60000,
        incomeRange: [50000, 300000], expenseRange: [0, 120000],
        capYears: 30,                                   // flat plateau at/after this (incl. "never")
        contourYears: [5, 10, 15, 20, 25, 30],
        incomeStep: 50000, expenseStep: 20000,          // grid ridges + tick labels
        widthMm: 200, depthMm: 120, heightMm: 60,       // plot area; surface height at the cap
        baseMm: 2.4, liftMm: 1.0,                       // ledge thickness; plot sits 1 mm above it
        // Slicer layers: contour tops, base, lift and text depth land on layer boundaries
        // (first layer + k × layer). layerMm 0 turns snapping off.
        layerMm: 0.2, firstLayerMm: 0.2,
        // ledge widths; null = sized to fit the text on them
        marginLeft: null, marginRight: null, marginFront: null, marginBack: null,
        cellMm: 0.35,
        // Contour shape. Each sits on the uphill side of its line, so its downhill edge IS the
        // line: 'step'  — a cliff rising from the line to a level top (height above the line),
        //                 filled uphill until it meets the slope (up to contourFillMm), so the
        //                 top layer is one band. Reads by touch; good in one color.
        //       'shelf' — a level shelf cut into the slope at exactly the line's height
        //                 (width wide). Its floor takes an accent color as an even line.
        //       'none'  — no shape; a color change at the line's height marks it (year bands).
        contourShape: 'step',
        contourRidge: { width: 1.2, height: 1.0 },
        contourFillMm: 8,
        youRidge:     { width: 1.6, height: 1.4 },
        gridRidge:    { width: 0.8, height: 0.5 },
        labelGap: 0.8,                                  // clearance between a label and any ridge
        textMode: 'deboss', textDepthMm: 0.6,           // 'deboss' | 'emboss' | 'none'
        tickTextMm: 5, titleTextMm: 5.5, inlineTextMm: 4.5,
        // ledge text ('' hides an item; captionText '' = the auto caption with R, S and P0)
        incomeTitle: 'INCOME ($/YR)', expenseTitle: 'EXPENSES ($/YR)',
        caption: true, captionText: '', youLabel: 'YOU', tickLabels: true,
        captionDate: '',            // e.g. 'OCT 2026': the dollars are that month's (real) dollars
    };

    const TEXT_GAP = 1.5;      // mm between the plot edge, tick labels and titles

    // Nearest slicer layer boundary at or above the first layer (identity when snapping is off).
    function snapToLayer(v, p) {
        if (!(p.layerMm > 0)) return v;
        const f = p.firstLayerMm > 0 ? p.firstLayerMm : p.layerMm;
        return Math.round(Math.max(f, f + Math.round((v - f) / p.layerMm) * p.layerMm) * 1e6) / 1e6;
    }

    // Ledge widths: given, or just wide enough for the ledge text (16 / 8 mm at the defaults).
    function resolveMargins(p) {
        const ticks = p.tickLabels ? TEXT_GAP + p.tickTextMm : 0;
        const titleRow = (p.incomeTitle || p.caption) ? TEXT_GAP + p.titleTextMm : 0;
        const titleCol = p.expenseTitle ? TEXT_GAP + p.titleTextMm : 0;
        const edge = p.inlineTextMm + 3.5;              // room for a contour label at its exit
        return {
            marginFront: p.marginFront != null ? p.marginFront : Math.max(4, ticks + titleRow + 2.5),
            marginLeft:  p.marginLeft  != null ? p.marginLeft  : Math.max(4, ticks + titleCol + 2.5),
            marginBack:  p.marginBack  != null ? p.marginBack  : edge,
            marginRight: p.marginRight != null ? p.marginRight : edge,
        };
    }

    function ticks(lo, hi, step) {
        const out = [];
        for (let t = Math.ceil(lo / step) * step; t <= hi + step / 2; t += step) out.push(t);
        return out;
    }

    // $ amount as a short label: 0 → "0", 50000 → "50k", 1250000 → "1.25M".
    function kLabel(v) {
        if (v === 0) return '0';
        const fmt = x => String(Math.round(x * 100) / 100);
        return Math.abs(v) >= 1e6 ? fmt(v / 1e6) + 'M' : fmt(v / 1e3) + 'k';
    }

    // Fold an angle (degrees) into (−90, 90] so text never reads upside down.
    function readable(a) {
        a = ((a + 180) % 360 + 360) % 360 - 180;
        if (a > 90) a -= 180; else if (a <= -90) a += 180;
        return a;
    }

    // Heightmap of the solid, in mm, on a grid of `cellMm` cells (row-major, row = y).
    // x runs along income (left → right), y along expenses (front → back).
    function buildModel(params) {
        const p = Object.assign({}, DEFAULTS, params);
        Object.assign(p, resolveMargins(p));
        p.baseMm = snapToLayer(p.baseMm, p);
        p.liftMm = snapToLayer(p.baseMm + p.liftMm, p) - p.baseMm;
        if (p.layerMm > 0) p.textDepthMm = Math.round(Math.max(p.layerMm, Math.round(p.textDepthMm / p.layerMm) * p.layerMm) * 1e6) / 1e6;
        const cell = p.cellMm;
        const ml = p.marginLeft, mr = p.marginRight, mf = p.marginFront, mb = p.marginBack;
        const W = p.widthMm, D = p.depthMm;
        const [I0, I1] = p.incomeRange, [X0, X1] = p.expenseRange;
        const { R, S, P0 } = p, cap = p.capYears;

        const nx = Math.round((ml + W + mr) / cell) + 1;
        const ny = Math.round((mf + D + mb) / cell) + 1;
        const N = nx * ny;
        const toX = inc => ml + (inc - I0) / (I1 - I0) * W;
        const toY = exp => mf + (exp - X0) / (X1 - X0) * D;
        const eps = 1e-9;
        const inPlot = (x, y) => x >= ml - eps && x <= ml + W + eps && y >= mf - eps && y <= mf + D + eps;

        // Surface: years to FI, capped. "Never" becomes a plateau at the cap, not a hole.
        const z = new Float32Array(N);
        const plot = new Uint8Array(N);
        const zPerYear = p.heightMm / cap;
        const zCap = p.baseMm + p.liftMm + p.heightMm;    // the plateau: years at or beyond the cap
        const surfaceAt = (x, y) => p.baseMm + p.liftMm + zPerYear * Math.min(cap,
            yearsToFI(I0 + (x - ml) / W * (I1 - I0), X0 + (y - mf) / D * (X1 - X0), R, S, P0));
        for (let iy = 0; iy < ny; iy++) {
            const y = iy * cell, X = X0 + (y - mf) / D * (X1 - X0);
            for (let ix = 0; ix < nx; ix++) {
                const x = ix * cell, k = iy * nx + ix;
                if (inPlot(x, y)) {
                    const I = I0 + (x - ml) / W * (I1 - I0);
                    plot[k] = 1;
                    z[k] = p.baseMm + p.liftMm + Math.min(yearsToFI(I, X, R, S, P0), cap) * zPerYear;
                } else {
                    z[k] = p.baseMm;
                }
            }
        }

        // Raised lines, each a distance field in mm. Contours are straight rays out of the
        // focal point, so every ridge prints at the same width however steep the surface is.
        const lines = [];
        const fp = focalPoint(R, S, P0), fx = toX(fp.I), fy = toY(fp.X);
        for (const L of p.contourYears) {
            if (!(L > 0 && L <= cap)) continue;
            let ux = W / (I1 - I0), uy = contourSlope(L, R, S) * D / (X1 - X0);
            const len = Math.hypot(ux, uy); ux /= len; uy /= len;
            // a contour is level: its height, and a step's top, sit on layer boundaries
            const zLine = snapToLayer(p.baseMm + p.liftMm + L * zPerYear, p);
            const top = snapToLayer(zLine + p.contourRidge.height, p);
            lines.push(Object.assign({
                kind: 'contour', value: L, angle: Math.atan2(uy, ux) * 180 / Math.PI, ux, uy, fx, fy,
                shape: p.contourShape, zLine, top: () => top,
                // uphill is d < 0 (more expenses, more years); the cap contour borders the flat
                // plateau, which never climbs back to the step's top, so it is not filled
                fill: L < cap && p.contourShape === 'step' ? p.contourFillMm : 0,
                dist: (x, y) => {
                    const dx = x - fx, dy = y - fy;
                    return dx * ux + dy * uy > 0 ? dx * uy - dy * ux : Infinity;
                },
            }, p.contourRidge));
        }
        const youX = toX(p.youIncome), youY = toY(p.youExpenses);
        // Lines that climb the slope: the top follows the surface along the line, level across it.
        const along = (h, cx, cy) => (x, y) => surfaceAt(cx == null ? x : cx, cy == null ? y : cy) + h;
        lines.push(Object.assign({ kind: 'youIncome',   value: p.youIncome,   dist: x => x - youX,
                                   top: along(p.youRidge.height, youX, null) }, p.youRidge));
        lines.push(Object.assign({ kind: 'youExpenses', value: p.youExpenses, dist: (x, y) => y - youY,
                                   top: along(p.youRidge.height, null, youY) }, p.youRidge));
        const keep = 1.5;           // no grid ridge on the plot edge or hugging a "you" line
        for (const t of ticks(I0, I1, p.incomeStep)) {
            const tx = toX(t);
            if (tx > ml + keep && tx < ml + W - keep && Math.abs(tx - youX) > 2)
                lines.push(Object.assign({ kind: 'grid', value: t, dist: x => x - tx, top: along(p.gridRidge.height, tx, null) }, p.gridRidge));
        }
        for (const t of ticks(X0, X1, p.expenseStep)) {
            const ty = toY(t);
            if (ty > mf + keep && ty < mf + D - keep && Math.abs(ty - youY) > 2)
                lines.push(Object.assign({ kind: 'grid', value: t, dist: (x, y) => y - ty, top: along(p.gridRidge.height, null, ty) }, p.gridRidge));
        }

        // Ridges have sharp edges: a point within width/2 of a line is raised to the line's
        // top, with no in-between heights to slice into slivers. A contour's shape spans
        // −width ≤ d ≤ 0, uphill of its line. (The soft band below only keeps labels clear.)
        const band = (d, w) => Math.min(1, Math.max(0, (w / 2 - Math.abs(d)) / cell + 0.5));
        const surfaceOk = new Uint8Array(N);   // inline labels: inside the plot, clear of major ridges
        const onGrid = new Uint8Array(N);      // may cross the low grid ridges, at a cost
        const pad = 2 * p.labelGap;
        // For the mesh, contour shapes are kept apart from the rest of the surface so their edges
        // can be traced exactly (they are straight lines, at any angle to the grid):
        //   zOut      — the surface with the other raised lines, but no contour shapes
        //   bandField — 0.5 + distance (mm) inside the nearest contour shape: ½ exactly on its edges
        //   bandZ     — that shape's height there: a shelf's floor, or a step's top
        const zOut = new Float32Array(z), bandField = new Float32Array(N).fill(-50), bandZ = new Float32Array(z);
        for (let iy = 0; iy < ny; iy++) {
            const y = iy * cell;
            for (let ix = 0; ix < nx; ix++) {
                const k = iy * nx + ix;
                if (!plot[k]) continue;
                const x = ix * cell;
                let base = z[k], raised = -Infinity, blocked = false;   // surface after cuts; highest line top
                let other = -Infinity, sBest = -50, shapeZ = z[k];        // other lines' top; nearest shape
                for (const ln of lines) {
                    const d = ln.dist(x, y);
                    if (ln.kind === 'contour') {
                        const on = d <= 0 && d >= -ln.width;
                        if (ln.shape === 'step') {
                            const shelf = !on && ln.fill && d < 0 && d >= -ln.fill && z[k] < ln.top();
                            if (on || shelf) raised = Math.max(raised, ln.top());   // cliff + level top
                            if (shelf) blocked = true;
                        } else if (ln.shape === 'shelf' && on) {
                            base = ln.zLine;            // level floor at the line (a cut; at most half a layer of fill)
                        }
                        if (ln.shape === 'none' ? band(d, pad) > 0 : band(d + ln.width / 2, ln.width + pad) > 0) blocked = true;
                        // signed distance inside the shape (> 0 inside, = 0 on its edges)
                        let sIn = -Infinity;
                        if (isFinite(d) && ln.shape === 'shelf') sIn = Math.min(-d, d + ln.width);
                        else if (isFinite(d) && ln.shape === 'step' && ln.top() < zCap) {
                            // raised where the surface is below the top, out to the width or the fill
                            const reach = ln.fill ? Math.max(ln.width, ln.fill) : ln.width;
                            sIn = Math.min(-d, d + reach, ln.top() - z[k]);
                        }
                        if (sIn > sBest) { sBest = Math.max(-50, Math.min(50, sIn)); shapeZ = ln.shape === 'shelf' ? ln.zLine : ln.top(); }
                    } else {
                        if (Math.abs(d) <= ln.width / 2) { raised = Math.max(raised, ln.top(x, y)); other = Math.max(other, ln.top(x, y)); }
                        if (band(d, ln.width + pad) > 0) {
                            if (ln.kind === 'grid') onGrid[k] = 1; else blocked = true;
                        }
                    }
                }
                // nothing rises above the plateau: it stays flat, and lines that run into it
                // level off into it (your lines and the grid mean nothing past the cap)
                zOut[k] = Math.max(z[k], Math.min(other, zCap));
                bandField[k] = 0.5 + sBest;
                bandZ[k] = Math.min(zCap, Math.max(shapeZ, other));
                z[k] = Math.max(base, Math.min(raised, zCap));
                surfaceOk[k] = !blocked && x > ml + keep && x < ml + W - keep && y > mf + keep && y < mf + D - keep ? 1 : 0;
            }
        }

        return { p, nx, ny, cell, z, zOut, bandField, bandZ, plot, lines, surfaceOk, onGrid, toX, toY, zCap,
                 widthMm: (nx - 1) * cell, depthMm: (ny - 1) * cell };
    }

    // ── Labels ──────────────────────────────────────────────────
    // "OCT 2026 · $250k SAVED · 5% RETURN · 4% SWR": every amount is in that month's dollars
    function autoCaption(p) {
        const pct = v => String(Math.round(v * 1000) / 10) + '%';
        return [p.captionDate, '$' + kLabel(p.P0) + ' SAVED', pct(p.R) + ' RETURN', pct(p.S) + ' SWR']
            .filter(Boolean).join(' · ');
    }

    // Decide where every label goes. `measure(text, sizeMm)` returns the text's width
    // in mm. Returns { labels: [{text, size, x, y, angle}], skipped: [text] }; x, y is
    // the label's center (mm) and angle is counter-clockwise in degrees, seen from above.
    function layoutLabels(model, measure) {
        const { p, nx, ny, cell, z } = model;
        const ml = p.marginLeft, mf = p.marginFront, mr = p.marginRight, mb = p.marginBack;
        const W = p.widthMm, D = p.depthMm;
        const [I0, I1] = p.incomeRange, [X0, X1] = p.expenseRange;
        const ts = p.tickTextMm, tt = p.titleTextMm, size = p.inlineTextMm, gap = TEXT_GAP;
        const totalW = model.widthMm, totalD = model.depthMm;
        const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
        const labels = [], skipped = [];
        const taken = new Uint8Array(nx * ny);

        // Grid cells under the text's rotated box, or null if it leaves the model.
        function footprint(text, sz, x, y, angle) {
            const half = measure(text, sz) / 2, a = angle * Math.PI / 180;
            const c = Math.cos(a), s = Math.sin(a), out = [];
            for (let v = -sz * 0.4; v <= sz * 0.4 + 1e-9; v += cell) {
                for (let u = -half; u <= half + 1e-9; u += cell) {
                    const ix = Math.round((x + u * c - v * s) / cell);
                    const iy = Math.round((y + u * s + v * c) / cell);
                    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return null;
                    out.push(iy * nx + ix);
                }
            }
            return out;
        }
        function put(text, sz, x, y, angle) {
            labels.push({ text, size: sz, x, y, angle });
            const fp = footprint(text, sz, x, y, angle);
            if (!fp) return;
            const padCells = Math.ceil(1.0 / cell);         // keep 1 mm between labels
            for (const k of fp) {
                const ix = k % nx, iy = (k - ix) / nx;
                for (let d = -padCells; d <= padCells; d++) {
                    taken[clamp(iy + d, 0, ny - 1) * nx + ix] = 1;
                    taken[iy * nx + clamp(ix + d, 0, nx - 1)] = 1;
                }
            }
        }
        // Place at the cheapest candidate [x, y, angle] whose box is all allowed and free.
        function putBest(text, sz, cands, allowed, cost) {
            let best = null;
            for (const [x, y, angle] of cands) {
                const fp = footprint(text, sz, x, y, angle);
                if (!fp || fp.some(k => !allowed(k) || taken[k])) continue;
                const c = cost(fp, x, y);
                if (!best || c < best.c) best = { c, x, y, angle };
            }
            if (best) put(text, sz, best.x, best.y, best.angle);
            return !!best;
        }
        const anywhere = () => true;

        // Front and left ledges: tick labels centered on their tick if they fit on the
        // model, else slid inward (one that would still overlap a neighbor is dropped).
        for (const t of p.tickLabels ? ticks(I0, I1, p.incomeStep) : []) {
            const w = measure(kLabel(t), ts), tx = p.marginLeft + (t - I0) / (I1 - I0) * W, ty = mf - gap - ts / 2;
            putBest(kLabel(t), ts, [[clamp(tx, 1 + w / 2, totalW - 1 - w / 2), ty, 0], [clamp(tx, ml + w / 2, ml + W - w / 2), ty, 0]],
                    anywhere, (fp, x) => Math.abs(x - tx));
        }
        for (const t of p.tickLabels ? ticks(X0, X1, p.expenseStep) : []) {
            const w = measure(kLabel(t), ts), tx = ml - gap - ts / 2, ty = mf + (t - X0) / (X1 - X0) * D;
            putBest(kLabel(t), ts, [[tx, clamp(ty, 1 + w / 2, totalD - 1 - w / 2), 90], [tx, clamp(ty, mf + w / 2, mf + D - w / 2), 90]],
                    anywhere, (fp, x, y) => Math.abs(y - ty));
        }
        const tickRoom = p.tickLabels ? gap + ts : 0;
        const titleY = mf - tickRoom - gap - tt / 2, titleW = p.incomeTitle ? measure(p.incomeTitle, tt) : 0;
        if (p.incomeTitle) put(p.incomeTitle, tt, ml + titleW / 2, titleY, 0);
        if (p.expenseTitle) put(p.expenseTitle, tt, ml - tickRoom - gap - tt / 2, mf + D / 2, 90);
        // Caption: beside the title, shrinking to fit down to 3/4 of the tick-label size; if it
        // still doesn't fit, on the back ledge (placed after the contour labels, below)
        let backCaption = null;
        if (p.caption) {
            const cap = p.captionText || autoCaption(p);
            const sz = Math.min(tt * 0.8, (W - titleW - 6) / measure(cap, 1));
            if (sz >= ts * 0.75) put(cap, sz, ml + W - measure(cap, sz) / 2, titleY, 0);
            else backCaption = cap;
        }

        // Raised lines: inline beside the line on its flattest free stretch (contours: always on
        // the uphill side). A contour with no room there is labeled on the back/right ledge
        // where it leaves the plot.
        const slopeAt = k => {
            const ix = k % nx, iy = (k - ix) / nx;
            const xa = Math.max(ix - 1, 0), xb = Math.min(ix + 1, nx - 1);
            const ya = Math.max(iy - 1, 0), yb = Math.min(iy + 1, ny - 1);
            return Math.hypot((z[iy * nx + xb] - z[iy * nx + xa]) / ((xb - xa) * cell),
                              (z[yb * nx + ix] - z[ya * nx + ix]) / ((yb - ya) * cell));
        };
        const costInline = fp => {
            let worst = 0, grid = 0;
            for (const k of fp) { worst = Math.max(worst, slopeAt(k)); grid += model.onGrid[k]; }
            return worst + 2 * grid / fp.length;
        };
        const onSurface = k => model.surfaceOk[k] === 1;
        const onLedge = k => {                                 // clear of the step up and the outer edge
            const ix = k % nx, iy = (k - ix) / nx, x = ix * cell, y = iy * cell;
            const outside = Math.max(ml - x, x - ml - W, mf - y, y - mf - D);
            return outside > 0.8 && x > 0.8 && x < totalW - 0.8 && y > 0.8 && y < totalD - 0.8;
        };
        // `side` (optional unit vector): only place the label on that side of the line
        function inline(text, pts, angle, width, side) {
            const off = width / 2 + p.labelGap + size * 0.4 + 1.5 * cell;   // just clear of its own line
            const a = angle * Math.PI / 180, nX = -Math.sin(a), nY = Math.cos(a);
            const sides = side ? [nX * side[0] + nY * side[1] > 0 ? 1 : -1] : [1, -1];
            const cands = [];
            for (const [x, y] of pts) for (const s of sides) cands.push([x + s * off * nX, y + s * off * nY, angle]);
            return putBest(text, size, cands, onSurface, costInline);
        }
        const youName = v => (p.youLabel ? p.youLabel + ' ' : '') + kLabel(v);
        const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));

        const order = { youIncome: 0, youExpenses: 1, contour: 2 };
        const labeled = model.lines.filter(l => l.kind in order).sort((a, b) => order[a.kind] - order[b.kind]);
        for (const ln of labeled) {
            let ok, name;
            if (ln.kind === 'youIncome') {
                const xs = model.toX(ln.value);
                name = youName(ln.value);
                ok = inline(name, linspace(mf, mf + D, 40).map(y => [xs, y]), 90, ln.width);
            } else if (ln.kind === 'youExpenses') {
                const ys = model.toY(ln.value);
                name = youName(ln.value);
                ok = inline(name, linspace(ml, ml + W, 40).map(x => [x, ys]), 0, ln.width);
            } else {
                // the stretch of the ray inside the plot (Liang–Barsky clip)
                let t0 = 0, t1 = Infinity;
                for (const [d, lo, hi] of [[ln.ux, ml - ln.fx, ml + W - ln.fx], [ln.uy, mf - ln.fy, mf + D - ln.fy]]) {
                    if (Math.abs(d) < 1e-12) { if (lo > 0 || hi < 0) t1 = -1; continue; }
                    const a = lo / d, b = hi / d;
                    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
                }
                if (!(t1 > t0)) continue;                      // contour lies outside the window
                const plus = ln.value >= p.capYears ? '+' : '';
                name = `${ln.value}${plus} YRS`;
                const pts = linspace(t0, t1, 60).map(t => [ln.fx + t * ln.ux, ln.fy + t * ln.uy]);
                // labels keep clear of the shape, which sits uphill of the line (toward −uy, ux)
                const w = ln.shape === 'none' ? 0 : ln.width;
                const mid = pts.map(([x, y]) => [x - w / 2 * ln.uy, y + w / 2 * ln.ux]);
                // always uphill, inside the band of years that starts at this line, so with year
                // bands every band carries exactly one label (its own starting year)
                ok = inline(name, mid, readable(ln.angle), w, [-ln.uy, ln.ux]);
                if (!ok) {
                    const [ex, ey] = pts[pts.length - 1];       // where it leaves the plot
                    const shifts = linspace(-6, 6, 25);
                    const cands = (mf + D - ey) < (ml + W - ex)
                        ? shifts.map(s => [ex + s, mf + D + mb / 2, 0])
                        : shifts.map(s => [ml + W + mr / 2, ey + s, 90]);
                    ok = putBest(`${ln.value}${plus}y`, size, cands, onLedge, (fp, x, y) => Math.abs(x - ex) + Math.abs(y - ey));
                }
            }
            if (!ok) skipped.push(name);
        }
        if (backCaption) {                                     // the back ledge's free stretch nearest center
            const sz = Math.min(tt * 0.8, mb - 2, (W - 4) / measure(backCaption, 1)), w = measure(backCaption, sz);
            const cands = [];
            for (let x = ml + w / 2; x <= ml + W - w / 2 + 1e-9; x += 1) cands.push([x, mf + D + mb / 2, 0]);
            if (!(sz >= ts * 0.75 && putBest(backCaption, sz, cands, onLedge, (fp, x) => Math.abs(x - ml - W / 2))))
                skipped.push(backCaption);
        }
        return { labels, skipped };
    }

    // Text coverage per grid CELL (0..1, (nx−1)·(ny−1), row-major) → the field at each grid
    // point that the mesh traces letters from: the mean of the four cells around the point.
    // That is the text blurred by a 2-cell box, which ramps linearly across both grid
    // points beside a straight edge and crosses ½ exactly on it (for strokes at least a
    // cell wide), so the traced outline lands on the true edge. Points on the outer edge
    // are never text, so the model's sides stay plain.
    function textField(cellCoverage, nx, ny) {
        const cx = nx - 1, cy = ny - 1, f = new Float32Array(nx * ny);
        for (let iy = 1; iy < ny - 1; iy++) {
            for (let ix = 1; ix < nx - 1; ix++) {
                const c = (iy - 1) * cx + ix - 1;
                f[iy * nx + ix] = (cellCoverage[c] + cellCoverage[c + 1] + cellCoverage[c + cx] + cellCoverage[c + cx + 1]) / 4;
            }
        }
        return f;
    }

    // ── Mesh + STL ──────────────────────────────────────────────
    // Closed, outward-facing mesh of the solid under the heightmap: two triangles per grid cell
    // on top, a wall under every boundary edge, and one fan for the flat bottom.
    //
    // Two kinds of feature get their own layer with VERTICAL walls and outlines traced inside
    // the cells (marching squares: an edge crosses where the feature's field crosses ½, by linear
    // interpolation), so they follow their true shape instead of stair-stepping along the grid:
    //   text = { field, offset } — letters (field ≥ ½) moved by offset mm (− deboss, + emboss)
    //   band = { field, z }      — contour shelves/steps (field ≥ ½) at heights z
    // Every printed layer of a letter or a contour edge then sits exactly on the one below.
    function buildMesh(z, nx, ny, cell, text, band) {
        const N = nx * ny, cx = nx - 1, cy = ny - 1, ISO = 0.5;
        const TF = text && text.offset ? text.field : null, BF = band ? band.field : null;

        // class of each grid point: 0 surface, 1 letter, 2 contour shape
        const cls = new Uint8Array(N);
        if (TF) for (let k = 0; k < N; k++) if (TF[k] >= ISO) cls[k] = 1;
        if (BF) for (let k = 0; k < N; k++) if (!cls[k] && BF[k] >= ISO) cls[k] = 2;
        if (TF && BF) {                                   // a cell never mixes letters and a shape
            for (let iy = 0; iy < cy; iy++) for (let ix = 0; ix < cx; ix++) {
                const c = [iy * nx + ix, iy * nx + ix + 1, (iy + 1) * nx + ix, (iy + 1) * nx + ix + 1];
                if (c.some(k => cls[k] === 1) && c.some(k => cls[k] === 2)) for (const k of c) if (cls[k] === 2) cls[k] = 0;
            }
        }
        const fieldOf = (c, k) => c === 1 ? TF[k] : BF[k];
        const lowZ = (c, k) => c === 1 ? z[k] + text.offset : band.z[k];

        // pass 1: count and index the extra vertices
        const sh = new Int32Array(N).fill(-1);            // the feature-layer copy of each feature point
        const hIso = new Int32Array(cx * ny).fill(-1);    // outline crossing on edge (ix,iy)-(ix+1,iy)
        const vIso = new Int32Array(nx * cy).fill(-1);    // outline crossing on edge (ix,iy)-(ix,iy+1)
        let next = N, mixed = 0;
        for (let k = 0; k < N; k++) if (cls[k]) sh[k] = next++;
        for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < cx; ix++) {
            const k = iy * nx + ix;
            if (cls[k] !== cls[k + 1]) { hIso[iy * cx + ix] = next; next += 2; }   // surface, then feature
        }
        for (let iy = 0; iy < cy; iy++) for (let ix = 0; ix < nx; ix++) {
            const k = iy * nx + ix;
            if (cls[k] !== cls[k + nx]) { vIso[iy * nx + ix] = next; next += 2; }
        }
        for (let iy = 0; iy < cy; iy++) for (let ix = 0; ix < cx; ix++) {
            const k = iy * nx + ix, n = (cls[k] > 0) + (cls[k + 1] > 0) + (cls[k + nx] > 0) + (cls[k + nx + 1] > 0);
            if (n > 0 && n < 4) mixed++;
        }

        const loop = [];                                       // boundary, counter-clockwise from above
        for (let ix = 0; ix < nx - 1; ix++) loop.push(ix);                         // front
        for (let iy = 0; iy < ny - 1; iy++) loop.push(iy * nx + nx - 1);          // right
        for (let ix = nx - 1; ix > 0; ix--) loop.push((ny - 1) * nx + ix);         // back
        for (let iy = ny - 1; iy > 0; iy--) loop.push(iy * nx);                    // left
        const nb = loop.length, base0 = next, center = base0 + nb;

        const positions = new Float32Array((center + 1) * 3);
        const isLetter = new Uint8Array(center + 1);         // for previews: letter-layer vertices
        const setV = (i, x, y, zz) => { positions[3 * i] = x; positions[3 * i + 1] = y; positions[3 * i + 2] = zz; };
        for (let iy = 0, k = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++, k++) {
                setV(k, ix * cell, iy * cell, z[k]);
                if (sh[k] >= 0) { setV(sh[k], ix * cell, iy * cell, lowZ(cls[k], k)); isLetter[sh[k]] = cls[k] === 1; }
            }
        }
        // where the outline crosses the edge a→b (kept a little off the corners)
        const setIso = (i, a, b, xa, ya, xb, yb) => {
            const c = cls[a] || cls[b], Fa = fieldOf(c, a), Fb = fieldOf(c, b);
            const t = Math.min(0.95, Math.max(0.05, (ISO - Fa) / (Fb - Fa)));
            const x = xa + t * (xb - xa), y = ya + t * (yb - ya);
            setV(i, x, y, z[a] + t * (z[b] - z[a]));
            setV(i + 1, x, y, lowZ(c, a) + t * (lowZ(c, b) - lowZ(c, a)));
            isLetter[i + 1] = c === 1;
        };
        for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < cx; ix++) {
            const i = hIso[iy * cx + ix];
            if (i >= 0) setIso(i, iy * nx + ix, iy * nx + ix + 1, ix * cell, iy * cell, (ix + 1) * cell, iy * cell);
        }
        for (let iy = 0; iy < cy; iy++) for (let ix = 0; ix < nx; ix++) {
            const i = vIso[iy * nx + ix];
            if (i >= 0) setIso(i, iy * nx + ix, (iy + 1) * nx + ix, ix * cell, iy * cell, ix * cell, (iy + 1) * cell);
        }
        loop.forEach((v, i) => {                               // base copy of each boundary vertex, z = 0
            positions[3 * (base0 + i)] = positions[3 * v]; positions[3 * (base0 + i) + 1] = positions[3 * v + 1];
        });
        positions[3 * center] = (nx - 1) * cell / 2; positions[3 * center + 1] = (ny - 1) * cell / 2;

        // a cut cell needs at most 10 triangles (hexagon + 2 corners + 2 walls)
        const indices = new Uint32Array(3 * (2 * cx * cy + 8 * mixed + 3 * nb));
        let t = 0;
        const tri = (a, b, c) => { indices[t++] = a; indices[t++] = b; indices[t++] = c; };
        const fan = poly => { for (let i = 1; i + 1 < poly.length; i++) tri(poly[0], poly[i], poly[i + 1]); };

        for (let iy = 0; iy < cy; iy++) {
            for (let ix = 0; ix < cx; ix++) {
                const k0 = iy * nx + ix, k1 = k0 + 1, k2 = k0 + nx + 1, k3 = k0 + nx;
                const c = [k0, k1, k2, k3], cc = c.map(k => cls[k]);
                const feat = cc[0] || cc[1] || cc[2] || cc[3];   // this cell's feature class, if any
                const ins = cc.map(v => v > 0), nIn = ins[0] + ins[1] + ins[2] + ins[3];
                if (nIn === 0) { tri(k0, k1, k2); tri(k0, k2, k3); continue; }
                if (nIn === 4) { tri(sh[k0], sh[k1], sh[k2]); tri(sh[k0], sh[k2], sh[k3]); continue; }

                // walk the cell's outline counter-clockwise: corners, and crossings between them
                const iso = [hIso[iy * cx + ix], vIso[iy * nx + ix + 1], hIso[(iy + 1) * cx + ix], vIso[iy * nx + ix]];
                const ring = [];                               // {iso, inside, top, low}
                for (let e = 0; e < 4; e++) {
                    ring.push({ iso: false, inside: ins[e], top: c[e], low: sh[c[e]] });
                    if (ins[e] !== ins[(e + 1) % 4]) ring.push({ iso: true, top: iso[e], low: iso[e] + 1 });
                }
                // Saddle (two opposite corners inside): the side holding the cell center joins up.
                const saddle = ring.length === 8;
                const joined = saddle && c.reduce((a, k) => a + fieldOf(feat, k), 0) / 4 >= ISO;
                const pieces = [];                             // [items, inside]
                for (const side of [true, false]) {
                    if (!saddle || joined === side) {
                        pieces.push([ring.filter(it => it.iso || it.inside === side), side]);
                    } else {                                   // two separate corner triangles
                        ring.forEach((it, j) => {
                            if (!it.iso && it.inside === side)
                                pieces.push([[ring[(j + 7) % 8], it, ring[(j + 1) % 8]], side]);
                        });
                    }
                }
                for (const [items, inside] of pieces) {
                    fan(items.map(it => inside ? it.low : it.top));
                    if (!inside) continue;
                    // each crossing→crossing edge of a feature piece is a chord through the cell:
                    // a vertical wall joins it to the matching edge of the surface piece
                    for (let i = 0; i < items.length; i++) {
                        const X = items[i], Y = items[(i + 1) % items.length];
                        if (X.iso && Y.iso) { tri(Y.low, X.low, X.top); tri(Y.low, X.top, Y.top); }
                    }
                }
            }
        }
        for (let i = 0; i < nb; i++) {
            const j = (i + 1) % nb;
            const at = loop[i], bt = loop[j], ab = base0 + i, bb = base0 + j;
            tri(ab, bb, bt); tri(ab, bt, at);                  // wall, facing out
            tri(center, bb, ab);                               // bottom, facing down
        }
        return { positions, indices: indices.subarray(0, t), topVertices: N, textEnd: base0, isLetter };
    }

    // ── Filament color changes ──────────────────────────────────
    // On a single-extruder printer a color change applies to a whole layer, so color can
    // only change with height. Here height IS years to FI, so a change at a contour's
    // height colors exactly along that iso-year line.

    // Top of the printed layer that contains height h (layers: first, first + layer, …).
    function layerTop(h, p) {
        const f = p.firstLayerMm > 0 ? p.firstLayerMm : p.layerMm;
        if (h <= f) return f;
        return Math.round((f + Math.ceil((h - f) / p.layerMm - 1e-6) * p.layerMm) * 1e6) / 1e6;
    }

    // Where to swap filament. opts = { contours: 'none' | 'lines' | 'bands', baseLabels: bool }.
    //   lines      — accent on one layer per contour: a step's top, or the line's own height
    //                (the floor of a cut shelf: an even line whose downhill edge is the line)
    //   bands      — alternate colors between contours, changing at each line's exact height
    //   baseLabels — accent for the debossed letters on the ledges (their floors), or the
    //                raised part of embossed letters
    // Returns { start: 'body' | 'accent', changes: [{ z, to, why }] }, where z is the top of
    // the first layer printed in the new color (PrusaSlicer: the layer-slider value where
    // you add the color change). Null when layer snapping is off.
    function colorPlan(model, opts) {
        const p = model.p;
        if (!(p.layerMm > 0)) return null;
        const L = p.layerMm, events = [];               // [z, color, why]
        let start = 'body';
        const contours = model.lines.filter(l => l.kind === 'contour').sort((a, b) => a.value - b.value);
        if (opts.baseLabels && p.textMode !== 'none') {
            if (p.textMode === 'deboss') {
                start = 'accent';
                events.push([layerTop(p.baseMm - p.textDepthMm, p) + L, 'body', 'above the letter floors']);
            } else {
                events.push([layerTop(p.baseMm, p) + L, 'accent', 'raised letters']);
                events.push([layerTop(p.baseMm + p.textDepthMm, p) + L, 'body', 'above the letters']);
            }
        }
        if (opts.contours === 'lines') {
            // the layer that shows as the line: a step's top, or the line's own height
            for (const ln of contours) {
                const z = layerTop(ln.shape === 'step' ? Math.min(ln.top(), model.zCap) : ln.zLine, p);
                events.push([z, 'accent', `${ln.value}-year line`]);
                events.push([z + L, 'body', '']);
            }
        } else if (opts.contours === 'bands') {
            // change at the line's height: exactly the iso-year line (a step's cliff starts there)
            let accent = false;
            for (const ln of contours) {
                accent = !accent;
                // (the cap contour's band is the flat plateau: it starts on the plateau's own top layer)
                const z = layerTop(ln.zLine, p) + (ln.value >= p.capYears ? 0 : L);
                events.push([z, accent ? 'accent' : 'body', ln.value >= p.capYears ? `${ln.value}+ years (plateau)` : `above ${ln.value} years`]);
            }
        }
        events.sort((a, b) => a[0] - b[0]);
        const changes = [];
        let color = start;
        for (const [z, to, why] of events) {
            const zz = Math.round(z * 1e6) / 1e6;
            const last = changes[changes.length - 1];
            if (last && Math.abs(last.z - zz) < 1e-9) {          // two swaps on one layer: keep the later
                last.to = to; last.why = [last.why, why].filter(Boolean).join(', ');
            } else {
                if (to === color) continue;
                changes.push({ z: zz, to, why });
            }
            color = to;
        }
        // no swaps above the model's last layer (nothing left to print in the new color)
        let zMax = 0;
        for (const v of model.z) zMax = Math.max(zMax, v);
        if (p.textMode === 'emboss') zMax += p.textDepthMm;
        const last = layerTop(zMax - 1e-4, p);              // (z is float32)
        const kept = changes.filter((c, i) => c.to !== (i ? changes[i - 1].to : start));
        return { start, changes: kept.filter(c => c.z <= last + 1e-9) };
    }

    // Every edge shared by exactly two triangles in opposite directions, and the
    // enclosed volume (mm³, positive when the normals face out).
    function checkClosed(mesh) {
        const { positions: P, indices: T } = mesh;
        const V = P.length / 3, directed = new Set();
        let manifold = true, volume = 0;
        for (let t = 0; t < T.length; t += 3) {
            for (let e = 0; e < 3; e++) {
                const key = T[t + e] * V + T[t + (e + 1) % 3];
                if (directed.has(key)) manifold = false;
                directed.add(key);
            }
            const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
            volume += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
                     - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
                     + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
        }
        if (manifold) {
            for (const key of directed) {
                const a = Math.floor(key / V), b = key - a * V;
                if (!directed.has(b * V + a)) { manifold = false; break; }
            }
        }
        return { manifold, volume };
    }

    // Binary STL: 80-byte header, triangle count, then 50 bytes per triangle.
    function toBinarySTL(mesh, name) {
        const { positions: P, indices: T } = mesh;
        const n = T.length / 3;
        const buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
        const header = (name || 'Money Plot Labs FI surface').slice(0, 80);
        for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
        dv.setUint32(80, n, true);
        let o = 84;
        for (let t = 0; t < T.length; t += 3) {
            const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            dv.setFloat32(o, nx / len, true); dv.setFloat32(o + 4, ny / len, true); dv.setFloat32(o + 8, nz / len, true);
            o += 12;
            for (const v of [a, b, c]) {
                dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true);
                o += 12;
            }
            o += 2;                                            // attribute byte count = 0
        }
        return buf;
    }

    const FISurface = {
        DEFAULTS, yearsToFI, gradient, focalPoint, contourSlope, sensitivities, balancePath,
        ticks, kLabel, readable, snapToLayer, resolveMargins, buildModel, layoutLabels, textField, colorPlan, layerTop,
        buildMesh, checkClosed, toBinarySTL,
    };

    global.FISurface = FISurface;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FISurface;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
