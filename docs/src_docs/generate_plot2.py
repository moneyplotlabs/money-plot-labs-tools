import numpy as np
import matplotlib.pyplot as plt
import os

# --- Money Plot Labs Structural Palette ---
mp_dark   = '#0F172A'
mp_green  = '#10B981'  # Earned Labor Input (s + c)
mp_red    = '#EF4444'  # Consumption Profile (c)
mp_purple = '#8B5CF6'  # Capital Yield Component (A_t * r)

plt.rcParams.update({
    'font.size': 10,
    'axes.labelsize': 11,
    'axes.titlesize': 12,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'grid.alpha': 0.12,
    'grid.linestyle': ':',
})

os.makedirs('visual-assets', exist_ok=True)

# --- Standardized Base Parameters ---
T_start = 25
T_end = 95
H = T_end - T_start  # 70 Years

A_0 = 0
L = 0  # Legacy Floor is exactly zero
s = 15000  
c = 45000  
I_labor = s + c  # $60,000 active income
r = 0.03         # 3% Real Return

# Solve for exact continuous crossover using Master Equation
num = (r * A_0 + s) * ((1 + r)**H) + c * (1 + r) - r * L
den = s + c * (1 + r)
w_exponential = H - (np.log(num / den) / np.log(1 + r))
T_ret = T_start + w_exponential  # Slices at ~61.5

ages = np.arange(T_start, T_end + 1)

# Generate true Net Worth state profile
nw_profile = []
for Age in ages:
    t = Age - T_start
    if t <= w_exponential:
        val = A_0 * ((1 + r)**t) + s * (((1 + r)**t - 1) / r)
    else:
        A_w = A_0 * ((1 + r)**w_exponential) + s * (((1 + r)**w_exponential - 1) / r)
        t_ret = t - w_exponential
        val = A_w * ((1 + r)**t_ret) - c * (((1 + r)**(t_ret + 1) - (1 + r)) / r)
    nw_profile.append(val)

# Track True Annual System Flow Streams
labor_stream = []
growth_stream = []
consumption_stream = []
net_system_velocity = []

for idx, Age in enumerate(ages):
    A_t = nw_profile[idx]
    capital_yield = A_t * r
    
    consumption_stream.append(c)
    growth_stream.append(capital_yield)
    
    if Age <= T_ret:
        labor_stream.append(I_labor)
        # Total wealth added to the universe this year:
        net_system_velocity.append(I_labor + capital_yield)
    else:
        labor_stream.append(0)
        # During retirement, labor drops to 0. Growth happens, but consumption subtracts.
        # Net system change is capital_yield, but you must account for drawing down the base.
        net_system_velocity.append(capital_yield)

# Integrals: Cumulative sums of what entered vs. what left the system
cum_inflow_and_yield = np.cumsum(net_system_velocity)
cum_consumption = np.cumsum(consumption_stream)

# Adjust integration line to reflect true asset stock balance integration
# Total cumulative value tracking through the lifecycle framework
cumulative_system_output = cum_consumption + np.array(nw_profile)

# --- Render Perfect Convergence Plot ---
fig, ax1 = plt.subplots(figsize=(8.5, 5.2), layout='tight')

# Left Axis: Velocities (Bars)
ax1.bar(ages, labor_stream, width=0.5, color=mp_green, alpha=0.35, label='Earned Labor Income ($I = s + c$)')
ax1.bar(ages, growth_stream, width=0.5, bottom=labor_stream, color=mp_purple, alpha=0.45, label='Internal Capital Yield ($A_t \cdot r$)')
ax1.bar(ages, consumption_stream, width=0.25, color=mp_red, alpha=0.3, label='System Consumption Baseline ($c$)')

ax1.set_ylabel('Annual Wealth Velocity ($/yr)', color=mp_dark, weight='bold')
ax1.set_ylim(0, max(labor_stream) * 1.5)
ax1.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: f"${int(x):,}"))

# Right Axis: Integrals (Lines)
ax2 = ax1.twinx()
ax2.plot(ages, cumulative_system_output, color=mp_green, linewidth=3, label='Total Cumulative System Value')
ax2.plot(ages, cum_consumption, color=mp_red, linewidth=3, label='Cumulative Lifetime Consumption ($\int C \, dt$)')

ax2.set_ylabel('Cumulative Macro Value ($)', color=mp_dark, weight='bold')
ax2.set_ylim(0, max(cumulative_system_output) * 1.15)
ax2.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: f"${int(x):,}"))

# Perfect Convergence Node Highlight
terminal_point = cumulative_system_output[-1]
ax2.plot(T_end, terminal_point, marker='o', color=mp_dark, markersize=8, zorder=5)
ax2.annotate(f'Absolute System Convergence\nNet Asset Balance = $L = {int(terminal_point)}$', 
             xy=(T_end, terminal_point), xytext=(T_end - 25, terminal_point + 300000), color=mp_dark,
             weight='bold', size=9, arrowprops=dict(arrowstyle='->', color=mp_dark, lw=1))

# Boundaries
ax1.axvline(x=T_ret, color=mp_dark, linestyle='--', alpha=0.5, lw=1.2)
ax1.text(T_ret - 1.5, max(labor_stream)*1.3, f'Retirement Boundary\nAge {T_ret:.1f}', color=mp_dark, weight='bold', ha='right', size=8.5)

ax1.set_title('The Conservation of Lifetime Assets with Compounding ($r=3\%$ Engine)', color=mp_dark, weight='bold', pad=14)
ax1.set_xlabel('Age (Years)', color=mp_dark, weight='bold')
ax1.set_xlim(T_start - 1, T_end + 1)
ax1.grid(True, linestyle=':', alpha=0.15)

lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', frameon=True, edgecolor='#e2e8f0', fontsize=8.5)

for spine in ['top']: 
    ax1.spines[spine].set_visible(False)
    ax2.spines[spine].set_visible(False)

plt.savefig('visual-assets/capital_productivity_conservation_plot.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Symmetrical convergence graph compiled successfully.")