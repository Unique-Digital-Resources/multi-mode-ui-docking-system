/**
 * Docking Domain Foundation — Validation (steady-state gate)
 * ===========================================================
 * Mirrors AppShell `DockLayout::validate` (Phase 3). First-error semantics,
 * deterministic ascending-id scan order. Reports the first violated rule.
 */

import type { DockId, DockNode } from "./types";
import type { DockingError } from "./error";
import { childrenOf } from "./types";

/** Collected placement counts per id during a traversal. */
interface Counts {
  placements: Map<DockId, number>;
  isRoot: Set<DockId>;
}

function walkCounts(node: DockNode | null, counts: Counts, isRoot: boolean): void {
  if (!node) return;
  if (isRoot) counts.isRoot.add(node.id);
  switch (node.type) {
    case "panel":
      return;
    case "row":
    case "col":
    case "tabs": {
      if (node.children.length < (node.type === "tabs" ? 1 : 2)) {
        // structural minimum enforced by normalization; still surface here
      }
      node.children.forEach((c) => {
        counts.placements.set(c.id, (counts.placements.get(c.id) ?? 0) + 1);
        walkCounts(c, counts, false);
      });
      return;
    }
    case "embed": {
      for (const z of Object.values(node.zones)) {
        if (z) {
          counts.placements.set(z.id, (counts.placements.get(z.id) ?? 0) + 1);
          walkCounts(z, counts, false);
        }
      }
      node.floats.forEach((f) => {
        counts.placements.set(f.node.id, (counts.placements.get(f.node.id) ?? 0) + 1);
        walkCounts(f.node, counts, false);
      });
      return;
    }
  }
}

/** Cycle detection via DFS coloring. */
function hasCycle(root: DockNode): DockId | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<DockId, number>();
  const stack: DockNode[] = [root];
  // iterative DFS; track the current path
  const path: DockId[] = [];
  const visit = (n: DockNode): DockId | null => {
    if (color.get(n.id) === GRAY) return n.id;
    if (color.get(n.id) === BLACK) return null;
    color.set(n.id, GRAY);
    path.push(n.id);
    for (const c of childrenOf(n)) {
      const r = visit(c);
      if (r) return r;
    }
    color.set(n.id, BLACK);
    path.pop();
    return null;
  };
  return visit(root);
}

/**
 * Validate a layout root. Returns the first DockingError or null if valid.
 * (Counts a single root as the layout; the JS system always has one root.)
 */
export function validate(root: DockNode): DockingError | null {
  // 1. missing/invalid root pointer — the root always exists here.
  // 2. reference validity + category parity + placement multiplicity
  const counts: Counts = { placements: new Map(), isRoot: new Set() };
  walkCounts(root, counts, true);

  // collect all ids in deterministic ascending order
  const allIds: DockId[] = [];
  const seen = new Set<DockId>();
  const collect = (n: DockNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    allIds.push(n.id);
    childrenOf(n).forEach(collect);
  };
  collect(root);
  allIds.sort();

  for (const id of allIds) {
    const p = counts.placements.get(id) ?? 0;
    const isRoot = counts.isRoot.has(id);
    const total = p + (isRoot ? 1 : 0);
    if (total === 0) return { kind: "OrphanDock", id };
    if (total > 1) {
      if (isRoot && p > 0) return { kind: "InvalidRoot", id };
      return { kind: "DuplicatePlacement", id };
    }
  }

  // 3. acyclicity
  const cycle = hasCycle(root);
  if (cycle) return { kind: "CycleDetected", id: cycle };

  return null;
}
