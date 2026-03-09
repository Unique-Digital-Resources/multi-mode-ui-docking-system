/* ═══════════════════════════════════════════════════════
   EmbedCore — shared state, uid, panel helpers, DOM init/save/restore

   Architecture:
   • embedState lives on each panel object (panelData[i]), NOT on the dock.
     This means embed layers mount inside each panel's own .dock-panel div,
     and show/hide automatically with the panel (display:none / display:flex).
   • panel.embedState = { zones:{top,bottom,left,right}, floats:[], domZ, domRH, floatLayer, overlay }
   • zone  = { axis:'h'|'v', side, slots:[{slot,flex}], thickness }
   • slot  = { id, type:'card'|'tabgroup'|'zonecontainer', title, ... }

   Layers inside each .dock-panel (z-order):
     z=10 : zone divs (.ez — position:absolute per side)
     z=11 : zone edge resize handles (.ez-rh)
     z=50 : float-layer (.ez-float-layer)
     z=800: drop-overlay (.ez-drop-overlay)
═══════════════════════════════════════════════════════ */

const EmbedCore = {

  /* ── Constants ────────────────────────────────────── */
  SNAP:  130,
  MIN_Z: 55,
  DEF_H: 170,
  DEF_V: 210,
  PAD:   6,

  /* ── Global z counter shared by all zones + floats ── */
  _topZ: 100,
  bringToTop(el) { el.style.zIndex = ++EmbedCore._topZ; },

  /* ── uid ── */
  _id: 0,
  uid() { return 'e' + (++EmbedCore._id); },

  /* ── Return the active panel object for a dock ── */
  _activePanel(dock) {
    return dock.panelData[dock.activePanelIndex ?? 0] || dock.panelData[0] || null;
  },

  /* ── Bounding rect of the active panel's .dock-panel element ── */
  _panelRect(dock) {
    const idx = dock.activePanelIndex ?? 0;
    const el  = dock.querySelector(`.dock-panel[data-pi="${idx}"]`);
    return (el || dock).getBoundingClientRect();
  },

  /* ═══════════════════════════════════════════════
     SAVE / RESTORE embed layers across innerHTML rebuilds.

     _saveEmbedLayers(dock)    — detach all panel embed layer nodes from DOM
     _restoreEmbedLayers(dock) — re-mount them into the freshly-built .dock-panel divs
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
      const panelEl = dock.querySelector(`.dock-panel[data-pi="${i}"]`);
      if (!panelEl) return;
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
     Creates embedState on panels that don't have one yet,
     and (re-)mounts all embed layer DOM into .dock-panel divs.
  ═══════════════════════════════════════════════ */
  initDock(system, dock) {
    dock.panelData.forEach((panel, i) => {
      if (!panel.embedState) {
        EmbedCore._initPanel(panel);
      }
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

    dock._embedInited  = true;
    if (system) dock._embedSystem = system;

    dock.panelData.forEach(panel => {
      ['top','bottom','left','right'].forEach(s =>
        EmbedResize._setupEdgeResize(dock, panel, s)
      );
    });
  },

  /* Create embedState + DOM nodes for one panel (no mounting yet) */
  _initPanel(panel) {
    const es = {
      zones: {
        top:    { side:'top',    axis:'h', slots:[], thickness: EmbedCore.DEF_H },
        bottom: { side:'bottom', axis:'h', slots:[], thickness: EmbedCore.DEF_H },
        left:   { side:'left',   axis:'v', slots:[], thickness: EmbedCore.DEF_V },
        right:  { side:'right',  axis:'v', slots:[], thickness: EmbedCore.DEF_V },
      },
      floats: [],
      domZ:  {},
      domRH: {},
      floatLayer: null,
      overlay:    null,
    };
    panel.embedState = es;

    const mk = (cls, style) => {
      const d = document.createElement('div');
      d.className = cls;
      if (style) d.style.cssText = style;
      return d;
    };

    es.domZ.top    = mk('ez ax-h side-top',      'display:none');
    es.domZ.bottom = mk('ez ax-h side-bottom',   'display:none');
    es.domZ.left   = mk('ez ax-v side-left',     'display:none');
    es.domZ.right  = mk('ez ax-v side-right',    'display:none');
    es.domRH.top   = mk('ez-rh rh-h side-top',   'display:none');
    es.domRH.bottom= mk('ez-rh rh-h side-bottom','display:none');
    es.domRH.left  = mk('ez-rh rh-v side-left',  'display:none');
    es.domRH.right = mk('ez-rh rh-v side-right', 'display:none');
    es.floatLayer  = mk('ez-float-layer');
    es.overlay     = mk('ez-drop-overlay');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedCore;
}
