# Anti-AI Design: The Complete Teardown

A brutally specific catalogue of what makes a site look AI-generated, what award-winning designers do instead, and the hard rules that follow from it.

---

## The 24 Tells of an AI/Template Site

Each pattern is named precisely. For each, the bespoke alternative is stated concretely.

---

### 1. The Purple-Gradient Hero

**Tell:** A dark background with a violet-to-indigo (or indigo-to-blue) radial gradient emanating from the center-top of the hero. Often combined with a faint glow orb. This is now universally understood as "we used Claude or v0 to build this." Adam Wathan (Tailwind creator) publicly apologized for normalizing `bg-indigo-500` across Tailwind UI — every AI trained on that corpus now defaults there.

**Bespoke alternative:** Pick a color identity you own. Not navy, not indigo, not slate. An actual hue decision made against your product's mood: the raw black of Linear (#010102), the acid-lime of a streetwear brand, the sand-and-terracotta of a food product. Apply it as a flat field or a hard-edge geometric shape, not a radial blur.

---

### 2. The Aurora/Mesh Blob Background

**Tell:** A soft, blurry multi-color mesh gradient (aurora, "gradient blob", animated gradient sphere) floating behind all content. Often implemented via Aceternity UI's `AuroraBackground` or CSS radial-gradients stacked with `blur(120px)`. Stripe did this first in 2018; by 2024 every SaaS page copied it.

**Bespoke alternative:** Use a deliberate single-color atmosphere (flat, paper, or dark) OR commit to a real visual system: a photographic full-bleed, a hard typographic field, a textured grain surface. If you use color in the background, make it a decision — one hue, one purpose.

---

### 3. Inter or Geist Everywhere

**Tell:** Inter (or Geist, or Roboto) for every text element — headings, body, captions, nav. These are the default fallbacks for every AI code generator, every shadcn scaffold, every Next.js starter. The result: a site with zero typographic personality. Described by critics as "safe, legible, and utterly forgettable."

**Bespoke alternative:** Commission or license a display typeface with a point of view. Obys Agency built their identity on outsized PP Neue Montreal and editorial poster-making logic. Lusion used a two-color palette and let the typography carry tension. At minimum: a display face with actual weight contrast (heavy title / light body), not Inter at every weight.

---

### 4. Centered Hero with Gradient-Text Headline

**Tell:** The hero is perfectly center-aligned. The headline is 60–80px, often with a gradient fill (white→purple, or white→cyan). Below it: a 16–18px gray subtitle. Below that: two buttons (primary solid, secondary outline). This exact composition is the default output of every vibe-coding tool.

**Bespoke alternative:** Break the axis. Left-align with oversized leading that runs off-frame. Stack headline and product side-by-side. Use a single enormous word as a visual object, not a sentence as a label. Obys lets letters "stretch, squash and shuffle to the rhythm of scroll inertia." Apple places the product first, lets the headline breathe at 56px max, never centers on desktop.

---

### 5. The Three-Column Feature Grid with Lucide Icons

**Tell:** Three (or six) cards, evenly spaced, each containing a 24px Lucide or Heroicon, a bold 20px title, and two lines of gray body copy. This is the statistical median of every GitHub Tailwind tutorial from 2019–2024. It communicates nothing about the product.

**Bespoke alternative:** Show the feature working. Use a real product screenshot, an animated component, a looping video of the interaction. Or go editorial: one feature at a time, fullscreen, with a paragraph of real copy and a visual that proves the claim. Asymmetric grid with variable cell sizes (true bento intent, not uniform cards).

---

### 6. Glassmorphism Cards

**Tell:** Semi-transparent frosted-glass cards (`backdrop-blur`, `bg-white/10`, white 1px border) floating over a gradient background. A 2021 trend that became a template staple. Now a universal marker of "I used a UI kit."

**Bespoke alternative:** Opaque surfaces with real elevation logic. Either flat + shadow-free (Linear, Stripe) or fully textured (grain paper, linen, noise). Transparency as a deliberate compositional choice — not a default card style.

---

### 7. Safe Rounded-2xl Corners on Everything

**Tell:** Every card, button, input, image, and modal uses `border-radius: 16px` or `rounded-2xl`. Applied uniformly with no hierarchy. The radius is chosen for "friendliness" without a design reason.

