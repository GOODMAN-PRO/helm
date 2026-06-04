# CRAFT PLAYBOOK — Make It Bespoke, Not AI-Generated

> Inject alongside WEBSITE_PLAYBOOK.md into every builder agent.
> This file governs taste. Every rule is a hard constraint, not a suggestion.
> No vague adjectives — only code, values, and enforceable decisions.

---

## 0. QUICK RULES (READ FIRST)

1. Choose ONE identity from §2 per brief. Never default Inter + navy.
2. Ship grain overlay on every site — non-negotiable.
3. Every interactive element gets a custom hover + press + focus state.
4. No two adjacent sections share the same layout shape.
5. Include ONE scroll-driven storytelling moment.
6. Include ONE signature interaction (the "wow") — exactly one, not six.
7. Include the preloader + choreographed hero entrance on first visit.
8. Add ≥ 5 craft micro-details (eyebrows, section counters, underlines, etc.).

---

## 1. THE ANTI-AI BAN LIST

The items below are what make a site look like it was generated, not designed.
Every DO-NOT is paired with a required alternative. Violating any row fails the QA gate.

| # | DO NOT | DO INSTEAD |
|---|--------|------------|
| 1 | Purple/indigo radial gradient as hero bg or brand accent | Pick an owned hue from §2 — flat field or hard-edge shape, never a radial blur |
| 2 | Aurora blob / mesh gradient / stacked `blur(120px)` circles | Flat single-color atmosphere, full-bleed photo, or textured grain surface |
| 3 | Inter, Geist, or Roboto as the only typeface | A display face with character + a legibility face for body — two intentional decisions from §2 |
| 4 | Centered hero with gradient-fill headline | Off-center editorial composition (7/5 grid split); headline as a visual object, not a sentence-label |
| 5 | Three-column icon + title + copy feature grid | Feature demonstrated in-product; asymmetric editorial layout; one feature at full width |
| 6 | Glassmorphism cards (`backdrop-blur`, `bg-white/10`) on flat/dark bg | Opaque surfaces with deliberate elevation logic; grain + highlight border |
| 7 | Uniform `border-radius: 16px` on every element | A single radius token (4px, 6px, 10px) that is a brand decision — applied with hierarchy |
| 8 | Gradient-border pill "✨ New — AI features" badge above headline | Copy hierarchy, a date-stamped editorial flag, or nothing |
| 9 | `box-shadow: 0 4px 24px rgba(0,0,0,0.08)` on every card | Either flat (no shadow) or a deliberate dark directional shadow; use the elevation system in §5 |
| 10 | Identical `py-24` or `py-32` padding on every section | Varied vertical rhythm: tight where urgent, expansive where breathing (`clamp(4rem,12vh,10rem)`) |
| 11 | Horizontal logo strip "Trusted by teams at ___" under hero | One customer story, or logos as a designed composition element, or nothing |
| 12 | Stock photos or faceless 3D avatar illustrations | Real product screenshots, commissioned illustration, or pure typography |
| 13 | Dark `#0a0a0f` with `text-purple-400` or `text-cyan-400` accents | An owned dark (true near-black, warm dark, brand-specific) from §2; single accent at maximum restraint |
| 14 | Predictable hero→feature grid→testimonials→pricing→CTA order | Narrative sequence; product logic determines structure — see §6 layout rhythm rule |
| 15 | Symmetric layout everywhere | Asymmetry as default: 60/40, 70/30, off-axis headlines; centered only as deliberate exception |
| 16 | Identical `opacity:0→1, y:20→0, 0.4s ease-out` fade-up on every element | A specific motion language; use clip-path reveals, scale reveals, staggered lines — from §7 |
| 17 | Even-cell bento grid as "feature showcase" | One feature full-width + animated; weighted bento (2/3 dominant cell + small); or sticky-scroll reveal |
| 18 | Generic copy: "The platform that powers your workflow" | Specific claims; real numbers; a voice that could only describe this exact product |
| 19 | `transform: perspective(1000px) rotateX(5deg)` product screenshot in hero | Live animated walkthrough, or one isolated UI moment that proves quality |
| 20 | Smooth surfaces, no texture | 4–8% grain overlay on all backgrounds — see §5 for the copy-paste recipe |
| 21 | Three-tier pricing with gradient "Most Popular" border | Pricing designed to the product's actual structure; no cosmetic highlighting |
| 22 | Dense link-grid template footer | A footer with personality: minimal (one copyright line), editorial (display type), or interactive |
| 23 | All-glass nav (`backdrop-blur` sticky bar) | Nav as invisible typographic element; or sidebar; or hidden until scroll-stop |
| 24 | No signature interaction anywhere on the site | ONE owned interaction memorable enough to describe — pick from §4 |

---

## 2. DISTINCTIVE IDENTITY SELECTOR

**Rule: Pick exactly one identity per brief. Never mix. Never default.**
The decision rule is: product brief → row below → commit fully.

### Identity 01 — Wonky Editorial
**For:** content tools, editorial platforms, journaling, indie consumer products

| Token | Value |
|-------|-------|
| Display font | Fraunces, axes: `'opsz' 72, 'WONK' 1, 'SOFT' 20`, weight 300 |
| Body font | DM Sans 400 |
| bg | `#F5F0E8` — oklch(95% 0.018 85) warm parchment |
| text | `#1A1512` — oklch(14% 0.018 45) near-black warm |
| accent | `#B85C38` — oklch(53% 0.145 38) burnt sienna |
| surface | `#EDE7D9` — cards / elevated |
| border | `#C8BFA8` — hairlines |

```ts
import { Fraunces, DM_Sans } from 'next/font/google'
export const display = Fraunces({ subsets: ['latin'], axes: ['WONK','SOFT','opsz'], variable: '--font-display' })
export const body    = DM_Sans({ subsets: ['latin'], variable: '--font-body' })
```
```css
.hero { font-family: var(--font-display); font-size: clamp(3rem,8vw,7rem);
        font-weight: 300; font-variation-settings: 'opsz' 72,'WONK' 1,'SOFT' 20;
        letter-spacing: -0.02em; line-height: 1.05; }
```

---

### Identity 02 — Carbon Acid
**For:** AI agents, developer tooling, performance dashboards, CLI tools

| Token | Value |
|-------|-------|
| Font | Bricolage Grotesque variable only (wdth=125 display / wdth=100 body) |
| bg | `#0E0E0E` — oklch(8% 0 0) true near-black |
| text | `#F0F0F0` — oklch(94% 0 0) |
| accent | `#AAFF00` — oklch(94% 0.27 130) acid green — ONE use per screen |
| surface | `#181818` lifted |
| border | `#2E2E2E` |

