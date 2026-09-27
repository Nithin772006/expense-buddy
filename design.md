# 🌿 Expense Buddy Design System & UI Specification (`design.md`)

> **Design Theme**: 3D Organic Modernist Green FinTech  
> **Target Audience**: Financial SaaS, Expense Tracking, Personal Wealth, Web3 / Crypto Banking, Analytics Dashboards  
> **Core Palette**: Deep Forest (`#0d261c`, `#1b4332`), Emerald (`#2d6a4f`), Spring Mint (`#52b788`), Sage Pale (`#d8f3dc`), and Ivory Cream (`#f4f8f5`)  
> **Key Attributes**: Glassmorphism, Micro-elevations, Ambient Radial Lighting, High Typography Contrast, Capsule Controls  

---

## Table of Contents
1. [Core Design Philosophy](#1-core-design-philosophy)
2. [Complete Color Palette & Token Architecture](#2-complete-color-palette--token-architecture)
3. [Atmospheric Background & Depth System](#3-atmospheric-background--depth-system)
4. [Typography & Text Hierarchy](#4-typography--text-hierarchy)
5. [Layout & Container System](#5-layout--container-system)
6. [Component Blueprints & Code Snippets](#6-component-blueprints--code-snippets)
   - [Top Navigation Bar](#61-capsule-top-navigation)
   - [Glassmorphic Cards](#62-glassmorphic-card-system)
   - [Stat / KPI Metric Cards](#63-stat--kpi-metric-cards)
   - [AI Financial Intelligence Banner](#64-ai-financial-intelligence-banner)
   - [Button System & Action Controls](#65-button-system)
   - [Form Controls & Floating Inputs](#66-form-controls--inputs)
   - [Transaction Rows & Anomaly Detection Badges](#67-transaction-rows--status-badges)
   - [Recurring Subscriptions & Merchant Cards](#68-recurring-subscriptions--bill-cards)
   - [Drag & Drop Upload Target](#69-drag--drop-upload-zone)
7. [Data Visualization & Chart Theming (Recharts / Chart.js)](#7-data-visualization--chart-theming)
8. [Animations & Micro-interactions](#8-animations--micro-interactions)
9. [Copy-Paste Starter CSS (`index.css`)](#9-copy-paste-starter-css)
10. [How to Apply to Any Future Project](#10-how-to-apply-to-any-future-project)

---

## 1. Core Design Philosophy

The **Expense Buddy** frontend design moves away from cold, generic dashboard templates (flat grays, stark whites, default blues) by blending computational precision with an organic botanic green identity:

* **High Emotional Trust**: Deep forest greens evoke stability, wealth preservation, and growth.
* **Tactile Glassmorphism**: Cards use soft semi-translucent ivory-white surfaces (`rgba(255, 255, 255, 0.92)`), delicate green-tinted borders, and `backdrop-filter: blur(16px - 20px)`.
* **Atmospheric Depth**: Instead of flat backgrounds, the viewport is illuminated by multi-point ambient radial gradients and a 32px dot-matrix grid overlay.
* **Micro-Precision Interaction**: Hover states never feel abrupt; elements smoothly lift by `1.5px` to `2px` using custom cubic-bezier curves (`0.2s cubic-bezier(0.16, 1, 0.3, 1)`).

---

## 2. Complete Color Palette & Token Architecture

```css
:root {
  /* ── 1. Primary Brand Green Scale ── */
  --eb-deep-forest:   #0d261c;  /* Maximum contrast headlines, deepest black-green */
  --eb-forest:        #1b4332;  /* Core brand tone: titles, primary text, buttons */
  --eb-forest-dark:   #143527;  /* Hover state for buttons and dark active accents */
  --eb-emerald:       #2d6a4f;  /* Primary active accent: links, icons, gradients */
  --eb-emerald-light: #40916c;  /* Gradient transition stop, active text */
  --eb-mint:          #52b788;  /* Vibrant accent: hover indicators, active focus rings */
  --eb-mint-light:    #74c69d;  /* Soft mint for secondary charts & badges */
  --eb-pistachio:     #95d5b2;  /* Chart fills & light borders */
  --eb-sage-pale:     #d8f3dc;  /* Pill backgrounds, success highlights */

  /* ── 2. Canvas & Surface Tones ── */
  --eb-cream-bg:      #f4f8f5;  /* Base viewport background */
  --eb-cream-card:    rgba(255, 255, 255, 0.92); /* Glassmorphic card surface */
  --eb-cream-input:   #ffffff;  /* Form input field background */
  --eb-card-border:   rgba(82, 183, 136, 0.24);  /* Primary card border */
  --border-subtle:    rgba(82, 183, 136, 0.14);  /* Dividers, table borders */
  --border-focus:     rgba(82, 183, 136, 0.45);  /* Hover & focus border ring */

  /* ── 3. High-Contrast Typography ── */
  --eb-text-dark:     #132e22;  /* Primary body text, headings, numbers */
  --eb-text-muted:    #476856;  /* Secondary descriptions, subtitles */
  --eb-text-subtle:   #688a77;  /* Eyebrows, timestamps, category tags */

  /* ── 4. Semantic / Status Accents ── */
  --color-success:    #2d6a4f;  /* Success text */
  --bg-success:       #d8f3dc;  /* Success badge bg */
  --border-success:   rgba(82, 183, 136, 0.40);

  --color-warning:    #d97706;  /* Due / Warning text */
  --bg-warning:       #fef3c7;  /* Warning badge bg */
  --border-warning:   rgba(217, 119, 6, 0.30);

  --color-danger:     #dc2626;  /* Anomaly / Overdue text */
  --bg-danger:        #fee2e2;  /* Anomaly badge bg */
  --border-danger:    rgba(220, 38, 38, 0.30);

  --color-info:       #1d70b8;  /* Information text */
  --bg-info:          #e0f2fe;  /* Information badge bg */

  /* ── 5. Spatial & Radius Constants ── */
  --eb-container-max:   1280px;
  --eb-container-pad-x: 32px;
  --eb-gap-grid:        16px;
  --eb-gap-section:     24px;
  --eb-radius-card:     18px;
  --eb-radius-btn:      12px;
  --eb-radius-input:    12px;
  --eb-radius-sm:       10px;
  --eb-radius-pill:     999px;

  /* ── 6. Shadows & Transitions ── */
  --shadow-sm:        0 4px 18px rgba(13, 38, 28, 0.04);
  --shadow-md:        0 8px 26px rgba(13, 38, 28, 0.07);
  --shadow-elevated:  0 16px 44px rgba(13, 38, 28, 0.11);
  --transition:       0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Atmospheric Background & Depth System

To recreate the signature 3D environment, the page root combines **three soft radial gradient blurs** with a fixed **dot-matrix grid overlay**:

```css
body, .app-shell {
  min-height: 100vh;
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #f3f8f4;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(183, 228, 199, 0.20) 0%, transparent 42%),
    radial-gradient(circle at 78% 50%, rgba(116, 198, 157, 0.15) 0%, transparent 45%),
    radial-gradient(circle at 50% 90%, rgba(216, 243, 220, 0.22) 0%, transparent 38%);
  background-attachment: fixed;
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--eb-text-dark);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  position: relative;
}

/* Subtle dot-matrix computational overlay */
.app-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(rgba(45, 106, 79, 0.035) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.7;
}
```

---

## 4. Typography & Text Hierarchy

| Role | Font Size | Weight | Tracking | Color | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title** | `28px` | `800` | `-0.03em` | `--eb-forest` (`#1b4332`) | `Dashboard`, `Spending Forecast` |
| **Page Subtitle** | `13.5px` | `500` | `0` | `--eb-text-subtle` (`#688a77`) | `Monitor your spending patterns and ML insights.` |
| **Section Eyebrow** | `11.5px` | `700` | `+0.7px` (uppercase) | `--eb-text-subtle` | `MONTHLY TOTAL`, `INTELLIGENCE MODELS` |
| **Card Header** | `15px` | `700` | `-0.01em` | `--eb-forest` | `Category Breakdown`, `Recent Transactions` |
| **Hero Numbers** | `24px` - `38px` | `800` | `-0.6px` to `-1px` | `--eb-deep-forest` | `₹1,24,500.00` |
| **Body Standard** | `13.5px` | `500` | `0` | `--eb-text-dark` (`#132e22`) | Standard paragraph and table cell copy |
| **Micro Caption** | `11.5px` - `12px` | `500` | `0` | `--eb-text-muted` (`#476856`) | Subtitles, helper text, chart axis labels |

---

## 5. Layout & Container System

```css
/* Centered Maximum Container */
.page-container {
  max-width: var(--eb-container-max, 1280px);
  margin: 0 auto;
  padding: 28px var(--eb-container-pad-x, 32px) 64px;
  width: 100%;
  box-sizing: border-box;
}

/* Page Header with Right-Aligned Actions */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--eb-gap-section, 24px);
  gap: 16px;
  flex-wrap: wrap;
}

/* 4-Column Stat Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--eb-gap-grid, 16px);
  margin-bottom: var(--eb-gap-section, 24px);
}

/* 2fr : 1fr Dashboard Rows (Charts & Feeds) */
.charts-row, .dashboard-bottom {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--eb-gap-grid, 16px);
  margin-bottom: var(--eb-gap-section, 24px);
}

/* Responsive Breakpoints */
@media (max-width: 1200px) {
  .charts-row, .dashboard-bottom { grid-template-columns: 1fr; }
}

@media (max-width: 1024px) {
  :root { --eb-container-pad-x: 24px; }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  :root { --eb-container-pad-x: 16px; }
  .stats-grid { grid-template-columns: 1fr; }
  .page-header { flex-direction: column; align-items: flex-start; }
}
```

---

## 6. Component Blueprints & Code Snippets

### 6.1 Capsule Top Navigation

Fixed `70px` top bar with a centered capsule pill containing navigation routes:

```html
<header class="eb-top-nav">
  <div class="eb-top-nav-inner">
    <!-- Brand Logo -->
    <a href="/" class="eb-nav-brand">
      <div class="eb-nav-logo-mark">🌿</div>
      <div class="eb-nav-brand-text">
        <span class="eb-brand-word-expense">Expense</span>
        <span class="eb-brand-word-buddy">Buddy</span>
      </div>
      <span class="eb-nav-badge">AI 2.0</span>
    </a>

    <!-- Center Floating Pill Menu -->
    <nav class="eb-nav-links">
      <a href="/" class="eb-nav-link eb-nav-link--active">
        <svg><!-- Lucide Icon --></svg> Dashboard
      </a>
      <a href="/add-expense" class="eb-nav-link">
        <svg><!-- Lucide Icon --></svg> Add Expense
      </a>
      <a href="/forecast" class="eb-nav-link">
        <svg><!-- Lucide Icon --></svg> Forecast
      </a>
      <a href="/settings" class="eb-nav-link">
        <svg><!-- Lucide Icon --></svg> Settings
      </a>
    </nav>

    <!-- Right Controls -->
    <div class="eb-nav-actions">
      <button class="btn-primary btn-sm">+ New Expense</button>
    </div>
  </div>
</header>
```

```css
.eb-top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 70px;
  background: rgba(255, 255, 255, 0.90);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(82, 183, 136, 0.22);
  box-shadow: 0 4px 20px rgba(13, 38, 28, 0.04);
  z-index: 1000;
  display: flex;
  align-items: center;
}

.eb-top-nav-inner {
  max-width: var(--eb-container-max);
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--eb-container-pad-x);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eb-nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(237, 245, 240, 0.65);
  border: 1px solid rgba(82, 183, 136, 0.2);
  padding: 4px 6px;
  border-radius: var(--eb-radius-pill);
}

.eb-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border-radius: var(--eb-radius-pill);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--eb-text-muted);
  text-decoration: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.eb-nav-link:hover {
  color: var(--eb-text-dark);
  background: rgba(255, 255, 255, 0.7);
}

.eb-nav-link--active {
  background: #ffffff !important;
  color: var(--eb-forest) !important;
  box-shadow: 0 2px 8px rgba(27, 67, 50, 0.08);
  border: 1px solid rgba(82, 183, 136, 0.35);
}
```

---

### 6.2 Glassmorphic Card System

```css
.card {
  background: var(--eb-cream-card, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--eb-card-border);
  border-radius: var(--eb-radius-card);
  padding: 22px 24px;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
  box-sizing: border-box;
}

.card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}
```

---

### 6.3 Stat / KPI Metric Cards

Features a secret 3px top gradient stripe that fades in upon hovering:

```html
<div class="stat-card">
  <div class="stat-card-top">
    <div class="stat-card-icon stat-card-icon--emerald">
      <IndianRupee size="17" />
    </div>
    <span class="stat-label">TOTAL SPENT</span>
  </div>
  <div class="stat-card-body">
    <div class="stat-value">₹48,250.00</div>
    <div class="stat-sub">Across 42 transactions this month</div>
  </div>
</div>
```

```css
.stat-card {
  background: var(--eb-cream-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--eb-card-border);
  border-radius: var(--eb-radius-card);
  padding: 20px 22px;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 140px;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--eb-mint), var(--eb-emerald));
  opacity: 0;
  transition: opacity 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.stat-card:hover::before {
  opacity: 1;
}

.stat-card-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-card-icon--emerald { background: rgba(45, 106, 79, 0.14); color: var(--eb-emerald); }
.stat-card-icon--green   { background: rgba(82, 183, 136, 0.18); color: var(--eb-forest); }
.stat-card-icon--blue    { background: rgba(29, 112, 184, 0.12); color: var(--color-info); }
.stat-card-icon--amber   { background: rgba(217, 119, 6, 0.12);  color: var(--color-warning); }
.stat-card-icon--red     { background: rgba(220, 38, 38, 0.12);  color: var(--color-danger); }
```

---

### 6.4 AI Financial Intelligence Banner

```html
<div class="eb-ai-banner">
  <div class="eb-ai-banner-left">
    <div class="eb-ai-banner-icon">
      <Sparkles size={20} />
    </div>
    <span class="eb-ai-banner-label">AI Spending Behavior</span>
  </div>
  <div class="eb-ai-banner-center">
    <span class="eb-ai-banner-badge">Balanced Customer</span>
    <p class="eb-ai-banner-desc">Moderate, well-distributed spending across groceries and utilities.</p>
  </div>
  <div class="eb-ai-banner-right">
    <div class="eb-ai-forecast-block">
      <span class="eb-ai-forecast-label">Projected Next Month</span>
      <span class="eb-ai-forecast-value">₹52,800</span>
    </div>
    <button class="btn-primary btn-sm">Explore Models</button>
  </div>
</div>
```

```css
.eb-ai-banner {
  width: 100%;
  padding: 16px 24px;
  background: linear-gradient(135deg, rgba(234, 245, 238, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(82, 183, 136, 0.32);
  border-radius: var(--eb-radius-card);
  box-shadow: 0 6px 20px rgba(45, 106, 79, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: var(--eb-gap-section);
}

.eb-ai-banner-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(45, 106, 79, 0.28);
  animation: ebAiGlow 3s ease-in-out infinite alternate;
}

@keyframes ebAiGlow {
  0%   { box-shadow: 0 0 0 0 rgba(82, 183, 136, 0.35); }
  100% { box-shadow: 0 0 0 8px rgba(82, 183, 136, 0); }
}

.eb-ai-banner-badge {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #d8f3dc;
  color: #1b4332;
  font-weight: 700;
  border: 1px solid rgba(82, 183, 136, 0.35);
}
```

---

### 6.5 Button System

```css
/* Primary Gradient Emerald Button */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, var(--eb-emerald) 0%, var(--eb-forest) 100%);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--eb-radius-btn);
  font-size: 13px;
  font-weight: 600;
  padding: 0 18px;
  height: 38px;
  box-shadow: 0 3px 12px rgba(27, 67, 50, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: all var(--transition);
  cursor: pointer;
  text-decoration: none;
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 18px rgba(27, 67, 50, 0.30);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0.5px);
}

/* Secondary White Card Button */
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: #ffffff;
  color: var(--eb-forest);
  border: 1px solid rgba(82, 183, 136, 0.32);
  border-radius: var(--eb-radius-btn);
  font-size: 13px;
  font-weight: 600;
  padding: 0 16px;
  height: 38px;
  box-shadow: 0 2px 8px rgba(13, 38, 28, 0.04);
  transition: all var(--transition);
  cursor: pointer;
  text-decoration: none;
}
.btn-secondary:hover:not(:disabled) {
  background: #f4faf6;
  border-color: var(--eb-mint);
  transform: translateY(-1px);
}
```

---

### 6.6 Form Controls & Inputs

```css
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.form-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--eb-forest);
}

.form-field input,
.form-field select {
  background: #ffffff;
  border: 1.5px solid rgba(82, 183, 136, 0.25);
  border-radius: var(--eb-radius-input);
  color: var(--eb-text-dark);
  font-family: inherit;
  font-size: 13.5px;
  padding: 10px 14px;
  outline: none;
  transition: all var(--transition);
  width: 100%;
}

.form-field input:focus,
.form-field select:focus {
  border-color: var(--eb-emerald);
  box-shadow: 0 0 0 3.5px rgba(82, 183, 136, 0.20);
}
```

---

### 6.7 Transaction Rows & Status Badges

```html
<div class="tx-row">
  <span class="tx-category-dot"></span>
  <div class="tx-body">
    <div class="tx-desc">Zepto Instant Grocery Delivery</div>
    <div class="tx-meta">Today · Groceries</div>
  </div>
  <div class="tx-right">
    <span class="tx-amount">₹429.00</span>
    <span class="anomaly-badge anomaly-badge--ok">Verified Normal</span>
  </div>
</div>
```

```css
.tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 15px;
  border-radius: var(--eb-radius-sm);
  background: #ffffff;
  border: 1px solid rgba(82, 183, 136, 0.14);
  transition: all var(--transition);
}
.tx-row:hover {
  background: #f4faf6;
  border-color: rgba(82, 183, 136, 0.35);
  transform: translateX(2px);
}

.tx-category-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--eb-emerald);
}

.anomaly-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.anomaly-badge--ok {
  background: rgba(82, 183, 136, 0.16);
  color: var(--eb-forest);
  border: 1px solid rgba(82, 183, 136, 0.30);
}
.anomaly-badge--warn {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.25);
}
```

---

### 6.8 Recurring Subscriptions & Bill Cards

```css
.recurring-item-card {
  padding: 12px 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid rgba(82, 183, 136, 0.22);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(13, 38, 28, 0.03);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.recurring-item-card:hover {
  transform: translateY(-1px);
  border-color: rgba(82, 183, 136, 0.38);
}
.recurring-badge--paid     { background: #d8f3dc; color: #1b4332; }
.recurring-badge--due      { background: #fef3c7; color: #b45309; }
.recurring-badge--overdue  { background: #fee2e2; color: #b91c1c; }
.recurring-badge--upcoming { background: #eaf5ee; color: #2d6a4f; }
```

---

### 6.9 Drag & Drop Upload Zone

```css
.dropzone {
  border: 2px dashed rgba(82, 183, 136, 0.40);
  border-radius: var(--eb-radius-card);
  background: #fbfdfc;
  padding: 44px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition);
}
.dropzone:hover, .dropzone--active {
  border-color: var(--eb-emerald);
  background: #eef8f2;
}
```

---

## 7. Data Visualization & Chart Theming

### Category Palette Map
Use these precise HSL/Hex mappings for Doughnut, Pie, and Bar charts:

```javascript
export const FINTECH_CATEGORY_COLORS = {
  'Groceries':         '#2d6a4f', // Deep Emerald
  'Food & Dining':     '#40916c', // Mid Emerald
  'Bills & Utilities': '#1b4332', // Deep Forest
  'Subscriptions':     '#52b788', // Spring Mint
  'Transportation':    '#1d70b8', // Classic FinTech Blue
  'Shopping':          '#d97706', // Warm Amber
  'Entertainment':     '#74c69d', // Mint Pale
  'Health & Fitness':  '#95d5b2', // Pistachio
  'Travel':            '#2a9d8f', // Teal Mint
  'Miscellaneous':     '#8da399', // Sage Neutral
};
```

### Area Chart Spending Trend Gradient (Recharts)
```jsx
<defs>
  <linearGradient id="ebSpendGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="#2d6a4f" stopOpacity={0.28} />
    <stop offset="60%" stopColor="#52b788" stopOpacity={0.12} />
    <stop offset="95%" stopColor="#d8f3dc" stopOpacity={0.00} />
  </linearGradient>
</defs>
<Area
  type="monotone"
  dataKey="amount"
  stroke="#2d6a4f"
  strokeWidth={2.5}
  fill="url(#ebSpendGradient)"
  dot={{ r: 3, fill: '#2d6a4f', strokeWidth: 1.5, stroke: '#ffffff' }}
  activeDot={{ r: 6, fill: '#1b4332', stroke: '#52b788', strokeWidth: 2 }}
/>
```

---

## 8. Animations & Micro-interactions

| Animation | CSS Keyframes | Usage |
| :--- | :--- | :--- |
| **AI Glow Pulse** | `ebAiGlow` (0% to 100% box-shadow spread) | AI badges, Sparkles icon, processing status |
| **Card Lift** | `transform: translateY(-2px)` | Hovering on KPI stat cards, action buttons |
| **List Row Slide** | `transform: translateX(2px)` | Hovering on transaction list rows |
| **Ambient Floating** | `ebBlobFloat` (12s ease-in-out infinite) | Ambient background colored gradient spheres |

---

## 9. Copy-Paste Starter CSS

To start a new project with this design right now, create `index.css` and paste the following baseline:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --eb-deep-forest:   #0d261c;
  --eb-forest:        #1b4332;
  --eb-emerald:       #2d6a4f;
  --eb-mint:          #52b788;
  --eb-sage-pale:     #d8f3dc;
  --eb-cream-bg:      #f4f8f5;
  --eb-cream-card:    rgba(255, 255, 255, 0.92);
  --eb-card-border:   rgba(82, 183, 136, 0.24);
  --eb-text-dark:     #132e22;
  --eb-text-muted:    #476856;
  --eb-text-subtle:   #688a77;
  --eb-radius-card:   18px;
  --eb-radius-btn:    12px;
  --eb-radius-input:  12px;
  --eb-radius-pill:   999px;
  --shadow-sm:        0 4px 18px rgba(13, 38, 28, 0.04);
  --shadow-md:        0 8px 26px rgba(13, 38, 28, 0.07);
  --transition:       0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #f3f8f4;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(183, 228, 199, 0.20) 0%, transparent 42%),
    radial-gradient(circle at 78% 50%, rgba(116, 198, 157, 0.15) 0%, transparent 45%),
    radial-gradient(circle at 50% 90%, rgba(216, 243, 220, 0.22) 0%, transparent 38%);
  background-attachment: fixed;
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--eb-text-dark);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
```

---

## 10. How to Apply to Any Future Project

1. **Copy `design.md`** into your new project's documentation folder or repository root.
2. In your new project, install **Lucide Icons**:
   ```bash
   npm install lucide-react
   ```
3. Use the CSS tokens and blueprints from this file for buttons, cards, forms, and navigation.
4. When pairing with AI assistants (such as Antigravity), instruct:
   > *"Adopt the 3D Green FinTech design system specified in design.md for all UI styling, components, colors, and layouts."*
