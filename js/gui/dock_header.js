/* ═══════════════════════════════════════════════════════════════
   gui/dock_header.js — Header builders for all dock types
   GUI knows commands (via ctx.dispatch); commands don't know GUI.
   Depends on: trees.js (ICONS)
═══════════════════════════════════════════════════════════════ */

/** Shared grip SVG markup */
const GRIP_SVG = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
  <circle cx="2.5" cy="2"  r="1.3"/><circle cx="7.5" cy="2"  r="1.3"/>
  <circle cx="2.5" cy="7"  r="1.3"/><circle cx="7.5" cy="7"  r="1.3"/>
  <circle cx="2.5" cy="12" r="1.3"/><circle cx="7.5" cy="12" r="1.3"/>
</svg>`;

/**
 * Wire drag-start / drag-end events onto any header element.
 * @param {HTMLElement} hdrEl       - The draggable header element
 * @param {string}      srcNodeId   - ID of the node being dragged
 * @param {string}      exceptId    - Overlay to suppress (usually srcNodeId)
 * @param {HTMLElement} opacityEl   - Element to dim while dragging
 * @param {object}      ctx         - { dispatch, dragState }
 */
function wireDragEvents(hdrEl, srcNodeId, exceptId, opacityEl, ctx) {
  hdrEl.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', srcNodeId);
    e.dataTransfer.effectAllowed = 'move';
    const mode = e.shiftKey ? 'embed' : e.ctrlKey ? 'tab' : 'insert';
    ctx.dragState.srcId    = srcNodeId;
    ctx.dragState.exceptId = exceptId;
    ctx.dragState.mode     = mode;
    ctx.dragState.active   = true;
    requestAnimationFrame(() => {
      if (opacityEl) opacityEl.style.opacity = '0.25';
      ctx.dispatch({ type: 'SHOW_OVERLAYS', exceptId, mode });
    });
  });
  hdrEl.addEventListener('dragend', () => {
    if (opacityEl) opacityEl.style.opacity = '1';
    ctx.dispatch({ type: 'HIDE_OVERLAYS' });
    ctx.dragState.active = false;
    ctx.dragState.srcId  = null;
  });
}

/**
 * Wire collapse + close command buttons inside a header element.
 * @param {HTMLElement} hdrEl   - Header element containing .cmd-btn elements
 * @param {string}      id      - Node ID for the commands
 * @param {object}      ctx
 */
function wireHeaderCmds(hdrEl, id, ctx) {
  hdrEl.querySelectorAll('.cmd-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.role === 'collapse')
        ctx.dispatch({ type: 'COLLAPSE', id });
      else if (btn.dataset.role === 'close')
        ctx.dispatch({ type: 'CLOSE', id });
    });
  });
}

// ─────────────────────────────────────────────────────────────
//  Panel header  (for leaf panel nodes)
// ─────────────────────────────────────────────────────────────
/**
 * @param {object}      node           - Panel tree node
 * @param {HTMLElement} panelEl        - The .lc-panel element to dim on drag
 * @param {object}      ctx
 * @param {string}      [overrideExceptId]  - Custom exceptId (e.g. for tab children)
 */
function makePanelHeader(node, panelEl, ctx, overrideExceptId) {
  const hdr = document.createElement('div');
  hdr.className = 'lc-panel-header';
  hdr.setAttribute('draggable', 'true');

  const collapseIcon = node.collapsed ? '+' : '−';

  hdr.innerHTML = `
    <span class="panel-dot dot-${node.contentType || 'panel'}"></span>
    <span class="panel-title">${node.label}</span>
    <div class="header-cmds">
      <button class="cmd-btn" data-role="collapse" title="Collapse/Expand">${collapseIcon}</button>
      <button class="cmd-btn danger" data-role="close" title="Close">✕</button>
    </div>
    <span class="panel-grip" aria-hidden="true">${GRIP_SVG}</span>`;

  const exceptId = overrideExceptId ?? node.id;
  wireDragEvents(hdr, node.id, exceptId, panelEl, ctx);
  wireHeaderCmds(hdr, node.id, ctx);
  return hdr;
}

// ─────────────────────────────────────────────────────────────
//  Container header  (for row / col parent nodes)
// ─────────────────────────────────────────────────────────────
/**
 * @param {object}      node       - Container tree node (type: 'row' | 'col')
 * @param {HTMLElement} wrapperEl  - The .lc-container-wrapper element to dim on drag
 * @param {object}      ctx
 */
function makeContainerHeader(node, wrapperEl, ctx) {
  const hdr = document.createElement('div');
  hdr.className = 'lc-container-header';
  hdr.setAttribute('draggable', 'true');

  const typeLabel    = node.type === 'row' ? 'ROW' : 'COL';
  const collapseIcon = node.collapsed ? '+' : '−';
  const label        = node.label || (node.type === 'row' ? 'Row Group' : 'Col Group');
  const childCount   = (node.children || []).length;

  hdr.innerHTML = `
    <span class="panel-dot dot-group"></span>
    <span class="container-type-badge">${typeLabel}</span>
    <span class="panel-title">${label}</span>
    <span class="container-child-count">${childCount}</span>
    <div class="header-cmds">
      <button class="cmd-btn" data-role="collapse" title="Collapse/Expand">${collapseIcon}</button>
      <button class="cmd-btn danger" data-role="close" title="Close Group">✕</button>
    </div>
    <span class="panel-grip" aria-hidden="true">${GRIP_SVG}</span>`;

  // The whole wrapper dims while dragging; exceptId = node.id hides its own overlay
  wireDragEvents(hdr, node.id, node.id, wrapperEl, ctx);
  wireHeaderCmds(hdr, node.id, ctx);
  return hdr;
}

// ─────────────────────────────────────────────────────────────
//  Tabs-group controls  (injected into the existing tabs bar)
// ─────────────────────────────────────────────────────────────
/**
 * Returns a drag-handle element and a group-commands element to
 * be prepended/appended to the tabs bar.
 *
 * @param {object}      node    - Tabs tree node
 * @param {HTMLElement} tabsEl  - The .lc-tabs element to dim on drag
 * @param {object}      ctx
 * @returns {{ handle: HTMLElement, cmds: HTMLElement }}
 */
function makeTabsGroupControls(node, tabsEl, ctx) {
  // Drag handle (prepended to bar)
  const handle = document.createElement('div');
  handle.className = 'tabs-group-handle';
  handle.setAttribute('draggable', 'true');
  handle.title = 'Drag tab group';
  handle.innerHTML = GRIP_SVG;

  wireDragEvents(handle, node.id, node.id, tabsEl, ctx);

  // Collapse + close (appended to bar)
  const cmds = document.createElement('div');
  cmds.className = 'tabs-group-cmds';
  const collapseIcon = node.collapsed ? '+' : '−';
  cmds.innerHTML = `
    <button class="cmd-btn" data-role="collapse" title="Collapse/Expand">${collapseIcon}</button>
    <button class="cmd-btn danger" data-role="close" title="Close Tab Group">✕</button>`;

  cmds.querySelectorAll('.cmd-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.role === 'collapse')
        ctx.dispatch({ type: 'COLLAPSE', id: node.id });
      else
        ctx.dispatch({ type: 'CLOSE', id: node.id });
    });
  });

  return { handle, cmds };
}

// ─────────────────────────────────────────────────────────────
//  Embed header  (the background host panel's draggable header)
// ─────────────────────────────────────────────────────────────
/**
 * @param {object}      node   - Embed tree node
 * @param {HTMLElement} embedEl - The .lc-embed element to dim on drag
 * @param {object}      ctx
 */
function makeEmbedHeader(node, embedEl, ctx) {
  const hdr = document.createElement('div');
  hdr.className = 'lc-embed-header';
  hdr.setAttribute('draggable', 'true');

  const collapseIcon = node.collapsed ? '+' : '−';

  hdr.innerHTML = `
    <span class="panel-dot dot-${node.contentType || 'panel'}"></span>
    <span class="panel-title">${node.label} <em style="opacity:.5">[embed]</em></span>
    <div class="header-cmds">
      <button class="cmd-btn" data-role="collapse" title="Collapse/Expand">${collapseIcon}</button>
      <button class="cmd-btn danger" data-role="close" title="Close Embed">✕</button>
    </div>
    <span class="panel-grip" aria-hidden="true">${GRIP_SVG}</span>`;

  wireDragEvents(hdr, node.id, node.id, embedEl, ctx);
  wireHeaderCmds(hdr, node.id, ctx);
  return hdr;
}
