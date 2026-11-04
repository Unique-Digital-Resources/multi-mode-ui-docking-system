/**
 * Docking Domain Foundation — Normalization (deterministic cleanup)
 * ==================================================================
 * Mirrors AppShell `DockLayout::normalize` (Phase 5).
 *
 *   - Split (row/col) with < 2 children ⇒ collapse: survivor inherits slot
 *   - Tab group with 0 members ⇒ removed; 1 member preserved (meaningful)
 *   - Empty temporary embed host ⇒ demote back to original type
 *
 * Runs to fixpoint; idempotent; scans ascending-id order; never reorders.
 */

import { demoteEmbedIfEmpty, find, replaceNode } from "./model";
import type { DockLayout, DockNode } from "./types";

function pass(layout: DockLayout): boolean {
  let changed = false;
  const visit = (node: DockNode): DockNode => {
    switch (node.type) {
      case "panel":
        return node;
      case "row":
      case "col":
      case "tabs": {
        if (node.type === "tabs") {
          // 0-member tab group removed; 1-member preserved
          if (node.children.length === 0) {
            changed = true;
            return null as unknown as DockNode;
          }
        } else {
          // row/col with < 2 children collapses
          if (node.children.length === 0) {
            changed = true;
            return null as unknown as DockNode;
          }
          if (node.children.length === 1) {
            const only = node.children[0];
            only.flexGrow = node.flexGrow;
            changed = true;
            return only;
          }
        }
        node.children = node.children.map(visit).filter((c): c is DockNode => c !== null);
        return node;
      }
      case "embed": {
        // recurse into zones + floats
        for (const edge of ["top", "bottom", "left", "right"] as const) {
          if (node.zones[edge]) {
            const r = visit(node.zones[edge]!);
            if (r === null) node.zones[edge] = null;
            else node.zones[edge] = r;
          }
        }
        node.floats = node.floats
          .map((f) => ({ ...f, node: visit(f.node) }))
          .filter((f) => f.node !== null);
        // empty temporary host ⇒ demote
        const hasContent =
          Object.values(node.zones).some((z) => z !== null) || node.floats.length > 0;
        if (!hasContent) {
          const demoted = demoteEmbedIfEmpty(node);
          if (demoted !== node) {
            changed = true;
            return demoted;
          }
        }
        return node;
      }
    }
  };

  // root: don't collapse the root container itself even if < 2 children,
  // but recurse + replace root if it demotes.
  const newRoot = visit(layout.root);
  if (newRoot === null) {
    // root vanished — keep an empty col root (counter preserved)
    layout.root = { id: layout.root.id, type: "col", flexGrow: 1, minW: 60, minH: 60, collapsed: false, children: [], label: null, contentType: "group" };
    changed = true;
  } else {
    layout.root = newRoot;
  }
  return changed;
}

/** Run normalization to fixpoint. */
export function normalize(layout: DockLayout): void {
  let guard = 0;
  while (pass(layout) && guard < 64) guard++;
}
