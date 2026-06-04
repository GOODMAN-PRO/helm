# Texture, Depth & Craft Micro-Details

Research into the micro-level decisions that separate expensive-feeling sites from flat AI output. Every recipe here is copy-paste ready.

---

## 1. Grain / Noise Overlay

Grain is the single fastest way to make a flat design feel physical. It takes a digital surface and adds the tactile irregularity of paper, film, or brushed metal.

### How it works

SVG `feTurbulence` generates fractal noise in the browser — no image download, no network hit. The SVG is inlined (zero bytes over the wire) and composited as a fixed overlay. GPU handles it in one pass.

### Parameters that matter

- `baseFrequency`: lower = coarser grain (0.55–0.70 for visible film grain; 0.90–1.00 for fine noise)
- `numOctaves`: 3–4 is the sweet spot; above 4 = CPU cost with no visible gain
- `stitchTiles="stitch"`: critical — prevents visible seams when the SVG tiles
- `type="fractalNoise"`: soft, organic. `type="turbulence"` is harsher / more cloudy
- Opacity: 0.04–0.08 on light surfaces; 0.06–0.12 on dark surfaces
- Blend mode: `soft-light` adds contrast variation; `overlay` is stronger; `multiply` on light backgrounds only

### Recipe — SVG inline grain overlay

```html
<!-- Place once in <body>, hidden -->
<svg
  aria-hidden="true"
  style="position:fixed;width:0;height:0;overflow:hidden"
>
  <filter
    id="grain"
    x="0%" y="0%"
    width="100%" height="100%"
    color-interpolation-filters="sRGB"
  >
    <feTurbulence
      type="fractalNoise"
      baseFrequency="0.65"
      numOctaves="4"
      stitchTiles="stitch"
      result="noise"
    />
    <feColorMatrix
      type="saturate"
      values="0"
      in="noise"
      result="monoNoise"
    />
    <feBlend
      in="SourceGraphic"
      in2="monoNoise"
      mode="soft-light"
      result="blended"
    />
    <feComposite
      in="blended"
      in2="SourceGraphic"
      operator="in"
    />
  </filter>
</svg>
```

```css
/* Full-viewport overlay — applied via a pseudo-element */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* encode the SVG directly — no HTTP request */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 200px 200px;   /* tile size — smaller = denser grain */
  opacity: 0.08;
  mix-blend-mode: soft-light;
  z-index: 9999;
  will-change: transform;         /* GPU layer hint */
}
```

Alternatively — for animated grain (cinematic film effect):

```css
@keyframes grain-shift {
  0%, 100% { transform: translate(0, 0); }
  10%       { transform: translate(-2%, -3%); }
  30%       { transform: translate(3%, 2%); }
  50%       { transform: translate(-1%, 4%); }
  70%       { transform: translate(2%, -1%); }
  90%       { transform: translate(-3%, 2%); }
}

body::after {
  /* same as above, plus: */
  animation: grain-shift 0.8s steps(1) infinite;
  opacity: 0.05;  /* lower opacity when animated — it's more visible in motion */
}
```

### What not to do

- Don't use opacity > 0.15 — it reads as a dirty screen, not film grain
- Don't skip `stitchTiles` — the tiling seam is visible at any opacity
- Don't use `type="turbulence"` for overlays — it produces smears, not grain
- Don't use a raster PNG grain if you can avoid it — 40–80KB for something SVG does in ~300 bytes

---

## 2. Tasteful Gradients & Meshes

### What makes a gradient look cheap

- Two fully saturated colors with default RGB interpolation → muddy gray dead zone in the middle
- Direction: diagonal top-left to bottom-right screams "beginner"
- Same gradient used on backgrounds, buttons, headings, and cards
- Pure `#000000` or `#ffffff` as a gradient stop (too harsh)

### What makes a gradient look expensive

- OKLCH interpolation (browser-native, perceptually uniform, no gray zone)
- Low saturation — desaturated colors read as intentional, not accidental
- Multi-stop shaping: add a midpoint stop to sculpt the curve
- Slow motion — if animated, 8–30s, ease in/out
- Used sparingly — one hero gradient, not every surface

