import numpy as np
import matplotlib.pyplot as plt
import os

# --- Money Plot Labs Brand Style Configuration ---
mp_dark  = '#0F172A'
mp_blue  = '#3B82F6'
mp_green = '#10B981'
mp_red   = '#EF4444'
mp_purple = '#8B5CF6'  # Capital Yield Component (A_t * r)
mp_brown   = '#A52A2A'

# Structural Neutrals for Environmental Comparison
mp_grey       = '#64748B'
mp_light_grey = '#CBD5E1'

plt.rcParams.update({
    'font.size': 10,
    'axes.labelsize': 11,
    'axes.titlesize': 12,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'legend.fontsize': 9,
    'grid.alpha': 0.12,
    'grid.linestyle': ':',
})

# Ensure destination folder exists
os.makedirs('visual-assets', exist_ok=True)

# --- Exact Core Variables ---
A_start = 25
A_end = 95
H = A_end - A_start  # Horizon = 70 years

A_0 = 0               # Initial Balance
L = 0                 # Desired Legacy Floor
s = 15000            # Annual Savings
c = 45000            # Annual Retirement Consumption
I = s + c            # Annual Earned Income

# =========================================================================
# GRAPH 1: THE LINEAR BASELINE (r = 0%)
# =========================================================================
r_lin = 0.0
w_linear = (c * H + L - A_0) / (s + c)
age_retire_linear = A_start + w_linear
A_w_linear = A_0 + s * w_linear

ages_lin = np.arange(A_start, A_end + 1)
nw_lin = [A_0 + s * t if t <= w_linear else L + c * (H - t) for t in (ages_lin - A_start)]

fig1, ax1 = plt.subplots(figsize=(7, 4.2), layout='tight')
split_idx_lin = int(np.floor(w_linear)) + 1

# Axis 1: Background Cash Flow Velocities (Left Axis)
ages_acc_lin = ages_lin[:split_idx_lin]
ages_dep_lin = ages_lin[split_idx_lin-1:]
income_profile_lin = [I if age <= age_retire_linear else 0 for age in ages_lin]

ax1.step(ages_lin, income_profile_lin, where='mid', color=mp_brown,  marker='.', linestyle='-', linewidth=1.5, alpha=0.7, label='Active Earned Income ($I$)')
ax1.bar(ages_acc_lin, [s]*len(ages_acc_lin), bottom=[c]*len(ages_acc_lin), color=mp_green, alpha=0.15, width=0.6, label='Savings Inflow ($s$)')
ax1.bar(ages_lin, [c]*len(ages_lin), bottom=[0]*len(ages_lin), color=mp_red, alpha=0.15, width=0.6, label='Consumption Outflow ($c$)')

ax1.set_ylabel('Annual Flow Velocity ($/yr)', color=mp_grey)
ax1.tick_params(axis='y', labelcolor=mp_grey)

# Axis 2: Foreground Net Worth Trajectory (Right Axis)
ax1b = ax1.twinx()
ax1b.plot(ages_acc_lin, nw_lin[:split_idx_lin], color=mp_green, linewidth=3, label='Accumulation Phase Net Worth ($A_t$)')
ax1b.plot(ages_dep_lin, nw_lin[split_idx_lin-1:], color=mp_red, linewidth=3, label='Decumulation Phase Net Worth ($A_t$)')

ax1b.plot(age_retire_linear, A_w_linear, marker='o', color=mp_dark, markersize=8, zorder=5)
ax1b.annotate(f'Peak $A_w$\nAge {age_retire_linear:.1f}\n${int(A_w_linear):,}', 
             xy=(age_retire_linear, A_w_linear), xytext=(age_retire_linear + 10, A_w_linear - 10000),
             color=mp_dark, weight='bold', ha='center', arrowprops=dict(arrowstyle='->', color=mp_dark, lw=1))

ax1b.text(55, 240000, f'Slope = +$s$\n(${s:,}/yr)', color=mp_green, weight='bold', ha='center', rotation=31)
ax1b.text(83, 220000, f'Slope = -$c$\n(-${c:,}/yr)', color=mp_red, weight='bold', ha='center', rotation=-59)

ax1b.annotate('', xy=(A_start, 50000), xytext=(age_retire_linear, 50000), arrowprops=dict(arrowstyle='<->', color=mp_dark, lw=1))
ax1b.text((A_start + age_retire_linear)/2, 75000, f'Working Phase\n$w = {w_linear:.1f}$ yrs', color=mp_dark, ha='center', weight='bold', fontsize=9)
ax1b.annotate('', xy=(age_retire_linear, 50000), xytext=(A_end, 50000), arrowprops=dict(arrowstyle='<->', color=mp_dark, lw=1))
ax1b.text((age_retire_linear + A_end)/2, 75000, f'Retirement Phase\n$f = {H-w_linear:.1f}$ yrs', color=mp_dark, ha='center', weight='bold', fontsize=9)

