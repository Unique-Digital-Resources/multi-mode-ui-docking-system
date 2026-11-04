/**
 * Docking Domain Foundation — Type Model
 * =======================================
 *
 * Headless docking-layout tree model. Ported 1-1 from
 * `multi-mode-ui-docking-system` (the active tree-based system) and reshaped
 * to follow AppShell's domain-foundation conventions:
 *   - Stable, opaque identity (counter-issued string ids).
 *   - Operations are value-type discriminated unions with `apply(layout)`.
 *   - Outcomes carry inverse data for undo.
 *   - Whole-layout validation + deterministic normalization.
 *   - NO DOM, CSS, pointer input, rendering, or windowing lives here.
 *
 * Node categories (mirrors the JS system exactly):
 *   panel  — leaf work surface (chart/table/text/image/...)
 *   row    — horizontal split container
 *   col    — vertical split container
 *   tabs   — tab group (one active child rendered)
 *   embed  — a promoted panel/tabs that hosts overlay edge zones + floats
 *
 * AppShell reference: src/domain_foundation/environments/docking/{model,dock,slot}.rs
 * JS reference: js/trees.js (makePanel/makeContainer/makeTabs/promoteToEmbed)
 */

export type ContentType =
  | "chart"
  | "table"
  | "text"
  | "image"
  | "panel"
  | "group";

export type BarSide = "top" | "bottom" | "left" | "right";

/** Edge region of an embed host. Maps 1-1 to AppShell `EdgeRegion`. */
export type EdgeRegion = "top" | "bottom" | "left" | "right";

/** Drop zone on the 3x3 overlay grid. */
export type DropZone = "top" | "bottom" | "left" | "right" | "center";

/** Drag mode — switched live via modifier keys (default/Ctrl/Shift). */
export type DragMode = "insert" | "tab" | "embed";

/** Opaque dock id. Issued from a monotonic counter; never renumbered. */
export type DockId = string;

export interface ZoneSizes {
  topH: number;
  bottomH: number;
  leftW: number;
  rightW: number;
}

export interface FloatEntry {
  node: DockNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zones {
  top: DockNode | null;
  bottom: DockNode | null;
  left: DockNode | null;
  right: DockNode | null;
}

interface BaseNode {
  /** Stable opaque id, e.g. "d1". */
  id: DockId;
  /** Flex share of the slot (stored verbatim — never renormalized). */
  flexGrow: number;
  /** Minimum width in px (gesture clamp). */
  minW: number;
  /** Minimum height in px (gesture clamp). */
  minH: number;
  /** Persistent collapse preference (panels/groups). */
  collapsed: boolean;
  /** Capability flags — undefined means "capable" (default true). Set to
   *  false to restrict the dock's participation in specific operations. */
  embeddable?: boolean;
  tabbable?: boolean;
  swappable?: boolean;
  resizable?: boolean;
  collapsible?: boolean;
}

/** The set of capability flag names. */
export type CapabilityName = "embeddable" | "tabbable" | "swappable" | "resizable" | "collapsible";

/** Check if a dock node has a given capability. Undefined → true (default). */
export function can(node: DockNode | null | undefined, cap: CapabilityName): boolean {
  if (!node) return true;
  const v = node[cap];
  return v !== false;
}

/** Compute whether a dock can be moved (reparented) at all — requires at
 *  least one of embeddable/tabbable/swappable. */
export function isMovable(node: DockNode | null | undefined): boolean {
  return can(node, "embeddable") || can(node, "tabbable") || can(node, "swappable");
}

export interface PanelNode extends BaseNode {
  type: "panel";
  label: string;
  contentType: ContentType;
}

export interface RowNode extends BaseNode {
  type: "row";
  children: DockNode[];
  /** null on the root container. */
  label: string | null;
  contentType: "group";
}

export interface ColNode extends BaseNode {
  type: "col";
  children: DockNode[];
  label: string | null;
  contentType: "group";
}

export interface TabsNode extends BaseNode {
  type: "tabs";
  children: DockNode[];
  activeTab: number;
  barSide: BarSide;
  label: string;
  contentType: "group";
}

export interface EmbedNode extends BaseNode {
  type: "embed";
  label: string;
  contentType: ContentType;
  /** Saved before promotion so an empty embed can demote back. */
  originalType: "panel" | "row" | "col" | "tabs";
  zones: Zones;
  zoneSizes: ZoneSizes;
  floats: FloatEntry[];
}

export type DockNode =
  | PanelNode
  | RowNode
  | ColNode
  | TabsNode
  | EmbedNode;

/** Container kinds that hold a `children` array. */
export type ContainerNode = RowNode | ColNode | TabsNode;

/** The root layout. The JS system keeps a single root container. */
export interface DockLayout {
  root: DockNode;
  /** Monotonic id counter; never reset by clear(). */
  nextId: number;
}

/** Default zone sizes when a node is promoted to embed. */
export const DEFAULT_ZONE_SIZES: ZoneSizes = {
  topH: 200,
  bottomH: 200,
  leftW: 220,
  rightW: 220,
};

/** Default size for a freshly evicted float. */
export const DEFAULT_FLOAT_RECT = { x: 60, y: 60, w: 260, h: 180 } as const;

/** Identity helpers. */
export function isContainer(n: DockNode): n is ContainerNode {
  return n.type === "row" || n.type === "col" || n.type === "tabs";
}

export function isRowOrCol(n: DockNode): n is RowNode | ColNode {
  return n.type === "row" || n.type === "col";
}

export function childrenOf(n: DockNode): DockNode[] {
  switch (n.type) {
    case "panel":
      return [];
    case "row":
    case "col":
    case "tabs":
      return n.children;
    case "embed":
      return [
        ...Object.values(n.zones).filter((z): z is DockNode => z !== null),
        ...n.floats.map((f) => f.node),
      ];
  }
}
