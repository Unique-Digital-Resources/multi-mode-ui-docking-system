/**
 * App Store — central React binding for the 3-layer engine.
 * ===========================================
 * Wires AppEngine + DomainEngine + Registries into a Zustand store so React
 * components can subscribe to layout changes, dispatch commands, and read
 * registries. The store is the single source of truth for the live layout
 * (the DomainEngine owns the authoritative DockLayout; this store mirrors it
 * into an immutable snapshot + a bumping revision counter for re-renders).
 */

"use client";

import { create } from "zustand";
import { Bootstrap, type AppEngine } from "@/lib/app-engine";
import { DomainEngine } from "@/lib/domain-engine";
import { Registries, registerDefaultCommands } from "@/lib/registries";
import {
  type DockLayout,
  type DockNode,
  type DockId,
  type DropZone,
  type DragMode,
  type ContentType,
  type BarSide,
  type DockingOperation,
  type CapabilityName,
} from "@/lib/domain-foundation/docking";
import { cloneNode, find } from "@/lib/domain-foundation/docking/model";

/** Build the default seed layout (mirrors the JS system's init). */
export function createSeedLayout(): DockLayout {
  let n = 0;
  const id = () => `d${++n}`;
  const chart: DockNode = { id: id(), type: "panel", flexGrow: 1, minW: 60, minH: 60, collapsed: false, label: "Chart", contentType: "chart" };
  const table: DockNode = { id: id(), type: "panel", flexGrow: 1, minW: 60, minH: 60, collapsed: false, label: "Table", contentType: "table" };
  const text: DockNode = { id: id(), type: "panel", flexGrow: 1, minW: 60, minH: 60, collapsed: false, label: "Notes", contentType: "text" };
  const row: DockNode = { id: id(), type: "row", flexGrow: 1, minW: 60, minH: 60, collapsed: false, children: [chart, table], label: null, contentType: "group" };
  const root: DockNode = { id: id(), type: "col", flexGrow: 1, minW: 60, minH: 60, collapsed: false, children: [row, text], label: null, contentType: "group" };
  return { root, nextId: n };
}

// ---- engine singletons (created once per browser tab) ----

let _engine: AppEngine | null = null;
let _domain: DomainEngine | null = null;
let _registries: Registries | null = null;

function ensureEngine() {
  if (!_engine) {
    const seed = createSeedLayout();
    _engine = Bootstrap.create();
    _domain = new DomainEngine(_engine, seed);
    _domain.mark_saved();
    _registries = new Registries(_engine, _domain);
    registerDefaultCommands(_engine, _domain, _registries);
    _registries.applyThemeToDocument();
  }
  return { engine: _engine!, domain: _domain!, registries: _registries! };
}

export interface DragState {
  active: boolean;
  srcId: DockId | null;
  exceptIds: Set<DockId>;
  mode: DragMode;
}

export interface ToastMessage {
  id: number;
  label: string;
  mode: DragMode | "insert";
}

interface AppState {
  rev: number;
  layout: DockNode;
  nextId: number;
  drag: DragState;
  peekedId: DockId | null;
  toast: ToastMessage | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  focusedId: DockId | null;
  /** Dock ids with auto-collapse enabled (expand on hover, collapse on leave). */
  autoCollapseIds: Set<DockId>;
  /** Multi-selected dock ids (Ctrl+Click / Shift+Click on corner buttons). */
  selectedIds: Set<DockId>;
  /** Anchor for Shift+Click range selection (same-parent siblings). */
  selectionAnchor: DockId | null;

