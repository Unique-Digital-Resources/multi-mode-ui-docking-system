/**
 * App Engine — History
 * =====================
 * `HistoryStore` with position cursor + transaction batching.
 * Mirrors AppShell `app_engine/history/`. Appends truncate the redo tail;
 * transactions undo/redo as a unit.
 */

import type { HistoryError } from "../errors";

export interface HistoryEntry {
  id: number;
  name: string;
  undoable: boolean;
  transactionId: number | null;
  /** Optional opaque payload (e.g. the operation that produced this entry). */
  payload?: unknown;
}

let entryIdCounter = 0;

export function makeHistoryEntry(name: string, opts?: { undoable?: boolean; transactionId?: number | null; payload?: unknown }): HistoryEntry {
  return {
    id: ++entryIdCounter,
    name,
    undoable: opts?.undoable ?? true,
    transactionId: opts?.transactionId ?? null,
    payload: opts?.payload,
  };
}

export interface UndoResult { entries: HistoryEntry[] }
export interface RedoResult { entries: HistoryEntry[] }

export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private position = 0;
  private maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  append(entry: HistoryEntry): void {
    // truncate redo tail
    this.entries = this.entries.slice(0, this.position);
    this.entries.push(entry);
    if (this.entries.length > this.maxHistory) {
      const overflow = this.entries.length - this.maxHistory;
      this.entries.splice(0, overflow);
    }
    this.position = this.entries.length;
  }

  get(id: number): HistoryEntry | null {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  current(): HistoryEntry | null {
    return this.position > 0 ? this.entries[this.position - 1] ?? null : null;
  }

  list(): HistoryEntry[] {
    return [...this.entries];
  }

  active(): HistoryEntry[] {
    return this.entries.slice(0, this.position);
  }

  undo(): UndoResult | HistoryError {
    if (this.position === 0) return { kind: "NothingToUndo" };
    // gather transaction group (if the current entry has a transactionId)
    const txId = this.entries[this.position - 1].transactionId;
    const undone: HistoryEntry[] = [];
    while (this.position > 0) {
      const e = this.entries[this.position - 1];
      if (txId != null && e.transactionId !== txId) break;
      if (txId == null && undone.length >= 1) break;
      this.position -= 1;
      undone.push(e);
    }
    return { entries: undone };
  }

  redo(): RedoResult | HistoryError {
    if (this.position >= this.entries.length) return { kind: "NothingToRedo" };
    const txId = this.entries[this.position].transactionId;
    const redone: HistoryEntry[] = [];
    while (this.position < this.entries.length) {
      const e = this.entries[this.position];
      if (txId != null && e.transactionId !== txId) break;
      if (txId == null && redone.length >= 1) break;
      this.position += 1;
      redone.push(e);
    }
    return { entries: redone };
  }

  replay(): HistoryEntry[] {
    return this.entries.slice(0, this.position);
  }

  get currentPosition(): number {
    return this.position;
  }
  get entryCount(): number {
    return this.entries.length;
  }
  get activeCount(): number {
    return this.position;
  }
  canUndo(): boolean {
    return this.position > 0;
  }
  canRedo(): boolean {
    return this.position < this.entries.length;
  }
  clear(): void {
    this.entries = [];
    this.position = 0;
  }
  removeTransaction(txId: number): void {
    this.entries = this.entries.filter((e) => e.transactionId !== txId);
    if (this.position > this.entries.length) this.position = this.entries.length;
  }
}

/** Transaction manager — depth-counted for compound operations. */
export class TransactionManager {
  private current: number | null = null;
  private depth = 0;
  private counter = 0;

  begin(): number {
    if (this.depth === 0) {
      this.current = ++this.counter;
    }
    this.depth += 1;
    return this.current;
  }
  commit(): number | null {
    if (this.depth === 0) return null;
    this.depth -= 1;
    if (this.depth === 0) {
      const t = this.current;
      this.current = null;
      return t;
    }
    return this.current;
  }
  rollback(): number | null {
    if (this.depth === 0) return null;
    this.depth -= 1;
    if (this.depth === 0) {
      const t = this.current;
      this.current = null;
      return t;
    }
    return this.current;
  }
  inTransaction(): boolean {
    return this.depth > 0;
  }
  activeTransaction(): number | null {
    return this.current;
  }
}
