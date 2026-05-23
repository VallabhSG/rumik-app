---
name: rumik
description: A music discovery and listening app for quality-first listeners
colors:
  bg: "#f5f2ed"
  surface: "#ede8e0"
  muted: "#d8d0c4"
  accent: "#3d5a6e"
  accent-deep: "#2d4a5e"
  text: "#18202a"
  text-secondary: "#8a8070"
  text-muted: "#b0a898"
  border: "#e8e2d8"
  white: "#fdfcfa"
theme: light
typography:
  display:
    fontFamily: "System (SF Pro Display / Roboto)"
    fontSize: "32px"
    fontWeight: 800
    letterSpacing: "-1px"
    lineHeight: 1.1
  headline:
    fontFamily: "System"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "System"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "System"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "System"
    fontSize: "10px"
    fontWeight: 800
    letterSpacing: "1.5px"
    lineHeight: 1.2
  mono:
    fontFamily: "monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  card-default:
    backgroundColor: "{colors.evening-card}"
    rounded: "{rounded.xl}"
    padding: "20px"
  card-accent:
    backgroundColor: "{colors.midnight-card}"
    rounded: "{rounded.xl}"
    padding: "20px"
  button-primary:
    backgroundColor: "{colors.indigo-action}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.electric-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  badge-version:
    backgroundColor: "{colors.violet-signal}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: rumik

## 1. Overview

**Creative North Star: "The Late Listening Session"**

rumik is the room you sit in while the music plays. The interface exists to frame the audio, not perform alongside it. Every surface decision traces back to one physical scene: someone at midnight, headphones on, eyes adjusted to near-darkness, fully inside a record. The UI must earn its place in that room. It speaks only when spoken to.

The darkness here is not the default dark of developer tools or crypto dashboards. It has weight. The near-blacks carry a faint violet cast — they read as ink, not void. Surfaces layer tonally, growing slightly lighter as they come forward, like objects emerging from shadow. The effect is depth without drama.

The palette is currently blue/indigo dominant. It reads as premium and nocturnal, but it lacks warmth. The system is actively evolving toward an amber secondary — a candle note in a cold room. Until that token lands, warmth is carried through spacing generosity, type weight contrast, and the absence of clutter. The system explicitly rejects the cold, clinical dark of IDE themes, the aggressive green of mass-market streaming, and any surface that mistakes dark mode for a design decision.

**Key Characteristics:**
- Sparse density: breathing room is a design decision, not an afterthought
- Tonal depth: no shadows; surfaces layer through background value
- Weight-driven hierarchy: type scale uses weight contrast as much as size contrast
- Tactile interactions: light scale on press confirms without performing
- Evolving warmth: amber accent incoming; until then, warmth lives in restraint

## 2. Colors: The Listening Room Palette

Deep, inky backgrounds layered tonally; electric blue as the primary signal color; violet as the identity accent; amber warmth emerging.

### Primary
- **Void Ash** (`#0a0a0f`): The base container background. Near-black with a barely perceptible violet cast. Never pure black. The cast keeps it from reading as a color void.
- **Deep Listening Surface** (`#0d0d14`): The first surface layer above void. Header cards and primary content areas.
- **Electric Blue** (`#3b82f6`): The signal color. Labels, borders on active states, navigation markers, inline text links. Never more than 10% of any given screen.
- **Violet Signal** (`#7c3aed`): The identity accent. Version badges, brand moments. Rarer than electric blue. Its appearance means something.
- **Indigo Action** (`#6366f1`): Primary interactive elements: CTA buttons, update banners. The one color a user can press.

### Secondary
- **Sky Blue** (`#60a5fa`): Elevated text emphasis. Bold variant states, prominent headings in active mode.
- **Mist Blue** (`#93c5fd`): Softer text accent for secondary context: onboarding titles, informational labels.
- **Amber (Emerging)**: The system is missing its warm note. Introduce `oklch(68% 0.14 60)` (approximately `#d4853a`) as a secondary accent for editorial surfaces, featured content labels, and new-release callouts. This token does not yet exist in code.

