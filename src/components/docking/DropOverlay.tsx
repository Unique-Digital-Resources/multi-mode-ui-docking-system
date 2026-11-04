"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/app/store";
import type { DockId, DockNode, DropZone, DragMode, EdgeRegion } from "@/lib/domain-foundation/docking";
import { find } from "@/lib/domain-foundation/docking/model";

const ZONE_LABELS: Record<DragMode, Record<DropZone, string>> = {
  insert: { top: "Top", bottom: "Bottom", left: "Left", right: "Right", center: "Swap" },
  tab: { top: "Tab ↑", bottom: "Tab ↓", left: "Tab ←", right: "Tab →", center: "Tab" },
  embed: { top: "Embed ↑", bottom: "Embed ↓", left: "Embed ←", right: "Embed →", center: "Float" },
};

const ZONES: DropZone[] = ["top", "bottom", "left", "right", "center"];
const GRID: Record<DropZone, { col: number; row: number }> = {
  top: { col: 2, row: 1 }, bottom: { col: 2, row: 3 },
  left: { col: 1, row: 2 }, right: { col: 3, row: 2 }, center: { col: 2, row: 2 },
};

export function collectSubtreeIds(node: DockNode): Set<DockId> {
  const out = new Set<DockId>();
  const walk = (n: DockNode) => {
    out.add(n.id);
    if (n.type === "panel") return;
    if (n.type === "row" || n.type === "col" || n.type === "tabs") n.children.forEach(walk);
    if (n.type === "embed") { for (const z of Object.values(n.zones)) if (z) walk(z); n.floats.forEach((f) => walk(f.node)); }
  };
  walk(node); return out;
}

export function findHostId(root: DockNode, id: DockId): DockId | null {
  const walk = (n: DockNode): DockId | null => {
    if (n.type === "panel") return null;
    if (n.type === "row" || n.type === "col" || n.type === "tabs") {
      for (const c of n.children) { if (c.id === id) return null; const r = walk(c); if (r) return r; }
      return null;
    }
    if (n.type === "embed") {
      for (const z of Object.values(n.zones)) { if (z) { if (z.id === id) return n.id; const r = walk(z); if (r) return r; } }
      for (const f of n.floats) { if (f.node.id === id) return n.id; const r = walk(f.node); if (r) return r; }
      return null;
    }
    return null;
  };
  if (root.id === id) return null;
  return walk(root);
}

export function computeExcludeIds(root: DockNode, sourceId: DockId): Set<DockId> {
  function findN(n: DockNode, id: DockId): DockNode | null {
    if (n.id === id) return n;
    if (n.type === "panel") return null;
    if (n.type === "row" || n.type === "col" || n.type === "tabs") {
      for (const c of n.children) { const r = findN(c, id); if (r) return r; }
      return null;
    }
    if (n.type === "embed") {
      for (const z of Object.values(n.zones)) if (z) { const r = findN(z, id); if (r) return r; }
      for (const f of n.floats) { const r = findN(f.node, id); if (r) return r; }
      return null;
    }
    return null;
  }
  const found = findN(root, sourceId);
  if (!found) return new Set([sourceId]);
  return collectSubtreeIds(found);
}

function getActiveTabId(layout: DockNode, groupId: DockId): DockId | null {
  let cur = groupId;
  for (let g = 0; g < 64; g++) {
    const f = find(layout, cur);
    if (!f || f.node.type !== "tabs") break;
    if (f.node.children.length === 0 || f.node.activeTab >= f.node.children.length) break;
    cur = f.node.children[f.node.activeTab].id;
  }
  return cur !== groupId ? cur : null;
}

function isTabsGroup(layout: DockNode, id: DockId): boolean {
  const f = find(layout, id);
  return f?.node.type === "tabs";
}

function isEmbedHost(layout: DockNode, id: DockId): boolean {
  const f = find(layout, id);
  return f?.node.type === "embed";
}

function getZoneDockId(layout: DockNode, embedId: DockId, edge: EdgeRegion): DockId | null {
  const f = find(layout, embedId);
  if (!f || f.node.type !== "embed") return null;
  return f.node.zones[edge]?.id ?? null;
}

