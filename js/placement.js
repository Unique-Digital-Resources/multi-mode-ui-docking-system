/**
 * placement.js
 * ────────────
 * Responsible for:
 *  • Initiating a drag operation (beginDrag)
 *  • Computing the hovered drop zone (getDropZone)
 *  • Showing / clearing drop indicators on potential targets
 *  • Mouse-move tracking during a drag (onMouseMove)
 *  • Resolving a drop on mouse-up (onMouseUp)
 *  • The four drop operations:
 *      performMove     – reposition entire dock; center = swap
 *      performTabify   – merge entire dock as tab(s) into target
 *      performDetach   – pull the active tab out, place as standalone dock
 *      performTabMove  – move the active tab into another dock's tab group
 *  • DOM layout helpers: swapDocks, insertDock, _placeDetachedDock,
 *    cleanupEmptyContainer
 */

import { rebuildDockUI }                              from './dock.js';
import { mergeDockAsTab }                             from './tab-group.js';
import { updateResizeHandles, updateConnectionPoints } from './splitter.js';
import { 
    performEmbed, 
    showEmbedDropIndicators, 
    hideEmbedDropIndicators,
    getEmbedDropZone 
} from './embedded.js';

/* ══════════════════════════════════════════════════════════════════════════
   DRAG INITIATION
══════════════════════════════════════════════════════════════════════════ */

/**
 * Records the start of a drag operation on a dock (or one of its panels).
 *
 * dragMode values:
 *   'move'     – reposition the whole dock; center drop = swap
 *   'tabify'   – merge the whole dock as tabs into target; zone = tab direction
 *   'detach'   – pull one panel out of a tabs group and place as standalone dock
 *   'tab-move' – move one panel into another dock's tabs group
 *
 * @param {DockingSystem} sys
 * @param {MouseEvent}    e
 * @param {HTMLElement}   dock
 * @param {string}        mode        – see dragMode values above
 * @param {number|null}   panelIndex  – active panel index (detach / tab-move)
 */
