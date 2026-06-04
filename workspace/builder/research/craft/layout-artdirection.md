# Layout Art Direction

Reference for builder page composition. Every pattern here is sourced from award/editorial sites and print-to-web practice. The goal is to produce pages that read as *designed*, not templated.

---

## The problem with defaults

The default AI-generated page looks like this:

```
[centered headline + subhead + CTA button]
[3 equal cards in a row]
[centered headline + subhead]
[3 equal cards in a row]
[centered CTA section]
```

This pattern is invisible. It has no visual personality because it makes no choices. Every section is the same width, the same alignment, the same rhythm. Award sites and editorial publications break every one of those defaults deliberately.

---

## 1. Asymmetric & Off-Grid Composition

### The principle

A 12-column grid is not a template — it is a tool for deliberate asymmetry. Award sites use it to create *weight* on one side of the page, not to center everything inside a `max-w-5xl mx-auto`.

### Structural patterns

**Left-weighted hero (7/5 split)**

Text column spans columns 1–7, image spans columns 7–12, overlapping one column. The type sits heavy on the left and the image bleeds to the right edge.

```html
<!-- Tailwind: 12-col grid, text takes 7 cols, image takes 6 cols overlapping by 1 -->
<section class="grid grid-cols-12 min-h-screen items-center">
  <div class="col-span-7 col-start-1 pr-16 z-10">
    <p class="text-xs tracking-widest uppercase text-neutral-400">Category / 001</p>
    <h1 class="text-[clamp(3rem,8vw,9rem)] font-black leading-[0.9] mt-4">
      Display<br>Headline
    </h1>
    <p class="mt-8 max-w-sm text-base text-neutral-300">Short descriptor. No more than two lines.</p>
    <a class="mt-10 inline-flex items-center gap-3 text-sm uppercase tracking-widest">
      Get started <span>→</span>
    </a>
  </div>
  <div class="col-span-6 col-start-7 h-screen -mr-8">
    <img class="w-full h-full object-cover" src="..." />
  </div>
</section>
```

**Offset block with intentional void**

Use empty grid columns as real whitespace. A headline that starts at column 3 and a paragraph that starts at column 5 creates a stepped, editorial feel.

```html
<!-- Tailwind: headline offset right, body further right, void left -->
<section class="grid grid-cols-12 gap-6 py-32">
  <h2 class="col-start-3 col-span-6 text-6xl font-bold leading-tight">
    Intentional offset
  </h2>
  <p class="col-start-5 col-span-5 text-base text-neutral-400 mt-6">
    Body copy begins two columns after the headline. The left void is not empty — it is weight.
  </p>
</section>
```

**CSS Grid named-column template (editorial core pattern)**

Sourced from Smashing Magazine's editorial grid patterns:

```css
.page {
  display: grid;
  grid-template-columns:
    [full-start] 1fr
    [content-start] minmax(0, 40rem)
    [content-end] 1fr
    [full-end];
}

/* Default: content column */
.page > * { grid-column: content; }

/* Full-bleed breakout */
.full-bleed { grid-column: full; }

/* Breakout: wider than content but not full */
.breakout {
  grid-column: full;
  padding-inline: 4vw;
}
```

This is the structural backbone of The New York Times web layouts, Stripe marketing pages, and Linear's site. Everything defaults to the content column; specific elements burst out.

### Key rule

Never center a hero. Put the dominant visual or dominant type mass on one side. Let the other side breathe or bleed.

---

## 2. Overlap & Layering

### The principle

Sections should not be sealed off from each other. An element that crosses the section boundary reads as intentional design, not template. Layering creates depth on a flat screen.

### Structural patterns

**Hero image bleeding into next section**

The hero image extends below the fold and is visually interrupted by the next section's background. Achieved with negative margin or translate on the following section.

```html
<section class="relative h-screen overflow-visible">
  <img class="absolute inset-0 w-full h-[115%] object-cover object-top" src="..." />
  <!-- text floats over image -->
  <div class="relative z-10 flex flex-col justify-end h-full pb-20 px-16">
    <h1 class="text-white text-8xl font-black">Title</h1>
  </div>
</section>

<!-- This section overlaps up, eating into the hero -->
<section class="relative -mt-24 z-10 bg-white rounded-t-3xl px-16 pt-20">
  ...
</section>
```

**Text over image with shared grid cell (CSS)**

Sourced from Modern CSS / CSS-Tricks grid overlay technique:

