/**
 * Docking Domain Foundation — Operations & Outcomes
 * ==================================================
 *
 * Value-type operations mirroring AppShell `DockingOperation`, ported 1-1
 * from the JS system's `commands/parenting.js`:
 *
 *   Insert        — directional split (or center swap) — cmdInsert
 *   Tab           — group into tabs (4 cases)         — cmdTab
 *   Embed         — promote host + zone/float         — cmdEmbed
 *   Close         — detach a dock                     — cmdClose
 *   SetCollapsed  — toggle collapse (guard last sib)  — cmdToggleCollapse
 *   SetActiveTab  — change active tab                 — cmdSetActiveTab
 *
 * Each operation:
 *   1. clones the layout (candidate),
 *   2. mutates the candidate,
 *   3. normalizes (shared pass),
 *   4. validates (steady-state gate),
 *   5. on success commits (swaps root in) + returns Outcome with UndoData.
 *
 * On failure the original layout is untouched (first violated rule returned).
 *
 * UndoData follows AppShell's "no model snapshot" spirit but, because the
 * TS port prioritizes correctness + id-stability for redo, captures the
 * previous-root clone (cheap for typical docking trees) plus created ids.
 * The DomainEngine wraps this in an ExecutedStep carrying pre/post trees.
 */

import {
  cloneLayout,
  cloneNode,
  detach,
  find,
  getAllIds,
  isAncestorOf,
  makeContainer,
  makePanel,
  maybeUnwrap,
  promoteToEmbed,
  replaceNode,
  swapNodes,
} from "./model";
import type {
  BarSide,
  DockId,
  DockLayout,
  DockNode,
  DropZone,
  EdgeRegion,
  PanelNode,
  CapabilityName,
} from "./types";
import { can } from "./types";
import { normalize } from "./normalization";
import { validate } from "./validation";
import type { DockingError } from "./error";

/** What is being inserted. `Existing` moves an id; `NewPanel` creates one. */
export type InsertSource =
  | { kind: "existing"; id: DockId }
  | { kind: "new-panel"; label: string; contentType?: PanelNode["contentType"]; capabilities?: Partial<Record<CapabilityName, boolean>> };

export interface DockingOperationInsert {
  type: "Insert";
  source: InsertSource;
  target: DockId;
  zone: DropZone;
}
export interface DockingOperationTab {
  type: "Tab";
  source: InsertSource;
  target: DockId;
  zone: DropZone;
}
export interface DockingOperationEmbed {
  type: "Embed";
  source: InsertSource;
  target: DockId;
  zone: DropZone;
}
export interface DockingOperationClose { type: "Close"; dock: DockId }
export interface DockingOperationSetCollapsed { type: "SetCollapsed"; dock: DockId; collapsed: boolean }
export interface DockingOperationSetActiveTab { type: "SetActiveTab"; group: DockId; index: number }
export interface DockingOperationReorderTab { type: "ReorderTab"; group: DockId; from: number; to: number }
/** Combine a child tabs group with its parent tabs group — merges the child's
 *  tabs back into the parent at the child's position. */
export interface DockingOperationCombineTabs { type: "CombineTabs"; tabsId: DockId }
/** Change the bar orientation of a tabs group — independent per group. */
export interface DockingOperationSetTabBarSide { type: "SetTabBarSide"; group: DockId; barSide: BarSide }

export type DockingOperation =
  | DockingOperationInsert
  | DockingOperationTab
  | DockingOperationEmbed
  | DockingOperationClose
  | DockingOperationSetCollapsed
  | DockingOperationSetActiveTab
  | DockingOperationReorderTab
  | DockingOperationCombineTabs
  | DockingOperationSetTabBarSide;

/** Inverse payload. `previousTree` is a deep clone of the root before apply. */
export interface UndoData {
  previousTree: DockNode;
  previousNextId: number;
  createdIds: DockId[];
}

export interface DockingOutcome {
  /** Name for history entries, e.g. "docking.insert". */
  name: string;
  undo: UndoData;
  /** Human label for toast/feedback. */
  label: string;
}

