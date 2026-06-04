# Motion Language Playbook

> Framer Motion (now `motion/react`, v12+) in Next.js App Router.
> Grounded in motion.dev docs, real premium site patterns, and taste rules.
> The final section is copy-paste ready for the builder.

---

## 1. The Motion Token System

A single TypeScript module exported from `lib/motion-tokens.ts`. Import it everywhere — no magic numbers scattered through components.

### `lib/motion-tokens.ts`

```ts
// ─── EASINGS ────────────────────────────────────────────────────────────────
// Apple-like: fast out, gentle settle — the workhorse
export const easeApple   = [0.25, 0.1, 0.25, 1] as const
// Crisp expo out: snappy entrance, zero overshoot
export const easeSnap    = [0.16, 1, 0.3, 1] as const
// Gentle decelerate: content reveals, modals
export const easeOut     = [0.0, 0.0, 0.2, 1] as const
// Ease in-out for shared-element / layout transitions
export const easeMid     = [0.4, 0.0, 0.2, 1] as const

// ─── SPRINGS ────────────────────────────────────────────────────────────────
// Button press — tight, zero bounce
export const springPress: SpringConfig = {
  type: "spring", stiffness: 500, damping: 40, mass: 0.6,
}
// Hover lift — slightly looser
export const springHover: SpringConfig = {
  type: "spring", stiffness: 300, damping: 28, mass: 0.6,
}
// Magnetic follow — very light, lags behind cursor
export const springMagnetic: SpringConfig = {
  damping: 20, stiffness: 150, mass: 0.5,
}
// Card tilt — fast respond, gentle settle
export const springTilt: SpringConfig = {
  type: "spring", stiffness: 400, damping: 30, mass: 0.4,
}
// Page/route transition — medium weight
export const springPage: SpringConfig = {
  type: "spring", stiffness: 260, damping: 30, mass: 0.8,
}
// Toast/dialog — enters with a small bounce
export const springDialog: SpringConfig = {
  type: "spring", stiffness: 350, damping: 28, bounce: 0.15,
}

// ─── DURATION SCALE (seconds) ───────────────────────────────────────────────
export const duration = {
  xs:  0.10,   // micro: icon swap, color flash
  sm:  0.18,   // button press, hover state change
  md:  0.28,   // card hover, underline, tab indicator
  lg:  0.38,   // panel slide, modal enter
  xl:  0.55,   // page transition, hero reveal
} as const

// ─── STAGGER ────────────────────────────────────────────────────────────────
export const stagger = {
  fast:   0.04,   // tight lists, grid items
  normal: 0.07,   // typical card grids
  slow:   0.12,   // hero word-by-word, section reveals
} as const

// ─── VIEWPORT THRESHOLDS (for whileInView) ──────────────────────────────────
export const viewport = {
  once:   { once: true,  amount: 0.15 },
  repeat: { once: false, amount: 0.2  },
  half:   { once: true,  amount: 0.5  },
} as const

// ─── TYPES ──────────────────────────────────────────────────────────────────
type SpringConfig = {
  type?: "spring"
  stiffness?: number
  damping?: number
  mass?: number
  velocity?: number
  bounce?: number
  restSpeed?: number
  restDelta?: number
}
```

### Why these values

| Token | Rationale |
|---|---|
| `easeApple [0.25,0.1,0.25,1]` | Identical to Apple's `ease` from HIG; feels native on any platform |
| `easeSnap [0.16,1,0.3,1]` | Vercel/Linear's entrance easing — fast decelerate, lands crisp |
| `springPress stiffness:500` | High stiffness = instant response; damping:40 = no rattle |
| `springMagnetic damping:20` | Low stiffness keeps magnetic lag that feels physical |
| `duration.sm 180ms` | Hover states under 200ms feel instantaneous; over 300ms feel slow |

---

## 2. Micro-Interactions

### 2a. Button — Hover + Press Spring

```tsx
// components/ui/PressButton.tsx
"use client"
import { motion } from "motion/react"
import { springPress, springHover, duration } from "@/lib/motion-tokens"
import { useReducedMotion } from "motion/react"

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

export function PressButton({ children, ...rest }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      whileHover={reduced ? {} : {
        scale: 1.03,
        transition: springHover,
      }}
      whileTap={reduced ? {} : {
        scale: 0.96,
        transition: springPress,
      }}
      transition={{ duration: duration.sm }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
```

**Taste note:** `scale: 1.03` is the ceiling — bigger than that reads as broken. Press snaps to `0.96` to give physical click feedback.

