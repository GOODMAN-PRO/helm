# Color, Atmosphere & Depth Playbook
## Apple / Stripe / Linear-grade sites — Tailwind + CSS

---

## 1. Dark Theme Systems Done Right

### The Core Principle: Luminance Hierarchy, Not Shadow

On dark surfaces, drop-shadows are invisible. The replacement is **luminance stepping** — each elevated layer is 3–6% lighter than the one beneath it. Users read depth through brightness, not shadow.

### Background Base

Never use `#000000`. Pure black creates harsh edges and feels cheap. The premium baseline is a near-black with a fractional blue or neutral tint:

```css
/* Base backgrounds — three options by feel */
--bg-base-neutral:  oklch(9% 0.005 240);   /* ~#0f0f10 — neutral near-black */
--bg-base-cool:     oklch(9% 0.010 255);   /* ~#0c0d14 — Linear-style cool dark */
--bg-base-warm:     oklch(9% 0.008 280);   /* ~#0d0c13 — purple-shifted warm dark */
```

In hex, these land around `#0c0d14` – `#101014`. The cool tint (`hue 250–260`) is the most common on premium SaaS because it reads as sophisticated, not murky.

### Layered Surfaces (Elevation System)

Four levels minimum. Each step adds ~4–6 lightness points in oklch:

| Level | Name | oklch | ~hex | Use |
|-------|------|-------|------|-----|
| 0 | `--surface-base` | `oklch(9% 0.010 255)` | `#0c0d14` | Page background |
| 1 | `--surface-raised` | `oklch(13% 0.010 255)` | `#161820` | Cards, sidebars, panels |
| 2 | `--surface-overlay` | `oklch(17% 0.010 255)` | `#1e2030` | Hover states, active rows, nested cards |
| 3 | `--surface-float` | `oklch(22% 0.008 255)` | `#282b3a` | Modals, dropdowns, tooltips |

```css
:root[data-theme="dark"] {
  --surface-base:    oklch(9%  0.010 255);
  --surface-raised:  oklch(13% 0.010 255);
  --surface-overlay: oklch(17% 0.010 255);
  --surface-float:   oklch(22% 0.008 255);
}
```

### Borders — Low-Opacity Whites

Borders on dark surfaces should be white at low alpha, not gray hex values. This way they adapt to any background tint automatically.

```css
--border-subtle:   rgba(255, 255, 255, 0.06);  /* nearly invisible — section dividers */
--border-default:  rgba(255, 255, 255, 0.10);  /* card outlines, input fields */
--border-strong:   rgba(255, 255, 255, 0.18);  /* active states, focused inputs */
--border-focus:    rgba(255, 255, 255, 0.30);  /* keyboard focus ring base */
```

On `--surface-raised` (`#161820`), `rgba(255,255,255,0.10)` renders at contrast ratio ~1.7:1 — just enough to define an edge without being visible as a color. That's the sweet spot.

### Text Colors — Primary / Secondary / Tertiary Ramp

```css
/* Dark theme text — never pure #fff, always off-white */
--text-primary:   oklch(95% 0.004 255);   /* ~#f0f1f5 — body copy, headings */
--text-secondary: oklch(70% 0.008 255);   /* ~#9ea3b8 — subtext, captions */
--text-tertiary:  oklch(48% 0.008 255);   /* ~#636880 — timestamps, metadata */
--text-disabled:  oklch(35% 0.006 255);   /* ~#454858 — inactive labels */
--text-inverse:   oklch(10% 0.006 255);   /* ~#0e0f16 — text on light sections */
```

Contrast check on `--surface-base` (`#0c0d14`):
- `--text-primary` (~`#f0f1f5`): ratio ~16:1 — AAA
- `--text-secondary` (~`#9ea3b8`): ratio ~6.5:1 — AA pass
- `--text-tertiary` (~`#636880`): ratio ~4.2:1 — fails AA for body, acceptable for UI labels/large text only

Rule: `--text-tertiary` is only safe at 18px+ or in non-critical UI chrome (timestamps, icon labels). Never use it for paragraph copy.

---

## 2. Light Theme Equivalents

The light palette inverts the logic: surfaces go light-to-slightly-darker as they elevate, and borders are low-opacity blacks.

