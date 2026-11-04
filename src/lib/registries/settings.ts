/**
 * Registries — Settings (user-modifiable)
 * ========================================
 * Backed by the App Engine ConfigStore with a schema. Every property has a
 * default + is editable at runtime; changes persist via the storage backend.
 */

import { ConfigSchema, type ConfigStore } from "@/lib/app-engine/configuration";

export const SETTINGS_SCHEMA = new ConfigSchema()
  .withProperty({ name: "ui.peek_modifier_panel", description: "Modifier to reveal panel headers on hover", default: "ctrl" })
  .withProperty({ name: "ui.peek_modifier_group", description: "Modifier to reveal container/tabs/embed headers", default: "shift" })
  .withProperty({ name: "ui.drag_hints", description: "Show drag-mode hint badge during drags", default: "true" })
  .withProperty({ name: "ui.drop_overlay_blur", description: "Backdrop blur on the drop overlay (px)", default: "6" })
  .withProperty({ name: "ui.min_panel_width", description: "Minimum panel width (px)", default: "60", min: "40" })
  .withProperty({ name: "ui.min_panel_height", description: "Minimum panel height (px)", default: "60", min: "40" })
  .withProperty({ name: "ui.float_min_width", description: "Minimum floating panel width (px)", default: "140", min: "80" })
  .withProperty({ name: "ui.float_min_height", description: "Minimum floating panel height (px)", default: "80", min: "40" })
  .withProperty({ name: "ui.embed_zone_min", description: "Minimum embed zone size (px)", default: "80", min: "40" })
  .withProperty({ name: "ui.embed_padding", description: "Padding around embedded docks (px)", default: "0", min: "0" })
  .withProperty({ name: "ui.theme_id", description: "Active theme id", default: "midnight" })
  .withProperty({ name: "ui.show_dev_panel", description: "Show the developer tree-view panel", default: "true" })
  .withProperty({ name: "ui.show_connection_dots", description: "Render splitter junction connection dots", default: "true" })
  .withProperty({ name: "ui.animation_duration", description: "Transition duration (ms, 0 disables)", default: "120" })
  .withProperty({ name: "ui.font_family", description: "Application font family", default: "ui-sans-serif, system-ui, sans-serif" })
  .withProperty({ name: "ui.density", description: "Layout density (compact/normal/comfortable)", default: "normal" });

/** A typed view over the config store for the settings UI. */
export class Settings {
  constructor(private store: ConfigStore) {}

  get<T extends string | number | boolean>(key: string, fallback: T): T {
    if (typeof fallback === "boolean") return this.store.get_bool(key, fallback) as T;
    if (typeof fallback === "number") return this.store.get_number(key, fallback) as T;
    return this.store.get_string(key, String(fallback)) as T;
  }
  set(key: string, value: string | number | boolean): void {
    this.store.set(key, String(value));
  }
  reset(): void {
    this.store.reset();
  }
  get raw(): ConfigStore {
    return this.store;
  }
  /** Snapshot for the settings UI. */
  snapshot(): Record<string, string> {
    return this.store.load().toObject();
  }
}
