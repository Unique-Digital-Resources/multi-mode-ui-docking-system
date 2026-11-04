/**
 * Docking Domain Foundation — Layout Model
 * =========================================
 *
 * Factories, traversal, and pub(crate)-style mutation primitives.
 * Mirrors `js/trees.js` + `js/tree_manager.js` and AppShell's
 * `DockLayout` accessor surface.
 *
 * Conventions ported from AppShell:
 *   - Ids are counter-issued and never renumbered on removal.
 *   - `clear()` preserves the id counter.
 *   - Structural mutations go through internal helpers so operations stay
 *     the only public mutation path.
 */

import {
  DEFAULT_ZONE_SIZES,
  type DockId,
  type DockNode,
  type DockLayout,
  type PanelNode,
  type RowNode,
  type ColNode,
  type TabsNode,
  type EmbedNode,
  type ContainerNode,
  type ContentType,
  type BarSide,
  type DropZone,
} from "./types";

export type { DropZone };

/** Issue the next id. The counter is part of layout state. */
export function nextId(layout: DockLayout): DockId {
  layout.nextId += 1;
  return `d${layout.nextId}`;
}

/** Peek id without consuming. */
export function peekId(layout: DockLayout): DockId {
  return `d${layout.nextId + 1}`;
}

// ---------- factories ----------

export function makePanel(
  layout: DockLayout,
  label: string,
  contentType: ContentType = "panel",
): PanelNode {
  return {
    id: nextId(layout),
    type: "panel",
    flexGrow: 1,
    minW: 60,
    minH: 60,
    collapsed: false,
    label,
    contentType,
  };
}

/** Build a panel without consuming the layout counter (used by undo replay). */
export function panelWithId(id: DockId, label: string, contentType: ContentType): PanelNode {
  return { id, type: "panel", flexGrow: 1, minW: 60, minH: 60, collapsed: false, label, contentType };
}

export function makeContainer(
  layout: DockLayout,
  type: "row" | "col",
  children: DockNode[],
  label: string | null = null,
): RowNode | ColNode {
  const base = {
    id: nextId(layout),
    flexGrow: 1,
    minW: 60,
    minH: 60,
    collapsed: false,
    children,
    label,
    contentType: "group" as const,
  };
  return type === "row" ? { ...base, type: "row" } : { ...base, type: "col" };
}

export function makeTabs(
  layout: DockLayout,
  children: DockNode[],
  activeTab = 0,
  barSide: BarSide = "top",
): TabsNode {
  return {
    id: nextId(layout),
    type: "tabs",
    flexGrow: 1,
    minW: 60,
    minH: 60,
    collapsed: false,
    children,
    activeTab,
    barSide,
    label: "Tab Group",
    contentType: "group",
  };
}

/** Promote a panel/tabs into an embed host (preserves identity + content). */
export function promoteToEmbed(node: PanelNode | TabsNode | EmbedNode): EmbedNode {
  if (node.type === "embed") return node;
  const originalType = node.type;
  const label = node.type === "panel" ? node.label : node.label;
  const contentType = node.contentType;
  return {
    id: node.id,
    type: "embed",
    flexGrow: node.flexGrow,
    minW: node.minW,
    minH: node.minH,
    collapsed: node.collapsed,
    label,
    contentType,
    originalType,
    zones: { top: null, bottom: null, left: null, right: null },
    zoneSizes: { ...DEFAULT_ZONE_SIZES },
    floats: [],
  };
}

/** Demote an empty embed back to its original category (preserves identity). */
export function demoteEmbedIfEmpty(node: EmbedNode): DockNode {
  const hasZones = Object.values(node.zones).some((z) => z !== null);
  if (hasZones || node.floats.length > 0) return node;
  switch (node.originalType) {
    case "panel":
      return {
        id: node.id,
        type: "panel",
        flexGrow: node.flexGrow,
        minW: node.minW,
        minH: node.minH,
        collapsed: node.collapsed,
        label: node.label,
        contentType: node.contentType,
      };
    case "row":
      return {
        id: node.id,
        type: "row",
        flexGrow: node.flexGrow,
        minW: node.minW,
        minH: node.minH,
        collapsed: node.collapsed,
        children: [],
        label: node.label,
        contentType: "group",
      };
    case "col":
      return {
        id: node.id,
        type: "col",
        flexGrow: node.flexGrow,
        minW: node.minW,
        minH: node.minH,
        collapsed: node.collapsed,
        children: [],
        label: node.label,
        contentType: "group",
      };
    case "tabs":
      return {
        id: node.id,
        type: "tabs",
        flexGrow: node.flexGrow,
        minW: node.minW,
        minH: node.minH,
        collapsed: node.collapsed,
        children: [],
        activeTab: 0,
        barSide: "top",
        label: node.label,
        contentType: "group",
      };
  }
}

// ---------- traversal ----------

/** Find result. `parent === null` ⇒ the node is the root. */
export interface FindResult {
  node: DockNode;
  parent: DockNode | null;
  /** index in parent.children (container) | zone key (embed) | "float:n" (embed float). */
  idx: number | EdgeRegionStr;
}

export type EdgeRegionStr = "top" | "bottom" | "left" | "right";
export type FloatIdx = `float:${number}`;

