"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore, getEngine } from "@/lib/app/store";
import { DockNodeView } from "./DockNode";
import { ConnectionDots } from "./Splitter";
import { useDragMode, useGlobalDragHandlers } from "./use-drag-mode";
import { MODE_ICONS } from "./icons";
import { parseDockTree, treeToCompactString } from "./tree-parser";
import type { DockNode } from "@/lib/domain-foundation/docking";

/**
 * Top-level docking surface.
 *
 * CRITICAL: DockingRoot does NOT subscribe to `drag` state. When a drag starts
 * (setDrag during dragstart), subscribing to `drag` would re-render the ENTIRE
 * layout tree (DockNodeView → EmbedView → zone child → PanelView → DockCornerBar),
 * which cancels the HTML5 drag in some browsers. Instead, all drag-related
 * subscriptions are isolated into separate leaf components (DragModeTracker,
 * DragBadge) that render nothing or render outside the layout tree.
 */
export function DockingRoot() {
  const layout = useAppStore((s) => s.layout);
  const toast = useAppStore((s) => s.toast);
  const rev = useAppStore((s) => s.rev);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const settings = getEngine().registries.settings;
  const showDevPanel = mounted ? settings.get("ui.show_dev_panel", true) : true;

  // useDragMode + useGlobalDragHandlers are called in a separate component
  // (DragModeTracker) so their `drag` subscription doesn't re-render the layout.

  return (
    <div className="dock-canvas">
      <DragModeTracker />
      <DockNodeView node={layout} isRoot />
      <ConnectionDots />
      <DragBadge mounted={mounted} />
      {toast && <ToastView label={toast.label} mode={toast.mode} />}
      {showDevPanel && <DevPanel layout={layout} nextId={useAppStore.getState().nextId} />}
    </div>
  );
}

/** Isolated component for drag-mode hooks — subscribes to `drag` but renders
 *  nothing, so the layout tree is never re-rendered when drag state changes. */
function DragModeTracker() {
  useDragMode();
  useGlobalDragHandlers();
  return null;
}

/** Isolated mode badge — subscribes to `drag` independently. */
function DragBadge({ mounted }: { mounted: boolean }) {
  const drag = useAppStore((s) => s.drag);
  const settings = getEngine().registries.settings;
  const showBadge = mounted ? settings.get("ui.drag_hints", true) : true;
  if (!showBadge || !drag.active) return null;
  return (
    <div className={`mode-badge mode-${drag.mode} show`}>
      {MODE_ICONS[drag.mode]} {drag.mode}
    </div>
  );
}

function ToastView({ label, mode }: { label: string; mode: "insert" | "tab" | "embed" }) {
  return (
    <div className="toast show">
      <span className={`hl mode-${mode}`}>{label}</span>
    </div>
  );
}

