/**
 * tab-group.js
 * ────────────
 * Responsible for:
 *  • Activating a panel within a dock
 *  • Removing a single panel (closing a tab)
 *  • Ungrouping: splitting a multi-tab dock into individual docks
 *  • Merging an entire dock's panels into another dock as tabs
 *
 * All functions receive `sys` (the DockingSystem instance) so they can
 * coordinate with the rest of the system without a shared global.
 */

import { rebuildDockUI }                     from './dock.js';
import { cleanupEmptyContainer }             from './placement.js';
import { updateResizeHandles, updateConnectionPoints } from './splitter.js';

/* ── Panel activation ───────────────────────────────────────────────────── */

/**
 * Switches the visible panel inside a dock.
 * Updates tab highlights, shows the correct panel, and refreshes the
 * dock-header title without a full DOM rebuild.
 *
 * @param {DockingSystem} sys   (unused here but kept for API consistency)
 * @param {HTMLElement}   dock
 * @param {number}        index – zero-based panel index
 */
export function activatePanel(_sys, dock, index) {
    dock.activePanelIndex = index;

    dock.querySelectorAll('.dock-tab')
        .forEach((t, i) => t.classList.toggle('active', i === index));
    dock.querySelectorAll('.dock-panel')
        .forEach((p, i) => p.classList.toggle('active', i === index));

    const titleEl = dock.querySelector(':scope > .dock-header .dock-title');
    if (titleEl) titleEl.textContent = dock.panelData[index].title;
}

/* ── Panel removal ──────────────────────────────────────────────────────── */

/**
 * Removes one panel from a dock.
 *
 * Edge cases handled:
 *  • Last panel → delegates to removeDock (imported lazily to avoid circular
 *    evaluation-time reference).
 *  • Active index out-of-bounds after removal → clamped to last item.
 *  • Active index was after the removed item → decremented by 1.
 *
 * After removal rebuildDockUI is called; if only one panel is left the tabs
 * bar is automatically hidden because hasTabs becomes false.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 * @param {number}        index – index of the panel to remove
 */
export function removePanel(sys, dock, index) {
    // Delegate to removeDock when this is the last panel
    if (dock.panelData.length <= 1) {
        // Dynamic import breaks the circular dep at evaluation time
        import('./dock.js').then(({ removeDock }) => removeDock(sys, dock));
        return;
    }

    dock.panelData.splice(index, 1);

    if (dock.activePanelIndex >= dock.panelData.length) {
        dock.activePanelIndex = dock.panelData.length - 1;
    } else if (dock.activePanelIndex > index) {
        dock.activePanelIndex--;
    }

    rebuildDockUI(sys, dock);
}

/* ── Ungroup (split tabs into individual docks) ─────────────────────────── */

/**
 * Splits every panel in a multi-tab dock into its own standalone dock.
 *
 * Layout direction of the new docks mirrors the existing tab position:
 *   • top / bottom tabs → new docks placed side-by-side (dock-row)
 *   • left / right tabs → new docks stacked vertically   (dock-column)
 *
 * The original dock element is replaced in the DOM by a wrapper containing the
 * new individual docks.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 */
export function ungroupTabs(sys, dock) {
    if (dock.panelData.length <= 1) return;

    const tabsPos  = dock.dataset.tabsPos || 'top';
    const isH      = tabsPos === 'top' || tabsPos === 'bottom';
    const parent   = dock.parentElement;
    const flexVal  = dock.style.flex || '1';

    // Wrapper maintains the same flex footprint as the original dock
    const wrapper      = document.createElement('div');
    wrapper.className  = isH ? 'dock-row' : 'dock-column';
    wrapper.style.flex = flexVal;

    dock.panelData.forEach(panel => {
        const newDock                = document.createElement('div');
        newDock.className            = 'dock';
        newDock.dataset.tabsPos      = 'top';
        newDock.panelData            = [panel];
        newDock.activePanelIndex     = 0;
        wrapper.appendChild(newDock);
        sys.docks.push(newDock);
        rebuildDockUI(sys, newDock);
    });

    // Swap the original dock for the wrapper
    parent.insertBefore(wrapper, dock);
    dock.remove();
    sys.docks = sys.docks.filter(d => d !== dock);

    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/* ── Merge (tabify) ─────────────────────────────────────────────────────── */

/**
 * Merges all panels from `src` into `tgt` as tabs, then removes `src`.
 *
 * If `tgt` previously had only one panel, rebuildDockUI will automatically
 * render the tabs bar (hasTabs becomes true).
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   src      – dock being consumed
 * @param {HTMLElement}   tgt      – dock that receives the new tabs
 * @param {string}        tabsPos  – 'top'|'bottom'|'left'|'right'
 */
export function mergeDockAsTab(sys, src, tgt, tabsPos) {
    const oldParent = src.parentElement;

    src.panelData.forEach(p => tgt.panelData.push(p));
    tgt.dataset.tabsPos  = tabsPos;
    tgt.activePanelIndex = 0;

    src.remove();
    sys.docks = sys.docks.filter(d => d !== src);
    cleanupEmptyContainer(sys, oldParent);

    rebuildDockUI(sys, tgt);
}
