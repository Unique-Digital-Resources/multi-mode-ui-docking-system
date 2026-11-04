"use client";

import { useEffect } from "react";
import { DockingRoot } from "@/components/docking/DockingRoot";
import { MenuBar } from "@/components/shell/MenuBar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { SettingsDialog } from "@/components/shell/SettingsDialog";
import { DockContextMenu } from "@/components/shell/ContextMenu";
import { KeyboardShortcuts } from "@/components/shell/KeyboardShortcuts";
import { useAppStore, getEngine } from "@/lib/app/store";

/**
 * AppShell — main page.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ MenuBar (File / Docking / View / App)   │
 *   ├─────────────────────────────────────────┤
 *   │                                         │
 *   │            DockingRoot                  │
 *   │   (recursive tree + drop overlays +     │
 *   │    splitters + connection dots +        │
 *   │    embed zones/floats + dev panel)      │
 *   │                                         │
 *   ├─────────────────────────────────────────┤
 *   │ Footer (status: layers / engine state)  │  ← sticky
 *   └─────────────────────────────────────────┘
 *
 * Overlays: CommandPalette, SettingsDialog, DockContextMenu, KeyboardShortcuts.
 */
export default function Page() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const { engine, domain, registries } = getEngine();

  // apply theme on first client render
  useEffect(() => {
    registries.applyThemeToDocument();
  }, [registries]);

  return (
    <div className="dock-root" style={{ minHeight: "100vh" }}>
      <KeyboardShortcuts />
      <MenuBar onOpenSettings={() => setSettingsOpen(true)} />
      <main style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <DockingRoot />
      </main>
      <Footer
        historyPosition={engine.historyStore.currentPosition}
        historyCount={engine.historyStore.entryCount}
        commandCount={engine.commandRegistry.size}
        themeCount={registries.themes.count}
        shortcutCount={registries.shortcuts.size}
        runtimeState={engine.runtimeState}
        isDirty={domain.is_dirty()}
      />
      <CommandPalette />
      <SettingsDialog />
      <DockContextMenu />
    </div>
  );
}

function Footer({
  historyPosition,
  historyCount,
  commandCount,
  themeCount,
  shortcutCount,
  runtimeState,
  isDirty,
}: {
  historyPosition: number;
  historyCount: number;
  commandCount: number;
  themeCount: number;
  shortcutCount: number;
  runtimeState: string;
  isDirty: boolean;
}) {
  return (
    <footer
      style={{
        flex: "0 0 auto",
        height: 32,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 14px",
        borderTop: "1px solid var(--dock-border)",
        background: "var(--dock-bg-alt)",
        color: "var(--dock-fg-muted)",
        fontSize: 10,
        fontFamily: "var(--dock-font)",
        letterSpacing: "0.02em",
      }}
    >
      <span>
        <span style={{ color: "var(--dock-ci)" }}>●</span> {runtimeState}
      </span>
      <span>history {historyPosition}/{historyCount} {isDirty && <span style={{ color: "var(--dock-ce)" }}>• unsaved</span>}</span>
      <span>commands {commandCount}</span>
      <span>shortcuts {shortcutCount}</span>
      <span>themes {themeCount}</span>
      <span style={{ marginLeft: "auto", opacity: 0.7 }}>
        App Engine · Domain Foundation · Domain Engine · Freya desktop crate in /desktop
      </span>
    </footer>
  );
}