### Neutral
- **Evening Card** (`#1a1a2e`): Default card background. Deep indigo-navy.
- **Midnight Card** (`#1e1b4b`): Accent card variant. Shifted indigo, slightly warmer and lighter.
- **Night Cave** (`#0f172a`): Deep editorial sections (New Releases). The darkest surface that still holds content.
- **Slate Muted** (`#4b5563`): Tertiary text, timestamps, meta information.
- **Slate Secondary** (`#6b7280`): Secondary text, subtitles, artist names.
- **Slate Tertiary** (`#9ca3af`): Card subtitles, placeholder context.
- **Ghost Lavender** (`#e0e7ff`): Text on dark interactive surfaces (update banner).

### Status
- **Crimson Alert** (`#7f1d1d`) / **Crimson Border** (`#ef4444`) / **Crimson Soft** (`#fca5a5`): Kill switch state. The three-layer crimson system (background / border / text) signals immediate action without ambiguity.

### Named Rules

**The Signal Rule.** Electric Blue (`#3b82f6`) appears on at most 10% of any screen. It is a signal, not a wash. When everything is blue, nothing is.

**The Ink Rule.** Near-blacks must carry hue. `#0a0a0f` is the floor. Never pure black. The violet cast in the base background is structural: it separates rumik from the cold grey of IDE themes.

**The Warm Debt Rule.** Every new surface added to the system should ask: does this need the amber note? Until the amber token is formally introduced, resist filling that role with more blue.

## 3. Typography

**Display Font:** System (SF Pro Display on iOS, Roboto on Android)
**Body Font:** System
**Label/Mono Font:** System / monospace

**Character:** Hierarchy works through weight extremes rather than font personality: 800-weight wordmarks against 400-weight body text. The system font is a deliberate choice for a music app. Typography should disappear into the experience. Custom typefaces are a future consideration, but the bar is high. Anything introduced must earn its place without competing with the audio.

### Hierarchy
- **Display** (800 weight, 32px, letterSpacing -1px, lh 1.1): The wordmark and primary hero text. Heavy, compressed, confident. Used once per major screen.
- **Headline** (700 weight, 18px, lh 1.2): Card primary labels. Section anchors.
- **Title** (600 weight, 16px, lh 1.3): Section headings. One step below headline.
- **Body** (600 weight, 14px, lh 1.5): Track titles, primary list content. Heavier than typical body: this is content that matters.
- **Secondary Body** (400-500 weight, 13px, lh 1.5): Artist names, descriptive text, banner copy. Recedes behind primary content.
- **Label** (800 weight, 10px, UPPERCASE, letterSpacing 1.5-2px, lh 1.2): Version badges, section markers (NEW, API), category tags. The weight-at-tiny-size contrast is its identity.
- **Mono** (400 weight, 11px, monospace, lh 1.4): API URLs, technical metadata. Signals literal data.

### Named Rules

**The Weight Ladder Rule.** Every text element in a composition must be at least one weight step away from its neighbors. Adjacent 600 and 700 are not permitted at similar sizes: step to 400 or 800 instead.

**The Label Cap Rule.** Labels (10px, UPPERCASE) are markers, not headings. They identify a zone. Never use label style on text that contains a sentence.

## 4. Elevation

rumik uses tonal layering, not shadows. Depth is expressed entirely through background value: the darkest layer (`#0a0a0f`) is furthest back; surfaces come forward by lightening background value, not by adding drop shadows.

The layer stack, back to front:
1. Base: `#0a0a0f` — the container
2. First surface: `#0d0d14` — header cards, primary content areas
3. Card surface: `#1a1a2e` — interactive cards, list containers
4. Accent surface: `#1e1b4b` / `#0f172a` — contextual variants (featured, editorial)
5. Floating: `#1e1b4b` with border — update banner, modal-adjacent surfaces

No drop shadows exist in the current system. If a future surface requires perceived lift (a now-playing card, a bottom sheet), use a dark-hue ambient glow (`box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15)`) tinted toward the accent color, not neutral grey.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation is not decoration: it signals interactability or focus state. A shadow on a static card is a lie.

**The Tonal Staircase Rule.** Each new surface must be visibly distinct from its parent background in value: minimum 5 lightness steps in OKLCH. If two surfaces are indistinguishable, they are the same surface.

## 5. Components

### Buttons

The primary button is the one thing a user can press. It must be unambiguous.

