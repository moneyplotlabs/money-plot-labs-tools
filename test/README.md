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
  - **Recurring expenses**: `expenseRates` window bounds (start inclusive, end
    exclusive, negative amounts), retirement-anchored rows prorated in the
    transition year, zero cost when retirement lands after the window, final
    balance monotone in retirement age (the planner's bisection relies on it),
    per-run retirement anchoring and delayed crossings in net-worth mode, bars
    matching `simulateLife`, and the `accReachesTarget` cohort filter.
  - **σ → 0 limit**: a 1,000-run zero-volatility Monte Carlo collapses to a
    single deterministic path — the convergence-to-determinism result.
  - **Balances capped at $0**: a funded plan spends exactly the plan and never
    runs out; an unfunded plan stops at $0 (no debt), records the age it ran out,
    earns nothing once empty, and spends only Social Security after that.
  - **Retirement spending strategies**: `annuityDue` exhausts the balance;
    `fixed` is the untouched default; amortization is level (and spreads future
    Social Security) when returns match the assumption; constant % spends
    rate × balance + passive income; guardrails cut after losses and raise after
    gains; flexible strategies never run out; the transition year blends in.
    (`optimal` is covered in `qol-engine.test.js`.)
  - `getReturnSeries` / `getCohortOffsets` / `buildCohortRuns`: series length,
    bootstrap-from-pool, verbatim cohort windows, window counts, and the
    seeded recovery of the target mean/standard deviation at scale.

- **`qol-engine.test.js`** — quality-of-life scoring: the target utility (0 at the
  plan, a λ-times steeper slope just below it, concave, invertible, capped upside,
  age/working-dependent targets, 100% of plan when always on target), the tapered
  leftover-money value and its anchoring effect on the optimal policy, the CDC 2023
  mortality tables (life expectancy at 65, monotone hazards, survival curves), age
  schedules, CRRA utility (concavity, `u`/`inv` round-trips including below the
  floor, smooth linear continuation), user-scored happiness curves (validation,
  log-linear interpolation, inverse), `gammaFromGamble` against closed-form
  answers, and `lifetimeUtility` / `evaluatePaths` properties — constant
  spending's CE equals itself, smoothing beats lumpiness, mortality favors earlier
  spending, risk pulls CE to the harmonic mean at γ = 2, and bequest
  probabilities sum to one. Return models (Gauss–Hermite moments) and
  `solveSpendingPolicy` against theory: the riskless level annuity, the Euler
  tilt (β(1+r))^(1/γ), mortality front-loading, a constant spending share under
  risk (Merton), no borrowing against future income, and beating every
  heuristic strategy on the same seeded Monte Carlo.

## Determinism

Anything touching `Math.random` (Monte Carlo, bootstrap, Box–Muller) is wrapped
in `withSeededRandom(seed, fn)` from `helpers.js`, so the stochastic tests are
fully reproducible and never flaky.

## Migrating to Vitest (optional)

The `describe` / `test` structure is Vitest-compatible. To switch, run
`npm i -D vitest`, change the imports to `import { describe, test, expect } from 'vitest'`
(or keep `node:assert`), and set `"test": "vitest"`.
