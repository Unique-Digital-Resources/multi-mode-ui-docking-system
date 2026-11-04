Here are the exact files and folders to download for the **docking system and its UI only**:

## Required Files (docking system core + UI)

### 1. Docking domain logic (headless, no UI)
```
src/lib/domain-foundation/docking/
├── types.ts          ← types + capability flags (can, isMovable)
├── model.ts          ← factories, traversal, detach, clone
├── operations.ts     ← Insert, Tab, Embed, Close, SetCollapsed, etc.
├── validation.ts     ← steady-state validation
├── normalization.ts  ← unwrap single-child containers
├── error.ts          ← error types
└── index.ts          ← re-exports everything
```

### 2. Domain engine (wraps the docking layout)
```
src/lib/domain-engine/index.ts
```

### 3. App engine (infrastructure: history, config, events, commands)
```
src/lib/app-engine/
├── index.ts
├── commands/index.ts
├── configuration/index.ts
├── errors/index.ts
├── events/index.ts
├── history/index.ts
├── metadata/index.ts
├── persistence/index.ts
└── tasks/index.ts
```

### 4. Registries (settings, themes, shortcuts)
```
src/lib/registries/
├── index.ts
├── settings.ts
├── theme-registry.ts
└── shortcut-registry.ts
```

### 5. Zustand store (binds engine to React)
```
src/lib/app/store.ts
```

### 6. Docking UI components
```
src/components/docking/
├── DockingRoot.tsx     ← top-level surface (layout + dev panel + drag tracking)
├── DockNode.tsx        ← recursive renderer (panel/row/col/tabs/embed + floats)
├── DropOverlay.tsx     ← 3 overlay variants (standard, embed split, tabs split)
├── Splitter.tsx        ← splitters + connection dots
├── DockCornerBar.tsx   ← per-dock corner button (drag/collapse/close/caps)
├── DockHeader.tsx      ← tab grip (tear-out)
├── icons.tsx           ← content type SVG icons
├── use-drag-mode.ts    ← drag mode tracking (insert/tab/embed via modifiers)
└── tree-parser.ts      ← paste/import docking tree (JSON + compact format)
```

### 7. All docking CSS
```
src/app/docking.css     ← all docking system styles (panels, tabs, embed, overlay, etc.)
```

## Optional (shell + UI, if you want settings/menu)

```
src/components/shell/   ← MenuBar, SettingsDialog, CommandPalette, ContextMenu, KeyboardShortcuts
src/components/ui/      ← shadcn/ui components (used by shell only)
src/lib/utils.ts        ← cn() helper (used by ui/ components only)
src/hooks/              ← use-toast, use-mobile (used by shell only)
```

## NOT needed (Next.js wrapper only)

```
src/app/page.tsx              ← the page that assembles everything
src/app/layout.tsx            ← root layout
src/app/globals.css            ← Tailwind CSS
src/app/compiled-globals.css   ← pre-compiled Tailwind
src/app/api/                   ← API routes
next.config.ts                 ← Next.js config
tailwind.config.ts             ← Tailwind config
postcss.config.mjs.bak         ← PostCSS config
```

## Dependencies (from package.json)

The docking system only needs:
- **`react`** + **`react-dom`** — UI rendering
- **`zustand`** — state management

That's it. The Radix UI / Tailwind dependencies are only for the optional shell components.