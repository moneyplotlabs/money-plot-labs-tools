"""Figures for Whitepaper 006: the years-to-FI surface.

Writes into visual-assets/:
  fi_timeline.pdf       what is solved for: the portfolio over time meeting the FI number at n
  fi_surface_3d.pdf     the surface n(I, X) with its iso-year contours
  fi_contour_fan.pdf    the three regions and the fan of straight contours through the focal point
  fi_sensitivity.pdf    years saved per $1k less spending / more income, and their exchange rate
  fi_ridge_width.pdf    contour ridges: tolerance band |n - L| < 0.5 vs constant printed width

(fi_print_preview.png is the print heightmap from the FI Surface tool / companion notebook.)
"""
import os

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm

MPDARK, MPBLUE, MPGREEN, MPRED, MPAMBER, MPGREY = "#0F172A", "#3B82F6", "#10B981", "#EF4444", "#F59E0B", "#64748B"

# ---- Reference case (the tool's defaults) ----
R, S, P0 = 0.05, 0.04, 250_000
YOU = (100_000, 60_000)
CAP = 30
LEVELS = [5, 10, 15, 20, 25, 30]


def years_to_fi(I, X, R=R, S=S, P0=P0):
    """n = ln(1 + R gap / u) / ln(1 + R); 0 if already FI, inf if never (as in fisurface-engine.js)."""
    I, X = np.broadcast_arrays(np.asarray(I, float), np.asarray(X, float))
    gap, u = X / S - P0, R * P0 + I - X
    with np.errstate(divide="ignore", invalid="ignore"):
        n = np.log1p(R * gap / u) / np.log1p(R) if R > 0 else gap / u
    n = np.where(u > 0, n, np.inf)
    return np.where(gap <= 0, 0.0, n)


def gradient(I, X, R=R, S=S, P0=P0):
    gap, u = X / S - P0, R * P0 + I - X
    D, rho = u + R * gap, R / np.log1p(R)
    ok = (gap > 0) & (u > 0)
    with np.errstate(divide="ignore", invalid="ignore"):
        return (np.where(ok, -rho * gap / (u * D), np.nan),
                np.where(ok, rho * (1 / S + gap / u) / D, np.nan))


def contour_slope(L):
    s = ((1 + R) ** L - 1) / R
    return S * s / (1 + S * s)


FOCAL = (P0 * (S - R), S * P0)


def style(ax):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.tick_params(labelsize=8)


def fig_timeline(out):
    """The reference household's portfolio over time, crossing the FI number X/S at n years."""
    I, X = YOU
    C, F = I - X, X / S
    n = float(years_to_fi(I, X))
    t = np.linspace(0, 34, 400)
    g = (1 + R) ** t
    balance = P0 * g + C * (g - 1) / R
    fig, ax = plt.subplots(figsize=(7.0, 3.6))
    ax.plot(t, balance / 1e6, color=MPGREEN, lw=2, label=r"Portfolio $P(t) = P_0(1+R)^t + C\,\frac{(1+R)^t - 1}{R}$")
    ax.fill_between(t, 0, balance / 1e6, color=MPGREEN, alpha=0.08)
    ax.plot(t, (P0 + C * t) / 1e6, color=MPGREY, lw=1.2, ls="--", label=r"Savings alone, no growth: $P_0 + C\,t$")
    k = np.arange(0, 35)
    pk = P0 * (1 + R) ** k + C * ((1 + R) ** k - 1) / R
    ax.plot(k, pk / 1e6, "o", color=MPGREEN, ms=3.5, label=r"Year-end balances $P_k = P_{k-1}(1+R) + C$")
    ax.axhline(F / 1e6, color=MPAMBER, lw=1.8, ls=(0, (6, 4)), label=r"FI number $F = X/S$")
    ax.plot([n], [F / 1e6], "o", ms=8, mfc="white", mec=MPAMBER, mew=2, zorder=5)
    ax.annotate(f"$n$ = {n:.2f} years", (n, F / 1e6), xytext=(n + 1.5, F / 1e6 - 0.45),
                fontsize=9, arrowprops=dict(arrowstyle="->", color=MPDARK, lw=0.8))
    ax.axvline(n, color=MPAMBER, lw=0.8, ls=":", ymax=(F / 1e6) / 2.6)
    ax.set_xlim(0, 34)
    ax.set_ylim(0, 2.6)
    ax.set_xlabel("Years from today", fontsize=9)
    ax.set_ylabel(r"Portfolio (\$M, real)", fontsize=9)
    ax.legend(fontsize=7.5, loc="upper left", frameon=False)
    style(ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def fig_surface(out):
    I = np.linspace(50e3, 300e3, 220)
    X = np.linspace(0, 120e3, 160)
    Ig, Xg = np.meshgrid(I, X)
    Z = np.minimum(years_to_fi(Ig, Xg), CAP)
    fig = plt.figure(figsize=(7.2, 4.6))
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(Ig / 1e3, Xg / 1e3, Z, cmap="viridis", rstride=2, cstride=2, linewidth=0, antialiased=True, alpha=0.95, rasterized=True)
    ax.contour(Ig / 1e3, Xg / 1e3, Z, levels=LEVELS[:-1], colors="k", linewidths=0.8)
    ax.scatter([YOU[0] / 1e3], [YOU[1] / 1e3], [years_to_fi(*YOU) + 0.8], color=MPRED, s=30, depthshade=False, zorder=10)
    ax.set_zlim(0, CAP)
    ax.set_xlabel("Income ($k/yr)", fontsize=8)
    ax.set_ylabel("Expenses ($k/yr)", fontsize=8)
    ax.set_zlabel("Years to FI", fontsize=8)
    ax.tick_params(labelsize=7)
    ax.view_init(elev=26, azim=-128)
    ax.set_box_aspect((1.6, 1.0, 0.6))
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=200)
    plt.close(fig)


