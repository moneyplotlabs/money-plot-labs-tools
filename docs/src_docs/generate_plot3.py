"""
generate_plots_003.py
Generates all visual assets for Technical Whitepaper 003:
"From Determinism to Probability: The Stochastic Retirement Framework"
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from scipy import stats
import os

# ── Brand Palette ──────────────────────────────────────────────
mp_dark   = '#0F172A'
mp_blue   = '#3B82F6'
mp_green  = '#10B981'
mp_red    = '#EF4444'
mp_purple = '#8B5CF6'
mp_amber  = '#F59E0B'
mp_grey   = '#64748B'
mp_lgrey  = '#CBD5E1'

plt.rcParams.update({
    'font.size': 10,
    'axes.labelsize': 11,
    'axes.titlesize': 12,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'legend.fontsize': 8.5,
    'grid.alpha': 0.15,
    'grid.linestyle': ':',
})

os.makedirs('visual-assets', exist_ok=True)
np.random.seed(42)

# ── Shared parameters ──────────────────────────────────────────
mu    = 0.059    # 60/40 arithmetic mean real return
sigma = 0.125    # 60/40 std dev
A0    = 0
s     = 15000
c     = 45000
H     = 70
n_years = H

# Log-return parameters (Itô correction)
mu_l    = np.log(1 + mu) - 0.5 * sigma**2 / (1 + mu)**2
sigma_l = np.sqrt(np.log(1 + sigma**2 / (1 + mu)**2))

# ── FIGURE 1: Arithmetic vs Geometric Mean — The Itô Gap ──────
fig1, axes = plt.subplots(1, 2, figsize=(10, 4.2), layout='tight')

# Left: distribution of single-year returns vs log-returns
r_vals = np.linspace(-0.5, 0.8, 400)
ax = axes[0]
pdf_arith = stats.norm.pdf(r_vals, mu, sigma)
ax.fill_between(r_vals, pdf_arith, alpha=0.25, color=mp_blue)
ax.plot(r_vals, pdf_arith, color=mp_blue, linewidth=2, label=f'Annual Return $r_t$')
ax.axvline(mu, color=mp_blue, linewidth=2, linestyle='--', label=f'Arithmetic mean $\\mu={mu*100:.1f}\\%$')
ax.axvline(mu - 0.5*sigma**2, color=mp_green, linewidth=2, linestyle='--',
           label=f'Median CAGR $\\approx\\mu - \\sigma^2/2 = {(mu - 0.5*sigma**2)*100:.2f}\\%$')
ax.set_xlabel('Annual Return')
ax.set_ylabel('Probability Density')
ax.set_title("The Itô Correction:\nArithmetic Mean vs Median CAGR", color=mp_dark, weight='bold')
ax.legend(fontsize=8)
ax.grid(True)
for sp in ['top', 'right']: ax.spines[sp].set_visible(False)

# Right: fan of 200 portfolio paths, no cash flows
ax2 = axes[1]
N_paths = 300
paths = np.zeros((N_paths, n_years + 1))
paths[:, 0] = 100  # index, starting at 100
for t in range(n_years):
    log_returns = np.random.normal(mu_l, sigma_l, N_paths)
    paths[:, t+1] = paths[:, t] * np.exp(log_returns)

years = np.arange(n_years + 1)
for i in range(N_paths):
    alpha = 0.06
    ax2.plot(years, paths[i], color=mp_blue, alpha=alpha, linewidth=0.7)

# Percentile bands
p10 = np.percentile(paths, 10, axis=0)
p50 = np.percentile(paths, 50, axis=0)
p90 = np.percentile(paths, 90, axis=0)

# Analytical percentile lines
years_arr = np.arange(n_years + 1)
z_10 = stats.norm.ppf(0.10)
z_90 = stats.norm.ppf(0.90)
analytic_p10 = 100 * np.exp(mu_l * years_arr + z_10 * sigma_l * np.sqrt(years_arr))
analytic_p50 = 100 * np.exp(mu_l * years_arr)
analytic_p90 = 100 * np.exp(mu_l * years_arr + z_90 * sigma_l * np.sqrt(years_arr))

ax2.fill_between(years, p10, p90, alpha=0.12, color=mp_blue, label='Simulated 10th–90th pct band')
ax2.plot(years, p50, color=mp_green, linewidth=2.5, label='Simulated p50')
ax2.plot(years_arr, analytic_p50, color=mp_green, linewidth=1.5, linestyle='--', label='Analytical p50: $e^{n\\mu_\\ell}$')
ax2.plot(years_arr, analytic_p10, color=mp_red, linewidth=1.5, linestyle='--', label=f'Analytical p10: $e^{{n\\mu_\\ell + z_{{0.1}}\\sigma_\\ell\\sqrt{{n}}}}$')
ax2.set_xlabel('Years')
ax2.set_ylabel('Portfolio Value (index, start=100)')
ax2.set_title('Lognormal Portfolio Fan\n(No Cash Flows, 300 Paths)', color=mp_dark, weight='bold')
ax2.legend(fontsize=7.5)
ax2.grid(True)
for sp in ['top', 'right']: ax2.spines[sp].set_visible(False)

plt.savefig('visual-assets/lognormal_fan.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Figure 1: lognormal_fan.pdf")

# ── FIGURE 2: Fenton-Wilkinson Approximation with Cash Flows ──
fig2, axes2 = plt.subplots(1, 2, figsize=(10, 4.2), layout='tight')

# Simulate actual paths WITH savings cash flows
N_paths2 = 2000
A0_val   = 50000
s_val    = 15000
n_acc    = 35   # accumulation years

paths2 = np.zeros((N_paths2, n_acc + 1))
paths2[:, 0] = A0_val
for t in range(n_acc):
    log_r = np.random.normal(mu_l, sigma_l, N_paths2)
    paths2[:, t+1] = paths2[:, t] * np.exp(log_r) + s_val

# Fenton-Wilkinson analytical moments
def fw_moments(A0, s, mu, sigma, n):
    """Returns (E[A_n], Var[A_n]) via moment recursion."""
    mu_l_  = np.log(1 + mu) - 0.5 * sigma**2 / (1 + mu)**2
    sig_l_ = np.sqrt(np.log(1 + sigma**2 / (1 + mu)**2))
    # Mean: exact
    E = A0 * (1 + mu)**n + s * ((1 + mu)**n - 1) / mu
    # Variance: Var[A_n] ~ A0^2*(1+mu)^(2n)*(e^(n*sigma_l^2)-1) plus cross terms (simplified)
    # Full second moment via recursion
    EX2 = A0**2
    EX  = A0
    for _ in range(n):
        new_EX  = EX  * (1 + mu) + s
        new_EX2 = EX2 * (1 + mu)**2 * np.exp(sig_l_**2) + 2 * EX * s * (1 + mu) + s**2
        EX, EX2 = new_EX, new_EX2
    V = EX2 - EX**2
    return EX, V

E_n, V_n = fw_moments(A0_val, s_val, mu, sigma, n_acc)

# Fit lognormal to moments
m_fw = 2 * np.log(E_n) - 0.5 * np.log(V_n + E_n**2)
v_fw = np.sqrt(np.log(1 + V_n / E_n**2))

# Simulated terminal distribution
terminal = paths2[:, -1]
ax3 = axes2[0]
ax3.hist(terminal / 1e6, bins=80, density=True, color=mp_blue, alpha=0.4, label='Monte Carlo (n=2000)')

x_range = np.linspace(terminal.min(), terminal.max(), 400)
fw_pdf   = stats.lognorm.pdf(x_range, s=v_fw, scale=np.exp(m_fw))
ax3.plot(x_range / 1e6, fw_pdf * 1e6, color=mp_red, linewidth=2.5, label='Fenton-Wilkinson fit')

# Mark percentiles
for p, col, lbl in [(10, mp_red, 'p10'), (50, mp_green, 'p50'), (90, mp_purple, 'p90')]:
    z   = stats.norm.ppf(p / 100)
    val = np.exp(m_fw + z * v_fw)
    ax3.axvline(val / 1e6, color=col, linewidth=1.8, linestyle='--', label=f'{lbl} = ${val/1e6:.2f}M')

ax3.set_xlabel('Terminal Net Worth ($M)')
ax3.set_ylabel('Density')
ax3.set_title(f'Terminal Distribution at Year {n_acc}\nWith Savings ($s$={s_val:,}/yr)', color=mp_dark, weight='bold')
ax3.legend(fontsize=8)
ax3.grid(True)
for sp in ['top', 'right']: ax3.spines[sp].set_visible(False)

# Right: percentile NW paths over time using F-W at each year
ax4 = axes2[1]
years_acc = np.arange(n_acc + 1)
pct_paths = {}
for p, col, lbl in [(10, mp_red, 'p10'), (25, mp_amber, 'p25'), (50, mp_green, 'p50 (median)'), (75, mp_blue, 'p75'), (90, mp_purple, 'p90')]:
    z = stats.norm.ppf(p / 100)
    vals = []
    for n in years_acc:
        if n == 0:
            vals.append(A0_val)
        else:
            E_n_, V_n_ = fw_moments(A0_val, s_val, mu, sigma, n)
            m_ = 2 * np.log(E_n_) - 0.5 * np.log(V_n_ + E_n_**2)
            v_ = np.sqrt(np.log(1 + V_n_ / E_n_**2))
            vals.append(np.exp(m_ + z * v_))
    pct_paths[p] = vals
    ls = '-' if p == 50 else '--'
    lw = 2.5 if p == 50 else 1.5
    ax4.plot(years_acc, np.array(vals) / 1e6, color=col, linewidth=lw, linestyle=ls, label=lbl)

ax4.fill_between(years_acc, np.array(pct_paths[10]) / 1e6, np.array(pct_paths[90]) / 1e6, alpha=0.08, color=mp_blue)
ax4.fill_between(years_acc, np.array(pct_paths[25]) / 1e6, np.array(pct_paths[75]) / 1e6, alpha=0.12, color=mp_blue)
ax4.set_xlabel('Accumulation Year')
ax4.set_ylabel('Net Worth ($M)')
ax4.set_title('Analytical Percentile Paths\n(Fenton-Wilkinson Approximation)', color=mp_dark, weight='bold')
ax4.legend(fontsize=8)
ax4.grid(True)
for sp in ['top', 'right']: ax4.spines[sp].set_visible(False)

plt.savefig('visual-assets/fenton_wilkinson.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Figure 2: fenton_wilkinson.pdf")

# ── FIGURE 3: Closed-Form Percentile Retirement Age ───────────
fig3, axes3 = plt.subplots(1, 2, figsize=(10, 4.2), layout='tight')

# Left: working years vs NW target under different percentiles (no cash flows)
ax5 = axes3[0]
nw_targets = np.linspace(100000, 2000000, 300)

for p, col, lbl in [(10, mp_red, 'p10 (slow market)'), (25, mp_amber, 'p25'), (50, mp_green, 'p50 (median)'),
                     (75, mp_blue, 'p75'), (90, mp_purple, 'p90 (bull market)')]:
    z = stats.norm.ppf(p / 100)
    # Quadratic: mu_l*u^2 + z*sigma_l*u - ln(F/A0_val) = 0  where u = sqrt(w)
    # Only valid when A0 > 0; use A0=50000
    ln_ratio = np.log(nw_targets / A0_val)
    # u = (-z*sigma_l + sqrt(z^2*sigma_l^2 + 4*mu_l*ln_ratio)) / (2*mu_l)
    discriminant = z**2 * sigma_l**2 + 4 * mu_l * ln_ratio
    discriminant = np.maximum(discriminant, 0)
    u = (-z * sigma_l + np.sqrt(discriminant)) / (2 * mu_l)
    w_years = u**2
    ax5.plot(nw_targets / 1e6, w_years, color=col, linewidth=1.8, label=lbl)

ax5.set_xlabel('NW Target ($M)')
ax5.set_ylabel('Working Years Required')
ax5.set_title('Closed-Form Percentile Working Years\n(No Cash Flows, $A_0$=\\$50k)', color=mp_dark, weight='bold')
ax5.legend(fontsize=8)
ax5.set_ylim(0, 60)
ax5.grid(True)
for sp in ['top', 'right']: ax5.spines[sp].set_visible(False)

# Right: effective discount — p10 effective rate as function of horizon
ax6 = axes3[1]
horizons = np.arange(5, 61)
z10 = stats.norm.ppf(0.10)
z50 = stats.norm.ppf(0.50)

# p10 effective rate: solve e^(w*mu_l + z10*sigma_l*sqrt(w)) = (F/A0)^(1/w) * something
# More cleanly: the effective single rate r_eff satisfying (1+r_eff)^w = e^(w*mu_l + z_p*sigma_l*sqrt(w))
# => r_eff = exp(mu_l + z_p*sigma_l/sqrt(w)) - 1
eff_rate_p10 = np.exp(mu_l + z10 * sigma_l / np.sqrt(horizons)) - 1
eff_rate_p25 = np.exp(mu_l + stats.norm.ppf(0.25) * sigma_l / np.sqrt(horizons)) - 1
eff_rate_p50 = np.exp(mu_l) - 1  # constant (median CAGR)

ax6.plot(horizons, eff_rate_p10 * 100, color=mp_red,   linewidth=2, label=f'p10 effective rate')
ax6.plot(horizons, eff_rate_p25 * 100, color=mp_amber,  linewidth=2, label=f'p25 effective rate')
ax6.axhline(eff_rate_p50 * 100, color=mp_green, linewidth=2, linestyle='--',
            label=f'p50 (median CAGR) = {eff_rate_p50*100:.2f}%')
ax6.axhline(mu * 100, color=mp_grey, linewidth=1.5, linestyle=':',
            label=f'Arithmetic mean $\\mu$ = {mu*100:.1f}%')

ax6.fill_between(horizons, eff_rate_p10 * 100, eff_rate_p50 * 100, alpha=0.1, color=mp_red)
ax6.set_xlabel('Planning Horizon (Years)')
ax6.set_ylabel('Effective Annual Rate (%)')
ax6.set_title('Effective Rate Shrinkage:\nVolatility Penalty by Horizon', color=mp_dark, weight='bold')
ax6.legend(fontsize=8)
ax6.grid(True)
for sp in ['top', 'right']: ax6.spines[sp].set_visible(False)

plt.savefig('visual-assets/percentile_retirement.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Figure 3: percentile_retirement.pdf")

print("All figures generated successfully.")