```css
:root[data-theme="light"] {
  /* Backgrounds */
  --surface-base:    oklch(98% 0.003 255);   /* ~#f9f9fc — off-white page bg */
  --surface-raised:  oklch(100% 0 0);        /* #ffffff — cards */
  --surface-overlay: oklch(96% 0.004 255);   /* ~#f1f2f7 — hover rows */
  --surface-float:   oklch(100% 0 0);        /* #ffffff — modals w/ shadow */

  /* Borders */
  --border-subtle:   rgba(0, 0, 0, 0.04);
  --border-default:  rgba(0, 0, 0, 0.09);
  --border-strong:   rgba(0, 0, 0, 0.16);
  --border-focus:    rgba(0, 0, 0, 0.28);

  /* Text */
  --text-primary:   oklch(12% 0.010 255);   /* ~#131420 — near-black with tint */
  --text-secondary: oklch(40% 0.010 255);   /* ~#4a4f68 — comfortable gray */
  --text-tertiary:  oklch(58% 0.008 255);   /* ~#7e84a0 — light metadata */
  --text-disabled:  oklch(72% 0.006 255);   /* ~#acb0c5 */
}
```

Light mode key insight: the page background should NOT be pure white. `oklch(98% 0.003 255)` — a barely perceptible cool off-white — makes cards on white pop with natural separation. Pure `#fff` on `#fff` requires shadow work; this separation is free.

### Dark-to-Light Section Transitions on Scroll

Stripe, Linear, and Apple all do "dark hero → light features → dark footer" or vice versa. The technique:

```html
<!-- Alternating sections, no JS needed -->
<section class="section-dark">...</section>
<section class="section-light">...</section>
<section class="section-dark">...</section>
```

```css
.section-dark {
  background-color: var(--surface-base);   /* dark token */
  color: var(--text-primary);
}

.section-light {
  background-color: var(--surface-base-light);  /* light token */
  color: var(--text-primary-light);
}

/* The seam treatment — use a gradient bridge instead of a hard cut */
.section-light::before {
  content: '';
  display: block;
  height: 120px;
  margin-top: -120px;
  background: linear-gradient(
    to bottom,
    oklch(9% 0.010 255),    /* dark section end color */
    oklch(98% 0.003 255)    /* light section start color */
  );
  pointer-events: none;
}
```

Alternatively, a slight diagonal skew (used by Stripe) creates a more dramatic section break:
```css
.section-skewed {
  clip-path: polygon(0 4%, 100% 0%, 100% 96%, 0% 100%);
  margin: -3rem 0;
  padding: 6rem 0;
}
```

---

## 3. Accent Color — One Confident Choice

### The Rule of One

Pick ONE accent. Everything interactive — links, CTAs, focus rings, progress indicators, selected states — uses the same hue. This is the Linear/Vercel approach. Don't split attention with multiple brand colors in interactive UI.

### Selecting the Accent

The strongest choice for dark themes is a blue-to-violet range (`hue 230–270`). It reads as premium, technical, and accessible. Secondary options: a muted teal (`hue 185–195`) or a warm electric blue (`hue 215–220`).

```css
/* Accent system — adjust the hue variable to rebrand */
--accent-hue: 250;          /* 250 = blue-violet — premium SaaS default */
--accent-chroma: 0.18;      /* 0.18 = vivid but not neon */

--accent:         oklch(62% var(--accent-chroma) var(--accent-hue));  /* primary CTA */
--accent-light:   oklch(72% var(--accent-chroma) var(--accent-hue));  /* hover state */
--accent-dim:     oklch(55% var(--accent-chroma) var(--accent-hue));  /* pressed state */
--accent-muted:   oklch(62% 0.06 var(--accent-hue));                  /* subtle tints */
--accent-ghost:   oklch(62% 0.03 var(--accent-hue));                  /* bg tint */
```

For the `#0c0d14` dark base, `oklch(62% 0.18 250)` lands around `#5B6EF5` — a confident indigo that clears WCAG AA at 4.5:1 against dark text.

### How Much Accent

- Accent **on backgrounds**: 0–2% of the viewport area. If you see accent color when you blur your eyes, it's too much.
- Primary buttons: full accent fill
- Links: accent color, no underline by default
- Focus rings: accent at 40% opacity, 2px offset
- Active nav item: accent-colored left border or dot, not full fill
- Decorative: accent in one gradient stop only

### Glow Treatment

The glow effect that makes accent elements pop on dark themes:

