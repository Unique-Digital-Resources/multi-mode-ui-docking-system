/**
 * Registries — Command bootstrap
 * ===============================
 * Registers all docking + shell commands with the App Engine CommandRegistry
 * and binds default keyboard shortcuts. Both registries are user-modifiable
 * at runtime (rebind handlers, rebind shortcuts, add custom commands).
 *
 * Handlers capture the DomainEngine + Registries bundle as closures — this
 * deviates slightly from AppShell's strict EngineRef boundary but is the
 * pragmatic single-process TS equivalent.
 */

import { commandDefinition } from "@/lib/app-engine/commands";
import type { CommandHandler, CommandInput, CommandResult } from "@/lib/app-engine/commands";
import type { AppEngine } from "@/lib/app-engine";
import type { DomainEngine } from "@/lib/domain-engine";
import {
  type DockingOperation,
  type DropZone,
  type DockId,
  type ContentType,
} from "@/lib/domain-foundation/docking";
import { find } from "@/lib/domain-foundation/docking/model";
import { ShortcutRegistry } from "./shortcut-registry";
import { ThemeRegistry } from "./theme-registry";
import { Settings, SETTINGS_SCHEMA } from "./settings";
import { ConfigStore } from "@/lib/app-engine/configuration";
import { LocalStorageBackend } from "@/lib/app-engine/persistence";

/** Bundle of all user-modifiable registries. */
export class Registries {
  readonly shortcuts: ShortcutRegistry;
  readonly themes: ThemeRegistry;
  readonly settings: Settings;

  constructor(
    private appEngine: AppEngine,
    private domainEngine: DomainEngine,
  ) {
    this.shortcuts = new ShortcutRegistry();
    this.themes = new ThemeRegistry();
    // settings live in their own ConfigStore (separate schema) for clarity
    const settingsStore = new ConfigStore(SETTINGS_SCHEMA, new LocalStorageBackend());
    this.settings = new Settings(settingsStore);
    // sync theme id from settings → theme registry on load
    const tid = this.settings.get("ui.theme_id", "midnight");
    this.themes.set_active(tid);
  }

  get commands() {
    return this.appEngine.commandRegistry;
  }

  /** Apply theme token overrides from the theme registry into CSS variables. */
  applyThemeToDocument(): void {
    if (typeof document === "undefined") return;
    const c = this.themes.effectiveColors;
    const root = document.documentElement;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set("--dock-bg", c.background);
    set("--dock-bg-alt", c.backgroundAlt);
    set("--dock-bg-muted", c.backgroundMuted);
    set("--dock-fg", c.foreground);
    set("--dock-fg-muted", c.foregroundMuted);
    set("--dock-border", c.border);
    set("--dock-card", c.card);
    set("--dock-spl", `${c.splitterWidth}px`);
    set("--dock-ci", c.accentInsert);
    set("--dock-ct", c.accentTab);
    set("--dock-ce", c.accentEmbed);
    set("--dock-dot-chart", c.dotChart);
    set("--dock-dot-table", c.dotTable);
    set("--dock-dot-text", c.dotText);
    set("--dock-dot-image", c.dotImage);
    set("--dock-dot-panel", c.dotPanel);
    set("--dock-dot-group", c.dotGroup);
    set("--dock-header-bg", c.headerBackground);
    set("--dock-overlay-bg", c.overlayBackground);
    set("--dock-radius", `${c.radius}px`);
    set("--dock-anim", `${this.settings.get("ui.animation_duration", 120)}ms`);
    set("--dock-font", this.settings.get("ui.font_family", "ui-sans-serif, system-ui, sans-serif"));
  }
}

// ---------- command input shapes ----------

export interface DropInput {
  sourceId: DockId;
  targetId: DockId;
  zone: DropZone;
}
export interface AddPanelInput {
  label: string;
  contentType: ContentType;
}
export interface DockTargetInput {
  dockId: DockId;
}
export interface ActiveTabInput {
  groupId: DockId;
  index: number;
}
export interface ThemeInput {
  themeId: string;
}

function asDrop(data: unknown): DropInput {
  return data as DropInput;
}
function asAddPanel(data: unknown): AddPanelInput {
  return data as AddPanelInput;
}
function asDockTarget(data: unknown): DockTargetInput {
  return data as DockTargetInput;
}
function asActiveTab(data: unknown): ActiveTabInput {
  return data as ActiveTabInput;
}
function asTheme(data: unknown): ThemeInput {
  return data as ThemeInput;
}

// ---------- handler factory ----------

/**
 * Build the full command set bound to a DomainEngine + Registries bundle.
 * Each handler returns a CommandResult; docking commands also emit a toast
 * signal the UI subscribes to.
 */
