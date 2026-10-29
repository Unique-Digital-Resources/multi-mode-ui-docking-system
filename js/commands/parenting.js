/* ═══════════════════════════════════════════════════════════════
   commands/parenting.js — Core layout commands
   GUI knows these commands; commands do NOT know GUI.
   Depends on: trees.js, tree_manager.js
═══════════════════════════════════════════════════════════════ */

// ── Insert ────────────────────────────────────────────────────
//
// Inserts src adjacent to tgt, splitting tgt's space.
//   zone = 'top'|'bottom'|'left'|'right'  → directional split
//   zone = 'center'                        → swap positions
//
// Src is ALWAYS kept as a single unit. If src is a container group,
// it is placed whole — children stay inside it. The resulting parent
// wrapping src+tgt is created at tgt's exact position in the tree.
//
function cmdInsert(tree, srcId, tgtId, zone) {
  if (srcId === tgtId) return false;
  if (zone === 'center') return swapNodes(tree, srcId, tgtId);

  const isRow   = zone === 'left' || zone === 'right';
  const isFirst = zone === 'top'  || zone === 'left';
  const reqType = isRow ? 'row' : 'col';

  const src = detach(tree, srcId);
  if (!src) return false;
  src.flexGrow = 1;

  const tf = find(tree, tgtId);
  if (!tf) return false;   // guard: tgt vanished (e.g. was inside src — caught upstream)
  const { node: tgt, parent: tp, idx: ti } = tf;

  if (tp && tp.type === reqType && Array.isArray(tp.children)) {
    // Parent already the right direction → slot src in adjacent to tgt, no extra wrapper.
    const insertPos = isFirst ? ti : ti + 1;
    tp.children.splice(insertPos, 0, src);
  } else {
    // Different direction (or embed zone) → wrap tgt + src in a new container.
    // The new container takes tgt's exact place.
    const pair = isFirst ? [src, tgt] : [tgt, src];
    const newC = makeContainer(reqType, pair);
    newC.flexGrow = tgt.flexGrow;
    tgt.flexGrow  = 1;
    src.flexGrow  = 1;

    if (tp && Array.isArray(tp.children)) {
      tp.children.splice(ti, 1, newC);
    } else if (tp && tp.type === 'embed') {
      tp.zones[ti] = newC;
    } else {
      return false;   // tgt was root — shouldn't reach here
    }
  }
  return true;
}

// ── Tab ──────────────────────────────────────────────────────
// Groups src and tgt into a tabs container (bar side = zone).
// Special cases:
//   A. src already lives in tgtId tabs group + zone is directional
//      → only change barSide (no move)
//   B. tgtId is a tabs node → append src and make it active
//   C. tgtId's parent is a tabs node → append to that group
//   D. otherwise → wrap tgt+src in a new tabs node
function cmdTab(tree, srcId, tgtId, zone) {
  if (srcId === tgtId) return false;
  const barSide = (zone === 'center') ? 'top' : zone;

  // Case A: directional drop on the same tabs group the src belongs to
  // → change bar side without moving the tab
  const srcF = find(tree, srcId);
  if (srcF?.parent?.type === 'tabs' && srcF.parent.id === tgtId && zone !== 'center') {
    srcF.parent.barSide = barSide;
    return true;
  }

  const src = detach(tree, srcId);
  if (!src) return false;
  src.flexGrow = 1;

  const tf = find(tree, tgtId);
  if (!tf) return false;
  const { node: tgt, parent: tp, idx: ti } = tf;

  // Case B: target is already a tabs node → append + activate + optionally change barSide
  if (tgt.type === 'tabs') {
    tgt.children.push(src);
    tgt.activeTab = tgt.children.length - 1;
    if (zone !== 'center') tgt.barSide = barSide;
    return true;
  }
  // Case C: target's parent is a tabs node → append to that group
  if (tp?.type === 'tabs') {
    tp.children.push(src);
    tp.activeTab = tp.children.length - 1;
    if (zone !== 'center') tp.barSide = barSide;
    return true;
  }

  // Case D: wrap tgt + src in a new tabs node at tgt's position
  const newTabs    = makeTabs([tgt, src], 1, barSide);
  newTabs.flexGrow = tgt.flexGrow;
  tgt.flexGrow     = 1;
  if (tp && Array.isArray(tp.children)) {
    tp.children.splice(ti, 1, newTabs);
  } else if (tp?.type === 'embed') {
    tp.zones[ti] = newTabs;
  }
  return true;
}

// ── Embed ─────────────────────────────────────────────────────
// Promotes tgt PANEL to embed host and places src in a zone or float.
// Container nodes (row/col) cannot be embed hosts — falls back to insert.
function cmdEmbed(tree, srcId, tgtId, zone) {
  if (srcId === tgtId) return false;

  // Pre-check before detaching so we can fallback without side effects
  const preTf = find(tree, tgtId);
  if (!preTf) return false;
  const preTgtType = preTf.node.type;
  if (preTgtType === 'row' || preTgtType === 'col') {
    return cmdInsert(tree, srcId, tgtId, zone === 'center' ? 'right' : zone);
  }

  const src = detach(tree, srcId);
  if (!src) return false;
  src.flexGrow = 1;

  const tf = find(tree, tgtId);
  if (!tf) return false;
  const { node: tgt } = tf;

  if (tgt.type !== 'embed') promoteToEmbed(tgt);

  if (zone === 'center') {
    tgt.floats.push({ node: src, x: 40, y: 40, w: 260, h: 180 });
  } else {
    if (tgt.zones[zone]) {
      tgt.floats.push({ node: tgt.zones[zone], x: 60, y: 60, w: 260, h: 180 });
    }
    tgt.zones[zone] = src;
  }
  return true;
}

// ── Close ─────────────────────────────────────────────────────
function cmdClose(tree, id) {
  return detach(tree, id) !== null;
}

// ── Collapse / Expand ─────────────────────────────────────────
function cmdToggleCollapse(tree, id) {
  const f = find(tree, id);
  if (!f || !f.parent) return false;
  const { node, parent } = f;

  if (!node.collapsed) {
    if (Array.isArray(parent.children)) {
      const otherExpanded = parent.children.filter(s => s.id !== id && !s.collapsed);
      if (otherExpanded.length === 0) return false;
    }
  }
  node.collapsed = !node.collapsed;
  return true;
}

// ── Set Active Tab ─────────────────────────────────────────────
function cmdSetActiveTab(tree, tabsId, tabIdx) {
  const f = find(tree, tabsId);
  if (!f || f.node.type !== 'tabs') return false;
  f.node.activeTab = Math.max(0, Math.min(tabIdx, f.node.children.length - 1));
  return true;
}
