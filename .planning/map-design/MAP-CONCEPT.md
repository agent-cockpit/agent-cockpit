# Space Station Alpha — Map Design Roadmap

**Theme:** Space Station Ops — ISS/mission control aesthetic  
**Tile size:** 32×32px (matches existing floor tileset)  
**Character size:** 64px (2×2 tiles)  
**View:** High top-down  
**Palette:** Dark charcoal base · NASA orange `#FF6B2B` · Instrument blue `#58A6FF` · Console gray `#8B9DB8`

---

## 1. Map Layout

```
+============================================================+
|  ★ ★ ★   SPACE (star background, black void)   ★ ★ ★      |
|                                                            |
| +--[OUTER HULL WALL]----------------------------------+    |
| |                                                     |    |
| |  [1:ASTRO]  [2:ROBOT]  [3:ALIEN]  [CORRIDOR]  [4:HOLO]  |
| |  EVA Bay    Eng Bay    Xeno Lab   =========   Data Core  |
| |                                                     |    |
| |  [CORRIDOR] =====[  CENTRAL COCKPIT TABLE  ]====         |
| |             =====[ Command Hub — 3×3 rooms ]=====        |
| |                                                     |    |
| |  [5:MONK]  [6:CAVE]  [CORRIDOR]  [7:GHOST]  [8:NINJA]   |
| |  Maint.Bay  Geology    ===      Quantum Lab  Dojo        |
| |                                                     |    |
| |  [AIRLOCK]  [9:PIRATE]  [HALL]  [10:MEDWOMAN]  [DOCK]   |
| |  Entry      Nav/Vault   ===     Med Bay       Exit dock  |
| |                                                     |    |
| +--[OUTER HULL WALL]----------------------------------+    |
+============================================================+
```

### Grid specification
- Each room: **8×6 tiles** interior (256×192px) + 1-tile wall border
- Corridor width: **3 tiles** (96px)
- Central cockpit: **14×10 tiles** (448×320px) — the centerpiece
- Full map estimate: **52×36 tiles** (1664×1152px)

---

## 2. Tilesets to Generate

All use `create_topdown_tileset`. **Floor tileset already exists** — only generate what's listed below.

> **Lower terrain** = the dominant surface (floor, ground level)  
> **Upper terrain** = the contrasting surface (wall top, raised platform, void)  
> **Transition** = describes how the two terrains meet at their edge

---

### 2.1 Outer Hull Walls

| Field | Value |
|-------|-------|
| **Tile Size** | 32 |
| **Lower Terrain** | dark outer hull floor of a space station, thick reinforced steel panels, orange hazard stripe border at edge, rivets and panel seams, sci-fi ISS aesthetic, pixel art |
| **Upper Terrain** | deep space void exterior, pure black with distant star dots, no floor surface, pixel art |
| **Transition** | hull wall edge — abrupt hard boundary where interior floor meets the black void of space, thick metal lip |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | low detail |

---

### 2.2 Inner Room Walls (corridor separators)

| Field | Value |
|-------|-------|
| **Tile Size** | 32 |
| **Lower Terrain** | interior space station floor, dark charcoal metal panels, subtle warm grid seams, same style as base floor |
| **Upper Terrain** | interior space station wall seen from above, thick solid wall block, medium gray metal surface, blue LED strip running along the top edge, clean sci-fi aesthetic, pixel art |
| **Transition** | floor-to-wall corner, T-junction metal trim, small shadow cast by wall onto floor |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | low detail |

---

### 2.2b Interior Wall Block (dedicated wall tileset)

> This tileset is for placing **solid wall blocks** anywhere on the map. Lower terrain is the surrounding floor; upper terrain is the wall itself. Use this to draw room boundaries, corridors dividers, and any interior structure.

| Field | Value |
|-------|-------|
| **Tile Size** | 32 |
| **Lower Terrain** | dark charcoal space station floor panels, warm grid lines, metal panel seams, sci-fi ISS aesthetic, pixel art |
| **Upper Terrain** | solid interior wall of a space station seen from directly above, thick rectangular block, dark gray brushed metal surface, faint panel lines on top face, hard edges, pixel art |
| **Transition** | terrains meet directly — hard right-angle wall base sits flush on the floor, slight drop shadow at wall foot |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | low detail |

