"use client";

import { useEffect, useState } from "react";
import { useAppStore, getEngine, executeCommand } from "@/lib/app/store";
import { chordToString } from "@/lib/registries/shortcut-registry";
import type { DockId } from "@/lib/domain-foundation/docking";
import { find } from "@/lib/domain-foundation/docking/model";

interface MenuState {
  x: number;
  y: number;
  dockId: DockId | null;
}

/**
 * Context menu — appears on right-click anywhere in the docking canvas.
 * Pulls commands from the (user-modifiable) CommandRegistry + shows the bound
 * shortcut. Includes dock-specific commands (close/collapse) when a dock is
 * the right-click target.
 */
export function DockContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const layout = useAppStore((s) => s.layout);
  const { registries } = getEngine();
  const setFocused = useAppStore((s) => s.setFocused);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const wrapper = target.closest<HTMLElement>("[data-dock-wrapper]");
      const dockId = wrapper?.dataset.id ?? useAppStore.getState().focusedId;
      // only intercept if within the docking canvas
      if (!target.closest(".dock-canvas")) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, dockId });
      if (dockId) setFocused(dockId);
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".dock-context-menu")) setMenu(null);
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("mousedown", onClick);
    };
  }, [setFocused]);

  if (!menu) return null;

  const node = menu.dockId ? find(layout, menu.dockId)?.node ?? null : null;
  const isPanel = node?.type === "panel";
  const isGroup = node && (node.type === "row" || node.type === "col" || node.type === "tabs");
  const isEmbed = node?.type === "embed";
  const collapsed = node?.collapsed ?? false;

  type Item =
    | { kind: "cmd"; id: string; label: string; data?: unknown; disabled?: boolean }
    | { kind: "sep" };
  const items: Item[] = [];
  if (menu.dockId) {
    items.push({ kind: "cmd", id: "docking.toggle-collapse", label: collapsed ? "Expand" : "Collapse", data: { dockId: menu.dockId } });
    items.push({ kind: "cmd", id: "docking.close", label: "Close", data: { dockId: menu.dockId } });
    items.push({ kind: "sep" });
  }
  items.push({ kind: "cmd", id: "docking.add-panel", label: "Add Panel", data: { label: "Panel", contentType: "panel" } });
  items.push({ kind: "sep" });
  items.push({ kind: "cmd", id: "app.undo", label: "Undo", disabled: !getEngine().domain.canUndo() });
  items.push({ kind: "cmd", id: "app.redo", label: "Redo", disabled: !getEngine().domain.canRedo() });
  items.push({ kind: "sep" });
  items.push({ kind: "cmd", id: "app.command-palette.open", label: "Command Palette…" });
  items.push({ kind: "cmd", id: "app.settings.open", label: "Settings…" });
  items.push({ kind: "sep" });
  for (const t of registries.themes.all()) {
    items.push({ kind: "cmd", id: "app.set-theme", label: `Theme: ${t.name}`, data: { themeId: t.id } });
  }

  const run = (item: Extract<Item, { kind: "cmd" }>) => {
    if (item.disabled) return;
    executeCommand(item.id, item.data);
    setMenu(null);
  };

  // keep menu within viewport
  const w = 220;
  const h = items.length * 30 + 8;
  const x = Math.min(menu.x, window.innerWidth - w - 8);
  const y = Math.min(menu.y, window.innerHeight - h - 8);

  void isPanel; void isGroup; void isEmbed;

  return (
    <div
      className="dock-context-menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        width: w,
        background: "var(--dock-card)",
        border: "1px solid var(--dock-border)",
        borderRadius: 8,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        padding: 4,
        zIndex: 95,
        fontFamily: "var(--dock-font)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.kind === "sep" ? (
          <div key={i} style={{ height: 1, background: "var(--dock-border)", margin: "4px 0" }} />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => run(item)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "6px 10px",
              borderRadius: 5,
              background: "transparent",
              border: "none",
              color: item.disabled ? "var(--dock-fg-muted)" : "var(--dock-fg)",
              cursor: item.disabled ? "default" : "pointer",
              fontSize: 12,
              textAlign: "left",
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = "var(--dock-bg-muted)";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
            {(() => {
              const b = registries.shortcuts.bindingsFor(item.id)[0];
              return b ? (
                <kbd style={{ fontSize: 9, color: "var(--dock-fg-muted)", border: "1px solid var(--dock-border)", borderRadius: 3, padding: "1px 4px" }}>
                  {chordToString(b.chord)}
                </kbd>
              ) : null;
            })()}
          </button>
        ),
      )}
    </div>
  );
}