**Bespoke alternative:** Own your radius as a brand token. Sharp corners for editorial authority. A single specific radius (4px, 6px) applied consistently. Or mixed intentionally: sharp containers, pill buttons — a system with rules, not a blanket softener.

---

### 8. The Gradient-Fill "Announcement" Pill Badge

**Tell:** Above the hero headline: a small pill/chip with a gradient border or subtle gradient fill saying something like "✨ New — AI-powered features" or "Now in beta." This micro-component is now in every shadcn and Aceternity block library.

**Bespoke alternative:** If you need to call out something new, do it in the copy hierarchy. Or use an actual editorial device: a date-stamped flag, a sidebar annotation, a bold overline in all-caps. No badges that look like they were pulled from a component gallery.

---

### 9. Subtle Shadow at 0.1 Opacity

**Tell:** Cards and containers use `box-shadow: 0 4px 24px rgba(0,0,0,0.08)`. So ubiquitous it reads as invisible — it neither creates depth nor takes a design position. It is the shadow equivalent of Helvetica Neue.

**Bespoke alternative:** Either use no shadow (flat design with edge borders) or use shadow as a deliberate spatial statement — dark, directional, specific. Figma and Linear use hard drop shadows as interactive feedback, not ambient elevation.

---

### 10. Evenly-Spaced Section Rhythm

**Tell:** Every section on the page has identical vertical padding (py-24 or py-32). The spacing is mechanical — a loop variable, not a design decision. The page feels like a list of blocks, not a composed document.

**Bespoke alternative:** Compose the page like a magazine spread. Some sections breathe (200px top padding), some are compressed for density, some collide intentionally. Spacing carries meaning: urgency = tight, luxury = expansive. Vary it on purpose.

---

### 11. The "Social Proof" Logo Strip

**Tell:** A horizontal strip of 6–10 desaturated company logos under the hero, labeled "Trusted by teams at ___." This is now so standard it is invisible to users and signals nothing about quality.

**Bespoke alternative:** One customer, told as a story. A pull quote with a real name and real outcome. Or skip the logos entirely and let the product demonstration do the work. If you use logos, make them part of the composition — not a template strip.

---

### 12. Stock-Photo or Faceless 3D Avatar Illustrations

**Tell:** Abstract 3D humanoid figures holding glowing orbs, floating in space, "interacting with technology." Alternatively: Unsplash-style stock photography with the saturation pulled down. Both signal total absence of a visual identity decision.

**Bespoke alternative:** Real product screenshots at actual pixel density. Or commissioned illustration with a specific point of view (Collins briefs illustration systems that are unmistakably theirs). Or no imagery at all — pure typography as the visual. Lusion used custom assets for every single visual element on their SOTY site.

---

### 13. Dark Navy → Black Background with Purple/Teal Accents

**Tell:** `#0a0a0f` or `#0d0d1a` background — not true black, not a designed dark. With `text-purple-400` or `text-cyan-400` accents. This is the default AI "dark mode SaaS" aesthetic, trained on Linear, Vercel, and Raycast.

**Bespoke alternative:** If you go dark, own the dark. Linear uses pure `#010102` with a single lavender accent at maximum restraint. Or go warm dark: deep brown, forest green, burgundy. Or invert entirely and work in full white/light. The choice should be a brand decision, not a mode toggle default.

---

### 14. The Predictable Section Order

**Tell:** Hero → Logo strip → Feature grid → "How it works" steps → Testimonials → Pricing → CTA → Footer. This exact sequence is the statistical average of every SaaS homepage in the training data. Users can predict the next section without scrolling.

**Bespoke alternative:** Start with the product, not a headline. Interleave features inside a narrative. Let a section be entirely typographic. Use a full-screen video. Subvert the expected sequence — make the user discover the site, not scan it.

---

### 15. Symmetric Everything

**Tell:** Left column = right column. Icon grid = perfect grid. Every component has an axis of symmetry. The layout has no tension, no dynamism, no visual surprise. Symmetry is the default of algorithmic layout.

**Bespoke alternative:** Asymmetry as a compositional tool. One element at 60% width, one at 40%. Text and image that don't align. A headline that overruns the column. Awwwards winners consistently use "unexpected, dynamic compositions" as a differentiator. Visual tension keeps the eye moving.

---

### 16. Glassmorphism or Gradient on the Navigation Bar

**Tell:** A `backdrop-blur` navbar that becomes glass when scrolled, sometimes with a subtle gradient border. A sticky nav that announces its presence as a component rather than disappearing into the experience.