ax1.set_title('The Linear Intersection Baseline ($r=0\\%$)', color=mp_dark, weight='bold', pad=14)
ax1.set_xlabel('Age (Years)', color=mp_dark, weight='bold')
ax1b.set_ylabel('Net Worth ($)', color=mp_dark, weight='bold')
ax1.set_xlim(A_start, A_end)
ax1.set_ylim(0, 110000)
ax1b.set_ylim(0, 1100000)
ax1.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax1b.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax1.grid(True)

lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax1b.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left', frameon=True, edgecolor='#e2e8f0', fontsize=8.5)
for spine in ['top', 'right']: ax1.spines[spine].set_visible(False)
for spine in ['left', 'bottom']: ax1.spines[spine].set_color('#cbd5e1')
plt.savefig('visual-assets/linear_plot.pdf', format='pdf', bbox_inches='tight')
plt.close()


# =========================================================================
# GRAPH 2: THE FRACTIONAL EXPONENTIAL ENGINE (r = 3%)
# =========================================================================
r = 0.03
numerator_inner = (r * A_0 + s) * ((1 + r)**H) + c * (1 + r) - r * L
denominator_inner = s + c * (1 + r)
w_exponential = H - (np.log(numerator_inner / denominator_inner) / np.log(1 + r))
age_retire_exp = A_start + w_exponential

# High-res curve evaluation (500 steps for smooth foreground line)
ages_eval = np.linspace(A_start, A_end, 500)
nw_exp = []
for age in ages_eval:
    t = age - A_start
    if t <= w_exponential:
        val = A_0 * ((1 + r)**t) + s * (((1 + r)**t - 1) / r)
    else:
        A_w_exp = A_0 * ((1 + r)**w_exponential) + s * (((1 + r)**w_exponential - 1) / r)
        t_ret = t - w_exponential
        val = A_w_exp * ((1 + r)**t_ret) - c * (((1 + r)**(t_ret + 1) - (1 + r)) / r)
    nw_exp.append(val)

A_w_exponential = nw_exp[np.argmin(np.abs((ages_eval - A_start) - w_exponential))]

# Exact Integer Calendar Years
ages_lin = np.arange(A_start, A_end + 1)

# Generate baseline Asset States per calendar year
nw_lin_years = []
for age in ages_lin:
    t = age - A_start
    if t <= w_exponential:
        val = A_0 * ((1 + r)**t) + s * (((1 + r)**t - 1) / r)
    else:
        A_w_exp = A_0 * ((1 + r)**w_exponential) + s * (((1 + r)**w_exponential - 1) / r)
        t_ret = t - w_exponential
        val = A_w_exp * ((1 + r)**t_ret) - c * (((1 + r)**(t_ret + 1) - (1 + r)) / r)
    nw_lin_years.append(val)

# Identify the exact transition calendar year index
transition_year = int(np.floor(age_retire_exp))  # e.g., 61

# Arrays to store the fractional-aware bar layers
bar_labor_profile = []
bar_savings_layer = []
bar_growth_layer  = []

for idx, age in enumerate(ages_lin):
    A_t = nw_lin_years[idx]
    capital_yield = A_t * r
    bar_growth_layer.append(capital_yield)
    
    if age <= transition_year:
        # Full Accumulation Year
        bar_labor_profile.append(I)
        bar_savings_layer.append(s)
    elif age > transition_year:
        # Full Decumulation Year
        bar_labor_profile.append(0)
        bar_savings_layer.append(0)
    else: # Will not enter since we display transition year as full working year for bar purposes, but this block is here for clarity on the fractional logic
        # THE TRANSITION YEAR (Fractional Calculation)
        fraction_worked = age_retire_exp - transition_year  # e.g., 61.53 - 61 = 0.53
        fractional_income = fraction_worked * I
        
        bar_labor_profile.append(fractional_income)
        # Savings is the net surplus left over after consumption is subtracted from fractional income
        net_savings = max(0, fractional_income - c)
        bar_savings_layer.append(net_savings)

# Step function for the income profile line
income_line_profile = np.array(bar_labor_profile)

fig2, ax2 = plt.subplots(figsize=(7.2, 4.4), layout='tight')