```css
.hero {
  display: grid;
  grid-template-areas: "hero";
}
.hero > * {
  grid-area: hero;  /* all children share the same cell */
}
.hero__image { z-index: 0; }
.hero__text {
  z-index: 1;
  place-self: end start;  /* bottom-left anchor */
  padding: 3rem;
}
```

**Oversized number or letter as background layer**

```html
<section class="relative overflow-hidden py-32">
  <!-- Giant number, purely decorative -->
  <span class="absolute -top-16 -left-8 text-[20rem] font-black text-neutral-100 select-none leading-none z-0">
    01
  </span>
  <div class="relative z-10 max-w-2xl ml-32">
    <h2 class="text-4xl font-bold">Feature name</h2>
    <p class="mt-4 text-neutral-400">Description.</p>
  </div>
</section>
```

### Key rule

Make at least one element per page span two sections or float above a boundary. This communicates deliberate composition, not stacked divs.

---

## 3. Scale Contrast

### The principle

Dramatic type size jumps are the fastest signal that a page was designed, not generated. The contrast between a 96px headline and an 11px label creates immediate hierarchy. "Scale contrast" is the oldest trick in editorial design — pull quotes, decks, kickers — all versions of this.

### Structural patterns

**Giant display type + tiny kicker**

```html
<div class="flex flex-col gap-2">
  <!-- Kicker: tiny, spaced, uppercase -->
  <span class="text-[11px] tracking-[0.2em] uppercase text-neutral-400">
    Fleet control / v2.1
  </span>
  <!-- Display: enormous, tight leading -->
  <h1 class="text-[clamp(4rem,12vw,11rem)] font-black leading-[0.85] tracking-tight">
    Always<br>on.
  </h1>
</div>
```

**Caption alongside hero image**

```html
<div class="grid grid-cols-12 items-end gap-4">
  <div class="col-span-10">
    <img class="w-full h-[70vh] object-cover" src="..." />
  </div>
  <div class="col-span-2 pb-4">
    <!-- Tiny rotated caption -->
    <p class="text-[10px] tracking-wider uppercase text-neutral-400 writing-mode-vertical">
      Fig. 01 — Dashboard overview, 2026
    </p>
  </div>
</div>
```

**Stat block: number as display type**

```html
<div class="flex items-baseline gap-4">
  <span class="text-[8rem] font-black leading-none">99</span>
  <div class="flex flex-col">
    <span class="text-lg font-semibold">%</span>
    <span class="text-xs text-neutral-400 uppercase tracking-widest max-w-[8ch]">uptime guarantee</span>
  </div>
</div>
```

Scale jumps to use: 10px ↔ 96px, 11px ↔ 72px, 12px ↔ 56px. Never 14px next to 24px — that is not contrast, it is increment.

---

## 4. Full-Bleed vs. Contained Rhythm

### The principle

The container exists to be broken. Full-bleed moments are dramatic because they contrast with the contained rhythm around them. If everything bleeds, nothing bleeds. The rule from The New Yorker web redesign: one full-bleed element per scroll-depth to mark a new chapter.

### The CSS foundation

The three-column grid trick (sourced from LogRocket / CSS-Tricks):

```css
.wrapper {
  display: grid;
  grid-template-columns: 1fr min(80%, 48rem) 1fr;
}

/* Default: content column (col 2) */
.wrapper > * {
  grid-column: 2;
}

/* Full-bleed: all three columns */
.wrapper > .bleed {
  grid-column: 1 / -1;
}
```

### When to bleed

| Element | Bleed? | Why |
|---|---|---|
| Hero image | Yes | Opens the page, claims territory |
| Feature image mid-section | Yes | Creates chapter break |
| Stats band | Yes | Contrast with text sections above/below |
| Background color band | Yes | Separates content regions |
| Body copy | Never | Readability requires measure control |
| Card grid | Rarely | Only if cards themselves are full-width tiles |

### Editorial margin usage

Print magazines use outside margins as an active zone: footnotes, pull quotes, chapter numbers, captions. On the web, the same applies:

```html
<article class="wrapper">
  <p>Body copy in the content column...</p>

  <!-- Margin note: sits in the grid gutter space -->
  <aside class="col-span-1 col-start-1 text-xs text-neutral-400 mt-1 text-right pr-6">
    See also: section 3
  </aside>
</article>
```

---

## 5. Non-Card Feature Presentation

### The problem with 3-card grids