def fig_fan(out):
    I = np.linspace(-60e3, 300e3, 500)
    X = np.linspace(0, 170e3, 400)
    Ig, Xg = np.meshgrid(I, X)
    n = years_to_fi(Ig, Xg)
    fig, ax = plt.subplots(figsize=(7.0, 4.2))
    region = np.where(n == 0, 0, np.where(np.isinf(n), 2, 1))
    ax.contourf(I / 1e3, X / 1e3, region, levels=[-0.5, 0.5, 1.5, 2.5], colors=["#E2E8F0", "white", "#FEE2E2"])
    Is, Xs = FOCAL
    for L in LEVELS:
        m = contour_slope(L)
        Ie = 300e3
        ax.plot([Is / 1e3, Ie / 1e3], [Xs / 1e3, (Xs + m * (Ie - Is)) / 1e3], color=MPBLUE, lw=1.1)
        xe, ye = Ie, Xs + m * (Ie - Is)
        if ye > 160e3:
            xe, ye = Is + (160e3 - Xs) / m, 160e3
        ax.annotate(f"{L}y", (xe / 1e3, ye / 1e3), xytext=(0, 3), textcoords="offset points",
                    ha="center" if ye >= 160e3 else "right", fontsize=7.5, color=MPBLUE)
    ax.plot([-60, 300], [Xs / 1e3] * 2, color=MPGREY, lw=1.0, ls="--")
    ax.plot([-60, 300 - 0], [(-60e3 + R * P0) / 1e3, (300e3 + R * P0) / 1e3], color=MPRED, lw=1.2, ls="--")
    ax.plot(Is / 1e3, Xs / 1e3, "o", color=MPDARK, ms=6)
    ax.annotate(r"focal point $(I^\star, X^\star)$", (Is / 1e3, Xs / 1e3), xytext=(-55, 40), textcoords="offset points",
                fontsize=8, arrowprops=dict(arrowstyle="->", color=MPDARK, lw=0.8))
    ax.plot(YOU[0] / 1e3, YOU[1] / 1e3, "o", color=MPRED, ms=6)
    ax.annotate("you", (YOU[0] / 1e3, YOU[1] / 1e3), xytext=(6, -10), textcoords="offset points", fontsize=8, color=MPRED)
    ax.text(200, 3, "already FI  ($X \\leq S P_0$,  $n = 0$)", fontsize=8, color=MPGREY, ha="center")
    ax.text(20, 140, "never\n($X \\geq I + R P_0$)", fontsize=8.5, color=MPRED, ha="center")
    ax.axvline(0, color="k", lw=0.5)
    ax.set_xlim(-60, 300)
    ax.set_ylim(0, 168)
    ax.set_xlabel(r"Income $I$ (\$k/yr)", fontsize=9)
    ax.set_ylabel(r"Expenses $X$ (\$k/yr)", fontsize=9)
    style(ax)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)


