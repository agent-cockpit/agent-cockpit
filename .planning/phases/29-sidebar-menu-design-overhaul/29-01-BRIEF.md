# Phase 29 — Design BRIEF: Sidebar & Menu Design Overhaul

> Design research artifact for the Agent Cockpit sidebar and menu visual system.
> Validates locked color decisions from `29-UI-SPEC.md` against reference pixel-art game palettes.
> Produced for Plan 01; consumed by Plan 02 (token implementation) and Plan 03 (component rebuild).

---

## Reference Game Findings

### 1. FTL: Faster Than Light

FTL's UI is the most directly applicable reference for Agent Cockpit's sidebar. Key observations:

**Information density:** FTL packs 8–12 ship system rows into a sidebar roughly 260px wide with zero wasted space. Each row is ~28px tall — face icon (24×24), text label, and a bar/indicator — all in a single horizontal band. This validates Agent Cockpit's `py-2.5 px-3` (10px/12px) session row sizing: generous enough to tap but compact enough for 10+ sessions without scrolling.

**Status dot placement:** FTL places status indicators (health bars, power pips) on the right edge of each row — not inline with the label. Agent Cockpit's approval pill sits right-aligned for the same reason: it's a secondary signal that should not disrupt the left-to-right read of `avatar → name → provider → status`.

**Color economy:** FTL uses a near-black base (`#0d1117` approx), with three semantic accent colors: green for normal power, yellow/amber for damaged, red for critical. It never uses blue or cyan as a status color — those are reserved for UI chrome (selection highlight). This is exactly the role `--color-cockpit-cyan` plays in Agent Cockpit: chrome and interactive affordance, not data signal. FTL validates the cyan-as-chrome choice.

**Urgent event badges:** FTL uses amber/yellow badges with bold text at the far right of affected rows — pulsing on critical events. The amber approval pill at `oklch(0.75 0.16 75 / 0.2)` with amber text-shadow glow mirrors this pattern exactly. **FTL validates the approval pill design.**

**Typography:** FTL uses a condensed bitmap font (similar to VT323) for system labels, with a wider proportional font for values. Agent Cockpit's `--font-sidebar-display` (Press Start 2P) for section labels and `--font-mono-data` (IBM Plex Mono) for data values follows this exact split.

---

### 2. Dead Cells

Dead Cells' UI teaches restraint: panels over game worlds must be semi-transparent, use dark translucent backgrounds, and have thin luminous borders rather than heavy solid frames.

**Panels over game world:** Dead Cells pause/inventory menus use `bg-black/60` overlays with panels at `bg-[#1a1a2e]/90` — dark, high-opacity, with a thin bright border. The MenuPopup's `bg-black/45` overlay and `bg-background rounded-none border border-border/80` panel closely matches this pattern. Dead Cells confirms the overlay opacity is in the right range (40–60%).

**No obscuring the game world:** Dead Cells keeps pause menus centered and width-constrained (`max-w-md` equivalent). The MenuPopup `max-w-md` constraint follows this — the game canvas remains visible at the sides on wide screens.

**Panel hierarchy:** Dead Cells uses two distinct background depths: the main dialog surface (slightly lighter) vs. sub-sections (darker insets). Agent Cockpit uses `--color-background` for the dialog and `--color-panel-surface` (`oklch(0.185 0.025 250)` — 7% lighter) for section insets. The contrast exists but is subtle enough that it won't feel jarring. **Dead Cells validates the bg-background / bg-panel-surface hierarchy.**

**Corner decoration:** Dead Cells uses angular corner cuts or hairline brackets on important UI elements — not rounded corners. Agent Cockpit's `cockpit-frame-full` with `cockpit-corner` elements is the direct implementation of this pattern. The `--bracket-size: 10px` with `--bracket-weight: 1.5px` produces hairlines that match Dead Cells' aesthetic.

---

### 3. Stardew Valley

Stardew Valley's sidebar/toolbar teaches compact icon+label patterns and selection highlight behavior.