Three equal cards in a row communicate "we have three things and we don't know which matters." They flatten hierarchy. The alternatives:

### Pattern A: Alternating image-text rows (Stripe-style)

Not zig-zag (which NN/g research flags as hard to scan) — alternating *asymmetric* rows where text weight shifts between left and right, but columns are unequal.

```html
<!-- Row 1: 5/7 split, text left -->
<div class="grid grid-cols-12 gap-8 items-center py-20">
  <div class="col-span-5 col-start-1">
    <span class="text-xs tracking-widest uppercase text-neutral-400">01</span>
    <h3 class="text-3xl font-bold mt-2">Feature name</h3>
    <p class="mt-4 text-neutral-400">Description that earns the image next to it.</p>
  </div>
  <div class="col-span-7 col-start-6 h-64 bg-neutral-100 rounded-xl overflow-hidden">
    <img class="w-full h-full object-cover" />
  </div>
</div>

<!-- Row 2: 7/5 split, image left — DIFFERENT PROPORTION -->
<div class="grid grid-cols-12 gap-8 items-center py-20">
  <div class="col-span-7 col-start-1 h-64 bg-neutral-100 rounded-xl overflow-hidden">
    <img class="w-full h-full object-cover" />
  </div>
  <div class="col-span-4 col-start-9">
    <span class="text-xs tracking-widest uppercase text-neutral-400">02</span>
    <h3 class="text-3xl font-bold mt-2">Feature name</h3>
    <p class="mt-4 text-neutral-400">Description.</p>
  </div>
</div>
```

### Pattern B: Big numbered list (editorial feature spread)

Sourced from The Pudding, Wired long-form. Large numbers are display type; explanations are small below.

```html
<div class="grid grid-cols-1 md:grid-cols-3 divide-x divide-neutral-200">
  <div class="px-10 py-12">
    <span class="block text-[6rem] font-black leading-none text-neutral-100">01</span>
    <h4 class="mt-4 text-xl font-semibold">Always-on agent</h4>
    <p class="mt-2 text-sm text-neutral-400">Continuous presence on your fleet, not just on-demand.</p>
  </div>
  <!-- 02, 03... -->
</div>
```

### Pattern C: Sticky-scroll feature reveal

Left column sticks; right side scrolls through features. Sourced from Linear's "how it works" section, Apple product pages, Codrops:

```html
<section class="lg:grid lg:grid-cols-2 lg:gap-16">
  <!-- Sticky left: product visual or headline -->
  <div class="lg:sticky lg:top-24 lg:self-start py-20">
    <div class="aspect-video bg-neutral-900 rounded-2xl overflow-hidden">
      <!-- visual that updates via JS on scroll -->
      <img id="feature-visual" src="feature-1.png" class="w-full h-full object-cover transition-opacity" />
    </div>
  </div>

  <!-- Scrolling right: feature list -->
  <div class="divide-y divide-neutral-100">
    <div class="py-16 feature-item" data-visual="feature-1.png">
      <span class="text-xs tracking-widest uppercase text-neutral-400">01 / Always on</span>
      <h3 class="mt-3 text-2xl font-bold">Continuous fleet awareness</h3>
      <p class="mt-3 text-neutral-400">The agent watches without being asked.</p>
    </div>
    <div class="py-16 feature-item" data-visual="feature-2.png">
      <!-- feature 02 -->
    </div>
  </div>
</section>
```

### Pattern D: Bento done well (hierarchy-first)

Bento fails when all cells are the same size. It works when one cell dominates 2/3 of the space and smaller cells are genuinely smaller.

```html
<div class="grid grid-cols-3 grid-rows-2 gap-4 h-[600px]">
  <!-- Hero cell: 2 columns, 2 rows -->
  <div class="col-span-2 row-span-2 bg-neutral-900 rounded-2xl p-8 flex flex-col justify-end">
    <h3 class="text-3xl font-bold text-white">Primary feature</h3>
    <p class="mt-2 text-neutral-400 text-sm">The most important one gets the most space.</p>
  </div>
  <!-- Small cell 1 -->
  <div class="bg-neutral-100 rounded-2xl p-6 flex flex-col justify-between">
    <span class="text-3xl font-black">99%</span>
    <span class="text-xs text-neutral-400 uppercase tracking-widest">Uptime</span>
  </div>
  <!-- Small cell 2 -->
  <div class="bg-neutral-100 rounded-2xl p-6 flex flex-col justify-between">
    <span class="text-3xl font-black">&lt;50ms</span>
    <span class="text-xs text-neutral-400 uppercase tracking-widest">Latency</span>
  </div>
</div>
```