### Recipe — expensive dark gradient (OKLCH)

```css
/* OKLCH: L=lightness 0–1, C=chroma (saturation), H=hue degrees */
/* These are deep navy-to-near-black with a warm undertone */
.hero-gradient {
  background: linear-gradient(
    160deg in oklch,
    oklch(0.18 0.04 255),   /* deep cool blue-black */
    oklch(0.12 0.02 285),   /* midpoint: slightly purple-shifted */
    oklch(0.09 0.01 30)     /* near-black with very faint warm tone */
  );
}
```

```css
/* Mesh gradient — 4 radial blobs composited with mix-blend-mode */
/* Looks like a Figma mesh gradient without any JS */
.mesh {
  position: relative;
  background: #0a0a0f;  /* base */
  overflow: hidden;
}

.mesh::before,
.mesh::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.45;
}

.mesh::before {
  width: 600px;
  height: 600px;
  top: -200px;
  left: -100px;
  background: oklch(0.35 0.08 265);  /* muted blue-purple */
}

.mesh::after {
  width: 500px;
  height: 500px;
  bottom: -150px;
  right: -100px;
  background: oklch(0.30 0.06 40);   /* muted amber */
}

/* Additional blob via JS-inserted span or a third pseudo on a child */
.mesh-accent {
  position: absolute;
  width: 400px;
  height: 400px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: oklch(0.25 0.05 185);  /* deep teal */
  filter: blur(100px);
  opacity: 0.3;
  pointer-events: none;
}
```

```css
/* Slow ambient animation — barely perceptible, but alive */
@keyframes blob-drift {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(30px, -20px) scale(1.05); }
  66%  { transform: translate(-20px, 15px) scale(0.97); }
  100% { transform: translate(0, 0) scale(1); }
}

.mesh::before {
  animation: blob-drift 20s ease-in-out infinite;
}
.mesh::after {
  animation: blob-drift 25s ease-in-out infinite reverse;
}
```

### Gradients to always avoid

```css
/* Cheap — RGB interpolation, saturated ends, diagonal */
background: linear-gradient(135deg, #ff6b6b, #4ecdc4);

/* Cheap — pure black endpoint, no midpoint sculpting */
background: linear-gradient(to bottom, #1a1a2e, #000000);

/* Cheap — too many vivid colors, looks like a pride flag */
background: linear-gradient(to right, red, orange, yellow, green, blue);
```

---

## 3. Depth: Shadows, Inner Highlights & Glows

### The 1px top highlight trick

Dark surfaces feel elevated when they catch a light source from above. One pixel of `rgba(255,255,255,N)` on the top edge simulates this. This is the single most used trick on premium dark UIs (Linear, Vercel, Stripe).

```css
/* The canonical 1px top-edge highlight */
.elevated-card {
  /* Use box-shadow to avoid affecting layout */
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06),      /* overall subtle border */
    inset 0 1px 0 0 rgba(255, 255, 255, 0.10), /* top inner highlight */
    0 4px 16px rgba(0, 0, 0, 0.4),             /* drop shadow */
    0 1px 4px rgba(0, 0, 0, 0.25);             /* tight ambient shadow */
}
```

Tuning for elevation levels:

```css
/* Level 1 — barely lifted (chips, tags) */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.08),
  0 2px 8px rgba(0,0,0,0.30);

/* Level 2 — card (default) */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.10),
  0 4px 16px rgba(0,0,0,0.40),
  0 1px 4px rgba(0,0,0,0.25);

/* Level 3 — modal / dropdown (highest) */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.12),
  0 8px 40px rgba(0,0,0,0.60),
  0 2px 8px rgba(0,0,0,0.35),
  0 0 0 1px rgba(255,255,255,0.06);
```

### Layered blur / depth-of-field effect

```css
/* Background elements feel distant — stagger blur with z-index */
.depth-far    { filter: blur(2px);  opacity: 0.4; z-index: 0; }
.depth-mid    { filter: blur(0.5px); opacity: 0.7; z-index: 1; }
.depth-near   { filter: none;        opacity: 1;   z-index: 2; }
```

