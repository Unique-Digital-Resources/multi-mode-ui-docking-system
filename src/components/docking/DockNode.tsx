"use client";

import { useRef, useCallback, Fragment, useState } from "react";
import { useAppStore } from "@/lib/app/store";
import { getEngine } from "@/lib/app/store";
import type {
  DockId,
  DockNode,
  PanelNode,
  RowNode,
  ColNode,
  TabsNode,
  EmbedNode,
  EdgeRegion,
  FloatEntry,
  ContentType,
} from "@/lib/domain-foundation/docking";
import { can, isMovable } from "@/lib/domain-foundation/docking";
import type { DockCaps } from "./DockCornerBar";
import { ContentIcon } from "./icons";
import { DropOverlay, computeExcludeIds } from "./DropOverlay";
import { Splitter } from "./Splitter";
import { TabGrip } from "./DockHeader";
import { DockCornerBar } from "./DockCornerBar";
import { scheduleFocus } from "./use-drag-mode";

/**
 * Recursive dock-node renderer (port of js/renderer.js renderTree).
 * Switches on node.type → RowCol / Tabs / Embed / Panel.
 *
 * Each wrapper carries:
 *   data-dock-wrapper="true"
 *   data-id            = node id
 *   data-dock-kind     = panel | group | tabs | embed
 *   class              = col-h/col-v when collapsed (per parent direction)
 *                        dock-active when focusedId === node.id
 *
 * The old hidden-header + peek mechanism has been removed; the DockCornerBar
 * is the sole per-dock control (drag grip + collapse + close).
 *
 * When a dock is collapsed, a CollapsedDockLabel (icon + rotated text) is
 * rendered as a direct child of the wrapper so the user can identify which
 * collapsed dock is which. The corner button (⋮ toggle) sits on top.
 */

/**
 * CollapsedDockLabel — shows the dock's icon + label, oriented based on the
 * collapse direction (driven by the col-h / col-v class on the parent).
 *   col-h (narrow vertical strip)  → vertical text (reads bottom-to-top)
 *   col-v (short horizontal strip) → horizontal text
 *
 * Rendered only when `collapsed && parentDir` — i.e. when the dock is actually
 * collapsed AND has a parent direction (so col-h/col-v will be applied).
 */
function CollapsedDockLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="collapsed-label" aria-hidden>
      <span className="cl-icon">{icon}</span>
      <span className="cl-text">{label}</span>
    </div>
  );
}

/** Compute the 5 capability flags from a dock node for the DockCornerBar. */
function nodeCaps(node: DockNode): DockCaps {
  return {
    embeddable: can(node, "embeddable"),
    tabbable: can(node, "tabbable"),
    swappable: can(node, "swappable"),
    resizable: can(node, "resizable"),
    collapsible: can(node, "collapsible"),
  };
}

/** Collapsed dock strip size (matches the CSS `flex: 0 0 34px`). */
const COLLAPSED_SIZE = 34;

/** Effective zone sizes — when a zone's child is collapsed, the zone's
 *  effective size shrinks to COLLAPSED_SIZE so sibling zones + corner dots
 *  re-layout around it. The stored zoneSizes (sz) are NOT modified — when the
 *  child expands again, the zone returns to its stored size. */
function computeEffSizes(
  zones: { top: DockNode | null; bottom: DockNode | null; left: DockNode | null; right: DockNode | null },
  sz: { topH: number; bottomH: number; leftW: number; rightW: number },
) {
  return {
    topH: zones.top?.collapsed ? COLLAPSED_SIZE : sz.topH,
    bottomH: zones.bottom?.collapsed ? COLLAPSED_SIZE : sz.bottomH,
    leftW: zones.left?.collapsed ? COLLAPSED_SIZE : sz.leftW,
    rightW: zones.right?.collapsed ? COLLAPSED_SIZE : sz.rightW,
  };
}

/** Zone position with effective sizes + intersection gap.
 *  The gap (embed_padding) creates visible space between zones at intersection
 *  points without affecting the resize mechanism (which adjusts sz, not eff). */
function zonePosition(
  edge: EdgeRegion,
  eff: { topH: number; bottomH: number; leftW: number; rightW: number },
  zones: { top: DockNode | null; bottom: DockNode | null; left: DockNode | null; right: DockNode | null },
  gap: number,
): React.CSSProperties {
  const hasTop = zones.top != null;
  const hasBottom = zones.bottom != null;
  const hasLeft = zones.left != null;
  const hasRight = zones.right != null;
  switch (edge) {
    case "top":
      return {
        top: 0,
        left: hasLeft ? eff.leftW + gap : 0,
        right: hasRight ? eff.rightW + gap : 0,
        height: eff.topH,
      };
    case "bottom":
      return {
        bottom: 0,
        left: hasLeft ? eff.leftW + gap : 0,
        right: hasRight ? eff.rightW + gap : 0,
        height: eff.bottomH,
      };
    case "left":
      return {
        left: 0,
        top: hasTop ? eff.topH + gap : 0,
        bottom: hasBottom ? eff.bottomH + gap : 0,
        width: eff.leftW,
      };
    case "right":
      return {
        right: 0,
        top: hasTop ? eff.topH + gap : 0,
        bottom: hasBottom ? eff.bottomH + gap : 0,
        width: eff.rightW,
      };
  }
}