### Pattern E: Magazine editorial spread (full-width, text + image at scale)

One massive image; text positioned over or beside it at large scale. No cards.

```html
<section class="relative h-[80vh] overflow-hidden">
  <img class="absolute inset-0 w-full h-full object-cover" src="..." />
  <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
  <div class="relative z-10 h-full flex flex-col justify-end px-16 pb-16 max-w-2xl">
    <p class="text-xs tracking-[0.2em] uppercase text-white/60">Chapter 02</p>
    <h2 class="mt-3 text-6xl font-black text-white leading-tight">
      The goal<br>system.
    </h2>
    <p class="mt-6 text-white/70 text-base max-w-md">One sentence that earns the image.</p>
  </div>
</section>
```

---

## 6. Whitespace as a Tool

### The principle

From Stripe/Linear/Vercel analysis: take the spacing that feels like enough, then double it. Whitespace is not emptiness — it is *directed attention*. Kinfolk magazine built an entire aesthetic on this: generous margins, sparse content per page, text that breathes.

### Concrete applications

**Vertical rhythm: uneven, not uniform**

Do not use `space-y-16` throughout. Use different vertical gaps to create rhythm — tight in one zone, generous in another.

```html
<section class="py-40">           <!-- large top/bottom -->
  <p class="text-xs mb-2">Kicker</p>   <!-- tight: 8px -->
  <h2 class="text-6xl mb-16">Headline</h2>  <!-- generous: 64px gap to body -->
  <p class="text-base mb-6">Para 1</p>
  <p class="text-base mb-6">Para 2</p>
  <!-- 96px gap before next element: intentional break -->
  <div class="mt-24">
    <a>CTA link</a>
  </div>
</section>
```

**The void as design element**

Grid columns left empty communicate confidence. A heading that starts at column 3 of 12 says: "I chose this position." Centering says: "I let the browser choose."

```html
<!-- Three empty columns on the left, then the content -->
<section class="grid grid-cols-12 py-32">
  <div class="col-start-4 col-span-6">
    <h2 class="text-5xl font-bold">This heading is not centered.</h2>
    <p class="mt-6 text-neutral-400">It is placed. That is different.</p>
  </div>
</section>
```

**Padding that references itself**

Rather than fixed padding, use viewport-relative values so whitespace scales with the screen — feels generous on desktop, compact on mobile without breakpoint management.

```css
.section { padding-block: clamp(4rem, 12vh, 10rem); }
.section__inner { padding-inline: clamp(1.5rem, 6vw, 8rem); }
```

---

## 7. Section Variety: Layout Rhythm

### The principle

Every consecutive section on a page should have a *different compositional shape*. If section 2 is a full-bleed dark band, section 3 should be contained and light. If section 4 is left-heavy, section 5 shifts weight right. The page should feel like it has rhythm — not like stacked identical blocks.

### A concrete page rhythm pattern

```
Section 1 [HERO]         → Asymmetric left-weighted, full bleed, dark bg
Section 2 [PROOF]        → Full-bleed light band, large stat numbers, no cards
Section 3 [FEATURES]     → Sticky-scroll split, contained, mid-weight
Section 4 [HOW IT WORKS] → Big numbered editorial list, full width
Section 5 [VISUAL]       → Full-bleed editorial spread image, dark overlay text
Section 6 [CTA]          → Minimal, contained, generous whitespace, left-aligned
```

No two adjacent sections share:
- The same background color weight (light/dark)
- The same alignment (left / center / right dominant)
- The same width treatment (contained / full-bleed)
- The same element type (text-heavy / image-heavy / data-heavy)

---

## Section Layout Kit

Six to eight distinct layout shapes to rotate through. Use one per section; never repeat consecutively.

### Kit 01 — Asymmetric Left-Weighted Hero

Grid: 7/5 split. Text left, image right bleeding to edge. Display type 7rem+, kicker 11px. No center-align anywhere.

```
[  TEXT 7col  |   IMAGE 5col→bleed  ]
```

### Kit 02 — Full-Bleed Band with Scale Contrast

Edge-to-edge colored (or dark) section. Giant stat number or single short statement in display type. Two or three supporting labels in 10–12px. Zero cards.