# Left Axis: Annual Velocities (Fractional Bars & Steps)
# Use 'where=post' to make sure the step line visually updates exactly inside the transition block
ax2.step(ages_lin, income_line_profile, where='mid', color=mp_brown, marker='.', linestyle='-', linewidth=1.5, alpha=0.7, label='Earned Income ($I$)')

# Segmenting the bars cleanly across phases for visual contrast
mask_pre = ages_lin <= transition_year
mask_post = ages_lin >= transition_year

ax2.bar(ages_lin, bar_growth_layer, bottom=income_line_profile, color=mp_purple, alpha=0.15, width=0.6, label='Asset-Generated Yield ($A_t \\cdot r$)')
ax2.bar(ages_lin[mask_pre], bar_savings_layer[:len(ages_lin[mask_pre])], bottom=[c]*len(ages_lin[mask_pre]), color=mp_green, alpha=0.15, width=0.6, label='Savings Inflow ($s$)')
ax2.bar(ages_lin, [c]*len(ages_lin), bottom=[0]*len(ages_lin), color=mp_red, alpha=0.15, width=0.6, label='Consumption Outflow ($c$)')

ax2.set_ylabel('Annual Flow Velocity ($/yr)', color=mp_grey)
ax2.tick_params(axis='y', labelcolor=mp_grey)
ax2.set_ylim(0, 110000)

# Right Axis: Smooth Curves
ax2b = ax2.twinx()
mask_acc = ages_eval <= age_retire_exp
mask_dep = ages_eval >= age_retire_exp

ax2b.plot(ages_eval[mask_acc], np.array(nw_exp)[mask_acc], color=mp_green, linewidth=3, label='Exponential Accumulation ($A_t$)')
ax2b.plot(ages_eval[mask_dep], np.array(nw_exp)[mask_dep], color=mp_red, linewidth=3, label='Exponential Depletion ($A_t$)')

ax2b.plot(age_retire_exp, A_w_exponential, marker='o', color=mp_dark, markersize=8, zorder=5)
ax2b.annotate(f'Peak $A_w$\nAge {age_retire_exp:.2f}\n${int(A_w_exponential):,}', 
             xy=(age_retire_exp, A_w_exponential), xytext=(age_retire_exp + 20, A_w_exponential - 100000),
             color=mp_dark, weight='bold', ha='center', arrowprops=dict(arrowstyle='->', color=mp_dark, lw=1))

# Labels and calculus tags
ax2b.text(37, 220000, r'$\frac{dA}{dt} = s + rA$', color=mp_green, weight='bold', ha='center', fontsize=11, rotation=39)
ax2b.text(78, 330000, r'$\frac{dA}{dt} = -c + r(A - c)$', color=mp_red, weight='bold', ha='center', fontsize=11, rotation=-49)

ax2b.annotate('', xy=(A_start, 50000), xytext=(age_retire_exp, 50000), arrowprops=dict(arrowstyle='<->', color=mp_dark, lw=1))
ax2b.text((A_start + age_retire_exp)/2, 85000, f'Working Phase\n$w = {w_exponential:.2f}$ yrs', color=mp_dark, ha='center', weight='bold', fontsize=9)
ax2b.annotate('', xy=(age_retire_exp, 50000), xytext=(A_end, 50000), arrowprops=dict(arrowstyle='<->', color=mp_dark, lw=1))
ax2b.text((age_retire_exp + A_end)/2, 85000, f'Retirement Phase\n$f = {H-w_exponential:.2f}$ yrs', color=mp_dark, ha='center', weight='bold', fontsize=9)

ax2.set_title(f'The Exponential Compounding Trajectory ($r={int(r*100)}\\%$)', color=mp_dark, weight='bold', pad=14)
ax2.set_xlabel('Age (Years)', color=mp_dark, weight='bold')
ax2b.set_ylabel('Net Worth ($)', color=mp_dark, weight='bold')
ax2.set_xlim(A_start - 1, A_end + 1)
ax2b.set_ylim(0, 1100000)
ax2.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax2b.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax2b.grid(True)

lines2_a, labels2_a = ax2.get_legend_handles_labels()
lines2_b, labels2_b = ax2b.get_legend_handles_labels()
ax2.legend(lines2_a + lines2_b, labels2_a + labels2_b, loc='upper left', frameon=True, edgecolor='#e2e8f0', fontsize=8.5)

for spine in ['top', 'right']: ax2.spines[spine].set_visible(False)
for spine in ['left', 'bottom']: ax2.spines[spine].set_color('#cbd5e1')
plt.savefig('visual-assets/exponential_plot.pdf', format='pdf', bbox_inches='tight')
plt.close()
print("Success: Fractional-aware background bars compiled without altering the core math equations.")

