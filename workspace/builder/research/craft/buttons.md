# Button Library — Bespoke Treatments & Micro-Animations

> Research-grounded, copy-pasteable React + Tailwind + Framer Motion components for Next.js.
> Every pattern is sourced from Codrops, Olivier Larose, buildui.com, and production premium sites.
> Stack: `motion` (formerly framer-motion), Tailwind CSS v3+, TypeScript.

---

## Setup

```bash
npm install motion
```

```tsx
// All components use "motion/react" (the new package name post-2024 rename)
import { motion, useMotionValue, useMotionTemplate, useSpring } from "motion/react"
```

Global reduced-motion reset — add to your `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 1. Magnetic Button

**When to use:** Hero CTAs, nav items, anywhere you want the button to reach out and grab the cursor. Popularized by Locomotive, Used By Few, awwwards sites. Restraint: radius of effect should be ~0.4× the element's own size — larger than that feels broken.

**Source:** Olivier Larose's tutorial (blog.olivierlarose.com/tutorials/magnetic-button) + GSAP community patterns.

**Taste notes:** Spring stiffness 150 / damping 15 / mass 0.1 gives a quick snap with a light overshoot. Don't go below damping 10 — you get nausea. The wrapper moves; the label inside can counter-translate at 0.3× for parallax depth.

```tsx
// components/ui/MagneticButton.tsx
"use client"

import { useRef, useState, useCallback } from "react"
import { motion, useReducedMotion } from "motion/react"

interface MagneticButtonProps {
  children: React.ReactNode
  className?: string
  strength?: number // 0–1, default 0.4
}

export function MagneticButton({
  children,
  className = "",
  strength = 0.4,
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const shouldReduce = useReducedMotion()

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current || shouldReduce) return
      const { clientX, clientY } = e
      const { height, width, left, top } = ref.current.getBoundingClientRect()
      const midX = clientX - (left + width / 2)
      const midY = clientY - (top + height / 2)
      setPosition({ x: midX * strength, y: midY * strength })
    },
    [strength, shouldReduce]
  )

  const reset = useCallback(() => setPosition({ x: 0, y: 0 }), [])

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      animate={shouldReduce ? {} : { x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className="inline-block"
    >
      {/* Inner counter-translate for depth — remove if not needed */}
      <motion.div
        animate={shouldReduce ? {} : { x: -position.x * 0.3, y: -position.y * 0.3 }}
        transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      >
        <button
          className={`relative px-8 py-4 rounded-full font-medium text-sm tracking-wide
            bg-white text-black border border-neutral-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
            ${className}`}
        >
          {children}
        </button>
      </motion.div>
    </motion.div>
  )
}
```

**Usage:**
```tsx
<MagneticButton strength={0.35}>Get started</MagneticButton>
```

---

## 2. Fill-Sweep / Background Wipe on Hover

**When to use:** Outlined ghost buttons, secondary CTAs, nav pill items. The filled state reveals on hover with a horizontal wipe — far more alive than a simple background-color transition.

**Source:** Codrops "Ideas for CSS Button Hover Animations" — scale-origin technique. The pseudo-element approach keeps the focus ring intact (clipping the button element itself cuts off `:focus-visible` outlines).

**Taste notes:** `cubic-bezier(0.19, 1, 0.22, 1)` (expo ease-out) at 0.4s. The fill lives on a `::before` pseudo-element. Text color cross-fades with `mix-blend-mode: difference` or a second absolute label — the latter is more reliable cross-browser.

```tsx
// components/ui/FillSweepButton.tsx
"use client"

import { motion } from "motion/react"
import { useState } from "react"

interface FillSweepButtonProps {
  children: React.ReactNode
  className?: string
  fillColor?: string
  textHoverColor?: string
}

