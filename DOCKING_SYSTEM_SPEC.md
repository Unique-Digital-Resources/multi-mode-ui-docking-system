# AppShell Docking System — Full Specification & Mechanisms

> **Version:** 1.0  
> **Architecture:** 3-layer (Domain Foundation → Domain Engine → React UI)  
> **Dependencies:** React, Zustand  
> **License:** Open for contribution

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Model](#2-data-model)
3. [Operations](#3-operations)
4. [Normalization & Validation](#4-normalization--validation)
5. [Drag-and-Drop System](#5-drag-and-drop-system)
6. [Drop Overlay System](#6-drop-overlay-system)
7. [Splitter & Resize System](#7-splitter--resize-system)
8. [Collapse System](#8-collapse-system)
9. [Capability Flags](#9-capability-flags)
10. [Multi-Selection](#10-multi-selection)
11. [Corner Bar & Per-Dock Controls](#11-corner-bar--per-dock-controls)
12. [Embed Host System](#12-embed-host-system)
13. [Tabs Group System](#13-tabs-group-system)
14. [Settings & Registries](#14-settings--registries)
15. [Tree Import/Export](#15-tree-importexport)
16. [File Structure](#16-file-structure)
17. [Contribution Guide](#17-contribution-guide)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────┐
│              React UI Layer                  │
│  DockingRoot → DockNodeView (recursive)      │
│  DropOverlay, Splitter, DockCornerBar        │
├─────────────────────────────────────────────┤
│           Zustand Store Layer                │
│  useAppStore — mirrors domain layout         │
│  dispatchDrop, addPanel, toggleCollapse      │
│  selection, drag state, toast                │
├─────────────────────────────────────────────┤
│          Domain Engine Layer                 │
│  DomainEngine — owns authoritative layout    │
│  execute_docking(op) → outcome/error         │
│  undo/redo history, dirty tracking           │
├─────────────────────────────────────────────┤
│         Domain Foundation Layer              │
│  DockLayout (root + nextId)                  │
│  DockNode union: panel|row|col|tabs|embed    │
│  Operations: Insert, Tab, Embed, Close, etc. │
│  Validation + Normalization (fixpoint)       │
├─────────────────────────────────────────────┤
│            App Engine Layer                  │
│  ConfigStore, CommandRegistry, EventBus      │
│  HistoryStore, SignalBus, RuntimeState       │
└─────────────────────────────────────────────┘
```

### Key Design Principles

- **Opaque IDs** — counter-issued strings (`d1`, `d2`, …), never renumbered on removal
- **Value-type operations** — each operation is a discriminated union with `apply(layout)` 
- **Clone-then-mutate** — operations work on a candidate clone; original is untouched on failure
- **Normalize to fixpoint** — after every operation, normalize + validate
- **No DOM in domain** — the domain layer is pure TypeScript, no React/DOM/CSS
- **Store mirrors engine** — Zustand store clones the domain layout on every change

---

## 2. Data Model

### DockNode (discriminated union)

```typescript
type DockNode = PanelNode | RowNode | ColNode | TabsNode | EmbedNode;

interface BaseNode {
  id: DockId;              // "d1", "d2", ... (opaque, stable)
  flexGrow: number;        // flex share (stored verbatim, never renormalized)
  minW: number;            // minimum width in px
  minH: number;            // minimum height in px
  collapsed: boolean;      // collapse preference
  
  // Capability flags (undefined = true/default, false = restricted)
  embeddable?: boolean;
  tabbable?: boolean;
  swappable?: boolean;
  resizable?: boolean;
  collapsible?: boolean;
}
```

### PanelNode (leaf)
```typescript
{
  type: "panel";
  label: string;
  contentType: "chart" | "table" | "text" | "image" | "panel" | "group";
}
```

### RowNode / ColNode (split containers)
```typescript
{
  type: "row" | "col";
  children: DockNode[];
  label: string | null;      // null for auto-created wrappers
  contentType: "group";
}
```

### TabsNode (tab group)
```typescript
{
  type: "tabs";
  children: DockNode[];      // each child is a tab
  activeTab: number;         // index of visible tab
  barSide: "top" | "bottom" | "left" | "right";
  label: string;
  contentType: "group";
}
```

### EmbedNode (embed host)
```typescript
{
  type: "embed";
  label: string;
  contentType: ContentType;
  originalType: "panel" | "row" | "col" | "tabs";  // for demotion
  zones: {
    top: DockNode | null;
    bottom: DockNode | null;
    left: DockNode | null;
    right: DockNode | null;
  };
  zoneSizes: { topH: number; bottomH: number; leftW: number; rightW: number; };
  floats: FloatEntry[];
}
```

### FloatEntry
```typescript
{
  node: DockNode;
  x: number; y: number;     // position relative to embed-inner
  w: number; h: number;     // size
}
```

### DockLayout
```typescript
{
  root: DockNode;
  nextId: number;            // monotonic counter, never reset
}
```

---

## 3. Operations

All operations are discriminated unions:

### Insert (directional split or center swap)
```
Insert { source, target, zone }
  - zone "center" → swap source/target positions (requires swappable on both)
  - zone "left"/"right" → row direction
  - zone "top"/"bottom" → col direction
  - If target's parent is same direction → splice into existing container
  - Otherwise → wrap {target, source} in new container
  - Root-as-target: wrap root with source in new container, make that the root
```

### Tab (group into tabs)
```
Tab { source, target, zone }
  Case A: source already in target's tabs group → just reorient bar
  Case B: target is a tabs node → push source as new tab
  Case C: target's parent is a tabs node → append to parent group
  Case D: wrap {target, source} in new tabs node
    - Root-as-target: wrap root with source in new tabs node, make that the root
  - Checks: can(srcNode, "tabbable")
  - Target's existing barSide is PRESERVED (independent per group)
```

### Embed (promote + zone/float)
```
Embed { source, target, zone }
  - If target is tabs → walk to active tab's dock
  - If target is row/col → fall back to Insert
  - Promote target to embed host if needed (preserves identity)
  - zone "center" → push as float
  - zone directional → if zone occupied: wrap existing + new in split container
    (top/bottom → col split, left/right → row split)
    If existing occupant is already the right split type → append to it
  - Checks: can(srcNode, "embeddable")
```

### Close
```
Close { dock }
  - Detaches dock from tree
  - If parent becomes single-child → unwrap
  - If embed host becomes empty → demote back to originalType
```

### SetCollapsed
```
SetCollapsed { dock, collapsed }
  - Checks: can(node, "collapsible")
  - Guard: cannot collapse the last expanded sibling in a container
```

### SetActiveTab
```
SetActiveTab { group, index }
  - Changes which tab is visible
```

### ReorderTab
```
ReorderTab { group, from, to }
  - Moves a tab within its group
  - Adjusts activeTab index
```

### CombineTabs
```
CombineTabs { tabsId }
  - Merges a child tabs group back into its parent tabs group
  - Splices child's tabs into parent at child's position
```

### SetTabBarSide
```
SetTabBarSide { group, barSide }
  - Changes bar orientation (independent per group)
```

### Operation Pipeline
```
1. Snapshot previousTree (for undo)
2. Clone layout (candidate)
3. Apply operation on candidate
4. Normalize candidate (fixpoint)
5. Validate candidate (steady-state)
6. On success: commit (swap root) + return outcome with undo data
7. On failure: return error, original layout untouched
```

---

## 4. Normalization & Validation

### Normalization (deterministic cleanup, runs to fixpoint)
- Row/col with 0 children → removed
- Row/col with 1 child → replaced by that child (inherits flexGrow)
- Tabs with 0 children → removed
- Tabs with 1 child → preserved (meaningful)
- Empty embed host → demoted back to originalType
- Root never unwrapped (but can demote)

### Validation (first-error semantics, ascending-id scan)
- Each dock appears exactly once (no orphans, no duplicates)
- Root appears exactly once and is not a child elsewhere
- No cycles (DFS coloring)

---

## 5. Drag-and-Drop System

### Drag Modes (modifier-key based)
| Modifier | Mode | Color | Operation |
|----------|------|-------|-----------|
| (none) | insert | green | Insert |
| Ctrl/Cmd | tab | blue | Tab |
| Shift | embed | orange | Embed |

### Mode Clamping
Mode is clamped by the source dock's capabilities:
- `!embeddable` → Shift won't switch to embed (stays insert)
- `!tabbable` → Ctrl won't switch to tab (stays insert)

### Drag State
```typescript
interface DragState {
  active: boolean;
  srcId: DockId | null;
  exceptIds: Set<DockId>;     // source + subtree (overlay hidden on these)
  mode: DragMode;
}
```

### setDrag Deferral
`setDrag` is deferred to `requestAnimationFrame` because Zustand v5's synchronous re-render during dragstart cancels HTML5 drags.

### Exclude IDs
`computeExcludeIds(root, sourceId)`:
- Finds source node in tree
- Collects source + all descendants (subtree)
- The source's ancestors (parents, embed hosts) are NOT excluded

### Drag Tracking
- `useDragMode` hook: listens to `document.dragover` (fires continuously during drag with reliable modifier state)
- RAF poll fallback for edge cases
- Keydown/keyup listeners for non-drag modifier tracking

---

## 6. Drop Overlay System

### Three Overlay Variants

#### Standard 3×3 Grid
For regular docks (panels, embed hosts without occupied zones):
```
┌─────┬──────┬─────┐
│ cor │ Top  │ cor │
├─────┼──────┼─────┤
│Left │Center│Right│
├─────┼──────┼─────┤
│ cor │Bottom│ cor │
└─────┴──────┴─────┘
```
- 5 drop zones (top/bottom/left/right/center)
- 4 corner spacers (transparent, no drop)
- Center = swap (insert mode) / tab (tab mode) / float (embed mode)

#### Embed Split Overlay
For embed hosts WITH occupied zones:
- Each occupied edge zone contains an **inner mini 3×3 grid**
- Outer zone cell → targets embed host (embed operation)
- Inner mini grid → targets the existing dock (insert/tab/embed operations)
- Source's own zone: NO inner mini grid (prevents `source===target` → "IneligibleDock")
- Unoccupied zones: standard zone cell only

#### Tabs Group Split Overlay
For tabs groups with an active tab:
- 3 cols × 5 rows grid
- Each edge is split into "group" part and "active tab" part
- Group zones → target the tabs group (forId)
- Active tab zones → target the active tab's dock (activeTabId)
- Center: outer = group, inner (inset 20%) = active tab

### Event Handling
- `onEnter`: `e.stopPropagation()` (prevents parent zone from stealing highlight)
- `onOver`: `e.preventDefault()` + `e.stopPropagation()` (allows drop)
- `onDrop`: dispatches `dispatchDrop(srcId, targetId, zone, mode)`
- `onLeave`: removes highlight if cursor left the zone

### Overlay Z-Index Hierarchy
| Element | z-index |
|---------|---------|
| Standard overlay | 10 (inactive: opacity 0) |
| Active overlay | 20 |
| Embed host overlay | 25 |
| DockCornerBar (collapsed) | 11 |
| CollapsedDockLabel | 8 |
| Tabs group ⋯ button | 15 |
| Connection dots | 50 |

---

## 7. Splitter & Resize System

### Splitter
- Between two row/col siblings
- Uses absolute-delta math (snapshot at mousedown, never cumulative)
- **Sibling flexGrow normalization**: at drag start, ALL siblings' flexGrow is set to their current pixel sizes (batch-read then batch-write to avoid layout thrashing)
- **Constant total**: `newPrev + newNext = totalSize` (prevents cascade to non-adjacent docks)
- **Actual min sizes**: uses dock's `minW`/`minH` (not hardcoded values)
- **Resizable check**: splitter is inert if either adjacent dock has `resizable: false`

### Connection Dots
- At splitter junctions (T-cross, X-cross, end-to-end)
- Dragging a dot resizes all connected splitters simultaneously
- Same normalization + constant-total + actual-min-size rules
- Non-resizable docks are skipped

### Embed Zone Resize
- Per-zone resize handles (thin bars at zone edges)
- Mutual-narrowing T-shape: adjacent zones adjust cross-axis offsets
- Corner dots (2-axis resize) at zone intersections
- **Effective zone sizes**: when a zone's child is collapsed, the effective size is `COLLAPSED_SIZE` (34px) — siblings and corner dots reposition around it
- Resize handle is **hidden** when the zone's child is collapsed
- **Embed padding**: gap between zones at intersection points (equals `embed_padding` setting)

### Float Resize
- 8-direction resize handles (e, w, s, n, se, sw, ne, nw)
- Minimum sizes from settings (`ui.float_min_width`, `ui.float_min_height`)
- Position adjusts for west/north resizes

---

## 8. Collapse System

### Collapse Classes
| Parent direction | Class | Strip orientation | Size |
|-----------------|-------|-------------------|------|
| row | `col-h` | narrow vertical (34px wide) | `flex: 0 0 34px` |
| col | `col-v` | short horizontal (34px tall) | `flex: 0 0 34px` |

### Collapsed Layout (unified across all dock types)
- `overflow: hidden` on the dock wrapper
- Tab bar list, tab content, embed content → `display: none`
- DockCornerBar → `z-index: 11` (kept visible)
- CollapsedDockLabel → shows icon + rotated text

### CollapsedDockLabel
| Collapse | Text orientation | Label position |
|----------|-----------------|----------------|
| col-h (narrow vertical) | Vertical (writing-mode: vertical-rl + rotate 180°) | Below corner button |
| col-v (short horizontal) | Horizontal | Right of corner button |

### `corner-left` class
- Used by tabs groups (inline ⋯ button is at top-left when collapsed)
- Collapsed label avoids the top-left corner: `left: 24px; right: 4px`

### Tabs Group Collapsed Layout
- `.lc-tabs-bar-container` → `position: static !important; z-index: 11`
- ⋯ button repositioned to `top: 3px; left: 3px; transform: none`
- Button opacity → `1` (override inline 0.6)
- `.tabs-bar-resize` → `display: none`
- Popup direction: `column` for col-h, `row` for col-v (avoids clipping by 34px strip's overflow:hidden)

### Auto-Collapse
- Toggle per-dock via ◇ button
- When enabled: dock expands on hover, collapses on mouse leave
- Enabling auto-collapse starts the dock in collapsed state

---

## 9. Capability Flags

Five boolean flags on every dock node (`undefined = true`):

| Flag | Restricts | UI effect |
|------|-----------|-----------|
| `embeddable` | Embed operation (source) | Shift won't switch to embed mode |
| `tabbable` | Tab operation (source) | Ctrl won't switch to tab mode |
| `swappable` | Insert center zone (source + target) | Center zone rejected |
| `resizable` | Splitter resize | Splitter is inert (no drag) |
| `collapsible` | SetCollapsed operation | − button hidden in corner bar |

### Helper functions
```typescript
can(node, cap)        // returns node[cap] !== false
isMovable(node)       // embeddable || tabbable || swappable
```

### DockCornerBar integration
- `caps` prop: object with all 5 flags
- `collapsible` derived: hides − button if false
- `movable` derived: hides drag grip + makes ⋮ non-draggable if false
- Capability toggle buttons (E/T/S/R/C) in the corner bar popup
- `setCapability(id, cap, value)` action: directly mutates domain layout + syncs

---

## 10. Multi-Selection

### Selection State
```typescript
selectedIds: Set<DockId>;
selectionAnchor: DockId | null;
```

### Selection Actions
| Action | Trigger | Behavior |
|--------|---------|----------|
| Toggle select | Ctrl+Click on corner button | Adds/removes dock from selection (any parent) |
| Range select | Shift+Click on corner button | Selects all siblings between anchor and clicked (same parent only) |
| Clear | Plain click on corner button | Clears selection, opens popup |

### Range Selection Logic
- If anchor and clicked dock share the same parent (row/col/tabs) → select all children between them
- If different parents → falls back to toggle-select (single dock)
- Selection is cleared after structural layout changes (`docking.changed` event)

### Visual
- `dock-selected` class: blue outline (`var(--dock-ct)`, 2px)
- Takes priority over `dock-active` (green outline)

---

## 11. Corner Bar & Per-Dock Controls

### DockCornerBar (panels, embed hosts, floats)
- Position: `top: 3px; right: 3px` (default) or `top: 3px; left: 3px` (cornerSide="left")
- Popup commands: drag grip, collapse (−), auto-collapse (◇), close (✕), capability toggles (E/T/S/R/C)
- Popup direction: `column` for col-h/narrow, `row` for col-v/wide
- **Narrow detection**: ResizeObserver tracks dock width; if < 120px, popup switches to vertical
- Draggable toggle: initiates HTML5 drag → reparents dock
- Click toggle: opens/closes command popup

### Tabs Group Inline ⋯ Button
- In the tab bar container (`.lc-tabs-bar-container`)
- Position: start of tab bar (left for horizontal bars, top for vertical bars)
- When collapsed: repositioned to `top: 3px; left: 3px` via CSS
- Popup: combine (⧉), collapse (−), auto-collapse (◇), close (✕)
- Drag: reparents tabs group (checks capabilities)
- Multi-select: Ctrl+Click toggles, Shift+Click range-selects

### Row/Col Groups
- **No DockCornerBar** (removed — user can select via Ctrl+Click mechanism)
- CollapsedDockLabel still shows when collapsed

---

## 12. Embed Host System

### Promotion
- `promoteToEmbed(panel | tabs)` → embed host (preserves id, flexGrow, label, contentType)
- `originalType` saved for demotion

### Demotion
- `demoteEmbedIfEmpty(embed)` → back to originalType if no zones and no floats

### Zone Layout (Mutual-Narrowing T-Shaped)
```
┌──────────────────────────────┐
│         TOP ZONE             │
├──────┬───────────────┬───────┤
│ LEFT │   EMBED BG    │ RIGHT │
│ ZONE │  (content)    │ ZONE  │
├──────┴───────────────┴───────┤
│        BOTTOM ZONE           │
└──────────────────────────────┘
```
- Zones are absolutely positioned within `.embed-inner`
- `.embed-inner` has `inset: embed_padding` (gap between embed border and zones)
- Top zone: `left = eff.leftW + gap`, `right = eff.rightW + gap`
- Left zone: `top = eff.topH + gap`, `bottom = eff.bottomH + gap`
- Gap at intersections = `embed_padding`

### Effective Zone Sizes
- When a zone's child is collapsed: effective size = `COLLAPSED_SIZE` (34px)
- Siblings reposition around collapsed zones
- Stored `zoneSizes` are preserved (not modified) — dock expands back to original size

### Embed Padding
- Setting: `ui.embed_padding` (default 0)
- Applied as `inset` on `.embed-inner` (outer padding)
- Also applied as gap between zones at intersection points

### Embedding into Occupied Zones
- If zone is occupied: wrap existing + new in split container
  - top/bottom → `col [existing, new]` (new goes below)
  - left/right → `row [existing, new]` (new goes right)
- If existing occupant is already the right split type → append to it
- No eviction to floats (previous behavior removed)

### Floats
- Positioned absolutely within `.embed-inner`
- Constrained to parent bounds
- 8-direction resize
- `onMouseDown` on ✥ button → move within parent
- Position/size mutations go to **domain layout** (not store clone) to survive sync

---

## 13. Tabs Group System

### Tab Bar
- Orientation: `barSide` (top/bottom/left/right) — independent per group
- Horizontal bars: `flex-direction: row`, tabs side by side
- Vertical bars: `flex-direction: column`, tabs stacked
- `overflow: hidden` (no scrollers)
- Resize handle: `tabs-bar-resize` (min 32px, max 200px for horizontal; min 80px, max 300px for vertical)

### Tab Features
- Each tab: drag grip (⠿ tear-out), dot (content type), label, close (✕)
- Tab reordering: drag tab within bar (`text/tab-reorder` dataTransfer)
- Active tab: highlighted, content rendered below/beside bar
- Tab content: panel → simplified `.lc-tab-body` (no DockCornerBar); non-panel → full DockNodeView

### Tab Parenting
- Tab into a tabs group → nested tabs group (child keeps independent barSide)
- Combine tabs → merges child tabs back into parent at child's position
- SetTabBarSide → changes bar orientation (per group, independent)

### Collapsed Tabs Group
- Inline ⋯ button: repositioned to top-left, opacity 1, visible background
- Popup direction: column for col-h, row for col-v (avoids clipping)
- Tab bar list + resize handle: `display: none`
- Container: `position: static` (button positioned relative to `.lc-tabs`)
- `corner-left` class: collapsed label avoids top-left corner

---

## 14. Settings & Registries

### Settings Schema
| Key | Default | Description |
|-----|---------|-------------|
| `ui.peek_modifier_panel` | ctrl | Modifier to reveal panel headers |
| `ui.peek_modifier_group` | shift | Modifier to reveal group headers |
| `ui.drag_hints` | true | Show drag-mode badge |
| `ui.drop_overlay_blur` | 6 | Backdrop blur on overlay (px) |
| `ui.min_panel_width` | 60 | Minimum panel width (px) |
| `ui.min_panel_height` | 60 | Minimum panel height (px) |
| `ui.float_min_width` | 140 | Minimum float width (px) |
| `ui.float_min_height` | 80 | Minimum float height (px) |
| `ui.embed_zone_min` | 80 | Minimum embed zone size (px) |
| `ui.embed_padding` | 0 | Padding around embedded docks (px) |
| `ui.theme_id` | midnight | Active theme |
| `ui.show_dev_panel` | true | Show developer tree-view panel |
| `ui.show_connection_dots` | true | Render splitter junction dots |
| `ui.animation_duration` | 120 | Transition duration (ms) |
| `ui.font_family` | system | Application font |
| `ui.density` | normal | Layout density |

### Theme Registry
- CSS variables (`--dock-*`) for all colors, sizes, fonts
- Per-token override (settings dialog color picker)
- `applyThemeToDocument()` writes variables to `:root`

### Shortcut Registry
- Chord-based key bindings (Ctrl+S, Shift+T, etc.)
- User-modifiable (rebind/clear in settings)
- `parseChord` / `chordToString` helpers

### Command Registry
- Named commands with handlers
- `docking.add-panel`, `docking.reset-layout`, `app.settings.open`, etc.

---

## 15. Tree Import/Export

### Compact Format
```
col {
  row {
    panel "Chart" chart
    panel "Table" table !resizable !collapsible
  }
  panel "Notes" text
}
```

### Syntax
| Keyword | Description |
|---------|-------------|
| `col { ... }` | Column container |
| `row { ... }` | Row container |
| `tabs "Label" top { ... }` | Tabs group with barSide |
| `panel "Label" contentType` | Panel |
| `embed "Label" contentType { zone ... float ... }` | Embed host |
| `zone top { node }` | Zone declaration |
| `float x y w h { node }` | Float declaration |
| `!capability` | Capability flag (e.g., `!resizable`, `!collapsible`) |

### JSON Format
Standard JSON object with `type`, `children`, `zones`, `floats`, etc.

### API
```typescript
parseDockTree(text: string): DockLayout    // auto-detects JSON vs compact
treeToCompactString(node: DockNode): string // serialize to compact format
```

### Dev Panel Integration
- ⇄ button toggles import/export panel
- "Export current" → fills textarea with compact format
- "Load pasted" → parses and applies via `domain.restore_docking()`
- Error display for invalid input

---

## 16. File Structure

```
src/
├── lib/
│   ├── domain-foundation/docking/
│   │   ├── types.ts              ← DockNode types, capability helpers (can, isMovable)
│   │   ├── model.ts              ← factories, find, detach, clone, swapNodes
│   │   ├── operations.ts         ← Insert, Tab, Embed, Close, SetCollapsed, etc.
│   │   ├── validation.ts         ← steady-state validation
│   │   ├── normalization.ts      ← unwrap, demote, fixpoint
│   │   ├── error.ts              ← DockingError types
│   │   └── index.ts              ← re-exports
│   ├── domain-engine/
│   │   └── index.ts              ← DomainEngine (owns layout, undo/redo)
│   ├── app-engine/
│   │   ├── index.ts              ← Bootstrap, AppEngine
│   │   ├── configuration/        ← ConfigStore, ConfigSchema
│   │   ├── commands/             ← CommandRegistry
│   │   ├── events/               ← EventBus
│   │   ├── history/              ← HistoryStore (undo/redo)
│   │   ├── errors/               ← AppError types
│   │   ├── metadata/             ← MetadataStore
│   │   ├── persistence/          ← PersistenceLayer
│   │   └── tasks/                ← TaskQueue
│   ├── registries/
│   │   ├── index.ts              ← Registries container
│   │   ├── settings.ts           ← Settings (ConfigStore wrapper)
│   │   ├── theme-registry.ts     ← ThemeRegistry
│   │   └── shortcut-registry.ts  ← ShortcutRegistry
│   └── app/
│       └── store.ts              ← Zustand store (binds engine to React)
├── components/
│   ├── docking/
│   │   ├── DockingRoot.tsx       ← top-level surface
│   │   ├── DockNode.tsx          ← recursive renderer
│   │   ├── DropOverlay.tsx       ← 3 overlay variants
│   │   ├── Splitter.tsx          ← splitters + connection dots
│   │   ├── DockCornerBar.tsx     ← per-dock controls
│   │   ├── DockHeader.tsx        ← tab grip (tear-out)
│   │   ├── icons.tsx             ← content type SVGs
│   │   ├── use-drag-mode.ts      ← drag mode tracking
│   │   └── tree-parser.ts        ← import/export
│   ├── shell/ (optional)
│   │   ├── MenuBar.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── ContextMenu.tsx
│   │   └── KeyboardShortcuts.tsx
│   └── ui/ (optional, shadcn/ui)
└── app/
    └── docking.css               ← all docking styles
```

---

## 17. Contribution Guide

### Adding a New Operation

1. **Define the operation type** in `operations.ts`:
```typescript
export interface DockingOperationMyOp {
  type: "MyOp";
  dock: DockId;
  // ... params
}
```

2. **Add to the `DockingOperation` union**.

3. **Implement `applyMyOp`**:
```typescript
function applyMyOp(layout: DockLayout, dockId: DockId): boolean {
  const found = find(layout.root, dockId);
  if (!found) return false;
  // mutate layout...
  return true;
}
```

4. **Add to `applyOperation` switch**:
```typescript
case "MyOp":
  ok = applyMyOp(candidate, op.dock);
  label = "my op";
  name = "docking.my_op";
  break;
```

5. **Add a store action** in `store.ts` if needed.

6. **Add UI** (corner bar button, overlay zone, etc.) as needed.

### Adding a New Dock Type

1. **Add the type** to `types.ts` (extends `BaseNode`).
2. **Update `childrenOf`** and `collectSubtreeIds`** in `types.ts`.
3. **Update `find`**, `detach`, `replaceNode`** in `model.ts`.
4. **Update `normalize`** in `normalization.ts`.
5. **Update `validate`** in `validation.ts`.
6. **Add render view** in `DockNode.tsx` (new function + switch case in `DockNodeView`).
7. **Add CSS** in `docking.css`.
8. **Update `tree-parser.ts`** for import/export support.

### Adding a New Capability Flag

1. **Add to `CapabilityName`** in `types.ts`.
2. **Add to `BaseNode`** as optional field.
3. **Check in relevant operations** (e.g., `can(srcNode, "myCap")`).
4. **Add toggle button** to `DockCornerBar` (`CAP_DEFS` array).
5. **Add to `nodeCaps()`** helper in `DockNode.tsx`.
6. **Update `tree-parser.ts`** to parse `!myCap` syntax.

### Testing Operations

Use the bun CLI to test operations without the browser:
```bash
bun -e "
import { applyOperation } from './src/lib/domain-foundation/docking/operations';
import { createSeedLayout } from './src/lib/app/store';
import { cloneLayout } from './src/lib/domain-foundation/docking/model';
const layout = cloneLayout({ root: createSeedLayout().root, nextId: createSeedLayout().nextId });
const r = applyOperation(layout, { type: 'Insert', source: { kind: 'existing', id: 'd3' }, target: 'd1', zone: 'right' });
console.log(r.ok ? 'OK' : 'FAIL: ' + r.error?.kind);
"
```

### Key Rules for Contributors

1. **Never mutate the original layout** — always work on a clone in operations.
2. **Always normalize + validate** after mutations.
3. **Domain layer is pure** — no DOM, no React, no CSS in `domain-foundation/`.
4. **Store mirrors engine** — use `syncFromEngine()` after direct domain mutations.
5. **Float mutations go to domain** — not the store clone (or they're lost on sync).
6. **setDrag is deferred to rAF** — Zustand v5 synchronous re-render cancels HTML5 drags.
7. **Splitter normalization** — batch-read all sizes first, then batch-write (avoid layout thrashing).
8. **Collapsed layout is unified** — all dock types follow the same 34px strip + corner button + label pattern.
9. **Overlay inner mini grids skip the source's zone** — prevents `source===target` → "IneligibleDock".
10. **Root-as-target** — both `applyInsert` and `applyTab` handle the case where the target IS the root (no parent).

---

*This specification covers the complete docking system as of version 1.0. For questions or contributions, refer to the file structure in Section 16.*
