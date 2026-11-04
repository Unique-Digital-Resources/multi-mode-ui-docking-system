/**
 * App Engine — Configuration
 * ===========================
 * `Config` (kv store) + `ConfigSchema` (rules) + `ConfigStore`
 * (thread-safe, persistence-ready, change-notifying) + `Preferences`
 * (user-facing runtime settings). Mirrors AppShell `configuration/`.
 *
 * The ConfigStore is the backbone of the user-modifiable registries:
 * commands, keyboard shortcuts, themes, and settings all flow through it.
 */

import type { ConfigurationError } from "../errors";
import type { StorageBackend } from "../persistence";

export class Config {
  private values = new Map<string, string>();
  constructor(init?: Record<string, string>) {
    if (init) for (const [k, v] of Object.entries(init)) this.values.set(k, v);
  }
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  get_string(key: string, fallback = ""): string {
    return this.values.get(key) ?? fallback;
  }
  get_bool(key: string, fallback = false): boolean {
    const v = this.values.get(key);
    if (v == null) return fallback;
    return v === "true" || v === "1";
  }
  get_number(key: string, fallback = 0): number {
    const v = this.values.get(key);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
  contains(key: string): boolean {
    return this.values.has(key);
  }
  keys(): string[] {
    return [...this.values.keys()];
  }
  get size(): number {
    return this.values.size;
  }
  toObject(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}

export interface ConfigPropertyDefinition {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
  min?: string;
  max?: string;
}

export class ConfigSchema {
  private properties = new Map<string, ConfigPropertyDefinition>();
  withProperty(def: ConfigPropertyDefinition): this {
    this.properties.set(def.name, def);
    return this;
  }
  define(def: ConfigPropertyDefinition): this {
    return this.withProperty(def);
  }
  get(name: string): ConfigPropertyDefinition | null {
    return this.properties.get(name) ?? null;
  }
  contains(name: string): boolean {
    return this.properties.has(name);
  }
  propertyNames(): string[] {
    return [...this.properties.keys()];
  }
  get count(): number {
    return this.properties.size;
  }
  /** Build a Config from all default values. */
  defaults(): Config {
    const c = new Config();
    for (const def of this.properties.values()) {
      if (def.default != null) c.set(def.name, def.default);
    }
    return c;
  }
  validate(config: Config): ConfigurationError | null {
    for (const def of this.properties.values()) {
      const value = config.get(def.name);
      if (def.required && value == null) {
        return { kind: "MissingRequired", key: def.name };
      }
      if (value != null && def.min != null) {
        if (Number(value) < Number(def.min)) {
          return { kind: "OutOfRange", key: def.name, value, min: def.min };
        }
      }
      if (value != null && def.max != null) {
        if (Number(value) > Number(def.max)) {
          return { kind: "OutOfRange", key: def.name, value, max: def.max };
        }
      }
    }
    return null;
  }
}

export type ConfigChangeCallback = (
  key: string,
  oldValue: string | null,
  newValue: string | null,
) => void;

export class ConfigStore {
  private config: Config;
  private schema: ConfigSchema;
  private backend: StorageBackend | null;
  private onChanged: ConfigChangeCallback | null = null;

  constructor(schema: ConfigSchema, backend: StorageBackend | null = null) {
    this.schema = schema;
    this.backend = backend;
    this.config = schema.defaults();
    if (backend) this.reloadFromBackend();
  }

  reloadFromBackend(): void {
    if (!this.backend) return;
    for (const key of this.schema.propertyNames()) {
      if (this.backend.exists(key)) {
        this.config.set(key, this.backend.load(key)!);
      }
    }
  }

  load(): Config {
    // return a clone so callers can't mutate internal state directly
    return new Config(this.config.toObject());
  }

  save(config: Config): ConfigurationError | null {
    const err = this.schema.validate(config);
    if (err) return err;
    const old = this.load();
    this.config = new Config(config.toObject());
    if (this.backend) {
      for (const key of this.config.keys()) {
        this.backend.save(key, this.config.get(key)!);
      }
    }
    this.notifyChanges(old, this.config);
    return null;
  }

  get(key: string): string | null {
    return this.config.get(key);
  }
  get_string(key: string, fallback?: string): string {
    return this.config.get_string(key, fallback);
  }
  get_bool(key: string, fallback?: boolean): boolean {
    return this.config.get_bool(key, fallback);
  }
  get_number(key: string, fallback?: number): number {
    return this.config.get_number(key, fallback);
  }

  set(key: string, value: string): ConfigurationError | null {
    const def = this.schema.get(key);
    if (def) {
      if (def.required && value == null) {
        return { kind: "MissingRequired", key };
      }
      if (def.min != null && Number(value) < Number(def.min)) {
        return { kind: "OutOfRange", key, value, min: def.min };
      }
      if (def.max != null && Number(value) > Number(def.max)) {
        return { kind: "OutOfRange", key, value, max: def.max };
      }
    }
    const oldValue = this.config.get(key);
    this.config.set(key, value);
    if (this.backend) this.backend.save(key, value);
    if (this.onChanged) this.onChanged(key, oldValue, value);
    return null;
  }

  remove(key: string): string | null {
    const oldValue = this.config.get(key);
    this.config.remove(key);
    if (this.backend) this.backend.remove(key);
    if (this.onChanged) this.onChanged(key, oldValue, null);
    return oldValue;
  }

  reset(): void {
    const old = this.load();
    this.config = this.schema.defaults();
    if (this.backend) {
      for (const key of this.backend.keys()) this.backend.remove(key);
      this.reloadFromBackend();
    }
    this.notifyChanges(old, this.config);
  }

  validate(config: Config): ConfigurationError | null {
    return this.schema.validate(config);
  }

  get schemaName(): ConfigSchema {
    return this.schema;
  }
  contains(key: string): boolean {
    return this.config.contains(key);
  }
  get keyCount(): number {
    return this.config.size;
  }
  get hasBackend(): boolean {
    return this.backend != null;
  }
  on_changed(cb: ConfigChangeCallback): void {
    this.onChanged = cb;
  }

  private notifyChanges(old: Config, next: Config): void {
    if (!this.onChanged) return;
    const allKeys = new Set([...old.keys(), ...next.keys()]);
    for (const key of allKeys) {
      const o = old.get(key);
      const n = next.get(key);
      if (o !== n) this.onChanged(key, o, n);
    }
  }
}

/** User-facing preferences (theme, language, etc.). In-memory only. */
export class Preferences {
  private values = new Map<string, string>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  get_string(key: string, fallback = ""): string {
    return this.values.get(key) ?? fallback;
  }
  get_bool(key: string, fallback = false): boolean {
    const v = this.values.get(key);
    if (v == null) return fallback;
    return v === "true" || v === "1";
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
  contains(key: string): boolean {
    return this.values.has(key);
  }
  keys(): string[] {
    return [...this.values.keys()];
  }
  get size(): number {
    return this.values.size;
  }
  get isEmpty(): boolean {
    return this.values.size === 0;
  }
  clear(): void {
    this.values.clear();
  }
  toObject(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}
