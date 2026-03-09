/* ═══════════════════════════════════════════════════════
   EmbedManager — compatibility shim.

   The monolithic EmbedManager has been split into focused modules.
   This file re-assembles the original public API surface so existing
   call-sites (DockingSystem, DragDrop, etc.) continue to work unchanged.

   Load order required in index.html:
     embed-core.js
     embed-resize.js
     embed-ghost.js
     embed-overlay.js        (reads EmbedDragDock._DD)
     embed-slots.js
     embed-render.js
     embed-builders.js
     embed-drag-free.js
     embed-drag-dock.js
     embed-drag-move.js
     embed-manager.js        ← this shim (last)
═══════════════════════════════════════════════════════ */

const EmbedManager = {

  /* ── Constants (mirror EmbedCore) ── */
  get SNAP()  { return EmbedCore.SNAP;  },
  get MIN_Z() { return EmbedCore.MIN_Z; },
  get DEF_H() { return EmbedCore.DEF_H; },
  get DEF_V() { return EmbedCore.DEF_V; },
  get PAD()   { return EmbedCore.PAD;   },

  /* ── Shared state ── */
  get _topZ()  { return EmbedCore._topZ; },
  set _topZ(v) { EmbedCore._topZ = v; },
  get _DD()    { return EmbedDragDock._DD; },
  set _DD(v)   { EmbedDragDock._DD = v; },

  /* ── Core ── */
  uid:                 (...a) => EmbedCore.uid(...a),
  bringToTop:          (...a) => EmbedCore.bringToTop(...a),
  _activePanel:        (...a) => EmbedCore._activePanel(...a),
  _panelRect:          (...a) => EmbedCore._panelRect(...a),
  _saveEmbedLayers:    (...a) => EmbedCore._saveEmbedLayers(...a),
  _restoreEmbedLayers: (...a) => EmbedCore._restoreEmbedLayers(...a),
  initDock:            (...a) => EmbedCore.initDock(...a),

  /* ── Resize ── */
  _setupEdgeResize: (...a) => EmbedResize._setupEdgeResize(...a),
  _applyThickness:  (...a) => EmbedResize._applyThickness(...a),
  _updateCorners:   (...a) => EmbedResize._updateCorners(...a),

  /* ── Render ── */
  renderBoard:  (...a) => EmbedRender.renderBoard(...a),
  renderZone:   (...a) => EmbedRender.renderZone(...a),
  renderFloats: (...a) => EmbedRender.renderFloats(...a),

  /* ── Builders ── */
  _buildSlotEl:          (...a) => EmbedBuilders._buildSlotEl(...a),
  _buildCardEl:          (...a) => EmbedBuilders._buildCardEl(...a),
  _buildTabGroupEl:      (...a) => EmbedBuilders._buildTabGroupEl(...a),
  _buildZoneContainerEl: (...a) => EmbedBuilders._buildZoneContainerEl(...a),

  /* ── Ghost & util ── */
  _showGhost: (...a) => EmbedGhost._showGhost(...a),
  _hideGhost: (...a) => EmbedGhost._hideGhost(...a),
  _moveGhost: (...a) => EmbedGhost._moveGhost(...a),
  _dockAt:    (...a) => EmbedGhost._dockAt(...a),

  /* ── Overlay ── */
  _showOverlay:          (...a) => EmbedOverlay._showOverlay(...a),
  _buildOverlay:         (...a) => EmbedOverlay._buildOverlay(...a),
  _updateOverlay:        (...a) => EmbedOverlay._updateOverlay(...a),
  _updateOverlayForDrag: (...a) => EmbedOverlay._updateOverlayForDrag(...a),

  /* ── Slots ── */
  addFloat:               (...a) => EmbedSlots.addFloat(...a),
  addZoneContainer:       (...a) => EmbedSlots.addZoneContainer(...a),
  _findZone:              (...a) => EmbedSlots._findZone(...a),
  _removeSlot:            (...a) => EmbedSlots._removeSlot(...a),
  _dockTo:                (...a) => EmbedSlots._dockTo(...a),
  _doUntab:               (...a) => EmbedSlots._doUntab(...a),
  _doUngroupTabGroup:     (...a) => EmbedSlots._doUngroupTabGroup(...a),
  _dissolveZoneContainer: (...a) => EmbedSlots._dissolveZoneContainer(...a),

  /* ── Drag: free ── */
  _startFreeDrag: (...a) => EmbedDragFree._startFreeDrag(...a),

  /* ── Drag: dock overlay ── */
  _startDockDrag: (...a) => EmbedDragDock._startDockDrag(...a),
  startEmbedDrag: (...a) => EmbedDragDock.startEmbedDrag(...a),

  /* ── Drag: move/eject ── */
  _startMoveDrag:    (...a) => EmbedDragMove._startMoveDrag(...a),
  _startZCMoveDrag:  (...a) => EmbedDragMove._startZCMoveDrag(...a),
  _startZCEmbedDrag: (...a) => EmbedDragMove._startZCEmbedDrag(...a),
  _ejectOneDock:     (...a) => EmbedDragMove._ejectOneDock(...a),
  _ejectZCChildren:  (...a) => EmbedDragMove._ejectZCChildren(...a),
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedManager;
}