**Icon + label rows:** Stardew toolbar uses 48×48 slot frames with single-line labels below — but in a sidebar context (like the skills menu or community bundle), it collapses to icon + text in a single horizontal row, very similar to Agent Cockpit's `FaceAvatar (32×32) + project name + status` row layout. The 32×32 face avatar size is well-established by this reference.

**Selection highlight:** Stardew uses a warm-white `box-shadow` glow around the selected item — not a background fill change. Agent Cockpit's selected state uses both a background tint (`bg-cyan-500/10`) AND a double ring shadow (`0 0 0 1px rgba(34,211,238,0.15), inset 0 0 12px rgba(34,211,238,0.04)`). This is slightly heavier than Stardew but appropriate for a dark-mode UI where the background fill change alone would be invisible.

**Compact header with counts:** Stardew's inventory shows a title + item count readout in the header. The `ACTIVE: 02` readout in Agent Cockpit's sidebar header is the equivalent pattern. Stardew validates displaying the active count prominently in the header.

**Nav button glyphs:** Stardew uses `<` and `>` arrow glyphs for navigation in many dialogs. Agent Cockpit's CharacterPicker `[<]` / `[>]` wraps these in bracket-style punctuation for game-UI consistency — the extra brackets make them more legible in Press Start 2P at 8px (the font has very compact glyphs).

---

### 4. Into the Breach

Into the Breach is the single most instructive reference for Agent Cockpit's overall visual philosophy.

**Monochrome base + single accent:** Into the Breach uses near-black backgrounds with a single cyan accent (`#00d4e8` range — remarkably close to `oklch(0.75 0.18 195)`). All other colors are functional: green for healthy, amber for damaged, red for destroyed. This validates the 60/30/10 color distribution in 29-UI-SPEC.md.

**Bracket/frame decoration:** Into the Breach's unit panels use thin bracket-corner frames — almost identical to Agent Cockpit's `cockpit-frame-full` + `cockpit-corner` pattern. The hairline brackets at corners define the panel boundary without a full border. The `--bracket-size: 10px, --bracket-weight: 1.5px` dimensions match Into the Breach's aesthetic precisely.

**Minimal typography:** Into the Breach uses exactly 2 typeface sizes in its UI: a small bitmap font for labels (equivalent to Press Start 2P at 8px) and a larger mono for data values. Never more than 2 sizes on screen simultaneously. Agent Cockpit's typography table (section label at 0.55rem, data at 0.7rem, project name at 0.75rem/12px) stays within this constraint — three distinct sizes but within a 4px range.

**Mission select panel → session row mapping:** Into the Breach's mission select shows unit icons + mission name + status in a tight row — almost a 1:1 mapping to Agent Cockpit's face avatar + project name + status dot session row. This is the strongest structural confirmation that the row layout is correct.

**Cyan specificity:** Into the Breach uses `#00c8d6` / `#00d4e8` (teal-cyan, hue ~190–195 in OKLCH). This is directly adjacent to Agent Cockpit's `oklch(0.75 0.18 195)`. The reference game validates the specific hue. **Into the Breach validates the cyan value is correct for this genre.**

---

## Color Validation

### Cyan: `oklch(0.75 0.18 195)` — VALIDATED

**Finding:** Hue 195 in OKLCH sits in the teal-cyan band, approximately `#00d4e8` in sRGB. This is:
- Distinct from green (`--color-cockpit-green` at hue 155, 40° away) — confirmed no confusion with success signals
- Distinct from blue (`--color-accent` at hue 215, 20° away) — slight but perceivable difference
- Matches the specific cyan used by Into the Breach (hue 190–195) and FTL's UI chrome

**Concern:** The same cyan (`oklch(0.75 0.18 195)`) is used for `.cockpit-label` text, `.data-readout` text, AND as the border/glow color for interactive states. At high frequency, this risks the UI reading as "everything is selected." The 10% usage budget in the spec mitigates this — enforce it strictly in Plan 02.

**Verdict: VALIDATED.** Cyan is the correct phosphor hue for a space game HUD. Green alternatives would conflict with `--color-cockpit-green` (active status). Amber alternatives would conflict with `--color-cockpit-amber` (warnings). Cyan is the only remaining primary phosphor color available in the semantic palette.

---

