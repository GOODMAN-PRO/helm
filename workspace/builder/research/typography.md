# Typography Playbook — Apple/Awwwards-Grade Sites

Next.js (next/font) + Tailwind CSS. No emojis. No vague rules — every value is concrete.

---

## 1. Display-Driven Type Scale

### Philosophy

The scale uses **fluid clamp() values** that interpolate continuously between a 375px mobile viewport and a 1440px desktop viewport. No breakpoints needed for font sizes. The ratio is a hybrid: **1.25 (Major Third)** at mobile, stepping up to **1.414 (Augmented Fourth)** at desktop for the large display sizes. Body and UI sizes use a tighter 1.125 ratio to stay readable and compact.

### The Formula

```
slope  = (max_size - min_size) / (max_vw - min_vw)
         = (max_size - min_size) / (1440 - 375)
y-int  = min_size - slope * min_vw
clamp(min_size, y-int + slope * 100vw, max_size)
```

All sizes in `rem` (base 16px).

### Complete Scale Table

| Token        | Role                  | Min (375px) | Max (1440px) | clamp() value                                    | Ratio step |
|--------------|-----------------------|-------------|--------------|--------------------------------------------------|------------|
| `display-2xl`| Hero / above the fold | 4rem (64px) | 9rem (144px) | `clamp(4rem, 1.532rem + 6.573vw, 9rem)`          | +5rem over 1065px |
| `display-xl` | Large hero / poster   | 3rem (48px) | 7rem (112px) | `clamp(3rem, 1.127rem + 4.99vw, 7rem)`           | |
| `display-lg` | Section hero          | 2.25rem     | 5rem (80px)  | `clamp(2.25rem, 0.964rem + 3.427vw, 5rem)`       | |
| `heading-xl` | H1 / page title       | 2rem (32px) | 3.5rem (56px)| `clamp(2rem, 1.296rem + 1.878vw, 3.5rem)`        | ~1.414x |
| `heading-lg` | H2 / section title    | 1.5rem (24px)| 2.5rem (40px)| `clamp(1.5rem, 1.031rem + 1.25vw, 2.5rem)`       | ~1.333x |
| `heading-md` | H3 / sub-section      | 1.25rem (20px)| 1.875rem (30px)| `clamp(1.25rem, 0.957rem + 0.783vw, 1.875rem)` | ~1.25x |
| `heading-sm` | H4 / card title       | 1.125rem    | 1.5rem       | `clamp(1.125rem, 0.949rem + 0.469vw, 1.5rem)`   | ~1.2x |
| `body-lg`    | Lead paragraph        | 1.125rem    | 1.25rem      | `clamp(1.125rem, 1.066rem + 0.157vw, 1.25rem)`  | |
| `body-base`  | Default body          | 1rem (16px) | 1.125rem     | `clamp(1rem, 0.941rem + 0.157vw, 1.125rem)`     | Fixed feel |
| `body-sm`    | Secondary body        | 0.9375rem   | 1rem         | `clamp(0.9375rem, 0.907rem + 0.08vw, 1rem)`     | |
| `label`      | UI labels, nav        | 0.875rem    | 0.875rem     | `0.875rem` (fixed)                               | Never fluid |
| `caption`    | Captions, metadata    | 0.75rem     | 0.8125rem    | `clamp(0.75rem, 0.721rem + 0.078vw, 0.8125rem)` | |
| `micro`      | Legal, footnotes      | 0.6875rem   | 0.6875rem    | `0.6875rem` (fixed)                              | |

**Key rule:** Never fluid-scale UI labels. Fluid scale display + headings + body only.

---

## 2. Font Choices

### Tier 1 — Sans Display + UI (geometric modernist, free)