/** Dev panel — draggable, collapsible tree-view. */
function DevPanel({ layout, nextId }: { layout: DockNode; nextId: number }) {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const settings = getEngine().registries.settings;
  const addPanel = useAppStore((s) => s.addPanel);
  const showToast = useAppStore((s) => s.showToast);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const toggleDevPanel = () => {
    const cur = settings.get("ui.show_dev_panel", true);
    settings.set("ui.show_dev_panel", !cur);
    getEngine().engine.eventBus.publish({ type: "app.settings.changed" });
  };

  useEffect(() => {
    const hdr = headerRef.current;
    const panel = panelRef.current;
    if (!hdr || !panel) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      const ox = rect.left;
      const oy = rect.top;
      const onMove = (ev: MouseEvent) => {
        panel.style.left = `${ox + ev.clientX - startX}px`;
        panel.style.top = `${oy + ev.clientY - startY}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
    hdr.addEventListener("mousedown", onDown);
    return () => hdr.removeEventListener("mousedown", onDown);
  }, []);

  const handleImport = () => {
    setImportError(null);
    try {
      const parsed = parseDockTree(importText);
      const { domain } = getEngine();
      domain.restore_docking(parsed);
      domain.mark_saved();
      showToast("tree imported", "insert");
      setShowImport(false);
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const handleExport = () => {
    const text = treeToCompactString(layout);
    setImportText(text);
    setImportError(null);
    setShowImport(true);
  };

  return (
    <div className="dev-panel" ref={panelRef}>
      <div className="dev-panel-header" ref={headerRef}>
        <span style={{ fontWeight: 600 }}>Docking Tree</span>
        <span style={{ marginLeft: "auto", color: "var(--dock-fg-muted)" }}>#{nextId}</span>
        <button className="cmd-btn" onClick={() => setShowImport((v) => !v)} title="Import / Export tree">⇄</button>
        <button className="cmd-btn" onClick={toggleDevPanel} title="Hide">✕</button>
      </div>
      <div className="dev-panel-body" ref={bodyRef}>
        {showImport && (
          <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="cmd-btn" style={{ flex: 1, height: 22, background: "var(--dock-bg-muted)", fontSize: 10 }} onClick={handleExport}>Export current</button>
              <button className="cmd-btn" style={{ flex: 1, height: 22, background: "var(--dock-ci)", color: "#000", fontSize: 10 }} onClick={handleImport}>Load pasted</button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
              placeholder={`Paste a tree here. Compact format:\ncol {\n  row {\n    panel "Chart" chart\n    panel "Table" table\n  }\n  panel "Notes" text\n}\n\n…or JSON: {"type":"col","children":[...]}\n\nCapabilities: panel "Locked" chart !resizable !collapsible`}
              style={{
                width: "100%", minHeight: 120, maxHeight: 220, resize: "vertical",
                background: "var(--dock-bg)", border: "1px solid var(--dock-border)",
                borderRadius: 4, color: "var(--dock-fg)", padding: "4px 6px",
                fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 10, lineHeight: 1.4,
              }}
            />
            {importError && (
              <div style={{ color: "#f87171", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
                ⚠ {importError}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
          <button className="cmd-btn" style={{ width: "auto", height: 24, background: "var(--dock-bg-muted)" }} onClick={() => addPanel("Chart", "chart")}>+ Chart</button>
          <button className="cmd-btn" style={{ width: "auto", height: 24, background: "var(--dock-bg-muted)" }} onClick={() => addPanel("Table", "table")}>+ Table</button>
          <button className="cmd-btn" style={{ width: "auto", height: 24, background: "var(--dock-bg-muted)" }} onClick={() => addPanel("Text", "text")}>+ Text</button>
          <button className="cmd-btn" style={{ width: "auto", height: 24, background: "var(--dock-bg-muted)" }} onClick={() => addPanel("Image", "image")}>+ Image</button>
        </div>
        <pre className="tree-view">{treeToString(layout, 0)}</pre>
      </div>
    </div>
  );
}

function treeToString(node: DockNode, depth: number): string {
  const pad = "  ".repeat(depth);
  switch (node.type) {
    case "panel":
      return `${pad}■ ${node.label} [${node.id}]${node.collapsed ? " (collapsed)" : ""}`;
    case "row":
    case "col":
      return `${pad}${node.type.toUpperCase()} ${node.label ? `[${node.label}]` : ""} [${node.id}]${node.collapsed ? " (collapsed)" : ""}\n${node.children.map((c) => treeToString(c, depth + 1)).join("\n")}`;
    case "tabs":
      return `${pad}TABS [${node.id}] (bar:${node.barSide}, active:${node.activeTab})${node.collapsed ? " (collapsed)" : ""}\n${node.children.map((c) => treeToString(c, depth + 1)).join("\n")}`;
    case "embed": {
      const lines = [`${pad}EMBED "${node.label}" [${node.id}]${node.collapsed ? " (collapsed)" : ""}`];
      for (const edge of ["top", "bottom", "left", "right"] as const) {
        const z = node.zones[edge];
        if (z) lines.push(`${pad}  ■ [${edge}] ${treeToString(z, 0).trimStart()}`);
      }
      node.floats.forEach((f, i) => {
        lines.push(`${pad}  ■ [float:${i}] ${treeToString(f.node, 0).trimStart()} @(${Math.round(f.x)},${Math.round(f.y)} ${Math.round(f.w)}×${Math.round(f.h)})`);
      });
      return lines.join("\n");
    }
  }
}
