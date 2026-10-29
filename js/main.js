/* ═══════════════════════════════════════════════════════════════
   main.js — State machine, dispatch, render loop, init
   This is the main interface to the docking system.
   Depends on: all other modules.
═══════════════════════════════════════════════════════════════ */

/* ── Global state ── */
const state = {
  tree:             null,
  overlayOn:        false,
  overlayMode:      'insert',
  overlayExceptIds: new Set(),   // Set<string>: all IDs whose overlays are suppressed
};

/**
 * dragState — Shared drag context mutated by header events, read by drop handlers.
 */
const dragState = {
  active:    false,
  srcId:     null,
  exceptIds: new Set(),
  mode:      'insert',
};

/**
 * ctx — Context object passed into all renderer functions.
 * GUI (headers, overlays) calls dispatch & reads dragState via ctx.
 * Commands (parenting.js) work on tree data only — they do not receive ctx.
 */
const ctx = { dispatch, dragState };

/**
 * ctx.getExcludeIds(nodeId) → Set<string>
 *
 * Returns the full set of IDs that must not show drop overlays while
 * this node is being dragged:  the node itself + every descendant.
 * Prevents dropping a container onto one of its own children (which
 * detaches the container before the target can be found → disappears).
 */
ctx.getExcludeIds = (nodeId) => {
  const f = find(state.tree, nodeId);
  return f ? getAllIds(f.node) : new Set([nodeId]);
};

/* ══════════════════════════════════════════════════════════════
   Dispatch — central action handler
══════════════════════════════════════════════════════════════ */
function dispatch(action) {
  switch (action.type) {

    case 'DROP': {
      const { srcId, tgtId, zone, mode } = action;

      // Safety guard: bail if target is the source or a descendant of it.
      // (overlays should already suppress these, but this is the last line of defence.)
      if (srcId === tgtId || isAncestorOf(state.tree, srcId, tgtId)) break;

      let ok = false;
      if      (mode === 'tab')   ok = cmdTab   (state.tree, srcId, tgtId, zone);
      else if (mode === 'embed') ok = cmdEmbed  (state.tree, srcId, tgtId, zone);
      else                       ok = cmdInsert (state.tree, srcId, tgtId, zone);

      if (ok) {
        render();
        toast(`<span class="hl">${mode}</span> → ${zone}`);
      }
      break;
    }

    case 'CLOSE':
      if (cmdClose(state.tree, action.id)) render();
      break;

    case 'COLLAPSE':
      if (cmdToggleCollapse(state.tree, action.id)) render();
      break;

    case 'SET_ACTIVE_TAB':
      if (cmdSetActiveTab(state.tree, action.tabsId, action.tabIdx)) render();
      break;

    case 'ADD_PANEL': {
      const p = makePanel(action.label, action.contentType);
      if (Array.isArray(state.tree.children)) {
        state.tree.children.push(p);
      }
      render();
      break;
    }

    case 'SHOW_OVERLAYS': {
      const ids = action.exceptIds instanceof Set
        ? action.exceptIds
        : new Set(action.exceptId ? [action.exceptId] : []);
      state.overlayOn       = true;
      state.overlayMode     = action.mode;
      state.overlayExceptIds = ids;
      syncOverlays(true, action.mode, ids);
      updateBadge();
      break;
    }

    case 'HIDE_OVERLAYS':
      state.overlayOn       = false;
      state.overlayExceptIds = new Set();
      syncOverlays(false);
      updateBadge();
      break;
  }
}

/* ══════════════════════════════════════════════════════════════
   Render — full re-render of the layout tree
══════════════════════════════════════════════════════════════ */
function render() {
  const root = document.getElementById('layout-root');
  root.innerHTML = '';
  // isRoot=true: top-level container fills viewport with no wrapper/header
  root.appendChild(renderTree(state.tree, ctx, true));
  if (state.overlayOn) syncOverlays(true, state.overlayMode, state.overlayExceptIds);
  // Re-apply peek-header class to the tracked node after DOM replacement
  if (typeof reapplyPeek === 'function') reapplyPeek();
  requestAnimationFrame(updateConnections);
  updateTreeView();
}