```ts
import { Bricolage_Grotesque } from 'next/font/google'
export const brand = Bricolage_Grotesque({ subsets: ['latin'], axes: ['wdth'], variable: '--font-brand' })
```
```css
.hero { font-family: var(--font-brand); font-size: clamp(3rem,8vw,6rem);
        font-weight: 700; font-variation-settings: 'wdth' 125; letter-spacing: -0.02em; }
.body { font-family: var(--font-brand); font-variation-settings: 'wdth' 100; }
```

---

### Identity 03 — Desert Craft
**For:** wellness, DTC, climate tech, community platforms, mindfulness

| Token | Value |
|-------|-------|
| Display | Playfair Display 400 italic |
| Body | Plus Jakarta Sans 400 |
| bg | `#F2EBE0` — warm sand |
| text | `#2C1F14` — dark warm brown |
| accent | `#D4622A` — oklch(58% 0.155 42) terracotta |

```ts
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google'
export const display = Playfair_Display({ subsets:['latin'], style:['normal','italic'], variable:'--font-display' })
export const body    = Plus_Jakarta_Sans({ subsets:['latin'], weight:['400','500','600'], variable:'--font-body' })
```

---

### Identity 04 — Blueprint Brutal
**For:** dev tools, task managers, dashboards, creative agencies, code-adjacent productivity

| Token | Value |
|-------|-------|
| Display | Syne 800, uppercase |
| Body/labels | Chivo Mono 400 |
| bg | `#F7F5F0` — off-white newsprint |
| text | `#1A1A1A` — near-black |
| accent | `#F5C800` — oklch(85% 0.190 95) construction yellow |
| border | 2px solid `#1A1A1A` — structural, heavy |

```ts
import { Syne, Chivo_Mono } from 'next/font/google'
export const display = Syne({ subsets:['latin'], weight:['800'], variable:'--font-display' })
export const mono    = Chivo_Mono({ subsets:['latin'], variable:'--font-mono' })
```

---

### Identity 05 — Emerald Authority
**For:** FinTech, legal tech, enterprise SaaS, investment platforms

| Token | Value |
|-------|-------|
| Display | Instrument Serif 400 italic |
| Body | Space Grotesk 400 |
| bg | `#0B2E25` — oklch(20% 0.070 165) deep forest |
| text | `#E8F5EF` — near-white with green tint |
| accent | `#F0D060` — oklch(86% 0.160 92) champagne gold |

```ts
import { Instrument_Serif, Space_Grotesk } from 'next/font/google'
export const display = Instrument_Serif({ subsets:['latin'], style:['normal','italic'], variable:'--font-display' })
export const body    = Space_Grotesk({ subsets:['latin'], weight:['300','400','500','600'], variable:'--font-body' })
```

---

### Identity 06 — Dusk Precision
**For:** AI creative tools, audio/music products, luxury services

| Token | Value |
|-------|-------|
| Display | DM Serif Display 400 |
| Body | Geist Mono (local, from github.com/vercel/geist-font) |
| bg | `#1A1228` — oklch(13% 0.065 295) deep violet-black |
| text | `#EDE6FF` — near-white with violet tint |
| accent | `#E8C84A` — oklch(83% 0.158 88) warm gold |

```ts
import { DM_Serif_Display } from 'next/font/google'
import localFont from 'next/font/local'
export const display = DM_Serif_Display({ subsets:['latin'], weight:'400', variable:'--font-display' })
export const mono    = localFont({ src:'./GeistMono-Variable.woff2', variable:'--font-mono' })
```

---

**Single accent principle:** The accent appears on primary CTA, active states, data callouts — and nowhere else. Ratio 95:5 neutral-to-accent. A gradient button is a 2019 signal; a flat accent-color button is 2025.

---

## 3. CUSTOM BUTTONS

**Rule: every interactive element gets a custom hover state, press/active state, and focus-visible ring. No element ships with only browser defaults.**

Install: `npm install motion` (formerly framer-motion).

Global reduced-motion reset — add to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

### Button A — PrimaryCTA (the expensive one)

The one button per page that closes the deal. Lift + shadow-change + spring press.

```tsx
// components/ui/PrimaryCTA.tsx
"use client"
import { motion, useReducedMotion } from "motion/react"

export function PrimaryCTA({ children, onClick, type = "button", disabled = false, loading = false, className = "" }:
  { children: React.ReactNode; onClick?: () => void; type?: "button"|"submit"|"reset"; disabled?: boolean; loading?: boolean; className?: string }) {
  const rm = useReducedMotion()
  const inert = disabled || loading
  return (
    <motion.button
      type={type} onClick={!inert ? onClick : undefined} disabled={inert}
      whileHover={rm||inert ? {} : { y: -1, scale: 1.01, boxShadow: "0 4px 16px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)" }}
      whileTap={rm||inert   ? {} : { y: 0, scale: 0.99, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`inline-flex items-center justify-center gap-2 font-[500] text-sm tracking-[-0.01em]
        bg-black text-white rounded-[10px] select-none
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        focus-visible:outline-none ${className}`}
      style={{ padding: "14px 32px", boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)" }}
      onFocus={e => { e.currentTarget.style.outline = "3px solid rgba(0,0,0,0.15)"; e.currentTarget.style.outlineOffset = "3px" }}
      onBlur={e  => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = "" }}
    >
      {loading ? (
        <><motion.span aria-hidden className="block w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
            animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
          <span>{children}</span></>
      ) : children}
    </motion.button>
  )
}
```

Taste values: padding `14px 32px` (not `12px 24px`), radius `10px` (not pill), weight `500`, hover translate `translateY(-1px)` not `-2px`.

---

### Button B — TextSlideButton (kinetic secondary)

Two-label slide: first exits up, second arrives from below on hover. Use for secondary actions, nav CTAs.

```tsx
// components/ui/TextSlideButton.tsx
"use client"
import { motion, useReducedMotion } from "motion/react"
const EASE_EXPO: [number,number,number,number] = [0.19, 1, 0.22, 1]

export function TextSlideButton({ label, hoverLabel, className = "", onClick }:
  { label: string; hoverLabel?: string; className?: string; onClick?: () => void }) {
  const rm = useReducedMotion()
  const secondary = hoverLabel ?? label
  const first  = { rest: { y: 0 }, hover: { y: rm ? 0 : "-110%" } }
  const second = { rest: { y: rm ? 0 : "110%" }, hover: { y: 0 } }
  const t = { duration: 0.7, ease: EASE_EXPO }
  return (
    <motion.button initial="rest" whileHover="hover" onClick={onClick}
      className={`relative inline-flex items-center justify-center overflow-hidden px-8 py-3.5 rounded-lg
        font-medium text-sm tracking-wide bg-black text-white
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${className}`}>
      <motion.span variants={first}  transition={t} className="block">{label}</motion.span>
      <motion.span variants={second} transition={t} className="absolute block" aria-hidden>{secondary}</motion.span>
    </motion.button>
  )
}
// Usage: <TextSlideButton label="View project" hoverLabel="Let's go →" />
```

