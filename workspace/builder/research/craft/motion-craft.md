# Motion Craft: Expensive vs Default Motion

A reference for Framer Motion + GSAP in Next.js. Every value here is specific. None of it is "use your judgment."

---

## The Core Problem With Default Motion

The browser's built-in `ease` is `cubic-bezier(0.25, 0.1, 0.25, 1)`. CSS `ease-out` is `cubic-bezier(0, 0, 0.58, 1)`. These are not wrong — they are just average. They were designed in the mid-2000s to feel "not jarring." They achieve that goal. They do not feel considered.

What separates expensive motion from average motion is not complexity. It is specificity. A Vercel dropdown, a Linear panel slide, an Apple sheet presentation: each of these was authored by someone who tuned a curve or a spring until the motion felt like it had weight and intention. The default curves did not produce those results.

Cheap motion is detectable at a glance. The tells: everything fades in at the same time, every interaction takes 300ms, the easing is symmetrical when it should not be, the spring bounces twice when it should settle once, the list items all appear simultaneously instead of cascading.

---

## 1. Custom Easing Curves

### Named curves — use these by name in your tokens module

**`fluentOut`** — confident entrance, the workhorse
```
cubic-bezier(0.16, 1, 0.3, 1)
```
Expo-class ease-out. Launches fast, lands soft. The Y-value of 1 on the first handle means the curve shoots almost straight up before decelerating. This is what makes Linear.app's panel reveals feel instantaneous yet smooth. Use for: elements entering the viewport, modals opening, sheets sliding in, any element that was off-screen arriving on-screen.

Compare to default `ease-out` (`0, 0, 0.58, 1`): the default barely accelerates. `fluentOut` front-loads the motion so the element feels like it arrives with purpose, not like it drifts in.

**`snappyOut`** — UI-response curve
```
cubic-bezier(0.22, 1, 0.36, 1)
```
Quint-class ease-out. Very close to `fluentOut` but with a softer landing. Use for: hover state transitions, button presses, dropdown opening, toggle switches, any interaction that must feel immediate. Duration for this curve should be 150–180ms max. If you use it at 300ms it will feel like a presentation slide.

**`smoothInOut`** — on-screen repositioning
```
cubic-bezier(0.645, 0.045, 0.355, 1)
```
Cubic ease-in-out. For elements already visible that need to move — accordion expansions, panel resizes, reordering, any positional shift where the element has context before and after. The symmetric acceleration/deceleration reads as deliberate movement rather than state-change.

**`anticipate`** — playful overshoot (use sparingly)
```
cubic-bezier(0.34, 1.56, 0.64, 1)
```
Note: the second control point Y-value of 1.56 exceeds the 0–1 range, which produces genuine overshoot — the element briefly passes its target before settling back. Use for: success confirmations, add-to-cart badges, notification counters, any moment of delight where slight elasticity is appropriate. Never use this on navigation or data-heavy UI where it reads as childish.

**`exitIn`** — decisive exit
```
cubic-bezier(0.55, 0, 1, 0.45)
```
Cubic ease-in. Elements leaving the screen should accelerate away — they are done and departing. The opposite of entrance easing. Exits should run 15–20% shorter than their paired entrance. A modal that enters at 400ms exits at 280ms.

**`subtleHover`** — color/opacity hover only
```
cubic-bezier(0.25, 0.1, 0.25, 1)
```
This is just CSS `ease`. Acceptable here because hover color changes are not spatial — there is no motion to shape. Use `ease` for background-color, color, border-color transitions. Do not use it for transform or positional animation.

### Why not `linear`

`linear` (`cubic-bezier(0, 0, 1, 1)`) moves at constant velocity. Nothing in physics does this. It is correct for: spinners, looping progress bars, marquees, time visualizations. It is wrong for: any entrance, exit, hover, modal, or transition. The reason it feels cheap is that the human eye expects objects to accelerate when they start and decelerate when they stop. `linear` violates that expectation without the user knowing why — they just feel vaguely that something is off.

### Why not default `ease`