/* ── Mode badge ── */
const M_ICONS = { insert: '⬡', tab: '⊞', embed: '⊟' };
function updateBadge() {
  const b = document.getElementById('modeBadge');
  if (!b) return;
  const m = state.overlayMode;
  b.textContent = `${M_ICONS[m] || '⬡'} ${m}`;
  b.className   = `mode-badge mode-${m}${state.overlayOn ? ' show' : ''}`;
}

/* ── Toast ── */
let _tt = null;
function toast(html) {
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.className = 'toast show';
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ── Tree view (dev panel) ── */
function updateTreeView() {
  const tv = document.getElementById('tree-view');
  if (tv) tv.textContent = treeStr(state.tree, 0);
}

function treeStr(n, d) {
  if (!n) return '';
  const ind    = '  '.repeat(d);
  const extras = [];
  if (n.collapsed) extras.push('col');
  if (n.type === 'tabs') extras.push(`bar:${n.barSide}`, `active:${n.activeTab}`);
  const tag = extras.length ? ` (${extras.join(', ')})` : '';

  if (n.type === 'panel') return `${ind}■ ${n.label} [${n.id}]${tag}\n`;
  if (n.type === 'embed') {
    let s = `${ind}EMBED "${n.label}" [${n.id}]\n`;
    for (const z of ['top', 'bottom', 'left', 'right'])
      if (n.zones[z]) s += treeStr(n.zones[z], d + 1).replace('■', `■ [${z}]`);
    (n.floats || []).forEach(f => { s += `${ind}  ■ [float] ${f.node.label}\n`; });
    return s;
  }
  const lbl = n.label ? ` "${n.label}"` : '';
  let s = `${ind}${n.type.toUpperCase()}${lbl} [${n.id}]${tag}\n`;
  (n.children || []).forEach(c => { s += treeStr(c, d + 1); });
  return s;
}

/* ══════════════════════════════════════════════════════════════
   Global event listeners
══════════════════════════════════════════════════════════════ */

document.addEventListener('dragover', e => e.preventDefault());

// Clean up any stale drag state on a drop outside a drop zone
document.addEventListener('drop', e => {
  e.preventDefault();
  if (dragState.active) {
    dragState.active   = false;
    dragState.srcId    = null;
    dragState.exceptIds = new Set();
    document.querySelectorAll('.lc-panel, .lc-container-wrapper, .embed-float, .lc-tabs')
      .forEach(p => p.style.opacity = '1');
    dispatch({ type: 'HIDE_OVERLAYS' });
  }
});

/* Keyboard listeners & drag mode switching are handled by gui/kbd_shortcuts.js.
   Only the resize connection update is wired here. */

window.addEventListener('resize', updateConnections);

/* ══════════════════════════════════════════════════════════════
   Dev / Test Panel setup
══════════════════════════════════════════════════════════════ */
document.querySelectorAll('.tp-btn[data-type]').forEach(btn => {
  btn.addEventListener('click', () =>
    dispatch({ type: 'ADD_PANEL', label: btn.dataset.label, contentType: btn.dataset.type }));
});

// Draggable dev panel
(function () {
  const panel = document.getElementById('devpanel');
  const hdr   = document.getElementById('dph');
  let ox = 0, oy = 0, sx = 0, sy = 0;
  hdr.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
    const onMove = e => {
      panel.style.right  = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left   = (ox + e.clientX - sx) + 'px';
      panel.style.top    = (oy + e.clientY - sy) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  document.getElementById('dptoggle').addEventListener('click', () => {
    const body   = document.getElementById('dpb');
    const tog    = document.getElementById('dptoggle');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    tog.textContent    = hidden ? '−' : '+';
  });
})();

/* ══════════════════════════════════════════════════════════════
   INIT — Seed layout and first render
══════════════════════════════════════════════════════════════ */
(() => {
  const p1 = makePanel('Chart', 'chart');
  const p2 = makePanel('Table', 'table');
  const p3 = makePanel('Text',  'text');
  p1.flexGrow = 1; p2.flexGrow = 1; p3.flexGrow = 1;

  const topRow = makeContainer('row', [p1, p2]);
  topRow.flexGrow = 1;

  state.tree = makeContainer('col', [topRow, p3]);
  render();
})();
