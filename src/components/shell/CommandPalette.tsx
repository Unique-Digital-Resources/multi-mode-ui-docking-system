"use client";

import { useState, useMemo } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useAppStore, getEngine, executeCommand } from "@/lib/app/store";
import { Search } from "lucide-react";
import { chordToString } from "@/lib/registries/shortcut-registry";

/**
 * Command Palette — driven entirely by the (user-modifiable) CommandRegistry +
 * ShortcutRegistry. Fuzzy-filters command definitions; shows the bound
 * shortcut next to each entry; executes on enter.
 */
export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen);
  const setOpen = useAppStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const { registries } = getEngine();

  const commands = useMemo(() => {
    const all = registries.commands.all();
    return all
      .map((def) => ({
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category ?? "uncategorized",
        icon: def.icon,
        shortcut: registries.shortcuts.bindingsFor(def.id)[0]
          ? chordToString(registries.shortcuts.bindingsFor(def.id)[0].chord)
          : def.defaultShortcut ?? null,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [registries]);

  const grouped = useMemo(() => {
    const filtered = commands.filter(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase()) ||
        c.id.toLowerCase().includes(query.toLowerCase()),
    );
    const m = new Map<string, typeof filtered>();
    for (const c of filtered) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return [...m.entries()];
  }, [commands, query]);

  if (!open) return null;

  const run = (id: string) => {
    executeCommand(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          background: "var(--dock-card)",
          border: "1px solid var(--dock-border)",
          borderRadius: "var(--dock-radius)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <CommandPrimitive loop shouldFilter={false} className="dock-cmdk">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: "1px solid var(--dock-border)",
            }}
          >
            <Search size={16} style={{ color: "var(--dock-fg-muted)" }} />
            <CommandPrimitive.Input
              autoFocus
              placeholder="Type a command…"
              value={query}
              onValueChange={setQuery}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--dock-fg)",
                fontSize: 14,
                fontFamily: "var(--dock-font)",
              }}
            />
            <kbd style={{ fontSize: 10, color: "var(--dock-fg-muted)", border: "1px solid var(--dock-border)", borderRadius: 4, padding: "2px 5px" }}>esc</kbd>
          </div>
          <CommandPrimitive.List style={{ maxHeight: 360, overflow: "auto", padding: 6 }}>
            <CommandPrimitive.Empty style={{ padding: 16, color: "var(--dock-fg-muted)", fontSize: 13, textAlign: "center" }}>
              No commands found.
            </CommandPrimitive.Empty>
            {grouped.map(([category, items]) => (
              <CommandPrimitive.Group
                key={category}
                heading={category}
                style={{
                  color: "var(--dock-fg-muted)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "6px 4px",
                }}
              >
                {items.map((c) => (
                  <CommandPrimitive.Item
                    key={c.id}
                    value={c.id}
                    onSelect={() => run(c.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      color: "var(--dock-fg)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      <div>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--dock-fg-muted)" }}>{c.description}</div>
                    </span>
                    {c.shortcut && (
                      <kbd style={{ fontSize: 10, color: "var(--dock-fg-muted)", border: "1px solid var(--dock-border)", borderRadius: 4, padding: "2px 5px" }}>
                        {c.shortcut}
                      </kbd>
                    )}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </div>
    </div>
  );
}