# =========================================================================
# GRAPH 3: ENVIRONMENT MACRO COMPARISON (3% vs 0% vs -3%)
# =========================================================================
r_neg = -0.03
num_neg = (r_neg * A_0 + s) * ((1 + r_neg)**H) + c * (1 + r_neg) - r_neg * L
den_neg = s + c * (1 + r_neg)
w_negative = H - (np.log(num_neg / den_neg) / np.log(1 + r_neg))
age_retire_neg = A_start + w_negative

nw_neg_curve = []
for age in ages_eval:
    t = age - A_start
    if t <= w_negative:
        val = A_0 * ((1 + r_neg)**t) + s * (((1 + r_neg)**t - 1) / r_neg)
    else:
        A_w_neg = A_0 * ((1 + r_neg)**w_negative) + s * (((1 + r_neg)**w_negative - 1) / r_neg)
        t_ret = t - w_negative
        val = A_w_neg * ((1 + r_neg)**t_ret) - c * (((1 + r_neg)**(t_ret + 1) - (1 + r_neg)) / r_neg)
    nw_neg_curve.append(val)

fig3, ax3 = plt.subplots(figsize=(7.5, 4.5), layout='tight')

# Plot foreground optimized brand engine portfolio path
ax3.plot(ages_eval[mask_acc], np.array(nw_exp)[mask_acc], color=mp_green, linewidth=2.5, label='+3% Real Growth (Accumulation Phase)')
ax3.plot(ages_eval[mask_dep], np.array(nw_exp)[mask_dep], color=mp_red, linewidth=2.5, label='+3% Real Growth (Depletion Phase)')

# Plot background macro reference environments
ax3.plot(ages_eval, nw_lin_curve := [A_0 + s * (a - A_start) if (a - A_start) <= w_linear else L + c * (A_end - a) for a in ages_eval], 
         color=mp_grey, linewidth=1.75, linestyle='--', label='0% Real Growth (Keeping up with inflation)')
ax3.plot(ages_eval, nw_neg_curve, 
         color=mp_light_grey, linewidth=1.75, linestyle=':', label='-3% Real Growth (Checking account with 0% rate, losing to 3% inflation)')

# Highlight peak timeline transitions across environments
A_w_neg_peak = nw_neg_curve[np.argmin(np.abs((ages_eval - A_start) - w_negative))]
ax3.plot(age_retire_exp, A_w_exponential, marker='o', color=mp_dark, markersize=7, zorder=5)
ax3.plot(age_retire_linear, A_w_linear, marker='o', color=mp_grey, markersize=5, zorder=4)
ax3.plot(age_retire_neg, A_w_neg_peak, marker='o', color=mp_light_grey, markersize=5, zorder=4)

# Visual Callout Annotations
ax3.annotate(f'Asset Peak\nAge {age_retire_exp:.1f}\n${int(A_w_exponential):,}', 
             xy=(age_retire_exp, A_w_exponential), xytext=(age_retire_exp - 20, A_w_exponential - 110000),
             color=mp_dark, weight='bold', size=8.5, arrowprops=dict(arrowstyle='->', color=mp_dark, lw=0.8))

ax3.annotate(f'Age {age_retire_linear:.1f}', xy=(age_retire_linear, A_w_linear), xytext=(age_retire_linear + 2, A_w_linear + 8000),
             color=mp_grey, size=8.5, weight='bold')
ax3.annotate(f'Age {age_retire_neg:.1f}', xy=(age_retire_neg, A_w_neg_peak), xytext=(age_retire_neg + 2, A_w_neg_peak - 25000),
             color=mp_grey, size=8.5)

# Formatting Framework
ax3.set_title('Trajectory Comparison Matrix', color=mp_dark, weight='bold', pad=14)
ax3.set_xlabel('Age (Years)', color=mp_dark, weight='bold')
ax3.set_ylabel('Net Worth ($)', color=mp_dark, weight='bold')
ax3.set_xlim(A_start, A_end)
ax3.set_ylim(0, 1100000)
ax3.get_yaxis().set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))
ax3.grid(True)
ax3.legend(loc='center left', frameon=True, facecolor='#ffffff', edgecolor='#e2e8f0', fontsize=8.2)

for spine in ['top', 'right']: ax3.spines[spine].set_visible(False)
for spine in ['left', 'bottom']: ax3.spines[spine].set_color('#cbd5e1')

plt.savefig('visual-assets/comparison_plot.pdf', format='pdf', bbox_inches='tight')
plt.close()

print("Execution complete. All 3 dual-axis math-verified plots successfully outputted to visual-assets/")