  syncFromEngine: () => void;
  dispatchDrop: (sourceId: DockId, targetId: DockId, zone: DropZone, mode: DragMode) => void;
  addPanel: (label: string, contentType: ContentType, capabilities?: Partial<Record<CapabilityName, boolean>>) => void;
  closeDock: (id: DockId) => void;
  toggleCollapse: (id: DockId) => void;
  setActiveTab: (groupId: DockId, index: number) => void;
  reorderTab: (groupId: DockId, from: number, to: number) => void;
  combineTabs: (tabsId: DockId) => void;
  setTabBarSide: (groupId: DockId, barSide: BarSide) => void;
  setDrag: (drag: Partial<DragState>) => void;
  setPeeked: (id: DockId | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setFocused: (id: DockId | null) => void;
  toggleAutoCollapse: (id: DockId) => void;
  hoverExpand: (id: DockId) => void;
  hoverCollapse: (id: DockId) => void;
  undo: () => void;
  redo: () => void;
  resetLayout: () => void;
  showToast: (label: string, mode: DragMode | "insert") => void;
  /** Directly set a capability flag on a dock node (mutates domain layout + syncs). */
  setCapability: (id: DockId, cap: CapabilityName, value: boolean) => void;
  /** Ctrl+Click: toggle a single dock in the multi-selection. */
  toggleSelect: (id: DockId) => void;
  /** Shift+Click: range-select siblings between anchor and id (same parent only). */
  rangeSelect: (id: DockId) => void;
  /** Clear the multi-selection. */
  clearSelection: () => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set, get) => {
  const { domain, registries, engine } = getEngine();

  domain.signalBus.subscribe("docking.changed", () => {
    set((s) => ({
      rev: s.rev + 1,
      layout: cloneNode(domain.dockingLayout.root),
      nextId: domain.dockingLayout.nextId,
      // clear multi-selection after structural layout changes (ids may be stale)
      selectedIds: new Set(),
      selectionAnchor: null,
    }));
  });

  engine.eventBus.subscribe("app.toast", (e) => {
    const p = e.payload as { label: string; mode: DragMode | "insert" };
    get().showToast(p.label, p.mode);
  });
  engine.eventBus.subscribe("app.command-palette.open", () => get().setPaletteOpen(true));
  engine.eventBus.subscribe("app.settings.open", () => get().setSettingsOpen(true));
  engine.eventBus.subscribe("app.settings.changed", () => {
    registries.applyThemeToDocument();
    set((s) => ({ rev: s.rev + 1 }));
  });
  engine.eventBus.subscribe("app.reset-layout", () => get().resetLayout());

  return {
    rev: 0,
    layout: cloneNode(domain.dockingLayout.root),
    nextId: domain.dockingLayout.nextId,
    drag: { active: false, srcId: null, exceptIds: new Set(), mode: "insert" },
    peekedId: null,
    toast: null,
    paletteOpen: false,
    settingsOpen: false,
    focusedId: null,
    autoCollapseIds: new Set(),
    selectedIds: new Set(),
    selectionAnchor: null,

    syncFromEngine: () => {
      set((s) => ({
        rev: s.rev + 1,
        layout: cloneNode(domain.dockingLayout.root),
        nextId: domain.dockingLayout.nextId,
      }));
    },

    dispatchDrop: (sourceId, targetId, zone, mode) => {
      const op: DockingOperation =
        mode === "tab"
          ? { type: "Tab", source: { kind: "existing", id: sourceId }, target: targetId, zone }
          : mode === "embed"
            ? { type: "Embed", source: { kind: "existing", id: sourceId }, target: targetId, zone }
            : { type: "Insert", source: { kind: "existing", id: sourceId }, target: targetId, zone };
      const r = domain.execute_docking(op);
      if (r.ok) {
        get().showToast(`${mode} → ${zone}`, mode);
      } else {
        const kind = (r.error as { error?: { kind?: string } }).error?.kind ?? "error";
        get().showToast(`rejected: ${kind}`, "insert");
      }
    },

    addPanel: (label, contentType, capabilities) => {
      // target the focused dock (insert beside it); fall back to the root's
      // last child if no dock is focused
      const fid = get().focusedId;
      const root = domain.dockingLayout.root;
      let targetId: DockId;
      if (fid && find(domain.dockingLayout.root, fid)) {
        targetId = fid;
      } else if (root.type === "row" || root.type === "col") {
        targetId = root.children[root.children.length - 1]?.id ?? root.id;
      } else {
        targetId = root.id;
      }
      const op: DockingOperation = {
        type: "Insert",
        source: { kind: "new-panel", label, contentType, capabilities },
        target: targetId,
        zone: "right",
      };
      domain.execute_docking(op);
      get().showToast(`added ${label}`, "insert");
    },

    closeDock: (id) => {
      domain.execute_docking({ type: "Close", dock: id });
    },
    toggleCollapse: (id) => {
      const node = find(domain.dockingLayout.root, id)?.node;
      if (!node) return;
      domain.execute_docking({ type: "SetCollapsed", dock: id, collapsed: !node.collapsed });
    },
    setActiveTab: (groupId, index) => {
      domain.execute_docking({ type: "SetActiveTab", group: groupId, index });
    },
    reorderTab: (groupId, from, to) => {
      domain.execute_docking({ type: "ReorderTab", group: groupId, from, to });
    },
    combineTabs: (tabsId) => {
      domain.execute_docking({ type: "CombineTabs", tabsId });
      get().showToast("combined tabs", "insert");
    },
    setTabBarSide: (groupId, barSide) => {
      domain.execute_docking({ type: "SetTabBarSide", group: groupId, barSide });
    },

    setDrag: (partial) => {
      set((s) => ({ drag: { ...s.drag, ...partial } }));
    },
    setPeeked: (id) => set({ peekedId: id }),
    setPaletteOpen: (open) => set({ paletteOpen: open }),
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setFocused: (id) => set({ focusedId: id }),

    toggleAutoCollapse: (id) => {
      const cur = get().autoCollapseIds;
      const next = new Set(cur);
      if (next.has(id)) {
        next.delete(id);
        // disabling auto-collapse → expand the dock so it stays visible
        domain.execute_docking({ type: "SetCollapsed", dock: id, collapsed: false });
      } else {
        next.add(id);
        // enabling auto-collapse → start collapsed (expands on hover)
        domain.execute_docking({ type: "SetCollapsed", dock: id, collapsed: true });
      }
      set({ autoCollapseIds: next });
    },
    hoverExpand: (id) => {
      if (!get().autoCollapseIds.has(id)) return;
      const node = find(domain.dockingLayout.root, id)?.node;
      if (node?.collapsed) {
        domain.execute_docking({ type: "SetCollapsed", dock: id, collapsed: false });
      }
    },
    hoverCollapse: (id) => {
      if (!get().autoCollapseIds.has(id)) return;
      const node = find(domain.dockingLayout.root, id)?.node;
      if (node && !node.collapsed) {
        domain.execute_docking({ type: "SetCollapsed", dock: id, collapsed: true });
      }
    },

    setCapability: (id, cap, value) => {
      const found = find(domain.dockingLayout.root, id);
      if (found) {
        (found.node as Record<CapabilityName, boolean | undefined>)[cap] = value;
      }
      get().syncFromEngine();
    },

    toggleSelect: (id) => {
      const cur = get().selectedIds;
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ selectedIds: next, selectionAnchor: id });
    },