---

### 2.3 Corridor / Hazard Floor

| Field | Value |
|-------|-------|
| **Tile Size** | 32 |
| **Lower Terrain** | space station corridor floor, dark metal grating with open diamond pattern, anti-slip surface, sci-fi aesthetic, pixel art |
| **Upper Terrain** | hazard-marked floor panel, bold yellow and black diagonal chevron stripes painted on metal, warning zone marker, pixel art |
| **Transition** | terrains meet directly — hard painted edge where grating meets hazard stripe zone, no height difference |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | low detail |

---

### 2.4 Cockpit Command Floor

| Field | Value |
|-------|-------|
| **Tile Size** | 32 |
| **Lower Terrain** | futuristic command center floor, dark polished panels with glowing blue circuit trace lines etched into surface, sci-fi mission control aesthetic, pixel art |
| **Upper Terrain** | command center accent floor, hexagonal inlay pattern with glowing cyan ring border, holographic projection circle on dark floor, pixel art |
| **Transition** | terrains meet directly — circuit trace lines flow naturally into the hexagonal accent zone, same elevation |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | medium detail |

---

### 2.5 Door/Hatch Tile

> Use `create_map_object` — doors are placed as objects, not tileset tiles.

| Field | Value |
|-------|-------|
| **Description** | sliding sci-fi door hatch in open position, two metal panels split to each side, blue light strip glowing on each panel edge, dark metal frame, top-down view, pixel art |
| **Size** | 64 |
| **Outline** | single color black |
| **Shading** | basic shading |
| **Detail Level** | low detail |

---

## 3. The Central Cockpit Table — Centerpiece

This is the most important object. It sits in the command hub room and spans ~4×3 tiles (128×96px).

```
Tool: create_map_object
description: "large futuristic mission control command table, hexagonal shape, dark glossy surface with glowing holographic displays showing star maps and data readouts, blue and orange glow, multiple screen bezels embedded in surface, central hologram projector crystal glowing cyan, top-down view, pixel art, detailed"
size: 128
view: high top-down
detail: high detail
shading: advanced shading
outline: single color dark
```

**Supporting cockpit objects:**

```
# Captain's chair (large, for commander position)
description: "high-back captain command chair, black leather with NASA orange piping, armrest panels with buttons, top-down view, pixel art"
size: 48

# Operator chair x6 (surrounding the table)
description: "space station operator chair, ergonomic dark gray, small armrests, top-down view, pixel art"
size: 32

# Overhead tactical display (wall-mounted)
description: "large wall-mounted tactical screen showing star system map with mission routes, dark frame, glowing display, top-down view, pixel art"
size: 96

# Communication array (corner unit)
description: "space station communication antenna console, dish and transmitter mounted on unit, blinking lights, dark metal, top-down view, pixel art"
size: 48
```

---

## 4. Room Objects — 10 Character Rooms

Each room gets 4–6 props. All use `create_map_object`, consistent style: pixel art, top-down view, space station ISS aesthetic.

---

### Room 1 — ASTRONAUT: EVA Preparation Bay
*White room, functional, suits and gear*

```
# EVA Spacesuit Locker (large, wall-mounted)
description: "EVA spacesuit hanging in open locker bay, white spacesuit with orange stripe, helmet on shelf above, metal cabinet frame, top-down view, pixel art"
size: 64

# Oxygen Tank Rack
description: "rack of cylindrical oxygen tanks, silver metal, pressure gauge dials, wall-mounted bracket, top-down view, pixel art"
size: 48

# Mission Briefing Screen
description: "wall-mounted mission briefing terminal, screen showing checklist and EVA route diagram, NASA orange trim, sci-fi, top-down view, pixel art"
size: 48

# Equipment Prep Table
description: "metal workbench with EVA tools laid out — torque wrench, tethers, thruster pack — top-down view, pixel art"
size: 64

# Airlock Control Panel (at door)
description: "airlock control panel, large round button, pressure gauge, red warning light, wall-mounted, top-down view, pixel art"
size: 32
```

---

