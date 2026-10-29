/* ═══════════════════════════════════════════════════════════════
   tree_manager.js — Tree traversal & structural mutations
   Depends on: trees.js (promoteToEmbed, demoteEmbedIfEmpty)
═══════════════════════════════════════════════════════════════ */

/**
 * find(root, id) → { node, parent, idx } | null
 *
 * idx semantics:
 *   number              → index in parent.children  (row / col / tabs)
 *   'top'|'bottom'|...  → key in parent.zones       (embed zone)
 *   'float:<n>'         → index in parent.floats     (embed float)
 */
function find(root, id, parent = null, idx = 0) {
  if (!root) return null;
  if (root.id === id) return { node: root, parent, idx };

  if (root.type === 'embed') {
    for (const z of ['top', 'bottom', 'left', 'right']) {
      if (root.zones[z]) {
        const r = find(root.zones[z], id, root, z);
        if (r) return r;
      }
    }
    for (let i = 0; i < (root.floats || []).length; i++) {
      const r = find(root.floats[i].node, id, root, `float:${i}`);
      if (r) return r;
    }
  } else if (Array.isArray(root.children)) {
    for (let i = 0; i < root.children.length; i++) {
      const r = find(root.children[i], id, root, i);
      if (r) return r;
    }
  }
  return null;
}

/**
 * detach(tree, id) — Remove a node from its parent and return it.
 * Returns null if the node is the root (no parent) or not found.
 */
function detach(tree, id) {
  const f = find(tree, id);
  if (!f || !f.parent) return null;
  const { node, parent, idx } = f;

  if (parent.type === 'embed') {
    if (String(idx).startsWith('float:')) {
      parent.floats.splice(parseInt(idx.split(':')[1]), 1);
    } else {
      parent.zones[idx] = null;
    }
    demoteEmbedIfEmpty(parent);
  } else {
    // row / col / tabs
    parent.children.splice(idx, 1);
    maybeUnwrap(tree, parent);
  }
  return node;
}

/**
 * maybeUnwrap(tree, node) — Collapse redundant single-child containers.
 *
 * Applies to: row, col, tabs.
 * Rules:
 *   0 children → remove the container entirely
 *   1 child    → replace container with that child (preserving flexGrow)
 *              → for tabs: also unwrap — a single-tab group is pointless
 *   Root containers are never unwrapped.
 *
 * Parent types handled:
 *   row/col parent  → splice into parent.children array
 *   embed zone      → replace the zone slot (parent.zones[idx])
 *   embed float     → remove the float entry
 */
function maybeUnwrap(tree, node) {
  if (!node || !Array.isArray(node.children)) return;
  const gf = find(tree, node.id);
  if (!gf?.parent) return;   // root — never unwrap

  const { parent, idx } = gf;

  /** Helper: write a node (or null) into the slot where `node` currently lives. */
  function replaceInParent(replacement) {
    if (Array.isArray(parent.children)) {
      if (replacement === null) {
        parent.children.splice(idx, 1);
        maybeUnwrap(tree, parent);
      } else {
        parent.children.splice(idx, 1, replacement);
        // If parent now has 1 child and is not root, unwrap parent too
        if (parent.children.length === 1) maybeUnwrap(tree, parent);
      }
    } else if (parent.type === 'embed') {
      if (String(idx).startsWith('float:')) {
        if (replacement === null) {
          const fi = parseInt(idx.split(':')[1]);
          parent.floats.splice(fi, 1);
        }
        // Replacing a float with a non-null child is unusual; leave as-is.
      } else {
        // idx is a zone key: 'top'|'bottom'|'left'|'right'
        parent.zones[idx] = replacement;
        demoteEmbedIfEmpty(parent);
      }
    }
  }

  if (node.children.length === 0) {
    replaceInParent(null);
    return;
  }

  if (node.children.length === 1) {
    const child = node.children[0];
    child.flexGrow = node.flexGrow;
    replaceInParent(child);
  }
}

/**
 * getAllIds(node) → Set<string>
 * Collects every node ID in the subtree rooted at `node`.
 * Used to suppress drop-overlays on all descendants of a dragged container.
 */
function getAllIds(node) {
  const ids = new Set();
  function collect(n) {
    if (!n) return;
    ids.add(n.id);
    if (n.type === 'embed') {
      Object.values(n.zones).forEach(z => z && collect(z));
      (n.floats || []).forEach(f => collect(f.node));
    } else if (Array.isArray(n.children)) {
      n.children.forEach(collect);
    }
  }
  collect(node);
  return ids;
}

/**
 * isAncestorOf(tree, ancestorId, descendantId) → boolean
 * Returns true if ancestorId contains descendantId in its subtree.
 * Used to guard against dropping a container onto one of its own children.
 */
function isAncestorOf(tree, ancestorId, descendantId) {
  const af = find(tree, ancestorId);
  if (!af) return false;
  return getAllIds(af.node).has(descendantId);
}

/**
 * swapNodes(tree, aId, bId) — Swap two nodes within array-type parents.
 * Returns false if either node lacks an array parent.
 */
function swapNodes(tree, aId, bId) {
  const af = find(tree, aId);
  const bf = find(tree, bId);
  if (!af?.parent || !bf?.parent) return false;
  const { node: a, parent: ap, idx: ai } = af;
  const { node: b, parent: bp, idx: bi } = bf;

  if (!Array.isArray(ap.children) || !Array.isArray(bp.children)) return false;

  const [afg, bfg] = [a.flexGrow, b.flexGrow];
  if (ap === bp) {
    [ap.children[ai], ap.children[bi]] = [ap.children[bi], ap.children[ai]];
  } else {
    ap.children[ai] = b;
    bp.children[bi] = a;
    a.flexGrow = bfg;
    b.flexGrow = afg;
  }
  return true;
}