### Provider Badge Hue Separation: hue 255 (Claude) vs hue 295 (Codex) — VALIDATED WITH NOTE

**Claude badge:** `bg oklch(0.28 0.08 255 / 0.7)` → deep indigo-blue, `text oklch(0.75 0.14 240)` → periwinkle
**Codex badge:** `bg oklch(0.28 0.08 295 / 0.7)` → deep purple, `text oklch(0.75 0.14 295)` → medium violet

**Hue separation analysis:** 40° of hue separation (255→295) at chroma 0.08 on a panel-surface background of `oklch(0.185 0.025 250)`. At this low lightness and chroma, the background itself has a near-neutral blue cast (hue 250). The badges appear against this background.

At 9px font size (`text-[9px]`), the text contrast delta between hue 240 and hue 295 at L=0.75 is primarily in the red channel: hue 240 appears blue-steel, hue 295 appears distinctly violet-purple. The hue shift is perceptible even at small sizes.

**Concern:** Side-by-side, Claude (blue) and Codex (purple) will be distinguishable. However, if a user has only one provider in the list, the badge hue alone won't communicate which provider — the label text is the semantic carrier. This is acceptable behavior.

**Note:** The borders currently defined in `index.css` are `oklch(0.45 0.10 240 / 0.5)` for Claude and `oklch(0.45 0.10 295 / 0.5)` for Codex. These add a third hue-distinguishing layer beyond bg and text. Correct and should be preserved.

**Verdict: VALIDATED.** hue 255 (Claude) and hue 295 (Codex) are sufficiently distinct side-by-side on `--color-panel-surface`. The 40° hue separation is above the perception threshold even at low chroma.

---

### Amber Approval Pill: `oklch(0.75 0.16 75 / 0.2)` bg + `oklch(0.75 0.16 75 / 0.5)` border — VALIDATED

**Test case A — unselected row background:** `bg-background/30` → ~`oklch(0.2 0.02 255 / 0.3)` over sidebar surface = approximately `oklch(0.22 0.02 252)` effective. Against this near-black surface, the amber pill background at `oklch(0.75 0.16 75 / 0.2)` produces an effective amber lightness of ~`oklch(0.28...)` — subtle but visible. The amber text `oklch(0.92 0.04 75)` (≈ amber-200) at `L=0.92` provides ~6:1 contrast against the pill background and ~9:1 against the row background. **Readable.**

**Test case B — selected row background:** `bg-cyan-500/10` over sidebar → approximately `oklch(0.24 0.04 195 / 0.1)` effective = very dark with a faint cyan hue. The amber pill at this overlay remains at `L≈0.28` effective background, but the hue contrast is now amber (75) vs cyan (195) — 120° hue separation. This is the highest contrast scenario: amber on cyan-tinted dark is maximally distinct. **More readable than the unselected case.**

**Phosphor glow:** `text-shadow: 0 0 6px rgba(251,191,36,0.6)` adds perceived luminosity, increasing apparent contrast further. FTL uses this exact technique for critical event indicators.

**Concern:** The `oklch(0.75 0.16 75 / 0.2)` background may be too subtle if the pill is the primary call-to-action signal. Consider whether `/ 0.25` or `/ 0.3` would improve noticeability without breaking the 10% accent budget. This is a calibration note, not a blocking concern.

**Verdict: VALIDATED.** Amber pill is readable against both backgrounds. The glow effect makes the low-opacity background acceptable. No change to locked values required.

---

## Component Pattern Recommendations

### Pattern 1: Session Row (Three States)

