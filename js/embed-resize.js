/* ═══════════════════════════════════════════════════════
   EmbedResize — zone edge resize handles, thickness application, corner cutouts
═══════════════════════════════════════════════════════ */

const EmbedResize = {

  /* ═══════════════════════════════════════════════
     ZONE EDGE RESIZE
     Drag the handle on the outer edge of a zone strip to resize it.
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
        zone.thickness = Math.max(EmbedCore.MIN_Z, init + d);
        EmbedResize._applyThickness(zone, zEl, rhEl);
        EmbedResize._updateCorners(dock, panel);
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
     Keep top/bottom zones from overlapping left/right zones
     by adjusting their left/right/top/bottom insets.
  ═══════════════════════════════════════════════ */
  _updateCorners(dock, panel) {
    const es = (panel || EmbedCore._activePanel(dock))?.embedState;
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
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedResize;
}
