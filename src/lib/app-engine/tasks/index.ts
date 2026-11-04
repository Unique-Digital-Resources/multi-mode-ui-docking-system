/**
 * App Engine — Tasks
 * ===================
 * Lean task manager (lifecycle Pending→Running→Completed/Failed/Cancelled,
 * cancellation tokens, progress channel). Mirrors AppShell `app_engine/tasks/`.
 * Tasks are managed work instances with progress + cancellation (unlike
 * fire-and-forget commands).
 */

import type { TaskError } from "../errors";
import type { PayloadSchema } from "../metadata";
import type { CommandInput, EngineRef } from "../commands";

export type TaskDefinitionId = string;

export interface TaskDefinition {
  id: TaskDefinitionId;
  name: string;
  description: string;
  supportsPause: boolean;
  supportsCancel: boolean;
  inputSchema?: PayloadSchema;
  outputSchema?: PayloadSchema;
  category?: string;
}

export type TaskState =
  | "pending"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export interface TaskContext {
  executionId: string;
  taskId: string;
  cancellationToken: CancellationToken;
  outputChannel: TaskOutputChannel;
  metadata?: Record<string, string>;
}

export interface TaskResult {
  status: "completed" | "cancelled" | "failed";
  output?: unknown;
  error?: string;
  metadata?: Record<string, string>;
}

export interface TaskHandler {
  execute(input: CommandInput, context: TaskContext, engine: EngineRef): TaskResult;
}

/** Atomic cancellation flag. */
export class CancellationToken {
  private cancelled = false;
  cancel(): void {
    this.cancelled = true;
  }
  get isCancelled(): boolean {
    return this.cancelled;
  }
}

/** Progress + streaming output channel. */
export class TaskOutputChannel {
  private progressValue = 0;
  private outputs: unknown[] = [];
  onProgress?: (value: number) => void;
  onOutput?: (data: unknown) => void;

  progress(value: number): void {
    this.progressValue = value;
    this.onProgress?.(value);
  }
  get currentProgress(): number {
    return this.progressValue;
  }
  push(data: unknown): void {
    this.outputs.push(data);
    this.onOutput?.(data);
  }
  get outputs(): unknown[] {
    return [...this.outputs];
  }
}

interface TaskRecord {
  id: string;
  definitionId: TaskDefinitionId;
  state: TaskState;
  input: CommandInput;
  context: TaskContext;
}

let taskIdCounter = 0;

export class TaskManager {
  private defs = new Map<TaskDefinitionId, { def: TaskDefinition; handler: TaskHandler }>();
  private tasks = new Map<string, TaskRecord>();

  register(def: TaskDefinition, handler: TaskHandler): TaskError | null {
    if (this.defs.has(def.id)) {
      return { kind: "UnknownTask", id: def.id };
    }
    this.defs.set(def.id, { def, handler });
    return null;
  }

  create(definitionId: TaskDefinitionId, input: CommandInput): string | TaskError {
    const entry = this.defs.get(definitionId);
    if (!entry) return { kind: "UnknownTask", id: definitionId };
    const id = `t${++taskIdCounter}`;
    const context: TaskContext = {
      executionId: `exec-${id}`,
      taskId: id,
      cancellationToken: new CancellationToken(),
      outputChannel: new TaskOutputChannel(),
    };
    this.tasks.set(id, {
      id,
      definitionId,
      state: "pending",
      input,
      context,
    });
    return id;
  }

  start(id: string, engine: EngineRef): TaskResult | TaskError {
    const t = this.tasks.get(id);
    if (!t) return { kind: "UnknownTask", id };
    if (t.state !== "pending") return { kind: "InvalidState", id, state: t.state };
    const entry = this.defs.get(t.definitionId);
    if (!entry) return { kind: "UnknownTask", id: t.definitionId };
    t.state = "running";
    try {
      const result = entry.handler.execute(t.input, t.context, engine);
      t.state =
        result.status === "completed"
          ? "completed"
          : result.status === "cancelled"
            ? "cancelled"
            : "failed";
      return result;
    } catch (err) {
      t.state = "failed";
      return {
        kind: "TaskFailed",
        id,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  cancel(id: string): void {
    const t = this.tasks.get(id);
    if (!t) return;
    if (!t.context.cancellationToken) return;
    t.context.cancellationToken.cancel();
    if (t.state === "running" || t.state === "paused") t.state = "cancelled";
  }

  cancelAll(): string[] {
    const ids: string[] = [];
    for (const [id] of this.tasks) {
      this.cancel(id);
      ids.push(id);
    }
    return ids;
  }

  getState(id: string): TaskState | null {
    return this.tasks.get(id)?.state ?? null;
  }

  remove(id: string): void {
    this.tasks.delete(id);
  }

  get count(): number {
    return this.tasks.size;
  }
}