**Geist** — Vercel's rational linear sans. Available `next/font/google` as of 2025. Slightly softer than Inter, friendlier apertures, premium neutral. Best for: hero text, navigation, body.
- Fallback: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`

**Inter** — The benchmark. Optically tuned at small sizes. If Geist feels too Vercel-branded, Inter is the safer choice.
- Fallback: `ui-sans-serif, system-ui, sans-serif`

**Instrument Sans** — Wider, more editorial. Good for body copy when you want air. Pairs beautifully with serif display.
- Fallback: `ui-sans-serif, sans-serif`

### Tier 2 — Serif Display (editorial contrast pairing)

**Instrument Serif** — High contrast, classical proportions, modern release. Perfect for large display sizes only. Available `next/font/google`.
- Fallback: `Georgia, 'Times New Roman', serif`

**DM Serif Display** — More aggressive contrast, magazine energy. Works at 72px+.

**Playfair Display** — Safe editorial choice, slightly overused. Better with variable font weight.

### Tier 3 — Local WOFF2 (when budget allows)

**Satoshi** — Geometric, contemporary, popular in fintech/AI products. Load via `next/font/local`. Download from Fontshare (free for commercial use).

**Cabinet Grotesk** — Slightly quirky details, editorial weight range (100–800). Fontshare.

### Recommended Pairings

| Mood              | Display (large)        | UI / Body           |
|-------------------|------------------------|---------------------|
| Tech / Product    | Geist (700–900)        | Geist (400–500)     |
| Editorial / SaaS  | Instrument Serif (400) | Inter (400–500)     |
| Bold / Agency     | Satoshi (800–900)      | Satoshi (400)       |
| Minimal / Studio  | DM Serif Display (400) | Instrument Sans (400–500) |
| Monochrome Pro    | Inter (800)            | Inter (400)         |

**Rule:** Maximum 2 typeface families per project. Never 3. A variable weight range counts as one family.

---

## 3. Tracking, Line-Height, and Weight

### Letter-Spacing (tracking) Rules

```
display-2xl   → -0.04em   (very tight — big type needs compression)
display-xl    → -0.035em
display-lg    → -0.03em
heading-xl    → -0.025em
heading-lg    → -0.02em
heading-md    → -0.015em
heading-sm    → -0.01em
body-lg       → -0.005em  (barely perceptible tightening)
body-base     →  0em      (default — optical normal)
label         →  0.01em   (very slight open, helps small caps)
caption       →  0.02em   (open enough to read at small size)
micro         →  0.03em   (all-caps micro text needs the most air)
```

**Why:** Display type at 80–140px has natural optical spacing that looks too loose at default tracking. Tighten it. Body at 16px reads best at zero. Small caps/labels at 12px need breathing room — open them.

### Line-Height Rules

```
display-2xl / display-xl  → 0.95  (tighter than 1 — optically correct for huge text)
display-lg                → 1.0
heading-xl                → 1.05
heading-lg                → 1.1
heading-md                → 1.15
heading-sm                → 1.2
body-lg                   → 1.6   (lead paragraphs need air)
body-base                 → 1.65  (optimal reading rhythm)
body-sm                   → 1.6
label                     → 1.2   (UI elements should be compact)
caption                   → 1.4
```

**Never use `line-height: 1` for body text.** It creates wall-of-text anxiety. Never use `line-height: 2` for headings — it looks like a draft document.

### Font Weight Usage

| Weight | When to use |
|--------|-------------|
| 300    | Only for display sizes 4rem+. Light at small sizes is unreadable. |
| 400    | Default body, serif display headings (Instrument Serif reads best at 400) |
| 500    | UI labels, nav items, subheads — slightly elevated without shouting |
| 600    | CTAs, card titles, strong emphasis in body text |
| 700    | Primary headings (H1, H2), hero text in sans-serif |
| 800    | Large display text when you want engineered tightness |
| 900    | Poster/hero only. Needs -0.04em tracking minimum or it crowds. |

**Variable font advantage:** Use `font-variation-settings: 'wght' 650` to hit between-weight values for precise optical tuning.

---

## 4. next/font Setup Pattern

### `app/fonts.ts` — Centralized font config

```typescript
// app/fonts.ts
import { Geist, Instrument_Serif, Instrument_Sans } from 'next/font/google'
import localFont from 'next/font/local'

// Primary sans — used for body, UI, headings
export const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  // Geist is a variable font — no weight array needed
})

// Serif display — large headings only
export const fontSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400', // Instrument Serif: only 400 available
})

