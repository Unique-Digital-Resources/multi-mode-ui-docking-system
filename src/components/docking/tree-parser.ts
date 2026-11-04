"use client";

/**
 * Docking tree text parser + serializer.
 *
 * Supports two formats:
 *  1. JSON — the full structural representation (starts with `{`)
 *  2. Compact text — a human-readable brace format:
 *
 *     col {
 *       row {
 *         panel "Chart" chart
 *         panel "Table" table
 *       }
 *       panel "Notes" text
 *     }
 *
 *     tabs "My Tabs" top {
 *       panel "Tab 1" chart
 *       panel "Tab 2" table
 *     }
 *
 *     embed "Host" table {
 *       zone top { panel "Top" chart }
 *       zone left { panel "Left" text }
 *     }
 *
 * Capability flags can be appended to a panel after the contentType:
 *   panel "Locked" chart !resizable !collapsible
 *   panel "Pinned" text !embeddable !tabbable !swappable
 */

import type {
  DockLayout,
  DockNode,
  ContentType,
  BarSide,
  EdgeRegion,
  CapabilityName,
  ZoneSizes,
} from "@/lib/domain-foundation/docking";
import { DEFAULT_ZONE_SIZES } from "@/lib/domain-foundation/docking";

// ─── JSON parser ─────────────────────────────────────────────────────────────

interface IdCounter { n: number }
function nextId(c: IdCounter): string { return `d${++c.n}`; }

function buildNodeFromJSON(data: any, c: IdCounter): DockNode {
  if (!data || typeof data.type !== "string") throw new Error("node missing 'type'");
  const id = nextId(c);
  const flexGrow = typeof data.flexGrow === "number" ? data.flexGrow : 1;
  const minW = typeof data.minW === "number" ? data.minW : 60;
  const minH = typeof data.minH === "number" ? data.minH : 60;
  const collapsed = !!data.collapsed;
  // capability flags (optional — only set if explicitly false)
  const caps: Partial<Record<CapabilityName, boolean>> = {};
  for (const k of ["embeddable", "tabbable", "swappable", "resizable", "collapsible"] as CapabilityName[]) {
    if (data[k] === false) caps[k] = false;
  }
  const base = { id, flexGrow, minW, minH, collapsed, ...caps };

  switch (data.type) {
    case "panel":
      return {
        ...base,
        type: "panel" as const,
        label: String(data.label ?? "Panel"),
        contentType: (data.contentType ?? "panel") as ContentType,
      };
    case "row":
    case "col": {
      const children = Array.isArray(data.children)
        ? data.children.map((ch: any) => buildNodeFromJSON(ch, c))
        : [];
      return {
        ...base,
        type: data.type as "row" | "col",
        children,
        label: data.label ?? null,
        contentType: "group" as const,
      };
    }
    case "tabs": {
      const children = Array.isArray(data.children)
        ? data.children.map((ch: any) => buildNodeFromJSON(ch, c))
        : [];
      return {
        ...base,
        type: "tabs" as const,
        children,
        activeTab: typeof data.activeTab === "number" ? data.activeTab : 0,
        barSide: (data.barSide ?? "top") as BarSide,
        label: String(data.label ?? "Tab Group"),
        contentType: "group" as const,
      };
    }
    case "embed": {
      const zones = { top: null, bottom: null, left: null, right: null } as Record<EdgeRegion, DockNode | null>;
      if (data.zones) {
        for (const edge of ["top", "bottom", "left", "right"] as EdgeRegion[]) {
          if (data.zones[edge]) zones[edge] = buildNodeFromJSON(data.zones[edge], c);
        }
      }
      const floats = Array.isArray(data.floats)
        ? data.floats.map((f: any) => ({
            node: buildNodeFromJSON(f.node ?? f, c),
            x: f.x ?? 40, y: f.y ?? 40, w: f.w ?? 260, h: f.h ?? 180,
          }))
        : [];
      const zoneSizes: ZoneSizes = {
        topH: data.zoneSizes?.topH ?? DEFAULT_ZONE_SIZES.topH,
        bottomH: data.zoneSizes?.bottomH ?? DEFAULT_ZONE_SIZES.bottomH,
        leftW: data.zoneSizes?.leftW ?? DEFAULT_ZONE_SIZES.leftW,
        rightW: data.zoneSizes?.rightW ?? DEFAULT_ZONE_SIZES.rightW,
      };
      return {
        ...base,
        type: "embed" as const,
        label: String(data.label ?? "Embed"),
        contentType: (data.contentType ?? "panel") as ContentType,
        originalType: (data.originalType ?? "panel") as "panel" | "row" | "col" | "tabs",
        zones: zones as any,
        zoneSizes,
        floats,
      };
    }
    default:
      throw new Error(`unknown node type: ${data.type}`);
  }
}