---

### 2b. Magnetic Button

The element warps toward the cursor while inside a radius; springs back on leave.

```tsx
// components/ui/MagneticButton.tsx
"use client"
import { useRef, useCallback } from "react"
import { motion, useMotionValue, useSpring } from "motion/react"
import { springMagnetic } from "@/lib/motion-tokens"

const MAX_PULL = 0.35   // 35% of element width/height at maximum

interface Props {
  children: React.ReactNode
  className?: string
}

export function MagneticButton({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, springMagnetic)
  const sy = useSpring(y, springMagnetic)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return
    const { left, top, width, height } = ref.current.getBoundingClientRect()
    const cx = left + width  / 2
    const cy = top  + height / 2
    x.set((e.clientX - cx) * MAX_PULL)
    y.set((e.clientY - cy) * MAX_PULL)
  }, [x, y])

  const handleMouseLeave = useCallback(() => {
    x.set(0)
    y.set(0)
  }, [x, y])

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Usage:
// <MagneticButton>
//   <PressButton>Get started</PressButton>
// </MagneticButton>
```

**Taste note:** `MAX_PULL = 0.35` is the sweet spot. Lower (0.2) feels broken; higher (0.6) feels silly. Combine with `springMagnetic` (low stiffness, 150) so the lag is tangible — that's the premium feel.

---

### 2c. Card Hover Lift + Subtle Tilt

```tsx
// components/ui/HoverCard.tsx
"use client"
import { useRef, useCallback } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"
import { springTilt, springHover } from "@/lib/motion-tokens"

const TILT_MAX = 8   // degrees

export function HoverCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [TILT_MAX, -TILT_MAX]), springTilt)
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-TILT_MAX, TILT_MAX]), springTilt)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const { left, top, width, height } = ref.current.getBoundingClientRect()
    mouseX.set((e.clientX - left) / width  - 0.5)
    mouseY.set((e.clientY - top)  / height - 0.5)
  }, [mouseX, mouseY])

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0)
    mouseY.set(0)
  }, [mouseX, mouseY])

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      whileHover={{ y: -6, transition: springHover }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  )
}
```

**Taste note:** Wrap the card in `perspective: 800px` via CSS on the parent. `TILT_MAX = 8deg` is the cap — beyond 12 degrees the card looks broken. The y lift (`-6px`) pairs with a box-shadow CSS transition for the most premium feel.

---

### 2d. Animated Underline (Text Link)

CSS-only underlines are fine; animated ones that grow from center feel crafted.

```tsx
// components/ui/AnimatedLink.tsx
"use client"
import { motion } from "motion/react"
import { easeSnap, duration } from "@/lib/motion-tokens"

export function AnimatedLink({ children, href, className }: {
  children: React.ReactNode
  href: string
  className?: string
}) {
  return (
    <a href={href} className={`relative inline-block ${className ?? ""}`}>
      {children}
      <motion.span
        className="absolute bottom-0 left-0 h-px w-full bg-current origin-left"
        initial={{ scaleX: 0 }}
        whileHover={{ scaleX: 1 }}
        transition={{ duration: duration.md, ease: easeSnap }}
        style={{ transformOrigin: "left" }}
      />
    </a>
  )
}
```

**Taste note:** Use `origin-left` for left-to-right grow. For center-out use `origin-center`. The underline should be `1px` — thicker reads as a border, not an accent.

---

### 2e. Icon Transition (Swap with Crossfade)

```tsx
// components/ui/AnimatedIcon.tsx
"use client"
import { AnimatePresence, motion } from "motion/react"
import { duration, easeApple } from "@/lib/motion-tokens"

export function AnimatedIcon({ icon: Icon, id }: { icon: React.ElementType; id: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={id}
        initial={{ opacity: 0, scale: 0.7, rotate: -15 }}
        animate={{ opacity: 1, scale: 1,   rotate: 0   }}
        exit={{    opacity: 0, scale: 0.7, rotate:  15 }}
        transition={{ duration: duration.xs, ease: easeApple }}
        style={{ display: "inline-flex" }}
      >
        <Icon />
      </motion.span>
    </AnimatePresence>
  )
}

// Usage — toggle between CheckIcon / CopyIcon:
// <AnimatedIcon icon={copied ? CheckIcon : CopyIcon} id={copied ? "check" : "copy"} />
```

---

## 3. Reveal Animations (Scroll-Triggered)

### 3a. Single Element Fade-Up