### Room 2 — ROBOT: Engineering & Maintenance Bay
*Industrial, tools, circuit boards, machinery*

```
# Robotic Assembly Arm (large floor unit)
description: "industrial robotic assembly arm mounted on floor base, multi-jointed, holding component, sci-fi factory aesthetic, top-down view, pixel art"
size: 96

# Circuit Board Workbench
description: "electronics workbench with circuit boards, soldering iron, component trays, oscilloscope display, top-down view, pixel art"
size: 64

# Spare Parts Crates (stacked)
description: "stack of metal crates with labeled spare parts — gears, circuit chips, wires — sci-fi industrial, top-down view, pixel art"
size: 48

# Diagnostic Terminal
description: "tall terminal computer with system diagnostic screen showing robot schematics and status bars, sci-fi, top-down view, pixel art"
size: 48

# Tool Rack (wall)
description: "wall-mounted tool rack with sci-fi wrenches, scanners, and maintenance tools organized neatly, top-down view, pixel art"
size: 64
```

---

### Room 3 — ALIEN: Xenobiology Lab
*Bioluminescent, organic, containment tanks*

```
# Specimen Containment Tank (tall, large)
description: "cylindrical transparent containment tank with glowing alien specimen inside, green liquid, metal cap and base with tubes, bioluminescent glow, top-down view, pixel art"
size: 64

# Alien Plant Sample (organic, eerie)
description: "alien bioluminescent plant in sealed glass dome, purple and green tendrils, glowing spores floating, sci-fi lab, top-down view, pixel art"
size: 48

# Lab Microscope Station
description: "advanced sci-fi microscope on metal table, eyepiece and stage, connected display screen showing cellular data, top-down view, pixel art"
size: 48

# Sample Tray Table
description: "metal tray table with multiple small alien sample vials in rack, colored liquids — green, purple, amber — lab aesthetic, top-down view, pixel art"
size: 64

# Quarantine Warning Sign (wall)
description: "wall-mounted biohazard quarantine warning sign, yellow and black stripes, symbol glowing red, sci-fi space station, top-down view, pixel art"
size: 32
```

---

### Room 4 — HOLOGRAM: Data Core
*Blue glow, servers, digital energy*

```
# Server Tower (tall, large)
description: "tall server rack tower with blinking indicator lights — blue and white — vent slots, cable bundles at base, sci-fi data center, top-down view, pixel art"
size: 64

# Holographic Projector Node
description: "floor-mounted holographic projector node, circular base, beam of light projecting upward forming data lattice, cyan glow, top-down view, pixel art"
size: 48

# Data Crystal Storage
description: "wall-mounted display case with rows of glowing data crystals, blue and white shimmering, sci-fi storage archive, top-down view, pixel art"
size: 64

# Neural Interface Chair
description: "reclined neural interface chair with headset attachment, cable harness, arm controls, glowing display beside it, sci-fi, top-down view, pixel art"
size: 64

# Floating Data Orb Pedestals (x2 small)
description: "small pedestal with floating glowing blue data orb above it, soft cyan light emanation, futuristic, top-down view, pixel art"
size: 32
```

---

### Room 5 — MONKEY: Maintenance Access Bay
*Cluttered, tools everywhere, vents*

```
# Ventilation Shaft Access (floor hatch)
description: "floor-mounted ventilation shaft access hatch, metal grating, bolts at corners, warning stripes, slightly open, top-down view, pixel art"
size: 64

# Maintenance Toolbox (large)
description: "large open toolbox on wheels with compartments, scattered tools — wrenches, pliers, tapes — messy, top-down view, pixel art"
size: 48

# Stepladder / Scaffold Section
description: "small metal stepladder, two steps, rubber grip, leaning against wall, top-down view, pixel art"
size: 32

# Broken Equipment Pile
description: "pile of broken or disassembled space station equipment — panels, tubes, circuit boards — messy heap, top-down view, pixel art"
size: 64

# Banana/Food Dispenser (quirky)
description: "wall-mounted food dispenser unit labeled 'RATIONS', banana peel sticking out, cheerful orange color, slightly dented, pixel art, top-down view"
size: 32
```

---

