/* ═══════════════════════════════════════════════════════
   EmbedDragDock — shared _DD drag state + dock-zone overlay drag handlers.

   _DD is the shared drag descriptor used by overlay, free-drag, and dock-drag.

   _startDockDrag  — ⊞ button on embedded slots: shows overlay, drops to zone or float.
   startEmbedDrag  — external API: drag an existing real dock INTO an embed zone.
═══════════════════════════════════════════════════════ */

const EmbedDragDock = {

  /* Shared drag descriptor — read/written by overlay, free-drag, and dock-drag */
  _DD: null,

  /* ── ⊞ button: dock-zone overlay drag from embedded slot ── */
  _startDockDrag(dock, slot, e) {
    const rem = EmbedSlots._removeSlot(dock, slot.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedRender.renderZone(dock, rem.from);
    else                      EmbedRender.renderFloats(dock);

    EmbedGhost._showGhost(slot.type === 'tabgroup' ? '⊞ Tab Group' : '⊞ ' + slot.title);
    EmbedDragDock._DD = { slot, srcDock: dock, side: null, pos: null, tDock: null };

    EmbedOverlay._showOverlay(dock);

    const mv = ev => {
      EmbedGhost._moveGhost(ev);
      const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedCore._activePanel(hb);
        if (!hb || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });
      if (hb) {
        EmbedCore.initDock(null, hb);
        EmbedOverlay._showOverlay(hb);
        EmbedOverlay._updateOverlay(hb, ev.clientX, ev.clientY);
      }
    };

    const up = ev => {
      EmbedGhost._hideGhost();
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        o.classList.remove('show'); o.innerHTML = '';
      });

      const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
      if (hb && EmbedDragDock._DD && EmbedDragDock._DD.side) {
        EmbedCore.initDock(null, hb);
        EmbedSlots._dockTo(hb, EmbedDragDock._DD.slot, EmbedDragDock._DD.side, EmbedDragDock._DD.pos || 'last');
        EmbedRender.renderZone(hb, EmbedDragDock._DD.side);
        EmbedResize._updateCorners(hb);
      } else {
        const tb = hb || dock;
        EmbedCore.initDock(null, tb);
        const cr = EmbedCore._panelRect(tb);
        const activePanel = EmbedCore._activePanel(tb);
        activePanel.embedState.floats.push({
          slot: EmbedDragDock._DD.slot,
          x: ev.clientX - cr.left - 50,
          y: ev.clientY - cr.top  - 14,
          z: ++EmbedCore._topZ
        });
        EmbedRender.renderFloats(tb);
      }
      EmbedDragDock._DD = null;
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },

  /* ── External API: drag a real dock INTO an embed zone ── */
  startEmbedDrag(system, srcDock, e) {
    const activePanel = srcDock.panelData[srcDock.activePanelIndex] || srcDock.panelData[0];
    const slot = {
      id:    EmbedCore.uid(),
      type:  'card',
      title: activePanel?.title || 'Dock'
    };

    EmbedGhost._showGhost('⊞ ' + slot.title);
    EmbedDragDock._DD = { slot, srcDock, side: null, pos: null, tDock: null };

    const mv = ev => {
      EmbedGhost._moveGhost(ev);
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const hb  = els.find(el => el.classList.contains('dock') && el !== srcDock);

      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedCore._activePanel(hb);
        if (!hb || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });

      if (hb) {
        EmbedCore.initDock(system, hb);
        EmbedOverlay._showOverlay(hb);
        EmbedOverlay._updateOverlayForDrag(system, hb, ev.clientX, ev.clientY);
      } else {
        EmbedDragDock._DD.side  = null;
        EmbedDragDock._DD.tDock = null;
      }
    };

    const up = ev => {
      EmbedGhost._hideGhost();
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        o.classList.remove('show'); o.innerHTML = '';
      });

      const tDock = EmbedDragDock._DD?.tDock;
      const side  = EmbedDragDock._DD?.side;

      if (tDock && side) {
        EmbedCore.initDock(system, tDock);
        EmbedSlots._dockTo(tDock, slot, side, EmbedDragDock._DD.pos || 'last');
        EmbedRender.renderZone(tDock, side);
        EmbedResize._updateCorners(tDock);
      } else if (tDock) {
        EmbedCore.initDock(system, tDock);
        const cr = EmbedCore._panelRect(tDock);
        const activeP = EmbedCore._activePanel(tDock);
        activeP.embedState.floats.push({
          slot,
          x: ev.clientX - cr.left - 50,
          y: ev.clientY - cr.top  - 14,
          z: ++EmbedCore._topZ
        });
        EmbedRender.renderFloats(tDock);
      } else {
        EmbedDragDock._DD = null;
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

      EmbedDragDock._DD = null;
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedDragDock;
}