---

### Button C — MagneticButton (hero CTA)

The button reaches toward the cursor. Restraint: strength 0.4 max, spring stiffness 150 / damping 15.

```tsx
// components/ui/MagneticButton.tsx
"use client"
import { useRef, useState, useCallback } from "react"
import { motion, useReducedMotion } from "motion/react"

export function MagneticButton({ children, className = "", strength = 0.4 }:
  { children: React.ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const rm = useReducedMotion()
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || rm) return
    const { clientX, clientY } = e
    const { height, width, left, top } = ref.current.getBoundingClientRect()
    setPos({ x: (clientX-(left+width/2))*strength, y: (clientY-(top+height/2))*strength })
  }, [strength, rm])
  const reset = useCallback(() => setPos({ x:0, y:0 }), [])
  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={reset}
      animate={rm ? {} : pos} transition={{ type:"spring", stiffness:150, damping:15, mass:0.1 }}
      className="inline-block">
      <motion.div animate={rm ? {} : { x: -pos.x*0.3, y: -pos.y*0.3 }}
        transition={{ type:"spring", stiffness:150, damping:15, mass:0.1 }}>
        <button className={`relative px-8 py-4 rounded-full font-medium text-sm tracking-wide
          bg-white text-black border border-neutral-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${className}`}>
          {children}
        </button>
      </motion.div>
    </motion.div>
  )
}
```

---

### Button D — Animated Nav Link (pure CSS, zero JS overhead)

```tsx
function NavLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a href={href}
      className="relative inline-block py-1 text-sm font-medium text-neutral-700
        after:absolute after:bottom-0 after:left-0 after:h-px after:w-full
        after:scale-x-0 after:bg-current after:origin-right
        after:transition-transform after:duration-300 after:ease-in-out
        hover:after:scale-x-100 hover:after:origin-left
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1">
      {children}
    </a>
  )
}
```

---

### Button E — SpotlightButton (cursor-aware dark surface CTA)

```tsx
// components/ui/SpotlightButton.tsx
"use client"
import { useMotionValue, useMotionTemplate, motion } from "motion/react"
import { useState } from "react"

export function SpotlightButton({ children, className = "", onClick }:
  { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const mouseX = useMotionValue(0); const mouseY = useMotionValue(0)
  const [isOver, setIsOver] = useState(false)
  const gradient = useMotionTemplate`radial-gradient(150px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.10), transparent 80%)`
  return (
    <button
      onMouseMove={e => { const {left,top} = e.currentTarget.getBoundingClientRect(); mouseX.set(e.clientX-left); mouseY.set(e.clientY-top) }}
      onMouseEnter={() => setIsOver(true)} onMouseLeave={() => setIsOver(false)} onClick={onClick}
      className={`group relative inline-flex items-center justify-center overflow-hidden px-8 py-3.5 rounded-lg
        font-medium text-sm tracking-wide bg-neutral-900 text-white border border-white/10
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}>
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{ background: gradient, opacity: isOver ? 1 : 0 }} />
      <span className="relative z-10">{children}</span>
    </button>
  )
}
```

---

**Motion timing for buttons:**
- Micro (color swap, opacity): `0.15s ease`
- Standard (translate, scale, sweep): `0.25–0.35s ease-out`
- Cinematic (text slide): `0.7s cubic-bezier(0.19, 1, 0.22, 1)`
- Spring feedback (press, magnetic): `stiffness: 400, damping: 15` — physics-driven

---

## 4. ONE SIGNATURE INTERACTION (THE "WOW")

**Rule: every site gets exactly ONE. Exactly. Not zero, not two. One.**
The other interactions recede to background — they make the one wow land harder.
Pick based on site type:

| Interaction | Best for | Risk |
|-------------|----------|------|
| **Velocity Marquee** | Any site with social proof, logos, tags | Lowest — zero accessibility debt, no SSR issues |
| **Clip Reveal Links** | Agency, portfolio, editorial | Low — pure GSAP, no dependencies |
| **Custom Cursor** | Agency, creative, portfolio | Low — fine-pointer only, never runs on touch |
| **Hover Image Reveal** | Agency, portfolio, case study list | Medium — cursor-bound, skip on touch |
| **Pinned Scroll Product Reveal** | Product/SaaS, marketing | Medium — desktop-only experience |
| **Count-up Tickers** | Stat sections, trust sections | Lowest — IntersectionObserver, accessible |

### Velocity Marquee (lowest-risk wow, drop into any site)

```tsx
// components/VelocityMarquee.tsx — copy-paste ready
"use client"
import { useRef } from "react"
import { motion, useScroll, useVelocity, useTransform, useSpring, useAnimationFrame, useMotionValue, wrap } from "motion/react"

