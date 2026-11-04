"use client";

import { useEffect } from "react";
import { useAppStore, getEngine, executeCommand } from "@/lib/app/store";
import { eventMatchesChord, parseChord } from "@/lib/registries/shortcut-registry";

/**
 * Global keyboard shortcut handler — reads bindings from the (user-modifiable)
 * ShortcutRegistry and dispatches the bound command. Re-reads the registry on
 * every keydown so rebindings take effect immediately.
 */
export function KeyboardShortcuts() {
  const focusedId = useAppStore((s) => s.focusedId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // don't intercept when typing in an input/textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        // allow Ctrl+K / Cmd+K to still open the palette
        if (!(e.key === "k" && (e.ctrlKey || e.metaKey))) return;
      }

      const { registries } = getEngine();
      // find a binding whose chord matches the event
      for (const binding of registries.shortcuts.all()) {
        if (eventMatchesChord(e, binding.chord)) {
          e.preventDefault();
          // some commands need the focused dock as input
          const needsTarget = ["docking.close", "docking.collapse", "docking.expand", "docking.toggle-collapse"].includes(binding.commandId);
          const data = needsTarget ? { dockId: focusedId } : undefined;
          executeCommand(binding.commandId, data);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId]);

  return null;
}