export function FillSweepButton({
  children,
  className = "",
  fillColor = "#000",
  textHoverColor = "#fff",
}: FillSweepButtonProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative overflow-hidden inline-flex items-center justify-center
        px-8 py-3.5 rounded-lg font-medium text-sm tracking-wide
        border border-black text-black
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
        ${className}`}
      style={{ isolation: "isolate" }}
    >
      {/* Sweep layer */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[inherit]"
        style={{ backgroundColor: fillColor, transformOrigin: "left center" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: hovered ? 1 : 0 }}
        transition={{
          duration: 0.4,
          ease: [0.19, 1, 0.22, 1],
        }}
      />
      {/* Default label */}
      <motion.span
        className="relative z-10"
        animate={{ color: hovered ? textHoverColor : "#000" }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.span>
    </button>
  )
}
```

**CSS-only variant** (no JS, still great):
```css
.btn-sweep {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.btn-sweep::before {
  content: "";
  position: absolute;
  inset: 0;
  background: #000;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
  z-index: -1;
}
.btn-sweep:hover::before { transform: scaleX(1); }
.btn-sweep:hover { color: #fff; transition: color 0.15s; }
```

---

## 3. Border-Draw / Animated Outline

**When to use:** Subtle interactive links, card borders, ghost buttons where you want the outline to feel drawn in — not just appear. Great for dark-mode surfaces.

**Source:** Codrops "Creating a Border Animation Effect with SVG and CSS" (2014, still the reference). The SVG `stroke-dashoffset` approach draws the perimeter precisely with zero layout impact.

**Taste notes:** `stroke-dashoffset` from full perimeter → 0. Perimeter of a rounded rect = `2*(w+h) - (2π-8)*r`. For a pill button just use `2*(w+h)` as an overestimate — it works. Speed: 0.5s ease-in-out. Keep `pointer-events: none` on the SVG overlay.

```tsx
// components/ui/BorderDrawButton.tsx
"use client"

import { useRef, useState, useEffect } from "react"
import { motion } from "motion/react"

interface BorderDrawButtonProps {
  children: React.ReactNode
  className?: string
  strokeColor?: string
  strokeWidth?: number
  radius?: number
}

export function BorderDrawButton({
  children,
  className = "",
  strokeColor = "#000",
  strokeWidth = 1.5,
  radius = 8,
}: BorderDrawButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!btnRef.current) return
    const { width, height } = btnRef.current.getBoundingClientRect()
    setDims({ w: width, h: height })
  }, [])

  // Approximate perimeter of rounded rect
  const perimeter = dims.w && dims.h
    ? 2 * (dims.w + dims.h) - (2 * Math.PI - 8) * radius
    : 0

  return (
    <button
      ref={btnRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative inline-flex items-center justify-center
        px-8 py-3.5 font-medium text-sm tracking-wide rounded-lg
        bg-transparent text-black
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
        ${className}`}
    >
      {/* SVG border overlay */}
      {perimeter > 0 && (
        <svg
          aria-hidden
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={dims.w}
          height={dims.h}
          style={{ top: 0, left: 0 }}
        >
          <motion.rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={dims.w - strokeWidth}
            height={dims.h - strokeWidth}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={perimeter}
            animate={{ strokeDashoffset: hovered ? 0 : perimeter }}
            initial={{ strokeDashoffset: perimeter }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
        </svg>
      )}
      {children}
    </button>
  )
}
```

---

## 4. Text Slide / Swap on Hover

**When to use:** Primary nav items, any button where you want a kinetic "I noticed the hover" signal without changing the button's visual footprint. The classic Locomotive/NTWRK treatment.

**Source:** Olivier Larose + evanch98 on Medium. Uses `overflow-hidden` on the wrapper and two stacked labels — first label exits upward, second arrives from below.

**Taste notes:** `cubic-bezier(0.19, 1, 0.22, 1)` (expo ease-out) at 0.6–0.8s feels effortless. Faster than 0.4s feels mechanical. The second label uses `aria-hidden` so screen readers don't double-announce. The color inversion on the second label is optional but adds richness.

```tsx
// components/ui/TextSlideButton.tsx
"use client"