/** Resolve a source into a concrete node (possibly creating one). */
function resolveSource(
  layout: DockLayout,
  source: InsertSource,
  created: DockId[],
): DockNode | null {
  if (source.kind === "existing") {
    const found = find(layout.root, source.id);
    return found ? found.node : null;
  }
  const panel = makePanel(layout, source.label, source.contentType ?? "panel");
  // apply capability flags (undefined = default true, false = restricted)
  if (source.capabilities) {
    if (source.capabilities.embeddable === false) panel.embeddable = false;
    if (source.capabilities.tabbable === false) panel.tabbable = false;
    if (source.capabilities.swappable === false) panel.swappable = false;
    if (source.capabilities.resizable === false) panel.resizable = false;
    if (source.capabilities.collapsible === false) panel.collapsible = false;
  }
  created.push(panel.id);
  return panel;
}

/**
 * cmdInsert (commands/parenting.js) — directional split or center swap.
 *  - center ⇒ swap source/target positions (array parents only)
 *  - left/right ⇒ row direction; top/bottom ⇒ col direction
 *  - if target's parent is already the requested direction, splice in
 *  - otherwise wrap {target, source} in a new container of that direction
 */
function applyInsert(
  layout: DockLayout,
  source: InsertSource,
  targetId: DockId,
  zone: DropZone,
  created: DockId[],
): boolean {
  if (zone === "center") {
    if (source.kind !== "existing") return false;
    // swap requires both source and target to be swappable
    const srcFound = find(layout.root, source.id);
    const tgtFound = find(layout.root, targetId);
    if (!can(srcFound?.node, "swappable") || !can(tgtFound?.node, "swappable")) return false;
    return swapNodes(layout, source.id, targetId);
  }
  const isRow = zone === "left" || zone === "right";
  const isFirst = zone === "top" || zone === "left";
  const reqType: "row" | "col" = isRow ? "row" : "col";

  // resolve + detach source first
  const srcNode = resolveSource(layout, source, created);
  if (!srcNode) return false;
  if (source.kind === "existing") {
    if (srcNode.id === targetId) return false;
    if (isAncestorOf(layout.root, srcNode.id, targetId)) return false;
    detach(layout, srcNode.id);
    srcNode.flexGrow = 1;
  }

  const tgt = find(layout.root, targetId);
  if (!tgt || !tgt.parent) return false;
  const { node: tgtNode, parent, idx } = tgt;

  if (parent.type === "row" || parent.type === "col" || parent.type === "tabs") {
    if (parent.type === reqType) {
      // splice into existing same-direction container
      const at = isFirst ? (idx as number) : (idx as number) + 1;
      parent.children.splice(at, 0, srcNode);
    } else {
      // wrap {tgt, src} in a new container, inheriting tgt's flexGrow
      const pair = isFirst ? [srcNode, tgtNode] : [tgtNode, srcNode];
      const wrapper = makeContainer(layout, reqType, pair, reqType === "row" ? "Row Group" : "Col Group");
      wrapper.flexGrow = tgtNode.flexGrow;
      tgtNode.flexGrow = 1;
      srcNode.flexGrow = 1;
      parent.children[idx as number] = wrapper;
    }
  } else if (parent.type === "embed") {
    // target lives in an embed zone/float — wrap in a container
    const pair = isFirst ? [srcNode, tgtNode] : [tgtNode, srcNode];
    const wrapper = makeContainer(layout, reqType, pair, reqType === "row" ? "Row Group" : "Col Group");
    wrapper.flexGrow = tgtNode.flexGrow;
    tgtNode.flexGrow = 1;
    srcNode.flexGrow = 1;
    if (typeof idx === "string" && idx.startsWith("float:")) {
      parent.floats[Number(idx.slice(6))].node = wrapper;
    } else {
      parent.zones[idx as EdgeRegion] = wrapper;
    }
  }
  return true;
}

/**
 * cmdTab (commands/parenting.js) — 4 cases:
 *  A. source already in target's tabs group + non-center ⇒ just reorient bar
 *  B. target is a tabs node ⇒ push source, activate
 *  C. target's parent is a tabs node ⇒ append to parent group
 *  D. wrap {target, source} in a new tabs node
 */