### Glows — used sparingly

```css
/* Correct: tight, colored, low opacity — accent color only */
.glow-accent {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.25);  /* indigo */
}

/* On hover only — never always-on unless it's a CTA */
.btn-primary:hover {
  box-shadow: 0 0 32px rgba(99, 102, 241, 0.35);
  transition: box-shadow 0.3s ease;
}

/* Text glow — only for hero numerals or key display type */
.display-number {
  text-shadow: 0 0 40px rgba(99, 102, 241, 0.4);
}

/* What to avoid: wide, white, always-on */
/* box-shadow: 0 0 80px rgba(255,255,255,0.5);  <-- never */
```

---

## 4. Custom Details That Signal Craft

### Animated underline (draw-in on hover)

```css
/* Technique: background-size scales from 0 to 100% */
.link-draw {
  text-decoration: none;
  background-image: linear-gradient(
    currentColor, currentColor
  );
  background-size: 0% 1px;
  background-repeat: no-repeat;
  background-position: left bottom;
  transition: background-size 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.link-draw:hover,
.link-draw:focus-visible {
  background-size: 100% 1px;
}
```

Variant — underline retracts right-to-left on mouseout (more premium):

```css
.link-retract {
  text-decoration: none;
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 100% 1px;
  background-repeat: no-repeat;
  background-position: right bottom;
  transition: background-size 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.link-retract:hover {
  background-position: left bottom;
  background-size: 0% 1px;
}

/* Combined: draw in from left, retract from left on hover out */
.link-bidirectional {
  background-image:
    linear-gradient(currentColor, currentColor),
    linear-gradient(currentColor, currentColor);
  background-size: 0 1px, 100% 1px;
  background-position: left bottom, right bottom;
  background-repeat: no-repeat;
  transition: background-size 0.4s ease;
}
.link-bidirectional:hover {
  background-size: 100% 1px, 0 1px;
}
```

### Custom list markers

```css
ul.craft-list {
  list-style: none;
  padding: 0;
}

ul.craft-list li {
  position: relative;
  padding-left: 1.5em;
}

/* Em dash — editorial, not a bullet */
ul.craft-list li::before {
  content: "—";
  position: absolute;
  left: 0;
  color: rgba(255, 255, 255, 0.25);
  font-feature-settings: "ss01";
}

/* Or: small square for technical contexts */
ul.craft-list.tech li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.4;
}
```

### Monospace eyebrow / section label

```css
/* The detail that immediately reads as intentional */
.eyebrow {
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
  font-size: 0.6875rem;   /* 11px */
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.40);
  font-weight: 500;
}

/* Bracket accent variant */
.eyebrow-bracket::before { content: "[ "; opacity: 0.5; }
.eyebrow-bracket::after  { content: " ]"; opacity: 0.5; }

/* Numbered section counter — 01 / 02 */
.section-counter {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.20);
}

/* CSS counter auto-increment */
.sections-wrapper { counter-reset: section; }

.sections-wrapper section::before {
  counter-increment: section;
  content: counter(section, decimal-leading-zero);
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.25);
  display: block;
  margin-bottom: 0.5em;
}
```

### Number ticker animation (CSS-only)

```css
/* Requires @property for interpolation — Chrome 111+, Firefox 113+, Safari 16.2+ */
@property --num {
  syntax: "<integer>";
  inherits: false;
  initial-value: 0;
}

@keyframes count-up {
  from { --num: 0; }
  to   { --num: var(--target); }
}

.ticker {
  --target: 1247;
  animation: count-up 2s cubic-bezier(0.22, 1, 0.36, 1) both;
  counter-reset: num var(--num);
}

.ticker::after {
  content: counter(num);
}
```

### Custom focus ring