### Room 6 — CAVE MAN: Geology & Mineralogy Lab
*Raw materials, rock samples, primitive meets futuristic*

```
# Asteroid Fragment Display
description: "sealed transparent case displaying large asteroid rock fragment, dark and cratered, sci-fi analysis lab aesthetic, top-down view, pixel art"
size: 64

# Rock Sample Shelf
description: "metal shelf unit holding labeled rock and mineral specimens in compartments, various colors and textures, geology lab, top-down view, pixel art"
size: 64

# Mining Drill Equipment
description: "compact space mining drill on floor stand, drill bit attachment, vibration dampeners, industrial sci-fi, top-down view, pixel art"
size: 48

# Primitive Relic Display Case (contrast/humor)
description: "display case with primitive stone tools — hand axe and spear point — labeled as ancient specimens, museum-style, sci-fi station, top-down view, pixel art"
size: 48

# Campfire Brazier (space-safe version)
description: "contained fire brazier in metal safety cage, decorative warm flame, incongruous in sci-fi setting, pixel art, top-down view"
size: 32
```

---

### Room 7 — GHOST: Quantum Anomaly Research Lab
*Eerie, void portals, floating objects*

```
# Phase Void Portal (large, eerie)
description: "swirling circular void portal, dark purple center with white energy wisps spiraling outward, mounted in metal containment ring, floating 1 inch off floor, pixel art, top-down view"
size: 96

# Ectoplasm Containment Cylinder
description: "sealed cylindrical container with glowing green spectral ectoplasm inside, ethereal wisps, warning labels, sci-fi lab, top-down view, pixel art"
size: 48

# Gravity Anomaly Device
description: "floor device creating visible gravity distortion field above it — objects hovering in place — metal emitter base, warning ring painted on floor, top-down view, pixel art"
size: 64

# Spectral Analyzer Terminal
description: "dark terminal computer showing spectral energy waveforms, ghost-like image on screen, dim blue interface, sci-fi, top-down view, pixel art"
size: 48

# Floating Rock Cluster (ambient prop)
description: "small cluster of rocks floating mid-air above pedestal, glowing faint purple outline, gravity anomaly effect, pixel art, top-down view"
size: 32
```

---

### Room 8 — NINJA: Combat Training Dojo
*Dark, minimalist, discipline*

```
# Training Dummy (humanoid target)
description: "humanoid training dummy on pole stand, stitched fabric, worn from strikes, throwing stars embedded in chest, dojo aesthetic, top-down view, pixel art"
size: 64

# Weapon Rack (wall-mounted)
description: "wall-mounted weapon display rack with katana, shuriken, kunai, nunchaku, dark wood and metal, pixel art, top-down view"
size: 64

# Meditation Mat
description: "simple rolled-out meditation mat on dark floor, round meditation cushion at one end, minimal dojo aesthetic, top-down view, pixel art"
size: 64

# Obstacle Course Element — Balance Beam
description: "narrow balance beam obstacle on low stands, polished metal, training equipment, sci-fi dojo, top-down view, pixel art"
size: 64

# Shadow Corner — Dark Lantern
description: "ornate lantern on floor stand casting dim warm glow, dark iron body, traditional Japanese aesthetic transplanted to space station, top-down view, pixel art"
size: 32
```

---

### Room 9 — PIRATE: Navigation & Treasure Vault
*Gold, maps, space plunder*

```
# Treasure Chest (large, overflowing)
description: "large ornate treasure chest half-open, filled with gold coins, gems and alien artifacts, space pirate loot, dark wood and metal banding, top-down view, pixel art"
size: 64

# Navigation Console (star chart)
description: "curved navigation console with star chart display, route lines marked across galactic map, glowing holographic compass, pirate-modified sci-fi tech, top-down view, pixel art"
size: 80

# Space Pirate Cannon (decorative)
description: "decorative old cannon welded to wall mount, has clearly been space-modified with metal plating, brass fittings, top-down view, pixel art"
size: 64

# Captain's Locker (wall, locked)
description: "heavy locked metal vault door set into wall, skull-and-crossbones symbol on door, electronic keypad lock, rusted hinges, top-down view, pixel art"
size: 48

# Rum Barrel Stack
description: "stack of wooden barrels with skull label, some have space station liquid tubing attached — adapted for space — pirate aesthetic, top-down view, pixel art"
size: 48
```