import { motion, useReducedMotion } from "motion/react"

interface TextSlideButtonProps {
  label: string
  hoverLabel?: string // defaults to same label — still animates
  className?: string
  onClick?: () => void
}

const EASE_EXPO: [number, number, number, number] = [0.19, 1, 0.22, 1]
const DURATION = 0.7

export function TextSlideButton({
  label,
  hoverLabel,
  className = "",
  onClick,
}: TextSlideButtonProps) {
  const shouldReduce = useReducedMotion()
  const secondary = hoverLabel ?? label

  const firstVariants = {
    rest:  { y: 0 },
    hover: { y: shouldReduce ? 0 : "-110%" },
  }
  const secondVariants = {
    rest:  { y: shouldReduce ? 0 : "110%" },
    hover: { y: 0 },
  }
  const transition = { duration: DURATION, ease: EASE_EXPO }

  return (
    <motion.button
      initial="rest"
      whileHover="hover"
      onClick={onClick}
      className={`relative inline-flex items-center justify-center
        overflow-hidden px-8 py-3.5 rounded-lg
        font-medium text-sm tracking-wide
        bg-black text-white
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
        ${className}`}
    >
      {/* Primary label — exits up */}
      <motion.span
        variants={firstVariants}
        transition={transition}
        className="block"
      >
        {label}
      </motion.span>

      {/* Secondary label — enters from below */}
      <motion.span
        aria-hidden
        variants={secondVariants}
        transition={transition}
        className="absolute block"
      >
        {secondary}
      </motion.span>
    </motion.button>
  )
}
```

**Usage:**
```tsx
<TextSlideButton label="View project" hoverLabel="Let's go →" />
```

---

## 5. Arrow-Shift / Icon Reveal on Hover

**When to use:** "Learn more", "Read case study", inline CTAs in editorial contexts, any link-style button. The arrow appears from behind the label and the label nudges left to make room — feels intentional, not glued-on.

**Taste notes:** Arrow enters from `x: 8, opacity: 0` and lands at `x: 0, opacity: 1` in 0.25s ease-out. Label shifts left by the same delta to hold visual center of mass. Don't animate both simultaneously at full speed — the shift leads by 20ms.

```tsx
// components/ui/ArrowButton.tsx
"use client"

import { motion, useReducedMotion } from "motion/react"

interface ArrowButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function ArrowButton({ children, className = "", onClick }: ArrowButtonProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.button
      initial="rest"
      whileHover="hover"
      onClick={onClick}
      className={`group inline-flex items-center gap-0 overflow-hidden
        font-medium text-sm tracking-wide
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
        ${className}`}
    >
      {/* Label shifts left to make room */}
      <motion.span
        variants={{
          rest:  { x: 0 },
          hover: { x: shouldReduce ? 0 : -4 },
        }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {children}
      </motion.span>

      {/* Arrow reveals */}
      <motion.span
        aria-hidden
        variants={{
          rest:  { x: 8, opacity: 0, width: 0 },
          hover: { x: 0, opacity: 1, width: "auto" },
        }}
        transition={{ duration: 0.25, ease: "easeOut", delay: 0.02 }}
        className="inline-block ml-1.5"
      >
        →
      </motion.span>
    </motion.button>
  )
}
```

**With an SVG arrow icon (recommended over unicode):**
```tsx
// Replace the arrow span with:
<motion.svg
  aria-hidden
  width="16" height="16" viewBox="0 0 16 16" fill="none"
  variants={{
    rest:  { x: 8, opacity: 0, width: 0 },
    hover: { x: 0, opacity: 1, width: 16 },
  }}
  transition={{ duration: 0.25, ease: "easeOut", delay: 0.02 }}
  className="ml-1.5 shrink-0"
>
  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"/>