- **Shape:** Gently curved (8px radius). Intentional, not playful.
- **Primary:** Indigo Action (`#6366f1`) background, white text, 7px vertical / 14px horizontal padding.
- **On press:** Scale 0.97, ease-out-expo, 100ms.
- **Hover / Focus:** Shift to Electric Blue (`#3b82f6`).
- **Destructive:** Bordered variant against Crimson Alert background when needed.

### Badges

The system's identity punctuation.

- **Version Badge:** Violet Signal (`#7c3aed`) background, white text, 10px/800 weight, 6px radius, 2px vertical / 8px horizontal padding.
- **Section Label (NEW, API):** No background. Electric Blue text, 10px/800 weight, UPPERCASE, letterSpacing 2px.

### Cards

Two variants only. Default for navigation, accent for editorial/featured.

- **Card Default:** Evening Card (`#1a1a2e`) background, 16px radius, 20px internal padding. No border, no shadow.
- **Card Accent:** Midnight Card (`#1e1b4b`) background, 16px radius, 20px internal padding. Used when a card represents a distinct context.
- **On press:** Scale 0.97, ease-out-expo, 100ms. No color shift on card press.

### Track Rows

Track rows have no container. They live directly on their host surface, separated by vertical rhythm (8px padding vertical) only. No card wrapping, no dividers between rows.

- **Thumbnail:** 44x44px, 8px radius, `#1f2937` fill.
- **Primary text:** 600 weight, 14px, white.
- **Artist:** 12px, Slate Secondary (`#6b7280`).
- **Duration:** 12px, Slate Muted (`#4b5563`), right-aligned.

### Banners (Status / Informational)

Full-surface tint approach. Never side-stripe borders.

- **Kill Switch:** Crimson Alert (`#7f1d1d`) background, Crimson Border (`#ef4444`) full 1px border, Crimson Soft (`#fca5a5`) text, 12px radius, 14px padding.
- **Informational:** `#1a2744` background, Electric Blue full 1px border, Mist Blue text, 12px radius, 16px padding.
- **Update Banner (floating):** Midnight Card background, fixed at bottom, no border. The only floating interactive element in the current system.

### Navigation

Not yet implemented. When added: no persistent tab bar by default. Use a minimal bottom rail. Active state is Electric Blue label color shift, not an underline or fill.

## 6. Do's and Don'ts

### Do:
- **Do** tint every near-black toward violet or amber. `#0a0a0f` has a cast; preserve it. Pure grey is forbidden.
- **Do** use tonal layering for depth. Background value is the elevation system. Step backgrounds by at least 5 lightness points between layers.
- **Do** use weight extremes for hierarchy. 800 weight at 10px is a label; 800 weight at 32px is the wordmark. Let weight do the work that size alone cannot.
- **Do** leave track rows containerless. The blank space between rows is the separator.
- **Do** use full borders on status banners. When a surface needs a border for emphasis, it wraps the full perimeter.
- **Do** express tactile feedback through scale on press (0.97, 100ms, ease-out-expo).
- **Do** make Electric Blue feel rare. If it appears more than three times on a screen, audit which instances are not earning their place.
- **Do** introduce the amber token on the next new editorial surface. Candle note in the listening room.

### Don't:
- **Don't** use Spotify-green or any mass-market streaming palette reflex. rumik is not for everyone, and the design should feel that way.
- **Don't** use cold grey dark mode (IDE dark, data-center dark). The darkness here has hue. Low-chroma blue-grey backgrounds are prohibited.
- **Don't** use side-stripe borders (`border-left` or `border-right` greater than 1px as a colored accent). Full border or nothing.
- **Don't** repeat identical cards in a grid: same size, same padding, same icon-plus-text structure. Discovery should feel curated.
- **Don't** use gradient text (`background-clip: text` with a gradient). Emphasis is weight or size, never a gradient clipped to text.
- **Don't** add drop shadows to static surfaces. The tonal staircase handles all depth.
- **Don't** wrap track rows in cards. The row is the component. A card around a track row is a nested card: always wrong.
- **Don't** introduce a new surface without asking: does it need the amber note?
- **Don't** use the hero-metric template (big number, small label, gradient accent, supporting stats). Prohibited.
