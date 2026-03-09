/* ═══════════════════════════════════════════════════════
   EmbedOverlay — drop-target overlay for dock-zone embed drags.
   Shows zone drop zones (top/bottom/left/right/center) on a target dock,
   highlights the nearest zone as the cursor moves.
═══════════════════════════════════════════════════════ */

const EmbedOverlay = {

  _showOverlay(dock) {
    const panel = EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    panel.embedState.overlay.classList.add('show');
    EmbedOverlay._buildOverlay(dock);
  },

  _buildOverlay(dock) {
    const panel = EmbedCore._activePanel(dock);
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
        const hasZC = zone.slots.length === 1 && zone.slots[0].slot.type === 'zonecontainer';
        const midLabel   = hasZC ? 'merge'  : 'tab';
        const midDisplay = hasZC ? 'MERGE'  : 'TAB';
        ['first', midLabel, 'last'].forEach(p => {
          const sub = document.createElement('div');
          sub.className = 'ez-dz-sub' + (p === midLabel ? ' sub-tab' : '');
          sub.textContent = p === midLabel ? midDisplay : p.toUpperCase();
          sub.dataset.pos  = p;
          sub.dataset.side = side;
          dz.appendChild(sub);
        });
      }
      es.overlay.appendChild(dz);
    });
  },

  /* Called during Shift+drag — updates _DD.side/.pos based on cursor position */
  _updateOverlayForDrag(system, dock, mx, my) {
    if (!EmbedDragDock._DD) {
      EmbedDragDock._DD = { side: null, pos: null, tDock: dock };
    }
    EmbedDragDock._DD.tDock = dock;
    EmbedOverlay._updateOverlay(dock, mx, my);
  },

  _updateOverlay(dock, mx, my) {
    if (!EmbedDragDock._DD) return;
    const panel = EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    const es = panel.embedState;
    const r  = (dock.querySelector(`.dock-panel[data-pi="${dock.activePanelIndex ?? 0}"]`) || dock).getBoundingClientRect();
    const dT = my - r.top, dB = r.bottom - my, dL = mx - r.left, dR = r.right - mx;
    const mn = Math.min(dT, dB, dL, dR);

    let near = null;
    if      (dT < EmbedCore.SNAP && dT === mn) near = 'top';
    else if (dB < EmbedCore.SNAP && dB === mn) near = 'bottom';
    else if (dL < EmbedCore.SNAP && dL === mn) near = 'left';
    else if (dR < EmbedCore.SNAP && dR === mn) near = 'right';

    es.overlay.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
    EmbedDragDock._DD.side = near;
    EmbedDragDock._DD.pos  = null;
    EmbedDragDock._DD.tDock = dock;

    if (!near) {
      const centerDz = es.overlay.querySelector('.ez-dz.dz-center');
      if (centerDz) centerDz.classList.add('hl');
      return;
    }

    const zone = es.zones[near];
    const dz   = es.overlay.querySelector(`.ez-dz[data-side="${near}"]`);
    if (!dz) return;

    if (!zone.slots.length) {
      dz.classList.add('hl');
      EmbedDragDock._DD.pos = 'last';
    } else {
      const dzR = dz.getBoundingClientRect();
      const rel = zone.axis === 'h'
        ? (mx - dzR.left) / Math.max(1, dzR.width)
        : (my - dzR.top)  / Math.max(1, dzR.height);

      const hasZC = zone.slots.length === 1 && zone.slots[0].slot.type === 'zonecontainer';
      if (hasZC) {
        const pk  = rel < 0.33 ? 'first' : rel < 0.67 ? 'merge' : 'last';
        const sub = dz.querySelector(`.ez-dz-sub[data-pos="${pk}"]`);
        if (sub) sub.classList.add('hl');
        EmbedDragDock._DD.pos = pk === 'merge'
          ? { mergeContainer: zone.slots[0].slot.id }
          : pk;
      } else {
        const pk  = rel < 0.33 ? 'first' : rel < 0.67 ? 'tab' : 'last';
        const sub = dz.querySelector(`.ez-dz-sub[data-pos="${pk}"]`);
        if (sub) sub.classList.add('hl');
        EmbedDragDock._DD.pos = pk === 'tab' ? { tabWith: zone.slots[0].slot.id } : pk;
      }
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedOverlay;
}