`ease` (`cubic-bezier(0.25, 0.1, 0.25, 1)`) has its peak velocity around 40% through the animation, then decelerates for the remaining 60%. This makes entrances feel sluggish — the element starts slow, builds to speed, then slows again. The audience is waiting for it to arrive. `fluentOut` inverts this: maximum velocity at the start, all the deceleration at the landing. The element is already "there" when the curve completes.

---

## 2. Spring Physics Done Right

Springs model physics rather than time curves. Use them when the animation responds to direct user input (drag, flick, press) or when the motion should feel physical rather than scripted. Do not use springs for page-level transitions where you need predictable timing.

The three Framer Motion parameters:

- **stiffness**: how aggressively the spring pulls toward the target. Higher = snappier.
- **damping**: energy dissipation. Lower = more oscillations. Higher = settles immediately.
- **mass**: perceived weight. Higher = more inertia, slower to start and stop.

### Named spring presets

**`springSnappy`** — immediate UI feedback
```typescript
{ type: "spring", stiffness: 500, damping: 35, mass: 1 }
```
High stiffness ensures the element launches fast. Damping of 35 kills the oscillation within one partial overshoot — it settles quickly without bouncing. Use for: button press feedback, tooltip appearance, small badge animations, chip selection. Duration is physics-driven (~180ms perceived).

**`springSoft`** — weighted, considered motion
```typescript
{ type: "spring", stiffness: 300, damping: 28, mass: 1 }
```
The base spring for most modal/sheet/panel appearances. Has some elasticity but settles cleanly. This is the "feels physical but not cartoonish" zone. Use for: drawer open/close, sidebar expand, card flip, panel slides.

**`springBouncy`** — deliberate delight
```typescript
{ type: "spring", stiffness: 400, damping: 20, mass: 1 }
```
Damping of 20 means two visible oscillations before settling. The bounce is real and noticeable. This is not an accident — it is a design choice, deployed only where it communicates success, arrival, or delight. Use for: success states, notification pop-ins, emoji reactions, confetti elements, playful empty-state illustrations. Never for: navigation, form validation, error states, data tables.

**`springGentle`** — background/ambient motion
```typescript
{ type: "spring", stiffness: 200, damping: 26, mass: 1.2 }
```
Low stiffness and increased mass produce slow, weighted movement. Use for: background parallax, large hero sections, ambient floating elements, scroll-linked motion where abrupt response would jar.

### When not to use springs

- Page transitions: use easing curves with a fixed duration so multiple elements can choreograph.
- Exit animations: springs extend to infinity (damped oscillation), which means you cannot know when they end. Use a tween with `exitIn` instead.
- Reduced-motion mode: springs always require substitution with a tween.

---

## 3. Choreography and Orchestration

### The one-thing-at-a-time principle

When multiple elements animate together, only one should carry the primary motion. The rest follow. The eye cannot track two things simultaneously — split focus reads as noise. In a card reveal: the card container animates first, then its content fades in. In a navigation open: the overlay fades, then the menu items stagger in. Never both at the same speed.

### Stagger timing

The right stagger delay for list/grid items is 40–80ms. Below 40ms the stagger is invisible and the items appear simultaneous. Above 100ms the animation feels like it is waiting for itself to finish and users scroll past it.

For 5+ items, stagger should compress as the list grows:
- 2–4 items: 60–80ms between each
- 5–8 items: 40–60ms between each
- 9+ items: 30–40ms between each, or consider animating only the first 5 and making the rest appear instantly

In Framer Motion:
```typescript
staggerChildren: 0.06,     // 60ms
delayChildren: 0.1,        // 100ms initial delay before first child
```

In GSAP:
```javascript
gsap.from(".item", { opacity: 0, y: 20, stagger: 0.06, ease: "power3.out", duration: 0.5 })
```

### Sequencing: parent before child

Always animate container before content. The container establishes spatial context; the content confirms it. A modal that fades in while its contents simultaneously appear reads as "one thing." A modal that slides in (300ms) and then its form fields stagger in (starting at 200ms, delayed 0.1s from modal start) reads as "I opened a door and walked into a room."

