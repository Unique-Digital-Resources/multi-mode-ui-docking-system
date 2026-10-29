/* ═══════════════════════════════════════════════════════════════
   renderer.js — DOM rendering for all tree node types
   Depends on: trees.js, gui/dock_header.js,
               gui/drag_drop_overlays.js, connections.js
═══════════════════════════════════════════════════════════════ */

/* ── Entry point ─────────────────────────────────────────────── */
/**
 * renderTree(node, ctx, isRoot) → HTMLElement
 *
 * isRoot = true  → root row/col: bare flex container, no wrapper/header/overlay
 * isRoot = false → nested row/col: full wrapper with draggable header + overlay
 */
function renderTree(node, ctx, isRoot = false) {
  if (!node) return document.createTextNode('');
  switch (node.type) {
    case 'row':
    case 'col':   return renderRowCol(node, ctx, isRoot);
    case 'tabs':  return renderTabs(node, ctx);
    case 'embed': return renderEmbed(node, ctx);
    case 'panel': return renderPanel(node, ctx);
    default: {
      const d = document.createElement('div');
      d.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:#f44;font-size:11px';
      d.textContent = `Unknown node type: "${node.type}"`;
      return d;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   Row / Col containers
═══════════════════════════════════════════════════════════════ */
function renderRowCol(node, ctx, isRoot = false) {
  const dir    = node.type === 'row' ? 'row' : 'column';
  const splCls = node.type === 'row' ? 'vertical' : 'horizontal';

  if (isRoot) {
    /* Root container — fills viewport, no wrapper/header/overlay */
    const el = document.createElement('div');
    el.className = 'lc-container';
    el.dataset.id   = node.id;
    el.dataset.type = node.type;
    el.style.cssText = `flex-direction:${dir};flex-grow:${node.flexGrow}`;

    node.children.forEach((child, i) => {
      if (i > 0) el.appendChild(makeSplitter(splCls, node, i - 1, i));
      const childEl = renderTree(child, ctx, false);
      applyCollapse(childEl, child, node.type);
      el.appendChild(childEl);
    });
    return el;
  }

  /* Non-root container — wrapper with header, inner flex, and drop overlay */
  const wrapper = document.createElement('div');
  wrapper.className    = 'lc-container-wrapper';
  wrapper.dataset.id   = node.id;
  wrapper.dataset.type = node.type;
  wrapper.style.flexGrow = node.flexGrow;

  // Header: draggable, shows type badge + child count, collapse + close
  wrapper.appendChild(makeContainerHeader(node, wrapper, ctx));

  // Inner flex container
  const inner = document.createElement('div');
  inner.className  = 'lc-container';
  inner.style.flexDirection = dir;

  node.children.forEach((child, i) => {
    if (i > 0) inner.appendChild(makeSplitter(splCls, node, i - 1, i));
    const childEl = renderTree(child, ctx, false);
    applyCollapse(childEl, child, node.type);
    inner.appendChild(childEl);
  });

  wrapper.appendChild(inner);
  // Containers are drag SOURCES (via header) but NOT drop targets.
  // Drop overlays live only on leaf nodes (panels, tabs, embeds).
  // Putting an overlay here would sit above child panels' overlays and
  // intercept drops intended for the panels inside this container.
  return wrapper;
}

/** Apply collapsed class to a rendered child element based on parent orientation */
function applyCollapse(el, node, parentType) {
  if (node.collapsed) el.classList.add(parentType === 'row' ? 'col-h' : 'col-v');
}

/* ── Splitter ── */
function makeSplitter(cls, containerNode, prevIdx, nextIdx) {
  const spl = document.createElement('div');
  spl.className = `lc-splitter ${cls}`;

  spl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const isV  = cls === 'vertical';
    const dim  = isV ? 'offsetWidth' : 'offsetHeight';
    const startPos = isV ? e.clientX : e.clientY;

    const prev = spl.previousElementSibling;
    const next = spl.nextElementSibling;
    if (!prev || !next) return;
    spl.classList.add('resizing');

    // Snapshot sizes at drag start — used for absolute-delta math each frame.
    const initPrev = prev[dim];
    const initNext = next[dim];
    const minP = containerNode.children[prevIdx]?.minW ?? 60;
    const minN = containerNode.children[nextIdx]?.minW ?? 60;

    const onMove = ev => {
      // Total delta from start — never cumulative, no drift.
      const totalD = (isV ? ev.clientX : ev.clientY) - startPos;
      const newP   = initPrev + totalD;
      const newN   = initNext - totalD;
      if (newP >= minP && newN >= minN) {
        prev.style.flexGrow = newP;
        next.style.flexGrow = newN;
        containerNode.children[prevIdx].flexGrow = newP;
        containerNode.children[nextIdx].flexGrow = newN;
        updateConnections();
      }
    };
    const onUp = () => {
      spl.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      updateConnections();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  return spl;
}

/* ═══════════════════════════════════════════════════════════════
   Panel  (leaf node)
═══════════════════════════════════════════════════════════════ */
function renderPanel(node, ctx) {
  const el = document.createElement('div');
  el.className  = 'lc-panel';
  el.dataset.id = node.id;
  el.style.flexGrow = node.flexGrow;

  el.appendChild(makePanelHeader(node, el, ctx));

  const body = document.createElement('div');
  body.className = 'lc-panel-body';
  body.innerHTML = `
    <span class="body-icon">${ICONS[node.contentType] || ICONS.panel}</span>
    <span class="body-label">${node.label}</span>`;
  el.appendChild(body);
  el.appendChild(buildOverlay(node.id, ctx));
  return el;
}

/* ═══════════════════════════════════════════════════════════════
   Tabs  (parent node with tab bar)
═══════════════════════════════════════════════════════════════ */
function renderTabs(node, ctx) {
  const isV = node.barSide === 'left' || node.barSide === 'right';
  const rev = node.barSide === 'bottom' || node.barSide === 'right';

  const el = document.createElement('div');
  el.className    = `lc-tabs lc-tabs-${node.barSide}`;
  el.dataset.id   = node.id;
  el.dataset.type = 'tabs';
  el.style.cssText = `flex-grow:${node.flexGrow};flex-direction:${
    isV ? (rev ? 'row-reverse' : 'row') : (rev ? 'column-reverse' : 'column')}`;

  /* ── Tab bar ── */
  const bar = document.createElement('div');
  bar.className = `lc-tabs-bar lc-tabs-bar-${isV ? 'vert' : 'horiz'}`;

  // Group drag handle + group cmds (from dock_header.js)
  const { handle: groupHandle, cmds: groupCmds } = makeTabsGroupControls(node, el, ctx);
  bar.appendChild(groupHandle);

  /* ── Individual tabs ──
     Tabs themselves are NOT draggable — clicking always switches tab.
     Each tab has a dedicated grip icon that IS draggable. This separates
     click-to-switch (reliable) from drag-to-move (intentional gesture).
  ── */
  node.children.forEach((child, i) => {
    const dotType = child.contentType || 'panel';
    const tab = document.createElement('div');
    tab.className = `lc-tab${i === node.activeTab ? ' active' : ''}`;
    // NOT draggable at the tab level — see grip below
    tab.innerHTML = `
      <span class="tab-drag-grip" draggable="true" title="Drag to move tab">⠿</span>
      <span class="tab-dot dot-${dotType}"></span>
      <span class="tab-label">${child.label || `Tab ${i + 1}`}</span>
      <button class="tab-close-btn" tabindex="-1">✕</button>`;

    /* Click on tab (not on grip/close btn) → switch */
    tab.addEventListener('click', e => {
      if (e.target.closest('.tab-close-btn') || e.target.closest('.tab-drag-grip')) return;
      ctx.dispatch({ type: 'SET_ACTIVE_TAB', tabsId: node.id, tabIdx: i });
    });

    /* Drag the grip to move this tab OUT of the group */
    const grip = tab.querySelector('.tab-drag-grip');
    grip.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', child.id);
      e.dataTransfer.effectAllowed = 'move';
      const mode = e.shiftKey ? 'embed' : e.ctrlKey ? 'tab' : 'insert';
      const childIds  = ctx.getExcludeIds ? ctx.getExcludeIds(child.id) : new Set([child.id]);
      const exceptIds = new Set([...childIds, node.id]);
      ctx.dragState.srcId     = child.id;
      ctx.dragState.exceptIds = exceptIds;
      ctx.dragState.mode      = mode;
      ctx.dragState.active    = true;
      requestAnimationFrame(() => {
        tab.style.opacity = '0.35';
        ctx.dispatch({ type: 'SHOW_OVERLAYS', exceptIds, mode });
      });
    });
    grip.addEventListener('dragend', () => {
      tab.style.opacity = '1';
      ctx.dispatch({ type: 'HIDE_OVERLAYS' });
      ctx.dragState.active    = false;
      ctx.dragState.srcId     = null;
      ctx.dragState.exceptIds = new Set();
    });

    tab.querySelector('.tab-close-btn').addEventListener('click', e => {
      e.stopPropagation();
      ctx.dispatch({ type: 'CLOSE', id: child.id });
    });

    bar.appendChild(tab);
  });

  bar.appendChild(groupCmds);
  el.appendChild(bar);

  /* ── Active tab content ── */
  const content = document.createElement('div');
  content.className = 'lc-tabs-content';
  const active = node.children[node.activeTab];
  if (active) {
    if (active.type === 'panel') {
      // Inline body for plain panels (no extra wrapper)
      content.innerHTML = `<div class="lc-tab-body">
        <span class="body-icon">${ICONS[active.contentType] || ICONS.panel}</span>
        <span class="body-label">${active.label}</span></div>`;
    } else {
      // Containers, embeds, tabs-within-tabs → render properly
      content.appendChild(renderTree(active, ctx, false));
    }
  }
  el.appendChild(content);
  el.appendChild(buildOverlay(node.id, ctx));
  return el;
}

/* ═══════════════════════════════════════════════════════════════
   Embed  (parent node with overlaid zone panels & floats)
═══════════════════════════════════════════════════════════════ */
function renderEmbed(node, ctx) {
  const el = document.createElement('div');
  el.className    = 'lc-embed';
  el.dataset.id   = node.id;
  el.dataset.type = 'embed';
  el.style.flexGrow = node.flexGrow;

  /* ── Background (host panel's content, dimmed behind zones) ── */
  const bg = document.createElement('div');
  bg.className = 'embed-bg';

  const bgBody = document.createElement('div');
  bgBody.className = 'embed-bg-body';
  bgBody.innerHTML = `
    <span class="body-icon">${ICONS[node.contentType] || ICONS.panel}</span>
    <span class="body-label">${node.label}</span>`;
  bg.appendChild(bgBody);
  el.appendChild(bg);

  /* ── Zone panels ── */
  const sz = node.zoneSizes;
  const z  = node.zones;

  /**
   * Zone layout — "T-shape" model that creates natural corner gaps:
   *
   *   Top  / Bottom zones: full width (left:0, right:0), at top:0 / bottom:0
   *   Left / Right zones:  vertically narrowed by top and bottom zone heights
   *
   * This leaves 4 natural corner squares uncovered, showing the embed background.
   * No corner-gap divs needed — the gap is structural.
   *
   * After resize of top/bottom: re-apply left/right zone positions (they depend on topH/bottomH).
   * After resize of left/right: nothing else changes (top/bottom are always full width).
   */
  /**
   * Mutual-narrowing zone model — creates natural corner gaps:
   *
   *   Top    zone: top:0,    left:leftW,  right:rightW  height:topH
   *   Bottom zone: bottom:0, left:leftW,  right:rightW  height:bottomH
   *   Left   zone: left:0,   top:topH,    bottom:bottomH  width:leftW
   *   Right  zone: right:0,  top:topH,    bottom:bottomH  width:rightW
   *
   * When two adjacent zones are both occupied (e.g. top+left), neither
   * zone extends into the corner square — that square is naturally empty
   * (shows the embed background).  Dimensions of the empty square:
   *   width = leftW / rightW,  height = topH / bottomH.
   *
   * A draggable corner dot handles simultaneous 2-axis resize (see below).
   */
  const applyZonePos = (zEl, zoneName) => {
    const s = zEl.style;
    if (zoneName === 'top') {
      s.top    = '0';
      s.left   = (z.left  ? sz.leftW  : 0) + 'px';
      s.right  = (z.right ? sz.rightW : 0) + 'px';
      s.bottom = ''; s.height = sz.topH + 'px'; s.width = '';
    } else if (zoneName === 'bottom') {
      s.bottom = '0';
      s.left   = (z.left  ? sz.leftW  : 0) + 'px';
      s.right  = (z.right ? sz.rightW : 0) + 'px';
      s.top    = ''; s.height = sz.bottomH + 'px'; s.width = '';
    } else if (zoneName === 'left') {
      s.left   = '0'; s.right = ''; s.width = sz.leftW + 'px';
      s.top    = (z.top    ? sz.topH    : 0) + 'px';
      s.bottom = (z.bottom ? sz.bottomH : 0) + 'px';
      s.height = '';
    } else if (zoneName === 'right') {
      s.right  = '0'; s.left = ''; s.width = sz.rightW + 'px';
      s.top    = (z.top    ? sz.topH    : 0) + 'px';
      s.bottom = (z.bottom ? sz.bottomH : 0) + 'px';
      s.height = '';
    }
  };

  /**
   * After ANY zone resize: re-sync all other zones (cross-axis dependencies).
   *   left/right resize  → top/bottom change their left/right offsets
   *   top/bottom resize  → left/right change their top/bottom offsets
   * Also refreshes corner dots.
   */
  const syncAfterResize = () => {
    for (const zn of ['top', 'bottom', 'left', 'right']) {
      if (!z[zn]) continue;
      const zEl = el.querySelector(`.embed-zone-${zn}`);
      if (zEl) applyZonePos(zEl, zn);
    }
    syncCornerDots();
  };

  for (const zoneName of ['top', 'bottom', 'left', 'right']) {
    if (!z[zoneName]) continue;

    const zWrap = document.createElement('div');
    zWrap.className = `embed-zone embed-zone-${zoneName}`;
    applyZonePos(zWrap, zoneName);

    // Resize handle on the inner edge of each zone
    const rhClass = { top: 'rh-bottom', bottom: 'rh-top', left: 'rh-right', right: 'rh-left' }[zoneName];
    const rh = document.createElement('div');
    rh.className = `embed-rh ${rhClass}`;
    rh.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const isHoriz = zoneName === 'left' || zoneName === 'right';
      // Snapshot initial size and cursor position at drag start.
      const startPos = isHoriz ? e.clientX : e.clientY;
      const initSize = zoneName === 'left'   ? sz.leftW
                     : zoneName === 'right'  ? sz.rightW
                     : zoneName === 'top'    ? sz.topH
                     :                        sz.bottomH;
      // left/top: drag increases size (+); right/bottom: drag decreases size (−)
      const sign = (zoneName === 'right' || zoneName === 'bottom') ? -1 : 1;
      const minSz = (zoneName === 'left' || zoneName === 'right') ? 80 : 60;

      const onMove = ev => {
        const totalD = ((isHoriz ? ev.clientX : ev.clientY) - startPos) * sign;
        const newSize = Math.max(minSz, initSize + totalD);
        if (zoneName === 'left')   { sz.leftW   = newSize; zWrap.style.width  = newSize + 'px'; }
        if (zoneName === 'right')  { sz.rightW  = newSize; zWrap.style.width  = newSize + 'px'; }
        if (zoneName === 'top')    { sz.topH    = newSize; zWrap.style.height = newSize + 'px'; }
        if (zoneName === 'bottom') { sz.bottomH = newSize; zWrap.style.height = newSize + 'px'; }
        syncAfterResize();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    zWrap.appendChild(rh);
    zWrap.appendChild(renderTree(z[zoneName], ctx, false));
    el.appendChild(zWrap);
  }

  /* ── Corner dots for 2-axis resize at occupied adjacent zone corners ── */
  /**
   * syncCornerDots() — places a draggable connection dot at each corner
   * where two adjacent zones meet. Dragging simultaneously resizes the
   * horizontal zone's height AND the vertical zone's width.
   *
   * Corner geometry:
   *   top+left:     x=0,          y=0           width=leftW,  height=topH
   *   top+right:    x=W-rightW,   y=0           width=rightW, height=topH
   *   bottom+left:  x=0,          y=H-bottomH   width=leftW,  height=bottomH
   *   bottom+right: x=W-rightW,   y=H-bottomH   width=rightW, height=bottomH
   *
   * The dot is placed at the inner corner of the gap square (the point
   * where both zone edges meet), matching the splitter-intersection-dot style.
   */
  /**
   * syncCornerDots() — places a corner-resize dot at each occupied adjacent corner.
   *
   * Positioning uses CSS edges (left/right/top/bottom with sz values) — NO offsetWidth/Height.
   * Each dot is centered on the corner intersection via transform.
   *
   * Resizing uses ABSOLUTE delta from mousedown start to avoid cumulative drift:
   *   newSize = clamp(initialSize + totalDelta * sign)
   *
   * Corner config:
   *   hZ / vZ  — which zones must both be occupied
   *   hProp    — 'top' or 'bottom' style edge for the horizontal zone
   *   vProp    — 'left' or 'right' style edge for the vertical zone
   *   hKey     — sz key for horizontal zone height (topH / bottomH)
   *   vKey     — sz key for vertical zone width (leftW / rightW)
   *   hSign    — +1: drag-down grows zone (top), -1: drag-down shrinks zone (bottom)
   *   vSign    — +1: drag-right grows zone (left), -1: drag-right shrinks zone (right)
   *   tfm      — CSS transform to center the dot ON the corner point
   */
  const syncCornerDots = () => {
    el.querySelectorAll('.embed-corner-dot').forEach(d => d.remove());

    const corners = [
      { hZ:'top',    vZ:'left',  hProp:'top',    vProp:'left',  hKey:'topH',    vKey:'leftW',  hSign:+1, vSign:+1, hMin:60, vMin:80, tfm:'translate(-50%,-50%)', cursor:'nwse-resize' },
      { hZ:'top',    vZ:'right', hProp:'top',    vProp:'right', hKey:'topH',    vKey:'rightW', hSign:+1, vSign:-1, hMin:60, vMin:80, tfm:'translate(50%,-50%)',  cursor:'nesw-resize' },
      { hZ:'bottom', vZ:'left',  hProp:'bottom', vProp:'left',  hKey:'bottomH', vKey:'leftW',  hSign:-1, vSign:+1, hMin:60, vMin:80, tfm:'translate(-50%,50%)',  cursor:'nesw-resize' },
      { hZ:'bottom', vZ:'right', hProp:'bottom', vProp:'right', hKey:'bottomH', vKey:'rightW', hSign:-1, vSign:-1, hMin:60, vMin:80, tfm:'translate(50%,50%)',   cursor:'nwse-resize' },
    ];

    corners.forEach(({ hZ, vZ, hProp, vProp, hKey, vKey, hSign, vSign, hMin, vMin, tfm, cursor }) => {
      if (!z[hZ] || !z[vZ]) return;

      const dot = document.createElement('div');
      dot.className = 'embed-corner-dot';
      // Use CSS edges from sz values — no offsetWidth/Height needed
      dot.style.cssText = `${vProp}:${sz[vKey]}px;${hProp}:${sz[hKey]}px;transform:${tfm};cursor:${cursor}`;

      dot.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();

        const startX  = e.clientX, startY = e.clientY;
        const initH   = sz[hKey];    // snapshot at drag start
        const initV   = sz[vKey];

        const onMove = ev => {
          const totalDX = ev.clientX - startX;
          const totalDY = ev.clientY - startY;
          // Absolute: compute from initial size + total delta * sign
          sz[hKey] = Math.max(hMin, initH + totalDY * hSign);
          sz[vKey] = Math.max(vMin, initV + totalDX * vSign);
          syncAfterResize();
          // Live-update this dot's CSS edges
          dot.style[vProp] = sz[vKey] + 'px';
          dot.style[hProp] = sz[hKey] + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      el.appendChild(dot);
    });
  };

  // Initial corner dots
  syncCornerDots();

  /* ── Float panels ── */
  (node.floats || []).forEach((f, _fi) => {
    const fEl = document.createElement('div');
    fEl.className  = 'embed-float';
    fEl.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`;

    const fChild = f.node;
    const dotType = fChild.contentType || 'panel';

    /* Float header */
    const fHdr = document.createElement('div');
    fHdr.className = 'lc-panel-header';
    fHdr.setAttribute('draggable', 'true');
    fHdr.innerHTML = `
      <span class="panel-dot dot-${dotType}"></span>
      <span class="panel-title">${fChild.label} <em style="opacity:.45">[float]</em></span>
      <div class="header-cmds">
        <button class="cmd-btn" data-role="collapse" title="Collapse/Expand">−</button>
        <button class="cmd-btn danger" data-role="close" title="Close">✕</button>
      </div>`;

    /* Move float within embed (mousedown drag on header) */
    fHdr.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      const ox = f.x, oy = f.y, sx = e.clientX, sy = e.clientY;
      const onMove = ev => {
        f.x = Math.max(0, ox + ev.clientX - sx);
        f.y = Math.max(0, oy + ev.clientY - sy);
        fEl.style.left = f.x + 'px';
        fEl.style.top  = f.y + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    /* Drag float OUT to another dock via the draggable attribute */
    fHdr.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', fChild.id);
      e.dataTransfer.effectAllowed = 'move';
      const mode = e.shiftKey ? 'embed' : e.ctrlKey ? 'tab' : 'insert';
      const childIds  = ctx.getExcludeIds ? ctx.getExcludeIds(fChild.id) : new Set([fChild.id]);
      const exceptIds = new Set([...childIds, node.id]);  // also hide the host embed overlay
      ctx.dragState.srcId    = fChild.id;
      ctx.dragState.exceptIds = exceptIds;
      ctx.dragState.mode     = mode;
      ctx.dragState.active   = true;
      requestAnimationFrame(() => {
        fEl.style.opacity = '0.3';
        ctx.dispatch({ type: 'SHOW_OVERLAYS', exceptIds, mode });
      });
    });
    fHdr.addEventListener('dragend', () => {
      fEl.style.opacity = '1';
      ctx.dispatch({ type: 'HIDE_OVERLAYS' });
      ctx.dragState.active  = false;
      ctx.dragState.srcId   = null;
      ctx.dragState.exceptIds = new Set();
    });

    /* Float header command buttons */
    fHdr.querySelectorAll('.cmd-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.dataset.role === 'collapse') {
          const collapsed = fEl.classList.toggle('embed-float-collapsed');
          btn.textContent = collapsed ? '+' : '−';
        } else {
          ctx.dispatch({ type: 'CLOSE', id: fChild.id });
        }
      });
    });

    /* Float body */
    const fBody = document.createElement('div');
    fBody.className = 'lc-panel-body';
    fBody.innerHTML = `
      <span class="body-icon">${ICONS[fChild.contentType] || ICONS.panel}</span>
      <span class="body-label">${fChild.label}</span>`;

    fEl.appendChild(fHdr);
    fEl.appendChild(fBody);

    /* ── Float resize handles (right edge, bottom edge, bottom-right corner) ── */
    makeFloatResizeHandles(fEl, f);

    el.appendChild(fEl);
  });

  /* ── Embed header: direct child of el so z-index is in el's stacking context ──
     Must be appended AFTER zones so it paints on top (z-index:6 > zones z-index:2). */
  el.appendChild(makeEmbedHeader(node, el, ctx));

  el.appendChild(buildOverlay(node.id, ctx));
  return el;
}

/* ═══════════════════════════════════════════════════════════════
   Float panel resize handles — 8 directions
═══════════════════════════════════════════════════════════════ */
/**
 * Attaches 8 resize handles (N S E W + 4 corners) to a float element.
 *
 * Edges that move the origin (W and N) must BOTH shift the position (f.x / f.y)
 * AND shrink the size (f.w / f.h) so the opposite edge stays fixed.
 *
 * Mutates f.x / f.y / f.w / f.h and syncs fEl inline style directly.
 */
function makeFloatResizeHandles(fEl, f) {
  // Each handle descriptor:
  //   cls    — CSS class (maps to cursor & position in stylesheet)
  //   dw     — multiplier for width delta: +1 (E side grows), -1 (W side grows)
  //   dh     — multiplier for height delta: +1 (S side grows), -1 (N side grows)
  //   moveX  — true when dragging also shifts f.x (W edges)
  //   moveY  — true when dragging also shifts f.y (N edges)
  const handles = [
    { cls: 'float-rh-e',   dw:+1, dh: 0, moveX: false, moveY: false },
    { cls: 'float-rh-w',   dw:-1, dh: 0, moveX: true,  moveY: false },
    { cls: 'float-rh-s',   dw: 0, dh:+1, moveX: false, moveY: false },
    { cls: 'float-rh-n',   dw: 0, dh:-1, moveX: false, moveY: true  },
    { cls: 'float-rh-se',  dw:+1, dh:+1, moveX: false, moveY: false },
    { cls: 'float-rh-sw',  dw:-1, dh:+1, moveX: true,  moveY: false },
    { cls: 'float-rh-ne',  dw:+1, dh:-1, moveX: false, moveY: true  },
    { cls: 'float-rh-nw',  dw:-1, dh:-1, moveX: true,  moveY: true  },
  ];

  handles.forEach(({ cls, dw, dh, moveX, moveY }) => {
    const rh = document.createElement('div');
    rh.className = `embed-float-rh ${cls}`;

    rh.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX, startY = e.clientY;
      const startW = f.w, startH = f.h, startFX = f.x, startFY = f.y;

      const onMove = ev => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (dw !== 0) {
          const newW = Math.max(140, startW + dx * dw);
          if (moveX) {
            // West edge: x moves right as width shrinks
            f.x = startFX + (startW - newW);
            fEl.style.left = f.x + 'px';
          }
          f.w = newW;
          fEl.style.width = f.w + 'px';
        }

        if (dh !== 0) {
          const newH = Math.max(80, startH + dy * dh);
          if (moveY) {
            // North edge: y moves down as height shrinks
            f.y = startFY + (startH - newH);
            fEl.style.top = f.y + 'px';
          }
          f.h = newH;
          fEl.style.height = f.h + 'px';
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    fEl.appendChild(rh);
  });
}
