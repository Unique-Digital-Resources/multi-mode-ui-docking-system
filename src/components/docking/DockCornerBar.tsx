"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/app/store";
import { useDragSource, useDragEnd } from "./use-drag-mode";
import type { DockId, CapabilityName } from "@/lib/domain-foundation/docking";

/**
 * DockCornerBar — a small always-visible toggle at the top-right (or top-left
 * for row/col groups) corner of each dock. Clicking it reveals a compact
 * command bar containing:
 *   - a drag grip (draggable — initiates the HTML5 drag → drop overlay)
 *   - collapse toggle
 *   - auto-collapse toggle
 *   - close
 *   - capability toggles (E/T/S/R/C — embeddable/tabbable/swappable/resizable/collapsible)
 *
 * Multi-selection:
 *   - Ctrl+Click on the ⋮ toggle → toggle this dock in the multi-selection
 *   - Shift+Click on the ⋮ toggle → range-select siblings (same parent only)
 *   - plain click → clear selection + open/close the command popup
 *
 * When the dock is collapsed or narrow (< 120px), the popup switches to
 * VERTICAL so buttons stack instead of overflowing.
 */
export interface DockCaps {
  embeddable: boolean;
  tabbable: boolean;
  swappable: boolean;
  resizable: boolean;
  collapsible: boolean;
}

/** Capability toggle button metadata. */
const CAP_DEFS: { key: CapabilityName; label: string; title: string }[] = [
  { key: "embeddable", label: "E", title: "Embeddable — can be embedded into another dock" },
  { key: "tabbable", label: "T", title: "Tabbable — can be added as a tab" },
  { key: "swappable", label: "S", title: "Swappable — can be swapped (center zone)" },
  { key: "resizable", label: "R", title: "Resizable — can be resized via splitter" },
  { key: "collapsible", label: "C", title: "Collapsible — can be collapsed" },
];