```tsx
// components/ui/Reveal.tsx
"use client"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"
import { easeSnap, duration, viewport } from "@/lib/motion-tokens"

interface Props {
  children: React.ReactNode
  delay?: number
  className?: string
}

export function Reveal({ children, delay = 0, className }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport.once}
      transition={{ duration: duration.lg, ease: easeSnap, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
```

### 3b. Staggered Children Grid

```tsx
// components/ui/StaggerGrid.tsx
"use client"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"
import { easeSnap, duration, stagger, viewport } from "@/lib/motion-tokens"

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: stagger.normal,
      delayChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,
    transition: { duration: duration.lg, ease: easeSnap },
  },
}

export function StaggerGrid({ children, className }: {
  children: React.ReactNode[]
  className?: string
}) {
  const reduced = useReducedMotion()

  return (
    <motion.ul
      variants={reduced ? {} : container}
      initial="hidden"
      whileInView="show"
      viewport={viewport.once}
      className={className}
    >
      {children.map((child, i) => (
        <motion.li key={i} variants={reduced ? {} : item}>
          {child}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

**Taste note:** `stagger.normal = 0.07s` means 6 cards stagger across 420ms total — perceptible but not slow. More than 10 items? Drop to `stagger.fast = 0.04s`. Never stagger more than `0.12s` between items.

**Viewport threshold:** `amount: 0.15` means the animation fires when 15% of the element enters the viewport — the element is just peeking in, creating momentum. `amount: 0.5` waits for half the element, which is right for large hero sections.

---

## 4. Page / Route Transitions (App Router)

The App Router problem: `layout.tsx` persists across routes (no remount), so AnimatePresence can't detect changes there. `template.tsx` **remounts on every navigation**, making it the right slot for page transitions.

### `app/template.tsx`

```tsx
// app/template.tsx
"use client"
import { motion } from "motion/react"
import { easeSnap, duration } from "@/lib/motion-tokens"

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0  }}
      exit={{    opacity: 0, y: -8  }}
      transition={{ duration: duration.xl, ease: easeSnap }}
    >
      {children}
    </motion.div>
  )
}
```

**Why this works without AnimatePresence:** `template.tsx` unmounts and remounts on every navigation, so `initial` fires automatically. Exit animations require `AnimatePresence` wrapping the router — for most sites the enter-only pattern is correct and simpler.

### Full Exit Animation (when you need it)

When you need exit animations, use a `LayoutTransition` wrapper that freezes the router context during the exit so Next.js doesn't yank the component tree mid-animation.

```tsx
// components/LayoutTransition.tsx
"use client"
import {
  AnimatePresence, motion, MotionProps,
} from "motion/react"
import {
  LayoutRouterContext,
} from "next/dist/shared/lib/app-router-context.shared-runtime"
import { useSelectedLayoutSegment } from "next/navigation"
import { useRef, useContext } from "react"

function FrozenRouter({ children }: { children: React.ReactNode }) {
  const context = useContext(LayoutRouterContext)
  const frozen   = useRef(context)
  return (
    <LayoutRouterContext.Provider value={frozen.current}>
      {children}
    </LayoutRouterContext.Provider>
  )
}

interface Props extends MotionProps {
  children: React.ReactNode
}

export function LayoutTransition({ children, ...motionProps }: Props) {
  const segment = useSelectedLayoutSegment()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={segment} {...motionProps}>
        <FrozenRouter>{children}</FrozenRouter>
      </motion.div>
    </AnimatePresence>
  )
}

// In app/layout.tsx:
// <LayoutTransition
//   initial={{ opacity: 0, y: 16 }}
//   animate={{ opacity: 1,  y: 0  }}
//   exit={{    opacity: 0,  y: -8  }}
//   transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
// >
//   {children}
// </LayoutTransition>
```

---

## 5. Navigation

### 5a. Hide / Show on Scroll

```tsx
// components/Nav.tsx
"use client"
import { useState } from "react"
import { motion, useScroll, useMotionValueEvent } from "motion/react"
import { easeApple, duration } from "@/lib/motion-tokens"

const SCROLL_THRESHOLD = 150   // px before hide triggers