function applyTab(
  layout: DockLayout,
  source: InsertSource,
  targetId: DockId,
  zone: DropZone,
  created: DockId[],
): boolean {
  const barSide: BarSide = zone === "center" ? "top" : (zone as BarSide);
  const srcNode = resolveSource(layout, source, created);
  if (!srcNode) return false;
  // source must be tabbable to be added as a tab
  if (!can(srcNode, "tabbable")) return false;

  // Case A: source already in target's tabs group
  if (source.kind === "existing") {
    const srcFound = find(layout.root, source.id);
    if (srcFound?.parent?.type === "tabs" && srcFound.parent.id === targetId && zone !== "center") {
      srcFound.parent.barSide = barSide;
      return true;
    }
    if (srcNode.id === targetId) return false;
    if (isAncestorOf(layout.root, srcNode.id, targetId)) return false;
    detach(layout, srcNode.id);
    srcNode.flexGrow = 1;
  }

  const tgt = find(layout.root, targetId);
  if (!tgt) return false;
  const { node: tgtNode, parent, idx } = tgt;

  // Case B: target is a tabs node — source becomes a new tab (nested if
  // source is itself a tabs group: the parent gets a tab whose content is
  // the child tabs group). The TARGET's existing barSide is PRESERVED so a
  // nested child tabs group can keep its own orientation independent of the
  // parent — e.g. a parent with a vertical-left bar stays vertical-left when
  // a child with a horizontal-bottom bar is dropped in.
  if (tgtNode.type === "tabs") {
    tgtNode.children.push(srcNode);
    tgtNode.activeTab = tgtNode.children.length - 1;
    return true;
  }
  // Case C: target's parent is a tabs node — same nesting behavior; the
  // parent's existing barSide is preserved.
  if (parent?.type === "tabs") {
    parent.children.push(srcNode);
    parent.activeTab = parent.children.length - 1;
    return true;
  }
  // Case D: wrap {target, source} in a new tabs node
  if (!parent) {
    // Target is the root (no parent) — wrap it with the source in a new
    // tabs node and make that the new root. Without this, tabbing an
    // embedded dock with the embed host (when it's the root) fails with
    // "IneligibleDock" because Case D returned false.
    const tabs = {
      id: `d${++layout.nextId}`,
      type: "tabs" as const,
      flexGrow: 1,
      minW: 60,
      minH: 60,
      collapsed: false,
      children: [tgtNode, srcNode],
      activeTab: 1,
      barSide,
      label: "Tab Group",
      contentType: "group" as const,
    };
    created.push(tabs.id);
    tgtNode.flexGrow = 1;
    srcNode.flexGrow = 1;
    layout.root = tabs;
    return true;
  }
  const tabs = {
    id: `d${++layout.nextId}`,
    type: "tabs" as const,
    flexGrow: tgtNode.flexGrow,
    minW: 60,
    minH: 60,
    collapsed: false,
    children: [tgtNode, srcNode],
    activeTab: 1,
    barSide,
    label: "Tab Group",
    contentType: "group" as const,
  };
  created.push(tabs.id);
  tgtNode.flexGrow = 1;
  srcNode.flexGrow = 1;
  if (parent.type === "row" || parent.type === "col" || parent.type === "tabs") {
    parent.children[idx as number] = tabs;
  } else if (parent.type === "embed") {
    if (typeof idx === "string" && idx.startsWith("float:")) {
      parent.floats[Number(idx.slice(6))].node = tabs;
    } else {
      parent.zones[idx as EdgeRegion] = tabs;
    }
  }
  return true;
}

/**
 * cmdEmbed (commands/parenting.js):
 *  - row/col target ⇒ fall back to Insert (center → right)
 *  - else promote target to embed host if needed
 *  - center zone ⇒ push as float
 *  - directional zone ⇒ evict existing occupant to float, then place source
 */
