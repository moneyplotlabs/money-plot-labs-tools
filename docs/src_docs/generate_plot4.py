"""
generate_plot4.py — figures for Whitepaper 004 (HSA Transfer Optimizer).
Reimplements the HSA fee-optimization model (mirrors hsa-engine.js) and renders:
  hsa_value_vs_k.pdf   — final value vs. number of transfers (the sweet spot)
  hsa_idle_cash.pdf     — idle-cash sawtooth + portfolio trajectory (the threshold)
Brand palette matches styles.css / the whitepaper preamble.
"""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

MPDARK, MPBLUE, MPGREEN, MPRED = "#0F172A", "#3B82F6", "#10B981", "#EF4444"
MPMUTED = "#94A3B8"

# ---- Reference scenario (same as the tool's defaults) ----
YEARS, C_ANNUAL, R, FEE = 3, 4000.0, 0.04, 25.0
LUMPS = [(0, 400.0)]          # (day-of-year, amount), recurring annually
T = YEARS * 365
RHO = R / 365.0
CDAY = C_ANNUAL / 365.0
LUMP_DAYS = [(365 * n + d, amt) for n in range(YEARS) for (d, amt) in LUMPS]

def cum_cash(t):
    return CDAY * t + sum(a for (d, a) in LUMP_DAYS if d < t)

def g(t):
    return (1 + RHO) ** (T - t)

def per_k_optimum(kmax=12):
    """Exact DP: best value for each number of intermediate transfers k."""
    cc = [cum_cash(t) for t in range(T + 1)]
    ccT = cc[T]
    perk = {0: (ccT - cc[0]) - FEE}
    days_for = {0: []}
    # f_prev[t] = (best value with j-1 transfers ending at t, schedule)
    f_prev = {0: (0.0, [])}
    for j in range(1, kmax + 1):
        f_cur = {}
        for t in range(1, T):
            best, sched = -1e18, None
            for p, (val, ps) in f_prev.items():
                if p < t:
                    cand = val + (cc[t] - cc[p]) * g(t) - FEE * g(t)
                    if cand > best:
                        best, sched = cand, ps + [t]
            if sched is not None:
                f_cur[t] = (best, sched)
        # add mandatory final transfer at T
        bestV, bestS = -1e18, []
        for t, (val, ps) in f_cur.items():
            cand = val + (ccT - cc[t]) - FEE
            if cand > bestV:
                bestV, bestS = cand, ps
        perk[j] = bestV
        days_for[j] = bestS
        f_prev = f_cur
    return perk, days_for

perk, days_for = per_k_optimum(12)
ks = sorted(perk)
vals = [perk[k] for k in ks]
kstar = max(perk, key=perk.get)
best_days = days_for[kstar]

os.makedirs("visual-assets", exist_ok=True)

# ===== Figure 1: value vs k =====
fig, ax = plt.subplots(figsize=(6.5, 3.4))
ax.plot(ks, vals, color=MPBLUE, lw=2, zorder=2)
ax.scatter([k for k in ks if k != kstar], [perk[k] for k in ks if k != kstar],
           color=MPBLUE, s=28, zorder=3)
ax.scatter([kstar], [perk[kstar]], color=MPGREEN, s=90, zorder=4,
           label=f"optimum: k = {kstar}")
ax.axhline(perk[0], color=MPMUTED, ls="--", lw=1, zorder=1)
ax.annotate("single transfer at term end (baseline)", (0, perk[0]),
            textcoords="offset points", xytext=(8, -14), color=MPMUTED, fontsize=8)
ax.set_xlabel("Number of transfers  $k$")
ax.set_ylabel("Final value  ($)")
ax.set_title("Final value vs. number of transfers", color=MPDARK, fontsize=11)
ax.legend(frameon=False, fontsize=9, loc="lower right")
ax.spines[["top", "right"]].set_visible(False)
ax.yaxis.set_major_formatter(lambda x, _: f"${x/1000:.1f}k")
fig.tight_layout()
fig.savefig("visual-assets/hsa_value_vs_k.pdf")
plt.close(fig)

# ===== Figure 2: idle cash sawtooth + portfolio trajectory =====
def portfolio_value(t, days):
    allt = [0] + sorted(days) + [T]
    value, t_last = 0.0, 0
    for i in range(len(allt) - 1):
        ts, tt = allt[i], allt[i + 1]
        if tt <= t:
            A = CDAY * (tt - ts) + sum(a for (d, a) in LUMP_DAYS if ts <= d < tt)
            value += max(0.0, A - FEE) * (1 + RHO) ** (t - tt)
            t_last = tt
        else:
            break
    if t < T:
        value += CDAY * (t - t_last) + sum(a for (d, a) in LUMP_DAYS if t_last <= d < t)
    return value

def idle_cash(t, days):
    t_last = 0
    for td in sorted(days):
        if td <= t:
            t_last = td
        else:
            break
    if t >= T:
        return 0.0
    return CDAY * (t - t_last) + sum(a for (d, a) in LUMP_DAYS if t_last <= d < t)

ts = np.arange(0, T + 1)
port = [portfolio_value(t, best_days) for t in ts]
idle = [idle_cash(t, best_days) for t in ts]
# accurate sawtooth peaks at each transfer
peaks_x, peaks_y = [], []
prev = 0
for td in sorted(best_days) + [T]:
    peaks_x += [td, td]
    peaks_y += [cum_cash(td) - cum_cash(prev), 0]
    prev = td
# merge for a crisp drop
sx = list(ts) + peaks_x
sy = list(idle) + peaks_y
order = np.lexsort((-np.array(sy), np.array(sx)))
sx = np.array(sx)[order]; sy = np.array(sy)[order]

blocks = [cum_cash(td) - cum_cash(prev0) for prev0, td in zip([0] + best_days[:-1], best_days)]
threshold = np.mean(blocks)

fig, ax1 = plt.subplots(figsize=(6.5, 3.4))
ax1.plot(ts, port, color=MPGREEN, lw=2, label="Portfolio value (left)")
ax1.set_xlabel("Day from start")
ax1.set_ylabel("Portfolio value  ($)", color=MPGREEN)
ax1.tick_params(axis="y", labelcolor=MPGREEN)
ax1.yaxis.set_major_formatter(lambda x, _: f"${x/1000:.0f}k")
ax1.spines[["top"]].set_visible(False)

ax2 = ax1.twinx()
ax2.plot(sx, sy, color=MPMUTED, lw=1.2, label="Idle cash (right)")
ax2.axhline(threshold, color=MPRED, ls="--", lw=1)
ax2.annotate(f"transfer threshold ≈ ${threshold:,.0f}", (T * 0.02, threshold),
             textcoords="offset points", xytext=(0, 4), color=MPRED, fontsize=8)
ax2.set_ylabel("Idle (un-transferred) cash  ($)", color=MPMUTED)
ax2.tick_params(axis="y", labelcolor=MPMUTED)
ax2.set_ylim(0, max(sy) * 1.25)
ax1.set_title("Optimal schedule: portfolio growth vs. idle-cash sawtooth", color=MPDARK, fontsize=11)
fig.tight_layout()
fig.savefig("visual-assets/hsa_idle_cash.pdf")
plt.close(fig)

print(f"k* = {kstar}, value = {perk[kstar]:.2f}, days = {best_days}")
print(f"block sizes = {[round(b) for b in blocks]}, threshold ~= {threshold:.0f}")
print("wrote visual-assets/hsa_value_vs_k.pdf and visual-assets/hsa_idle_cash.pdf")
