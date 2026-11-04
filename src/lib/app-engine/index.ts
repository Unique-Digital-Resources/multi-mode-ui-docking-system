/**
 * App Engine — Composition Root
 * ==============================
 * `AppEngine` owns and exposes subsystems (commands, tasks, config, history,
 * events, signals). Built via `Bootstrap.create()`. Mirrors AppShell's
 * `AppRuntime` / `Bootstrap`.
 */

import { CommandExecutor, CommandRegistry, type EngineRef } from "./commands";
import { TaskManager } from "./tasks";
import { ConfigStore, ConfigSchema, Preferences } from "./configuration";
import { HistoryStore, TransactionManager } from "./history";
import { EventBus, SignalBus } from "./events";
import { MemoryStorageBackend, LocalStorageBackend, type StorageBackend } from "./persistence";

export type RuntimeState = "created" | "initialized" | "running" | "stopped" | "disposed";

export class AppEngine {
  readonly commandRegistry: CommandRegistry;
  readonly commandExecutor: CommandExecutor;
  readonly taskManager: TaskManager;
  readonly configStore: ConfigStore;
  readonly preferences: Preferences;
  readonly historyStore: HistoryStore;
  readonly transactionManager: TransactionManager;
  readonly eventBus: EventBus;
  readonly signalBus: SignalBus;
  private state: RuntimeState = "created";

  constructor(opts?: {
    schema?: ConfigSchema;
    backend?: StorageBackend | null;
    maxHistory?: number;
  }) {
    const backend = opts?.backend ?? (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? new LocalStorageBackend()
      : new MemoryStorageBackend());
    this.configStore = new ConfigStore(opts?.schema ?? new ConfigSchema(), backend);
    this.preferences = new Preferences();
    this.historyStore = new HistoryStore(opts?.maxHistory ?? 1000);
    this.transactionManager = new TransactionManager();
    this.eventBus = new EventBus();
    this.signalBus = new SignalBus();
    this.commandRegistry = new CommandRegistry();
    this.commandExecutor = new CommandExecutor(this.commandRegistry);
    this.taskManager = new TaskManager();
  }

  initialize(): void {
    if (this.state !== "created") return;
    this.state = "initialized";
  }

  start(): void {
    if (this.state !== "initialized") return;
    this.state = "running";
  }

  stop(): void {
    if (this.state !== "running") return;
    this.taskManager.cancelAll();
    this.state = "stopped";
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.stop();
    this.state = "disposed";
  }

  get runtimeState(): RuntimeState {
    return this.state;
  }

  /** Capability bundle passed to command/task handlers. */
  engineRef(): EngineRef {
    return {
      eventBus: this.eventBus,
      signalBus: this.signalBus,
      configStore: this.configStore,
      preferences: this.preferences,
      historyStore: this.historyStore,
    };
  }
}

export class Bootstrap {
  static create(opts?: {
    schema?: ConfigSchema;
    backend?: StorageBackend | null;
    maxHistory?: number;
  }): AppEngine {
    const engine = new AppEngine(opts);
    engine.initialize();
    engine.start();
    return engine;
  }
}

export * from "./commands";
export * from "./tasks";
export * from "./configuration";
export * from "./history";
export * from "./events";
export * from "./persistence";
export * from "./metadata";
export * from "./errors";