Implementation: use Framer Motion's `staggerChildren` on the parent `variants` object, and set a small `delayChildren` to overlap but not race with the parent entrance.

### Anticipation

A 5–8% scale-down before a button trigger (scale: 0.96–0.97 on `:active`) provides haptic-like feedback. This is the digital equivalent of pressing a physical key. The anticipation phase (compress) is 80–100ms. The release (back to 1.0 or slight overshoot to 1.02) is 120–150ms with `springSnappy`.

### Follow-through and settle

An element that overshoots its target by 2–3% before settling reads as having mass. An element that stops exactly at its target reads as teleporting. This is why `springBouncy` with controlled parameters feels more real than a tween that ends at exactly `y: 0`. The overshoot should be small: scale 1.03, translate 3–5px past target. Large overshoot (>8%) reads as cartoonish.

### Direction and spatial consistency

If a panel enters from the right, it exits to the right. If a modal grows from the trigger, it shrinks back toward it (use `scale` + `transformOrigin`). Violating spatial consistency — entering from right, exiting downward — creates disorientation that users cannot name but always feel.

---

## 4. Timing

### Duration by interaction type

| Interaction | Range | Notes |
|---|---|---|
| Hover (color, opacity only) | 120–180ms | Use `subtleHover` ease. Faster feels jumpy; slower feels sticky. |
| Hover (transform: scale) | 150–200ms | Use `snappyOut`. This needs a tiny bit more time to feel physical. |
| Button press feedback | 80–120ms (down) + 120–150ms (up) | Asymmetric. Press is faster than release. |
| Tooltip | 150ms in, 100ms out | Exits are always shorter than entrances. |
| Dropdown / popover | 180–220ms | Enters with `fluentOut`. Use spring for content. |
| Modal open | 350–420ms | Container first, content stagger starts at ~200ms. |
| Modal close | 250–300ms | Faster than open. Use `exitIn`. |
| Sheet / drawer slide | 380–460ms | Physical distance = longer time needed. |
| Page transition | 400–550ms | The full viewport is changing; give the eye time to reorient. |
| Content reveal (scroll-triggered) | 500–700ms | Long because this is storytelling, not response. |
| Background / ambient motion | 800–1200ms | Should feel imperceptible as motion, only as atmosphere. |

### Why 300ms-for-everything fails

300ms became the default because it was "not too fast, not too slow" — a compromise. The problem: a hover that takes 300ms feels laggy. A modal that closes in 300ms lingers. A page transition that takes 300ms feels exactly as long as it takes. The human eye processes motion at different cadences depending on what it expects. A hover is a micro-interaction — 300ms is 2–3x too long. A page change is a major navigation event — 300ms may be too short to feel intentional.