function parseJSON(text: string): DockLayout {
  const data = JSON.parse(text);
  const c: IdCounter = { n: 0 };
  const root = buildNodeFromJSON(data, c);
  return { root, nextId: c.n };
}

// ─── Compact text parser ─────────────────────────────────────────────────────

interface Token {
  type: "word" | "string" | "lbrace" | "rbrace" | "bang";
  value: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "{") { tokens.push({ type: "lbrace", value: ch }); i++; continue; }
    if (ch === "}") { tokens.push({ type: "rbrace", value: ch }); i++; continue; }
    if (ch === "!") { tokens.push({ type: "bang", value: ch }); i++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = "";
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < text.length) { str += text[i + 1]; i += 2; continue; }
        str += text[i]; i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }
    // word — read until whitespace, brace, or quote
    let word = "";
    while (i < text.length && !/[\s{}"'!]/.test(text[i])) {
      word += text[i]; i++;
    }
    if (word) tokens.push({ type: "word", value: word });
  }
  return tokens;
}

class CompactParser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | null { return this.tokens[this.pos] ?? null; }
  private next(): Token | null { return this.tokens[this.pos++] ?? null; }
  private expect(type: Token["type"]): Token {
    const t = this.next();
    if (!t || t.type !== type) throw new Error(`expected ${type}, got ${t ? t.type : "EOF"}`);
    return t;
  }
  private matchWord(value: string): boolean {
    const t = this.peek();
    if (t && t.type === "word" && t.value === value) { this.pos++; return true; }
    return false;
  }

  parseNode(c: IdCounter): DockNode {
    const typeTok = this.expect("word");
    const type = typeTok.value;
    const id = nextId(c);
    const flexGrow = 1, minW = 60, minH = 60, collapsed = false;

    if (type === "panel") {
      const label = this.parseOptionalString() ?? "Panel";
      const contentType = (this.peek()?.type === "word" ? this.next()!.value : "panel") as ContentType;
      const caps = this.parseCapabilities();
      return { id, type: "panel", flexGrow, minW, minH, collapsed, label, contentType, ...caps };
    }

    if (type === "row" || type === "col") {
      const label = this.parseOptionalString();
      this.expect("lbrace");
      const children: DockNode[] = [];
      while (this.peek() && this.peek()!.type !== "rbrace") {
        children.push(this.parseNode(c));
      }
      this.expect("rbrace");
      const caps = this.parseCapabilities();
      return { id, type, flexGrow, minW, minH, collapsed, children, label: label ?? null, contentType: "group", ...caps };
    }

    if (type === "tabs") {
      const label = this.parseOptionalString() ?? "Tab Group";
      const barSide = (this.peek()?.type === "word" && ["top", "bottom", "left", "right"].includes(this.peek()!.value)
        ? this.next()!.value : "top") as BarSide;
      this.expect("lbrace");
      const children: DockNode[] = [];
      while (this.peek() && this.peek()!.type !== "rbrace") {
        children.push(this.parseNode(c));
      }
      this.expect("rbrace");
      const caps = this.parseCapabilities();
      return { id, type: "tabs", flexGrow, minW, minH, collapsed, children, activeTab: 0, barSide, label, contentType: "group", ...caps };
    }

    if (type === "embed") {
      const label = this.parseOptionalString() ?? "Embed";
      const contentType = (this.peek()?.type === "word" ? this.next()!.value : "panel") as ContentType;
      this.expect("lbrace");
      const zones = { top: null, bottom: null, left: null, right: null } as Record<EdgeRegion, DockNode | null>;
      const floats: { node: DockNode; x: number; y: number; w: number; h: number }[] = [];
      while (this.peek() && this.peek()!.type !== "rbrace") {
        if (this.matchWord("zone")) {
          const edgeTok = this.expect("word");
          const edge = edgeTok.value as EdgeRegion;
          if (!["top", "bottom", "left", "right"].includes(edge)) throw new Error(`invalid zone edge: ${edge}`);
          this.expect("lbrace");
          zones[edge] = this.parseNode(c);
          this.expect("rbrace");
        } else if (this.matchWord("float")) {
          const x = Number(this.peek()?.type === "word" ? this.next()!.value : "40");
          const y = Number(this.peek()?.type === "word" ? this.next()!.value : "40");
          const w = Number(this.peek()?.type === "word" ? this.next()!.value : "260");
          const h = Number(this.peek()?.type === "word" ? this.next()!.value : "180");
          this.expect("lbrace");
          const node = this.parseNode(c);
          this.expect("rbrace");
          floats.push({ node, x, y, w, h });
        } else {
          throw new Error(`expected 'zone' or 'float', got ${this.peek()?.value ?? "EOF"}`);
        }
      }
      this.expect("rbrace");
      const caps = this.parseCapabilities();
      return {
        id, type: "embed", flexGrow, minW, minH, collapsed, label, contentType,
        originalType: "panel" as const, zones: zones as any,
        zoneSizes: { ...DEFAULT_ZONE_SIZES }, floats, ...caps,
      };
    }

    throw new Error(`unknown node type: ${type}`);
  }

  private parseOptionalString(): string | null {
    const t = this.peek();
    if (t && t.type === "string") { this.pos++; return t.value; }
    return null;
  }

  private parseCapabilities(): Partial<Record<CapabilityName, boolean>> {
    const caps: Partial<Record<CapabilityName, boolean>> = {};
    while (this.peek()?.type === "bang") {
      this.next(); // consume !
      const name = this.expect("word").value as CapabilityName;
      if (!["embeddable", "tabbable", "swappable", "resizable", "collapsible"].includes(name)) {
        throw new Error(`unknown capability: ${name}`);
      }
      caps[name] = false;
    }
    return caps;
  }
}

