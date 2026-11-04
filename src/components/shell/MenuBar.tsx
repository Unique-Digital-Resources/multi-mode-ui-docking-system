"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore, getEngine, executeCommand } from "@/lib/app/store";
import { chordToString } from "@/lib/registries/shortcut-registry";
import type { CommandDefinition } from "@/lib/app-engine/commands";
import { ChevronDown } from "lucide-react";

/**
 * Top menu bar — pulls commands from the (user-modifiable) CommandRegistry,
 * grouped by category. Each menu item shows its bound shortcut. Selecting an
 * item executes the command.
 *
 * Menu structure mirrors the categories the registry exposes:
 *   File | Docking | View | App
 * (categories are remapped to friendly menu labels below)
 */
const CATEGORY_LABEL: Record<string, string> = {
  Docking: "Docking",
  App: "App",
};

export function MenuBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { registries } = getEngine();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const byCategory = registries.commands.byCategory();
  const menus = [...byCategory.entries()].map(([cat, defs]) => ({
    label: CATEGORY_LABEL[cat] ?? cat,
    category: cat,
    items: defs,
  }));

  // inject a "View" pseudo-menu for theme + settings
  const viewItems: (CommandDefinition & { _isView?: boolean })[] = [
    {
      id: "view.settings",
      name: "Settings…",
      description: "Open the settings dialog",
      version: { major: 1, minor: 0, patch: 0 },
      category: "View",
      icon: "settings",
      defaultShortcut: "Ctrl+,",
    },
    ...registries.themes.all().map((t) => ({
      id: `theme.${t.id}`,
      name: `Theme: ${t.name}`,
      description: t.description ?? "",
      version: { major: 1, minor: 0, patch: 0 },
      category: "View",
      icon: "palette",
    })),
  ];
  menus.push({ label: "View", category: "View", items: viewItems });

  const runItem = (def: CommandDefinition & { _isView?: boolean }) => {
    setOpenMenu(null);
    if (def.id === "view.settings") {
      onOpenSettings();
      return;
    }
    if (def.id.startsWith("theme.")) {
      executeCommand("app.set-theme", { themeId: def.id.slice("theme.".length) });
      return;
    }
    executeCommand(def.id, dockCommandData(def.id));
  };

  /** Dock-targeting commands receive the focused dock's id as input. */
  function dockCommandData(commandId: string): unknown {
    const targets = ["docking.close", "docking.collapse", "docking.expand", "docking.toggle-collapse"];
    if (targets.includes(commandId)) {
      const fid = useAppStore.getState().focusedId;
      return fid ? { dockId: fid } : undefined;
    }
    return undefined;
  }

  return (
    <div
      ref={barRef}
      className="dock-menubar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 36,
        padding: "0 8px",
        borderBottom: "1px solid var(--dock-border)",
        background: "var(--dock-bg-alt)",
        color: "var(--dock-fg)",
        fontSize: 12,
        fontFamily: "var(--dock-font)",
        userSelect: "none",
        flex: "0 0 auto",
      }}
    >
      <span style={{ fontWeight: 600, marginRight: 12, letterSpacing: "0.04em" }}>AppShell</span>
      {menus.map((m) => (
        <div key={m.label} style={{ position: "relative" }}>
          <button
            className="dock-menu-trigger"
            onClick={() => setOpenMenu(openMenu === m.label ? null : m.label)}
            onMouseEnter={() => openMenu && setOpenMenu(m.label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 6,
              background: openMenu === m.label ? "var(--dock-bg-muted)" : "transparent",
              border: "none",
              color: "var(--dock-fg)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {m.label}
            <ChevronDown size={12} style={{ opacity: 0.5 }} />
          </button>
          {openMenu === m.label && (
            <div
              className="dock-menu-popover"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                minWidth: 220,
                marginTop: 2,
                background: "var(--dock-card)",
                border: "1px solid var(--dock-border)",
                borderRadius: 8,
                boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                padding: 4,
                zIndex: 90,
              }}
            >
              {m.items.map((def) => {
                const sc = registries.shortcuts.bindingsFor(def.id)[0];
                return (
                  <button
                    key={def.id}
                    className="dock-menu-item"
                    onClick={() => runItem(def)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      background: "transparent",
                      border: "none",
                      color: "var(--dock-fg)",
                      cursor: "pointer",
                      fontSize: 12,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--dock-bg-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ flex: 1 }}>
                      <div>{def.name}</div>
                      {def.description && (
                        <div style={{ fontSize: 10, color: "var(--dock-fg-muted)" }}>{def.description}</div>
                      )}
                    </span>
                    {sc && (
                      <kbd style={{ fontSize: 10, color: "var(--dock-fg-muted)", border: "1px solid var(--dock-border)", borderRadius: 4, padding: "1px 5px" }}>
                        {chordToString(sc.chord)}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, color: "var(--dock-fg-muted)" }}>
        <button
          className="cmd-btn"
          style={{ width: "auto", padding: "0 10px", height: 26 }}
          onClick={() => useAppStore.getState().setPaletteOpen(true)}
          title="Command palette (Ctrl+K)"
        >
          ⌘K Command palette
        </button>
      </div>
    </div>
  );
}