```
[ ←——— DARK/COLORED FULL BLEED ———→ ]
[     96PX NUMBER   caption 10px    ]
```

### Kit 03 — Sticky-Scroll Feature Reveal

Left half sticky (product screenshot or brand visual). Right half scrolls through 3–5 feature rows. Each row: index number + headline + one-line description.

```
[ STICKY VISUAL  |  Feature 01     ]
[     4/12       |  Feature 02 ↑   ]
[                |  Feature 03 ↑   ]
```

### Kit 04 — Offset Editorial Spread

Full-bleed photograph at 80vh. Text floats over image, bottom-left anchored via `place-self: end start`. Gradient scrim. No centered text, no button centered under image.

```
[ ←———— FULL IMAGE 80vh ————→ ]
[ TEXT bottom-left over image  ]
```

### Kit 05 — Big Numbered List (Editorial)

Three or four features in a horizontal `divide-x` grid. Each feature has an oversized step number (5–7rem, light gray), then a headline, then 1–2 lines of description. Alternates with tighter section before and after.

```
[ 01         | 02         | 03        ]
[ big grey # | big grey # | big grey# ]
[ Headline   | Headline   | Headline  ]
[ desc       | desc       | desc      ]
```

### Kit 06 — Weighted Bento (2/3 + 1/3 stacked)

One dominant cell (2 cols, 2 rows) + two small cells stacked right. Dominant cell has headline + short descriptor. Small cells have a single stat or icon each. No equal-size cells.

```
[ ← PRIMARY 2/3 →  | STAT  ]
[                   | STAT  ]
```

### Kit 07 — Alternating Feature Rows

Three feature rows. Row 1: 5/7 text/image. Row 2: 7/4 image/text (different proportion, not mirror). Row 3: 4/7 text/image (narrower text). Each row uses a different split; none are symmetric.

```
[ TEXT 5col  | IMAGE 7col           ]
[ IMAGE 7col     | TEXT 4col        ]
[ TEXT 4col  | IMAGE 7col           ]
```

### Kit 08 — Generous Minimal CTA

Contained, full padding (`py-40`), left-aligned. Large headline, no subhead needed, one text link (no button box). Lots of void. Used as a page-closer or chapter separator. Signals confidence.

```
                    [void left 3 cols]
[HEADLINE 6 cols ]
[link →           ]
                    [void left 3 cols]
```

---

## Rules for Our Builder

### The section layout kit: use one shape per section, never repeat consecutively

1. **Kit 01** — Asymmetric left-weighted hero (7/5 grid, bleed right)
2. **Kit 02** — Full-bleed band, scale contrast, display number/stat
3. **Kit 03** — Sticky-scroll feature reveal (split sticky/scroll)
4. **Kit 04** — Offset editorial spread (full-bleed image, bottom-left text)
5. **Kit 05** — Big numbered editorial list (horizontal, divide-x)
6. **Kit 06** — Weighted bento (dominant 2/3 cell + two small cells)
7. **Kit 07** — Alternating feature rows (3 rows, each a different split ratio)
8. **Kit 08** — Generous minimal CTA (left-aligned, mostly void, no button box)

### Hard rules

- **No two adjacent sections share the same layout shape.** If section N is sticky-scroll, section N+1 must be something else entirely.
- **Never use the centered-hero + even-3-card pattern.** This is the default the builder exists to escape.
- **Scale contrast is mandatory in every section.** At least one type size jump of 4× or greater per section (e.g., 11px label next to 72px headline).
- **Asymmetry is the default.** Centered layouts must be deliberate exceptions (Kit 08 is one). Justify the center; don't default to it.
- **At least one full-bleed element per page.** Full-bleed is dramatic *because* it contrasts with contained sections. One or two per page. Not every section.
- **Overlap at least one element across a section boundary.** A hero image that extends into the next section, or a section with negative top margin that eats into the previous one. This is the signal that layout was considered, not templated.
- **The left side of the grid is prime real estate.** F-pattern reading means left-heavy compositions are scanned first. Don't waste that gravity by centering everything.
- **Empty grid columns are not bugs.** An element that starts at column 3 of 12, leaving two columns void, communicates deliberate placement. Use empty columns as whitespace with direction.
- **Section backgrounds must alternate in weight.** Light / dark / light / dark, or light / light / dark / light — never five light sections in a row.
- **Whitespace is doubled.** Take the padding that feels like enough. Double it. Then use it.