// Optional: Satoshi via local font (download from fontshare.com)
export const fontDisplay = localFont({
  src: [
    {
      path: '../public/fonts/Satoshi-Variable.woff2',
      weight: '300 900',
      style: 'normal',
    },
  ],
  variable: '--font-display',
  display: 'swap',
})
```

### `app/layout.tsx` — Apply CSS variables to root

```typescript
// app/layout.tsx
import { fontSans, fontSerif, fontDisplay } from './fonts'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontSerif.variable} ${fontDisplay.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

### Why CSS variables, not `.className`

Using `.variable` exposes the font as a CSS custom property (`--font-sans`). This lets Tailwind reference it in the config, and you can override per-component without re-importing the font object. `.className` applies directly and can't be referenced in Tailwind's theme config.

### Performance checklist

- `display: 'swap'` prevents invisible text during load — text shows in fallback immediately
- Next.js inlines a `<link rel="preload">` for fonts used in the root layout automatically
- Never import font objects inside page/component files — always import from `app/fonts.ts` to avoid duplicate instances
- Subset to `['latin']` unless you need extended characters — reduces WOFF2 size ~60%
- Variable fonts: one file covers all weights, eliminating per-weight requests

---

## 5. Kinetic Type Techniques

### 5a. Per-Word Scroll Reveal (Framer Motion)

CLS-safe because we use `opacity` + `translateY` only (no layout-affecting properties).

```typescript
// components/AnimatedText.tsx
'use client'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

interface Props {
  text: string
  className?: string
  delay?: number
}

const wordVariants = {
  hidden: { opacity: 0, y: '0.3em' },
  visible: (i: number) => ({
    opacity: 1,
    y: '0em',
    transition: {
      duration: 0.7,
      delay: i * 0.08,
      ease: [0.215, 0.61, 0.355, 1.0], // cubic-bezier easeOutCubic
    },
  }),
}

export function AnimatedText({ text, className, delay = 0 }: Props) {
  const shouldReduceMotion = useReducedMotion()
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  const words = text.split(' ')

  // Accessibility: screen readers get the full string, not individual words
  return (
    <span
      ref={ref}
      className={className}
      aria-label={text}
      style={{ display: 'inline' }}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          custom={i + delay / 0.08}
          variants={wordVariants}
          initial={shouldReduceMotion ? 'visible' : 'hidden'}
          animate={inView ? 'visible' : 'hidden'}
          aria-hidden="true"
          style={{ display: 'inline-block', overflow: 'hidden' }}
        >
          {/* Inner span clips the word from below — no layout shift */}
          <motion.span style={{ display: 'inline-block' }}>
            {word}
          </motion.span>
          &nbsp;
        </motion.span>
      ))}
    </span>
  )
}
```

**CLS safety:**
- `overflow: hidden` on the wrapper span clips the Y translate below the baseline — zero layout impact
- `opacity` + `transform` only — GPU composited, no reflow
- `useReducedMotion()` from Framer Motion: if `true`, renders in final `visible` state immediately

### 5b. Per-Character Reveal (for short hero strings only)

Same pattern but split on `''` instead of `' '`. Use for strings under 30 characters — more than that and the stagger delay becomes too long.

```typescript
const chars = text.split('')
// staggerChildren: 0.03 (faster for characters than words)
// delayChildren: 0 + word index offset
```

### 5c. Gradient Text

```typescript
// Tailwind + inline style approach — works with variable fonts
// Static gradient:
<h1 className="bg-gradient-to-br from-white via-white/80 to-white/40 bg-clip-text text-transparent">
  Hero Text
</h1>

// Animated gradient (use sparingly — only 1 per page):
// globals.css
.gradient-text-animate {
  background: linear-gradient(
    135deg,
    #fff 0%,
    rgba(255,255,255,0.6) 40%,
    #fff 60%,
    rgba(255,255,255,0.3) 100%
  );
  background-size: 300% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-sweep 3s linear infinite;
}

@keyframes gradient-sweep {
  0%   { background-position: 0% center; }
  100% { background-position: 300% center; }
}

@media (prefers-reduced-motion: reduce) {
  .gradient-text-animate {
    animation: none;
    background-position: 0% center;
  }
}
```

### 5d. Text Mask / Clip Reveal (scroll-linked)

Reveals text as if a curtain lifts — the text is clipped to a percentage that grows as you scroll. Uses `clipPath` (GPU composited, no layout impact).

```typescript
'use client'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'

export function MaskReveal({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.9', 'start 0.3'],
  })
  const clipProgress = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Ghost layer — always visible, sets layout */}
      <span style={{ visibility: 'hidden' }}>{text}</span>

      {/* Animated layer — absolute, clipped */}
      <motion.span
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: useTransform(
            clipProgress,
            (v) => `inset(0 ${100 - parseFloat(v)}% 0 0)`
          ),
        }}
      >
        {text}
      </motion.span>
    </div>
  )
}
```

### 5e. Marquee (infinite scroll ticker)

Pure CSS + Tailwind. No JS. Hardware accelerated.

```typescript
// components/Marquee.tsx
// globals.css — add keyframe:
//   @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }

export function Marquee({ items, speed = 30 }: { items: string[], speed?: number }) {
  const doubled = [...items, ...items] // duplicate for seamless loop

  return (
    <div className="overflow-hidden" aria-hidden="true">
      <div
        className="flex whitespace-nowrap"
        style={{
          animation: `marquee ${speed}s linear infinite`,
          // prefers-reduced-motion handled in CSS:
          // @media (prefers-reduced-motion: reduce) { animation-play-state: paused }
        }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="pr-16 text-label tracking-widest uppercase">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
```

```css
/* globals.css */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

@media (prefers-reduced-motion: reduce) {
  [style*="marquee"] {
    animation-play-state: paused;
  }
}
```

---

## 6. Editorial Layout Rules

### Measure (Line Length)

```
Body text:    max-width: 68ch   (65–72ch is the optimal reading range)
Lead/intro:   max-width: 52ch   (shorter measure for big type feels editorial)
Captions:     max-width: 40ch
Full-bleed:   no max-width — grid columns control it instead
```

In Tailwind: `max-w-prose` = 65ch (built in). For editorial override: `max-w-[68ch]`.

### Hanging Punctuation Feel

CSS `hanging-punctuation: first last` has limited support. Fake it:

```css
.hang-quotes {
  text-indent: -0.5ch; /* pulls opening quote optically into margin */
}
```

Or in Tailwind: `ml-[-0.5ch]` on blockquote elements.

### Big-Type Composition

- **Optical left align:** At display sizes (80px+), left-align. Center-align only for 3 words or fewer.
- **Widows:** Control with `text-wrap: balance` (Chrome 114+, Safari 17+). `text-wrap: pretty` for body paragraphs.
- **Weight mixing:** Use one weight for the "quiet" words and a heavier weight for the key noun. Example: `<span class="font-light">Build faster with</span> <span class="font-bold">AI.</span>` — this is the Apple headline trick.
- **Orphan prevention:** `text-wrap: balance` handles this for headings. For body, use `&nbsp;` between the last two words of critical paragraphs.

### Vertical Rhythm

Use a 4px base grid. Line-heights for body text should resolve to multiples of 4px:
- 16px × 1.625 = 26px (round to 28px in practice)
- 18px × 1.6 = ~28.8px (resolves well)

Spacing between elements: `gap-4` (16px), `gap-6` (24px), `gap-8` (32px), `gap-12` (48px), `gap-20` (80px). Never arbitrary values.

---

## 7. Tailwind Config

### Tailwind v3 (`tailwind.config.ts`)

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-sans)',    'ui-sans-serif',  'system-ui',  '-apple-system', 'sans-serif'],
        serif:   ['var(--font-serif)',   'Georgia',        'Cambria',    'serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      fontSize: {
        // Display — fluid, must use with tracking classes
        'display-2xl': ['clamp(4rem, 1.532rem + 6.573vw, 9rem)',    { lineHeight: '0.95', letterSpacing: '-0.04em' }],
        'display-xl':  ['clamp(3rem, 1.127rem + 4.99vw, 7rem)',     { lineHeight: '1.0',  letterSpacing: '-0.035em' }],
        'display-lg':  ['clamp(2.25rem, 0.964rem + 3.427vw, 5rem)', { lineHeight: '1.0',  letterSpacing: '-0.03em' }],

        // Headings — fluid
        'heading-xl':  ['clamp(2rem, 1.296rem + 1.878vw, 3.5rem)',    { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'heading-lg':  ['clamp(1.5rem, 1.031rem + 1.25vw, 2.5rem)',   { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        'heading-md':  ['clamp(1.25rem, 0.957rem + 0.783vw, 1.875rem)',{ lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'heading-sm':  ['clamp(1.125rem, 0.949rem + 0.469vw, 1.5rem)', { lineHeight: '1.2',  letterSpacing: '-0.01em' }],

        // Body — fluid (subtle)
        'body-lg':   ['clamp(1.125rem, 1.066rem + 0.157vw, 1.25rem)', { lineHeight: '1.6',  letterSpacing: '-0.005em' }],
        'body-base': ['clamp(1rem, 0.941rem + 0.157vw, 1.125rem)',    { lineHeight: '1.65', letterSpacing: '0em' }],
        'body-sm':   ['clamp(0.9375rem, 0.907rem + 0.08vw, 1rem)',    { lineHeight: '1.6',  letterSpacing: '0em' }],

        // Fixed — never fluid
        label:   ['0.875rem',  { lineHeight: '1.2',  letterSpacing: '0.01em' }],
        caption: ['clamp(0.75rem, 0.721rem + 0.078vw, 0.8125rem)', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        micro:   ['0.6875rem', { lineHeight: '1.4',  letterSpacing: '0.03em' }],
      },
      letterSpacing: {
        'display': '-0.04em',
        'tight-xl': '-0.03em',
        'tight-lg': '-0.02em',
        'tight-md': '-0.015em',
        'tight-sm': '-0.01em',
        'body':     '0em',
        'ui':       '0.01em',
        'caps':     '0.08em',
      },
      lineHeight: {
        'display': '0.95',
        'heading': '1.1',
        'snug':    '1.25',
        'normal':  '1.5',
        'reading': '1.65',
        'loose':   '1.8',
      },
    },
  },
  plugins: [],
}

export default config
```

### Tailwind v4 (`app/globals.css` — CSS-first config)

```css
@import "tailwindcss";

@theme {
  --font-family-sans:    var(--font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-family-serif:   var(--font-serif), Georgia, Cambria, serif;
  --font-family-display: var(--font-display), var(--font-sans), sans-serif;

  /* Display */
  --font-size-display-2xl: clamp(4rem, 1.532rem + 6.573vw, 9rem);
  --font-size-display-xl:  clamp(3rem, 1.127rem + 4.99vw, 7rem);
  --font-size-display-lg:  clamp(2.25rem, 0.964rem + 3.427vw, 5rem);

  /* Headings */
  --font-size-heading-xl: clamp(2rem, 1.296rem + 1.878vw, 3.5rem);
  --font-size-heading-lg: clamp(1.5rem, 1.031rem + 1.25vw, 2.5rem);
  --font-size-heading-md: clamp(1.25rem, 0.957rem + 0.783vw, 1.875rem);
  --font-size-heading-sm: clamp(1.125rem, 0.949rem + 0.469vw, 1.5rem);

  /* Body */
  --font-size-body-lg:   clamp(1.125rem, 1.066rem + 0.157vw, 1.25rem);
  --font-size-body-base: clamp(1rem, 0.941rem + 0.157vw, 1.125rem);
  --font-size-body-sm:   clamp(0.9375rem, 0.907rem + 0.08vw, 1rem);

  /* Fixed */
  --font-size-label:   0.875rem;
  --font-size-caption: clamp(0.75rem, 0.721rem + 0.078vw, 0.8125rem);
  --font-size-micro:   0.6875rem;

  /* Tracking */
  --letter-spacing-display: -0.04em;
  --letter-spacing-heading: -0.02em;
  --letter-spacing-body:    0em;
  --letter-spacing-ui:      0.01em;
  --letter-spacing-caps:    0.08em;
}
```

---

## Rules for our builder

Paste this block directly into Tailwind config and font setup.

### Font Setup (`app/fonts.ts`)

```typescript
import { Geist, Instrument_Serif } from 'next/font/google'

export const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const fontSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400',
})
```

```typescript
// app/layout.tsx — apply to root html element
className={`${fontSans.variable} ${fontSerif.variable}`}
// body gets: className="font-sans antialiased"
```

### Copy-paste Tailwind fontSize config (v3)

```typescript
fontSize: {
  'display-2xl': ['clamp(4rem, 1.532rem + 6.573vw, 9rem)',     { lineHeight: '0.95', letterSpacing: '-0.04em' }],
  'display-xl':  ['clamp(3rem, 1.127rem + 4.99vw, 7rem)',      { lineHeight: '1.0',  letterSpacing: '-0.035em' }],
  'display-lg':  ['clamp(2.25rem, 0.964rem + 3.427vw, 5rem)',  { lineHeight: '1.0',  letterSpacing: '-0.03em' }],
  'heading-xl':  ['clamp(2rem, 1.296rem + 1.878vw, 3.5rem)',   { lineHeight: '1.05', letterSpacing: '-0.025em' }],
  'heading-lg':  ['clamp(1.5rem, 1.031rem + 1.25vw, 2.5rem)',  { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
  'heading-md':  ['clamp(1.25rem, 0.957rem + 0.783vw, 1.875rem)',{ lineHeight: '1.15', letterSpacing: '-0.015em' }],
  'heading-sm':  ['clamp(1.125rem, 0.949rem + 0.469vw, 1.5rem)',{ lineHeight: '1.2',  letterSpacing: '-0.01em' }],
  'body-lg':     ['clamp(1.125rem, 1.066rem + 0.157vw, 1.25rem)',{ lineHeight: '1.6', letterSpacing: '-0.005em' }],
  'body-base':   ['clamp(1rem, 0.941rem + 0.157vw, 1.125rem)', { lineHeight: '1.65', letterSpacing: '0em' }],
  'body-sm':     ['clamp(0.9375rem, 0.907rem + 0.08vw, 1rem)', { lineHeight: '1.6',  letterSpacing: '0em' }],
  'label':       ['0.875rem',   { lineHeight: '1.2', letterSpacing: '0.01em' }],
  'caption':     ['clamp(0.75rem, 0.721rem + 0.078vw, 0.8125rem)', { lineHeight: '1.4', letterSpacing: '0.02em' }],
  'micro':       ['0.6875rem',  { lineHeight: '1.4', letterSpacing: '0.03em' }],
},
```

### Tracking + Leading cheat sheet

| Class usage                     | Value    | When                              |
|---------------------------------|----------|-----------------------------------|
| `text-display-2xl`              | 64–144px | Hero above fold                   |
| `text-display-xl`               | 48–112px | Large section hero                |
| `text-heading-xl`               | 32–56px  | Page H1                           |
| `text-heading-lg`               | 24–40px  | Section H2                        |
| `text-body-base`                | 16–18px  | All body copy                     |
| `text-label`                    | 14px     | Nav, buttons, UI                  |
| Tracking: `-0.04em` to `0.01em` |          | Large→small (tight→open)          |
| Line-height: `0.95` to `1.65`   |          | Display→body (compressed→reading) |
| Weight: `300` only at 3rem+     |          | Never thin at small sizes         |
| `text-wrap: balance`            |          | All headings to prevent widows    |
| `max-w-[68ch]`                  |          | All body text columns             |
| `antialiased` on `<body>`       |          | Always — macOS needs it           |

### Non-negotiable rules

1. Always `antialiased` on the body element.
2. Never use viewport units (`vw`, `vh`) directly in font sizes outside of `clamp()` — always paired with min/max guards.
3. Every animated text element must handle `prefers-reduced-motion` — either `useReducedMotion()` (Framer Motion) or `@media (prefers-reduced-motion: reduce)` in CSS.
4. `aria-label` on the parent + `aria-hidden="true"` on split character/word spans — never break screen reader flow.
5. Maximum 2 font families per project. Never import a font in a component file — always from `app/fonts.ts`.
6. `display: 'swap'` on every `next/font` call — no exceptions.
7. Fluid scale range: 375px min, 1440px max. Clamp math is pre-calculated above — do not recalculate per-project.