export function VelocityMarquee({ items, baseVelocity = 2, gap = 48 }:
  { items: string[]; baseVelocity?: number; gap?: number }) {
  const baseX = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVelocity = useVelocity(scrollY)
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400, mass: 0.27 })
  const velocityFactor = useTransform(smoothVelocity, [-3000, 3000], [-3, 3], { clamp: false })
  const repeated = [...items, ...items, ...items]
  const wrapRef = useRef(0); const itemsRef = useRef<HTMLDivElement>(null)

  useAnimationFrame((_, delta) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (!itemsRef.current) return
    if (!wrapRef.current) {
      const w = (itemsRef.current.children[0] as HTMLElement)?.offsetWidth + gap || 200
      wrapRef.current = w * items.length
    }
    const moveBy = baseVelocity * (delta / 16.67)
    const vf = velocityFactor.get(); const boost = Math.abs(vf) > 0.5 ? Math.abs(vf) : 1
    baseX.set(wrap(-wrapRef.current, 0, baseX.get() - moveBy * boost))
  })

  return (
    <div style={{ overflow:"hidden", whiteSpace:"nowrap", position:"relative" }} aria-hidden="true">
      <motion.div ref={itemsRef} style={{ x: baseX, display:"inline-flex", gap }}>
        {repeated.map((item, i) => (
          <span key={i} style={{ display:"inline-block", fontSize:"1.125rem", fontWeight:500,
            letterSpacing:"0.05em", textTransform:"uppercase", userSelect:"none" }}>{item}</span>
        ))}
      </motion.div>
    </div>
  )
}
// Usage (stack two rows, opposite direction):
// <VelocityMarquee items={['Design','Build','Deploy','Scale','—']} baseVelocity={1.5} />
// <VelocityMarquee items={['Design','Build','Deploy','Scale','—']} baseVelocity={-1.5} />
```

### Custom Cursor (agency / portfolio)

```tsx
// components/CustomCursor.tsx — lerp follower with context awareness
"use client"
import { useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
const lerp = (a:number,b:number,n:number) => a+(b-a)*n

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null); const ringRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null); const rafRef = useRef<number>(0)
  const mouse = useRef({x:-100,y:-100}); const pos = useRef({x:-100,y:-100})

  const applyState = useCallback((state: "default"|"hover"|"view"|"drag") => {
    if (!ringRef.current||!labelRef.current) return
    const scales = { default:"scale(1)", hover:"scale(2.2)", view:"scale(3)", drag:"scale(2.8)" }
    const labels = { default:"", hover:"", view:"VIEW", drag:"DRAG" }
    ringRef.current.style.transform = scales[state]
    ringRef.current.style.mixBlendMode = state==="default"?"normal":"difference"
    labelRef.current.textContent = labels[state]
    labelRef.current.style.opacity = labels[state]?"1":"0"
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)")
    const rmq = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (!mq.matches||rmq.matches) return
    document.documentElement.style.cursor = "none"
    const onMove = (e:MouseEvent) => { mouse.current = {x:e.clientX,y:e.clientY} }
    const onOver = (e:MouseEvent) => {
      const t = (e.target as HTMLElement).closest("a,button,[data-cursor],[data-cursor-view],[data-cursor-drag]") as HTMLElement|null
      if (!t) { applyState("default"); return }
      if (t.dataset.cursorView!==undefined) applyState("view")
      else if (t.dataset.cursorDrag!==undefined) applyState("drag")
      else applyState("hover")
    }
    const tick = () => {
      pos.current.x = lerp(pos.current.x,mouse.current.x,0.12)
      pos.current.y = lerp(pos.current.y,mouse.current.y,0.12)
      if (dotRef.current) dotRef.current.style.transform = `translate(${pos.current.x-4}px,${pos.current.y-4}px)`
      if (ringRef.current) { ringRef.current.style.left = `${pos.current.x}px`; ringRef.current.style.top = `${pos.current.y}px` }
      rafRef.current = requestAnimationFrame(tick)
    }
    window.addEventListener("mousemove",onMove,{passive:true})
    document.addEventListener("mouseover",onOver,{passive:true})
    rafRef.current = requestAnimationFrame(tick)
    return () => { document.documentElement.style.cursor=""; window.removeEventListener("mousemove",onMove); document.removeEventListener("mouseover",onOver); cancelAnimationFrame(rafRef.current) }
  }, [applyState])

  if (typeof document==="undefined") return null
  return createPortal(<>
    <div ref={dotRef} style={{ position:"fixed",top:0,left:0,width:8,height:8,borderRadius:"50%",background:"white",
      pointerEvents:"none",zIndex:9999,mixBlendMode:"difference",willChange:"transform" }} />
    <div ref={ringRef} style={{ position:"fixed",width:32,height:32,marginLeft:-16,marginTop:-16,borderRadius:"50%",
      border:"1.5px solid white",pointerEvents:"none",zIndex:9998,willChange:"transform, left, top",
      transition:"transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div ref={labelRef} style={{ fontSize:9,fontWeight:600,letterSpacing:"0.08em",color:"white",opacity:0,
        transition:"opacity 0.15s",userSelect:"none" }} />
    </div>
  </>, document.body)
}
// Add to root layout. Add data-cursor-view to media, data-cursor-drag to carousels.
```

### Count-up Tickers (use on any stat block)

```tsx
// components/CountUp.tsx
"use client"
import { useRef, useEffect, useState } from "react"
const easeOutExpo = (t:number) => t===1?1:1-Math.pow(2,-10*t)

export function CountUp({ end, duration=2000, suffix="", prefix="" }:
  { end:number; duration?:number; suffix?:string; prefix?:string }) {
  const [count, setCount] = useState(0); const ref = useRef<HTMLSpanElement>(null); const started = useRef(false)
  useEffect(() => {
    const rmq = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (rmq.matches) { setCount(end); return }
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting||started.current) return; started.current = true
      const t0 = performance.now()
      const tick = (now:number) => {
        const progress = Math.min((now-t0)/duration,1)
        setCount(Math.round(easeOutExpo(progress)*end))
        if (progress<1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold:0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [end,duration])
  return (
    <span ref={ref} aria-label={`${prefix}${end}${suffix}`}>
      <span aria-hidden="true">{prefix}{count.toLocaleString()}{suffix}</span>
    </span>
  )
}
// Usage: <CountUp end={12000} suffix="+" /> <CountUp end={99} suffix="% uptime" />
```

---

## 5. TEXTURE & DETAIL

**Rule: add grain + ≥ 5 craft micro-details on every site.**

### Grain overlay — mandatory, copy-paste as-is

```css
/* globals.css — add once, never skip */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 200px 200px;
  opacity: 0.08;
  mix-blend-mode: soft-light;
  z-index: 9999;
  will-change: transform;
}
/* Animated variant (cinematic film) — use opacity: 0.05 when animated */
@keyframes grain-shift {
  0%,100% { transform:translate(0,0) }  10% { transform:translate(-2%,-3%) }
  30% { transform:translate(3%,2%) }    50% { transform:translate(-1%,4%) }
  70% { transform:translate(2%,-1%) }   90% { transform:translate(-3%,2%) }
}
/* Append to body::after: animation: grain-shift 0.8s steps(1) infinite; */
```

### Good gradient recipe (OKLCH, non-cheesy)

```css
/* Deep dark background — 3 stops minimum, OKLCH interpolation */
.hero-bg {
  background: linear-gradient(
    160deg in oklch,
    oklch(0.18 0.04 255),   /* deep cool blue-black */
    oklch(0.12 0.02 285),   /* midpoint: slightly purple-shifted */
    oklch(0.09 0.01 30)     /* near-black warm undertone */
  );
}
/* NEVER: linear-gradient(135deg, #ff6b6b, #4ecdc4) — saturated, cheap */
/* NEVER: linear-gradient(to bottom, #1a1a2e, #000000) — pure black endpoint */
```

### 1px top-highlight border trick (mandatory on dark surfaces)

```css
/* Every elevated card/modal/dropdown on dark background */
.card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);     /* outer subtle border */
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),        /* ← this line is the trick */
    0 4px 16px rgba(0,0,0,0.40),
    0 1px 4px rgba(0,0,0,0.25);
}
/* Elevation levels:
   Level 1 (chip/tag): inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.30)
   Level 2 (card):     inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.40)
   Level 3 (modal):    inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 40px rgba(0,0,0,0.60) */