def fig_sensitivity(out):
    I = np.linspace(50e3, 300e3, 300)
    X = np.linspace(0, 120e3, 220)
    Ig, Xg = np.meshgrid(I, X)
    dI, dX = gradient(Ig, Xg)
    n = years_to_fi(Ig, Xg)
    panels = [(dX * 1000, "Years sooner per $1k/yr\nless spending", "Reds", None),
              (-dI * 1000, "Years sooner per $1k/yr\nmore income", "Blues", None),
              (dX / -dI, "Exchange rate: $ of raise that\n$1 less spending is worth", "Purples", LogNorm(1, 30))]
    fig, axes = plt.subplots(1, 3, figsize=(7.6, 2.8), sharey=True)
    for ax, (Z, title, cmap, norm) in zip(axes, panels):
        if norm is None:
            im = ax.pcolormesh(I / 1e3, X / 1e3, Z, cmap=cmap, vmin=0, vmax=np.nanpercentile(Z, 97), shading="auto", rasterized=True)
        else:
            im = ax.pcolormesh(I / 1e3, X / 1e3, Z, cmap=cmap, norm=norm, shading="auto", rasterized=True)
        cb = fig.colorbar(im, ax=ax, shrink=0.85, pad=0.02)
        cb.ax.tick_params(labelsize=7)
        ax.contour(I / 1e3, X / 1e3, n, levels=LEVELS, colors="k", linewidths=0.5, linestyles="--")
        ax.plot(YOU[0] / 1e3, YOU[1] / 1e3, "o", mfc="white", mec="k", ms=5)
        ax.set_title(title, fontsize=8)
        ax.set_xlabel("Income ($k/yr)", fontsize=8)
        style(ax)
    axes[0].set_ylabel("Expenses ($k/yr)", fontsize=8)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=200)
    plt.close(fig)


def fig_ridge_width(out):
    """Top view of the 10/20/30-year contour ridges on a 200 x 120 mm plot."""
    W, D, cell = 200, 120, 0.25
    x, y = np.arange(0, W, cell), np.arange(0, D, cell)
    xx, yy = np.meshgrid(x, y)
    I, X = 50e3 + xx / W * 250e3, yy / D * 120e3
    n = years_to_fi(I, X)
    levels = [10, 20, 30]
    tol = np.zeros_like(n, bool)
    for L in levels:
        tol |= np.abs(n - L) < 0.5
    fx, fy = (FOCAL[0] - 50e3) / 250e3 * W, FOCAL[1] / 120e3 * D
    const = np.zeros_like(n, bool)
    for L in levels:
        ux, uy = W / 250e3, contour_slope(L) * D / 120e3
        ux, uy = ux / np.hypot(ux, uy), uy / np.hypot(ux, uy)
        along = (xx - fx) * ux + (yy - fy) * uy
        const |= (along > 0) & (np.abs((xx - fx) * uy - (yy - fy) * ux) < 0.6)
    fig, axes = plt.subplots(1, 2, figsize=(7.4, 2.6), sharey=True)
    for ax, mask, title in [(axes[0], tol, r"Tolerance band $|n - L| < 0.5$ yr"),
                            (axes[1], const, "Distance band: 1.2 mm everywhere")]:
        ax.imshow(np.where(mask, 1.0, np.nan), origin="lower", extent=[0, W, 0, D], cmap="Greys", vmin=0, vmax=1.2,
                  interpolation="nearest", rasterized=True)
        ax.imshow(np.minimum(n, CAP), origin="lower", extent=[0, W, 0, D], cmap="viridis", alpha=0.25,
                  interpolation="bilinear", rasterized=True, zorder=0)
        ax.set_title(title, fontsize=8.5)
        ax.set_xlabel("mm", fontsize=8)
        ax.set_aspect("equal")
        style(ax)
    axes[0].set_ylabel("mm", fontsize=8)
    fig.tight_layout()
    fig.savefig(out, bbox_inches="tight", dpi=200)
    plt.close(fig)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "visual-assets")
    os.makedirs(out_dir, exist_ok=True)
    fig_timeline(os.path.join(out_dir, "fi_timeline.pdf"))
    fig_surface(os.path.join(out_dir, "fi_surface_3d.pdf"))
    fig_fan(os.path.join(out_dir, "fi_contour_fan.pdf"))
    fig_sensitivity(os.path.join(out_dir, "fi_sensitivity.pdf"))
    fig_ridge_width(os.path.join(out_dir, "fi_ridge_width.pdf"))
    print("wrote figures to", out_dir)


if __name__ == "__main__":
    main()