```css
/* Button glow — the Vercel / Linear pattern */
.btn-primary {
  background: var(--accent);
  color: oklch(98% 0.002 255);
  border: 1px solid oklch(70% 0.16 var(--accent-hue));

  /* Glow: same hue, spread 0, blur 20px, 40% alpha */
  box-shadow:
    0 0 0 1px oklch(62% 0.18 250 / 0.15),   /* inner ring */
    0 2px 8px oklch(62% 0.18 250 / 0.30),   /* near glow */
    0 8px 32px oklch(62% 0.18 250 / 0.20);  /* far diffuse */
}

.btn-primary:hover {
  box-shadow:
    0 0 0 1px oklch(72% 0.18 250 / 0.20),
    0 2px 8px oklch(72% 0.18 250 / 0.40),
    0 12px 40px oklch(72% 0.18 250 / 0.28);
  transform: translateY(-1px);
}
```

### Gradient Accents

A single-axis gradient on the accent (rather than multicolor) stays cohesive:

```css
/* Accent gradient — same hue, shifted lightness + chroma */
--gradient-accent: linear-gradient(
  135deg,
  oklch(58% 0.22 255),   /* deeper blue */
  oklch(68% 0.16 240)    /* lighter periwinkle */
);

/* Text gradient for hero display copy */
.gradient-text {
  background: var(--gradient-accent);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

---

## 4. Atmosphere Techniques

### 4a. Radial Glow Behind Hero Text

The "spotlight on nothing" effect used by Linear, Vercel, and Resend:

```css
.hero {
  position: relative;
  overflow: hidden;
}

/* Single glow orb, centered above the heading */
.hero::before {
  content: '';
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    oklch(62% 0.18 250 / 0.18) 0%,
    oklch(62% 0.14 250 / 0.08) 40%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
  filter: blur(1px);  /* optional soft edge */
}
```

For dual-tone glows (the multicolor version seen on Stripe/Vercel):

```css
.hero::before {
  background:
    radial-gradient(ellipse 600px 400px at 30% 0%, oklch(62% 0.18 250 / 0.20), transparent 70%),
    radial-gradient(ellipse 500px 350px at 70% 0%, oklch(65% 0.14 310 / 0.14), transparent 70%);
}
```

### 4b. Noise / Grain Overlay

Grain adds tactility and prevents banding in gradients. The SVG filter method is zero file-size and GPU-composited:

```html
<!-- Place once in the document, hidden -->
<svg width="0" height="0" aria-hidden="true" style="position:fixed">
  <filter id="grain" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.65"
      numOctaves="4"
      stitchTiles="stitch"
    />
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</svg>
```

```css
/* Apply as a pseudo-element so it doesn't affect children */
.grain-overlay::after {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.035;           /* 3–5% — barely visible, felt not seen */
  pointer-events: none;
  z-index: 999;
  width: 100%;
  height: 100%;
  background: transparent;
  filter: url(#grain);
  /* Alternative: use a base64 PNG noise tile */
  /* background-image: url('data:image/png;base64,...'); */
}
```

Opacity sweet spots:
- `0.03–0.05` on dark backgrounds: subtle texture
- `0.06–0.09` on gradient hero sections: intentional grit (Stripe's approach)
- Never exceed `0.12` — it reads as a rendering artifact, not design

### 4c. Animated Gradient Mesh (CSS-Only, Performant)

The "aurora" ambient effect. Key: slow animation (12–18s), subtle chroma, 4–5 radial layers max.

```css
.mesh-bg {
  background-color: var(--surface-base);
  background-image:
    radial-gradient(ellipse 700px 600px at 10% 20%,  oklch(55% 0.12 250 / 0.40), transparent 70%),
    radial-gradient(ellipse 500px 700px at 90% 80%,  oklch(60% 0.10 290 / 0.30), transparent 70%),
    radial-gradient(ellipse 600px 400px at 50% 50%,  oklch(50% 0.08 220 / 0.20), transparent 70%),
    radial-gradient(ellipse 300px 300px at 80% 10%,  oklch(65% 0.06 270 / 0.18), transparent 60%);
  background-size: 200% 200%;
  animation: mesh-drift 18s ease-in-out infinite alternate;
}

@keyframes mesh-drift {
  0%   { background-position: 0% 0%, 100% 100%, 50% 50%, 80% 10%; }
  33%  { background-position: 30% 20%, 70% 80%, 60% 40%, 90% 30%; }
  66%  { background-position: 10% 40%, 90% 60%, 40% 60%, 70% 20%; }
  100% { background-position: 40% 10%, 60% 90%, 70% 30%, 85% 15%; }
}
```

Performance: `background-position` animation is cheaper than `background-size`. Use `will-change: background-position` only if there's visible jank, and remove it after. For large viewports, consider the CSS `@property` approach for smoother interpolation:

```css
@property --mesh-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}

