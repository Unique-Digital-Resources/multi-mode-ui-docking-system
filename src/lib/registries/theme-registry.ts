/**
 * Registries — Theme Registry (user-modifiable)
 * ==============================================
 * Theme tokens drive both the app chrome and the docking system accents.
 * Mirrors the JS system's CSS variables (--ci/--ct/--ce for insert/tab/embed
 * accent colors, --bg/--fg/--border for chrome) but as a runtime-editable
 * registry. Users can switch themes or edit individual tokens live.
 */

export interface ThemeColors {
  /** App chrome. */
  background: string;
  backgroundAlt: string;
  backgroundMuted: string;
  foreground: string;
  foregroundMuted: string;
  border: string;
  card: string;
  /** Splitter width in px. */
  splitterWidth: number;
  /** Docking drag-mode accent colors. */
  accentInsert: string; // green — default mode
  accentTab: string; // blue — Ctrl
  accentEmbed: string; // orange — Shift
  /** Content-type dots. */
  dotChart: string;
  dotTable: string;
  dotText: string;
  dotImage: string;
  dotPanel: string;
  dotGroup: string;
  /** Header / overlay surfaces. */
  headerBackground: string;
  overlayBackground: string;
  /** Radius + misc. */
  radius: number;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  colors: ThemeColors;
}

function withAlpha(hex: string, alpha: number): string {
  // hex like #rrggbb → rgba
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DEFAULT_THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Dark neutral — default port of the JS system's dark theme.",
    colors: {
      background: "#0a0a0f",
      backgroundAlt: "#11111a",
      backgroundMuted: "#1a1a24",
      foreground: "#e6e6ef",
      foregroundMuted: "#8a8a99",
      border: "#262633",
      card: "#13131c",
      splitterWidth: 4,
      accentInsert: "#00ffa3",
      accentTab: "#6496ff",
      accentEmbed: "#ffaa40",
      dotChart: "#5ad6a0",
      dotTable: "#c084fc",
      dotText: "#fbbf24",
      dotImage: "#f87171",
      dotPanel: "#60a5fa",
      dotGroup: "#9ca3af",
      headerBackground: withAlpha("#000000", 0.35),
      overlayBackground: withAlpha("#0a0a0f", 0.88),
      radius: 8,
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Slate dark — cool greys.",
    colors: {
      background: "#0f1115",
      backgroundAlt: "#161a20",
      backgroundMuted: "#1d232b",
      foreground: "#e2e8f0",
      foregroundMuted: "#94a3b8",
      border: "#2a323d",
      card: "#161a20",
      splitterWidth: 4,
      accentInsert: "#22c55e",
      accentTab: "#3b82f6",
      accentEmbed: "#f59e0b",
      dotChart: "#34d399",
      dotTable: "#a78bfa",
      dotText: "#fbbf24",
      dotImage: "#fb7185",
      dotPanel: "#60a5fa",
      dotGroup: "#94a3b8",
      headerBackground: withAlpha("#000000", 0.35),
      overlayBackground: withAlpha("#0f1115", 0.88),
      radius: 8,
    },
  },
  {
    id: "paper",
    name: "Paper",
    description: "Light warm — for daytime.",
    colors: {
      background: "#f7f5f0",
      backgroundAlt: "#ffffff",
      backgroundMuted: "#eeebe3",
      foreground: "#1f1b16",
      foregroundMuted: "#6b6358",
      border: "#d8d2c4",
      card: "#ffffff",
      splitterWidth: 4,
      accentInsert: "#059669",
      accentTab: "#2563eb",
      accentEmbed: "#d97706",
      dotChart: "#10b981",
      dotTable: "#7c3aed",
      dotText: "#d97706",
      dotImage: "#dc2626",
      dotPanel: "#2563eb",
      dotGroup: "#6b7280",
      headerBackground: withAlpha("#ffffff", 0.7),
      overlayBackground: withAlpha("#1f1b16", 0.06),
      radius: 8,
    },
  },
  {
    id: "carmine",
    name: "Carmine",
    description: "Dark warm — red-leaning accents.",
    colors: {
      background: "#120a0d",
      backgroundAlt: "#1b1014",
      backgroundMuted: "#241419",
      foreground: "#f4e9ec",
      foregroundMuted: "#9c7d85",
      border: "#341c23",
      card: "#1b1014",
      splitterWidth: 4,
      accentInsert: "#34d399",
      accentTab: "#60a5fa",
      accentEmbed: "#fb923c",
      dotChart: "#34d399",
      dotTable: "#c084fc",
      dotText: "#fbbf24",
      dotImage: "#f87171",
      dotPanel: "#60a5fa",
      dotGroup: "#9ca3af",
      headerBackground: withAlpha("#000000", 0.35),
      overlayBackground: withAlpha("#120a0d", 0.88),
      radius: 8,
    },
  },
];

export class ThemeRegistry {
  private themes = new Map<string, Theme>();
  private activeId: string;
  /** Custom per-token overrides on top of the active theme (user edits). */
  private overrides: Partial<ThemeColors> = {};

  constructor(themes: Theme[] = DEFAULT_THEMES) {
    for (const t of themes) this.themes.set(t.id, t);
    this.activeId = themes[0]?.id ?? "midnight";
  }

  register(theme: Theme): void {
    this.themes.set(theme.id, theme);
  }

  replaceTheme(theme: Theme): void {
    this.themes.set(theme.id, theme);
    if (this.activeId === theme.id) this.overrides = {};
  }

  unregister(id: string): void {
    if (this.themes.size <= 1) return; // keep at least one
    this.themes.delete(id);
    if (this.activeId === id) this.activeId = this.themes.keys().next().value!;
  }

  set_active(id: string): boolean {
    if (!this.themes.has(id)) return false;
    this.activeId = id;
    this.overrides = {};
    return true;
  }

  get activeId(): string {
    return this.activeId;
  }

  get active(): Theme {
    return this.themes.get(this.activeId)!;
  }

  /** Effective colors = active theme + overrides. */
  get effectiveColors(): ThemeColors {
    return { ...this.active.colors, ...this.overrides };
  }

  /** Edit a single token on the active theme (user override). */
  setToken<K extends keyof ThemeColors>(key: K, value: ThemeColors[K]): void {
    this.overrides[key] = value;
  }

  resetToken<K extends keyof ThemeColors>(key: K): void {
    delete this.overrides[key];
  }

  resetOverrides(): void {
    this.overrides = {};
  }

  all(): Theme[] {
    return [...this.themes.values()];
  }

  get(id: string): Theme | null {
    return this.themes.get(id) ?? null;
  }

  get count(): number {
    return this.themes.size;
  }

  hasOverrides(): boolean {
    return Object.keys(this.overrides).length > 0;
  }

  /** Serialize overrides for persistence. */
  serializeOverrides(): { themeId: string; overrides: Partial<ThemeColors> } {
    return { themeId: this.activeId, overrides: { ...this.overrides } };
  }

  loadOverrides(data: { themeId: string; overrides: Partial<ThemeColors> }): void {
    if (this.themes.has(data.themeId)) this.activeId = data.themeId;
    this.overrides = { ...data.overrides };
  }
}
