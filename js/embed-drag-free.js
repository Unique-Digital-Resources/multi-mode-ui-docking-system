/* ═══════════════════════════════════════════════════════
   EmbedDragFree — ⠿ button free-float drag.

   Plain drag  → follows mouse, drops as float.
   Shift held  → live switch to dock-zone overlay mode.
   Shift can be pressed or released at ANY point mid-drag.
═══════════════════════════════════════════════════════ */

const EmbedDragFree = {

  _startFreeDrag(dock, slot, e) {
    const rem = EmbedSlots._removeSlot(dock, slot.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedRender.renderZone(dock, rem.from);
    else                      EmbedRender.renderFloats(dock);

    let inDockMode = e.shiftKey;

    const _ghostLabel = () => slot.type === 'tabgroup'
      ? (inDockMode ? '⊞ Tab Group  (release Shift = free float)' : '⠿ Tab Group  (Shift = dock to zone)')
      : (inDockMode ? '⊞ ' + slot.title + '  (release Shift = free float)' : '⠿ ' + slot.title + '  (Shift = dock to zone)');

    EmbedGhost._showGhost(_ghostLabel());
    if (inDockMode)
      EmbedDragDock._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };

    const _clearOverlays = (exceptDock) => {
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedCore._activePanel(exceptDock);
        if (!exceptDock || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });
    };

    const mv = ev => {
      EmbedGhost._moveGhost(ev);
      const nowShift = ev.shiftKey;

      if (nowShift && !inDockMode) {
        inDockMode = true;
        EmbedDragDock._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };
        EmbedGhost._showGhost(_ghostLabel());
      } else if (!nowShift && inDockMode) {
        inDockMode = false;
        _clearOverlays(null);
        EmbedDragDock._DD = null;
        EmbedGhost._showGhost(_ghostLabel());
      }

      if (inDockMode) {
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
      }
    };

    const up = ev => {
      EmbedGhost._hideGhost();
      _clearOverlays(null);

      if (inDockMode && EmbedDragDock._DD) {
        const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
        if (hb && EmbedDragDock._DD.side) {
          EmbedCore.initDock(null, hb);
          EmbedSlots._dockTo(hb, slot, EmbedDragDock._DD.side, EmbedDragDock._DD.pos || 'last');
          EmbedRender.renderZone(hb, EmbedDragDock._DD.side);
          EmbedResize._updateCorners(hb);
        } else {
          const tb = hb || dock;
          EmbedCore.initDock(null, tb);
          const cr = EmbedCore._panelRect(tb);
          const activePanel = EmbedCore._activePanel(tb);
          activePanel.embedState.floats.push({
            slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
            z: ++EmbedCore._topZ
          });
          EmbedRender.renderFloats(tb);
        }
        EmbedDragDock._DD = null;
      } else {
        const hostDock = EmbedGhost._dockAt(ev.clientX, ev.clientY) || dock;
        EmbedCore.initDock(null, hostDock);
        const cr = EmbedCore._panelRect(hostDock);
        const activePanel = EmbedCore._activePanel(hostDock);
        activePanel.embedState.floats.push({
          slot, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14,
          z: ++EmbedCore._topZ
        });
        EmbedRender.renderFloats(hostDock);
      }

      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedDragFree;
}