    rangeSelect: (id) => {
      const st = get();
      const anchor = st.selectionAnchor;
      if (!anchor) {
        // no anchor — treat as a single toggle-select
        st.toggleSelect(id);
        return;
      }
      const root = domain.dockingLayout.root;
      const aFound = find(root, anchor);
      const cFound = find(root, id);
      if (!aFound || !cFound) { st.toggleSelect(id); return; }
      // must be the same parent (array container) for range selection
      if (aFound.parent !== cFound.parent || !aFound.parent ||
          (aFound.parent.type !== "row" && aFound.parent.type !== "col" && aFound.parent.type !== "tabs")) {
        // different parents — just toggle-select the clicked dock
        st.toggleSelect(id);
        return;
      }
      const parent = aFound.parent;
      const aIdx = aFound.idx as number;
      const cIdx = cFound.idx as number;
      const from = Math.min(aIdx, cIdx);
      const to = Math.max(aIdx, cIdx);
      const next = new Set(st.selectedIds);
      for (let i = from; i <= to; i++) next.add(parent.children[i].id);
      set({ selectedIds: next });
    },

    clearSelection: () => {
      set({ selectedIds: new Set(), selectionAnchor: null });
    },

    undo: () => {
      if (domain.canUndo()) {
        domain.undo();
        get().showToast("undo", "insert");
      }
    },
    redo: () => {
      if (domain.canRedo()) {
        domain.redo();
        get().showToast("redo", "insert");
      }
    },
    resetLayout: () => {
      const seed = createSeedLayout();
      domain.restore_docking(seed);
      domain.mark_saved();
      get().showToast("layout reset", "insert");
    },

    showToast: (label, mode) => {
      const id = ++toastId;
      set({ toast: { id, label, mode } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 2000);
    },
  };
});

export function getEngine() {
  return ensureEngine();
}

/** React-friendly alias (same value; named `use` for render-level reads). */
export function useEngine() {
  return ensureEngine();
}

export function executeCommand(commandId: string, data?: unknown): void {
  const { engine, domain } = getEngine();
  // "docking.add-panel" is routed through the store's addPanel action so it
  // targets the focused dock's direct parent (not the root), matching the
  // "events outside a dock target the current dock" contract.
  if (commandId === "docking.add-panel") {
    const d = (data ?? {}) as { label?: string; contentType?: import("@/lib/domain-foundation/docking").ContentType; capabilities?: Partial<Record<CapabilityName, boolean>> };
    useAppStore.getState().addPanel(d.label ?? "Panel", d.contentType ?? "panel", d.capabilities);
    return;
  }
  const handler = engine.commandRegistry.getHandler(commandId);
  if (!handler) return;
  handler.execute({ data }, { executionId: "exec" }, domain.engineRef);
}

// Expose the store + engine on window for dev/verification (dev only).
if (typeof window !== "undefined") {
  (window as unknown as { __appStore?: typeof useAppStore; __engine?: ReturnType<typeof getEngine> }).__appStore = useAppStore;
  (window as unknown as { __appStore?: typeof useAppStore; __engine?: ReturnType<typeof getEngine> }).__engine = getEngine();
}