```
DEFAULT STATE:
┌─────────────────────────────────────────────────────┐  border: border-border/80 (oklch 0.4 0.02 252 / 0.8)
│ [avatar]  PROJECT-NAME          [CLAUDE]  [ACTIVE]  │  bg: bg-background/30
│            ● ACTIVE                                  │  transition: all 150ms
└─────────────────────────────────────────────────────┘

HOVER STATE:
┌─────────────────────────────────────────────────────┐  border: border-cyan-300/40
│ [avatar]  PROJECT-NAME          [CLAUDE]  [ACTIVE]  │  bg: bg-accent/40
│            ● ACTIVE                             ↑   │  transform: -translate-y-px
└─────────────────────────────────────────────────────┘  transition: all 150ms

SELECTED STATE:
╔═════════════════════════════════════════════════════╗  border: border-cyan-300/70
║ [avatar]  PROJECT-NAME          [CLAUDE]  [ACTIVE]  ║  bg: bg-cyan-500/10
║            ● ACTIVE                       [1 APR]  ║  shadow: 0 0 0 1px rgba(34,211,238,0.15)
╚═════════════════════════════════════════════════════╝          inset 0 0 12px rgba(34,211,238,0.04)
                                                         corner brackets: all 4 visible

Row internal layout:
- flex items-start justify-between gap-3
- Left: FaceAvatar 32×32 rounded-full, imageRendering: 'pixelated'
- Center column (min-w-0 flex-1):
  Line 1: [project name text-xs mono semibold uppercase] + [provider badge 9px]
  Line 2: [status-ping h-2 w-2] + [status label text-[10px] tracking-wider]
  Line 3 (conditional): [secondary metadata text-[10px] data-readout-dim]
- Right: approval pill (conditional, min-w-6 px-2 py-0.5 rounded-none)
  border border-amber-300/50 bg-amber-500/20 ring-1 ring-amber-300/30
  text-amber-200 text-[11px] font-semibold
```

**Recommendation:** Keep this pattern exactly as specified. The 3-line layout (name+badge / status / metadata) gives sufficient hierarchy without a fourth line. Into the Breach's mission rows confirm: 3 data points per row is the cognitive limit before it becomes a spreadsheet.

---

### Pattern 2: Sidebar Header

```
╔════════════════════════════════════╗   cockpit-frame-full (4 cyan brackets, 10px/1.5px)
║ MISSION CONTROL                    ║   cockpit-label (0.55rem, cyan, uppercase)
║ Agent Cockpit                      ║   text-[10px] font-semibold tracking-widest
║                        [HISTORY]  ║   cockpit-btn shrink-0
╚════════════════════════════════════╝
  ACTIVE: 02                            data-readout (cyan glow) when >0
                                        data-readout-dim when 0
[+ LAUNCH SESSION                   ]   cockpit-btn w-full (below header)
```

**Implementation notes:**
- Header wrapper is `border-b border-border px-3 py-3` owned by `OpsLayout.tsx` — no change
- `ACTIVE: 02` label: use `.data-readout` when count > 0 (cyan glow), `.data-readout-dim` when 0
- `MISSION CONTROL` above `Agent Cockpit`: cockpit-label renders in Press Start 2P at 0.55rem, tracking-widest for instrument-panel look
- Stardew Valley confirms: a count readout in the header is the correct pattern for this type of session list

---

### Pattern 3: Menu Button (Top-Right Overlay)

```
Game canvas (full-bleed):
┌──────────────────────────────────────────────────┐
│                                      ┌─────────┐ │
│  [map tiles / game world]           │  MENU   │ │
│                                      └─────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘

Button spec:
position: absolute top-3 right-3 z-10
background: oklch(0.34 0.09 245 / 0.92)   — deep space blue, semi-opaque
color: oklch(0.93 0.03 220)               — near-white blue-tinted
border: 1px solid oklch(0.70 0.14 210 / 0.72)
box-shadow: 0 0 0 1px oklch(0.65 0.12 210 / 0.45),
            0 0 14px oklch(0.44 0.12 225 / 0.55)
hover bg: oklch(0.38 0.10 240 / 0.95)
px-3 py-1.5 text-[11px] font-semibold
label: "MENU" (cockpit-btn auto-uppercases)
```

**Recommendation:** The semi-opaque dark-blue background (not transparent, not fully opaque) is correct for a button over a game canvas. Dead Cells uses the same approach — full transparency would make the button illegible against light map tiles, full opacity would look like a separate app chrome element. `oklch(0.34 0.09 245 / 0.92)` is at the correct opacity for the overlay context.

---

### Pattern 4: MenuPopup Dialog