export function Nav({ children }: { children: React.ReactNode }) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)

  useMotionValueEvent(scrollY, "change", (current) => {
    const previous = scrollY.getPrevious() ?? 0
    if (current > previous && current > SCROLL_THRESHOLD) {
      setHidden(true)
    } else {
      setHidden(false)
    }
  })

  return (
    <motion.header
      animate={{
        y:       hidden ? "-110%" : "0%",
        opacity: hidden ? 0        : 1,
      }}
      transition={{ duration: duration.md, ease: easeApple }}
      className="fixed top-0 inset-x-0 z-50"
    >
      {children}
    </motion.header>
  )
}
```

**Taste note:** `-110%` instead of `-100%` ensures the box shadow / border fully clears the viewport top. `SCROLL_THRESHOLD = 150` prevents micro-hides on tiny scrolls at the page top.

---

### 5b. Active Link Indicator (layoutId)

```tsx
// components/NavTabs.tsx
"use client"
import { useState } from "react"
import { motion, LayoutGroup } from "motion/react"
import { springHover } from "@/lib/motion-tokens"

const tabs = ["Home", "Work", "About", "Contact"]

export function NavTabs() {
  const [active, setActive] = useState("Home")

  return (
    <LayoutGroup id="nav">
      <nav className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className="relative px-3 py-1.5 text-sm font-medium"
          >
            {tab}
            {active === tab && (
              <motion.span
                layoutId="nav-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full"
                transition={springHover}
              />
            )}
          </button>
        ))}
      </nav>
    </LayoutGroup>
  )
}
```

**Taste note:** `LayoutGroup id="nav"` scopes the `layoutId` so multiple nav instances on the same page don't interfere. The underline is `h-0.5` (2px) — a hairline. Thicker reads as a tab bar, not an indicator.

For a pill/background indicator instead of an underline:

```tsx
{active === tab && (
  <motion.span
    layoutId="nav-pill"
    className="absolute inset-0 rounded-md bg-muted -z-10"
    transition={springHover}
  />
)}
```

---

### 5c. Animated Mobile Menu

```tsx
// components/MobileMenu.tsx
"use client"
import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { springDialog, duration, easeSnap, stagger } from "@/lib/motion-tokens"

const menuItems = ["Home", "Work", "About", "Contact"]

const backdropVariants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: duration.md } },
}

const drawerVariants = {
  hidden: { x: "100%" },
  show:   { x: "0%",  transition: springDialog },
}

const listVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: stagger.normal, delayChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  show:   { opacity: 1, x: 0,  transition: { duration: duration.md, ease: easeSnap } },
}

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Menu</button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              key="drawer"
              variants={drawerVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              className="fixed right-0 top-0 bottom-0 w-72 bg-background z-50 p-8"
            >
              <motion.ul variants={listVariants} initial="hidden" animate="show">
                {menuItems.map((item) => (
                  <motion.li key={item} variants={itemVariants}>
                    <a href={`#${item.toLowerCase()}`} onClick={() => setOpen(false)}>
                      {item}
                    </a>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
```

---

## 6. Feedback: Toast + Dialog Enter/Exit

### 6a. Toast

```tsx
// components/ui/Toast.tsx
"use client"
import { AnimatePresence, motion } from "motion/react"
import { springDialog, duration, easeSnap } from "@/lib/motion-tokens"

interface ToastProps {
  message: string
  visible: boolean
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="toast"
          initial={{ opacity: 0, y: 20,  scale: 0.94 }}
          animate={{ opacity: 1, y: 0,   scale: 1    }}
          exit={{    opacity: 0, y: 16,  scale: 0.94 }}
          transition={springDialog}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                     bg-foreground text-background text-sm px-4 py-2.5 rounded-full shadow-lg"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Taste note:** Toasts enter from below (`y: 20`), exit downward (`y: 16`) — they do not flip. `scale: 0.94` on enter/exit prevents the jarring pop-in of a pure opacity fade. `springDialog` gives the slight bounce on entry that signals "action confirmed."

---

### 6b. Dialog / Modal

```tsx
// components/ui/Dialog.tsx
"use client"
import { AnimatePresence, motion } from "motion/react"
import { springDialog, duration, easeApple } from "@/lib/motion-tokens"

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function Dialog({ open, onClose, children }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            transition={{ duration: duration.md, ease: easeApple }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.96, y: 8  }}
            transition={springDialog}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50
                       bg-background rounded-2xl p-6 shadow-2xl max-w-md mx-auto"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### 6c. Skeleton Loading State

Skeletons should pulse, not shimmer (shimmer is harder to get right and rarely adds value).

```tsx
// components/ui/Skeleton.tsx
import { motion } from "motion/react"

export function Skeleton({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className={`rounded-md bg-muted ${className ?? ""}`}
    />
  )
}

// Usage:
// <Skeleton className="h-4 w-3/4" />
// <Skeleton className="h-4 w-1/2 mt-2" />
```

**Taste note:** `duration: 1.6s` — slower than most libraries (which use 1s). The slower pulse reads as "calm background work" not "broken loading." Never animate more than 3 skeletons differently; use the same `animate` value so they pulse in sync.

---

## 7. Accessibility — useReducedMotion

Every component above should respect `prefers-reduced-motion`. The pattern:

```tsx
// lib/use-safe-motion.ts
import { useReducedMotion } from "motion/react"

/**
 * Returns motion props that respect prefers-reduced-motion.
 * Pass `full` props; get back either those props or instant fallbacks.
 */
export function useSafeMotion<T extends Record<string, unknown>>(
  fullProps: T,
  reducedProps?: Partial<T>,
): T {
  const reduced = useReducedMotion()
  if (!reduced) return fullProps
  return {
    ...fullProps,
    ...reducedProps,
    initial:    false,
    animate:    fullProps.animate,   // still apply final state
    transition: { duration: 0 },
    whileHover: {},
    whileTap:   {},
  } as T
}
```

**Rule:** `useReducedMotion()` returns `true` → zero-duration transitions, no springs, no scale. The component still reaches its final animated state — it just gets there instantly.

---

## 8. Taste Rules

| Rule | Value |
|---|---|
| Fast | 150–400ms for all interactions; hero reveals up to 550ms |
| Spring not linear | Physical properties (`x`, `y`, `scale`) always use spring; opacity/color use tween |
| Subtle | Scale: max +3% hover, −4% press. Y lift: max 8px. Tilt: max 8°. |
| Consistent | One easing per role — `easeSnap` for entrances, `easeApple` for nav, springs for gestures |
| Stagger cap | Never stagger more than `0.12s` between items; cap total stagger at ~600ms |
| Reduced motion | Zero-duration, no springs, final state still applied |
| No bounce on nav | `springHover` (damping:28) for layout indicators — just enough to feel springy, no oscillation |
| whileInView once | Set `viewport={{ once: true }}` on all marketing reveals — replay on scroll is distracting |
| Performance | Animate only `transform` and `opacity` — never `width`, `height`, `top`, `left` directly |

---

## Rules for our builder

> Copy-paste the tokens module and key snippets below into generated sites.

### Motion Tokens Module (drop into `lib/motion-tokens.ts`)

```ts
import type { Transition } from "motion/react"

export const easeApple  = [0.25, 0.1, 0.25, 1] as [number,number,number,number]
export const easeSnap   = [0.16, 1,   0.3,  1] as [number,number,number,number]
export const easeOut    = [0.0,  0.0, 0.2,  1] as [number,number,number,number]
export const easeMid    = [0.4,  0.0, 0.2,  1] as [number,number,number,number]

export const springPress: Transition    = { type:"spring", stiffness:500, damping:40,  mass:0.6 }
export const springHover: Transition    = { type:"spring", stiffness:300, damping:28,  mass:0.6 }
export const springMagnetic             = { damping:20,    stiffness:150, mass:0.5 }
export const springTilt: Transition     = { type:"spring", stiffness:400, damping:30,  mass:0.4 }
export const springPage: Transition     = { type:"spring", stiffness:260, damping:30,  mass:0.8 }
export const springDialog: Transition   = { type:"spring", stiffness:350, damping:28,  bounce:0.15 }

export const dur = { xs:0.10, sm:0.18, md:0.28, lg:0.38, xl:0.55 } as const
export const stag = { fast:0.04, normal:0.07, slow:0.12 } as const
export const vp   = {
  once:   { once:true,  amount:0.15 },
  repeat: { once:false, amount:0.2  },
  half:   { once:true,  amount:0.5  },
} as const
```

### Builder Interaction Rules

1. Buttons — always `whileTap={{ scale: 0.96, transition: springPress }}` + `whileHover={{ scale: 1.03, transition: springHover }}`
2. Cards in grids — `StaggerGrid` with `stag.normal`, `vp.once`, fade-up item variants
3. Page shell — `app/template.tsx` with `initial={{ opacity:0, y:16 }}` + `easeSnap`
4. Nav — `useScroll` + `useMotionValueEvent`, hide at `> 150px` scrolling down; `layoutId` for active tab
5. Toasts — `AnimatePresence mode="wait"`, enter from `y:20`, exit to `y:16`, `springDialog`
6. All motion — wrap in `useReducedMotion()` guard; set `transition:{ duration:0 }` when true
7. Never animate `width`, `height`, `top`, `left` — only `transform` + `opacity`
8. Import from `motion/react` (v12+ package), not `framer-motion`
