/**
 * App Engine — Persistence
 * =========================
 * `StorageBackend` trait equivalent + memory/file implementations.
 */

export interface StorageBackend {
  load(key: string): string | null;
  save(key: string, value: string): void;
  remove(key: string): void;
  exists(key: string): boolean;
  keys(): string[];
}

export class MemoryStorageBackend implements StorageBackend {
  private store = new Map<string, string>();
  load(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  save(key: string, value: string): void {
    this.store.set(key, value);
  }
  remove(key: string): void {
    this.store.delete(key);
  }
  exists(key: string): boolean {
    return this.store.has(key);
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
}

/** localStorage-backed (browser). Falls back to memory if unavailable. */
export class LocalStorageBackend implements StorageBackend {
  private available: boolean;
  constructor() {
    this.available = typeof globalThis !== "undefined" && "localStorage" in globalThis;
  }
  private k(key: string): string {
    return `appshell:${key}`;
  }
  load(key: string): string | null {
    if (!this.available) return null;
    try {
      return globalThis.localStorage.getItem(this.k(key));
    } catch {
      return null;
    }
  }
  save(key: string, value: string): void {
    if (!this.available) return;
    try {
      globalThis.localStorage.setItem(this.k(key), value);
    } catch {
      /* quota */
    }
  }
  remove(key: string): void {
    if (!this.available) return;
    try {
      globalThis.localStorage.removeItem(this.k(key));
    } catch {
      /* ignore */
    }
  }
  exists(key: string): boolean {
    return this.load(key) !== null;
  }
  keys(): string[] {
    if (!this.available) return [];
    const out: string[] = [];
    try {
      for (let i = 0; i < globalThis.localStorage.length; i++) {
        const k = globalThis.localStorage.key(i);
        if (k && k.startsWith("appshell:")) out.push(k.slice("appshell:".length));
      }
    } catch {
      /* ignore */
    }
    return out;
  }
}