export function createCommandHandlers(
  domain: DomainEngine,
  registries: Registries,
): Record<string, CommandHandler> {
  const drop = (mode: DockingOperation["type"]): CommandHandler => ({
    execute(input: CommandInput): CommandResult {
      const { sourceId, targetId, zone } = asDrop(input.data);
      const op = ({
        Insert: { type: "Insert", source: { kind: "existing", id: sourceId }, target: targetId, zone },
        Tab: { type: "Tab", source: { kind: "existing", id: sourceId }, target: targetId, zone },
        Embed: { type: "Embed", source: { kind: "existing", id: sourceId }, target: targetId, zone },
      } as const)[mode as "Insert" | "Tab" | "Embed"] as DockingOperation;
      const r = domain.execute_docking(op);
      if (!r.ok) return { success: false, error: JSON.stringify(r.error) };
      domain.eventBus.publish({ type: "app.toast", payload: { label: r.outcome.label, mode } });
      return { success: true, output: r.outcome };
    },
  });

  return {
    // ---- docking structural commands ----
    "docking.insert": drop("Insert"),
    "docking.tab": drop("Tab"),
    "docking.embed": drop("Embed"),
    "docking.close": {
      execute(input: CommandInput): CommandResult {
        const { dockId } = asDockTarget(input.data);
        const r = domain.execute_docking({ type: "Close", dock: dockId });
        return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
      },
    },
    "docking.collapse": {
      execute(input: CommandInput): CommandResult {
        const { dockId } = asDockTarget(input.data);
        const r = domain.execute_docking({ type: "SetCollapsed", dock: dockId, collapsed: true });
        return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
      },
    },
    "docking.expand": {
      execute(input: CommandInput): CommandResult {
        const { dockId } = asDockTarget(input.data);
        const r = domain.execute_docking({ type: "SetCollapsed", dock: dockId, collapsed: false });
        return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
      },
    },
    "docking.toggle-collapse": {
      execute(input: CommandInput): CommandResult {
        const { dockId } = asDockTarget(input.data);
        const node = findNode(domain, dockId);
        if (!node) return { success: false, error: "not found" };
        const r = domain.execute_docking({ type: "SetCollapsed", dock: dockId, collapsed: !node.collapsed });
        return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
      },
    },
    "docking.set-active-tab": {
      execute(input: CommandInput): CommandResult {
        const { groupId, index } = asActiveTab(input.data);
        const r = domain.execute_docking({ type: "SetActiveTab", group: groupId, index });
        return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
      },
    },
    "docking.add-panel": {
      execute(input: CommandInput): CommandResult {
        const { label, contentType } = asAddPanel(input.data);
        // insert a new panel as a child of the root container
        const root = domain.dockingLayout.root;
        if (root.type === "row" || root.type === "col") {
          const op: DockingOperation = {
            type: "Insert",
            source: { kind: "new-panel", label, contentType },
            target: root.children[root.children.length - 1]?.id ?? root.id,
            zone: "right",
          };
          const r = domain.execute_docking(op);
          return r.ok ? { success: true } : { success: false, error: JSON.stringify(r.error) };
        }
        return { success: false, error: "root is not a container" };
      },
    },

    // ---- app / shell commands ----
    "app.undo": {
      execute(): CommandResult {
        if (!domain.canUndo()) return { success: false, error: "nothing to undo" };
        domain.undo();
        return { success: true };
      },
    },
    "app.redo": {
      execute(): CommandResult {
        if (!domain.canRedo()) return { success: false, error: "nothing to redo" };
        domain.redo();
        return { success: true };
      },
    },
    "app.command-palette.open": {
      execute(): CommandResult {
        domain.eventBus.publish({ type: "app.command-palette.open" });
        return { success: true };
      },
    },
    "app.settings.open": {
      execute(): CommandResult {
        domain.eventBus.publish({ type: "app.settings.open" });
        return { success: true };
      },
    },
    "app.toggle-dev-panel": {
      execute(): CommandResult {
        const cur = registries.settings.get("ui.show_dev_panel", true);
        registries.settings.set("ui.show_dev_panel", !cur);
        domain.eventBus.publish({ type: "app.settings.changed" });
        return { success: true };
      },
    },
    "app.toggle-theme": {
      execute(): CommandResult {
        const all = registries.themes.all();
        const idx = all.findIndex((t) => t.id === registries.themes.activeId);
        const next = all[(idx + 1) % all.length];
        registries.themes.set_active(next.id);
        registries.settings.set("ui.theme_id", next.id);
        registries.applyThemeToDocument();
        domain.eventBus.publish({ type: "app.toast", payload: { label: `theme: ${next.name}`, mode: "insert" } });
        return { success: true };
      },
    },
    "app.set-theme": {
      execute(input: CommandInput): CommandResult {
        const { themeId } = asTheme(input.data);
        if (!registries.themes.set_active(themeId)) return { success: false, error: "unknown theme" };
        registries.settings.set("ui.theme_id", themeId);
        registries.applyThemeToDocument();
        domain.eventBus.publish({ type: "app.toast", payload: { label: `theme: ${registries.themes.active.name}`, mode: "insert" } });
        return { success: true };
      },
    },
    "app.reset-layout": {
      execute(): CommandResult {
        domain.eventBus.publish({ type: "app.reset-layout" });
        return { success: true };
      },
    },
  };
}

