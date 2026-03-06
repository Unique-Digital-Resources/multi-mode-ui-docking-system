/* ═══════════════════════════════════════════════════════
   EmbedManager — faithful port of EmbedDock.html

   Architecture:
   • embedState lives on each PANEL OBJECT (panelData[i]), NOT on the dock.
     This way embed layers are mounted inside the panel's own .dock-panel div,
     and show/hide automatically with the panel (display:none / display:flex).
     Embedded content from an inactive tab can never bleed over sibling docks
     or over the active tab's content.
   • panel.embedState = { zones:{top,bottom,left,right}, floats:[], domZ, domRH, floatLayer, overlay }
   • zone = { axis:'h'|'v', side, slots:[{slot,flex}], thickness }
   • slot = { id, type:'card'|'tabgroup', title, ... }
   • tabgroup = { id, type:'tabgroup', tabs:[{id,title}], activeId }

   Layers inside each .dock-panel (z-order):
     z=10 : zone divs   (.ez — position:absolute per side)
     z=11 : zone edge resize handles (.ez-rh)
     z=50 : float-layer (.ez-float-layer)
     z=800: drop-overlay (.ez-drop-overlay)

   .dock-panel already has position:relative (set below) and toggles
   display:none / display:flex — so all embed layers inside it are
   naturally hidden when their panel is not the active tab.
═══════════════════════════════════════════════════════ */

