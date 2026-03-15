const DragDrop = {
    beginDrag(system, e, dock, mode, panelIndex) {
        system.dragMode       = mode;
        system.draggedDock    = dock;
        system.extractPanelIdx = panelIndex;
        system.dragWithCtrl   = e.ctrlKey || e.metaKey;
        system.dragWithShift  = e.shiftKey;
        /* For detach/tab-move the dock stays fully visible and interactive
           so it can serve as a drop target for re-tabbing back into itself */
        if (mode !== 'detach' && mode !== 'tab-move') {
            dock.classList.add('dragging');
        }
    },

    onMouseMove(system, e) {
        if (system.resizing) return;
        if (!system.dragMode) return;

        const isShift = system.dragWithShift || e.shiftKey;
        const isCtrl  = !isShift && (system.dragWithCtrl || e.ctrlKey || e.metaKey);

        // Always clear old indicators first
        DragDrop.clearDropIndicators();

        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const dragged = system.draggedDock;
        /* In detach/tab-move, the source dock is NOT ghost-hidden so it can
           be the drop target (re-tab back into itself). In move mode, exclude it. */
        const allowSelf = system.dragMode === 'detach' || system.dragMode === 'tab-move';
        const tgt = els.find(el =>
            el.classList.contains('dock') &&
            (allowSelf ? (el === dragged || !dragged.contains(el)) : (el !== dragged && !dragged.contains(el)))
        );

        if (isShift) {
            /* ── EMBED mode ── */
            document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
                const ownerPanel = tgt ? EmbedManager._activePanel(tgt) : null;
                if (!tgt || o !== ownerPanel?.embedState?.overlay) {
                    o.classList.remove('show'); o.innerHTML = '';
                }
            });
            if (tgt) {
                system.dropTarget = tgt;
                EmbedManager.initDock(system, tgt);
                EmbedManager._showOverlay(tgt);
                EmbedManager._updateOverlayForDrag(system, tgt, e.clientX, e.clientY);
            } else {
                system.dropTarget = null;
                system.dropZone   = null;
            }
        } else {
            /* ── NORMAL / TAB mode ── */
            // Hide any stray embed overlays
            document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
                o.classList.remove('show'); o.innerHTML = '';
            });

            if (tgt) {
                system.dropTarget = tgt;
                const r = tgt.getBoundingClientRect();
                system.dropZone = DragDrop.getDropZone(
                    e.clientX - r.left, e.clientY - r.top, r.width, r.height
                );
                if (isCtrl || system.dragMode === 'tabify' || system.dragMode === 'tab-move') {
                    DragDrop.showDropIndicator(tgt, system.dropZone, true, false);
                } else {
                    DragDrop.showDropIndicator(tgt, system.dropZone, false, false);
                }
            } else {
                system.dropTarget = null;
                system.dropZone   = null;
            }
        }
    },

    onMouseUp(system, e) {
        if (!e) e = { ctrlKey: false, metaKey: false, shiftKey: false };

        const isShift = system.dragWithShift || e.shiftKey;
        const isCtrl  = !isShift && (system.dragWithCtrl || e.ctrlKey || e.metaKey
            || system.dragMode === 'tabify' || system.dragMode === 'tab-move');

        if (system.dragMode === 'move') {
            if (isShift) {
                DragDrop._commitEmbed(system, e);
            } else if (system.dropTarget && system.dropZone) {
                if (isCtrl) {
                    /* Ctrl+drag: merge ALL panels of dragged dock as tabs into target */
                    const pos = system.dropZone === 'center'
                        ? (system.dropTarget.dataset.tabsPos || 'top')
                        : system.dropZone;
                    DockManager.mergeDockAsTab(system, system.draggedDock, system.dropTarget, pos);
                } else {
                    /* Plain move: move the dock element as-is, tabs intact */
                    const dragged = system.draggedDock;
                    system.dropZone === 'center'
                        ? DockManager.swapDocks(system, dragged, system.dropTarget)
                        : DockManager.insertDock(system, dragged, system.dropTarget, system.dropZone);
                    /* Rebuild HTML before re-wiring events so that any previously
                       attached listeners (from the dock's original creation) are
                       discarded. Without this, every drag adds a second set of
                       listeners on the same elements — causing the collapse button
                       to fire twice (collapse then immediately expand). */
                    system.hideDockHeaders(dragged);
                    EmbedManager._saveEmbedLayers(dragged);
                    dragged.innerHTML = DOMBuilder.buildDockHTML(dragged);
                    EmbedManager._restoreEmbedLayers(dragged);
                    system.setupDockEvents(dragged);
                    EmbedManager.renderBoard(dragged);
                    if (system.dropZone === 'center') {
                        system.hideDockHeaders(system.dropTarget);
                        EmbedManager._saveEmbedLayers(system.dropTarget);
                        system.dropTarget.innerHTML = DOMBuilder.buildDockHTML(system.dropTarget);
                        EmbedManager._restoreEmbedLayers(system.dropTarget);
                        system.setupDockEvents(system.dropTarget);
                        EmbedManager.renderBoard(system.dropTarget);
                    }
                }
                system.updateResizeHandles();
                system.updateConnectionPoints();
            }
        } else if (system.dragMode === 'tabify') {
            if (system.dropTarget && system.dropZone) {
                const pos = system.dropZone === 'center'
                    ? (system.dropTarget.dataset.tabsPos || 'top')
                    : system.dropZone;
                DockManager.mergeDockAsTab(system, system.draggedDock, system.dropTarget, pos);
                system.updateResizeHandles();
                system.updateConnectionPoints();
            }
        } else if (system.dragMode === 'detach') {
            PanelManager.performDetach(system);
        } else if (system.dragMode === 'tab-move') {
            PanelManager.performTabMove(system);
        }

        if (system.draggedDock) {
            system.draggedDock.classList.remove('dragging');
            system.draggedDock = null;
        }
        DragDrop.clearDropIndicators();
        document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
            o.classList.remove('show'); o.innerHTML = '';
        });
        system.dragMode       = null;
        system.dropTarget     = null;
        system.dropZone       = null;
        system.extractPanelIdx = null;
        system.dragWithCtrl   = null;
        system.dragWithShift  = null;
    },

    _commitEmbed(system, e) {
        const srcDock = system.draggedDock;
        const DD      = EmbedManager._DD;
        const tDock   = system.dropTarget;
        if (!srcDock) return;

        const activePanel = srcDock.panelData[srcDock.activePanelIndex] || srcDock.panelData[0];
        const slot = { id: EmbedManager.uid(), type: 'card', title: activePanel?.title || 'Dock' };

        if (tDock && DD && DD.side) {
            EmbedManager.initDock(system, tDock);
            EmbedManager._dockTo(tDock, slot, DD.side, DD.pos || 'last');
            EmbedManager.renderZone(tDock, DD.side);
            EmbedManager._updateCorners(tDock);
        } else if (tDock) {
            EmbedManager.initDock(system, tDock);
            const cr      = EmbedManager._panelRect(tDock);
            const actPanel = EmbedManager._activePanel(tDock);
            actPanel.embedState.floats.push({
                slot,
                x: e.clientX - cr.left - 50,
                y: e.clientY - cr.top  - 14,
                z: ++EmbedManager._topZ
            });
            EmbedManager.renderFloats(tDock);
        } else {
            EmbedManager._DD = null;
            return;
        }

        const srcParent = srcDock.parentElement;
        srcDock.remove();
        system.docks = system.docks.filter(d => d !== srcDock);
        DockManager.cleanupEmptyContainer(system, srcParent);
        system.updateResizeHandles();
        system.updateConnectionPoints();
        EmbedManager._DD = null;
    },

    getDropZone(x, y, w, h) {
        const t = 0.33;
        if (Math.abs(x - w/2) < w*t/2 && Math.abs(y - h/2) < h*t/2) return 'center';
        if (y < h * t) return 'top';
        if (y > h * (1-t)) return 'bottom';
        if (x < w * t) return 'left';
        if (x > w * (1-t)) return 'right';
        return 'center';
    },

    showDropIndicator(dock, zone, isTabMode, isEmbedMode) {
        if (isTabMode) {
            ['top','bottom','left','right','center'].forEach(z => {
                const el = dock.querySelector(`:scope > .drop-indicator.${z}`);
                if (!el) return;
                el.classList.add('active', 'tabify-zone');
                if (z === zone) el.classList.add('active-zone');
            });
        } else if (isEmbedMode) {
            dock.querySelector(`:scope > .drop-indicator.${zone}`)
                ?.classList.add('active', 'embed-zone');
        } else {
            dock.querySelector(`:scope > .drop-indicator.${zone}`)
                ?.classList.add('active');
        }
    },

    clearDropIndicators() {
        document.querySelectorAll('.drop-indicator').forEach(el =>
            el.classList.remove('active', 'tabify-zone', 'active-zone', 'embed-zone')
        );
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DragDrop;
}