function findNode(domain: DomainEngine, id: DockId) {
  const r = find(domain.dockingLayout.root, id);
  return r?.node ?? null;
}

// ---------- definitions ----------

export interface CommandSpec {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultShortcut?: string;
  icon?: string;
}

export const COMMAND_SPECS: CommandSpec[] = [
  // docking
  { id: "docking.insert", name: "Insert Panel", description: "Dock source beside target (split)", category: "Docking", icon: "split" },
  { id: "docking.tab", name: "Tab Join", description: "Join source into target's tab group", category: "Docking", icon: "layers" },
  { id: "docking.embed", name: "Embed", description: "Embed source into host's zone or float", category: "Docking", icon: "square-stack" },
  { id: "docking.close", name: "Close Dock", description: "Close the focused dock", category: "Docking", defaultShortcut: "Ctrl+W", icon: "x" },
  { id: "docking.collapse", name: "Collapse Dock", description: "Collapse the focused dock", category: "Docking", icon: "minimize-2" },
  { id: "docking.expand", name: "Expand Dock", description: "Expand the focused dock", category: "Docking", icon: "maximize-2" },
  { id: "docking.toggle-collapse", name: "Toggle Collapse", description: "Toggle collapse on the focused dock", category: "Docking", icon: "chevrons-up-down" },
  { id: "docking.set-active-tab", name: "Set Active Tab", description: "Switch the active tab in a group", category: "Docking" },
  { id: "docking.add-panel", name: "Add Panel", description: "Add a new panel to the layout", category: "Docking", defaultShortcut: "Ctrl+N", icon: "plus" },
  // app
  { id: "app.undo", name: "Undo", description: "Undo the last docking change", category: "App", defaultShortcut: "Ctrl+Z", icon: "undo" },
  { id: "app.redo", name: "Redo", description: "Redo the next docking change", category: "App", defaultShortcut: "Ctrl+Shift+Z", icon: "redo" },
  { id: "app.command-palette.open", name: "Open Command Palette", description: "Open the command palette", category: "App", defaultShortcut: "Ctrl+K", icon: "search" },
  { id: "app.settings.open", name: "Open Settings", description: "Open the settings dialog", category: "App", defaultShortcut: "Ctrl+,", icon: "settings" },
  { id: "app.toggle-dev-panel", name: "Toggle Dev Panel", description: "Show or hide the tree-view dev panel", category: "App", icon: "panel-right" },
  { id: "app.toggle-theme", name: "Toggle Theme", description: "Cycle to the next theme", category: "App", icon: "palette" },
  { id: "app.set-theme", name: "Set Theme", description: "Switch to a specific theme", category: "App" },
  { id: "app.reset-layout", name: "Reset Layout", description: "Restore the default docking layout", category: "App", icon: "rotate-ccw" },
];

/** Register all default commands + shortcuts. */
export function registerDefaultCommands(
  appEngine: AppEngine,
  domain: DomainEngine,
  registries: Registries,
): void {
  const handlers = createCommandHandlers(domain, registries);
  for (const spec of COMMAND_SPECS) {
    const def = commandDefinition(spec.id, spec.name, spec.description)
      .withCategory(spec.category)
      .withIcon(spec.icon ?? "circle")
      .build();
    if (spec.defaultShortcut) def.defaultShortcut = spec.defaultShortcut;
    if (appEngine.commandRegistry.has(spec.id)) {
      appEngine.commandRegistry.replaceHandler(spec.id, handlers[spec.id]);
    } else {
      appEngine.commandRegistry.register(def, handlers[spec.id]);
    }
  }
  // bind default shortcuts
  for (const spec of COMMAND_SPECS) {
    if (spec.defaultShortcut) {
      registries.shortcuts.unbind(spec.defaultShortcut);
      registries.shortcuts.bind(spec.defaultShortcut, spec.id);
    }
  }
}

export * from "./shortcut-registry";
export * from "./theme-registry";
export * from "./settings";
