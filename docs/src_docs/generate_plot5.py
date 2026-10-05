"""
generate_plot5.py — figure for Whitepaper 005 (Spending Strategy Lab).
Reimplements the target happiness curve (mirrors makeTarget in qol-engine.js) and renders:
  target_utility.pdf — happiness vs. spending as a share of the plan, for the three
                       "Extra Spending Worth" settings, with the floor and the kink marked
Brand palette matches styles.css / the whitepaper preamble.
"""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

MPDARK, MPBLUE, MPGREEN, MPRED, MPAMBER = "#0F172A", "#3B82F6", "#10B981", "#EF4444", "#F59E0B"
MPMUTED = "#94A3B8"

# ---- Reference scenario (the tool's defaults) ----
TARGET, FLOOR, LAMBDA, MIN_EXCESS = 45000.0, 20000.0, 2.5, 1000.0


def target_utility(x, eta, target=TARGET, floor=FLOOR, lam=LAMBDA, min_excess=MIN_EXCESS):
    """Happiness of spending x * target (x = share of plan), as in qol-engine.js."""
    f = min(floor / target, 0.9)
    xm = min(f + min_excess / target, (1 + f) / 2)
    k = lam * (1 - f)
    out = np.empty_like(x)
    for i, xi in enumerate(x):
        if xi >= 1:
            out[i] = np.log(xi) if abs(eta - 1) < 1e-9 else (xi ** (1 - eta) - 1) / (1 - eta)
        elif xi >= xm:
            out[i] = k * np.log((xi - f) / (1 - f))
        else:
            out[i] = k * np.log((xm - f) / (1 - f)) + k / (xm - f) * (xi - xm)
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "visual-assets")
    os.makedirs(out_dir, exist_ok=True)

    x = np.linspace(0.4, 2.5, 841)
    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    for eta, label, color in [(1, r"High ($\eta=1$, $\ln x$)", MPGREEN),
                              (2, r"Moderate ($\eta=2$, default)", MPBLUE),
                              (4, r"Low ($\eta=4$)", MPAMBER)]:
        ax.plot(x, target_utility(x, eta), color=color, lw=2.2 if eta == 2 else 1.6, label=label)

    f = FLOOR / TARGET
    ax.axvline(1.0, color=MPMUTED, lw=0.9, ls="--")
    ax.axvline(f, color=MPRED, lw=0.9, ls=":")
    ax.axhline(0.0, color=MPMUTED, lw=0.6)
    ax.annotate("plan (target)\nu = 0, slope kinks\nfrom $\\lambda$ to 1", xy=(1.0, 0.0), xytext=(1.12, -1.9),
                fontsize=8.5, color=MPDARK, arrowprops=dict(arrowstyle="->", color=MPMUTED, lw=0.8))
    ax.text(f + 0.12, -3.85, "spending floor\n(\\$20k = 44% of plan)", fontsize=8.5, color=MPRED, va="bottom")
    ax.annotate("10% cut: $-0.28$", xy=(0.9, target_utility(np.array([0.9]), 2)[0]), xytext=(0.5, 0.45),
                fontsize=8.5, color=MPDARK, arrowprops=dict(arrowstyle="->", color=MPMUTED, lw=0.8))
    ax.annotate("double the plan: $+0.50$", xy=(2.0, 0.5), xytext=(1.55, 1.05),
                fontsize=8.5, color=MPDARK, arrowprops=dict(arrowstyle="->", color=MPMUTED, lw=0.8))

    ax.set_xlim(0.4, 2.5)
    ax.set_ylim(-4.0, 1.4)
    ax.set_xlabel("Spending as a share of the plan  ($x = c/\\tau$)", color=MPDARK)
    ax.set_ylabel("Happiness  $u$", color=MPDARK)
    ax.set_title("Target happiness curve: \\$45k plan, \\$20k floor, shortfall pain $\\lambda = 2.5$",
                 fontsize=10.5, color=MPDARK)
    ax.legend(title="Extra Spending Worth", fontsize=8.5, title_fontsize=8.5, loc="lower right", frameon=False)
    ax.grid(alpha=0.25)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    path = os.path.join(out_dir, "target_utility.pdf")
    fig.savefig(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
