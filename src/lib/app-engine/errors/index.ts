/**
 * App Engine — Errors
 * ====================
 * Consolidated error types mirroring AppShell's per-subsystem errors.
 */

export type CommandError =
  | { kind: "UnknownCommand"; id: string }
  | { kind: "AlreadyRegistered"; id: string }
  | { kind: "InvalidArguments"; message: string }
  | { kind: "ExecutionFailed"; message: string };

export type TaskError =
  | { kind: "UnknownTask"; id: string }
  | { kind: "InvalidState"; id: string; state: string }
  | { kind: "TaskFailed"; id: string; message: string }
  | { kind: "TaskCancelled"; id: string };

export type ConfigurationError =
  | { kind: "MissingRequired"; key: string }
  | { kind: "OutOfRange"; key: string; value: string; min?: string; max?: string }
  | { kind: "BackendError"; message: string };

export type HistoryError =
  | { kind: "NothingToUndo" }
  | { kind: "NothingToRedo" }
  | { kind: "EntryNotFound"; id: string }
  | { kind: "TransactionNotFound"; id: string };

export type EngineError =
  | { kind: "Command"; error: CommandError }
  | { kind: "Task"; error: TaskError }
  | { kind: "Configuration"; error: ConfigurationError }
  | { kind: "History"; error: HistoryError }
  | { kind: "NotInitialized" }
  | { kind: "AlreadyDisposed" };

export function commandErrorToString(e: CommandError): string {
  switch (e.kind) {
    case "UnknownCommand": return `unknown command: ${e.id}`;
    case "AlreadyRegistered": return `command already registered: ${e.id}`;
    case "InvalidArguments": return `invalid arguments: ${e.message}`;
    case "ExecutionFailed": return `execution failed: ${e.message}`;
  }
}