function parseCompact(text: string): DockLayout {
  const tokens = tokenize(text);
  const parser = new CompactParser(tokens);
  const c: IdCounter = { n: 0 };
  const root = parser.parseNode(c);
  return { root, nextId: c.n };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse a text representation of a docking tree into a DockLayout.
 *  Auto-detects JSON (starts with `{`) vs compact format. */
export function parseDockTree(text: string): DockLayout {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty text");
  if (trimmed.startsWith("{")) {
    return parseJSON(trimmed);
  }
  return parseCompact(trimmed);
}

// ─── Compact serializer (export) ─────────────────────────────────────────────

function escapeString(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

function capsSuffix(node: DockNode): string {
  const caps: CapabilityName[] = [];
  if (node.embeddable === false) caps.push("embeddable");
  if (node.tabbable === false) caps.push("tabbable");
  if (node.swappable === false) caps.push("swappable");
  if (node.resizable === false) caps.push("resizable");
  if (node.collapsible === false) caps.push("collapsible");
  return caps.length > 0 ? " " + caps.map((c) => `!${c}`).join(" ") : "";
}

/** Serialize a docking tree to the compact text format. */
export function treeToCompactString(node: DockNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  switch (node.type) {
    case "panel":
      return `${pad}panel ${escapeString(node.label)} ${node.contentType}${capsSuffix(node)}`;
    case "row":
    case "col": {
      const label = node.label ? ` ${escapeString(node.label)}` : "";
      const caps = capsSuffix(node);
      const children = node.children.map((c) => treeToCompactString(c, depth + 1)).join("\n");
      return `${pad}${node.type}${label}${caps} {\n${children}\n${pad}}`;
    }
    case "tabs": {
      const label = ` ${escapeString(node.label)}`;
      const caps = capsSuffix(node);
      const children = node.children.map((c) => treeToCompactString(c, depth + 1)).join("\n");
      return `${pad}tabs${label} ${node.barSide}${caps} {\n${children}\n${pad}}`;
    }
    case "embed": {
      const label = ` ${escapeString(node.label)}`;
      const caps = capsSuffix(node);
      const lines: string[] = [];
      for (const edge of ["top", "bottom", "left", "right"] as EdgeRegion[]) {
        const z = node.zones[edge];
        if (z) {
          lines.push(`${pad}  zone ${edge} {`);
          lines.push(treeToCompactString(z, depth + 2));
          lines.push(`${pad}  }`);
        }
      }
      node.floats.forEach((f, i) => {
        lines.push(`${pad}  float ${Math.round(f.x)} ${Math.round(f.y)} ${Math.round(f.w)} ${Math.round(f.h)} {`);
        lines.push(treeToCompactString(f.node, depth + 2));
        lines.push(`${pad}  }`);
      });
      return `${pad}embed${label} ${node.contentType}${caps} {\n${lines.join("\n")}\n${pad}}`;
    }
  }
}