**Bespoke alternative:** A navbar that is an invisible typographic element, not a glass card. Or a sidebar nav. Or no persistent nav at all — let the product scroll be uninterrupted. Lusion, Active Theory, and Obys often have minimal or hidden navs that appear only on hover or scroll-stop.

---

### 17. "Scroll to Reveal" Cards with Fade-Up Animations

**Tell:** Every card and section fades up as it enters the viewport via `framer-motion`'s `whileInView`. The animation is identical for every element: opacity 0→1, y +20px→0, ease-out, 0.4s. It reads as a default, not a choreography.

**Bespoke alternative:** Motion with a point of view. Linear uses "crisp, aggressive entrance." Luxury brands use "slow, graceful reveal." Pick a motion language and express it specifically. Or use horizontal reveals, scale reveals, clip-path reveals — something that reflects the product's character. Lusion pre-calculated simulations in Houdini to get cloth physics that feel genuinely real.

---

### 18. Bento Grid Feature Showcase

**Tell:** A 3×2 or 4×3 grid of feature cards with variable cell sizes, each with a gradient mini-illustration, a bold title, and two lines of copy. The "bento grid" was a fresh composition idea in 2023. By 2024 it was a shadcn block. By 2025 it was the default AI output for "feature section."

**Bespoke alternative:** One feature, told fully. Or a horizontal scroll that reveals features sequentially with context. Or an interactive demo that lets users experience the feature directly. The grid is the problem — it's a container pretending to be a design.

---

### 19. Lorem-ish Marketing Copy

**Tell:** Headlines like "The platform that powers your workflow" or "Build faster, ship better." Filler copy that could apply to any software product. AI generators produce statistically average copy to match statistically average layouts — the result is homogenized at the concept level, not just visual.

**Bespoke alternative:** Specific claims. Real numbers. A product voice that has a personality. "7 lines of code" (Stripe). "Linear is built for the models." Copy that only applies to your exact product, written by a person who uses it.

---

### 20. The Product Screenshot Hovering in the Hero

**Tell:** A slightly-angled `transform: perspective(1000px) rotateX(5deg)` screenshot of the product dashboard, placed in the hero, sometimes with a fake drop shadow or glow beneath it. Used by 80%+ of SaaS heroes.

**Bespoke alternative:** Show the product in actual context. An animated walkthrough. A real workflow running. Or isolate a single powerful UI moment — one component that proves the product's quality — rather than a full dashboard no one can read.

---

### 21. No Grain, No Texture, No Physical Reference

**Tell:** Perfectly smooth surfaces everywhere. No noise, no grain, no texture layer. The site exists in a digital void with no reference to material reality. This is what AI generates because grain is not in CSS — it requires a design decision.

**Bespoke alternative:** A 4–8% grain overlay (SVG filter or PNG texture) on backgrounds. Subtle noise on gradient fields. A paper or canvas texture on light backgrounds. Physical reference — even slight — signals craft and intentionality. The best editorial sites use grain as a signature, not decoration.

---

### 22. The Pricing Section with Gradient-Border Highlighted Tier

**Tell:** Three pricing tiers. The middle "Pro" tier has a gradient or colored border, sometimes a "Most Popular" badge. The layout is identical to Stripe's pricing page from 2020, which every SaaS subsequently copied.

**Bespoke alternative:** A pricing section designed to match the product's complexity. One tier if the product is simple. A comparison table built from real differentiators. No "Most Popular" badge — let the product speak for itself.

---

### 23. Footer with "Built with [stack]" or "Powered by AI" Boilerplate

**Tell:** A dense link-grid footer with every possible page linked, a newsletter input, social icons, and a small "Built with Next.js" or "Powered by Vercel" badge. This footer is a template checkbox, not a brand touchpoint.

**Bespoke alternative:** A footer that has a personality. Minimal (just a copyright line and two links). Or editorial (a large display typeface with the product name). Or interactive (a live status or a product demo). The footer is the last thing seen — make it a signature, not a form.

---

### 24. No Signature Interaction

**Tell:** The site has no single interaction that you would describe to someone else. No cursor effect, no scroll trigger, no hover state, no transition that makes you say "wait, do that again." Generic sites are navigated without noticing the navigation.

