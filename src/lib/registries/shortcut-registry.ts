/**
 * Registries — Shortcut Registry (user-modifiable)
 * =================================================
 * Maps keyboard chords → command definition ids. Users can rebind at runtime.
 * Mirrors the AppShell convention that commands + their keyboard shortcuts
 * live in user-modifiable registries/configs.
 */

export interface KeyChord {
  /** Lowercase key, e.g. "k", "p", "z", "enter". */
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export function chordToString(c: KeyChord): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.meta) parts.push("Cmd");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  parts.push(c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return parts.join("+");
}

export function chordEquals(a: KeyChord, b: KeyChord): boolean {
  return (
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

export interface ShortcutBinding {
  chord: KeyChord;
  commandId: string;
  /** Optional human label override. */
  label?: string;
}

/** Parse a shortcut spec like "Ctrl+K", "Cmd+Shift+P", "ctrl+z". */
export function parseChord(spec: string): KeyChord {
  const parts = spec.toLowerCase().split("+").map((p) => p.trim());
  const c: KeyChord = { key: "", ctrl: false, meta: false, shift: false, alt: false };
  for (const p of parts) {
    if (p === "ctrl" || p === "control") c.ctrl = true;
    else if (p === "cmd" || p === "meta" || p === "command") c.meta = true;
    else if (p === "alt" || p === "option" || p === "opt") c.alt = true;
    else if (p === "shift") c.shift = true;
    else c.key = p;
  }
  return c;
}

export class ShortcutRegistry {
  private bindings: ShortcutBinding[] = [];

  /** Bind (or rebind) a chord → command. Returns the previous binding if displaced. */
  bind(chord: KeyChord | string, commandId: string, label?: string): ShortcutBinding | null {
    const c = typeof chord === "string" ? parseChord(chord) : chord;
    const prevIndex = this.bindings.findIndex((b) => chordEquals(b.chord, c));
    let prev: ShortcutBinding | null = null;
    if (prevIndex >= 0) {
      prev = this.bindings[prevIndex];
      this.bindings.splice(prevIndex, 1);
    }
    this.bindings.push({ chord: c, commandId, label });
    return prev;
  }

  unbind(chord: KeyChord | string): boolean {
    const c = typeof chord === "string" ? parseChord(chord) : chord;
    const i = this.bindings.findIndex((b) => chordEquals(b.chord, c));
    if (i < 0) return false;
    this.bindings.splice(i, 1);
    return true;
  }

  /** Remove all bindings for a command id. */
  unbindCommand(commandId: string): number {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter((b) => b.commandId !== commandId);
    return before - this.bindings.length;
  }

  /** Look up the command id for a chord. */
  lookup(chord: KeyChord): string | null {
    const b = this.bindings.find((b) => chordEquals(b.chord, chord));
    return b?.commandId ?? null;
  }

  /** All bindings for a command id (a command can have multiple shortcuts). */
  bindingsFor(commandId: string): ShortcutBinding[] {
    return this.bindings.filter((b) => b.commandId === commandId);
  }

  all(): ShortcutBinding[] {
    return [...this.bindings];
  }

  get size(): number {
    return this.bindings.length;
  }

  /** Export as a plain object for persistence / settings UI. */
  toObject(): Record<string, { commandId: string; label?: string }> {
    const out: Record<string, { commandId: string; label?: string }> = {};
    for (const b of this.bindings) {
      out[chordToString(b.chord)] = { commandId: b.commandId, label: b.label };
    }
    return out;
  }

  /** Import from a plain object (replaces all bindings). */
  loadFromObject(obj: Record<string, { commandId: string; label?: string }>): void {
    this.bindings = [];
    for (const [spec, info] of Object.entries(obj)) {
      this.bindings.push({ chord: parseChord(spec), commandId: info.commandId, label: info.label });
    }
  }
}

/** Match a browser KeyboardEvent against a chord (platform-aware: Cmd on mac, Ctrl elsewhere). */
export function eventMatchesChord(e: KeyboardEvent, c: KeyChord): boolean {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");
  const meta = isMac ? e.metaKey : e.ctrlKey;
  const ctrl = isMac ? false : e.ctrlKey; // on mac treat ctrlKey separately
  // accept either ctrl or meta mapping when the chord uses ctrl (cross-platform default)
  const chordCtrl = c.ctrl || c.meta;
  const eventCtrl = e.ctrlKey || e.metaKey;
  return (
    e.key.toLowerCase() === c.key &&
    eventCtrl === chordCtrl &&
    e.shiftKey === c.shift &&
    e.altKey === c.alt &&
    (!c.meta || meta)
  );
  void ctrl;
}