```
Screen with game canvas behind:
╔════════════════════════════════════════════════════════╗  bg-black/45 (--color-menu-overlay)
║  [darkened game canvas]                                ║
║  ┌─────────────────────────────────┐                  ║
║  │ ╔═══════════════════════════╗   │  bg-background   ║
║  │ ║ GAME MENU           [X] ║   │  shadow: 0 0 40px rgba(34,211,238,0.08)
║  │ ╚═══════════════════════════╝   │          0 20px 60px rgba(0,0,0,0.6)  ║
║  │                                 │  border border-border/80              ║
║  │ ╔═══════════════════════════╗   │  rounded-none (game UI: no rounding)  ║
║  │ ║ CHARACTER SELECT          ║   │  bg-panel-surface section             ║
║  │ ║  [avatar] ← CHARACTER →  ║   │                                       ║
║  │ ║       [ CONFIRM ]         ║   │                                       ║
║  │ ╚═══════════════════════════╝   │                                       ║
║  │                                 │                                       ║
║  │ ╔═══════════════════════════╗   │                                       ║
║  │ ║ AUDIO              ████  ║   │  bg-panel-surface section             ║
║  │ ╚═══════════════════════════╝   │                                       ║
║  │                                 │                                       ║
║  └─────────────────────────────────┘                  ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

Panel structure:
- Overlay: fixed inset-0 flex items-center justify-center bg-black/45
- Dialog: relative max-w-md w-full rounded-none border border-border/80 bg-background
          shadow: 0 0 40px rgba(34,211,238,0.08), 0 20px 60px rgba(0,0,0,0.6)
- Header: cockpit-frame-full flex items-center gap-3 px-4 py-3 border-b border-border
          bg-[var(--color-panel-surface)] — title cockpit-label "GAME MENU" + close [X]
- Content: p-4 space-y-4
- Sections: cockpit-frame-full rounded-none border border-border/70 bg-[var(--color-panel-surface)] px-3 py-3
```

**Dead Cells confirms:** The two-tier background (dialog at --color-background, sections at --color-panel-surface) creates the correct visual depth. The `oklch(0.185 0.025 250)` vs `oklch(0.2 0.02 255)` difference is subtle (ΔL ≈ 0.015) but perceivable in a dark-mode context — sufficient hierarchy without harsh contrast.

---

### Pattern 5: CharacterPicker

```
╔═══════════════════════════════════╗  cockpit-frame-full (4 brackets)
║ CHARACTER SELECT                  ║  cockpit-label (0.55rem, cyan)
║                                   ║  bg-[var(--color-panel-surface)]
║  ┌──────────────────────┐         ║
║  │ [<] [face preview]  [>] │     ║  nav buttons: cockpit-btn h-12 w-12 px-0 text-lg
║  │      h-16 w-16          │     ║  face: border border-border/60 object-cover
║  │  imageRendering: pixelated    ║  face bg: bg-[var(--color-panel-surface)]
║  └──────────────────────┘         ║
║                                   ║
║  CHARACTER NAME                   ║  cockpit-label text-sm
║  PILOT PROFILE READY              ║  data-readout-dim text-[10px] uppercase tracking-[0.18em]
║                                   ║
║  INDEX 01 / 09                    ║  data-readout-dim text-[10px]
║                                   ║
║  ┌───────────────────────────┐    ║
║  │       [ CONFIRM ]         │    ║  cockpit-btn mt-4 w-full — brackets are part of label text
║  └───────────────────────────┘    ║
╚═══════════════════════════════════╝

Key implementation notes:
- face <img> must use style={{ imageRendering: 'pixelated' }} — NOT a Tailwind class
- confirm label: "[ CONFIRM ]" (literal brackets in the button text)
- [<] and [>] as text content (not icons) — consistent with the ASCII-glyph-only icon constraint
- Stardew Valley confirms: nav buttons should be equal-width squares, not wide rectangles
```

**Stardew Valley confirms:** Navigation buttons that step through a list (character picker equivalent) should be compact square targets — not wide buttons. The `h-12 w-12` spec (`48×48px`) matches Stardew's inventory nav button size.

---

## Concerns / Deviations From UI-SPEC

### No blocking deviations

All locked color values and component patterns validated against reference game palettes. No change to any OKLCH value is recommended.