export function DropOverlay({ forId }: { forId: DockId }) {
  const drag = useAppStore((s) => s.drag);
  const dispatchDrop = useAppStore((s) => s.dispatchDrop);
  const layout = useAppStore((s) => s.layout);
  const active = drag.active && !drag.exceptIds.has(forId);
  const mode = drag.mode;
  const labels = useMemo(() => ZONE_LABELS[mode], [mode]);
  const isTabs = isTabsGroup(layout, forId);
  const activeTabId = isTabs ? getActiveTabId(layout, forId) : null;
  const isEmbed = isEmbedHost(layout, forId);
  const occupiedMap: Partial<Record<EdgeRegion, DockId>> = {};
  if (isEmbed) {
    for (const edge of ["top", "bottom", "left", "right"] as EdgeRegion[]) {
      const dockId = getZoneDockId(layout, forId, edge);
      if (dockId) occupiedMap[edge] = dockId;
    }
  }
  const hasOccupied = Object.keys(occupiedMap).length > 0;

  if (!active) return <div className="lc-drop-overlay" data-for={forId} data-mode={mode} />;

  const onDrop = (zone: DropZone, targetId: DockId) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (drag.srcId) dispatchDrop(drag.srcId, targetId, zone, drag.mode);
  };
  const onEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const ov = e.currentTarget.closest(".lc-drop-overlay");
    if (ov) ov.querySelectorAll(".lc-dz.drag-over").forEach((el) => el.classList.remove("drag-over"));
    e.currentTarget.classList.add("drag-over");
  };
  const onOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onLeave = (e: React.DragEvent) => {
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    e.currentTarget.classList.remove("drag-over");
  };

  // Standard 3×3 overlay for regular docks (and embed hosts without occupied zones)
  if ((!isTabs || !activeTabId) && !(isEmbed && hasOccupied)) {
    return (
      <div className="lc-drop-overlay active" data-for={forId} data-mode={mode}>
        {ZONES.map((zone) => {
          const { col, row } = GRID[zone];
          return (
            <div key={zone} className={`lc-dz dz-${zone}`} data-zone={zone}
              style={{ gridColumn: col, gridRow: row }}
              onDragEnter={onEnter} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop(zone, forId)}>
              <div className="dz-inner"><span className="dz-lbl">{labels[zone]}</span></div>
            </div>
          );
        })}
        {[1, 3].flatMap((r) => [1, 3].map((c) => (
          <div key={`c${r}${c}`} className="dz-corner" style={{ gridColumn: c, gridRow: r }} />
        )))}
      </div>
    );
  }

  // ═══ Embed host with occupied zones — inner mini 3×3 overlay ═══
  if (isEmbed && hasOccupied) {
    return (
      <div className="lc-drop-overlay active lc-embed-split-overlay" data-for={forId} data-mode={mode}>
        {ZONES.map((zone) => {
          const { col, row } = GRID[zone];
          const edge = zone as EdgeRegion;
          const occupiedDockId = occupiedMap[edge];
          // Only show inner mini grid if the occupied dock is NOT the drag source
          // (dropping on the source's own inner grid → source===target → IneligibleDock)
          if (occupiedDockId && zone !== "center" && !drag.exceptIds.has(occupiedDockId)) {
            return (
              <div key={zone} className={`lc-dz dz-${zone} dz-occupied`} data-zone={zone}
                style={{ gridColumn: col, gridRow: row, position: "relative" }}
                onDragEnter={onEnter} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop(zone, forId)}>
                <div className="dz-inner"><span className="dz-lbl">{labels[zone]}</span></div>
                <div className="dz-inner-grid"
                  style={{ position: "absolute", inset: "22%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr 1fr", gap: 1, zIndex: 2 }}>
                  {ZONES.map((innerZone) => {
                    const { col: ic, row: ir } = GRID[innerZone];
                    return (
                      <div key={innerZone} className={`lc-dz dz-inner-${innerZone}`} data-zone={innerZone} data-target={occupiedDockId}
                        style={{ gridColumn: ic, gridRow: ir, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onDragEnter={onEnter} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop(innerZone, occupiedDockId)}>
                        <div className="dz-inner" style={{ position: "absolute", inset: "2px" }}>
                          <span className="dz-lbl">{labels[innerZone]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div key={zone} className={`lc-dz dz-${zone}`} data-zone={zone}
              style={{ gridColumn: col, gridRow: row }}
              onDragEnter={onEnter} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop(zone, forId)}>
              <div className="dz-inner"><span className="dz-lbl">{labels[zone]}</span></div>
            </div>
          );
        })}
        {[1, 3].flatMap((r) => [1, 3].map((c) => (
          <div key={`c${r}${c}`} className="dz-corner" style={{ gridColumn: c, gridRow: r }} />
        )))}
      </div>
    );
  }

  // ═══ Tabs group split overlay ═══
  const sdz = (key: string, cls: string, zone: DropZone, targetId: DockId, label: string) => (
    <div key={key} className={`lc-dz ${cls}`} data-zone={zone} data-target={targetId}
      style={{ flex: "1 1 0", minHeight: 0, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", pointerEvents: "auto" }}
      onDragEnter={onEnter} onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop(zone, targetId)}>
      <div className="dz-inner" style={{ position: "absolute", inset: "4px" }}>
        <span className="dz-lbl">{label}</span>
      </div>
    </div>
  );

  return (
    <div className="lc-drop-overlay active lc-tabs-split-overlay" data-for={forId} data-mode={mode}
      style={{ gridTemplateColumns: "min(64px,22%) 1fr min(64px,22%)", gridTemplateRows: "min(32px,11%) min(32px,11%) 1fr min(32px,11%) min(32px,11%)" }}>
      {sdz("tg", "dz-top-group", "top", forId, labels.top)}
      {sdz("ta", "dz-top-active", "top", activeTabId, labels.top)}
      <div key="left" style={{ gridColumn: 1, gridRow: 3, display: "flex", flexDirection: "row", minHeight: 0 }}>
        {sdz("lg", "dz-left-group", "left", forId, labels.left)}
        {sdz("la", "dz-left-active", "left", activeTabId, labels.left)}
      </div>
      <div key="ctr" style={{ gridColumn: 2, gridRow: 3, position: "relative", display: "flex" }}>
        {sdz("cg", "dz-center-group", "center", forId, labels.center)}
        <div style={{ position: "absolute", inset: "20%", zIndex: 2, display: "flex" }}>
          {sdz("ca", "dz-center-active", "center", activeTabId, labels.center)}
        </div>
      </div>
      <div key="right" style={{ gridColumn: 3, gridRow: 3, display: "flex", flexDirection: "row", minHeight: 0 }}>
        {sdz("ra", "dz-right-active", "right", activeTabId, labels.right)}
        {sdz("rg", "dz-right-group", "right", forId, labels.right)}
      </div>
      {sdz("ba", "dz-bottom-active", "bottom", activeTabId, labels.bottom)}
      {sdz("bg", "dz-bottom-group", "bottom", forId, labels.bottom)}
      <div key="c11" className="dz-corner" style={{ gridColumn: 1, gridRow: 1 }} />
      <div key="c21" className="dz-corner" style={{ gridColumn: 1, gridRow: 2 }} />
      <div key="c31" className="dz-corner" style={{ gridColumn: 3, gridRow: 1 }} />
      <div key="c32" className="dz-corner" style={{ gridColumn: 3, gridRow: 2 }} />
      <div key="c14" className="dz-corner" style={{ gridColumn: 1, gridRow: 4 }} />
      <div key="c15" className="dz-corner" style={{ gridColumn: 1, gridRow: 5 }} />
      <div key="c34" className="dz-corner" style={{ gridColumn: 3, gridRow: 4 }} />
      <div key="c35" className="dz-corner" style={{ gridColumn: 3, gridRow: 5 }} />
    </div>
  );
}