```

### Custom animated underline

```css
/* Apply to every <a> that isn't a button */
.link-draw {
  text-decoration: none;
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 0% 1px;
  background-repeat: no-repeat;
  background-position: left bottom;
  transition: background-size 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.link-draw:hover, .link-draw:focus-visible { background-size: 100% 1px; }

/* Bidirectional: draws in from left, retracts to the left on leave */
.link-bidirectional {
  background-image: linear-gradient(currentColor,currentColor), linear-gradient(currentColor,currentColor);
  background-size: 0 1px, 100% 1px;
  background-position: left bottom, right bottom;
  background-repeat: no-repeat;
  transition: background-size 0.4s ease;
}
.link-bidirectional:hover { background-size: 100% 1px, 0 1px; }
```

### Monospace eyebrows / section counters (5 craft micro-details)

```css
/* 1. Monospace eyebrow label */
.eyebrow {
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem; /* 11px */
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.40);
  font-weight: 500;
}
/* Bracket variant: */
.eyebrow-bracket::before { content: "[ "; opacity: 0.5; }
.eyebrow-bracket::after  { content: " ]"; opacity: 0.5; }

/* 2. Auto-incrementing section counters (01 / 02 / 03) */
.sections-wrapper { counter-reset: section; }
.sections-wrapper section::before {
  counter-increment: section;
  content: counter(section, decimal-leading-zero);
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem; letter-spacing: 0.1em;
  color: rgba(255,255,255,0.25); display: block; margin-bottom: 0.5em;
}

/* 3. Custom list markers (em dash — editorial; 4px square — technical) */
ul.craft-list { list-style: none; padding: 0; }
ul.craft-list li { position: relative; padding-left: 1.5em; }
ul.craft-list li::before { content: "—"; position:absolute; left:0; color:rgba(255,255,255,0.25); }
ul.craft-list.tech li::before { content:""; position:absolute; left:0; top:0.6em;
  width:4px; height:4px; border-radius:1px; background:currentColor; opacity:0.4; }

/* 4. Custom focus ring (double-ring: bg gap + colored outer) */
*:focus { outline: none; }
*:focus-visible {
  outline: 2px solid rgba(99,102,241,0.8);
  outline-offset: 3px;
  border-radius: inherit;
  box-shadow: 0 0 0 2px rgb(10,10,15), 0 0 0 4px rgba(99,102,241,0.8);
  transition: box-shadow 0.15s ease;
}

/* 5. Hover states on cards and list rows */
.card { transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease; }
.card:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 40px rgba(0,0,0,0.5); }
.list-row { transition: background-color 0.15s ease, padding-left 0.15s ease; }
.list-row:hover { background-color: rgba(255,255,255,0.04); padding-left: calc(1rem + 2px); }

/* Bonus: gradient fade divider */
.divider-fade { height:1px; background:linear-gradient(to right, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent); margin: 3rem 0; }
/* Bonus: monospace dot divider */
.divider-mono::before { content:"· · · · · · · · · · · · · · · · · · · ·"; display:block; text-align:center;
  font-family:ui-monospace,monospace; letter-spacing:0.5em; color:rgba(255,255,255,0.12); font-size:0.75rem; margin:2.5rem 0; overflow:hidden; }
```

---

## 6. ART-DIRECTED LAYOUT KIT

**Rules:**
- Never use the centered-hero + even-3-card cliché. This is the default the builder exists to escape.
- No two adjacent sections share the same layout shape.
- Scale contrast is mandatory in every section: at least one 4× type size jump (e.g. 11px label + 72px headline).
- At least one full-bleed element per page. Full-bleed is dramatic because it contrasts contained sections.
- Overlap at least one element across a section boundary.
- Section backgrounds must alternate in weight: light/dark/light or light/light/dark/light — never five light in a row.
- Whitespace is doubled: take what feels like enough, then double it.

### Kit 01 — Asymmetric Left-Weighted Hero

```html
<!-- 7/5 grid split. Text left, image bleeds to right edge. Display type 7rem+, kicker 11px. -->
<section class="grid grid-cols-12 min-h-screen items-center">
  <div class="col-span-7 col-start-1 pr-16 z-10">
    <p class="text-[11px] tracking-[0.2em] uppercase text-neutral-400">Category / 001</p>
    <h1 class="text-[clamp(3rem,8vw,9rem)] font-black leading-[0.9] mt-4">Display<br>Headline</h1>
    <p class="mt-8 max-w-sm text-base text-neutral-300">Short descriptor. No more than two lines.</p>
    <a class="mt-10 inline-flex items-center gap-3 text-sm uppercase tracking-widest">Get started →</a>
  </div>
  <div class="col-span-6 col-start-7 h-screen -mr-8">
    <img class="w-full h-full object-cover" src="…" />
  </div>
</section>
```

### Kit 02 — Full-Bleed Band with Scale Contrast

```html
<!-- Edge-to-edge dark section. Giant stat or single statement. Zero cards. -->
<section class="w-full bg-neutral-950 py-32 px-16 flex items-center gap-16">
  <span class="text-[8rem] font-black leading-none text-white">99</span>
  <div>
    <span class="text-lg font-semibold text-white">%</span>
    <span class="text-[11px] text-neutral-400 uppercase tracking-widest block max-w-[8ch]">uptime guarantee</span>
  </div>
</section>
```

### Kit 03 — Sticky-Scroll Feature Reveal

```html
<!-- Left sticky (visual). Right scrolls through feature rows. -->
<section class="lg:grid lg:grid-cols-2 lg:gap-16">
  <div class="lg:sticky lg:top-24 lg:self-start py-20">
    <div class="aspect-video bg-neutral-900 rounded-xl overflow-hidden">
      <img id="feature-visual" src="feature-1.png" class="w-full h-full object-cover transition-opacity" />
    </div>
  </div>
  <div class="divide-y divide-neutral-100">
    <div class="py-16 feature-item" data-visual="feature-1.png">
      <span class="text-[11px] tracking-widest uppercase text-neutral-400">01 / Always on</span>
      <h3 class="mt-3 text-2xl font-bold">Continuous fleet awareness</h3>
      <p class="mt-3 text-neutral-400">The agent watches without being asked.</p>
    </div>
  </div>
</section>
```

### Kit 04 — Offset Editorial Spread (full-bleed image, bottom-left text)

```html
<section class="relative h-[80vh] overflow-hidden">
  <img class="absolute inset-0 w-full h-full object-cover object-[center_30%]" src="…" />
  <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
  <div class="relative z-10 h-full flex flex-col justify-end px-16 pb-16 max-w-2xl">
    <p class="text-[11px] tracking-[0.2em] uppercase text-white/60">Chapter 02</p>
    <h2 class="mt-3 text-6xl font-black text-white leading-tight">The goal<br>system.</h2>
    <p class="mt-6 text-white/70 max-w-md">One sentence that earns the image.</p>
  </div>