</motion.svg>
```

---

## 6. Gooey / Blob Hover (SVG Filter)

**When to use:** One button per page maximum. Splash sections, playful products, anything with a "living" quality. The SVG filter distorts the button's boundary on hover so it looks like it's made of liquid. Tasteful = subtle `scale: 30` displacement, not full morphing.

**Source:** Codrops "Distorted Button Effects with SVG Filters" — feTurbulence + feDisplacementMap approach. CSS-Tricks "The Gooey Effect" for the blur+contrast trick.

**Taste notes:** Keep `baseFrequency` below 0.025 or it reads as noise, not goo. Animate via GSAP `quickTo` or direct attribute manipulation for smooth value tweening. The SVG filter must be in the DOM (not in CSS `url()` string) to animate its attributes.

```tsx
// components/ui/GooeyButton.tsx
"use client"

import { useRef, useEffect } from "react"

interface GooeyButtonProps {
  children: React.ReactNode
  className?: string
}

export function GooeyButton({ children, className = "" }: GooeyButtonProps) {
  const turbRef = useRef<SVGFETurbulenceElement>(null)
  const displacRef = useRef<SVGFEDisplacementMapElement>(null)
  const frameRef = useRef<number>(0)
  const freqRef = useRef(0)
  const scaleRef = useRef(0)
  const targetFreq = useRef(0)
  const targetScale = useRef(0)

  useEffect(() => {
    // Check prefers-reduced-motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (mq.matches) return

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const tick = () => {
      freqRef.current  = lerp(freqRef.current,  targetFreq.current,  0.08)
      scaleRef.current = lerp(scaleRef.current, targetScale.current, 0.08)

      if (turbRef.current) {
        turbRef.current.setAttribute("baseFrequency", `0 ${freqRef.current.toFixed(4)}`)
      }
      if (displacRef.current) {
        displacRef.current.setAttribute("scale", scaleRef.current.toFixed(2))
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const onEnter = () => {
    targetFreq.current  = 0.018
    targetScale.current = 22
  }
  const onLeave = () => {
    targetFreq.current  = 0
    targetScale.current = 0
  }

  return (
    <>
      {/* Hidden SVG filter — must be in DOM */}
      <svg aria-hidden width="0" height="0" className="absolute overflow-hidden"
        style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="gooey-btn-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0 0"
              numOctaves="2"
              result="warp"
            />
            <feDisplacementMap
              ref={displacRef}
              xChannelSelector="R"
              yChannelSelector="G"
              scale="0"
              in="SourceGraphic"
              in2="warp"
            />
          </filter>
        </defs>
      </svg>

      <button
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className={`inline-flex items-center justify-center
          px-8 py-3.5 rounded-full
          font-medium text-sm tracking-wide
          bg-violet-600 text-white
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2
          transition-colors duration-200
          ${className}`}
        style={{ filter: "url(#gooey-btn-filter)" }}
      >
        {children}
      </button>
    </>
  )
}
```

---

## 7. Elastic / Spring Press

**When to use:** Every primary interactive button. This is the baseline tactile response — without it buttons feel like dead HTML elements. Takes 3 lines of code. No excuse not to have it.

**Source:** Tiger Abrodi's implementation (tigerabrodi.blog) + Framer Motion gesture docs. Values `stiffness: 400, damping: 15` are the sweet spot: snappy with just enough overshoot.

**Taste notes:** `whileHover: { scale: 1.03 }` — not 1.1, that's a toy. `whileTap: { scale: 0.97 }` — confirms the physical press. The spring physics mean the button naturally carries momentum, feeling like a real surface. Apply to the outermost element so border/shadow animate too.

```tsx
// components/ui/SpringButton.tsx
"use client"

import { motion, useReducedMotion } from "motion/react"

interface SpringButtonProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  type?: "button" | "submit" | "reset"
}

const springTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 15,
}

export function SpringButton({
  children,
  className = "",
  onClick,
  type = "button",
}: SpringButtonProps) {
  const shouldReduce = useReducedMotion()

  return (
    <motion.button
      type={type}
      onClick={onClick}
      whileHover={shouldReduce ? {} : { scale: 1.03 }}
      whileTap={shouldReduce ? {} : { scale: 0.97 }}
      transition={springTransition}
      className={`inline-flex items-center justify-center
        px-8 py-3.5 rounded-lg
        font-medium text-sm tracking-wide
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
        ${className}`}
    >
      {children}
    </motion.button>
  )
}
```

**Compose with other styles:**
```tsx
<SpringButton className="bg-black text-white">Submit</SpringButton>
<SpringButton className="bg-white text-black border border-neutral-200">Cancel</SpringButton>
```

---

## 8. Underline-Grow Nav Link

**When to use:** Navigation links, footer links, inline prose links, any anchor that should read as text but behave as interactive. The underline grows from left on hover, retreats to right on leave — bidirectional.

**Source:** Tobias Ahlin's "CSS trick: Animating Link Underlines" (tobiasahlin.com) — the definitive reference. The `transform-origin` swap is the key move.

**Taste notes:** 0.3s ease at default. For nav links, set height 1px; for editorial links, 2px. Use `currentColor` so the component works on any background. The bidirectional variant (leave exits right-to-left) requires a state toggle or `:hover` + `:not(:hover)` with two different `transform-origin` values.

```tsx
// components/ui/UnderlineLink.tsx
"use client"

import { motion } from "motion/react"
import { useState } from "react"

interface UnderlineLinkProps {
  children: React.ReactNode
  href?: string
  className?: string
  underlineHeight?: number
  underlineColor?: string
}

export function UnderlineLink({
  children,
  href = "#",
  className = "",
  underlineHeight = 1,
  underlineColor = "currentColor",
}: UnderlineLinkProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative inline-block
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1
        ${className}`}
    >
      {children}
      <motion.span
        aria-hidden
        className="absolute bottom-0 left-0 w-full block"
        style={{
          height: underlineHeight,
          backgroundColor: underlineColor,
          transformOrigin: hovered ? "left center" : "right center",
        }}
        animate={{ scaleX: hovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      />
    </a>
  )
}
```

**Navigation variant with Tailwind only** (no JS):
```tsx
// For nav items — pure CSS, zero overhead
function NavLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a
      href={href}
      className="relative inline-block py-1 text-sm font-medium text-neutral-700
        after:absolute after:bottom-0 after:left-0 after:h-px after:w-full
        after:scale-x-0 after:bg-current after:origin-right
        after:transition-transform after:duration-300 after:ease-in-out
        hover:after:scale-x-100 hover:after:origin-left
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
    >
      {children}
    </a>
  )
}
```

---

## 9. Primary CTA — The Expensive One

**When to use:** The one button per page that closes the deal. Every pixel is intentional here. This is what separates Stripe/Linear/Vercel landing pages from everything else.

**The formula (sourced from auditing Linear, Vercel, Arc):**
- Padding: `14px 32px` (not `12px 24px` — the extra space breathes)
- Radius: `10px` — rounded but not pill; pill radius is for secondary actions
- Weight: `500` — semibold reads as insecure, `400` reads as underdone
- Shadow (rest): `0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)` — a real object casts shadow
- Shadow (hover): `0 4px 16px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)` — lifts
- Hover translate: `translateY(-1px)` — not -2px, not -4px. One pixel.
- Focus ring: `0 0 0 3px rgba(0,0,0,0.15)` offset from the button, never the default browser ring
- Transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` for shadow/translate; spring for scale

**Taste notes:** No gradients unless your brand is explicitly gradient-forward. A single flat color with a well-crafted shadow reads more premium. The lift + shadow change together is the "expensive" move — shadow height increases as the element lifts, simulating real directional light.

```tsx
// components/ui/PrimaryCTA.tsx
"use client"

import { motion, useReducedMotion } from "motion/react"

interface PrimaryCTAProps {
  children: React.ReactNode
  onClick?: () => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  loading?: boolean
  className?: string
}

export function PrimaryCTA({
  children,
  onClick,
  type = "button",
  disabled = false,
  loading = false,
  className = "",
}: PrimaryCTAProps) {
  const shouldReduce = useReducedMotion()
  const isInert = disabled || loading

  return (
    <motion.button
      type={type}
      onClick={!isInert ? onClick : undefined}
      disabled={isInert}
      whileHover={shouldReduce || isInert ? {} : {
        y: -1,
        scale: 1.01,
        boxShadow: "0 4px 16px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)",
      }}
      whileTap={shouldReduce || isInert ? {} : {
        y: 0,
        scale: 0.99,
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 20,
      }}
      className={`inline-flex items-center justify-center gap-2
        font-[500] text-sm tracking-[-0.01em]
        bg-black text-white
        rounded-[10px]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        focus-visible:outline-none
        select-none
        ${className}`}
      style={{
        padding: "14px 32px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)",
        // Custom focus ring via outline — more controllable than ring utilities
      }}
      // Focus ring applied via onFocus/onBlur for full control
      onFocus={(e) => {
        e.currentTarget.style.outline = "3px solid rgba(0,0,0,0.15)"
        e.currentTarget.style.outlineOffset = "3px"
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = ""
        e.currentTarget.style.outlineOffset = ""
      }}
    >
      {loading ? (
        <>
          <motion.span
            aria-hidden
            className="block w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
          <span>{children}</span>
        </>
      ) : children}
    </motion.button>
  )
}
```

**Dark surface variant** (white button on dark bg):
```tsx
<PrimaryCTA
  className="bg-white text-black"
  style={{
    boxShadow: "0 1px 2px rgba(255,255,255,0.06), 0 4px 12px rgba(255,255,255,0.04)"
  }}
>
  Get started
</PrimaryCTA>
```

---

## 10. Cursor-Aware Spotlight Button

**When to use:** Hero section CTAs on dark surfaces, glassmorphism UI, any button where you want the pointer position to be physically visible in the surface. Used by buildui.com, Vercel's template pages, and more.

**Source:** buildui.com "Spotlight" recipe + ibelick.com implementation. Framer Motion's `useMotionValue` + `useMotionTemplate` keeps the gradient off React's render cycle — zero re-renders on mousemove.

**Taste notes:** Gradient radius 150px for a button, 600px for a card. Color: `rgba(255,255,255,0.08)` on dark — transparent on light backgrounds unless you invert to a dark tint. The opacity transition on enter/leave should be `duration-300`. Without the opacity gate, the gradient "jumps" to 0,0 on mount.

```tsx
// components/ui/SpotlightButton.tsx
"use client"

import { useMotionValue, useMotionTemplate, motion } from "motion/react"
import { useState } from "react"

interface SpotlightButtonProps {
  children: React.ReactNode
  className?: string
  spotlightColor?: string
  onClick?: () => void
}

export function SpotlightButton({
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.10)",
  onClick,
}: SpotlightButtonProps) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const [isOver, setIsOver] = useState(false)

  const gradient = useMotionTemplate`radial-gradient(
    150px circle at ${mouseX}px ${mouseY}px,
    ${spotlightColor},
    transparent 80%
  )`

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - left)
    mouseY.set(e.clientY - top)
  }

  return (
    <button
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsOver(true)}
      onMouseLeave={() => setIsOver(false)}
      onClick={onClick}
      className={`group relative inline-flex items-center justify-center overflow-hidden
        px-8 py-3.5 rounded-lg
        font-medium text-sm tracking-wide
        bg-neutral-900 text-white border border-white/10
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900
        ${className}`}
    >
      {/* Spotlight layer — does NOT trigger re-render on move */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          background: gradient,
          opacity: isOver ? 1 : 0,
        }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  )
}
```

---

## Accessibility Checklist (applies to all 10 treatments)

Every button above follows these rules — verify when adapting:

1. **`focus-visible`** — use `focus-visible:ring-*` not `focus:ring-*` so pointer users don't see the ring
2. **`aria-hidden`** on all decorative spans/SVGs (second labels, sweep layers, arrows)
3. **`useReducedMotion()`** — wrap any transform/translate/scale in a guard; timing-only transitions (color, opacity at 0.15s) are fine to keep
4. **Disabled state** — `disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none`
5. **Color contrast** — black-on-white and white-on-black both pass WCAG AA at 4.5:1; audit any brand-color variant
6. **Tap target** — minimum `44px` height for mobile; all paddings above satisfy this at default font sizes
7. **Loading state** — keep label visible alongside spinner; don't replace text with a spinner alone (announces nothing to screen readers)

---

## Rules for our builder

### The 3 default button components every Helm-built product ships

**1. `PrimaryCTA`** — the full treatment from §9. Every product has exactly one primary call-to-action style. It has the lift, the spring press, the curated shadow, the custom focus ring. Background is configurable but defaults to `#000`/`#fff`. This is the component users reach for by default.