**Bespoke alternative:** One owned interaction. Obys: oversized letterforms that "stretch, squash and shuffle" on scroll. Lusion: a cloth simulation pre-computed in Houdini, interactive on hover. Active Theory: camera transitions between sections that feel cinematic. It doesn't need to be expensive — a precise cursor follower or a clip-path reveal on hover is enough. It needs to exist.

---

## Studios to Study

**Obys Agency (Amsterdam)** — teaches: typography as architecture. Every composition is a poster first, a webpage second. Modernist grid discipline + kinetic letterforms. Studio of the Year 2023, Awwwards.

**Lusion (London)** — teaches: custom assets, zero templates. Every pixel is a bespoke decision. Pre-computed Houdini simulations in 220KB. Site of the Year 2024, Awwwards.

**Active Theory (Venice Beach)** — teaches: cinematic storytelling. Sections transition like film cuts. Motion communicates narrative, not decoration. Consistent multi-project award winners.

**Resn (Wellington/Amsterdam)** — teaches: craft at the frontier. Gaussian splatting, game design, physical installations. Proof that the browser is a creative medium, not a document format.

**Apple.com** — teaches: editorial restraint + total product confidence. No decoration — the product is the design. White space as an active compositional element. Typography hierarchy so clean it becomes invisible.

**Stripe** — teaches: earned aesthetic. The gradients and animations work because the product solves a real problem with seven lines of code. Design reflects execution reality, not aspirational positioning.

**Pentagram** — teaches: no house style. Every client gets a unique visual identity, not a reskinned system. "Establishing a visual tone for each project rather than stamping a house style onto every design problem."

---

## Rules for Our Builder

Hard DO-NOT / DO pairs. These are design constraints, not guidelines. Violating them produces a site that looks AI-generated.

| DO NOT | DO instead |
|--------|-----------|
| Default purple/indigo gradient as hero background or accent | Pick an owned hue, stated flat or as a hard-edge shape |
| Aurora blob / gradient mesh / radial blur backgrounds | Flat color field, or a fully committed photographic or typographic surface |
| Inter/Geist/Roboto as the only typeface | A display face with character + legibility face for body; two intentional decisions |
| Centered hero with gradient-fill headline | Off-center, editorial composition; headline as a visual object not a sentence-label |
| Three-column icon + title + copy feature grid | Feature demonstrated in-product; asymmetric editorial layout; one feature at full width |
| Glassmorphism cards (`backdrop-blur`, `bg-white/10`) | Opaque surfaces with deliberate elevation logic, or flat with edge treatment |
| Uniform `border-radius: 16px` on everything | A single radius token that is a brand decision, applied with hierarchy |
| Gradient-border pill announcement badge above headline | Copy hierarchy, editorial flag, or nothing |
| Box-shadow at 0.1 opacity on every card | No shadow (flat), or a deliberate dark directional shadow as a spatial statement |
| Identical section padding throughout the page | Varied vertical rhythm as a compositional tool — tight where urgent, expansive where breathing |
| Horizontal logo strip "Trusted by" under hero | One customer story, or no social proof, or logos as a designed composition element |
| Stock photos or faceless 3D avatars | Real product screenshots, commissioned illustration, or pure typography |
| Dark navy #0a0a0f with purple/teal accents | An owned dark (true black, warm dark, brand-specific) or a deliberate light-mode |
| Predictable hero→features→testimonials→pricing section order | Narrative sequence; let product logic determine structure, not template convention |
| Symmetric layout everywhere | Asymmetry as tension; asymmetric ratios (60/40, 70/30); off-axis headlines |
| All-identical fade-up scroll reveal animations | A specific motion language (crisp, slow, elastic, mechanical); varied reveal types |
| Bento grid as "feature showcase" | One feature at full width, animated; or an interactive product demo |
| Generic marketing copy ("the platform that powers X") | Specific claims; real numbers; a voice that could only describe this product |
| Angled perspective-transform product screenshot in hero | Live animated walkthrough, or a single isolated UI moment that proves quality |
| Smooth surfaces, no texture, no grain | A 4–8% grain overlay on backgrounds as a physical reference and craft signal |
| Three-tier pricing with gradient "Most Popular" border | Pricing designed to the product's actual structure; no cosmetic highlighting |
| Dense link-grid template footer | A footer with personality — minimal, editorial, or interactive; a brand close |
| No signature interaction anywhere on the site | One owned interaction that is memorable enough to describe to someone else |
