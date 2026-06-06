import numpy as np
import matplotlib.pyplot as plt
import os

# --- Money Plot Labs Structural Palette ---
mp_dark  = '#0F172A'
mp_green = '#10B981'  # Productivity / Savings Flow
mp_red   = '#EF4444'  # Consumption Flow
mp_grey  = '#64748B'

plt.rcParams.update({
    'font.size': 10,
    'axes.labelsize': 11,
    'axes.titlesize': 12,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'grid.alpha': 0.12,
})

os.makedirs('visual-assets', exist_ok=True)

# --- Consistent Parameters ---
T_start, T_end = 25, 95
H = T_end - T_start

s = 15000  # Annual Savings Inflow
c = 45000  # Annual Consumption Outflow

# Under r=0%, calculate exact baseline w and f
w_linear = (c * H) / (s + c)  # Evaluates to 56.25 years
T_ret = T_start + w_linear     # Age 76.25

ages = np.arange(T_start, T_end + 1)

# Generate annual streams (Bars)
yearly_productivity = [s + c if T <= T_ret else 0 for T in ages]
yearly_consumption  = [c for T in ages]

# Generate cumulative integrations (Lines)
cum_productivity = np.cumsum(yearly_productivity)
cum_consumption  = np.cumsum(yearly_consumption)

# --- Render Dual Axis Figure ---
fig, ax1 = plt.subplots(figsize=(8, 4.8), layout='tight')

# Left Axis: Annual Cash Flows (Bars)
ax1.bar(ages - 0.2, yearly_productivity, width=0.4, color=mp_green, alpha=0.35, label='Annual Productivity ($s + c$)')
ax1.bar(ages + 0.2, yearly_consumption, width=0.4, color=mp_red, alpha=0.35, label='Annual Consumption ($c$)')
ax1.set_ylabel('Annual Velocity ($/yr)', color=mp_dark, weight='bold')
ax1.set_ylim(0, (s + c) * 1.2)
ax1.tick_params(axis='y', labelcolor=mp_dark)
ax1.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: f"${int(x):,}"))

# Right Axis: Cumulative Totals (Lines / Integrals)
ax2 = ax1.twinx()
ax2.plot(ages, cum_productivity, color=mp_green, linewidth=3, linestyle='-', label='Cumulative Productivity ($\int P \, dt$)')
ax2.plot(ages, cum_consumption, color=mp_red, linewidth=3, linestyle='-', label='Cumulative Consumption ($\int C \, dt$)')
ax2.set_ylabel('Cumulative Lifetime Value ($)', color=mp_dark, weight='bold')
ax2.set_ylim(0, max(cum_productivity) * 1.15)
ax2.tick_params(axis='y', labelcolor=mp_dark)
ax2.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: f"${int(x):,}"))

# Annotate Convergence Climax
terminal_value = cum_productivity[-1]
ax2.plot(T_end, terminal_value, marker='o', color=mp_dark, markersize=8, zorder=5)
ax2.annotate(f'Absolute Macro Balance\n${int(terminal_value):,}', xy=(T_end, terminal_value), 
             xytext=(T_end - 22, terminal_value - 400000), color=mp_dark, weight='bold', size=9.5,
             arrowprops=dict(arrowstyle='->', color=mp_dark, lw=1))

# Layout Fine Tuning
ax1.set_title('The Law of Lifetime Asset Conservation ($r=0\%$)', color=mp_dark, weight='bold', pad=14)
ax1.set_xlabel('Age (Years)', color=mp_dark, weight='bold')
ax1.set_xlim(T_start - 1, T_end + 1)
ax1.grid(True, linestyle=':', alpha=0.15)

# Unified Legend across both axes
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', frameon=True, edgecolor='#e2e8f0', fontsize=8.5)

for spine in ['top']: 
    ax1.spines[spine].set_visible(False)
    ax2.spines[spine].set_visible(False)

plt.savefig('visual-assets/lifetime_conservation_plot.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Macro conservation line-bar plot generated successfully.")