```tsx
// Default export from @/components/ui/PrimaryCTA
// Usage: <PrimaryCTA onClick={handleSubmit}>Get started</PrimaryCTA>
```

**2. `TextSlideButton`** — the two-label slide from §4 with `cubic-bezier(0.19, 1, 0.22, 1)` easing. Used for secondary actions, nav CTAs, and anywhere the button must feel kinetic without overwhelming the primary. Also the default for all ghost/outlined variants.

```tsx
// Default export from @/components/ui/TextSlideButton
// Usage: <TextSlideButton label="View project" />
```

**3. `UnderlineLink` + nav variant** — the scaleX underline from §8. This is the default for all `<a>` tags that appear inline in UI (nav, footer, prose). The pure-Tailwind nav variant ships as a separate `NavLink` component for zero-JS overhead in the nav.

```tsx
// Default export from @/components/ui/NavLink
// Pure Tailwind, no framer-motion dependency
```

---

### The rule

**Every interactive element — button, link, input, card, icon — gets an explicit hover state, an explicit press/active state, and an explicit focus-visible ring. No element ships with only browser defaults. If it's clickable, it tells the user it knows it's being touched.**

This is the single biggest delta between UI that feels designed and UI that feels generated. The spring press takes 3 lines. The underline takes 4 CSS properties. There is no budget reason to skip them.