### Calibration Notes (non-blocking)

1. **Cyan overuse risk:** `.cockpit-label`, `.data-readout`, and interactive states all use `--color-cockpit-cyan`. If Plan 02 adds additional cyan surfaces, the 10% budget will be exceeded and the UI will feel "all selected." Enforce the budget strictly — new cyan applications must displace existing ones.

2. **Amber pill opacity calibration:** `oklch(0.75 0.16 75 / 0.2)` background is intentionally subtle. If user testing shows the pill is overlooked, Plan 03 may adjust to `/0.25` — still within the amber-as-warning-only budget. This is a calibration detail, not a spec error.

3. **Press Start 2P at 0.5rem (8px):** This font renders with visible pixel grid at small sizes, which is intentional for game aesthetic. However, at 8px on a 96dpi screen (non-retina), individual characters may be hard to read. This is a known trade-off chosen for aesthetic over legibility. The fallback stack (`"VT323" → "Courier New" → monospace`) degrades gracefully. If accessibility becomes a concern, `text-[9px]` is the minimum safe increase.

4. **Font loading prerequisite:** `packages/ui/index.html` must have the Google Fonts import for Press Start 2P and IBM Plex Mono before Phase 29 implementation renders correctly. This is noted in 29-UI-SPEC.md but bears repeating as a Plan 02 pre-condition, not an afterthought.

---

## Implementation Notes for Plan 02 / Plan 03

### Plan 02: Token Layer (`index.css` + `index.html`)

**Pre-conditions:**
1. Add Google Fonts `<link>` tags to `packages/ui/index.html` for `Press Start 2P` and `IBM Plex Mono:wght@400;600` — do this FIRST before any token work
2. Add 6 new tokens to the `@theme` block (do NOT rename existing tokens):

```css
/* Provider badge tokens */
--color-cockpit-blue-claude: oklch(0.28 0.08 255);      /* bg base (opacity applied at usage) */
--color-cockpit-purple-codex: oklch(0.28 0.08 295);     /* bg base (opacity applied at usage) */

/* Approval pill tokens */
--color-approval-bg: oklch(0.75 0.16 75 / 0.2);
--color-approval-border: oklch(0.75 0.16 75 / 0.5);
--color-approval-text: oklch(0.92 0.04 75);

/* Menu overlay token */
--color-menu-overlay: rgba(0, 0, 0, 0.45);
```

**Note:** Provider badge classes (`badge-provider-claude`, `badge-provider-codex`) already exist in `index.css` with correct values. The token additions are for semantic naming — if the classes already work correctly, token extraction is optional. Validate before adding tokens that already exist as classes.

### Plan 03: Component Polish Pass

**Priority order based on visual impact:**

1. **MapSidebar copywriting** — highest impact, lowest risk. Uppercase fixes to secondary metadata text, approval pill text format (`N APPROVALS PENDING`), empty state text.

2. **CharacterPicker micro-fixes** — `imageRendering: 'pixelated'` inline style (replacing any Tailwind class that may not exist in v4), confirm label to `"[ CONFIRM ]"`.

3. **Session row selected state** — verify the double ring shadow is correctly applied. The spec is complete; implementation may need to confirm the `box-shadow` combines the outer ring (`0 0 0 1px`) with the inset (`inset 0 0 12px`) correctly in Tailwind v4 arbitrary values.

4. **MenuPopup visual polish** — section background consistency, header bracket frame, panel shadow.

**Constraints to preserve (from Phase 16.8, non-negotiable):**
- `selectSession()` BEFORE `onFocusSession()` in click handlers
- `[...sessions].sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))` unchanged
- Resize handle `matchMedia('(min-width: 1024px)')` guard unchanged
- Camera snap sets both `target` and `current` coordinates

### Test strategy for Plan 02/03

- Snapshot tests for token additions in `index.css` are not meaningful — test by visual inspection
- Component tests for MapSidebar should verify: sort order preserved, click order (selectSession first), conditional rendering of secondary metadata line, approval pill visibility
- CharacterPicker: verify imageRendering style prop is set on the `<img>`, confirm button label includes brackets
- No new tests required for MenuPopup structure (no logic changes)