```css
/* Remove browser default everywhere */
*:focus { outline: none; }

/* Add custom ring only on keyboard nav */
*:focus-visible {
  outline: 2px solid rgba(99, 102, 241, 0.8);  /* accent color */
  outline-offset: 3px;
  border-radius: inherit;  /* follows element's own radius */
  /* Double-ring: white gap + colored outer */
  box-shadow:
    0 0 0 2px rgb(10, 10, 15),        /* background-colored gap */
    0 0 0 4px rgba(99, 102, 241, 0.8); /* colored ring */
  transition: box-shadow 0.15s ease;
}
```

### Section dividers that aren't `<hr>`

```css
/* Gradient fade divider */
.divider-fade {
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.08) 20%,
    rgba(255, 255, 255, 0.08) 80%,
    transparent
  );
  margin: 3rem 0;
}

/* Dashed monospace-style divider using content */
.divider-mono::before {
  content: "· · · · · · · · · · · · · · · · · · · ·";
  display: block;
  text-align: center;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.5em;
  color: rgba(255, 255, 255, 0.12);
  font-size: 0.75rem;
  margin: 2.5rem 0;
  overflow: hidden;
}
```

### Hover states — everything should respond

```css
/* Cards */
.card {
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 12px 40px rgba(0,0,0,0.5);
}

/* List rows */
.list-row {
  transition: background-color 0.15s ease, padding-left 0.15s ease;
}
.list-row:hover {
  background-color: rgba(255, 255, 255, 0.04);
  padding-left: calc(1rem + 2px);  /* subtle indent nudge */
}

/* Icon buttons — scale, not color shift alone */
.icon-btn {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}
.icon-btn:hover {
  transform: scale(1.1);
  opacity: 1;
}
.icon-btn:active {
  transform: scale(0.95);
}
```

---

## 5. Imagery Handling

### Duotone effect — CSS only

```css
/* Technique: grayscale the image, then overlay a color via mix-blend-mode */
.duotone-wrap {
  position: relative;
  display: inline-block;
  overflow: hidden;
}

.duotone-wrap img {
  display: block;
  filter: grayscale(1) contrast(1.1);
}

/* Overlay the color — multiply keeps image detail */
.duotone-wrap::after {
  content: "";
  position: absolute;
  inset: 0;
  background: oklch(0.25 0.08 265);  /* your brand color */
  mix-blend-mode: multiply;
  opacity: 0.85;
}

/* Two-color duotone: shadow color + highlight color */
.duotone-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  background: oklch(0.55 0.06 40);  /* warm highlight tone */
  mix-blend-mode: screen;
  opacity: 0.6;
}
```

### Masking / art direction

```css
/* Fade image into background — bottom fade */
.img-fade-bottom {
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}

/* Vignette — darkens edges */
.img-vignette {
  position: relative;
}
.img-vignette::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 50%,
    rgba(0, 0, 0, 0.6) 100%
  );
  pointer-events: none;
}

/* Full-bleed hero — object-fit keeps it art-directed */
.img-hero {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;  /* shift focal point up */
}
```

### Reliable image sources — never broken

Unsplash Imgix CDN. The key insight: use a fixed photo ID with `?w=`, `?h=`, `?q=85`, `?auto=format`, `&fit=crop` — the ID is permanent, the URL is deterministic.

```html
<!-- Reliable Unsplash — always specify w/h so Imgix serves the right size -->
<img
  src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=600&q=80&auto=format&fit=crop"
  alt="…"
  width="800"
  height="600"
  loading="lazy"
  decoding="async"
/>
```

```css
/* CSS-only art placeholder — for when you have no image yet */
.art-placeholder {
  background:
    linear-gradient(160deg in oklch,
      oklch(0.18 0.04 255),
      oklch(0.10 0.02 285)
    );
  position: relative;
}

/* Diagonal texture over the placeholder */
.art-placeholder::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255,255,255,0.02) 0px,
    rgba(255,255,255,0.02) 1px,
    transparent 1px,
    transparent 8px
  );
}
```

```css
/* Fallback for broken <img> — show gradient box, hide broken icon */
img {
  background: linear-gradient(160deg in oklch, oklch(0.15 0.03 260), oklch(0.10 0.01 280));
}

/* Chrome-only: color-scheme helps prevent white flicker */
img:not([src]),
img[src=""] {
  visibility: hidden;
}
```

