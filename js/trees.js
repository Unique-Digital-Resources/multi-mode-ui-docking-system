/* ═══════════════════════════════════════════════════════════════
   trees.js — Node factories & type data
   No external dependencies.
═══════════════════════════════════════════════════════════════ */

let _seq = 0;
const uid = () => `d${++_seq}`;

/* ── Content-type icons ── */
const ICONS = {
  chart: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  table: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>`,
  text:  `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  image: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  panel: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/></svg>`,
  group: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>`,
};

/* ── Base node fields shared by all types ── */
function baseNode(type) {
  return {
    id:        uid(),
    type,
    flexGrow:  1,
    minW:      60,
    minH:      60,
    collapsed: false,
  };
}

/* ── Leaf: single panel ── */
function makePanel(label = 'Panel', contentType = 'panel') {
  return { ...baseNode('panel'), label, contentType };
}

/* ── Parent: row or col container ── */
function makeContainer(dir, children = [], label = null) {
  const defaultLabel = dir === 'row' ? 'Row Group' : 'Col Group';
  return { ...baseNode(dir), children, label: label ?? defaultLabel, contentType: 'group' };
}

/* ── Parent: tabbed container ── */
function makeTabs(children = [], activeTab = 0, barSide = 'top') {
  return { ...baseNode('tabs'), children, activeTab, barSide, label: 'Tab Group', contentType: 'group' };
}

/* ── Promote a node to embed in-place (mutates, stores original type for demotion) ── */
function promoteToEmbed(node) {
  node._originalType = node.type;          // remember so demotion restores correctly
  node.type          = 'embed';
  node.zones         = { top: null, bottom: null, left: null, right: null };
  node.zoneSizes     = { topH: 200, bottomH: 200, leftW: 220, rightW: 220 };
  node.floats        = [];
  return node;
}

/* ── Demote embed back to its original type when all zones/floats are cleared ── */
function demoteEmbedIfEmpty(node) {
  if (node.type !== 'embed') return;
  const hasChildren =
    Object.values(node.zones).some(v => v !== null) ||
    (node.floats && node.floats.length > 0);
  if (!hasChildren) {
    // Restore the type that existed before promotion (default: 'panel')
    node.type = node._originalType || 'panel';
    delete node._originalType;
    delete node.zones;
    delete node.zoneSizes;
    delete node.floats;
  }
}