---

### Room 10 — MEDICINE WOMAN: Medical Bay
*Healing, organic + tech fusion*

```
# Healing Tank / Cryopod
description: "transparent cylindrical healing tank filled with blue medical liquid, bubbles rising, patient connection ports, med bay sci-fi, soft blue glow, top-down view, pixel art"
size: 80

# Herb Garden Alcove (organic)
description: "wall-mounted growing shelf with glowing medicinal herb plants, purple and green, hydroponic tubes, warm grow-light, sci-fi organic fusion, top-down view, pixel art"
size: 64

# Medical Scanner Arch
description: "patient scanning arch — two uprights and overhead scanner bar — glowing orange scan line, medical white and metal, sci-fi, top-down view, pixel art"
size: 64

# Medicine Cabinet (wall-mounted)
description: "tall glass-front cabinet with organized medicine vials, bandages and tribal-patterned remedies mixed with hi-tech injectors, medical bay, top-down view, pixel art"
size: 64

# Surgical Table
description: "medical examination table, padded surface, overhead surgical light arm folded to side, metal frame, adjustable, sci-fi med bay, top-down view, pixel art"
size: 64
```

---

## 5. Ambient / Shared Props

Objects that appear in corridors and multiple rooms.

```
# Floor Warning Light (corridor)
description: "floor-mounted directional warning light strip, glowing amber, raised edge, space station corridor floor, top-down view, pixel art"
size: 32

# Wall Pipe Bundle (wall decoration)
description: "bundle of colored pipes running along wall — white, blue, red oxygen/coolant lines — labeled with icons, sci-fi station infrastructure, top-down view, pixel art"
size: 64

# Fire Suppression Sprinkler Head (ceiling indicator)
description: "ceiling fire suppression head, round with spray arms, small red indicator, viewed from above, sci-fi, top-down view, pixel art"
size: 16

# Emergency Medical Cabinet (wall)
description: "wall-mounted emergency first aid cabinet, white with red cross, sealed transparent door, sci-fi, top-down view, pixel art"
size: 32

# Potted Space Fern (ambient organic)
description: "potted alien succulent plant in small rounded pot, blue-green leaves, compact, decorative, top-down view, pixel art"
size: 24
```

---

## 6. Generation Order & Budget

### Phase A — Tilesets (5 gens)
1. Outer hull walls
2. Inner room walls  
3. Corridor/airlock floor
4. Cockpit command floor
5. Door/hatch tile

### Phase B — Cockpit Centerpiece (5 gens)
1. Cockpit table (large, high-detail)
2. Captain's chair
3. Operator chairs
4. Tactical wall display
5. Communication array

### Phase C — Room Objects (10 rooms × 5 objects = 50 gens)
Generate in character order matching priority from Phase 13:
Astronaut → Robot → Alien → Hologram → Monkey → Cave Man → Ghost → Ninja → Pirate → Medicine Woman

### Phase D — Ambient Props (5 gens)
Corridor and shared objects.

### Total new gens needed: ~65
**Remaining budget: 1,438 → after map assets: ~1,373**

---

## 7. Map Editor Workflow

**Recommended approach:**
1. Choose a map editor that supports tilesets: [Tiled Map Editor](https://www.mapeditor.org/) (free) — supports Wang tiles natively
2. Import the existing `floor-tileset.png` (32×32, 4×4 grid, 16 Wang tiles)
3. Import new tilesets as separate layers
4. Layer stack (bottom to top):
   - `background` — star field (solid black + star dots)
   - `floor` — base floor tileset (existing)
   - `floor-special` — cockpit floor, corridor floor (new tilesets)
   - `walls` — outer hull + inner walls
   - `objects` — all props/furniture (map objects from PixelLab)
   - `agents` — character sprites (rendered by PixiJS at runtime, not in map editor)
   - `overhead` — ceiling elements, lights

**Room boundary tip:** Use a 1-tile-wide inner wall to frame each room. Place door tiles on the corridor-facing side. The cockpit room has no walls on the side facing the main corridor — open plan.