</section>
```

### Kit 05 — Big Numbered Editorial List

```html
<!-- Horizontal divide-x grid. Oversized step number (5–7rem, light gray). -->
<div class="grid grid-cols-1 md:grid-cols-3 divide-x divide-neutral-200">
  <div class="px-10 py-12">
    <span class="block text-[6rem] font-black leading-none text-neutral-100">01</span>
    <h4 class="mt-4 text-xl font-semibold">Always-on agent</h4>
    <p class="mt-2 text-sm text-neutral-400">Continuous presence on your fleet.</p>
  </div>
</div>
```

### Kit 06 — Weighted Bento (2/3 dominant + two small)

```html
<!-- One dominant cell (2 cols, 2 rows) + two small cells stacked right. No equal cells. -->
<div class="grid grid-cols-3 grid-rows-2 gap-4 h-[600px]">
  <div class="col-span-2 row-span-2 bg-neutral-900 rounded-2xl p-8 flex flex-col justify-end">
    <h3 class="text-3xl font-bold text-white">Primary feature</h3>
    <p class="mt-2 text-neutral-400 text-sm">The most important one gets the most space.</p>
  </div>
  <div class="bg-neutral-100 rounded-2xl p-6 flex flex-col justify-between">
    <span class="text-3xl font-black">99%</span>
    <span class="text-xs text-neutral-400 uppercase tracking-widest">Uptime</span>
  </div>
  <div class="bg-neutral-100 rounded-2xl p-6 flex flex-col justify-between">
    <span class="text-3xl font-black">&lt;50ms</span>
    <span class="text-xs text-neutral-400 uppercase tracking-widest">Latency</span>
  </div>
</div>
```

### Kit 07 — Alternating Feature Rows (3 different split ratios)

```html
<!-- Row 1: 5/7. Row 2: 7/4 (DIFFERENT proportion). Row 3: 4/7. Never mirror. -->
<div class="grid grid-cols-12 gap-8 items-center py-20">
  <div class="col-span-5 col-start-1">
    <span class="text-[11px] tracking-widest uppercase text-neutral-400">01</span>
    <h3 class="text-3xl font-bold mt-2">Feature name</h3>
    <p class="mt-4 text-neutral-400">Description that earns the image.</p>
  </div>
  <div class="col-span-7 col-start-6 h-64 bg-neutral-100 rounded-xl overflow-hidden">
    <img class="w-full h-full object-cover" />
  </div>
</div>
```

### Kit 08 — Generous Minimal CTA (left-aligned, mostly void)

```html
<!-- py-40, left-aligned, no button box — just a text link. Signals confidence. -->
<section class="grid grid-cols-12 py-40">
  <div class="col-start-4 col-span-6">
    <h2 class="text-5xl font-bold">Ready to start?</h2>
    <a class="mt-8 inline-block text-sm tracking-wide uppercase link-draw">Get access →</a>
  </div>
</section>
```

**Page rhythm rule (rotate in this order — never repeat adjacent):**
```
Section 1 [HERO]     → Kit 01: asymmetric left-weighted, full bleed, dark bg
Section 2 [PROOF]    → Kit 02: full-bleed light band, scale contrast stat numbers
Section 3 [FEATURES] → Kit 03: sticky-scroll split, contained
Section 4 [HOW]      → Kit 05: big numbered editorial list
Section 5 [VISUAL]   → Kit 04: full-bleed editorial spread image
Section 6 [CTA]      → Kit 08: generous minimal, left-aligned, void
```

---

## 7. EXPENSIVE MOTION

### Motion Tokens Module — import everywhere, hardcode nothing

```ts
// lib/motion-tokens.ts
import { Variants, Transition } from "framer-motion"

export const ease = {
  fluentOut:   [0.16, 1, 0.3, 1]         as [number,number,number,number], // confident entrance, primary curve
  snappyOut:   [0.22, 1, 0.36, 1]        as [number,number,number,number], // UI response, hover/micro
  smoothInOut: [0.645, 0.045, 0.355, 1]  as [number,number,number,number], // on-screen repositioning
  anticipate:  [0.34, 1.56, 0.64, 1]    as [number,number,number,number], // playful overshoot — delight only
  exitIn:      [0.55, 0, 1, 0.45]        as [number,number,number,number], // decisive exit
  subtleHover: [0.25, 0.1, 0.25, 1]      as [number,number,number,number], // color/opacity hover only
  gsap: {
    fluentOut:   "cubic-bezier(0.16, 1, 0.3, 1)",
    snappyOut:   "cubic-bezier(0.22, 1, 0.36, 1)",
    smoothInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
    exitIn:      "cubic-bezier(0.55, 0, 1, 0.45)",
  },
} as const

export const duration = {
  hover: 0.15, hoverTransform: 0.18, micro: 0.12, microRelease: 0.15,
  tooltip: 0.15, tooltipExit: 0.08, dropdown: 0.2,
  modal: 0.4, modalExit: 0.28, sheet: 0.42, sheetExit: 0.3,
  page: 0.5, pageExit: 0.35, reveal: 0.6, ambient: 1.0,
} as const

export const spring = {
  snappy:  { type:"spring" as const, stiffness:500, damping:35, mass:1 }, // immediate UI feedback
  soft:    { type:"spring" as const, stiffness:300, damping:28, mass:1 }, // modals, panels, drawers
  bouncy:  { type:"spring" as const, stiffness:400, damping:20, mass:1 }, // delight/success only
  gentle:  { type:"spring" as const, stiffness:200, damping:26, mass:1.2 }, // background/parallax
} as const

export const stagger = { childDelay:0.1, small:0.08, base:0.06, large:0.04 } as const