function applyEmbed(
  layout: DockLayout,
  source: InsertSource,
  targetId: DockId,
  zone: DropZone,
  created: DockId[],
): boolean {
  // If the target is a tabs group, walk down to the active tab's dock.
  // This lets the user embed into the *active tab's content* rather than
  // rejecting the whole group. Walk through nested tabs groups.
  let embedTargetId = targetId;
  for (let guard = 0; guard < 64; guard++) {
    const found = find(layout.root, embedTargetId);
    if (!found || found.node.type !== "tabs") break;
    const tabs = found.node;
    if (tabs.children.length === 0 || tabs.activeTab >= tabs.children.length) break;
    embedTargetId = tabs.children[tabs.activeTab].id;
  }

  const tgt = find(layout.root, embedTargetId);
  if (!tgt) return false;
  // containers can't host embed zones
  if (tgt.node.type === "row" || tgt.node.type === "col") {
    return applyInsert(layout, source, embedTargetId, zone === "center" ? "right" : zone, created);
  }
  const srcNode = resolveSource(layout, source, created);
  if (!srcNode) return false;
  // source must be embeddable to be placed in an embed zone/float
  if (!can(srcNode, "embeddable")) return false;
  if (source.kind === "existing") {
    if (srcNode.id === embedTargetId) return false;
    if (isAncestorOf(layout.root, srcNode.id, embedTargetId)) return false;
    detach(layout, srcNode.id);
    srcNode.flexGrow = 1;
  }

  // re-find target after detach (it may have moved)
  const tgt2 = find(layout.root, embedTargetId);
  if (!tgt2) return false;
  let host = tgt2.node;
  if (host.type !== "embed") {
    const promoted = promoteToEmbed(host as PanelNode | import("./types").TabsNode);
    replaceNode(layout, host.id, promoted);
    host = promoted;
  }
  const embedHost = host as import("./types").EmbedNode;

  if (zone === "center") {
    embedHost.floats.push({ node: srcNode, x: 40, y: 40, w: 260, h: 180 });
    return true;
  }
  const edge = zone as EdgeRegion;
  const prev = embedHost.zones[edge];
  if (prev) {
    // evict existing occupant to a float
    embedHost.floats.push({ node: prev, x: 60, y: 60, w: 260, h: 180 });
  }
  embedHost.zones[edge] = srcNode;
  return true;
}

function applyClose(layout: DockLayout, dockId: DockId): boolean {
  const removed = detach(layout, dockId);
  return removed !== null;
}

function applySetCollapsed(layout: DockLayout, dockId: DockId, collapsed: boolean): boolean {
  const found = find(layout.root, dockId);
  if (!found) return false;
  const { node, parent } = found;
  // dock must be collapsible
  if (!can(node, "collapsible")) return false;
  // guard: cannot collapse the last expanded sibling
  if (collapsed && parent && (parent.type === "row" || parent.type === "col" || parent.type === "tabs")) {
    const othersExpanded = parent.children.some((c) => c.id !== node.id && !c.collapsed);
    if (!othersExpanded) return false;
  }
  node.collapsed = collapsed;
  return true;
}

function applySetActiveTab(layout: DockLayout, groupId: DockId, index: number): boolean {
  const found = find(layout.root, groupId);
  if (!found || found.node.type !== "tabs") return false;
  if (index < 0 || index >= found.node.children.length) return false;
  found.node.activeTab = index;
  return true;
}

/**
 * Apply an operation to `layout` in place.
 * On success returns a DockingOutcome with UndoData; on failure returns DockingError
 * and leaves `layout` untouched (because we operate on a candidate clone).
 */