export function DockCornerBar({
  dockId,
  collapsed,
  parentDir,
  onMoveStart,
  cornerSide = "right",
  caps,
}: {
  dockId: DockId;
  collapsed: boolean;
  parentDir?: "row" | "col";
  /** When provided (floats only), a ✥ move button is shown beside the toggle. */
  onMoveStart?: (e: React.MouseEvent) => void;
  /** Which corner to pin the bar to. Row/col groups use "left" so the group's
   *  toggle doesn't overlap with the first/last child's toggle (which sits at
   *  top-right). Panels/tabs/embeds/floats keep the default "right". */
  cornerSide?: "left" | "right";
  /** Current capability flags — used to show toggle state + derive movable/collapsible. */
  caps?: DockCaps;
}) {
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const closeDock = useAppStore((s) => s.closeDock);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const toggleAutoCollapse = useAppStore((s) => s.toggleAutoCollapse);
  const autoCollapseIds = useAppStore((s) => s.autoCollapseIds);
  const setCapability = useAppStore((s) => s.setCapability);
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const rangeSelect = useAppStore((s) => s.rangeSelect);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const hasSelection = useAppStore((s) => s.selectedIds.size > 0);
  // Always call useDragSource (Rules of Hooks) — we just don't USE it when
  // the dock is not movable (draggable=false, onDragStart=undefined).
  const onDragStart = useDragSource();
  const onDragEndHook = useDragEnd();
  const barRef = useRef<HTMLDivElement>(null);
  const autoCollapseOn = autoCollapseIds.has(dockId);

  // derive collapsible + movable from caps (default true when caps not provided)
  const collapsible = caps?.collapsible ?? true;
  const movable = caps ? (caps.embeddable || caps.tabbable || caps.swappable) : true;

  // collapsed orientation: "v" = vertical bar (col-h), "h" = horizontal (col-v)
  const collapsedDir: "v" | "h" | null =
    collapsed && parentDir === "row" ? "v" : collapsed && parentDir === "col" ? "h" : null;

  // Track the dock wrapper's width — when narrow (not collapsed), switch the
  // popup to vertical so buttons stack instead of overflowing the dock.
  useEffect(() => {
    if (collapsedDir) return; // collapsed state has its own direction logic
    const wrapper = barRef.current?.parentElement;
    if (!wrapper) return;
    const THRESHOLD = 120;
    const check = () => setNarrow(wrapper.clientWidth < THRESHOLD);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [collapsedDir]);

  // close the bar when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onDragEnd = (e: React.DragEvent) => {
    onDragEndHook(e);
    setOpen(false);
  };

  const hPos = cornerSide === "left" ? { left: 3 } : { right: 3 };
  const isVertical = collapsedDir === "v" || (!collapsedDir && narrow);
  const barStyle: React.CSSProperties = collapsedDir === "v"
    ? { position: "absolute", top: 3, ...hPos, zIndex: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }
    : collapsedDir === "h"
      ? { position: "absolute", top: 3, ...hPos, zIndex: 11, display: "flex", flexDirection: "row", alignItems: "center", gap: 2 }
      : { position: "absolute", top: 3, ...hPos, zIndex: 9, display: "flex", flexDirection: cornerSide === "left" ? "row-reverse" : "row", alignItems: "center", gap: 2 };

  const expandedDirection = isVertical ? "column" : cornerSide === "left" ? "row-reverse" : "row";
  // separator border: vertical line for horizontal popup, horizontal for vertical
  const sepBorder: React.CSSProperties = isVertical
    ? { borderTop: "1px solid var(--dock-border)", width: "100%", height: 0, margin: "2px 0" }
    : { borderLeft: "1px solid var(--dock-border)", height: "100%", width: 0, margin: "0 2px" };

  return (
    <div ref={barRef} className="dock-corner-bar" style={barStyle}>
      {open && (
        <div style={{ display: "flex", flexDirection: expandedDirection, alignItems: "center", gap: 2 }}>
          {movable && (
            <button
              className="dock-corner-grip"
              draggable
              onDragStart={(e) => onDragStart(e, dockId)}
              onDragEnd={onDragEnd}
              title="Drag to dock (hold Ctrl = tab mode, Shift = embed mode)"
              style={gripStyle}
            >
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <circle cx="2" cy="2" r="1.1" fill="currentColor" />
                <circle cx="8" cy="2" r="1.1" fill="currentColor" />
                <circle cx="2" cy="6" r="1.1" fill="currentColor" />
                <circle cx="8" cy="6" r="1.1" fill="currentColor" />
                <circle cx="2" cy="10" r="1.1" fill="currentColor" />
                <circle cx="8" cy="10" r="1.1" fill="currentColor" />
              </svg>
            </button>
          )}
          {collapsible && (
            <button
              className="cmd-btn dock-corner-cmd"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(dockId); setOpen(false); }}
              title={collapsed ? "Expand" : "Collapse"}
              style={cmdStyle}
            >
              {collapsed ? "+" : "−"}
            </button>
          )}
          <button
            className={`cmd-btn dock-corner-cmd ${autoCollapseOn ? "dock-corner-autocollapse-on" : ""}`}
            onClick={(e) => { e.stopPropagation(); toggleAutoCollapse(dockId); }}
            title="Auto-collapse (expand on hover, collapse on leave)"
            style={{ ...cmdStyle, color: autoCollapseOn ? "var(--dock-ci)" : undefined }}
          >
            ◇
          </button>
          <button
            className="cmd-btn dock-corner-cmd danger"
            onClick={(e) => { e.stopPropagation(); closeDock(dockId); setOpen(false); }}
            title="Close"
            style={cmdStyle}
          >
            ✕
          </button>
          {/* Capability toggles — click to flip the flag on/off. */}
          {caps && (
            <>
              <div style={sepBorder} aria-hidden />
              {CAP_DEFS.map(({ key, label, title }) => {
                const on = caps[key];
                return (
                  <button
                    key={key}
                    className={`cmd-btn dock-corner-cmd dock-corner-cap ${on ? "cap-on" : "cap-off"}`}
                    onClick={(e) => { e.stopPropagation(); setCapability(dockId, key, !on); }}
                    title={title + (on ? " (ON)" : " (OFF — click to enable)")}
                    style={{
                      ...cmdStyle,
                      fontSize: 9,
                      opacity: on ? 1 : 0.4,
                      textDecoration: on ? "none" : "line-through",
                      color: on ? "var(--dock-ci)" : "var(--dock-fg-muted)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
      {/* move button — floats only, repositions within the parent embed host */}
      {onMoveStart && (
        <button
          className="dock-corner-move"
          onMouseDown={onMoveStart}
          title="Drag to move within parent"
          style={moveStyle}
        >
          ✥
        </button>
      )}
      {/* ⋮ toggle — multi-selection via Ctrl/Shift+Click; plain click opens popup.
       *  When !movable, the toggle is non-draggable (click only). */}
      <button
        className="dock-corner-toggle"
        draggable={movable}
        onDragStart={movable ? (e) => onDragStart(e, dockId) : undefined}
        onDragEnd={onDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            toggleSelect(dockId);
            return;
          }
          if (e.shiftKey) {
            rangeSelect(dockId);
            return;
          }
          // plain click — clear selection (if any) then toggle popup
          if (hasSelection) clearSelection();
          setOpen((o) => !o);
        }}
        title={movable ? "Click: commands · Ctrl: multi-select · Shift: range-select · Drag: reparent" : "Click: commands · Ctrl: multi-select · Shift: range-select"}
        style={movable ? toggleStyle : { ...toggleStyle, cursor: "pointer" }}
      >
        {open ? "✕" : "⋮"}
      </button>
    </div>
  );
}

const toggleStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  background: "var(--dock-header-bg)",
  border: "1px solid var(--dock-border)",
  color: "var(--dock-fg-muted)",
  cursor: "grab",
  fontSize: 11,
  lineHeight: 1,
  opacity: 0.55,
  transition: "opacity 120ms ease, background 120ms ease",
};

const moveStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  background: "var(--dock-header-bg)",
  border: "1px solid var(--dock-border)",
  color: "var(--dock-fg-muted)",
  cursor: "move",
  fontSize: 11,
  lineHeight: 1,
  opacity: 0.55,
  transition: "opacity 120ms ease, background 120ms ease",
};

const gripStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  background: "var(--dock-bg-muted)",
  border: "1px solid var(--dock-border)",
  color: "var(--dock-fg)",
  cursor: "grab",
};

const cmdStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  background: "var(--dock-bg-muted)",
  border: "1px solid var(--dock-border)",
  color: "var(--dock-fg)",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
};