export const fadeUp: Variants = {
  hidden:  { opacity:0, y:16 },
  visible: { opacity:1, y:0, transition:{ duration:duration.reveal, ease:ease.fluentOut } },
  exit:    { opacity:0, y:8,  transition:{ duration:duration.page,  ease:ease.exitIn } },
}
export const fadeScale: Variants = {
  hidden:  { opacity:0, scale:0.96 },
  visible: { opacity:1, scale:1,    transition:{ duration:duration.modal,     ease:ease.fluentOut } },
  exit:    { opacity:0, scale:0.96, transition:{ duration:duration.modalExit, ease:ease.exitIn } },
}
export const staggerContainer = (d=stagger.base, delay=stagger.childDelay): Variants => ({
  hidden: {}, visible: { transition: { staggerChildren:d, delayChildren:delay } },
})
export const listItem: Variants = {
  hidden:  { opacity:0, y:12 },
  visible: { opacity:1, y:0, transition:{ duration:0.5, ease:ease.fluentOut } },
}
export const reducedTransition: Transition = { type:"tween", duration:0.01, ease:"linear" }
```

### Timing table

| Interaction | Duration | Ease |
|---|---|---|
| Hover (color/opacity) | 150ms | `subtleHover` |
| Hover (transform) | 180ms | `snappyOut` |
| Button press down | 120ms | `snappyOut` |
| Button press release | 150ms | `spring.snappy` |
| Tooltip in/out | 150ms / 80ms | `fluentOut` / `exitIn` |
| Dropdown | 200ms | `fluentOut` |
| Modal open/close | 400ms / 280ms | `fluentOut` / `exitIn` |
| Page transition | 500ms / 350ms | `fluentOut` / `exitIn` |
| Scroll reveal | 600ms | `fluentOut` |

### Cheap motion ban list (these make motion look AI-generated)

- `linear` on anything that moves spatially — it violates physics
- Same 300ms duration for hover AND modal AND page transition — removes hierarchy
- All list items animating simultaneously — not a stagger, a toggle
- `transition: all` — animates layout properties, causes jank
- `ease-in` for entrances — the element arrives late
- `springBouncy` on navigation, error states, data tables — tone-deaf
- Scale range outside `0.94–1.06` for UI feedback — cartoonish
- Exits the same duration as entrances — exits should be 15–25% shorter
- Spring animations on exits — spring duration is unbounded; use `exitIn` tween

### Stagger sizing

- 2–4 items: 80ms per item
- 5–8 items: 60ms per item
- 9+ items: 40ms per item; animate only first 5, rest appear instantly

---

## 8. SCROLL STORYTELLING

**Rule: every premium build includes ONE scroll-driven storytelling moment.**
A scroll story has beats: setup, reveal, payoff. Static scroll-triggered fades are decoration.

### Smooth scroll foundation (Lenis + GSAP — non-negotiable)

```bash
npm install gsap lenis @gsap/react
```

```tsx
// components/SmoothScroll.tsx — copy-paste, add to root layout
"use client"
import { ReactLenis, useLenis } from "lenis/react"
import { useRef, useEffect } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { usePathname } from "next/navigation"
gsap.registerPlugin(ScrollTrigger)

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<{ lenis?: { raf: (t:number)=>void } }>(null)
  useEffect(() => {
    function update(time: number) { lenisRef.current?.lenis?.raf(time*1000) }
    gsap.ticker.add(update); gsap.ticker.lagSmoothing(0); ScrollTrigger.refresh()
    return () => gsap.ticker.remove(update)
  }, [])
  const pathname = usePathname()
  useEffect(() => { ScrollTrigger.getAll().forEach(t=>t.kill()); ScrollTrigger.refresh() }, [pathname])
  return (
    <ReactLenis root ref={lenisRef}
      options={{ lerp:0.1, duration:1.5, syncTouch:true, autoRaf:false, anchors:true }}>
      {children}
    </ReactLenis>
  )
}
```

### Canonical pinned-reveal (copy-paste pattern)

```tsx
// The "Apple move" — section pins, scroll drives a GSAP timeline through 3–5 beats
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: wrapperRef.current,   // outer spacer div (minHeight: "400vh")
    start: "top top",
    end: "bottom bottom",
    scrub: 1,                      // 1s catch-up for smooth feel
    pin: stickyRef.current,        // inner sticky div (height: "100vh")
    anticipatePin: 1,              // prevent pin jump
    invalidateOnRefresh: true,     // recalculate on resize
  },
})
// Add beats: tl.fromTo(".element", { opacity:0, y:40 }, { opacity:1, y:0, duration:1 })
// Use "+=0.3" labels for gaps between beats
// Always: useGSAP(() => { ... }, { scope: wrapperRef }) — auto-cleans on unmount
```

Outer wrapper HTML:
```html
<div ref={wrapperRef} style={{ minHeight:"400vh", position:"relative" }}>
  <div ref={stickyRef} style={{ position:"sticky", top:0, height:"100vh", overflow:"hidden" }}>
    <!-- animated content inside -->
  </div>
</div>
```

### Canonical parallax pattern (copy-paste)

```tsx
const setY = gsap.quickSetter(layerEl, "y", "px")  // cached — skips string parsing each frame
ScrollTrigger.create({
  trigger: sceneEl,
  start: "top bottom", end: "bottom top",
  scrub: true,
  onUpdate: (self) => setY(self.progress * window.innerHeight * speed * 2),
  invalidateOnRefresh: true,
})
// Layer speeds: far bg = -0.3, mid bg = -0.15, foreground = +0.2
// All layers: position: absolute; inset: -20% 0;  (bleed to hide parallax edges)
// willChange: "transform" on each layer
```

### Performance rules for scroll

- Animate `transform` and `opacity` only — compositor thread, no layout recalc
- Never animate `width`, `height`, `top`, `left`, `margin`
- `willChange: "transform"` on animated elements; remove after animation
- `invalidateOnRefresh: true` on all function-based ScrollTrigger values
- `anticipatePin: 1` on all pinned sections
- `ScrollTrigger.getAll().forEach(t=>t.kill())` on every route change
- Mobile: simplified motion (no pin, simple fade) via `gsap.matchMedia()`
- `prefers-reduced-motion`: `gsap.matchMedia()` with `reduceMotion` condition; show final states instantly

---

## 9. PREMIUM INTRO

**Rule: first-visit preloader + choreographed hero entrance. Skip on repeat visits (sessionStorage gate).**

### Copy-paste preloader + hero reveal

```tsx
// components/Preloader.tsx
"use client"
import { useEffect, useRef } from "react"
import gsap from "gsap"
const STEPS = [0,11,23,38,52,67,79,88,95,100]; const KEY = "helm_intro_seen"