const EmbedManager = {

  /* ── Constants (matching EmbedDock.html) ────── */
  SNAP:  130,
  MIN_Z: 55,
  DEF_H: 170,
  DEF_V: 210,
  PAD:   6,

  /* ── Global z counter shared by all zones+floats ── */
  _topZ: 100,
  bringToTop(el) { el.style.zIndex = ++EmbedManager._topZ; },

  /* ── uid ── */
  _id: 0,
  uid() { return 'e' + (++EmbedManager._id); },

  /* ── Return the active panel object for a dock ── */
  _activePanel(dock) {
    return dock.panelData[dock.activePanelIndex ?? 0] || dock.panelData[0] || null;
  },

  /* ── rect of the active panel's .dock-panel element for float coordinate origin ── */
  _panelRect(dock) {
    const idx = dock.activePanelIndex ?? 0;
    const el = dock.querySelector(`.dock-panel[data-pi="${idx}"]`);
    return (el || dock).getBoundingClientRect();
  },

  /* ═══════════════════════════════════════════════
     SAVE / RESTORE embed layers across innerHTML rebuilds.

     embedState lives on panelData objects, so it survives dock HTML rebuilds.
     We just need to detach the DOM nodes before innerHTML wipe, then re-mount
     them into the freshly-built .dock-panel divs afterwards.

     _saveEmbedLayers(dock)   — detach all panel embed layer nodes from DOM
     _restoreEmbedLayers(dock) — re-mount them into the new .dock-panel divs
  ═══════════════════════════════════════════════ */
  _saveEmbedLayers(dock) {
    dock.panelData.forEach(panel => {
      const es = panel.embedState;
      if (!es) return;
      [
        es.domZ.top, es.domZ.bottom, es.domZ.left, es.domZ.right,
        es.domRH.top, es.domRH.bottom, es.domRH.left, es.domRH.right,
        es.floatLayer, es.overlay
      ].forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
    });
  },

  _restoreEmbedLayers(dock) {
    dock.panelData.forEach((panel, i) => {
      const es = panel.embedState;
      if (!es) return;
      /* Find the matching .dock-panel[data-pi] in the freshly-built HTML */
      const panelEl = dock.querySelector(`.dock-panel[data-pi="${i}"]`);
      if (!panelEl) return;
      /* Ensure the panel div is a positioned container for absolute children */
      panelEl.style.position = 'relative';
      [
        es.domZ.top, es.domZ.bottom, es.domZ.left, es.domZ.right,
        es.domRH.top, es.domRH.bottom, es.domRH.left, es.domRH.right,
        es.floatLayer, es.overlay
      ].forEach(n => { if (n) panelEl.appendChild(n); });
    });
  },

  /* ═══════════════════════════════════════════════
     INIT — called once per dock after its HTML is built.
     Creates embedState on any panel that doesn't have one yet,
     and mounts the embed layer DOM inside each panel's .dock-panel div.
  ═══════════════════════════════════════════════ */
  initDock(system, dock) {
    /* initDock may be called multiple times (e.g. after tab merge).
       We initialise any panel that doesn't have embedState yet,
       and (re-)mount all panel embed layers into their .dock-panel divs. */
    dock.panelData.forEach((panel, i) => {
      if (!panel.embedState) {
        EmbedManager._initPanel(panel);
      }
      /* Always (re-)mount into the current .dock-panel[data-pi] element */
      const panelEl = dock.querySelector(`.dock-panel[data-pi="${i}"]`);
      if (panelEl) {
        panelEl.style.position = 'relative';
        const es = panel.embedState;
        [
          es.domZ.top, es.domZ.bottom, es.domZ.left, es.domZ.right,
          es.domRH.top, es.domRH.bottom, es.domRH.left, es.domRH.right,
          es.floatLayer, es.overlay
        ].forEach(n => { if (n && n.parentNode !== panelEl) panelEl.appendChild(n); });
      }
    });

    /* Mark dock so setupDockEvents knows embed is ready */
    dock._embedInited = true;

    /* Setup zone edge resize handles for every panel */
    dock.panelData.forEach(panel => {
      ['top','bottom','left','right'].forEach(s =>
        EmbedManager._setupEdgeResize(dock, panel, s)
      );
    });
  },

  /* Create embedState + DOM nodes for one panel (no mounting yet) */
  _initPanel(panel) {
    const es = {
      zones: {
        top:    { side:'top',    axis:'h', slots:[], thickness: EmbedManager.DEF_H },
        bottom: { side:'bottom', axis:'h', slots:[], thickness: EmbedManager.DEF_H },
        left:   { side:'left',  axis:'v', slots:[], thickness: EmbedManager.DEF_V },
        right:  { side:'right', axis:'v', slots:[], thickness: EmbedManager.DEF_V },
      },
      floats: [],
      domZ:  {},
      domRH: {},
      floatLayer: null,
      overlay: null,
    };
    panel.embedState = es;

    const mk = (cls, style) => {
      const d = document.createElement('div');
      d.className = cls;
      if (style) d.style.cssText = style;
      return d;
    };

    es.domZ.top    = mk('ez ax-h side-top',    'display:none');
    es.domZ.bottom = mk('ez ax-h side-bottom',  'display:none');
    es.domZ.left   = mk('ez ax-v side-left',    'display:none');
    es.domZ.right  = mk('ez ax-v side-right',   'display:none');
    es.domRH.top   = mk('ez-rh rh-h side-top',    'display:none');
    es.domRH.bottom= mk('ez-rh rh-h side-bottom',  'display:none');
    es.domRH.left  = mk('ez-rh rh-v side-left',    'display:none');
    es.domRH.right = mk('ez-rh rh-v side-right',   'display:none');
    es.floatLayer  = mk('ez-float-layer');
    es.overlay     = mk('ez-drop-overlay');
  },

  /* ═══════════════════════════════════════════════
     ZONE EDGE RESIZE
  ═══════════════════════════════════════════════ */
  _setupEdgeResize(dock, panel, side) {
    const es   = panel.embedState;
    const zone = es.zones[side];
    const rhEl = es.domRH[side];
    const zEl  = es.domZ[side];
    const isH  = zone.axis === 'h';
    const flip = side === 'bottom' || side === 'right';

    rhEl.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const start = isH ? e.clientY : e.clientX;
      const init  = zone.thickness;
      rhEl.classList.add('active');
      document.body.style.cursor = isH ? 'row-resize' : 'col-resize';

      const mv = ev => {
        let d = (isH ? ev.clientY : ev.clientX) - start;
        if (flip) d = -d;
        zone.thickness = Math.max(EmbedManager.MIN_Z, init + d);
        EmbedManager._applyThickness(zone, zEl, rhEl);
        EmbedManager._updateCorners(dock, panel);
      };
      const up = () => {
        rhEl.classList.remove('active');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  },

  _applyThickness(zone, zEl, rhEl) {
    if (zone.axis === 'h') {
      zEl.style.height = zone.thickness + 'px';
      if (zone.side === 'top')    { rhEl.style.top = zone.thickness + 'px'; rhEl.style.bottom = ''; }
      if (zone.side === 'bottom') { rhEl.style.bottom = zone.thickness + 'px'; rhEl.style.top = ''; }
    } else {
      zEl.style.width = zone.thickness + 'px';
      if (zone.side === 'left')  { rhEl.style.left = zone.thickness + 'px'; rhEl.style.right = ''; }
      if (zone.side === 'right') { rhEl.style.right = zone.thickness + 'px'; rhEl.style.left = ''; }
    }
  },

  /* ═══════════════════════════════════════════════
     CORNER CUTOUTS
  ═══════════════════════════════════════════════ */
  _updateCorners(dock, panel) {
    const es = (panel || EmbedManager._activePanel(dock))?.embedState;
    if (!es) return;
    const lw = es.zones.left.slots.length   > 0 ? es.zones.left.thickness   + 5 : 0;
    const rw = es.zones.right.slots.length  > 0 ? es.zones.right.thickness  + 5 : 0;
    const th = es.zones.top.slots.length    > 0 ? es.zones.top.thickness    + 5 : 0;
    const bh = es.zones.bottom.slots.length > 0 ? es.zones.bottom.thickness + 5 : 0;

    es.domZ.top.style.left      = lw + 'px';
    es.domZ.top.style.right     = rw + 'px';
    es.domZ.bottom.style.left   = lw + 'px';
    es.domZ.bottom.style.right  = rw + 'px';
    es.domRH.top.style.left     = lw + 'px';
    es.domRH.top.style.right    = rw + 'px';
    es.domRH.bottom.style.left  = lw + 'px';
    es.domRH.bottom.style.right = rw + 'px';

    es.domZ.left.style.top       = th + 'px';
    es.domZ.left.style.bottom    = bh + 'px';
    es.domZ.right.style.top      = th + 'px';
    es.domZ.right.style.bottom   = bh + 'px';
    es.domRH.left.style.top      = th + 'px';
    es.domRH.left.style.bottom   = bh + 'px';
    es.domRH.right.style.top     = th + 'px';
    es.domRH.right.style.bottom  = bh + 'px';
  },

  /* ═══════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════ */
  renderBoard(dock) {
    dock.panelData.forEach(panel => {
      if (!panel.embedState) return;
      ['top','bottom','left','right'].forEach(s => EmbedManager.renderZone(dock, s, panel));
      EmbedManager._updateCorners(dock, panel);
      EmbedManager.renderFloats(dock, panel);
    });
  },

  renderZone(dock, side, panel) {
    panel = panel || EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const es    = panel.embedState;
    const zone  = es.zones[side];
    const zEl   = es.domZ[side];
    const rhEl  = es.domRH[side];
    const empty = zone.slots.length === 0;

    zEl.style.display  = empty ? 'none' : 'flex';
    rhEl.style.display = empty ? 'none' : 'block';
    if (empty) { EmbedManager._updateCorners(dock, panel); return; }

    EmbedManager._applyThickness(zone, zEl, rhEl);
    zEl.innerHTML = '';

    zone.slots.forEach((sw, i) => {
      const el = EmbedManager._buildSlotEl(dock, sw.slot, side, false);
      el.style.flex = String(sw.flex);
      el.addEventListener('mousedown', () => {
        EmbedManager.bringToTop(zEl);
      }, true);
      zEl.appendChild(el);
    });

    EmbedManager._updateCorners(dock, panel);
  },

  renderFloats(dock, panel) {
    panel = panel || EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const es = panel.embedState;
    es.floatLayer.querySelectorAll('.ec-embedded-dock.ec-floating, .ec-tab-group.ec-floating').forEach(e => e.remove());

    es.floats.forEach(fp => {
      /* Give every new float a z above all zone defaults (zones are z:10 in CSS) */
      if (!fp.z) fp.z = ++EmbedManager._topZ;

      const el = EmbedManager._buildSlotEl(dock, fp.slot, 'float', true);
      el.style.left   = fp.x + 'px';
      el.style.top    = fp.y + 'px';
      el.style.zIndex = fp.z;
      es.floatLayer.appendChild(el);

      /* mousedown raises this float above everything else (zones + other floats) */
      el.addEventListener('mousedown', () => {
        fp.z = ++EmbedManager._topZ;
        el.style.zIndex = fp.z;
      }, true);

      /* Drag float by header — plain drag moves it, Shift mid-drag switches to dock-zone embed */
      const hdTarget = el.querySelector('.ec-hdr, .ec-tab-bar');
      if (hdTarget) {
        hdTarget.addEventListener('mousedown', e => {
          if (e.target.closest('.ec-btn')) return;
          e.preventDefault();
          const sx = e.clientX - fp.x, sy = e.clientY - fp.y;
          let inDockMode = e.shiftKey;

          const _ghostLabel = () => fp.slot.type === 'tabgroup'
            ? (inDockMode ? '⊞ Tab Group  (release Shift = free float)' : '⠿ Tab Group  (Shift = dock to zone)')
            : (inDockMode ? '⊞ ' + fp.slot.title + '  (release Shift = free float)' : '⠿ ' + fp.slot.title + '  (Shift = dock to zone)');

          if (inDockMode) {
            /* Started in dock mode — remove from floats, show ghost */
            const rem = EmbedManager._removeSlot(dock, fp.slot.id);
            if (rem) EmbedManager.renderFloats(dock);
            EmbedManager._showGhost(_ghostLabel());
            EmbedManager._DD = { slot: fp.slot, srcDock: dock, side: null, pos: null, tDock: null };
          }

          const _clearOverlays = (exceptDock) => {
            document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
              const ownerPanel = EmbedManager._activePanel(exceptDock);
              if (!exceptDock || o !== ownerPanel?.embedState?.overlay) {
                o.classList.remove('show'); o.innerHTML = '';
              }
            });
          };

          const mv = ev => {
            const nowShift = ev.shiftKey;

            if (nowShift && !inDockMode) {
              inDockMode = true;
              const rem = EmbedManager._removeSlot(dock, fp.slot.id);
              if (rem) EmbedManager.renderFloats(dock);
              EmbedManager._showGhost(_ghostLabel());
              EmbedManager._DD = { slot: fp.slot, srcDock: dock, side: null, pos: null, tDock: null };
            } else if (!nowShift && inDockMode) {
              inDockMode = false;
              _clearOverlays(null);
              EmbedManager._DD = null;
              EmbedManager._hideGhost();
              const cr = EmbedManager._panelRect(dock);
              fp.x = ev.clientX - cr.left - 50;
              fp.y = ev.clientY - cr.top  - 14;
              const activePanel = EmbedManager._activePanel(dock);
              if (activePanel && !activePanel.embedState.floats.includes(fp))
                activePanel.embedState.floats.push(fp);
              EmbedManager.renderFloats(dock);
            }

            if (inDockMode) {
              EmbedManager._moveGhost(ev);
              const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
              _clearOverlays(hb || null);
              if (hb) {
                EmbedManager.initDock(null, hb);
                EmbedManager._showOverlay(hb);
                EmbedManager._DD.tDock = hb;
                EmbedManager._updateOverlay(hb, ev.clientX, ev.clientY);
              } else {
                if (EmbedManager._DD) { EmbedManager._DD.side = null; EmbedManager._DD.tDock = null; }
              }
            } else {
              fp.x = ev.clientX - sx; fp.y = ev.clientY - sy;
              el.style.left = fp.x + 'px'; el.style.top = fp.y + 'px';
            }
          };

          const up = ev => {
            _clearOverlays(null);
            EmbedManager._hideGhost();

            if (inDockMode && EmbedManager._DD) {
              const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
              if (hb && EmbedManager._DD.side) {
                EmbedManager.initDock(null, hb);
                EmbedManager._dockTo(hb, fp.slot, EmbedManager._DD.side, EmbedManager._DD.pos || 'last');
                EmbedManager.renderZone(hb, EmbedManager._DD.side);
                EmbedManager._updateCorners(hb);
              } else {
                const tb = hb || dock;
                EmbedManager.initDock(null, tb);
                const cr = EmbedManager._panelRect(tb);
                const activePanel = EmbedManager._activePanel(tb);
                if (activePanel && !activePanel.embedState.floats.some(f => f.slot.id === fp.slot.id)) {
                  activePanel.embedState.floats.push({
                    slot: fp.slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
                    z: ++EmbedManager._topZ
                  });
                }
                EmbedManager.renderFloats(tb);
              }
              EmbedManager._DD = null;
            }

            document.removeEventListener('mousemove', mv);
            document.removeEventListener('mouseup', up);
          };

          document.addEventListener('mousemove', mv);
          document.addEventListener('mouseup', up);
        });
      }
    });
  },

  /* ═══════════════════════════════════════════════
     SLOT BUILDERS  (card + tabgroup, matching EmbedDock.html)
  ═══════════════════════════════════════════════ */
  _buildSlotEl(dock, slot, side, floating) {
    return slot.type === 'card'
      ? EmbedManager._buildCardEl(dock, slot, side, floating)
      : EmbedManager._buildTabGroupEl(dock, slot, side, floating);
  },

  _buildCardEl(dock, card, side, floating) {
    const wrap = document.createElement('div');
    wrap.className = 'ec-embedded-dock' + (floating ? ' ec-floating' : '');
    wrap.dataset.slotId  = card.id;

    const hdr    = document.createElement('div');
    hdr.className = 'ec-hdr';

    const bFree  = document.createElement('button');
    bFree.className = 'ec-btn ec-b-free';
    bFree.title = 'Drag = free float  |  Shift+Drag = dock to zone';
    bFree.textContent = '⠿';

    const title  = document.createElement('span');
    title.className = 'ec-title'; title.textContent = card.title;

    hdr.append(bFree, title);

    const body = document.createElement('div');
    body.className = 'ec-body';

    wrap.append(hdr, body);

    bFree.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) {
        EmbedManager._startDockDrag(dock, card, e);
      } else {
        EmbedManager._startFreeDrag(dock, card, e);
      }
    });
    return wrap;
  },

  _buildTabGroupEl(dock, tg, side, floating) {
    const wrap = document.createElement('div');
    wrap.className = 'ec-tab-group' + (floating ? ' ec-floating' : '');
    if (side === 'left')   wrap.classList.add('tbl-left');
    if (side === 'right')  wrap.classList.add('tbl-right');
    if (side === 'bottom') wrap.classList.add('tbl-bot');
    wrap.dataset.slotId = tg.id;

    const tabBar = document.createElement('div');
    tabBar.className = 'ec-tab-bar';

    const ctrl  = document.createElement('div');
    ctrl.className = 'ec-tb-ctrl';

    const bFree = document.createElement('button');
    bFree.className = 'ec-btn ec-b-small ec-b-free';
    bFree.title = 'Drag = free float  |  Shift+Drag = dock to zone';
    bFree.textContent = '⠿';

    ctrl.append(bFree);
    tabBar.appendChild(ctrl);

    tg.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'ec-tab-item' + (tab.id === tg.activeId ? ' active' : '');
      tabEl.dataset.tabId = tab.id;

      const lbl = document.createElement('span');
      lbl.className = 'ec-tab-lbl'; lbl.textContent = tab.title;

      const untab = document.createElement('button');
      untab.className = 'ec-btn ec-b-untab'; untab.title = 'Detach tab'; untab.textContent = '↗';
      untab.addEventListener('click', e => {
        e.stopPropagation();
        EmbedManager._doUntab(dock, tg, tab.id);
      });

      tabEl.append(lbl, untab);
      tabEl.addEventListener('click', () => {
        tg.activeId = tab.id;
        const s = EmbedManager._findZone(dock, tg.id);
        if (s) EmbedManager.renderZone(dock, s);
        else   EmbedManager.renderFloats(dock);
      });
      tabBar.appendChild(tabEl);
    });

    const content = document.createElement('div');
    content.className = 'ec-tab-content';

    wrap.append(tabBar, content);

    bFree.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) {
        EmbedManager._startDockDrag(dock, tg, e);
      } else {
        EmbedManager._startFreeDrag(dock, tg, e);
      }
    });
    return wrap;
  },

  /* ═══════════════════════════════════════════════
     SLOT OPERATIONS
  ═══════════════════════════════════════════════ */
  addFloat(dock, title) {
    EmbedManager.initDock(null, dock);
    const panel = EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const card = {
      id:    EmbedManager.uid(),
      type:  'card',
      title: title || ('Panel ' + EmbedManager.uid())
    };
    const cr = EmbedManager._panelRect(dock);
    panel.embedState.floats.push({
      slot: card,
      x: 30 + Math.random() * Math.max(10, cr.width  - 220),
      y: 30 + Math.random() * Math.max(10, cr.height - 160),
      z: ++EmbedManager._topZ,
    });
    EmbedManager.renderFloats(dock);
  },

  _findZone(dock, slotId) {
    /* Search across ALL panels so dragging from any panel works */
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      if (es.floats.some(fp => fp.slot.id === slotId)) return '_float_';
      for (const s of ['top','bottom','left','right'])
        if (es.zones[s].slots.some(sw => sw.slot.id === slotId)) return s;
    }
    return null;
  },

  _removeSlot(dock, slotId) {
    /* Search across ALL panels */
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      const fi = es.floats.findIndex(fp => fp.slot.id === slotId);
      if (fi !== -1) { const fp = es.floats.splice(fi, 1)[0]; return { slot: fp.slot, from:'float' }; }
      for (const side of ['top','bottom','left','right']) {
        const zone = es.zones[side];
        const si   = zone.slots.findIndex(sw => sw.slot.id === slotId);
        if (si !== -1) {
          const [sw] = zone.slots.splice(si, 1);
          zone.slots.forEach(s => s.flex = 1);
          return { slot: sw.slot, from: side };
        }
      }
    }
    return null;
  },

  /* pos: 'first' | 'last' | { tabWith: slotId } */
  _dockTo(dock, slot, side, pos) {
    const panel = EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const es   = panel.embedState;
    const zone = es.zones[side];

    if (pos === 'first') { zone.slots.unshift({ slot, flex:1 }); zone.slots.forEach(s=>s.flex=1); return; }
    if (pos === 'last')  { zone.slots.push({ slot, flex:1 });    zone.slots.forEach(s=>s.flex=1); return; }

    if (pos && pos.tabWith !== undefined) {
      const targetSW = zone.slots.find(sw => sw.slot.id === pos.tabWith);
      if (!targetSW) { zone.slots.push({ slot, flex:1 }); zone.slots.forEach(s=>s.flex=1); return; }
      const tgt = targetSW.slot;

      if (tgt.type === 'card') {
        const tg = { id: EmbedManager.uid(), type:'tabgroup', tabs:[], activeId: null };
        tg.tabs.push({ id: EmbedManager.uid(), title: tgt.title });
        if (slot.type === 'card') {
          const nt = { id: EmbedManager.uid(), title: slot.title };
          tg.tabs.push(nt); tg.activeId = nt.id;
        } else {
          slot.tabs.forEach(t => tg.tabs.push({ id: EmbedManager.uid(), title: t.title }));
          tg.activeId = tg.tabs[tg.tabs.length - 1].id;
        }
        if (!tg.activeId) tg.activeId = tg.tabs[0].id;
        targetSW.slot = tg;
      } else {
        if (slot.type === 'card') {
          const nt = { id: EmbedManager.uid(), title: slot.title };
          tgt.tabs.push(nt); tgt.activeId = nt.id;
        } else {
          slot.tabs.forEach(t => tgt.tabs.push({ id: EmbedManager.uid(), title: t.title }));
          tgt.activeId = tgt.tabs[tgt.tabs.length - 1].id;
        }
      }
      zone.slots.forEach(s => s.flex = 1);
    }
  },

  /* doUntab */
  _doUntab(dock, tg, tabId) {
    const side = EmbedManager._findZone(dock, tg.id);
    if (!side || side === '_float_') return;
    /* Find the panel that owns this zone slot */
    let ownerPanel = null, zone = null;
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      if (es.zones[side].slots.some(sw => sw.slot.id === tg.id)) {
        ownerPanel = panel; zone = es.zones[side]; break;
      }
    }
    if (!zone) return;
    const ti = tg.tabs.findIndex(t => t.id === tabId);
    if (ti < 0) return;

    const [removedTab] = tg.tabs.splice(ti, 1);
    if (tg.activeId === tabId) tg.activeId = tg.tabs[0]?.id || null;

    const tgIdx = zone.slots.findIndex(sw => sw.slot.id === tg.id);

    if (tg.tabs.length === 1) {
      zone.slots[tgIdx] = {
        slot: { id: EmbedManager.uid(), type:'card', title: tg.tabs[0].title },
        flex: zone.slots[tgIdx].flex
      };
    } else if (tg.tabs.length === 0) {
      zone.slots.splice(tgIdx, 1);
    }

    const insertAt = tgIdx >= 0 ? tgIdx : zone.slots.length;
    const newCard  = { id: EmbedManager.uid(), type:'card', title: removedTab.title };
    zone.slots.splice(insertAt, 0, { slot: newCard, flex: 1 });
    zone.slots.forEach(s => s.flex = 1);
    EmbedManager.renderZone(dock, side, ownerPanel);
  },

  /* ═══════════════════════════════════════════════
     DRAG — FREE (⠿ button)
     Normal drag  → follows mouse, drops as float.
     Shift held   → live switch to dock-zone overlay mode.
     Shift can be pressed or released at ANY point mid-drag.
  ═══════════════════════════════════════════════ */
  _startFreeDrag(dock, slot, e) {
    const rem = EmbedManager._removeSlot(dock, slot.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedManager.renderZone(dock, rem.from);
    else                      EmbedManager.renderFloats(dock);

    let inDockMode = e.shiftKey;

    const _ghostLabel = () => slot.type === 'tabgroup'
      ? (inDockMode ? '⊞ Tab Group  (release Shift = free float)' : '⠿ Tab Group  (Shift = dock to zone)')
      : (inDockMode ? '⊞ ' + slot.title + '  (release Shift = free float)' : '⠿ ' + slot.title + '  (Shift = dock to zone)');

    EmbedManager._showGhost(_ghostLabel());
    if (inDockMode) EmbedManager._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };

    const _clearOverlays = (exceptDock) => {
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedManager._activePanel(exceptDock);
        if (!exceptDock || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });
    };

    const mv = ev => {
      EmbedManager._moveGhost(ev);
      const nowShift = ev.shiftKey;

      if (nowShift && !inDockMode) {
        inDockMode = true;
        EmbedManager._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };
        EmbedManager._showGhost(_ghostLabel());
      } else if (!nowShift && inDockMode) {
        inDockMode = false;
        _clearOverlays(null);
        EmbedManager._DD = null;
        EmbedManager._showGhost(_ghostLabel());
      }

      if (inDockMode) {
        const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
        _clearOverlays(hb || null);
        if (hb) {
          EmbedManager.initDock(null, hb);
          EmbedManager._showOverlay(hb);
          EmbedManager._DD.tDock = hb;
          EmbedManager._updateOverlay(hb, ev.clientX, ev.clientY);
        } else {
          if (EmbedManager._DD) { EmbedManager._DD.side = null; EmbedManager._DD.tDock = null; }
        }
      }
    };

    const up = ev => {
      EmbedManager._hideGhost();
      _clearOverlays(null);

      if (inDockMode && EmbedManager._DD) {
        const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
        if (hb && EmbedManager._DD.side) {
          EmbedManager.initDock(null, hb);
          EmbedManager._dockTo(hb, slot, EmbedManager._DD.side, EmbedManager._DD.pos || 'last');
          EmbedManager.renderZone(hb, EmbedManager._DD.side);
          EmbedManager._updateCorners(hb);
        } else {
          const tb = hb || dock;
          EmbedManager.initDock(null, tb);
          const cr = EmbedManager._panelRect(tb);
          const activePanel = EmbedManager._activePanel(tb);
          activePanel.embedState.floats.push({
            slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
            z: ++EmbedManager._topZ
          });
          EmbedManager.renderFloats(tb);
        }
        EmbedManager._DD = null;
      } else {
        const hostDock = EmbedManager._dockAt(ev.clientX, ev.clientY) || dock;
        EmbedManager.initDock(null, hostDock);
        const cr = EmbedManager._panelRect(hostDock);
        const activePanel = EmbedManager._activePanel(hostDock);
        activePanel.embedState.floats.push({
          slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
          z: ++EmbedManager._topZ
        });
        EmbedManager.renderFloats(hostDock);
      }

      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  /* ═══════════════════════════════════════════════
     DRAG — DOCK (⊞ button)
     Shows drop overlay on all docks; drops to zone or float
  ═══════════════════════════════════════════════ */
  _DD: null,

  _startDockDrag(dock, slot, e) {
    const rem = EmbedManager._removeSlot(dock, slot.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedManager.renderZone(dock, rem.from);
    else                      EmbedManager.renderFloats(dock);

    EmbedManager._showGhost(slot.type === 'tabgroup' ? '⊞ Tab Group' : '⊞ ' + slot.title);
    EmbedManager._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };

    EmbedManager._showOverlay(dock);

    const mv = ev => {
      EmbedManager._moveGhost(ev);
      const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedManager._activePanel(hb);
        if (!hb || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });
      if (hb) {
        EmbedManager.initDock(null, hb);
        EmbedManager._showOverlay(hb);
        EmbedManager._updateOverlay(hb, ev.clientX, ev.clientY);
      }
    };

    const up = ev => {
      EmbedManager._hideGhost();
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        o.classList.remove('show'); o.innerHTML = '';
      });

      const hb = EmbedManager._dockAt(ev.clientX, ev.clientY);
      if (hb && EmbedManager._DD && EmbedManager._DD.side) {
        EmbedManager.initDock(null, hb);
        EmbedManager._dockTo(hb, EmbedManager._DD.slot, EmbedManager._DD.side, EmbedManager._DD.pos || 'last');
        EmbedManager.renderZone(hb, EmbedManager._DD.side);
        EmbedManager._updateCorners(hb);
      } else {
        const tb = hb || dock;
        EmbedManager.initDock(null, tb);
        const cr = EmbedManager._panelRect(tb);
        const activePanel = EmbedManager._activePanel(tb);
        activePanel.embedState.floats.push({
          slot: EmbedManager._DD.slot,
          x: ev.clientX - cr.left - 50,
          y: ev.clientY - cr.top  - 14,
          z: ++EmbedManager._topZ
        });
        EmbedManager.renderFloats(tb);
      }
      EmbedManager._DD = null;
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  /* ═══════════════════════════════════════════════
     DROP OVERLAY
  ═══════════════════════════════════════════════ */
  _showOverlay(dock) {
    const panel = EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    panel.embedState.overlay.classList.add('show');
    EmbedManager._buildOverlay(dock);
  },

  _buildOverlay(dock) {
    const panel = EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const es = panel.embedState;
    es.overlay.innerHTML = '';
    const SZ = 80;
    const POS = {
      top:    `top:0;left:0;right:0;height:${SZ}px`,
      bottom: `bottom:0;left:0;right:0;height:${SZ}px`,
      left:   `top:0;bottom:0;left:0;width:${SZ}px`,
      right:  `top:0;bottom:0;right:0;width:${SZ}px`,
      center: `top:33%;bottom:33%;left:33%;right:33%`,
    };

    ['top','bottom','left','right','center'].forEach(side => {
      const zone = side === 'center' ? null : es.zones[side];
      const dz   = document.createElement('div');
      dz.className = 'ez-dz';
      dz.style.cssText = 'position:absolute;' + POS[side];
      dz.dataset.side  = side;

      if (side === 'center') {
        /* Center = free float drop */
        dz.classList.add('dz-empty', 'dz-center');
        dz.textContent = '⊞ FLOAT';
      } else if (!zone.slots.length) {
        dz.classList.add('dz-empty');
        dz.textContent = side.toUpperCase();
      } else {
        dz.classList.add('dz-has');
        dz.style.flexDirection = zone.axis === 'h' ? 'row' : 'column';
        dz.style.display = 'flex';
        dz.style.gap = '3px';
        dz.style.padding = '5px';
        ['first','tab','last'].forEach(p => {
          const sub = document.createElement('div');
          sub.className = 'ez-dz-sub' + (p === 'tab' ? ' sub-tab' : '');
          sub.textContent = p.toUpperCase();
          sub.dataset.pos  = p;
          sub.dataset.side = side;
          dz.appendChild(sub);
        });
      }
      es.overlay.appendChild(dz);
    });
  },

  /* Called live during Shift+drag — updates _DD state based on cursor position */
  _updateOverlayForDrag(system, dock, mx, my) {
    if (!EmbedManager._DD) {
      /* Create a fresh _DD context for this drag */
      EmbedManager._DD = { side: null, pos: null, tDock: dock };
    }
    EmbedManager._DD.tDock = dock;
    EmbedManager._updateOverlay(dock, mx, my);
  },

  _updateOverlay(dock, mx, my) {
    if (!EmbedManager._DD) return;
    const panel = EmbedManager._activePanel(dock);
    if (!panel?.embedState) return;
    const es = panel.embedState;
    const r  = (dock.querySelector(`.dock-panel[data-pi="${dock.activePanelIndex ?? 0}"]`) || dock).getBoundingClientRect();
    const dT = my - r.top, dB = r.bottom - my, dL = mx - r.left, dR = r.right - mx;
    const mn = Math.min(dT, dB, dL, dR);

    let near = null;
    if      (dT < EmbedManager.SNAP && dT === mn) near = 'top';
    else if (dB < EmbedManager.SNAP && dB === mn) near = 'bottom';
    else if (dL < EmbedManager.SNAP && dL === mn) near = 'left';
    else if (dR < EmbedManager.SNAP && dR === mn) near = 'right';

    es.overlay.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
    EmbedManager._DD.side = near; EmbedManager._DD.pos = null; EmbedManager._DD.tDock = dock;

    if (!near) {
      const centerDz = es.overlay.querySelector('.ez-dz.dz-center');
      if (centerDz) centerDz.classList.add('hl');
      return;
    }

    const zone = es.zones[near];
    const dz   = es.overlay.querySelector(`.ez-dz[data-side="${near}"]`);
    if (!dz) return;

    if (!zone.slots.length) {
      dz.classList.add('hl'); EmbedManager._DD.pos = 'last';
    } else {
      const dzR = dz.getBoundingClientRect();
      const rel = zone.axis === 'h'
        ? (mx - dzR.left) / Math.max(1, dzR.width)
        : (my - dzR.top)  / Math.max(1, dzR.height);
      const pk  = rel < 0.33 ? 'first' : rel < 0.67 ? 'tab' : 'last';
      const sub = dz.querySelector(`.ez-dz-sub[data-pos="${pk}"]`);
      if (sub) sub.classList.add('hl');
      EmbedManager._DD.pos = pk === 'tab' ? { tabWith: zone.slots[0].slot.id } : pk;
    }
  },

  /* ═══════════════════════════════════════════════
     EMBED FROM DOCK DRAG
  ═══════════════════════════════════════════════ */
  startEmbedDrag(system, srcDock, e) {
    const activePanel = srcDock.panelData[srcDock.activePanelIndex] || srcDock.panelData[0];
    const slot = {
      id:    EmbedManager.uid(),
      type:  'card',
      title: activePanel?.title || 'Dock'
    };

    EmbedManager._showGhost('⊞ ' + slot.title);
    EmbedManager._DD = { slot, srcDock, side: null, pos: null, tDock: null };

    const mv = ev => {
      EmbedManager._moveGhost(ev);
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const hb  = els.find(el => el.classList.contains('dock') && el !== srcDock);

      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedManager._activePanel(hb);
        if (!hb || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });

      if (hb) {
        EmbedManager.initDock(system, hb);
        EmbedManager._showOverlay(hb);
        EmbedManager._updateOverlayForDrag(system, hb, ev.clientX, ev.clientY);
      } else {
        EmbedManager._DD.side = null;
        EmbedManager._DD.tDock = null;
      }
    };

    const up = ev => {
      EmbedManager._hideGhost();
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        o.classList.remove('show'); o.innerHTML = '';
      });

      const tDock = EmbedManager._DD?.tDock;
      const side  = EmbedManager._DD?.side;

      if (tDock && side) {
        EmbedManager.initDock(system, tDock);
        EmbedManager._dockTo(tDock, slot, side, EmbedManager._DD.pos || 'last');
        EmbedManager.renderZone(tDock, side);
        EmbedManager._updateCorners(tDock);
      } else if (tDock) {
        EmbedManager.initDock(system, tDock);
        const cr = EmbedManager._panelRect(tDock);
        const activeP = EmbedManager._activePanel(tDock);
        activeP.embedState.floats.push({
          slot,
          x: ev.clientX - cr.left - 50,
          y: ev.clientY - cr.top  - 14,
          z: ++EmbedManager._topZ
        });
        EmbedManager.renderFloats(tDock);
      } else {
        EmbedManager._DD = null;
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        return;
      }

      /* Remove the source dock from layout */
      if (system) {
        const srcParent = srcDock.parentElement;
        srcDock.remove();
        system.docks = system.docks.filter(d => d !== srcDock);
        DockManager.cleanupEmptyContainer(system, srcParent);
        system.updateResizeHandles();
        system.updateConnectionPoints();
      }

      EmbedManager._DD = null;
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  /* ═══════════════════════════════════════════════
     GHOST
  ═══════════════════════════════════════════════ */
  _showGhost(label) {
    let g = document.getElementById('embed-ghost');
    if (!g) { g = document.createElement('div'); g.id = 'embed-ghost'; document.body.appendChild(g); }
    g.textContent = label; g.style.display = 'block';
  },
  _hideGhost() {
    const g = document.getElementById('embed-ghost');
    if (g) g.style.display = 'none';
  },
  _moveGhost(e) {
    const g = document.getElementById('embed-ghost');
    if (g) { g.style.left = (e.clientX + 12) + 'px'; g.style.top = (e.clientY - 10) + 'px'; }
  },

  /* ═══════════════════════════════════════════════
     UTIL — find dock element under point
  ═══════════════════════════════════════════════ */
  _dockAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    return els.find(el => el.classList.contains('dock')) || null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedManager;
}