/* Now --mesh-x is directly animatable as a typed value */
```

### 4d. Vignette

A vignette darkens the edges without touching content, drawing the eye inward:

```css
.vignette-container {
  position: relative;
}

.vignette-container::after {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(
    ellipse 120% 100% at center,
    transparent 50%,
    oklch(5% 0.010 255 / 0.60) 100%
  );
  pointer-events: none;
  z-index: 9;
}
```

For a section-scoped vignette (horizontal edges only):

```css
.section::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, oklch(9% 0.010 255 / 0.70) 0%, transparent 15%),
    linear-gradient(to left,  oklch(9% 0.010 255 / 0.70) 0%, transparent 15%);
  pointer-events: none;
}
```

### 4e. Depth via Layered Blur (Glassmorphism Done Right)

The premium version: restrained, functional, not a trend showcase.

```css
.glass-card {
  background: oklch(17% 0.010 255 / 0.70);  /* surface-overlay at 70% opacity */
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--border-default);  /* rgba(255,255,255,0.10) */
  border-radius: 12px;

  /* Subtle top-edge highlight — mimics light hitting glass rim */
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.08) inset,  /* top rim */
    0 0 0 1px var(--border-subtle),              /* outer border */
    0 8px 32px oklch(5% 0.010 255 / 0.40);       /* depth shadow */
}
```

Rules for glass:
- Only use on elements sitting OVER a textured or gradient background — glass with nothing behind it is just transparency
- Max 3–4 glass surfaces per viewport — GPU cost stacks
- `blur(12–24px)` is the sweet spot; below 12 looks cheap, above 24 starts to pixelate on mobile
- Always pair with a `border: 1px solid rgba(255,255,255,0.10)` — defines the physical edge

---

## 5. Contrast & Accessibility

### WCAG AA Minimums — Non-Negotiable

| Text Type | Min Ratio | When |
|-----------|-----------|------|
| Normal text (< 18px regular or < 14px bold) | 4.5:1 | Always |
| Large text (≥ 18px regular or ≥ 14px bold) | 3:1 | Always |
| UI components, icons, input borders | 3:1 | Interactive states |

### Keeping Moodiness Without Failing

The trick: use relative opacity on opaque backgrounds, not absolute opacity. Measure the RENDERED color, not the CSS value.

```
--text-secondary: oklch(70% 0.008 255)  (~#9ea3b8)
on --surface-base: oklch(9% 0.010 255) (~#0c0d14)

Contrast ratio: ~6.4:1  ← PASSES AA for body text
```

vs. the dangerous pattern:

```css
/* WRONG — this probably fails */
.text-secondary { color: rgba(255, 255, 255, 0.45); }
/* On #0c0d14 that renders to ~#5d607a — ratio ~4.1:1 — FAILS */
```

Always verify secondary colors with an absolute hex value first, then optionally re-express as rgba if you need it to adapt.

### Secondary Text Formula

For any dark background, the minimum safe secondary text lightness in oklch is approximately:

`oklch(65% + [base-lightness] * 0.5, low-chroma, hue)` — but always verify with a contrast checker.

Quick reference pairs that pass AA:

| Background | Secondary Text | Ratio |
|------------|----------------|-------|
| `#0c0d14` | `#8b90a8` (`oklch(60% 0.01 255)`) | 4.6:1 |
| `#161820` | `#9095ad` (`oklch(63% 0.01 255)`) | 4.5:1 |
| `#1e2030` | `#9ba0b8` (`oklch(67% 0.01 255)`) | 4.5:1 |

---

## 6. Tasteful Gradients

### What Makes Gradients Look Cheap

- More than 2 distinct hues in one gradient
- Full-saturation colors (`oklch(60% 0.30 ...)`)
- Hard stops or visible banding
- Identical gradients on every element
- Gradients that fight the surrounding palette

### The Premium Formula

```
1. Stay within one hue family, or adjacent hues (max 30° apart)
2. Keep chroma ≤ 0.18 — vivid enough to read, not neon
3. Use 3–4 stops when needed — but let the middle stops carry the weight
4. Prefer 135° or 150° angles for dynamism; 180° (top-bottom) for atmospheric depth
5. Lighten or darken across the gradient, don't hue-shift wildly
```

### Production-Ready Gradient Examples

```css
/* ① Hero background — deep cool dark to slightly lighter, barely perceptible */
--grad-hero-bg: linear-gradient(
  180deg,
  oklch(7%  0.012 255) 0%,
  oklch(11% 0.010 255) 100%
);

/* ② Accent gradient — button, badge, highlight text */
--grad-accent: linear-gradient(
  135deg,
  oklch(58% 0.22 255) 0%,    /* deeper indigo */
  oklch(67% 0.16 235) 100%   /* periwinkle blue */
);

/* ③ Hero text gradient — the "iridescent shimmer" */
--grad-display: linear-gradient(
  120deg,
  oklch(92% 0.005 255) 0%,    /* near-white */
  oklch(80% 0.008 220) 40%,   /* slight blue tint */
  oklch(85% 0.006 270) 70%,   /* faint violet */
  oklch(92% 0.004 255) 100%   /* back to white */
);

/* ④ Subtle card border gradient — the "shimmer border" technique */
.card-shimmer-border {
  background:
    linear-gradient(var(--surface-raised), var(--surface-raised)) padding-box,
    linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04), rgba(255,255,255,0.10)) border-box;
  border: 1px solid transparent;
}

/* ⑤ Section gradient separator */
--grad-section-fade: linear-gradient(
  to bottom,
  var(--surface-base) 0%,
  oklch(11% 0.010 255 / 0) 100%   /* fade to transparent */
);
```

### Blend Modes for Gradient Depth

```css
/* A color-dodge gradient over a dark surface creates a "light leak" effect */
.light-leak {
  background: linear-gradient(
    135deg,
    oklch(60% 0.18 250 / 0.15) 0%,
    transparent 50%
  );
  mix-blend-mode: color-dodge;  /* amplifies against the surface below */
}

/* Screen blend mode for layered glow orbs */
.glow-orb {
  background: radial-gradient(circle, oklch(65% 0.20 255 / 0.80), transparent 70%);
  mix-blend-mode: screen;
  pointer-events: none;
}
```

---

## 7. Encoding as CSS Variables + Tailwind v4 Tokens

### Full Semantic Token System

```css
/* ============================================
   HELM — Semantic Color Token System
   Tailwind v4 compatible
   ============================================ */

/* --- Dark theme (default) --- */
:root,
:root[data-theme="dark"] {
  /* Hue axis — change ONE value to rebrand */
  --hue:            250;
  --chroma-base:    0.010;
  --chroma-accent:  0.18;

  /* Surfaces */
  --surface-base:    oklch(9%  0.010 var(--hue));
  --surface-raised:  oklch(13% 0.010 var(--hue));
  --surface-overlay: oklch(17% 0.010 var(--hue));
  --surface-float:   oklch(22% 0.008 var(--hue));
  --surface-sunken:  oklch(6%  0.012 var(--hue));

  /* Borders */
  --border-subtle:   rgba(255, 255, 255, 0.06);
  --border-default:  rgba(255, 255, 255, 0.10);
  --border-strong:   rgba(255, 255, 255, 0.18);
  --border-focus:    rgba(255, 255, 255, 0.30);

  /* Text */
  --text-primary:    oklch(95% 0.004 var(--hue));
  --text-secondary:  oklch(70% 0.008 var(--hue));
  --text-tertiary:   oklch(50% 0.008 var(--hue));
  --text-disabled:   oklch(36% 0.006 var(--hue));
  --text-inverse:    oklch(10% 0.008 var(--hue));
  --text-on-accent:  oklch(98% 0.002 var(--hue));

  /* Accent */
  --accent:          oklch(62% var(--chroma-accent) var(--hue));
  --accent-hover:    oklch(70% var(--chroma-accent) var(--hue));
  --accent-pressed:  oklch(55% var(--chroma-accent) var(--hue));
  --accent-muted:    oklch(62% 0.06 var(--hue));
  --accent-ghost:    oklch(62% 0.03 var(--hue));
  --accent-border:   oklch(62% var(--chroma-accent) var(--hue) / 0.30);
  --accent-glow:     oklch(62% var(--chroma-accent) var(--hue) / 0.25);

  /* State colors */
  --success:         oklch(68% 0.14 150);
  --warning:         oklch(78% 0.16 70);
  --error:           oklch(62% 0.20 22);
  --info:            oklch(66% 0.16 230);

  /* Atmosphere */
  --hero-glow:       oklch(55% 0.15 var(--hue) / 0.20);
  --vignette-color:  oklch(5%  0.010 var(--hue));
}

/* --- Light theme --- */
:root[data-theme="light"] {
  /* Surfaces */
  --surface-base:    oklch(98% 0.003 var(--hue));
  --surface-raised:  oklch(100% 0 0);
  --surface-overlay: oklch(96% 0.004 var(--hue));
  --surface-float:   oklch(100% 0 0);
  --surface-sunken:  oklch(94% 0.005 var(--hue));

  /* Borders */
  --border-subtle:   rgba(0, 0, 0, 0.04);
  --border-default:  rgba(0, 0, 0, 0.09);
  --border-strong:   rgba(0, 0, 0, 0.16);
  --border-focus:    rgba(0, 0, 0, 0.28);

  /* Text */
  --text-primary:    oklch(12% 0.010 var(--hue));
  --text-secondary:  oklch(40% 0.010 var(--hue));
  --text-tertiary:   oklch(58% 0.008 var(--hue));
  --text-disabled:   oklch(72% 0.006 var(--hue));
  --text-inverse:    oklch(96% 0.003 var(--hue));
  --text-on-accent:  oklch(99% 0.001 0);

  /* Accent (lighter for dark-on-accent legibility in light mode) */
  --accent:          oklch(52% var(--chroma-accent) var(--hue));
  --accent-hover:    oklch(45% var(--chroma-accent) var(--hue));
  --accent-pressed:  oklch(40% var(--chroma-accent) var(--hue));
  --accent-muted:    oklch(52% 0.06 var(--hue));
  --accent-ghost:    oklch(52% 0.025 var(--hue));
  --accent-border:   oklch(52% var(--chroma-accent) var(--hue) / 0.25);
  --accent-glow:     oklch(52% var(--chroma-accent) var(--hue) / 0.18);

  /* Atmosphere */
  --hero-glow:       oklch(52% 0.12 var(--hue) / 0.12);
  --vignette-color:  oklch(92% 0.004 var(--hue));
}
```

### Tailwind v4 @theme Registration

```css
@theme {
  /* Map semantic tokens to Tailwind utility classes */
  --color-surface-base:    var(--surface-base);
  --color-surface-raised:  var(--surface-raised);
  --color-surface-overlay: var(--surface-overlay);
  --color-surface-float:   var(--surface-float);
  --color-surface-sunken:  var(--surface-sunken);

  --color-border-subtle:   var(--border-subtle);
  --color-border-default:  var(--border-default);
  --color-border-strong:   var(--border-strong);
  --color-border-focus:    var(--border-focus);

  --color-text-primary:    var(--text-primary);
  --color-text-secondary:  var(--text-secondary);
  --color-text-tertiary:   var(--text-tertiary);
  --color-text-disabled:   var(--text-disabled);
  --color-text-inverse:    var(--text-inverse);
  --color-text-on-accent:  var(--text-on-accent);

  --color-accent:          var(--accent);
  --color-accent-hover:    var(--accent-hover);
  --color-accent-pressed:  var(--accent-pressed);
  --color-accent-muted:    var(--accent-muted);
  --color-accent-ghost:    var(--accent-ghost);

  --color-success:         var(--success);
  --color-warning:         var(--warning);
  --color-error:           var(--error);
  --color-info:            var(--info);
}
```

This generates utility classes: `bg-surface-raised`, `text-text-secondary`, `border-border-default`, `bg-accent`, etc.

---

## Rules for Our Builder

### Semantic Color Token Set (copy into globals.css)

```css
/* ================================================================
   HELM BUILDER — Production Color System
   Drop this at the top of globals.css before @theme
   ================================================================ */

:root,
:root[data-theme="dark"] {
  --hue: 250;

  /* Surfaces — 5 levels, luminance hierarchy */
  --surface-base:     oklch(9%  0.010 250);    /* #0c0d14 */
  --surface-raised:   oklch(13% 0.010 250);    /* #161820 */
  --surface-overlay:  oklch(17% 0.010 250);    /* #1e2030 */
  --surface-float:    oklch(22% 0.008 250);    /* #282b3a */
  --surface-sunken:   oklch(6%  0.012 250);    /* #090a10 */

  /* Borders — white alpha only */
  --border-subtle:    rgba(255,255,255,0.06);
  --border-default:   rgba(255,255,255,0.10);
  --border-strong:    rgba(255,255,255,0.18);
  --border-focus:     rgba(255,255,255,0.30);

  /* Text — absolute oklch, always verify contrast */
  --text-primary:     oklch(95% 0.004 250);    /* #f0f1f5 — 16:1 on base */
  --text-secondary:   oklch(70% 0.008 250);    /* #9ea3b8 — 6.5:1 on base */
  --text-tertiary:    oklch(50% 0.008 250);    /* #656a80 — use at 18px+ only */
  --text-disabled:    oklch(36% 0.006 250);    /* #454858 */
  --text-on-accent:   oklch(98% 0.002 250);

  /* Accent — single hue, three weights */
  --accent:           oklch(62% 0.18 250);     /* #5B6EF5 — primary action */
  --accent-hover:     oklch(70% 0.18 250);     /* #7182f7 */
  --accent-pressed:   oklch(55% 0.18 250);     /* #4d5fe0 */
  --accent-muted:     oklch(62% 0.06 250);
  --accent-ghost:     oklch(62% 0.03 250);
  --accent-glow:      oklch(62% 0.18 250 / 0.25);

  /* State */
  --success:          oklch(68% 0.14 150);
  --warning:          oklch(78% 0.16 70);
  --error:            oklch(62% 0.20 22);

  /* Atmosphere */
  --hero-glow-color:  oklch(55% 0.15 250 / 0.20);
  --gradient-accent:  linear-gradient(135deg, oklch(58% 0.22 255), oklch(68% 0.16 235));
  --gradient-display: linear-gradient(120deg, oklch(92% 0.005 255) 0%, oklch(80% 0.008 220) 40%, oklch(85% 0.006 270) 70%, oklch(92% 0.004 255) 100%);
}

:root[data-theme="light"] {
  --surface-base:     oklch(98% 0.003 250);    /* #f9f9fc */
  --surface-raised:   oklch(100% 0 0);         /* #ffffff */
  --surface-overlay:  oklch(96% 0.004 250);    /* #f1f2f7 */
  --surface-float:    oklch(100% 0 0);
  --surface-sunken:   oklch(94% 0.005 250);

  --border-subtle:    rgba(0,0,0,0.04);
  --border-default:   rgba(0,0,0,0.09);
  --border-strong:    rgba(0,0,0,0.16);
  --border-focus:     rgba(0,0,0,0.28);

  --text-primary:     oklch(12% 0.010 250);    /* #131420 */
  --text-secondary:   oklch(40% 0.010 250);    /* #4a4f68 */
  --text-tertiary:    oklch(58% 0.008 250);    /* #7e84a0 */
  --text-disabled:    oklch(72% 0.006 250);
  --text-on-accent:   oklch(99% 0.001 0);

  --accent:           oklch(52% 0.18 250);
  --accent-hover:     oklch(45% 0.18 250);
  --accent-pressed:   oklch(40% 0.18 250);
  --accent-muted:     oklch(52% 0.06 250);
  --accent-ghost:     oklch(52% 0.025 250);
  --accent-glow:      oklch(52% 0.18 250 / 0.18);

  --success:          oklch(50% 0.16 150);
  --warning:          oklch(52% 0.18 70);
  --error:            oklch(50% 0.22 22);

  --hero-glow-color:  oklch(52% 0.12 250 / 0.12);
  --gradient-accent:  linear-gradient(135deg, oklch(48% 0.22 255), oklch(58% 0.16 235));
  --gradient-display: linear-gradient(120deg, oklch(15% 0.012 255) 0%, oklch(25% 0.010 220) 40%, oklch(20% 0.008 270) 70%, oklch(15% 0.010 255) 100%);
}

/* ==== Tailwind v4 registration ==== */
@theme {
  --color-surface-base:    var(--surface-base);
  --color-surface-raised:  var(--surface-raised);
  --color-surface-overlay: var(--surface-overlay);
  --color-surface-float:   var(--surface-float);
  --color-surface-sunken:  var(--surface-sunken);

  --color-border-subtle:   var(--border-subtle);
  --color-border-default:  var(--border-default);
  --color-border-strong:   var(--border-strong);
  --color-border-focus:    var(--border-focus);

  --color-text-primary:    var(--text-primary);
  --color-text-secondary:  var(--text-secondary);
  --color-text-tertiary:   var(--text-tertiary);
  --color-text-disabled:   var(--text-disabled);
  --color-text-on-accent:  var(--text-on-accent);

  --color-accent:          var(--accent);
  --color-accent-hover:    var(--accent-hover);
  --color-accent-pressed:  var(--accent-pressed);
  --color-accent-muted:    var(--accent-muted);
  --color-accent-ghost:    var(--accent-ghost);

  --color-success:         var(--success);
  --color-warning:         var(--warning);
  --color-error:           var(--error);
}
```

### Glow Recipes (copy-paste)

```css
/* Primary CTA button glow */
.btn-accent {
  background: var(--accent);
  color: var(--text-on-accent);
  border: 1px solid oklch(70% 0.16 250);
  box-shadow:
    0 0 0 1px oklch(62% 0.18 250 / 0.15),
    0 2px 8px  oklch(62% 0.18 250 / 0.30),
    0 8px 32px oklch(62% 0.18 250 / 0.20);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.btn-accent:hover {
  box-shadow:
    0 0 0 1px oklch(72% 0.18 250 / 0.20),
    0 2px 8px  oklch(72% 0.18 250 / 0.40),
    0 12px 40px oklch(72% 0.18 250 / 0.28);
  transform: translateY(-1px);
}

/* Hero radial glow behind heading */
.hero-glow {
  position: relative;
}
.hero-glow::before {
  content: '';
  position: absolute;
  top: -25%;
  left: 50%;
  transform: translateX(-50%);
  width: min(800px, 100vw);
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--hero-glow-color) 0%, transparent 68%);
  pointer-events: none;
  z-index: 0;
}

/* Shimmer card border */
.card-shimmer {
  background:
    linear-gradient(var(--surface-raised), var(--surface-raised)) padding-box,
    linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03), rgba(255,255,255,0.10)) border-box;
  border: 1px solid transparent;
}

/* Glass surface */
.glass {
  background: oklch(17% 0.010 250 / 0.70);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid var(--border-default);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.08) inset,
    0 8px 32px oklch(5% 0.010 250 / 0.40);
}

/* Ambient mesh background */
.mesh-ambient {
  background-color: var(--surface-base);
  background-image:
    radial-gradient(ellipse 700px 600px at 10% 20%, oklch(55% 0.12 250 / 0.35), transparent 70%),
    radial-gradient(ellipse 500px 700px at 90% 80%, oklch(60% 0.10 285 / 0.25), transparent 70%),
    radial-gradient(ellipse 400px 400px at 50% 50%, oklch(50% 0.08 220 / 0.18), transparent 70%);
  background-size: 200% 200%;
  animation: mesh-drift 18s ease-in-out infinite alternate;
}
@keyframes mesh-drift {
  0%   { background-position: 0% 0%, 100% 100%, 50% 50%; }
  50%  { background-position: 30% 25%, 70% 75%, 60% 40%; }
  100% { background-position: 15% 40%, 85% 60%, 70% 30%; }
}

/* SVG grain overlay — add <svg id="grain-filter"> to document */
.grain::after {
  content: '';
  position: fixed;
  inset: 0;
  opacity: 0.04;
  pointer-events: none;
  z-index: 999;
  filter: url(#grain-filter);
  /* grain SVG filter must be present in DOM — see section 4b */
}

/* Vignette */
.vignette::after {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse 110% 90% at 50% 50%, transparent 55%, oklch(5% 0.010 250 / 0.55) 100%);
  pointer-events: none;
  z-index: 9;
}
```

### Rebranding Checklist

To change the entire palette to a different accent hue, change ONE line:
```css
--hue: 250;  /* 250=indigo, 220=blue, 175=teal, 290=purple, 340=rose */
```

Chroma above 0.20 = vivid/neon. Chroma 0.10–0.18 = premium. Chroma below 0.08 = near-neutral.
