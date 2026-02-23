/**
 * header.js
 * ─────────
 * Responsible for:
 *  • Building the HTML strings for the tabs-group header and the per-dock header
 *  • Showing / hiding those headers (triggered by Ctrl key via shortcuts.js)
 */

/* ── HTML builders ──────────────────────────────────────────────────────── */

/**
 * Returns the HTML for the dark "N tabs" group header that appears above the
 * tab-bar when the user presses Ctrl.  It exposes "☰ Group" (drag to move the
 * whole tab-group) and "⊟ Ungroup" (split all tabs into individual docks).
 *
 * @param {Array} panels  – the dock's panelData array
 * @returns {string}
 */
export function buildGroupHeaderHTML(panels) {
    return `
    <div class="tabs-group-header">
        <span class="tgh-label">${panels.length} tabs</span>
        <div class="tgh-controls">
            <button class="tgh-btn tgh-move"
                    title="Drag to reposition entire tab group">☰ Group</button>
            <button class="tgh-btn tgh-ungroup"
                    title="Split all tabs into individual docks">⊟ Ungroup</button>
        </div>
    </div>`;
}

/**
 * Returns the HTML for the per-panel dock header (shown on Ctrl).
 * It exposes three controls:
 *   ☰  Move   – detach this tab as an individual dock  (multi-tab)
 *             / reposition this dock                   (single)
 *   ⊞  Tab    – move this tab into another dock        (multi-tab)
 *             / merge this dock as a tab into another  (single)
 *   ✕  Remove – close this tab / dock
 *
 * @param {string}  title   – active panel title
 * @param {boolean} hasTabs – true when the dock holds 2+ panels
 * @returns {string}
 */
export function buildDockHeaderHTML(title, hasTabs) {
    const safe = escapeHTML(title);
    return `
    <div class="dock-header">
        <span class="dock-title">${safe}</span>
        <div class="dock-controls">
            <button class="dc-btn dh-move"
                    title="${hasTabs
                        ? 'Drag: detach this tab as individual dock'
                        : 'Drag: reposition this dock (center=swap)'}">☰</button>
            <button class="dc-btn dh-tabify"
                    title="Drag: move ${hasTabs ? 'this tab' : 'this dock'} as tab into another dock or tabs group">⊞</button>
            <button class="dc-btn dh-remove"
                    title="Remove ${hasTabs ? 'this tab' : 'this dock'}">✕</button>
        </div>
    </div>`;
}

/* ── Visibility helpers ─────────────────────────────────────────────────── */

/**
 * Shows the dock header (and optionally the group header) for a given dock.
 * When showing the group header the normal tabs-bar is hidden to avoid overlap.
 *
 * @param {HTMLElement} dock
 */
export function showDockHeaders(dock) {
    dock.querySelector(':scope > .dock-header')
        ?.classList.add('visible');

    if (dock.panelData.length > 1) {
        dock.querySelector(':scope > .tabs-group-header')
            ?.classList.add('visible');
        dock.querySelector(':scope > .dock-body > .dock-tabs-bar')
            ?.classList.add('ctrl-hidden');
    }
}

/**
 * Hides all headers for a dock and restores the tabs-bar.
 *
 * @param {HTMLElement} dock
 */
export function hideDockHeaders(dock) {
    dock.querySelector(':scope > .dock-header')
        ?.classList.remove('visible');
    dock.querySelector(':scope > .tabs-group-header')
        ?.classList.remove('visible');
    dock.querySelector(':scope > .dock-body > .dock-tabs-bar')
        ?.classList.remove('ctrl-hidden');
}

/**
 * Hides headers on every dock managed by the system.
 * Typically called on window blur.
 *
 * @param {DockingSystem} sys
 */
export function hideAllDockHeaders(sys) {
    sys.docks.forEach(d => hideDockHeaders(d));
}

/* ── Internal utility ───────────────────────────────────────────────────── */
function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