The rule: make hover fast (the UI is responding), make reveals slow (you are presenting something), and make exits faster than entrances (the user's attention has already moved on).

### Asymmetric enter/exit

Entrances and exits should never take the same time. Entrances pull attention toward the new state; exits release attention toward what comes next. Exit animations 15–25% shorter than entrances is the baseline. For tooltips: enter 150ms, exit 80ms. For modals: enter 400ms, exit 280ms.

---

## 5. The Cheap Motion Ban List

Things that make motion feel AI-generated, amateur, or unfinished:

**Linear easing on anything that moves spatially.** The instant tell that motion was not designed — it was switched on.

**All elements animating at the same duration.** Every transition at 300ms. Every hover at 300ms. Every modal at 300ms. Uniform timing removes hierarchy — the user cannot tell what matters.

**Everything fading in simultaneously.** A card grid where all 12 cards fade in together at t=0. A list where all items appear at the same frame. This is not animation; it is a state toggle with opacity.

**`transition: all`.** Animates every CSS property that changes, including those that should not be animated (width, height, border-radius as the browser calculates layout). It is also a performance hazard. Explicitly name `transform, opacity`.

**Too slow.** Any hover over 250ms. Any tooltip over 200ms. Any button feedback over 200ms. Slow micro-interactions feel like the UI is stuck, not considered.

**Too bouncy.** `springBouncy` on navigation. Bouncing on a tab switch is disorienting. Bouncing on an error message is tone-deaf. Bounce is a flavor — use it where the emotional register calls for it.

**Ease-in for entrances.** Elements that start slow and accelerate into place feel like they are arriving late. The user waits for them.

**Scale `0` to `1` with no translate.** A pure scale reveal with no spatial direction reads as the element "poofing" into existence. Pair scale with a small translate (8–12px) in the direction of origin.

**Matching enter and exit animations exactly.** Entering top→bottom and exiting also top→bottom feels like a loop. Exits should reverse the spatial logic.

**Ignoring `prefers-reduced-motion`.** This is not aesthetic — it is accessibility. Users with vestibular disorders experience nausea from parallax and transform-heavy motion. All motion should have a no-motion equivalent.

---

## Rules for our builder

### Motion tokens module

```typescript
// motion-tokens.ts
// Import these wherever you animate. Never hardcode values inline.

import { Variants, Transition } from "framer-motion";

// ─── EASINGS ──────────────────────────────────────────────────────────────────
// Named cubic-bezier curves. Use in Framer Motion as ease arrays or in GSAP as
// CustomEase / gsap.to({ ease: ... }) with the CSS value.

export const ease = {
  // Confident entrance: fast launch, soft landing. Primary curve for entering elements.
  fluentOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  // Snappy UI response: very fast, slightly softer landing. For hover/micro.
  snappyOut: [0.22, 1, 0.36, 1] as [number, number, number, number],
  // On-screen repositioning: symmetric ramp. For elements already visible that shift.
  smoothInOut: [0.645, 0.045, 0.355, 1] as [number, number, number, number],
  // Playful overshoot: Y > 1 produces real bounce. Use for delight moments only.
  anticipate: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  // Decisive exit: accelerates away. Pair with 15-25% shorter duration than entrance.
  exitIn: [0.55, 0, 1, 0.45] as [number, number, number, number],
  // Color/opacity hover only. Not for transform.
  subtleHover: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  // GSAP string equivalents (pass to gsap.to({ ease: "..." }))
  gsap: {
    fluentOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    snappyOut: "cubic-bezier(0.22, 1, 0.36, 1)",
    smoothInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
    anticipate: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    exitIn: "cubic-bezier(0.55, 0, 1, 0.45)",
  },
} as const;

// ─── DURATIONS ────────────────────────────────────────────────────────────────
// All in seconds (Framer Motion convention). Multiply by 1000 for GSAP/CSS ms.

export const duration = {
  hover: 0.15,          // 150ms — hover color/opacity
  hoverTransform: 0.18, // 180ms — hover with scale/position
  micro: 0.12,          // 120ms — button press down stroke
  microRelease: 0.15,   // 150ms — button press release
  tooltip: 0.15,        // 150ms in, use tooltipExit for out
  tooltipExit: 0.08,    // 80ms — exits are faster
  dropdown: 0.2,        // 200ms
  modal: 0.4,           // 400ms entrance
  modalExit: 0.28,      // 280ms exit
  sheet: 0.42,          // 420ms drawer/sheet
  sheetExit: 0.3,       // 300ms
  page: 0.5,            // 500ms page transition
  pageExit: 0.35,       // 350ms
  reveal: 0.6,          // 600ms scroll-triggered content reveal
  ambient: 1.0,         // 1000ms background/atmospheric motion
} as const;

// ─── SPRINGS ──────────────────────────────────────────────────────────────────
// Physics-based transitions. Use for gesture-driven or physical-feeling motion.
// Do NOT use for exits (spring duration is unbounded).

export const spring = {
  // Immediate UI feedback. Settles in ~1 oscillation. Tooltips, badges, chips.
  snappy: {
    type: "spring" as const,
    stiffness: 500,
    damping: 35,
    mass: 1,
  },
  // Standard physical motion. Modals, panels, drawers, cards.
  soft: {
    type: "spring" as const,
    stiffness: 300,
    damping: 28,
    mass: 1,
  },
  // Deliberate bounce. Success states, delight moments, notification pop-ins only.
  bouncy: {
    type: "spring" as const,
    stiffness: 400,
    damping: 20,
    mass: 1,
  },
  // Weighted/ambient. Background parallax, large heroes, scroll-linked.
  gentle: {
    type: "spring" as const,
    stiffness: 200,
    damping: 26,
    mass: 1.2,
  },
} as const;

// ─── STAGGER ──────────────────────────────────────────────────────────────────

export const stagger = {
  // Initial delay before first child starts (container has had time to appear)
  childDelay: 0.1,   // 100ms
  // Per-item delay for small lists (2–4 items)
  small: 0.08,       // 80ms
  // Per-item delay for standard lists (5–8 items)
  base: 0.06,        // 60ms
  // Per-item delay for large lists (9+ items)
  large: 0.04,       // 40ms
} as const;

// ─── VARIANT FACTORIES ───────────────────────────────────────────────────────
// Pre-built Framer Motion variant objects for common patterns.

// Fade + rise from below: the standard content reveal
export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.reveal, ease: ease.fluentOut },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: duration.page, ease: ease.exitIn },
  },
} satisfies Variants;

// Fade + slight scale: for modals, popovers, cards entering
export const fadeScale = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.modal, ease: ease.fluentOut },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: duration.modalExit, ease: ease.exitIn },
  },
} satisfies Variants;

// Staggered list container
export const staggerContainer = (
  staggerDelay = stagger.base,
  childDelayOffset = stagger.childDelay
): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: childDelayOffset,
    },
  },
});

// Individual list item
export const listItem = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: ease.fluentOut },
  },
} satisfies Variants;

// Slide in from right (navigation panels, drawers)
export const slideInRight = {
  hidden: { opacity: 0, x: 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.sheet, ease: ease.fluentOut },
  },
  exit: {
    opacity: 0,
    x: 24,
    transition: { duration: duration.sheetExit, ease: ease.exitIn },
  },
} satisfies Variants;

// Button press / haptic scale
export const buttonPress = {
  rest: { scale: 1 },
  pressed: {
    scale: 0.97,
    transition: { duration: duration.micro, ease: ease.snappyOut },
  },
  release: {
    scale: 1,
    transition: spring.snappy,
  },
} satisfies Variants;

// ─── REDUCED MOTION ───────────────────────────────────────────────────────────

// Wrap any transition in this to respect prefers-reduced-motion.
// Usage: transition={{ ...(prefersReducedMotion ? reducedTransition : spring.soft) }}
export const reducedTransition: Transition = {
  type: "tween",
  duration: 0.01,
  ease: "linear",
};
```

---

### Do / Do Not

**Do:**
- Front-load velocity in entrances. `fluentOut` not `ease-out`.
- Make exits shorter than entrances. Always. No exceptions.
- Stagger list items. One thing moves, then the next.
- Pair translate + opacity. Never fade alone on elements with spatial context.
- Use spring for press/gesture/physical feedback. Use tween for scripted transitions.
- Apply `springBouncy` only where the interaction tone is celebratory.
- Honor `prefers-reduced-motion` with a `0.01s linear` substitution.
- Animate `transform` and `opacity` only. Never `width`, `height`, `top`, `left`.

**Do not:**
- Use `linear` for anything that moves spatially.
- Use the same duration for hover and modal open.
- Animate all list items simultaneously.
- Use `transition: all`.
- Animate elements users interact with dozens of times per session (tabs, nav links, text inputs) — the motion becomes noise.
- Use `ease-in` for entrances.
- Use `springBouncy` on navigation, error states, or data tables.
- Set spring animations on exits (use `exitIn` tween instead).
- Use scale range outside 0.94–1.06 for UI feedback. Outside that range = cartoonish.
- Skip `will-change: transform` on GPU-accelerated animations that run frequently.
