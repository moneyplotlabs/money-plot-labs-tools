# Test suite

Unit tests for the pure simulation core (`engine.js`) and shared utilities
(`common.js`). The DOM/Chart wiring in the page scripts is intentionally **not**
unit-tested here — that layer is thin and best covered by manual/E2E checks.

## Running

No dependencies to install — these use Node's built-in test runner
(`node:test`, stable since Node 20).

```bash
npm test              # run once
npm run test:watch    # re-run on change
npm run test:coverage # run with line/branch/function coverage
```

## What's covered

- **`common.test.js`** — `formatCurrency`, `newId`, `percentile`
  (interpolation, edge cases), and the axis-snapping helpers (tier boundaries,
  monotonicity).
- **`engine.test.js`** — organized by tool:
  - `macroTimeline` (Whitepaper 001): the solver's defining property
    (terminal balance lands on the floor), the linear `r = 0` baseline,
    monotonicity in savings and growth, windfall/Social-Security effects, and
    the already-funded / unreachable / degenerate edge cases.
  - `simulateLife`: purity, exact `r = 0` accumulation and decumulation
    arithmetic, peak tracking.
  - `simulateNWPath` (Whitepaper 003): zero-growth ⇒ zero growth-by-year,
    net-worth-target crossing interpolation, terminal-node length.
  - **σ → 0 limit**: a 1,000-run zero-volatility Monte Carlo collapses to a
    single deterministic path — the convergence-to-determinism result.
  - `getReturnSeries` / `getCohortOffsets` / `buildCohortRuns`: series length,
    bootstrap-from-pool, verbatim cohort windows, window counts, and the
    seeded recovery of the target mean/standard deviation at scale.

## Determinism

Anything touching `Math.random` (Monte Carlo, bootstrap, Box–Muller) is wrapped
in `withSeededRandom(seed, fn)` from `helpers.js`, so the stochastic tests are
fully reproducible and never flaky.

## Migrating to Vitest (optional)

The `describe` / `test` structure is Vitest-compatible. To switch, run
`npm i -D vitest`, change the imports to `import { describe, test, expect } from 'vitest'`
(or keep `node:assert`), and set `"test": "vitest"`.
