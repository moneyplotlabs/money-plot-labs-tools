# Money Plot Labs - Tools

> The pure math of financial freedom: interactive tools that model the full
> accumulation → decumulation lifecycle — from a deterministic closed-form baseline
> to Monte Carlo stress testing against 97 years of historical returns — plus a
> focused optimizer for fee-aware HSA cash transfers.

**Live site:** _https://moneyplotlabs.com_

A zero-backend, client-side web app. Every calculation runs in the browser; nothing
is sent to a server. The math behind each tool is derived from scratch in the
[technical whitepapers](#-the-math) included in this repo.

---

## What it is

Standard retirement advice leans on rules of thumb ("the 4% rule," "save 15% of
income"). This project replaces the heuristics with explicit math. It answers a
single question — **how many years do I need to work?** — at three increasing levels
of rigor, so you can see how the answer changes as you add realism (variable cash
flows, then market volatility).

Figures in the retirement tools are modeled in **real (inflation-adjusted) terms**, so
a flat retirement spending line represents constant purchasing power rather than
nominal dollars.

Alongside that retirement trilogy, the suite includes a fourth, standalone tool — the
**HSA Transfer Optimizer** — which tackles a different practical question: when moving
cash into investments costs a flat fee, what transfer schedule maximizes growth?

## The tools

| # | Tool | File | Model | What it answers |
|---|------|------|-------|-----------------|
| 1 | **Macro Sandbox** | [`index.html`](index.html) · [`index.js`](index.js) | Deterministic, closed-form | Given a fixed real growth rate, savings, and spending, how many working years until you can retire and hold a legacy floor? |
| 2 | **Cash Flow Planner** | [`LifepathCashFlowSimulator.html`](LifepathCashFlowSimulator.html) · [`lifepath.js`](lifepath.js) | Deterministic, year-by-year | Same question, but with milestone-based income/savings/spending that change across life stages, plus Social Security and windfall events, and recurring expenses that can start or end at retirement (e.g. pre-Medicare health insurance from retirement until 65). |
| 3 | **Stress Tester** | [`StressTester.html`](StressTester.html) · [`stresstester.js`](stresstester.js) | Stochastic, Monte Carlo | How robust is a plan to market volatility? Generates percentile fans from historical-return bootstrap and chronological cohort windows. |
| 4 | **HSA Transfer Optimizer** | [`HSATransfer.html`](HSATransfer.html) · [`hsa.js`](hsa.js) · [`hsa-engine.js`](hsa-engine.js) | Deterministic optimization (dynamic program) | When each cash→investment transfer costs a flat fee, how many transfers — and on what schedule, at what idle-cash threshold — maximize final value? |
| 6 | **Spending Strategy Lab** (beta) | [`StrategyLab.html`](StrategyLab.html) · [`strategylab.js`](strategylab.js) · [`qol-engine.js`](qol-engine.js) | Stochastic, Monte Carlo + dynamic program | Given the same simulated markets, which way of setting retirement spending buys the best life? Runs fixed, constant %, amortization (VPW), guardrails and the utility-**optimal** policy side by side, and scores each by **quality of life** — happiness against your plan's own spending (shortfalls hurt more than surpluses help), weighted by survival odds, reported as the steady yearly spend that would feel as good. |
| 7 | **FI Surface** | [`FISurface.html`](FISurface.html) · [`fisurface.js`](fisurface.js) · [`fisurface-engine.js`](fisurface-engine.js) | Deterministic, closed-form surface | How many years to FI across every income and spending level, and what is each lever worth? Shows years to FI as a surface over income × expenses (a 3D view, a hover map, and a timeline of your portfolio by age crossing the FI number, with live income/expense sliders), the years saved per $1k less spending, per $1k more income and per 1% more return, and exports a **watertight, labeled STL** for 3D printing — raised iso-year contours, raised lines for your own income and expenses with a raised dot where they cross, and debossed or embossed labels with straight walls — plus a layer-by-layer filament color plan for single-nozzle printers (accent contour lines, year bands, colored base labels). |

The first two are deterministic engines that give you a single, exact trajectory and
build intuition. The Stress Tester adds uncertainty: it samples real historical
returns (1928–2024) to show the *distribution* of outcomes — the same plan can succeed
at the median and still fail at the 10th percentile, and this tool makes that visible.

The fourth tool stands apart from the retirement question. The **HSA Transfer
Optimizer** models contributions landing in a 0%-return cash account (a daily drip plus
recurring lump sums) and a flat fee charged on each transfer into investments. Transfer
too often and fees pile up; transfer too rarely and cash sits idle earning nothing. It
finds the number of transfers, the exact schedule, and a simple idle-cash threshold
("transfer whenever uninvested cash reaches about \$X") that maximize the final value.

State for the first three tools is encoded in the URL, so any scenario can be
bookmarked or shared as a link.

## The math

Each tool is backed by a self-contained whitepaper deriving its model from first
principles. The compiled PDFs and their LaTeX sources live in [`docs/`](docs/).

| Whitepaper | Covers |
|------------|--------|
| [001 — The Pure Math of Financial Freedom](docs/001-the-pure-math-of-financial-freedom.pdf) | The deterministic closed-form solution: linear baseline, then exponential accumulation/decumulation. Underpins the Macro Sandbox. |
| [002 — The Asymmetric Glide Path](docs/002-asymmetric-glide-path.pdf) | Separate accumulation vs. decumulation growth rates and capital-conservation dynamics. |
| [003 — The Stochastic Retirement Framework](docs/003-stochastic-retirement-framework.pdf) | I.i.d. lognormal returns, percentile retirement dates in closed form (Fenton–Wilkinson), and how the analytical model and the Monte Carlo engine cross-check each other. Underpins the Stress Tester. |
| [004 — Optimal Transfer Cadence under Flat Fees](docs/004-optimal-transfer-cadence-under-flat-fees.pdf) | The fee-versus-idle-cash trade-off: the closed-form value of any transfer schedule, an exact day-resolution dynamic program for the optimum, the unimodal sweet spot, and the idle-cash threshold rule. Underpins the HSA Transfer Optimizer. |
| [005 — Spending Strategies and Quality of Life](docs/005-spending-strategies-and-quality-of-life.pdf) | Every calculation behind the Strategy Lab: the year-by-year kernel (balances floored at $0), the five spending rules, the target-anchored happiness score with survival weights and leftover-money value, its certainty-equivalent summary, and the dynamic program (with validation) that solves for the optimal policy. Underpins the Spending Strategy Lab. |
| [006 — The Years-to-FI Surface](docs/006-the-years-to-fi-surface.pdf) | The closed form in a version that stays exact at zero savings and zero return, the already-FI / reachable / never regions, why every iso-year contour is a straight line through one focal point, analytic sensitivities (including the exact exchange rate between a dollar of spending and a dollar of income), and how the surface becomes a printable model: constant-width ridges, rasterized debossed labels, and a closed mesh. Underpins the FI Surface. |

LaTeX sources, the plot-generation scripts (`generate_plot*.py`), and the generated
figures are in [`docs/src_docs/`](docs/src_docs/).

### Generating the figures

The whitepaper figures are produced offline by the `generate_plot*.py` scripts using
NumPy, SciPy, and Matplotlib. They are not part of the web app — you only need this if
you want to regenerate or modify the plots.

```bash
# from the repo root
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# run a script (writes its PDF into the visual-assets folder)
cd docs/src_docs
python3 generate_plot0.py        # e.g. generate_plot4.py for the HSA figures
```

The resulting PDFs land in `docs/src_docs/visual-assets/`, where the LaTeX sources
pick them up on the next compile.

## Tech stack

- **Vanilla JavaScript** — no framework, no build step.
- **[Chart.js 3.9.1](https://www.chartjs.org/)** — loaded from CDN for all visualizations.
- **Plain CSS** — a single [`styles.css`](styles.css) shared across all four tools.
- **Cloudflare** — deployed as a static site (see [`wrangler.jsonc`](wrangler.jsonc)).
- **Python + Matplotlib** — used offline only, to generate the whitepaper figures.

## Running locally

There is no build step. Because the tools load `styles.css` and the engine scripts by
relative path, serve the folder over HTTP rather than opening the file directly:

```bash
# Python (built in on most systems)
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. The tools are linked from the navigation bar at the
bottom of each page.

## Deployment

The site is deployed to Cloudflare as static assets. With
[Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed:

```bash
npx wrangler deploy
```

The custom domain is configured via `CNAME` and the Cloudflare dashboard.

## Project structure

```
.
├── index.html                      # Tool 1 — Macro Sandbox
├── index.js
├── LifepathCashFlowSimulator.html  # Tool 2 — Cash Flow Planner
├── lifepath.js
├── StressTester.html               # Tool 3 — Stress Tester
├── stresstester.js
├── StrategyLab.html                # Tool 6 — Spending Strategy Lab (beta)
├── strategylab.js
├── qol-engine.js                   # Quality-of-life scoring + optimal-spending DP solver (also unit-tested under Node)
├── HSATransfer.html                # Tool 4 — HSA Transfer Optimizer
├── hsa.js
├── hsa-engine.js                   # HSA optimizer math (also unit-tested under Node)
├── FISurface.html                  # Tool 7 — Years-to-FI Surface + 3D print
├── fisurface.js
├── fisurface-engine.js             # FI surface math, print heightmap, labels, STL (also unit-tested under Node)
├── styles.css                      # Shared styles for all tools
├── docs/                           # Whitepapers (PDF) + sources
│   ├── 001-the-pure-math-of-financial-freedom.pdf
│   ├── 002-asymmetric-glide-path.pdf
│   ├── 003-stochastic-retirement-framework.pdf
│   ├── 004-optimal-transfer-cadence-under-flat-fees.pdf
│   ├── 005-spending-strategies-and-quality-of-life.pdf
│   ├── 006-the-years-to-fi-surface.pdf
│   └── src_docs/                   # LaTeX sources, plot scripts, figures
├── CNAME                           # Custom domain for Cloudflare
├── wrangler.jsonc                  # Cloudflare deployment config
├── LICENSE
└── README.md
```

## Data attribution

Historical return series cover **1928–2024 (97 years)** and are sourced from
[Aswath Damodaran's dataset at NYU Stern](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html).
The **60/40 portfolio** blends 60% S&P 500 with 40% 10-Year US Treasury bond total
returns; all series are deflated by CPI to express returns in real terms.

## Disclaimer

This project is an educational and illustrative modeling tool, **not financial
advice**. It makes simplifying assumptions (for example, no taxes, simplified return
and fee modeling, and idealized cash flows) and its outputs depend entirely on the
assumptions you provide. Consult a qualified financial professional before making
decisions about your own finances.

## License

See [`LICENSE`](LICENSE).
