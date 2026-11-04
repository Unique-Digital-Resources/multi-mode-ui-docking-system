/**
 * App Engine — Commands
 * ======================
 * Command registry + executor + handler trait + context + result.
 * Mirrors AppShell `app_engine/commands/`.
 *
 * Commands are fire-and-forget intents. The CommandRegistry stores
 * (definition, handler) pairs keyed by id. The CommandExecutor resolves
 * and runs them with panic isolation (try/catch).
 *
 * This is the backbone of the user-modifiable command system: the registry
 * can be added to / rebound at runtime, and keyboard shortcuts map to
 * command ids (see registries/shortcut-registry.ts).
 */

import type { CommandError } from "../errors";
import type { PayloadSchema, Version } from "../metadata";

/** Opaque command definition id (string, e.g. "docking.insert.left"). */
export type CommandDefinitionId = string;

export interface CommandDefinition {
  id: CommandDefinitionId;
  name: string;
  description: string;
  version: Version;
  inputSchema?: PayloadSchema;
  outputSchema?: PayloadSchema;
  metadata?: Record<string, string>;
  /** Category for grouping in the command palette. */
  category?: string;
  /** Default keyboard shortcut (display only — actual bindings live in ShortcutRegistry). */
  defaultShortcut?: string;
  /** Icon name (lucide). */
  icon?: string;
}

export class CommandDefinitionBuilder {
  private def: Partial<CommandDefinition> = {};
  constructor(id: string, name: string, description: string) {
    this.def = { id, name, description, version: { major: 1, minor: 0, patch: 0 } };
  }
  withVersion(v: Version): this {
    this.def.version = v;
    return this;
  }
  withInputSchema(s: PayloadSchema): this {
    this.def.inputSchema = s;
    return this;
  }
  withOutputSchema(s: PayloadSchema): this {
    this.def.outputSchema = s;
    return this;
  }
  withMetadata(k: string, v: string): this {
    this.def.metadata = { ...(this.def.metadata ?? {}), [k]: v };
    return this;
  }
  withCategory(c: string): this {
    this.def.category = c;
    return this;
  }
  withDefaultShortcut(s: string): this {
    this.def.defaultShortcut = s;
    return this;
  }
  withIcon(icon: string): this {
    this.def.icon = icon;
    return this;
  }
  build(): CommandDefinition {
    if (!this.def.id || !this.def.name || !this.def.description) {
      throw new Error("CommandDefinition requires id, name, description");
    }
    return this.def as CommandDefinition;
  }
}

export function commandDefinition(
  id: string,
  name: string,
  description: string,
): CommandDefinitionBuilder {
  return new CommandDefinitionBuilder(id, name, description);
}

/** Type-erased input (we use `unknown` instead of `Box<dyn Any>`). */
export interface CommandInput {
  data?: unknown;
  metadata?: Record<string, string>;
}
export function commandInput(data?: unknown, metadata?: Record<string, string>): CommandInput {
  return { data, metadata };
}

export interface CommandContext {
  executionId: string;
  applicationId?: string;
  sessionId?: string;
  metadata?: Record<string, string>;
}

/** Handler trait (as a TS interface). Handlers receive a capability bundle. */
export interface EngineRef {
  eventBus: import("../events").EventBus;
  signalBus: import("../events").SignalBus;
  configStore: import("../configuration").ConfigStore;
  preferences: import("../configuration").Preferences;
  historyStore: import("../history").HistoryStore;
}

export interface CommandHandler {
  execute(
    input: CommandInput,
    context: CommandContext,
    engine: EngineRef,
  ): CommandResult;
}

export interface CommandResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, string>;
}

export function success(output?: unknown): CommandResult {
  return { success: true, output };
}
export function failure(message: string): CommandResult {
  return { success: false, error: message };
}

interface RegistryEntry {
  definition: CommandDefinition;
  handler: CommandHandler;
}

export class CommandRegistry {
  private entries = new Map<CommandDefinitionId, RegistryEntry>();

  register(definition: CommandDefinition, handler: CommandHandler): CommandError | null {
    if (this.entries.has(definition.id)) {
      return { kind: "AlreadyRegistered", id: definition.id };
    }
    this.entries.set(definition.id, { definition, handler });
    return null;
  }

  /** Replace an existing handler (used for user rebinding). */
  replaceHandler(id: CommandDefinitionId, handler: CommandHandler): CommandError | null {
    const e = this.entries.get(id);
    if (!e) return { kind: "UnknownCommand", id };
    this.entries.set(id, { definition: e.definition, handler });
    return null;
  }

  unregister(id: CommandDefinitionId): void {
    this.entries.delete(id);
  }

  has(id: CommandDefinitionId): boolean {
    return this.entries.has(id);
  }

  get(id: CommandDefinitionId): RegistryEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** getDefinition — typed accessor. */
  getDefinition(id: CommandDefinitionId): CommandDefinition | null {
    return this.entries.get(id)?.definition ?? null;
  }

  getHandler(id: CommandDefinitionId): CommandHandler | null {
    return this.entries.get(id)?.handler ?? null;
  }

  all(): CommandDefinition[] {
    return [...this.entries.values()].map((e) => e.definition);
  }

  byCategory(): Map<string, CommandDefinition[]> {
    const m = new Map<string, CommandDefinition[]>();
    for (const { definition } of this.entries.values()) {
      const cat = definition.category ?? "uncategorized";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(definition);
    }
    return m;
  }

  get size(): number {
    return this.entries.size;
  }
}

export class CommandExecutor {
  constructor(private registry: CommandRegistry) {}

  execute(
    id: CommandDefinitionId,
    input: CommandInput,
    context: CommandContext,
    engine: EngineRef,
  ): CommandResult | CommandError {
    const entry = this.registry.get(id);
    if (!entry) return { kind: "UnknownCommand", id };
    try {
      return entry.handler.execute(input, context, engine);
    } catch (err) {
      return {
        kind: "ExecutionFailed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