---

## 6. Borders & Surfaces on Dark

### The correct white-opacity border values

These are not arbitrary — they map to a perceived luminance hierarchy:

```
rgba(255,255,255, 0.04)  — barely there, ambient divider
rgba(255,255,255, 0.06)  — default card border (dark mode)
rgba(255,255,255, 0.08)  — hover state border
rgba(255,255,255, 0.10)  — focused / selected border
rgba(255,255,255, 0.16)  — strong separator, prominent card edge
rgba(255,255,255, 0.25)  — disabled state text, not borders
rgba(255,255,255, 1.00)  — never use on borders, too harsh
```

### Surface elevation system

```css
:root {
  --surface-base:    #0a0a0f;          /* void */
  --surface-1:       rgba(255,255,255,0.03); /* raised */
  --surface-2:       rgba(255,255,255,0.05); /* card */
  --surface-3:       rgba(255,255,255,0.08); /* modal */
  --surface-4:       rgba(255,255,255,0.12); /* popover / tooltip */

  --border-subtle:   rgba(255,255,255,0.06);
  --border-default:  rgba(255,255,255,0.10);
  --border-strong:   rgba(255,255,255,0.16);
}

.card {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  box-shadow:
    inset 0 1px 0 var(--border-default),  /* top highlight */
    0 4px 20px rgba(0,0,0,0.40);
}
```

### Glassmorphism done right

```css
/* Works when: there is interesting content behind the panel */
/* Fails when: the background is flat/dark — blur of nothing = nothing */
.glass-panel {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.10),
    0 8px 32px rgba(0, 0, 0, 0.36);
  border-radius: 12px;

  /* Force GPU layer — prevents jank when other elements move */
  transform: translateZ(0);
  will-change: transform;
}

/* Fallback — no backdrop-filter support */
@supports not (backdrop-filter: blur(1px)) {
  .glass-panel {
    background: rgba(18, 18, 28, 0.92);
  }
}
```

When NOT to use glassmorphism:
- Background is solid/flat (there is nothing to blur through)
- Small components like buttons or input fields (too noisy)
- More than 2–3 layered glass panels (performance cliff)
- Text-heavy panels (reduced contrast hurts legibility)

---

## Rules for our builder

> **Grain overlay** — add to every generated site. Copy-paste the `body::after` grain recipe (baseFrequency 0.65, opacity 0.08, mix-blend-mode soft-light). Never skip this.

> **Good gradient** — use OKLCH interpolation with 3 stops minimum. Deep background: `linear-gradient(160deg in oklch, oklch(0.18 0.04 255), oklch(0.12 0.02 285), oklch(0.09 0.01 30))`. No saturated-endpoint gradients.

> **1px highlight border** — every elevated surface gets `box-shadow: inset 0 1px 0 rgba(255,255,255,0.10)`. This is mandatory on cards, modals, dropdowns.

> **Custom animated underline** — every `<a>` that isn't a button gets the `background-size` draw-in technique. Transition: 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94).

> **Minimum 5 craft micro-details per site:**
> 1. Monospace eyebrow labels (font: ui-monospace, size: 11px, tracking: 0.12em)
> 2. Section counters (01 / 02 / 03 via CSS counter)
> 3. Custom list markers (em dash or 4px square)
> 4. Hover states on everything interactive (translateY(-2px) or background shift)
> 5. Custom focus ring (double-ring: background-color gap + accent outer)
> Bonus: gradient fade dividers, number ticker on stats, bracket/label accents

> **Images** — always use Unsplash Imgix with explicit `?w=&h=&q=80&auto=format&fit=crop`. Add CSS gradient fallback on `img` for broken states. Use `object-fit: cover` + intentional `object-position`. Apply duotone or vignette overlay for art direction.

> **Borders on dark** — default card border: `rgba(255,255,255,0.06)`. Default card top-highlight: `rgba(255,255,255,0.10)`. Never use pure white borders.

> **Grain + texture + at least 5 craft micro-details per site.** Every generated output should feel like it was touched by a human who cared.