export function DockNodeView({
  node,
  isRoot,
  parentDir,
}: {
  node: DockNode;
  isRoot: boolean;
  parentDir?: "row" | "col";
}) {
  switch (node.type) {
    case "panel":
      return <PanelView node={node} parentDir={parentDir} />;
    case "row":
    case "col":
      return <RowColView node={node} isRoot={isRoot} parentDir={parentDir} />;
    case "tabs":
      return <TabsView node={node} parentDir={parentDir} />;
    case "embed":
      return <EmbedView node={node} parentDir={parentDir} />;
  }
}

/** Collapse class: col-h when collapsed inside a row, col-v inside a col. */
function collapseClass(collapsed: boolean, parentDir?: "row" | "col"): string {
  if (!collapsed || !parentDir) return "";
  return parentDir === "row" ? "col-h" : "col-v";
}

function PanelView({ node, parentDir }: { node: PanelNode; parentDir?: "row" | "col" }) {
  const focusedId = useAppStore((s) => s.focusedId);
  const setFocused = useAppStore((s) => s.setFocused);
  const hoverExpand = useAppStore((s) => s.hoverExpand);
  const hoverCollapse = useAppStore((s) => s.hoverCollapse);
  const selected = useAppStore((s) => s.selectedIds.has(node.id));
  return (
    <div
      className={`lc-panel ${collapseClass(node.collapsed, parentDir)} ${focusedId === node.id ? "dock-active" : ""} ${selected ? "dock-selected" : ""}`}
      data-dock-wrapper="true"
      data-id={node.id}
      data-dock-kind="panel"
      style={{ flexGrow: node.flexGrow }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseUp={(e) => { e.stopPropagation(); setFocused(node.id); }}
      onMouseEnter={() => hoverExpand(node.id)}
      onMouseLeave={() => hoverCollapse(node.id)}
    >
      <div className="lc-panel-body">
        <ContentIcon type={node.contentType} className="body-icon" />
        <span className="body-label">{node.label}</span>
      </div>
      <DockCornerBar dockId={node.id} collapsed={node.collapsed} parentDir={parentDir} caps={nodeCaps(node)} />
      {node.collapsed && parentDir && (
        <CollapsedDockLabel
          icon={<ContentIcon type={node.contentType} className="cl-icon-svg" />}
          label={node.label}
        />
      )}
      <DropOverlay forId={node.id} />
    </div>
  );
}

function RowColView({
  node,
  isRoot,
  parentDir,
}: {
  node: RowNode | ColNode;
  isRoot: boolean;
  parentDir?: "row" | "col";
}) {
  const dir = node.type === "row" ? "row" : "col";
  const splitterCls = node.type === "row" ? "vertical" : "horizontal";
  const focusedId = useAppStore((s) => s.focusedId);
  const setFocused = useAppStore((s) => s.setFocused);
  const selected = useAppStore((s) => s.selectedIds.has(node.id));

  if (isRoot) {
    return (
      <div
        className="lc-container"
        data-dock-wrapper="true"
        data-id={node.id}
        data-dock-kind="group"
        data-dir={dir}
        style={{ flexGrow: node.flexGrow }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onMouseUp={(e) => { e.stopPropagation(); setFocused(node.id); }}
      >
        {node.children.map((child, i) => (
          <Fragment key={child.id}>
            {i > 0 && (
              <Splitter
                orientation={splitterCls as "vertical" | "horizontal"}
                containerId={node.id}
                prevIdx={i - 1}
                nextIdx={i}
              />
            )}
            <DockNodeView node={child} isRoot={false} parentDir={dir} />
          </Fragment>
        ))}
      </div>
    );
  }

  // Non-root row/col groups use cornerSide="left" so the group's toggle
  // doesn't overlap with the first/last child's toggle (which sits at
  // top-right). The `corner-left` class lets the collapsed-label CSS adapt.
  return (
    <div
      className={`lc-container-wrapper ${collapseClass(node.collapsed, parentDir)} ${focusedId === node.id ? "dock-active" : ""} ${selected ? "dock-selected" : ""}`}
      data-dock-wrapper="true"
      data-id={node.id}
      data-dock-kind="group"
      style={{ flexGrow: node.flexGrow }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseUp={(e) => { e.stopPropagation(); setFocused(node.id); }}
    >
      <div className="lc-container" data-dir={dir}>
        {node.children.map((child, i) => (
          <Fragment key={child.id}>
            {i > 0 && (
              <Splitter
                orientation={splitterCls as "vertical" | "horizontal"}
                containerId={node.id}
                prevIdx={i - 1}
                nextIdx={i}
              />
            )}
            <DockNodeView node={child} isRoot={false} parentDir={dir} />
          </Fragment>
        ))}
      </div>
      {node.collapsed && parentDir && (
        <CollapsedDockLabel
          icon={<ContentIcon type="group" className="cl-icon-svg" />}
          label={node.label ?? `${node.type === "row" ? "ROW" : "COL"} Group`}
        />
      )}
    </div>
  );
}

function TabsView({ node, parentDir }: { node: TabsNode; parentDir?: "row" | "col" }) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeDock = useAppStore((s) => s.closeDock);
  const focusedId = useAppStore((s) => s.focusedId);
  const setFocused = useAppStore((s) => s.setFocused);
  const hoverExpand = useAppStore((s) => s.hoverExpand);
  const hoverCollapse = useAppStore((s) => s.hoverCollapse);
  const selected = useAppStore((s) => s.selectedIds.has(node.id));
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const rangeSelect = useAppStore((s) => s.rangeSelect);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const hasSelection = useAppStore((s) => s.selectedIds.size > 0);


  const isV = node.barSide === "left" || node.barSide === "right";
  const rev = node.barSide === "bottom" || node.barSide === "right";
  const flexDirection = isV ? (rev ? "row-reverse" : "row") : rev ? "column-reverse" : "column";
  const active = node.children[node.activeTab];
  const [dragOverTab, setDragOverTab] = useState<number | null>(null);
  const [tabsBarCornerOpen, setTabsBarCornerOpen] = useState(false);
  const [tabSize, setTabSize] = useState<number | null>(null);
  const reorderTab = useAppStore((s) => s.reorderTab);
  const combineTabs = useAppStore((s) => s.combineTabs);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const toggleAutoCollapse = useAppStore((s) => s.toggleAutoCollapse);
  const autoCollapseIds = useAppStore((s) => s.autoCollapseIds);

  const canCombine = (() => {
    try {
      const found = find(useAppStore.getState().layout, node.id);
      return found?.parent?.type === "tabs";
    } catch { return false; }
  })();
  const autoCollapseOn = autoCollapseIds.has(node.id);

  const RESIZE_MIN = isV ? 80 : 32;
  const RESIZE_MAX = isV ? 300 : 200;
  const onBarResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startPos = isV ? e.clientX : e.clientY;
    const firstTab = document.querySelector(".lc-tabs-bar .lc-tab") as HTMLElement;
    const startSize = isV ? (firstTab?.offsetWidth ?? 80) : (firstTab?.offsetHeight ?? 30);
    const onMove = (ev: MouseEvent) => {
      const totalD = (isV ? ev.clientX : ev.clientY) - startPos;
      const sign = (node.barSide === "left" || node.barSide === "top") ? 1 : -1;
      const newSize = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, startSize + totalD * sign));
      setTabSize(newSize);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const onTabDragStart = (i: number) => (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/tab-reorder", String(i));
    e.dataTransfer.effectAllowed = "move";
  };
  const onTabDragOver = (i: number) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("text/tab-reorder")) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverTab(i);
  };
  const onTabDrop = (i: number) => (e: React.DragEvent) => {
    const fromStr = e.dataTransfer.getData("text/tab-reorder");
    if (fromStr === "") return;
    e.preventDefault();
    e.stopPropagation();
    const from = Number(fromStr);
    setDragOverTab(null);
    if (from !== i) reorderTab(node.id, from, i);
  };

  const onDragEnd = (e: React.DragEvent) => {
    // Hook-free drag end — reads store directly, no subscription
    const st = useAppStore.getState();
    st.setDrag({ active: false, srcId: null, exceptIds: new Set(), mode: "insert" });
    // remove dragging-src class
    document.querySelectorAll(".dragging-src").forEach((el) => el.classList.remove("dragging-src"));
    setTabsBarCornerOpen(false);
  };

  const cornerPosStyle: React.CSSProperties = isV
    ? { top: 2, left: "50%", transform: "translateX(-50%)" }
    : { left: 2, top: "50%", transform: "translateY(-50%)" };
  const cornerDir = isV ? "column" : "row";

  // When collapsed, override corner direction + popup position to avoid clipping.
  // Without this, a vertical tab bar (barSide=left) uses cornerDir="column" →
  // popup extends vertically → clipped by the 34px-tall col-v strip's overflow:hidden.
  const collapsedDir: "v" | "h" | null =
    node.collapsed && parentDir === "row" ? "v" : node.collapsed && parentDir === "col" ? "h" : null;
  const effCornerDir = collapsedDir === "v" ? "column" : collapsedDir === "h" ? "row" : cornerDir;
  const popupPosStyle: React.CSSProperties = collapsedDir === "v"
    ? { top: "100%", left: 0, transform: "none" }
    : collapsedDir === "h"
      ? { top: 0, left: "100%", transform: "none" }
      : { top: isV ? "100%" : "50%", left: isV ? "50%" : "100%", transform: isV ? "translateX(-50%)" : "translateY(-50%)" };

  const barStyle: React.CSSProperties = {
    paddingLeft: isV ? 0 : 24,
    paddingTop: isV ? 24 : 0,
    ...(tabSize != null && isV ? { minWidth: 0, width: `${tabSize}px` } : {}),
    ...(tabSize != null && !isV ? { minHeight: 0, height: `${tabSize}px` } : {}),
  };

  const tabSizeStyle: React.CSSProperties = tabSize != null
    ? isV ? { width: `${tabSize}px` } : { height: `${tabSize}px` }
    : {};

  return (
    <div
      className={`lc-tabs lc-tabs-${node.barSide} corner-left ${collapseClass(node.collapsed, parentDir)} ${focusedId === node.id ? "dock-active" : ""} ${selected ? "dock-selected" : ""}`}
      data-dock-wrapper="true"
      data-id={node.id}
      data-dock-kind="tabs"
      style={{ flexGrow: node.flexGrow, flexBasis: "0%", minHeight: 0, minWidth: 0, flexDirection }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseUp={(e) => { e.stopPropagation(); setFocused(node.id); }}
      onMouseEnter={() => hoverExpand(node.id)}
      onMouseLeave={() => hoverCollapse(node.id)}
    >
      <div className="lc-tabs-bar-container" style={{ position: "relative", flex: "0 0 auto" }}>
        <div style={{ position: "absolute", ...cornerPosStyle, zIndex: 15, display: "flex", flexDirection: effCornerDir, alignItems: "center", gap: 2 }}>
          {tabsBarCornerOpen && (
            <div style={{ position: "absolute", ...popupPosStyle, display: "flex", flexDirection: effCornerDir, gap: 2, padding: 2, background: "var(--dock-card)", border: "1px solid var(--dock-border)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.4)", zIndex: 25 }}>
              {canCombine && (
                <button style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "var(--dock-bg-muted)", border: "1px solid var(--dock-border)", color: "var(--dock-fg)", cursor: "pointer", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); combineTabs(node.id); setTabsBarCornerOpen(false); }} title="Combine with parent tabs group">⧉</button>
              )}
              <button style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "var(--dock-bg-muted)", border: "1px solid var(--dock-border)", color: "var(--dock-fg)", cursor: "pointer", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); setTabsBarCornerOpen(false); }} title={node.collapsed ? "Expand" : "Collapse"}>{node.collapsed ? "+" : "−"}</button>
              <button style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: autoCollapseOn ? "color-mix(in srgb, var(--dock-ci) 15%, var(--dock-bg-muted))" : "var(--dock-bg-muted)", border: "1px solid var(--dock-border)", color: autoCollapseOn ? "var(--dock-ci)" : "var(--dock-fg)", cursor: "pointer", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); toggleAutoCollapse(node.id); }} title="Auto-collapse">◇</button>
              <button style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "var(--dock-bg-muted)", border: "1px solid var(--dock-border)", color: "#f87171", cursor: "pointer", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); closeDock(node.id); setTabsBarCornerOpen(false); }} title="Close tab group">✕</button>
            </div>
          )}
          <button style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: tabsBarCornerOpen ? "var(--dock-bg-muted)" : "rgba(0,0,0,0.4)", border: "1px solid var(--dock-border)", color: tabsBarCornerOpen ? "var(--dock-fg)" : "var(--dock-fg-muted)", cursor: "grab", fontSize: 10, opacity: tabsBarCornerOpen ? 1 : 0.6 }} draggable onDragStart={(e) => {
            // Hook-free drag start — reads store directly, defers setDrag to rAF
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", node.id);
            e.dataTransfer.effectAllowed = "move";
            const st = useAppStore.getState();
            const srcNode = find(st.layout, node.id)?.node;
            const mode = (e.shiftKey && can(srcNode, "embeddable")) ? "embed"
              : ((e.ctrlKey || e.metaKey) && can(srcNode, "tabbable")) ? "tab"
              : "insert";
            const exceptIds = computeExcludeIds(st.layout, node.id);
            const btn = e.currentTarget as HTMLElement;
            requestAnimationFrame(() => {
              st.setDrag({ active: true, srcId: node.id, exceptIds, mode });
              if (btn) {
                const wrapper = btn.closest("[data-dock-wrapper]");
                if (wrapper) wrapper.classList.add("dragging-src");
              }
            });
            setTabsBarCornerOpen(false);
          }} onDragEnd={onDragEnd} onClick={(e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { toggleSelect(node.id); return; }
            if (e.shiftKey) { rangeSelect(node.id); return; }
            if (hasSelection) clearSelection();
            setTabsBarCornerOpen(o => !o);
          }} title="Click: actions · Ctrl: multi-select · Shift: range-select · Drag: reparent">{tabsBarCornerOpen ? "✕" : "⋯"}</button>
        </div>
        <div className={`lc-tabs-bar lc-tabs-bar-${isV ? "vert" : "horiz"}`} style={barStyle}>
          {node.children.map((child, i) => {
            const is_active = i === node.activeTab;
            const drag_over = dragOverTab === i;
            const label = childLabel(child);
            const dot = childTypeDot(child);
            return (
              <div key={child.id} className={`lc-tab ${is_active ? "active" : ""} ${drag_over ? "tab-drop-target" : ""}`} style={tabSizeStyle} draggable onDragStart={onTabDragStart(i)} onDragOver={onTabDragOver(i)} onDragLeave={() => setDragOverTab(null)} onDrop={onTabDrop(i)} onClick={(e) => { if ((e.target as HTMLElement).closest(".tab-close-btn")) return; if ((e.target as HTMLElement).closest(".tab-drag-grip")) return; setActiveTab(node.id, i); }}>
                <TabGrip childId={child.id} groupId={node.id} />
                <span className={`tab-dot dot-${dot}`} />
                <span className="tab-label">{label}</span>
                <button className="tab-close-btn" onClick={(e) => { e.stopPropagation(); closeDock(child.id); }}>✕</button>
              </div>
            );
          })}
        </div>
      </div>
      <div className={`tabs-bar-resize ${isV ? "tabs-bar-resize-v" : "tabs-bar-resize-h"}`} onMouseDown={onBarResizeDown} aria-hidden />
      <div className="lc-tabs-content">
        {active && <DockNodeView node={active} isRoot={false} parentDir="col" />}
      </div>
      {/* Tabs group's DropOverlay — uses the split overlay (5×4 grid) that
          divides each edge into group-part + active-tab-part, and center
          into group-box + active-tab-box. The DropOverlay component
          detects tabs groups and renders the split layout automatically. */}
      {node.collapsed && parentDir && active && (
        <CollapsedDockLabel
          icon={
            <ContentIcon
              type={(active.type === "panel" || active.type === "embed" ? active.contentType : "group") as ContentType}
              className="cl-icon-svg"
            />
          }
          label={childLabel(active)}
        />
      )}
      <DropOverlay forId={node.id} />
    </div>
  );
}