/** DFS for a node by id. Returns null if not found. */
export function find(
  root: DockNode,
  id: DockId,
  parent: DockNode | null = null,
  idx: number | EdgeRegionStr = 0,
): FindResult | null {
  if (root.id === id) return { node: root, parent, idx };
  switch (root.type) {
    case "panel":
      return null;
    case "row":
    case "col":
    case "tabs": {
      for (let i = 0; i < root.children.length; i++) {
        const r = find(root.children[i], id, root, i);
        if (r) return r;
      }
      return null;
    }
    case "embed": {
      for (const edge of ["top", "bottom", "left", "right"] as const) {
        const z = root.zones[edge];
        if (z) {
          const r = find(z, id, root, edge);
          if (r) return r;
        }
      }
      for (let i = 0; i < root.floats.length; i++) {
        const r = find(root.floats[i].node, id, root, `float:${i}` as FloatIdx);
        if (r) return r;
      }
      return null;
    }
  }
}

/** Remove a node by id. Returns the removed node or null. Mutates the tree. */
export function detach(layout: DockLayout, id: DockId): DockNode | null {
  const found = find(layout.root, id);
  if (!found) return null;
  const { node, parent, idx } = found;
  if (!parent) {
    // removing root — replace with an empty col root, preserve counter
    layout.root = makeContainer(layout, "col", [], null);
    return node;
  }
  if (parent.type === "row" || parent.type === "col" || parent.type === "tabs") {
    parent.children.splice(idx as number, 1);
    maybeUnwrap(layout, parent);
  } else if (parent.type === "embed") {
    if (typeof idx === "string" && idx.startsWith("float:")) {
      const fi = Number(idx.slice(6));
      parent.floats.splice(fi, 1);
    } else {
      parent.zones[idx as EdgeRegionStr] = null;
    }
    const demoted = demoteEmbedIfEmpty(parent);
    if (demoted !== parent) replaceNode(layout, parent.id, demoted);
  }
  return node;
}

/**
 * Collapse 0/1-child containers up the tree.
 *   - 0 children ⇒ remove the container (recursively unwraps parent).
 *   - 1 child ⇒ replace container with that child (preserving flexGrow).
 *   - tabs with 1 child also unwrap.
 *   - root never unwraps.
 */
export function maybeUnwrap(layout: DockLayout, node: DockNode): void {
  if (node.type !== "row" && node.type !== "col" && node.type !== "tabs") return;
  const found = find(layout.root, node.id);
  if (!found) return;
  const { parent } = found;
  if (!parent) return; // root never unwraps
  if (node.children.length === 0) {
    detach(layout, node.id);
  } else if (node.children.length === 1) {
    const only = node.children[0];
    only.flexGrow = node.flexGrow;
    replaceNode(layout, node.id, only);
  }
}

/** Replace a node by id with a new node (in-place at its slot). */
export function replaceNode(layout: DockLayout, id: DockId, replacement: DockNode): void {
  const found = find(layout.root, id);
  if (!found) return;
  const { parent, idx } = found;
  if (!parent) {
    layout.root = replacement;
    return;
  }
  if (parent.type === "row" || parent.type === "col" || parent.type === "tabs") {
    parent.children[idx as number] = replacement;
  } else if (parent.type === "embed") {
    if (typeof idx === "string" && idx.startsWith("float:")) {
      const fi = Number(idx.slice(6));
      parent.floats[fi].node = replacement;
    } else {
      parent.zones[idx as EdgeRegionStr] = replacement;
    }
  }
}

/** Collect every id in a subtree (for cycle / exclude checks). */
export function getAllIds(node: DockNode): Set<DockId> {
  const ids = new Set<DockId>();
  const walk = (n: DockNode) => {
    ids.add(n.id);
    switch (n.type) {
      case "panel":
        return;
      case "row":
      case "col":
      case "tabs":
        n.children.forEach(walk);
        return;
      case "embed":
        for (const z of Object.values(n.zones)) if (z) walk(z);
        n.floats.forEach((f) => walk(f.node));
        return;
    }
  };
  walk(node);
  return ids;
}

/** True if `ancestorId` is an ancestor of `descendantId` (or equal). */
export function isAncestorOf(root: DockNode, ancestorId: DockId, descendantId: DockId): boolean {
  if (ancestorId === descendantId) return true;
  const found = find(root, ancestorId);
  if (!found) return false;
  return getAllIds(found.node).has(descendantId);
}

/** Swap two nodes' positions within array parents (transfers flexGrow). */
export function swapNodes(layout: DockLayout, aId: DockId, bId: DockId): boolean {
  if (aId === bId) return false;
  const a = find(layout.root, aId);
  const b = find(layout.root, bId);
  if (!a || !b) return false;
  if (!a.parent || !b.parent) return false; // root can't swap
  if (a.parent.type === "embed" || b.parent.type === "embed") return false;
  const ap = a.parent as ContainerNode;
  const bp = b.parent as ContainerNode;
  const ai = a.idx as number;
  const bi = b.idx as number;
  const tmpG = ap.children[ai].flexGrow;
  ap.children[ai].flexGrow = bp.children[bi].flexGrow;
  bp.children[bi].flexGrow = tmpG;
  const tmp = ap.children[ai];
  ap.children[ai] = bp.children[bi];
  bp.children[bi] = tmp;
  return true;
}

/** Deep clone a node (for undo snapshots / restore). */
export function cloneNode<T extends DockNode>(node: T): T {
  return structuredClone(node);
}

/** Deep clone the whole layout. */
export function cloneLayout(layout: DockLayout): DockLayout {
  return { root: structuredClone(layout.root), nextId: layout.nextId };
}

// re-export zone type used by find

