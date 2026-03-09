/* ═══════════════════════════════════════════════════════
   EmbedRender — zone and float rendering
   Converts embedState data into live DOM inside each dock panel.
═══════════════════════════════════════════════════════ */

const EmbedRender = {

  /* Render all panels of a dock (full board refresh) */
  renderBoard(dock) {
    dock.panelData.forEach(panel => {
      if (!panel.embedState) return;
      ['top','bottom','left','right'].forEach(s => EmbedRender.renderZone(dock, s, panel));
      EmbedResize._updateCorners(dock, panel);
      EmbedRender.renderFloats(dock, panel);
    });
  },

  /* Render one zone strip for the given panel (default: active panel) */
  renderZone(dock, side, panel) {
    panel = panel || EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    /* Collapse singleton ZCs in data model before rebuilding DOM */
    EmbedSlots._collapseSingletonZCs(dock);
    const es    = panel.embedState;
    const zone  = es.zones[side];
    const zEl   = es.domZ[side];
    const rhEl  = es.domRH[side];
    const empty = zone.slots.length === 0;

    zEl.style.display  = empty ? 'none' : 'flex';
    rhEl.style.display = empty ? 'none' : 'block';
    if (empty) { EmbedResize._updateCorners(dock, panel); return; }

    EmbedResize._applyThickness(zone, zEl, rhEl);
    zEl.innerHTML = '';

    zone.slots.forEach(sw => {
      const el = EmbedBuilders._buildSlotEl(dock, sw.slot, side, false);
      el.style.flex = String(sw.flex);
      el.addEventListener('mousedown', () => {
        EmbedCore.bringToTop(zEl);
      }, true);
      zEl.appendChild(el);
    });

    EmbedResize._updateCorners(dock, panel);
  },

  /* Render all floating slots for the given panel (default: active panel) */
  renderFloats(dock, panel) {
    panel = panel || EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    /* Collapse singleton ZCs in data model before rebuilding DOM */
    EmbedSlots._collapseSingletonZCs(dock);
    const es = panel.embedState;
    es.floatLayer.querySelectorAll(
      '.ec-embedded-dock.ec-floating, .ec-tab-group.ec-floating, .ec-zone-container.ec-floating'
    ).forEach(e => e.remove());

    es.floats.forEach(fp => {
      if (!fp.z) fp.z = ++EmbedCore._topZ;

      const el = EmbedBuilders._buildSlotEl(dock, fp.slot, 'float', true);
      el.style.position = 'absolute';
      el.style.left     = fp.x + 'px';
      el.style.top      = fp.y + 'px';
      el.style.zIndex   = fp.z;

      /* Default sizes for first-time floats; persisted across re-renders via fp.w/fp.h */
      if (!fp.w) fp.w = fp.slot.type === 'zonecontainer' ? 240 : 200;
      if (!fp.h) fp.h = fp.slot.type === 'zonecontainer' ? 160 : 120;
      el.style.width  = fp.w + 'px';
      el.style.height = fp.h + 'px';

      es.floatLayer.appendChild(el);

      /* Raise this float above everything on mousedown */
      el.addEventListener('mousedown', () => {
        fp.z = ++EmbedCore._topZ;
        el.style.zIndex = fp.z;
      }, true);

      /* ── Resize handles: right edge (W), bottom edge (H), SE corner (W+H) ── */
      const MIN = 80;
      ['ew-resize','ns-resize','nwse-resize'].forEach(cursor => {
        const rh = document.createElement('div');
        rh.className = 'ec-float-rh';
        rh.style.cssText = 'position:absolute;z-index:1;';
        rh.style.cursor  = cursor;
        if (cursor === 'ew-resize')   Object.assign(rh.style, { right:'0', top:'6px', width:'6px', bottom:'6px' });
        if (cursor === 'ns-resize')   Object.assign(rh.style, { bottom:'0', left:'6px', height:'6px', right:'6px' });
        if (cursor === 'nwse-resize') Object.assign(rh.style, { right:'0', bottom:'0', width:'10px', height:'10px' });
        rh.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          const sx = e.clientX, sy = e.clientY, sw0 = fp.w, sh0 = fp.h;
          const mv = ev => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (cursor !== 'ns-resize')  fp.w = Math.max(MIN, sw0 + dx);
            if (cursor !== 'ew-resize')  fp.h = Math.max(MIN, sh0 + dy);
            el.style.width  = fp.w + 'px';
            el.style.height = fp.h + 'px';
          };
          const up = () => {
            document.removeEventListener('mousemove', mv);
            document.removeEventListener('mouseup', up);
          };
          document.addEventListener('mousemove', mv);
          document.addEventListener('mouseup', up);
        });
        el.appendChild(rh);
      });

      /* Drag float by header — plain = free move; Shift mid-drag = dock-zone embed
         Matches .ec-hdr (card), .ec-tab-bar (tabgroup), .ec-zc-hdr-drag (zonecontainer) */
      const hdTarget = el.querySelector('.ec-hdr, .ec-tab-bar, .ec-zc-hdr-drag');
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
            const rem = EmbedSlots._removeSlot(dock, fp.slot.id);
            if (rem) EmbedRender.renderFloats(dock);
            EmbedGhost._showGhost(_ghostLabel());
            EmbedDragDock._DD = { slot: fp.slot, srcDock: dock, side: null, pos: null, tDock: null };
          }

          const _clearOverlays = (exceptDock) => {
            document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
              const ownerPanel = EmbedCore._activePanel(exceptDock);
              if (!exceptDock || o !== ownerPanel?.embedState?.overlay) {
                o.classList.remove('show'); o.innerHTML = '';
              }
            });
          };

          const mv = ev => {
            const nowShift = ev.shiftKey;

            if (nowShift && !inDockMode) {
              inDockMode = true;
              const rem = EmbedSlots._removeSlot(dock, fp.slot.id);
              if (rem) EmbedRender.renderFloats(dock);
              EmbedGhost._showGhost(_ghostLabel());
              EmbedDragDock._DD = { slot: fp.slot, srcDock: dock, side: null, pos: null, tDock: null };
            } else if (!nowShift && inDockMode) {
              inDockMode = false;
              _clearOverlays(null);
              EmbedDragDock._DD = null;
              EmbedGhost._hideGhost();
              const cr = EmbedCore._panelRect(dock);
              fp.x = ev.clientX - cr.left - 50;
              fp.y = ev.clientY - cr.top  - 14;
              const activePanel = EmbedCore._activePanel(dock);
              if (activePanel && !activePanel.embedState.floats.includes(fp))
                activePanel.embedState.floats.push(fp);
              EmbedRender.renderFloats(dock);
            }

            if (inDockMode) {
              EmbedGhost._moveGhost(ev);
              const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
              _clearOverlays(hb || null);
              if (hb) {
                EmbedCore.initDock(null, hb);
                EmbedOverlay._showOverlay(hb);
                EmbedDragDock._DD.tDock = hb;
                EmbedOverlay._updateOverlay(hb, ev.clientX, ev.clientY);
              } else {
                if (EmbedDragDock._DD) { EmbedDragDock._DD.side = null; EmbedDragDock._DD.tDock = null; }
              }
            } else {
              fp.x = ev.clientX - sx; fp.y = ev.clientY - sy;
              el.style.left = fp.x + 'px'; el.style.top = fp.y + 'px';
            }
          };

          const up = ev => {
            _clearOverlays(null);
            EmbedGhost._hideGhost();

            if (inDockMode && EmbedDragDock._DD) {
              const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
              if (hb && EmbedDragDock._DD.side) {
                EmbedCore.initDock(null, hb);
                EmbedSlots._dockTo(hb, fp.slot, EmbedDragDock._DD.side, EmbedDragDock._DD.pos || 'last');
                EmbedRender.renderZone(hb, EmbedDragDock._DD.side);
                EmbedResize._updateCorners(hb);
              } else {
                const tb = hb || dock;
                EmbedCore.initDock(null, tb);
                const cr = EmbedCore._panelRect(tb);
                const activePanel = EmbedCore._activePanel(tb);
                if (activePanel && !activePanel.embedState.floats.some(f => f.slot.id === fp.slot.id)) {
                  activePanel.embedState.floats.push({
                    slot: fp.slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
                    z: ++EmbedCore._topZ
                  });
                }
                EmbedRender.renderFloats(tb);
              }
              EmbedDragDock._DD = null;
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
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedRender;
}