/**
 * App Engine — Events & Signals
 * ==============================
 * `EventBus` (one-to-many, past occurrence, priority) + `SignalBus`
 * (lightweight, thread-safe-ish via simple maps). Handlers are panic-isolated
 * (try/catch) so a throwing handler never breaks dispatch.
 */

export type EventPriority = "high" | "normal" | "low";

export interface Event {
  type: string;
  payload?: unknown;
  priority?: EventPriority;
}

export type EventHandler = (event: Event) => void;

interface Subscription {
  id: number;
  eventType: string;
  handler: EventHandler;
  priority: EventPriority;
}

let handlerSubId = 0;

export class EventBus {
  private subs: Subscription[] = [];

  subscribe(eventType: string, handler: EventHandler, priority: EventPriority = "normal"): number {
    const id = ++handlerSubId;
    this.subs.push({ id, eventType, handler, priority });
    // keep high-priority first
    this.subs.sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
    return id;
  }

  unsubscribe(id: number): void {
    this.subs = this.subs.filter((s) => s.id !== id);
  }

  publish(event: Event): void {
    for (const s of this.subs) {
      if (s.eventType === event.type || s.eventType === "*") {
        try {
          s.handler(event);
        } catch {
          // panic isolation — swallow handler errors
        }
      }
    }
  }

  get handlerCount(): number {
    return this.subs.length;
  }
}

export interface Signal {
  type: string;
  payload?: unknown;
}

export type SignalCallback = (signal: Signal) => void;

let signalSubId = 0;

export class SignalBus {
  private subs = new Map<string, Map<number, SignalCallback>>();

  subscribe(type: string, cb: SignalCallback): number {
    const id = ++signalSubId;
    if (!this.subs.has(type)) this.subs.set(type, new Map());
    this.subs.get(type)!.set(id, cb);
    return id;
  }

  unsubscribe(id: number): void {
    for (const m of this.subs.values()) {
      if (m.delete(id)) return;
    }
  }

  emit(signal: Signal): void {
    const m = this.subs.get(signal.type);
    if (!m) return;
    for (const cb of m.values()) {
      try {
        cb(signal);
      } catch {
        // panic isolation
      }
    }
  }

  get subscriberCount(): number {
    let n = 0;
    for (const m of this.subs.values()) n += m.size;
    return n;
  }
}