export function beginDrag(sys, e, dock, mode, panelIndex) {
    sys.dragMode        = mode;
    sys.draggedDock     = dock;
    sys.extractPanelIdx = panelIndex;
    dock.classList.add('dragging');
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUSE TRACKING  (called from shortcuts.js)
══════════════════════════════════════════════════════════════════════════ */

/**
 * Tracks the cursor position during a drag, updates the hovered drop target,
 * and refreshes drop-indicator highlights.
 *
 * @param {DockingSystem} sys
 * @param {MouseEvent}    e
 */
export function onMouseMove(sys, e) {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const tgt = els.find(el =>
        el.classList.contains('dock') && el !== sys.draggedDock
    );

    clearDropIndicators();
    hideEmbedDropIndicators();

    if (tgt) {
        sys.dropTarget = tgt;
        const r        = tgt.getBoundingClientRect();
        const isTabMode = sys.dragMode === 'tabify' || sys.dragMode === 'tab-move';
        const isEmbedMode = sys.dragMode === 'embed';
        
        if (isEmbedMode) {
            sys.dropZone = getEmbedDropZone(
                e.clientX - r.left,
                e.clientY - r.top,
                r.width,
                r.height
            );
            showEmbedDropIndicators(tgt, sys.dropZone);
        } else {
            sys.dropZone = getDropZone(
                e.clientX - r.left,
                e.clientY - r.top,
                r.width,
                r.height
            );
            showDropIndicator(tgt, sys.dropZone, isTabMode);
        }
    } else {
        sys.dropTarget = null;
        sys.dropZone   = null;
    }
}

/**
 * Resolves the drag on mouse-up: dispatches to the correct perform* function,
 * then resets all drag state.
 *
 * @param {DockingSystem} sys
 */
export function onMouseUp(sys) {
    if (sys.dragMode && sys.dropTarget && sys.dropZone) {
        switch (sys.dragMode) {
            case 'move':     performMove(sys);     break;
            case 'tabify':   performTabify(sys);   break;
            case 'detach':   performDetach(sys);   break;
            case 'tab-move': performTabMove(sys);  break;
            case 'embed':    performEmbed(sys);    break;
        }
    }

    if (sys.draggedDock) {
        sys.draggedDock.classList.remove('dragging');
        sys.draggedDock = null;
    }

    clearDropIndicators();
    hideEmbedDropIndicators();
    sys.dragMode        = null;
    sys.dropTarget      = null;
    sys.dropZone        = null;
    sys.extractPanelIdx = null;
}

/* ══════════════════════════════════════════════════════════════════════════
   DROP ZONE COMPUTATION & INDICATORS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Determines which drop zone the cursor is in, given a position relative to
 * a target rect.  The centre 33 % square is 'center'; the remaining edges are
 * 'top', 'bottom', 'left', 'right'.
 *
 * @param {number} x  – cursor x relative to target's left edge
 * @param {number} y  – cursor y relative to target's top edge
 * @param {number} w  – target width
 * @param {number} h  – target height
 * @returns {'top'|'bottom'|'left'|'right'|'center'}
 */
export function getDropZone(x, y, w, h) {
    const t = 0.33;
    if (Math.abs(x - w / 2) < w * t / 2 && Math.abs(y - h / 2) < h * t / 2) return 'center';
    if (y < h * t)       return 'top';
    if (y > h * (1 - t)) return 'bottom';
    if (x < w * t)       return 'left';
    if (x > w * (1 - t)) return 'right';
    return 'center';
}

/**
 * Highlights a drop zone (or all zones in tab mode) on the given dock.
 *
 * Normal mode: one zone highlighted with coloured dashed border.
 * Tab mode:    all five zones shown as blue overlays; hovered zone is darker.
 *
 * @param {HTMLElement} dock
 * @param {string}      zone      – active zone name
 * @param {boolean}     isTabMode – true for 'tabify' and 'tab-move' drags
 */
export function showDropIndicator(dock, zone, isTabMode = false) {
    if (isTabMode) {
        ['top', 'bottom', 'left', 'right', 'center'].forEach(z => {
            const el = dock.querySelector(`:scope > .drop-indicator.${z}`);
            if (!el) return;
            el.classList.add('active', 'tabify-zone');
            if (z === zone) el.classList.add('active-zone');
        });
    } else {
        dock.querySelector(`:scope > .drop-indicator.${zone}`)
            ?.classList.add('active');
    }
}

/**
 * Removes all active / tabify-zone / active-zone classes from every indicator
 * in the document.
 */
export function clearDropIndicators() {
    document.querySelectorAll('.drop-indicator').forEach(el =>
        el.classList.remove('active', 'tabify-zone', 'active-zone')
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   DROP OPERATIONS
══════════════════════════════════════════════════════════════════════════ */

/**
 * MOVE – repositions the dragged dock next to the drop target.
 * center zone → swap positions; any edge zone → insert adjacent.
 */
function performMove(sys) {
    const { draggedDock: src, dropTarget: tgt, dropZone: zone } = sys;
    zone === 'center' ? swapDocks(src, tgt) : insertDock(sys, src, tgt, zone);
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/**
 * TABIFY – merges all panels of the dragged dock into the drop target as tabs.
 * The zone determines the tab-bar direction on the merged result.
 * center → keeps target's current tabsPos.
 */
function performTabify(sys) {
    const { draggedDock: src, dropTarget: tgt, dropZone: zone } = sys;
    const pos = zone === 'center' ? (tgt.dataset.tabsPos || 'top') : zone;
    mergeDockAsTab(sys, src, tgt, pos);
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/**
 * DETACH – extracts the active panel from a multi-tab dock and places it as a
 * standalone dock adjacent to the drop target.
 * center zone is treated as 'right' (adjacent, not swap).
 */
function performDetach(sys) {
    const { draggedDock: src, dropTarget: tgt, dropZone: zone, extractPanelIdx: pi } = sys;
    if (!src || !tgt || pi == null) return;

    const panel = src.panelData[pi];

    // Remove panel from the source dock
    src.panelData.splice(pi, 1);
    if (src.activePanelIndex >= src.panelData.length) {
        src.activePanelIndex = src.panelData.length - 1;
    } else if (src.activePanelIndex > pi) {
        src.activePanelIndex--;
    }

    // Build the new standalone dock (not appended to DOM yet)
    const newDock                = document.createElement('div');
    newDock.className            = 'dock';
    newDock.dataset.tabsPos      = 'top';
    newDock.panelData            = [panel];
    newDock.activePanelIndex     = 0;
    newDock.style.flex           = '1';
    sys.docks.push(newDock);
    rebuildDockUI(sys, newDock);

    // Rebuild or remove source BEFORE placing newDock (prevents tgt disruption)
    if (src.panelData.length === 0) {
        const srcParent = src.parentElement;
        src.remove();
        sys.docks = sys.docks.filter(d => d !== src);
        cleanupEmptyContainer(sys, srcParent);
    } else {
        rebuildDockUI(sys, src);
    }

    _placeDetachedDock(newDock, tgt, zone === 'center' ? 'right' : zone);

    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/**
 * TAB-MOVE – moves the active panel from the dragged dock into the drop
 * target's tabs group (or starts a new tabs group if target had a single panel).
 * The zone determines the resulting tab-bar direction on the target.
 */
function performTabMove(sys) {
    const { draggedDock: src, dropTarget: tgt, dropZone: zone, extractPanelIdx: pi } = sys;
    if (!src || !tgt || src === tgt || pi == null) return;

    const panel  = src.panelData[pi];
    const tabPos = zone === 'center' ? (tgt.dataset.tabsPos || 'top') : zone;

    // Remove from source
    src.panelData.splice(pi, 1);
    if (src.activePanelIndex >= src.panelData.length) {
        src.activePanelIndex = src.panelData.length - 1;
    } else if (src.activePanelIndex > pi) {
        src.activePanelIndex--;
    }

    // Add to target (rebuildDockUI will create the tabs bar if needed)
    tgt.panelData.push(panel);
    tgt.dataset.tabsPos  = tabPos;
    tgt.activePanelIndex = tgt.panelData.length - 1;

    if (src.panelData.length === 0) {
        const srcParent = src.parentElement;
        src.remove();
        sys.docks = sys.docks.filter(d => d !== src);
        cleanupEmptyContainer(sys, srcParent);
    } else {
        rebuildDockUI(sys, src);
    }

    rebuildDockUI(sys, tgt);
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/* ══════════════════════════════════════════════════════════════════════════
   LAYOUT HELPERS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Swaps two docks in the DOM, handling the case where they are siblings.
 *
 * @param {HTMLElement} d1
 * @param {HTMLElement} d2
 */
export function swapDocks(d1, d2) {
    const p1 = d1.parentElement, p2 = d2.parentElement;
    const n1 = d1.nextSibling,   n2 = d2.nextSibling;

    if      (n1 === d2) { p1.insertBefore(d2, d1); }
    else if (n2 === d1) { p2.insertBefore(d1, d2); }
    else {
        if (n1) p1.insertBefore(d2, n1); else p1.appendChild(d2);
        if (n2) p2.insertBefore(d1, n2); else p2.appendChild(d1);
    }
}

/**
 * Moves `dragged` to a position adjacent to `target` determined by `zone`.
 * Wraps `target` in a dock-row / dock-column if necessary.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dragged
 * @param {HTMLElement}   target
 * @param {'top'|'bottom'|'left'|'right'} zone
 */
export function insertDock(sys, dragged, target, zone) {
    const parent    = target.parentElement;
    const oldParent = dragged.parentElement;
    dragged.remove();
    dragged.style.flex = '1';
    cleanupEmptyContainer(sys, oldParent);

    if (zone === 'top' || zone === 'bottom') {
        if (!parent.classList.contains('dock-column')) {
            const col      = document.createElement('div');
            col.className  = 'dock-column';
            col.style.flex = target.style.flex || '1';
            parent.insertBefore(col, target);
            target.remove();
            target.style.flex = '1';
            col.appendChild(target);
        }
        zone === 'top'
            ? target.parentElement.insertBefore(dragged, target)
            : _insertAfter(dragged, target);
    } else {
        if (!parent.classList.contains('dock-row')) {
            const row      = document.createElement('div');
            row.className  = 'dock-row';
            row.style.flex = target.style.flex || '1';
            parent.insertBefore(row, target);
            target.remove();
            target.style.flex = '1';
            row.appendChild(target);
        }
        zone === 'left'
            ? target.parentElement.insertBefore(dragged, target)
            : _insertAfter(dragged, target);
    }
}

/**
 * Places an already-built `newDock` (not yet in the DOM) adjacent to `target`.
 * Used exclusively by performDetach.
 *
 * @param {HTMLElement}                   newDock
 * @param {HTMLElement}                   target
 * @param {'top'|'bottom'|'left'|'right'} zone
 */
function _placeDetachedDock(newDock, target, zone) {
    const parent = target.parentElement;

    if (zone === 'top' || zone === 'bottom') {
        if (!parent.classList.contains('dock-column')) {
            const col      = document.createElement('div');
            col.className  = 'dock-column';
            col.style.flex = target.style.flex || '1';
            parent.insertBefore(col, target);
            target.remove();
            target.style.flex = '1';
            col.appendChild(target);
        }
        zone === 'top'
            ? target.parentElement.insertBefore(newDock, target)
            : _insertAfter(newDock, target);
    } else {
        if (!parent.classList.contains('dock-row')) {
            const row      = document.createElement('div');
            row.className  = 'dock-row';
            row.style.flex = target.style.flex || '1';
            parent.insertBefore(row, target);
            target.remove();
            target.style.flex = '1';
            row.appendChild(target);
        }
        zone === 'left'
            ? target.parentElement.insertBefore(newDock, target)
            : _insertAfter(newDock, target);
    }
}

/**
 * Removes empty / single-child layout wrapper elements (dock-row / dock-column)
 * after a dock has been removed.  Unwraps single-child containers so the flex
 * hierarchy stays clean.
 *
 * @param {DockingSystem}       sys
 * @param {HTMLElement|null}    container
 */
export function cleanupEmptyContainer(sys, container) {
    if (!container || container === sys.container) return;

    const kids = Array.from(container.children).filter(c =>
        c.classList.contains('dock') ||
        c.classList.contains('dock-row') ||
        c.classList.contains('dock-column')
    );

    if (kids.length === 0) {
        const p = container.parentElement;
        container.remove();
        cleanupEmptyContainer(sys, p);
    } else if (kids.length === 1) {
        const child = kids[0];
        const p     = container.parentElement;
        child.style.flex = container.style.flex || '1';
        if (p) {
            p.insertBefore(child, container);
            container.remove();
            cleanupEmptyContainer(sys, p);
        }
    }
}

/* ── Private DOM helper ─────────────────────────────────────────────────── */
function _insertAfter(newNode, referenceNode) {
    const next = referenceNode.nextSibling;
    next
        ? referenceNode.parentElement.insertBefore(newNode, next)
        : referenceNode.parentElement.appendChild(newNode);
}