Timing scale for the builder's motion system:
- Micro (color swap, opacity): `0.15s ease`
- Standard (translate, scale, sweep): `0.25–0.35s ease-out`
- Cinematic (text slide, page transitions): `0.6–0.8s cubic-bezier(0.19, 1, 0.22, 1)`
- Spring feedback (press, magnetic): `stiffness: 400, damping: 15` — no duration, physics-driven

---

*Sources: [Olivier Larose – Magnetic Button](https://blog.olivierlarose.com/tutorials/magnetic-button) · [Codrops – Button Hover Animations](https://tympanus.net/codrops/2021/02/17/ideas-for-css-button-hover-animations/) · [Codrops – Distorted Button Effects](https://tympanus.net/codrops/2016/05/11/distorted-button-effects-with-svg-filters/) · [buildui.com – Spotlight Recipe](https://buildui.com/recipes/spotlight) · [ibelick.com – Spotlight Effect](https://ibelick.com/blog/create-modern-spotlight-effect-with-react-css) · [Tobias Ahlin – Animating Underlines](https://tobiasahlin.com/blog/css-trick-animating-link-underlines/) · [Tiger Abrodi – Spring Physics Buttons](https://tigerabrodi.blog/how-to-implement-spring-physics-buttons-with-framer-motion) · [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) · [Motion React Docs](https://motion.dev/docs/react-animation)*
