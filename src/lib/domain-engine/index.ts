/**
 * Domain Engine — Composition Root
 * =================================
 * Mirrors AppShell `DomainEngine`. Wraps the docking domain foundation with
 * App Engine history/transactions/events/signals, exposing `execute_docking`,
 * real undo/redo via a position-indexed ExecutedStep registry, transactions,
 * compound ops, and `restore_docking`.
 *
 * Dependency direction: Domain Engine → Domain Foundation → App Engine.
 */

import {
  applyOperation,
  cloneLayout,
  cloneNode,
  type DockingOperation,
  type DockingOutcome,
  type DockLayout,
  type DockNode,
} from "@/lib/domain-foundation/docking";
import type { DockingError } from "@/lib/domain-foundation/docking/error";
import { normalize } from "@/lib/domain-foundation/docking/normalization";
import { validate } from "@/lib/domain-foundation/docking/validation";
import {
  type AppEngine,
  type EngineRef,
} from "@/lib/app-engine";
import type { HistoryError } from "@/lib/app-engine/errors";
import { makeHistoryEntry } from "@/lib/app-engine/history";

/** A recorded step carrying the pre-tree + post-tree for real undo/redo. */
interface ExecutedDockingStep {
  operation: DockingOperation;
  outcome: DockingOutcome;
  preTree: DockNode;
  preNextId: number;
  postTree: DockNode;
  postNextId: number;
}

export type DomainError =
  | { kind: "Docking"; error: DockingError }
  | { kind: "History"; error: HistoryError };

export class DomainEngine {
  private docking: DockLayout;
  private engine: AppEngine;
  /** Position-indexed registry; Some(step) exactly when the matching history
   *  entry carries a replay step; null for non-replayable entries (restore). */
  private executedSteps: (ExecutedDockingStep | null)[] = [];

  constructor(engine: AppEngine, initial: DockLayout) {
    this.engine = engine;
    this.docking = initial;
  }

  get dockingLayout(): DockLayout {
    return this.docking;
  }

  get history() {
    return this.engine.historyStore;
  }
  get eventBus() {
    return this.engine.eventBus;
  }
  get signalBus() {
    return this.engine.signalBus;
  }
  get transactionManager() {
    return this.engine.transactionManager;
  }
  get engineRef(): EngineRef {
    return this.engine.engineRef();
  }

  /** Execute a docking operation through the canonical pipeline. */
  execute_docking(
    op: DockingOperation,
  ): { ok: true; outcome: DockingOutcome } | { ok: false; error: DomainError } {
    const preTree = cloneNode(this.docking.root);
    const preNextId = this.docking.nextId;

    const result = applyOperation(this.docking, op);
    if (!result.ok) {
      if (this.transactionManager.inTransaction()) {
        this.transactionManager.rollback();
      }
      return { ok: false, error: { kind: "Docking", error: result.error } };
    }

    const postTree = cloneNode(this.docking.root);
    const postNextId = this.docking.nextId;

    // truncate the executed-step registry to the current history position
    const cursor = this.engine.historyStore.currentPosition;
    this.executedSteps = this.executedSteps.slice(0, cursor);

    const txId = this.transactionManager.activeTransaction();
    const entry = makeHistoryEntry(result.outcome.name, {
      undoable: true,
      transactionId: txId,
      payload: op,
    });
    this.engine.historyStore.append(entry);
    this.executedSteps.push({
      operation: op,
      outcome: result.outcome,
      preTree,
      preNextId,
      postTree,
      postNextId,
    });

    this.engine.eventBus.publish({ type: result.outcome.name, payload: op });
    this.engine.signalBus.emit({ type: "docking.changed", payload: op });

    return { ok: true, outcome: result.outcome };
  }

  /**
   * Undo the last docking step (or transaction group).
   * After `historyStore.undo()` moves the cursor back to `newCursor`, the
   * step at `executedSteps[newCursor]` carries the pre-tree of the first
   * undone entry — restoring it rewinds the whole group atomically.
   */
  undo(): void {
    const result = this.engine.historyStore.undo();
    if (!("entries" in result)) return;
    const newCursor = this.engine.historyStore.currentPosition;
    const step = this.executedSteps[newCursor];
    if (step) {
      this.docking.root = cloneNode(step.preTree);
      this.docking.nextId = step.preNextId;
    }
    this.engine.signalBus.emit({ type: "docking.changed", payload: { action: "undo" } });
  }

  /** Redo the next docking step (or transaction group). */
  redo(): void {
    const cursor = this.engine.historyStore.currentPosition;
    if (cursor >= this.executedSteps.length) return;
    const result = this.engine.historyStore.redo();
    if (!("entries" in result)) return;
    const step = this.executedSteps[cursor];
    if (step) {
      this.docking.root = cloneNode(step.postTree);
      this.docking.nextId = step.postNextId;
    }
    this.engine.signalBus.emit({ type: "docking.changed", payload: { action: "redo" } });
  }

  canUndo(): boolean {
    return this.engine.historyStore.canUndo();
  }
  canRedo(): boolean {
    return this.engine.historyStore.canRedo();
  }

  // ---- transactions / compound ops ----
  beginTransaction(): number {
    return this.transactionManager.begin();
  }
  commitTransaction(): number | null {
    return this.transactionManager.commit();
  }
  rollbackTransaction(): number | null {
    const t = this.transactionManager.rollback();
    if (t != null) this.undo();
    return t;
  }
  inTransaction(): boolean {
    return this.transactionManager.inTransaction();
  }

  beginCompound(): number {
    return this.transactionManager.begin();
  }
  commitCompound(): number | null {
    return this.transactionManager.commit();
  }
  rollbackCompound(): number | null {
    return this.transactionManager.rollback();
  }

  // ---- persistence ----
  /** Restore a docking layout (validates before adopting; never repairs). */
  restore_docking(layout: DockLayout): DomainError | null {
    const candidate = cloneLayout(layout);
    normalize(candidate);
    const err = validate(candidate.root);
    if (err) return { kind: "Docking", error: err };
    this.docking = candidate;
    this.engine.historyStore.append(
      makeHistoryEntry("docking.restored", { undoable: false }),
    );
    this.executedSteps.push(null);
    this.engine.eventBus.publish({ type: "docking.restored", payload: layout });
    this.engine.signalBus.emit({ type: "docking.changed", payload: { action: "restore" } });
    return null;
  }

  mark_saved(): void {
    this.engine.configStore.set(
      "__saved_history_position__",
      String(this.engine.historyStore.currentPosition),
    );
  }

  is_dirty(): boolean {
    const saved = Number(this.engine.configStore.get("__saved_history_position__") ?? "0");
    return this.engine.historyStore.currentPosition !== saved;
  }
}