export function applyOperation(
  layout: DockLayout,
  op: DockingOperation,
): { ok: true; outcome: DockingOutcome } | { ok: false; error: DockingError } {
  // Snapshot BEFORE mutation (for undo). clone is independent of `layout`.
  const previousTree = cloneNode(layout.root);
  const previousNextId = layout.nextId;
  const created: DockId[] = [];

  // Operate on a candidate clone so failures leave the original untouched.
  const candidate = cloneLayout(layout);

  let ok = false;
  let label = "";
  let name = "";
  switch (op.type) {
    case "Insert":
      ok = applyInsert(candidate, op.source, op.target, op.zone, created);
      label = `insert → ${op.zone}`;
      name = "docking.insert";
      break;
    case "Tab":
      ok = applyTab(candidate, op.source, op.target, op.zone, created);
      label = `tab → ${op.zone}`;
      name = "docking.tab";
      break;
    case "Embed":
      ok = applyEmbed(candidate, op.source, op.target, op.zone, created);
      label = `embed → ${op.zone}`;
      name = "docking.embed";
      break;
    case "Close":
      ok = applyClose(candidate, op.dock);
      label = `close`;
      name = "docking.close";
      break;
    case "SetCollapsed":
      ok = applySetCollapsed(candidate, op.dock, op.collapsed);
      label = op.collapsed ? "collapse" : "expand";
      name = "docking.collapse";
      break;
    case "SetActiveTab":
      ok = applySetActiveTab(candidate, op.group, op.index);
      label = `active tab ${op.index}`;
      name = "docking.active_tab";
      break;
    case "ReorderTab":
      ok = applyReorderTab(candidate, op.group, op.from, op.to);
      label = `reorder tab ${op.from}→${op.to}`;
      name = "docking.reorder_tab";
      break;
    case "CombineTabs":
      ok = applyCombineTabs(candidate, op.tabsId);
      label = `combine tabs`;
      name = "docking.combine_tabs";
      break;
    case "SetTabBarSide":
      ok = applySetTabBarSide(candidate, op.group, op.barSide);
      label = `bar → ${op.barSide}`;
      name = "docking.set_bar_side";
      break;
  }

  if (!ok) {
    return { ok: false, error: { kind: "IneligibleDock", id: "source" } };
  }

  // normalize then validate (the canonical pipeline)
  normalize(candidate);
  const verr = validate(candidate.root);
  if (verr) {
    return { ok: false, error: verr };
  }

  // commit: swap candidate root into layout
  layout.root = candidate.root;
  layout.nextId = candidate.nextId;

  return {
    ok: true,
    outcome: {
      name,
      label,
      undo: { previousTree, previousNextId, createdIds: created },
    },
  };
}

/** Reorder a tab within a tabs group (from → to index). */
function applyReorderTab(layout: DockLayout, groupId: DockId, from: number, to: number): boolean {
  const found = find(layout.root, groupId);
  if (!found || found.node.type !== "tabs") return false;
  const children = found.node.children;
  if (from < 0 || from >= children.length) return false;
  if (to < 0 || to >= children.length) return false;
  if (from === to) return true;
  const [moved] = children.splice(from, 1);
  children.splice(to, 0, moved);
  // adjust active tab
  const activeId = found.node.activeTab;
  if (activeId === from) {
    found.node.activeTab = to;
  } else if (from < activeId && to >= activeId) {
    found.node.activeTab = activeId - 1;
  } else if (from > activeId && to <= activeId) {
    found.node.activeTab = activeId + 1;
  }
  return true;
}

/** Combine a child tabs group with its parent tabs group.
 *  The child tabs group (tabsId) must be a tab inside a parent tabs group.
 *  This removes the child from the parent's children and inserts the child's
 *  own tabs in its place — merging back into the parent. */
function applyCombineTabs(layout: DockLayout, tabsId: DockId): boolean {
  const found = find(layout.root, tabsId);
  if (!found) return false;
  const { node, parent, idx } = found;
  if (!parent) return false;
  if (parent.type !== "tabs") return false;
  if (node.type !== "tabs") return false;
  // splice the child's tabs into the parent's children at the child's position
  const childTabs = node.children;
  parent.children.splice(idx, 1, ...childTabs);
  // adjust active tab — point to the first merged tab
  parent.activeTab = Math.min(idx, parent.children.length - 1);
  return true;
}

/** Change the bar orientation (barSide) of a tabs group. Works on any tabs
 *  node — including child tabs groups nested inside a parent — so each level
 *  can have its own independent bar orientation. */
function applySetTabBarSide(layout: DockLayout, groupId: DockId, barSide: BarSide): boolean {
  const found = find(layout.root, groupId);
  if (!found || found.node.type !== "tabs") return false;
  found.node.barSide = barSide;
  return true;
}

/** Advisory eligibility pre-checks (frontend uses these before committing). */
export function canDropOn(
  layout: DockLayout,
  sourceId: DockId,
  targetId: DockId,
): boolean {
  if (sourceId === targetId) return false;
  if (isAncestorOf(layout.root, sourceId, targetId)) return false;
  const tgt = find(layout.root, targetId);
  if (!tgt) return false;
  // containers are not drop targets (overlays only on leaves)
  return tgt.node.type !== "row" && tgt.node.type !== "col";
}

export function getExcludeIds(layout: DockLayout, nodeId: DockId): Set<DockId> {
  const found = find(layout.root, nodeId);
  if (!found) return new Set();
  return getAllIds(found.node);
}
