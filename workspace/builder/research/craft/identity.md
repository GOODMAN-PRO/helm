# Visual Identity Craft: Type + Color

A field guide for building a distinctive identity. The enemy is the default: Inter body, dark-navy gradient hero, indigo CTA. That combination now reads as "AI startup template" — it signals nothing about the product.

---

## Part 1 — Distinctive Type Pairings

The principle: one face carries personality (display/heading), one face disappears (body). Never mix three. The heading font IS the brand signal.

---

### 1. Fraunces + DM Sans — "Wonky Editorial"

**The fonts**
- Display/heading: [Fraunces](https://fonts.google.com/specimen/Fraunces) — variable serif, axes: Weight (100–900), Optical Size (9–144), Softness (0–100), Wonk (0–1)
- Body: DM Sans — clean, legible, neutral geometric sans

**What makes it distinctive**
Fraunces was designed by Phaedra Charles and Flavia Zimbardi, commissioned by Google Fonts in 2020. At WONK=1, letterforms go slightly eccentric — a leaning 'f', a crooked 'g'. At large optical sizes the contrast sharpens; at small sizes it softens automatically. No other widely-used serif has this personality dial.

**Vibe + fit**
Edgy-warm. Indie product, creative tool, personal brand, lifestyle SaaS, anything that wants editorial soul without going full fashion-magazine.

**Settings**
```css
/* Heading — let the wonk show */
font-family: 'Fraunces', serif;
font-size: clamp(3rem, 8vw, 7rem);
font-weight: 300;
font-variation-settings: 'opsz' 72, 'WONK' 1, 'SOFT' 20;
letter-spacing: -0.02em;
line-height: 1.05;

/* Body */
font-family: 'DM Sans', sans-serif;
font-size: 1rem;
font-weight: 400;
letter-spacing: 0;
line-height: 1.65;
```

**next/font setup**
```ts
import { Fraunces, DM_Sans } from 'next/font/google'

export const display = Fraunces({
  subsets: ['latin'],
  axes: ['WONK', 'SOFT', 'opsz'],
  variable: '--font-display',
})

export const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
})
```

---

### 2. Instrument Serif + Space Grotesk — "Sharp Editorial Tech"

**The fonts**
- Display/heading: [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) — contemporary serif, sharp serifs, slightly expressive proportions, distinctive italic
- Body/UI: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — geometric sans with techy personality, slight quirks in terminals

**What makes it distinctive**
Instrument Serif reads as refined editorial but has a crispness that works in digital interfaces — it doesn't feel old. Space Grotesk has subtle inktraps and a slightly technical feel that Inter lacks. This pairing was heavily adopted in 2024–2025 premium landing pages for dev tools and AI products, and it still reads as considered rather than default.

**Vibe + fit**
Refined-technical. Developer tools, AI infrastructure, financial products, anything that wants editorial authority with a technical underpinning.

**Settings**
```css
/* Heading */
font-family: 'Instrument Serif', serif;
font-size: clamp(2.5rem, 6vw, 6rem);
font-weight: 400; /* only Regular + Italic exist */
font-style: italic; /* use italic for hero impact */
letter-spacing: -0.01em;
line-height: 1.1;

/* UI / body */
font-family: 'Space Grotesk', sans-serif;
font-size: 0.9375rem;
font-weight: 400;
letter-spacing: 0.01em;
line-height: 1.6;
```

**next/font setup**
```ts
import { Instrument_Serif, Space_Grotesk } from 'next/font/google'

export const display = Instrument_Serif({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

export const body = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
})
```

---

### 3. Syne + Chivo Mono — "Angular Brutalist Utility"

**The fonts**
- Display: [Syne](https://fonts.google.com/specimen/Syne) — commissioned by an art centre in Bordeaux; Extra-Bold has subtle geometric irregularity in letterforms, angular at large sizes
- Accent/UI: [Chivo Mono](https://fonts.google.com/specimen/Chivo+Mono) — a reverse role: mono as the *body/label* voice, grounding Syne's display energy

**What makes it distinctive**
Syne at Extra-Bold with tight tracking reads like a screen-printed poster — purposeful, not default. Using mono as body is a deliberate anti-convention choice that works for data-heavy or dev-facing products. The Syne + mono combo is a role reversal: display carries emotion, mono carries information.

**Vibe + fit**
Brutalist-utility. CLI tools, dashboards, developer consoles, data platforms, portfolio sites that want to feel like a blueprint.

**Settings**
```css
/* Display */
font-family: 'Syne', sans-serif;
font-size: clamp(3rem, 9vw, 8rem);
font-weight: 800;
letter-spacing: -0.04em;
text-transform: uppercase;
line-height: 0.95;

/* Labels / body */
font-family: 'Chivo Mono', monospace;
font-size: 0.8125rem;
font-weight: 400;
letter-spacing: 0.04em;
line-height: 1.7;
```

**next/font setup**
```ts
import { Syne, Chivo_Mono } from 'next/font/google'

export const display = Syne({
  subsets: ['latin'],
  weight: ['800'],
  variable: '--font-display',
})

export const mono = Chivo_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})
```

---

### 4. Playfair Display + Plus Jakarta Sans — "Warm Luxury Product"

**The fonts**
- Display: [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) — high-contrast Transitional serif; extreme thick/thin strokes; distinctive italic with swash characters
- Body: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — geometric sans with slightly rounded terminals, warmer than Inter without being friendly-startup

**What makes it distinctive**
Playfair at light weight is unexpected — most sites use it bold. At 400 or 300 weight with large size it reads as jewelry-catalogue refined. Plus Jakarta Sans has slightly more character than Inter — wider proportions, subtle personality — without being as assertive as Space Grotesk.

**Vibe + fit**
Luxury editorial. Consumer products, premium SaaS, health/wellness, anything with a high-end positioning that still needs to read clearly at UI scale.

**Settings**
```css
/* Display — subvert the usual bold */
font-family: 'Playfair Display', serif;
font-size: clamp(3.5rem, 7vw, 7rem);
font-weight: 400;
font-style: italic;
letter-spacing: 0.01em;
line-height: 1.08;

/* Body */
font-family: 'Plus Jakarta Sans', sans-serif;
font-size: 1rem;
font-weight: 400;
letter-spacing: -0.005em;
line-height: 1.6;
```

**next/font setup**
```ts
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google'

export const display = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

export const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
})
```

---

### 5. Bricolage Grotesque (variable) — "Expressive Variable Mono-Typeface"

**The fonts**
- Everything: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) — quirky variable grotesque with Width + Weight axes; unusual inktraps and letter details; feels like a hand-drawn grotesk but stays geometric enough for UI

**What makes it distinctive**
Bricolage is a single-family solution that uses its variable axes expressively: stretch the Width axis for display, compress for labels, vary weight from 200 to 800. No pairing needed; the contrast comes from axis variation. Typewolf and Creative Boom both flagged it as the breakout variable font of 2025. It is warm, slightly imperfect, and completely unlike the geometric coldness of Inter or Geist.

**Vibe + fit**
Playful-confident. Creative agencies, AI tools with personality, consumer apps, products that want to feel handcrafted but ship at scale. Excellent for Helm-style AI agents or fluid product UIs.

**Settings**
```css
/* Hero — wide + heavy */
font-family: 'Bricolage Grotesque', sans-serif;
font-size: clamp(3rem, 8vw, 6rem);
font-weight: 700;
font-variation-settings: 'wdth' 125;
letter-spacing: -0.02em;
line-height: 1.05;

/* UI body — regular width */
font-family: 'Bricolage Grotesque', sans-serif;
font-size: 0.9375rem;
font-weight: 400;
font-variation-settings: 'wdth' 100;
line-height: 1.6;
```

**next/font setup**
```ts
import { Bricolage_Grotesque } from 'next/font/google'

export const brand = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-brand',
})
```

---

### 6. DM Serif Display + Geist Mono — "Cold Precision Editorial"

**The fonts**
- Display: [DM Serif Display](https://fonts.google.com/specimen/DM+Serif+Display) — elegant Transitional serif, slightly condensed proportions, refined thin strokes, built for large display
- Mono: Geist Mono (via `next/font/local`, OFL from Vercel's GitHub) — tight, engineered, slightly cold monospaced sans

**What makes it distinctive**
DM Serif Display at low weight and large size is aristocratic — it occupies space without shouting. Geist Mono as body is an uncommon choice outside of Vercel itself; it gives everything a precision-tooled quality. The contrast between warm serif display and cold mono body creates productive tension. Typewolf's trending pairings (Tobias + Diatype Mono, Swear + DM Mono) point to this editorial-serif-meets-engineered-mono pattern as a 2025 signature.

**Vibe + fit**
Infrastructure/platform. Serious dev tools, databases, deployment pipelines, anything where craft signals competence rather than personality.

**Settings**
```css
/* Display */
font-family: 'DM Serif Display', serif;
font-size: clamp(2.75rem, 6.5vw, 6.5rem);
font-weight: 400;
letter-spacing: -0.015em;
line-height: 1.05;

/* Mono body */
font-family: 'Geist Mono', monospace;
font-size: 0.875rem;
letter-spacing: 0.01em;
line-height: 1.7;
```

**next/font setup**
```ts
import { DM_Serif_Display } from 'next/font/google'
import localFont from 'next/font/local'

export const display = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
})

export const mono = localFont({
  src: './GeistMono-Variable.woff2', // from github.com/vercel/geist-font
  variable: '--font-mono',
})
```

---

## Part 2 — Owned Color Identities

The principle: **one real accent, maximum restraint, no gradient as identity**. Gradients are decoration; flat color is identity. A gradient on a hero image is fine; a gradient *as* your brand is not.

Colors are given in both hex (for tool compatibility) and oklch (for CSS systems where you want perceptually uniform scales). OKLCH has 92%+ browser support as of mid-2025.

---

### Palette A — "Ink Press"
**Warm off-white editorial with single ink accent**

```
bg:       #F5F0E8   oklch(95% 0.018 85)   warm parchment, not clinical white
surface:  #EDE7D9   oklch(91% 0.022 82)   cards / elevated surfaces
border:   #C8BFA8   oklch(79% 0.025 82)   hairlines, dividers
text:     #1A1512   oklch(14% 0.018 45)   near-black with warm undertone, not pure #000
accent:   #B85C38   oklch(53% 0.145 38)   burnt sienna — one color, used for CTAs only
muted:    #7A6E62   oklch(50% 0.022 60)   secondary text
```

**Vibe:** Magazine off the press. Timeless. Think editorial — a newsletter, a memoir, a physical-goods brand with heritage. High contrast between the warm paper background and ink text.

**Product fit:** Publishing tools, editorial platforms, journaling apps, premium newsletters, Substack-killer, portfolio sites. Strongly anti-digital-native — that's the signal.

---

### Palette B — "Carbon Acid"
**Near-black with single electric accent**

```
bg:       #0E0E0E   oklch(8% 0 0)          true near-black, avoid pure #000
surface:  #181818   oklch(12% 0 0)          lifted surface
border:   #2E2E2E   oklch(21% 0 0)          structural borders
text:     #F0F0F0   oklch(94% 0 0)          near-white body
heading:  #FFFFFF   oklch(100% 0 0)         pure white for big headings only
accent:   #AAFF00   oklch(94% 0.27 130)     acid green — the only color on the page
muted:    #6B6B6B   oklch(48% 0 0)          secondary text
```

**Vibe:** High-performance, nocturnal, slightly dangerous. The acid green accent on a near-black field reads like a terminal cursor, a racing livery, or a performance monitoring dashboard. It is immediately memorable because nothing else on the page has chroma.

**Product fit:** Developer tooling, agent orchestration, performance dashboards, sports/fitness tech, anything that lives in dark environments. The F1 driver site that won Awwwards 2025 used lime-green typography on black for exactly this reason.

**Note:** The acid green accent must appear sparingly — one CTA button, one key number, a cursor blink. When you use it everywhere it becomes a cliche; when you use it once per screen, it commands the eye.

---

### Palette C — "Desert Signal"
**Earthy/muted warm with clay accent**

```
bg:       #F2EBE0   oklch(93% 0.020 68)    warm sand — not beige, not cream
surface:  #E8DDD0   oklch(88% 0.026 68)    slightly deeper surface
border:   #C4B49A   oklch(74% 0.040 72)    warm separator
text:     #2C1F14   oklch(17% 0.035 50)    dark warm brown — softer than black
accent:   #D4622A   oklch(58% 0.155 42)    terracotta — the hero accent
muted:    #8C7B6A   oklch(55% 0.030 62)    secondary text
success:  #4A7C59   oklch(52% 0.095 154)   muted sage for positive states
```

**Vibe:** Sustainability, slowness, craft. Feels like a ceramics studio website or a well-funded climate-tech company. Warm without being saccharine, earthy without being muddy.

**Product fit:** Climate tech, DTC consumer products, wellness/mindfulness, community platforms, anything that wants to signal care and intentionality. The restraint of muted tones reads as premium without requiring luxury pricing.

---

### Palette D — "Brutalist Newsprint"
**High-contrast with yellow accent — functional brutalism**

```
bg:       #F7F5F0   oklch(97% 0.008 90)    off-white newsprint, not pure white
surface:  #EDEBE4   oklch(93% 0.010 88)    cards
border:   #1A1A1A   oklch(14% 0 0)          heavy black borders — 2px, structural
text:     #1A1A1A   oklch(14% 0 0)          near-black
accent:   #F5C800   oklch(85% 0.190 95)     construction yellow — Max Mara/brutalist signal
muted:    #666058   oklch(44% 0.015 78)     secondary text
```

**Vibe:** Swiss graphic design meets construction site. No decoration; typography IS the design. Heavy black borders, massive type, yellow as the only warmth. This reads as confident, fast, and anti-corporate.

**Product fit:** Developer tools, task managers, code-adjacent productivity, anything where the UI should feel like a designed object rather than a "friendly" app. Best with Syne Extra-Bold or Monument Extended typography.

---

### Palette E — "Duotone Dusk"
**Two-color locked palette — warm purple + pale gold**

```
bg:       #1A1228   oklch(13% 0.065 295)   deep violet-black
surface:  #241B38   oklch(18% 0.072 292)   lifted surface
border:   #3D3058   oklch(27% 0.070 290)   structural lines
text:     #EDE6FF   oklch(93% 0.038 295)   near-white with violet tint
accent:   #E8C84A   oklch(83% 0.158 88)    warm gold — exact complement to the violet
muted:    #8B7AAA   oklch(58% 0.065 295)   secondary text in family hue
```

**Vibe:** Cinematic, premium, nocturnal warmth. The violet-black + gold duotone is a step beyond generic dark-mode; it has the quality of a high-end theatre poster or a luxury watch brand. The palette is tightly locked — you use only these values.

**Product fit:** AI creative tools, music/audio products, premium entertainment platforms, luxury services. Works extremely well with DM Serif Display or Instrument Serif italic in the gold accent.

---

### Palette F — "Emerald Ledger"
**Refined jewel tone — deep teal/emerald field**

```
bg:       #0B2E25   oklch(20% 0.070 165)   deep forest — a wall of emerald
surface:  #163D31   oklch(27% 0.075 162)   raised surfaces
border:   #255744   oklch(38% 0.075 162)   dividers
text:     #E8F5EF   oklch(95% 0.030 162)   near-white with green tint
accent:   #F0D060   oklch(86% 0.160 92)    champagne gold — one accent
muted:    #7BAA95   oklch(68% 0.060 162)   secondary text in the green family
```

**Vibe:** Old money meets modern infrastructure. Harrods green. Think a private banking interface, a legal tech platform, or an enterprise analytics tool that should communicate both craft and authority. The gold accent on emerald is a deliberately luxurious signal.

**Product fit:** FinTech, legal tech, enterprise SaaS, investment platforms. Pairs strongly with Instrument Serif italic headings in the gold accent color.

---

## Part 3 — How to Pick an Identity

**A decision rule: product brief to type + color direction.**

| Product type | Type direction | Color direction |
|---|---|---|
| Developer tool / CLI / infra | Syne + Chivo Mono OR DM Serif + Geist Mono | Carbon Acid (B) or Brutalist Newsprint (D) |
| AI agent / creative tool | Bricolage Grotesque OR Fraunces + DM Sans | Carbon Acid (B) or Duotone Dusk (E) |
| FinTech / legal / enterprise | Instrument Serif + Space Grotesk OR DM Serif + Geist Mono | Emerald Ledger (F) or Duotone Dusk (E) |
| Consumer / DTC / wellness | Playfair + Plus Jakarta Sans OR Fraunces + DM Sans | Desert Signal (C) or Ink Press (A) |
| Editorial / publishing / content | Fraunces + DM Sans OR DM Serif + Geist Mono | Ink Press (A) or Desert Signal (C) |
| Portfolio / agency / creative | Syne + Chivo Mono OR Bricolage Grotesque | Brutalist Newsprint (D) or any dark palette |

**Secondary rule: when in doubt, go darker and more specific.** A generic light product with Inter and indigo reads as "AI template." A product with one unusual type choice and one unusual accent color reads as designed-by-someone.

---

## Part 4 — The Single Accent Principle

**Restraint is the technique, not a constraint.**

The premium signal is not a richer palette — it is using a single accent so sparingly that when it appears, the eye goes to it automatically. Stripe's dashboard is 95% neutral gray; the indigo appears only on primary actions. Linear's interface is cool gray; the purple appears on active state and brand moments. The ratio is roughly 95:5.

Rules:
1. Define one accent hex/oklch value. That is the only "brand color." Everything else is neutral.
2. The accent appears on: primary CTA, active states, data callouts, logo mark if any.
3. The accent does NOT appear on: backgrounds, decorative elements, borders, body text, secondary buttons.
4. Gradients are permitted as *image texture* (a photo overlay, a hero background image) but never as a *flat-color substitute*. A gradient button is a 2019 signal; a flat-color button with the accent is 2025.
5. Color as meaning, not decoration: brand color = primary action; red = danger; green = success. Any color outside this system is noise.

**Why OKLCH for defining the accent:** At equal Chroma values, OKLCH colors look equally saturated across hues. This means if you define your accent as `oklch(60% 0.18 <hue>)`, you can shift the hue for dark mode or theming and the accent will feel equally vivid — no manual rebalancing. This is the primary reason to use oklch over hex in a design system.

---

## Rules for Our Builder

### Ready Identities — Pick One Per Brief

**Identity 01 — Wonky Editorial**
- Type: Fraunces (WONK=1, opsz=72, 300 weight) + DM Sans 400
- Color: Ink Press (A) — bg `#F5F0E8`, text `#1A1512`, accent `#B85C38`
- For: content tools, editorial, journaling, consumer

**Identity 02 — Carbon Acid**
- Type: Bricolage Grotesque variable (wdth=125 for display) as sole family
- Color: Carbon Acid (B) — bg `#0E0E0E`, text `#F0F0F0`, accent `#AAFF00`
- For: AI agents, developer tools, performance dashboards

**Identity 03 — Desert Craft**
- Type: Playfair Display 400 italic + Plus Jakarta Sans 400
- Color: Desert Signal (C) — bg `#F2EBE0`, text `#2C1F14`, accent `#D4622A`
- For: wellness, DTC, climate tech, community

**Identity 04 — Blueprint Brutal**
- Type: Syne 800 uppercase + Chivo Mono 400
- Color: Brutalist Newsprint (D) — bg `#F7F5F0`, text `#1A1A1A`, accent `#F5C800`
- For: dashboards, dev tools, task managers, creative agencies

**Identity 05 — Emerald Authority**
- Type: Instrument Serif 400 italic + Space Grotesk 400
- Color: Emerald Ledger (F) — bg `#0B2E25`, text `#E8F5EF`, accent `#F0D060`
- For: FinTech, legal, enterprise SaaS

**Identity 06 — Dusk Precision**
- Type: DM Serif Display 400 + Geist Mono 400
- Color: Duotone Dusk (E) — bg `#1A1228`, text `#EDE6FF`, accent `#E8C84A`
- For: AI creative tools, audio/music, luxury services

---

**The rule: pick a distinctive identity per brief; never default to Inter + navy gradient.**

An identity is made by committing fully — same type scale, same single accent, same neutral palette — across every surface. The signal is not complexity; it is consistency in an uncommon choice.