export function Preloader({ onComplete }: { onComplete: ()=>void }) {
  const rootRef=useRef<HTMLDivElement>(null); const numRef=useRef<HTMLSpanElement>(null); const panelRef=useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (sessionStorage.getItem(KEY)) { onComplete(); return }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) { gsap.to(rootRef.current,{opacity:0,duration:0.15,onComplete}); sessionStorage.setItem(KEY,"1"); return }
    const tl = gsap.timeline({ onComplete:()=>{ sessionStorage.setItem(KEY,"1"); onComplete() } })
    const obj = { val:0 }
    STEPS.forEach((target,i) => {
      if (i===0) return
      const dur = i<5?0.22:i<8?0.14:0.09
      tl.to(obj, { val:target, duration:dur, ease:"power1.inOut",
        onUpdate() { if (numRef.current) numRef.current.textContent=String(Math.round(obj.val)).padStart(3,"0") } })
    })
    tl.to({},{duration:0.12})
    tl.to(panelRef.current,{clipPath:"inset(0 0 100% 0)",duration:0.55,ease:"expo.inOut"})
    tl.to(numRef.current,{opacity:0,duration:0.2,ease:"power2.in"},"<")
    return () => { tl.kill() }
  }, [onComplete])
  return (
    <div ref={rootRef} style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"flex-end",
      justifyContent:"flex-end",padding:"2.5rem",background:"#0a0a0a",pointerEvents:"none"}}>
      <div ref={panelRef} style={{position:"absolute",inset:0,background:"#0a0a0a",clipPath:"inset(0 0 0% 0)"}} />
      <span ref={numRef} style={{position:"relative",fontVariantNumeric:"tabular-nums",
        fontSize:"clamp(4rem,10vw,8rem)",fontWeight:700,letterSpacing:"-0.04em",
        color:"#fff",lineHeight:1,fontFamily:"var(--font-mono,monospace)"}}>000</span>
    </div>
  )
}
```

```tsx
// components/HeroReveal.tsx
"use client"
import { useEffect, useRef } from "react"
import gsap from "gsap"

export function HeroReveal({ ready, children }: { ready:boolean; children:React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ready||!ref.current) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const words  = ref.current.querySelectorAll<HTMLElement>("[data-reveal='word']")
    const lines  = ref.current.querySelectorAll<HTMLElement>("[data-reveal='line']")
    const assets = ref.current.querySelectorAll<HTMLElement>("[data-reveal='asset']")
    if (reduced) { gsap.set([words,lines,assets],{opacity:1,y:0}); return }
    gsap.set(words, {y:"110%",rotate:3}); gsap.set(lines,{y:"110%"}); gsap.set(assets,{clipPath:"inset(0 0 100% 0)",opacity:0})
    const tl = gsap.timeline({defaults:{ease:"expo.out"}})
    tl.to(words, {y:0,rotate:0,duration:1.0,stagger:0.07},0)
    tl.to(lines, {y:0,duration:0.85,stagger:0.06},0.18)
    tl.to(assets,{clipPath:"inset(0 0 0% 0)",opacity:1,duration:0.9,stagger:0.08,ease:"expo.inOut"},0.25)
    return () => { tl.kill() }
  }, [ready])
  return <div ref={ref}>{children}</div>
}
```

```tsx
// Root shell — add to app/layout.tsx or a client wrapper
"use client"
import { useState } from "react"
import { Preloader } from "@/components/Preloader"
import { HeroReveal } from "@/components/HeroReveal"

export function RootShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(
    typeof window!=="undefined" && !!sessionStorage.getItem("helm_intro_seen")
  )
  return (
    <>
      {!ready && <Preloader onComplete={() => setReady(true)} />}
      <HeroReveal ready={ready}>
        <div style={{visibility:ready?"visible":"hidden"}}>{children}</div>
      </HeroReveal>
    </>
  )
}
```

```tsx
// Hero markup contract — wrap each animated piece
export function Hero({ ready }: { ready: boolean }) {
  return (
    // (inside HeroReveal)
    <section>
      <h1>
        {["Control.", "Every", "Device."].map(w => (
          <span className="mask-wrap" key={w}><span data-reveal="word">{w} </span></span>
        ))}
      </h1>
      <p className="mask-wrap"><span data-reveal="line">Your AI fleet, always in formation.</span></p>
      <div data-reveal="asset" className="hero-visual">{/* image / video / canvas */}</div>
    </section>
  )
}
```

```css
/* globals.css — required for mask-wrap */
.mask-wrap { overflow: hidden; display: inline-block; }
```

### Route transition (overlay wipe)

```tsx
// components/PageTransition.tsx — add to app/layout.tsx
"use client"
import { AnimatePresence, motion } from "framer-motion"
import { useSelectedLayoutSegment } from "next/navigation"

const overlay = {
  initial: { scaleX:0, transformOrigin:"left center" },
  enter:   { scaleX:1, transformOrigin:"left center",  transition:{ duration:0.45, ease:[0.76,0,0.24,1] } },
  exit:    { scaleX:0, transformOrigin:"right center", transition:{ duration:0.45, ease:[0.76,0,0.24,1] } },
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment()
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={`overlay-${segment}`} variants={overlay} initial="initial" animate="enter" exit="exit"
          style={{position:"fixed",inset:0,zIndex:8888,background:"#0a0a0a",pointerEvents:"none"}} />
      </AnimatePresence>
      {children}
    </>
  )
}
```

Easing reference:
- Word mask lift: `expo.out` — aggressive deceleration, lands with snap
- Asset clip wipe: `expo.inOut` — crisp both ends
- Preloader panel: `expo.inOut`
- Route overlay: `[0.76, 0, 0.24, 1]` (power4.inOut)
- Total preloader time: ≤ 1800ms
- Reduced-motion: ≤ 150ms crossfade

---

## REQUIRED PACKAGES

```bash
npm install gsap lenis @gsap/react motion
# Framer Motion layoutId, AnimatePresence, useScroll, useVelocity, useSpring
# GSAP ScrollTrigger, SplitText (licensed), useGSAP hook
# Lenis smooth scroll driven by GSAP ticker
```

---

## QA CHECKLIST (run before shipping)

- [ ] Identity chosen from §2 — NOT Inter + navy
- [ ] Grain overlay present (`body::after` with grain SVG)
- [ ] Preloader fires on first visit, skips on repeat (sessionStorage)
- [ ] Every button has hover + press (spring) + focus-visible ring
- [ ] No two adjacent sections use the same layout shape
- [ ] At least one full-bleed element
- [ ] At least one section boundary overlap
- [ ] Scale contrast (4× type size jump) in every section
- [ ] ONE signature interaction — no more, no less
- [ ] ONE scroll-driven storytelling moment
- [ ] `prefers-reduced-motion` guard on every GSAP and Framer Motion animation
- [ ] `transform` and `opacity` only in scroll animations (no layout props)
- [ ] `will-change: transform` on GPU-animated elements
- [ ] `anticipatePin: 1` and `invalidateOnRefresh: true` on all pinned sections
- [ ] ScrollTriggers killed on route change
- [ ] ≥ 5 craft micro-details (eyebrows, counters, markers, hover states, focus rings)
- [ ] Custom animated underline on all `<a>` tags
- [ ] Section counters (01/02/03) or monospace eyebrow labels visible
- [ ] No symmetric centering as default — asymmetry unless justified
- [ ] Background weight alternates section by section