function EmbedView({ node, parentDir }: { node: EmbedNode; parentDir?: "row" | "col" }) {
  const zones = node.zones;
  const sz = node.zoneSizes;
  const focusedId = useAppStore((s) => s.focusedId);
  const setFocused = useAppStore((s) => s.setFocused);
  const hoverExpand = useAppStore((s) => s.hoverExpand);
  const hoverCollapse = useAppStore((s) => s.hoverCollapse);
  const selected = useAppStore((s) => s.selectedIds.has(node.id));
  // embed padding — applied as `inset` on an inner wrapper so content (zones,
  // floats, bg, corner dots) is offset from the embed's outer border. The
  // DockCornerBar + DropOverlay stay outside this wrapper (pinned to the embed
  // bounds). Subscribe to rev so the view re-renders when the setting changes.
  useAppStore((s) => s.rev);
  const embedPadding = getEngine().registries.settings.get("ui.embed_padding", 0);
  const paddingStyle: React.CSSProperties =
    embedPadding > 0 ? { position: "absolute", inset: embedPadding } : { position: "absolute", inset: 0 };
  // gap between zones at intersection points (same value as embed_padding so
  // the inter-zone gaps match the outer padding). Effective sizes account for
  // collapsed zone children so siblings re-layout around a collapsed zone.
  const gap = embedPadding;
  const eff = computeEffSizes(zones, sz);

  return (
    <div
      className={`lc-embed ${collapseClass(node.collapsed, parentDir)} ${focusedId === node.id ? "dock-active" : ""} ${selected ? "dock-selected" : ""}`}
      data-dock-wrapper="true"
      data-id={node.id}
      data-dock-kind="embed"
      style={{ flexGrow: node.flexGrow }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseUp={(e) => { e.stopPropagation(); setFocused(node.id); }}
      onMouseEnter={() => hoverExpand(node.id)}
      onMouseLeave={() => hoverCollapse(node.id)}
    >
      {/* Inner wrapper carries the embed-padding inset. The DockCornerBar +
          DropOverlay + CollapsedDockLabel stay OUTSIDE this wrapper so they
          pin to the embed's outer bounds. */}
      <div className="embed-inner" style={paddingStyle}>
        <div className="embed-bg">
          <ContentIcon type={node.contentType} className="body-icon" />
          <span className="body-label">{node.label}</span>
        </div>

        {(["top", "bottom", "left", "right"] as EdgeRegion[]).map((edge) =>
          zones[edge] ? (
            <div key={edge} className={`embed-zone embed-zone-${edge}`} style={zonePosition(edge, eff, zones, gap)}>
              {/* Hide the resize handle when the zone's child is collapsed —
                  can't meaningfully resize a 34px collapsed strip. */}
              {!zones[edge]!.collapsed && <EmbedZoneResizeHandle hostId={node.id} edge={edge} />}
              {/* Pass parentDir based on the zone's strip orientation so a
                  collapsed child gets the right col-h/col-v class:
                  top/bottom = horizontal strip → parentDir "col" → col-v
                  left/right = vertical strip   → parentDir "row" → col-h */}
              <DockNodeView
                node={zones[edge]!}
                isRoot={false}
                parentDir={edge === "top" || edge === "bottom" ? "col" : "row"}
              />
            </div>
          ) : null,
        )}

        <EmbedCornerDots node={node} />

        {node.floats.map((f, i) => (
          <FloatEntryView key={`${f.node.id}-${i}`} hostId={node.id} float={f} index={i} />
        ))}
      </div>

      <DockCornerBar dockId={node.id} collapsed={node.collapsed} parentDir={parentDir} caps={nodeCaps(node)} />
      {node.collapsed && parentDir && (
        <CollapsedDockLabel
          icon={<ContentIcon type={node.contentType} className="cl-icon-svg" />}
          label={node.label}
        />
      )}
      <DropOverlay forId={node.id} />
    </div>
  );
}

/** Embed zone resize handle (one axis). */
function EmbedZoneResizeHandle({ hostId, edge }: { hostId: DockId; edge: EdgeRegion }) {
  const { domain } = getEngine();
  const sync = useAppStore((s) => s.syncFromEngine);
  const settings = getEngine().registries.settings;

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      const zoneEl = handle.parentElement; // the .embed-zone element
      const embedEl = handle.closest(".lc-embed") as HTMLElement | null;
      const start = edge === "top" || edge === "bottom" ? e.clientY : e.clientX;
      const host = domain.dockingLayout;
      const found = findEmbed(host.root, hostId);
      if (!found || found.type !== "embed") return;
      const sz = found.zoneSizes;
      const zones = found.zones;
      const key = edge === "top" ? "topH" : edge === "bottom" ? "bottomH" : edge === "left" ? "leftW" : "rightW";
      const initSize = sz[key];
      const sign = edge === "left" || edge === "top" ? 1 : -1;
      const min = settings.get("ui.embed_zone_min", 80);
      const isVertical = edge === "top" || edge === "bottom";
      const gap = settings.get("ui.embed_padding", 0);

      const onMove = (ev: MouseEvent) => {
        const totalD = (isVertical ? ev.clientY : ev.clientX) - start;
        const newSize = Math.max(min, initSize + totalD * sign);
        sz[key] = newSize;
        // reposition ALL zones in real-time so sibling zones adjust their
        // cross-axis offsets (mutual-narrowing T-shape) during the drag —
        // not only the dragged zone, preventing weird overlap/gap artifacts.
        // Uses effective sizes + gap so collapsed siblings + intersection
        // gaps are respected during the drag.
        if (embedEl) applyZonePositions(embedEl, sz, zones, gap);
        window.dispatchEvent(new CustomEvent("dock:layout-move"));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        sync();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [edge, hostId, domain, sync, settings],
  );

  return <div className={`embed-rh rh-${edge}`} onMouseDown={onDown} aria-hidden />;
}

/**
 * Apply mutual-narrowing T-shape positions to ALL zone elements in an embed
 * host, based on the current zoneSizes. Called in real-time during drags so
 * sibling zones reposition correctly (not just the dragged zone).
 *
 * Uses effective sizes (collapsed children → COLLAPSED_SIZE) + intersection
 * gap so collapsed siblings and embed_padding are respected during the drag.
 */
function applyZonePositions(
  embedEl: HTMLElement,
  sz: { topH: number; bottomH: number; leftW: number; rightW: number },
  zones: { top: DockNode | null; bottom: DockNode | null; left: DockNode | null; right: DockNode | null },
  gap: number,
) {
  const eff = computeEffSizes(zones, sz);
  const hasTop = zones.top != null;
  const hasBottom = zones.bottom != null;
  const hasLeft = zones.left != null;
  const hasRight = zones.right != null;
  const apply = (edge: EdgeRegion) => {
    const z = embedEl.querySelector(`.embed-zone-${edge}`) as HTMLElement | null;
    if (!z) return;
    switch (edge) {
      case "top":
        z.style.top = "0px";
        z.style.left = hasLeft ? `${eff.leftW + gap}px` : "0px";
        z.style.right = hasRight ? `${eff.rightW + gap}px` : "0px";
        z.style.height = `${eff.topH}px`;
        z.style.bottom = "";
        z.style.width = "";
        break;
      case "bottom":
        z.style.bottom = "0px";
        z.style.left = hasLeft ? `${eff.leftW + gap}px` : "0px";
        z.style.right = hasRight ? `${eff.rightW + gap}px` : "0px";
        z.style.height = `${eff.bottomH}px`;
        z.style.top = "";
        z.style.width = "";
        break;
      case "left":
        z.style.left = "0px";
        z.style.top = hasTop ? `${eff.topH + gap}px` : "0px";
        z.style.bottom = hasBottom ? `${eff.bottomH + gap}px` : "0px";
        z.style.width = `${eff.leftW}px`;
        z.style.right = "";
        z.style.height = "";
        break;
      case "right":
        z.style.right = "0px";
        z.style.top = hasTop ? `${eff.topH + gap}px` : "0px";
        z.style.bottom = hasBottom ? `${eff.bottomH + gap}px` : "0px";
        z.style.width = `${eff.rightW}px`;
        z.style.left = "";
        z.style.height = "";
        break;
    }
  };
  (["top", "bottom", "left", "right"] as EdgeRegion[]).forEach(apply);

  // also reposition the corner dots (2-axis intersection handles) in real-time
  applyCornerDotPositions(embedEl, sz, zones, gap);
}

/** Reposition embed corner dots based on current zone sizes (effective + gap). */
function applyCornerDotPositions(
  embedEl: HTMLElement,
  sz: { topH: number; bottomH: number; leftW: number; rightW: number },
  zones: { top: DockNode | null; bottom: DockNode | null; left: DockNode | null; right: DockNode | null },
  gap: number,
) {
  const eff = computeEffSizes(zones, sz);
  const setCorner = (name: string, edge: EdgeRegion, vedge: EdgeRegion) => {
    const dot = embedEl.querySelector(`.embed-corner-dot[data-corner="${name}"]`) as HTMLElement | null;
    if (!dot) return;
    // horizontal edge (top/bottom) sets the dot's top/bottom offset.
    // + gap shifts the dot to the inner corner of the intersection gap.
    if (edge === "top") { dot.style.top = `${eff.topH + gap}px`; dot.style.bottom = ""; }
    else { dot.style.bottom = `${eff.bottomH + gap}px`; dot.style.top = ""; }
    // vertical edge (left/right) sets the dot's left/right offset
    if (vedge === "left") { dot.style.left = `${eff.leftW + gap}px`; dot.style.right = ""; }
    else { dot.style.right = `${eff.rightW + gap}px`; dot.style.left = ""; }
  };
  if (zones.top && zones.left) setCorner("TL", "top", "left");
  if (zones.top && zones.right) setCorner("TR", "top", "right");
  if (zones.bottom && zones.left) setCorner("BL", "bottom", "left");
  if (zones.bottom && zones.right) setCorner("BR", "bottom", "right");
}

/** Corner dots for 2-axis resize of adjacent occupied zones. */
function EmbedCornerDots({ node }: { node: EmbedNode }) {
  const { domain } = getEngine();
  const sync = useAppStore((s) => s.syncFromEngine);
  const settings = getEngine().registries.settings;
  // Subscribe to rev so the dots re-render when settings (embed_padding) or
  // layout (collapse state) changes.
  useAppStore((s) => s.rev);
  const z = node.zones;
  const sz = node.zoneSizes;
  const gap = settings.get("ui.embed_padding", 0);
  const eff = computeEffSizes(z, sz);

  type Corner = { name: string; h: EdgeRegion; v: EdgeRegion; hSign: number; vSign: number; transform: string; cursor: string };
  const corners: Corner[] = [
    { name: "TL", h: "top", v: "left", hSign: 1, vSign: 1, transform: "translate(-50%,-50%)", cursor: "nwse-resize" },
    { name: "TR", h: "top", v: "right", hSign: 1, vSign: -1, transform: "translate(50%,-50%)", cursor: "nesw-resize" },
    { name: "BL", h: "bottom", v: "left", hSign: -1, vSign: 1, transform: "translate(-50%,50%)", cursor: "nesw-resize" },
    { name: "BR", h: "bottom", v: "right", hSign: -1, vSign: -1, transform: "translate(50%,50%)", cursor: "nwse-resize" },
  ];

  const onDown = (corner: Corner) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dot = e.currentTarget as HTMLElement;
    const embedEl = dot.closest(".lc-embed") as HTMLElement | null;
    const startX = e.clientX;
    const startY = e.clientY;
    const hKey = corner.h === "top" ? "topH" : "bottomH";
    const vKey = corner.v === "left" ? "leftW" : "rightW";
    const initH = sz[hKey];
    const initV = sz[vKey];
    const host = domain.dockingLayout;
    const found = findEmbed(host.root, node.id);
    if (!found || found.type !== "embed") return;
    const sz2 = found.zoneSizes;
    const zones2 = found.zones;
    const dragGap = settings.get("ui.embed_padding", 0);
    const onMove = (ev: MouseEvent) => {
      const totalDX = ev.clientX - startX;
      const totalDY = ev.clientY - startY;
      const newH = Math.max(60, initH + totalDY * corner.hSign);
      const newV = Math.max(80, initV + totalDX * corner.vSign);
      sz2[hKey] = newH;
      sz2[vKey] = newV;
      // reposition ALL zones in real-time (mutual-narrowing T-shape) so the
      // two resized zones AND their cross-axis siblings all stay aligned.
      // Uses effective sizes + gap so collapsed siblings + intersection gaps
      // are respected during the drag.
      if (embedEl) applyZonePositions(embedEl, sz2, zones2, dragGap);
      window.dispatchEvent(new CustomEvent("dock:layout-move"));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      sync();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <>
      {corners.map((c) => {
        if (!z[c.h] || !z[c.v]) return null;
        // Use effective sizes + gap so the dot sits at the inner corner of the
        // intersection gap, repositioning when a sibling zone collapses.
        const top = c.h === "top" ? eff.topH + gap : undefined;
        const bottom = c.h === "bottom" ? eff.bottomH + gap : undefined;
        const left = c.v === "left" ? eff.leftW + gap : undefined;
        const right = c.v === "right" ? eff.rightW + gap : undefined;
        const style: React.CSSProperties = { transform: c.transform, cursor: c.cursor };
        if (top != null) style.top = top;
        if (bottom != null) style.bottom = bottom;
        if (left != null) style.left = left;
        if (right != null) style.right = right;
        return (
          <div
            key={c.name}
            className="embed-corner-dot"
            data-corner={c.name}
            style={style}
            onMouseDown={onDown(c)}
            aria-hidden
          />
        );
      })}
    </>
  );
}

/** Floating panel inside an embed host — move + 8-direction resize. */
function FloatEntryView({ hostId, float, index }: { hostId: DockId; float: FloatEntry; index: number }) {
  const { domain } = getEngine();
  const sync = useAppStore((s) => s.syncFromEngine);
  const settings = getEngine().registries.settings;
  const elRef = useRef<HTMLDivElement>(null);

  const onMoveDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = float.x;
    const oy = float.y;
    // constrain movement to the parent embed host's frame
    const parent = elRef.current?.parentElement;
    const maxW = parent ? parent.clientWidth - float.w : Infinity;
    const maxH = parent ? parent.clientHeight - float.h : Infinity;
    const onMove = (ev: MouseEvent) => {
      float.x = Math.max(0, Math.min(maxW, ox + ev.clientX - startX));
      float.y = Math.max(0, Math.min(maxH, oy + ev.clientY - startY));
      if (elRef.current) {
        elRef.current.style.left = `${float.x}px`;
        elRef.current.style.top = `${float.y}px`;
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      sync();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startResize = (dir: "e" | "w" | "s" | "n" | "se" | "sw" | "ne" | "nw") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const ow = float.w;
    const oh = float.h;
    const ox = float.x;
    const oy = float.y;
    const minW = settings.get("ui.float_min_width", 140);
    const minH = settings.get("ui.float_min_height", 80);
    const dw = dir.includes("e") ? 1 : dir.includes("w") ? -1 : 0;
    const dh = dir.includes("s") ? 1 : dir.includes("n") ? -1 : 0;
    const onMove = (ev: MouseEvent) => {
      const totalDX = ev.clientX - startX;
      const totalDY = ev.clientY - startY;
      const newW = Math.max(minW, ow + totalDX * dw);
      const newH = Math.max(minH, oh + totalDY * dh);
      if (dw < 0) float.x = Math.max(0, ox + (ow - newW));
      if (dh < 0) float.y = Math.max(0, oy + (oh - newH));
      float.w = newW;
      float.h = newH;
      if (elRef.current) {
        elRef.current.style.width = `${newW}px`;
        elRef.current.style.height = `${newH}px`;
        elRef.current.style.left = `${float.x}px`;
        elRef.current.style.top = `${float.y}px`;
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      sync();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={elRef}
      className="embed-float"
      style={{ left: float.x, top: float.y, width: float.w, height: float.h }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onMouseUp={() => {
        // bring float to front — onMouseUp does NOT fire during HTML5 drags
        // (mousedown → dragstart → dragend), so this won't cancel a drag
        const parent = elRef.current?.parentElement;
        if (parent && elRef.current) parent.appendChild(elRef.current);
      }}
    >
      <div className="lc-panel-body">
        {float.node.type === "panel" ? (
          <>
            <ContentIcon type={float.node.contentType} className="body-icon" />
            <span className="body-label">{float.node.label}</span>
          </>
        ) : (
          <DockNodeView node={float.node} isRoot={false} />
        )}
      </div>
      {/* DockCornerBar with ✥ move button (repositions within parent) +
          ⋮ toggle (click → commands, hold+drag → reparent) */}
      <DockCornerBar dockId={float.node.id} collapsed={false} onMoveStart={onMoveDown} caps={nodeCaps(float.node)} />
      {(["e", "w", "s", "n", "se", "sw", "ne", "nw"] as const).map((d) => (
        <div
          key={d}
          className={`embed-float-rh float-rh-${d}`}
          onMouseDown={startResize(d)}
          aria-hidden
        />
      ))}
    </div>
  );
}

// ---------- helpers ----------

function childTypeDot(node: DockNode): string {
  return node.type === "panel" || node.type === "embed" ? node.contentType : "group";
}
function childLabel(node: DockNode): string {
  if (node.type === "panel" || node.type === "embed") return node.label;
  if (node.type === "tabs") return node.label;
  return (node.label ?? `${node.type.toUpperCase()} Group`);
}

function findEmbed(
  root: DockNode,
  id: DockId,
): DockNode | null {
  if (root.id === id) return root;
  switch (root.type) {
    case "panel": return null;
    case "row":
    case "col":
    case "tabs":
      for (const c of root.children) { const r = findEmbed(c, id); if (r) return r; }
      return null;
    case "embed":
      for (const z of Object.values(root.zones)) if (z) { const r = findEmbed(z, id); if (r) return r; }
      for (const f of root.floats) { const r = findEmbed(f.node, id); if (r) return r; }
      return null;
  }
}
