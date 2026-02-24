/**
 * dock.js
 * ───────
 * Responsible for:
 *  • Creating / removing individual dock elements
 *  • Building the full dock DOM (rebuildDockUI)
 *  • Wiring all DOM events on a single dock (setupDockEvents)
 *  • Panel data factory (mkPanel)
 *
 * Cross-module calls go through the shared `sys` instance to keep imports
 * acyclic at evaluation time (functions are only called at runtime, after all
 * modules have finished loading).
 */

import { buildGroupHeaderHTML, buildDockHeaderHTML, hideDockHeaders } from './header.js';
import { beginDrag, cleanupEmptyContainer }                           from './placement.js';
import { activatePanel, removePanel, ungroupTabs }                    from './tab-group.js';
import { updateResizeHandles, updateConnectionPoints }                 from './splitter.js';
import { toggleCollapse, canCollapse }                                 from './collapse.js';

/* ── Utilities ──────────────────────────────────────────────────────────── */

/**
 * Minimal HTML-escape so panel titles / content are safe to inject via innerHTML.
 * @param {*} s
 * @returns {string}
 */
export function esc(s) {
    return String(s)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
}

/* ── Panel factory ──────────────────────────────────────────────────────── */

/**
 * Creates a plain-object descriptor for a panel.
 * Content is raw HTML; call esc() on user-supplied strings before embedding.
 *
 * @param {DockingSystem} sys
 * @param {string} title       – tab label & header title
 * @param {string} html        – innerHTML for the panel body
 * @returns {{ id:string, title:string, contentHTML:string }}
 */
export function mkPanel(sys, title, html) {
    return {
        id:          `p-${++sys.panelCounter}`,
        title,
        contentHTML: html,
    };
}

/* ── Dock creation / removal ────────────────────────────────────────────── */

/**
 * Creates a new dock element, registers it with the system, appends it to
 * `parent`, and returns the element.
 *
 * @param {DockingSystem}  sys
 * @param {HTMLElement}   [parent=sys.container]
 * @param {Array|null}    [panels=null]   – array of panel descriptors; if null
 *                                          a single default panel is created
 * @param {string}        [tabsPos='top'] – 'top'|'bottom'|'left'|'right'
 * @returns {HTMLElement} the new dock element
 */
export function createDock(sys, parent = sys.container, panels = null, tabsPos = 'top') {
    const num  = ++sys.dockCounter;
    const dock = document.createElement('div');

    dock.className        = 'dock';
    dock.dataset.tabsPos  = tabsPos;
    dock.panelData        = panels ?? [
        mkPanel(sys, `Panel ${num}`, `<div class="dock-card">Panel ${num}</div>`),
    ];
    dock.activePanelIndex = 0;

    parent.appendChild(dock);
    sys.docks.push(dock);
    rebuildDockUI(sys, dock);
    return dock;
}

/**
 * Removes a dock from the DOM and from sys.docks, then cleans up any empty
 * wrapper containers left behind.  Refuses if only one dock remains.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 */
export function removeDock(sys, dock) {
    if (sys.docks.length <= 1) {
        alert('Cannot remove the last dock!');
        return;
    }
    const parent = dock.parentElement;
    dock.remove();
    sys.docks = sys.docks.filter(d => d !== dock);
    cleanupEmptyContainer(sys, parent);
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

/* ── UI rebuild ─────────────────────────────────────────────────────────── */

/**
 * Completely rebuilds the innerHTML of `dock` from its `panelData` array and
 * re-attaches all event listeners.  Call this after any structural change to a
 * dock (tab added, removed, activated, etc.).
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 */
export function rebuildDockUI(sys, dock) {
    const panels = dock.panelData;
    const ai     = Math.min(dock.activePanelIndex ?? 0, panels.length - 1);
    dock.activePanelIndex = ai;

    const hasTabs = panels.length > 1;
    const tabsPos = dock.dataset.tabsPos || 'top';

    /* ── Group header (multi-tab only) ── */
    const groupHdr = hasTabs ? buildGroupHeaderHTML(panels, tabsPos) : '';

    /* ── Per-panel dock header ── */
    const dockHdr = buildDockHeaderHTML(panels[ai].title, hasTabs);

    /* ── Tabs bar (multi-tab only) ── */
    const tabsBar = hasTabs ? `
        <div class="dock-tabs-bar">
            ${panels.map((p, i) => `
            <div class="dock-tab ${i === ai ? 'active' : ''}" data-pi="${i}">
                <span class="tab-title">${esc(p.title)}</span>
                <button class="tab-close" title="Close tab">×</button>
            </div>`).join('')}
        </div>` : '';

    /* ── Panel content areas ── */
    const panelsHTML = panels.map((p, i) => `
        <div class="dock-panel ${i === ai ? 'active' : ''}" data-pi="${i}">
            ${p.contentHTML}
        </div>`).join('');

    dock.innerHTML = `
        ${groupHdr}
        ${dockHdr}
        <div class="dock-body">
            ${tabsBar}
            <div class="dock-main">
                <div class="dock-content">${panelsHTML}</div>
            </div>
        </div>
        <div class="drop-indicator top"></div>
        <div class="drop-indicator bottom"></div>
        <div class="drop-indicator left"></div>
        <div class="drop-indicator right"></div>
        <div class="drop-indicator center"></div>
    `;

    setupDockEvents(sys, dock);
}

/**
 * Changes the tabs position for a dock and rebuilds its UI.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 * @param {string}        tabsPos – 'top'|'bottom'|'left'|'right'
 */
export function setTabsPosition(sys, dock, tabsPos) {
    dock.dataset.tabsPos = tabsPos;
    rebuildDockUI(sys, dock);
}

/* ── Event wiring ───────────────────────────────────────────────────────── */

/**
 * Attaches all event listeners to the freshly-rendered dock element.
 * Split into logical groups: hover tracking, group-header buttons,
 * dock-header buttons, and the tabs bar.
 *
 * @param {DockingSystem} sys
 * @param {HTMLElement}   dock
 */
export function setupDockEvents(sys, dock) {
    const hasTabs = dock.panelData.length > 1;

    /* ── Hover tracking (used by shortcuts.js for Ctrl header reveal) ── */
    dock.addEventListener('mouseenter', () => { sys.hoveredDock = dock; });
    dock.addEventListener('mouseleave', () => {
        if (sys.hoveredDock === dock) sys.hoveredDock = null;
        hideDockHeaders(dock);
    });

    /* ── Tabs Group Header ─────────────────────────────────────────────
        "☰ Group"  → drag the entire tab-group to a new position (mode: 'move')
        "⊟ Ungroup" → split every tab into its own separate dock
        "⤴/⤵/⤶/⤷" → change tabs position
        "▼ Collapse" → collapse the tab group
        "✕ Remove" → remove the entire tab group
    ── */
    dock.querySelector('.tgh-move')?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        beginDrag(sys, e, dock, 'move', null);
    });

    dock.querySelector('.tgh-ungroup')?.addEventListener('click', () => {
        ungroupTabs(sys, dock);
    });

    // Tabs position buttons
    dock.querySelector('.tgh-pos-top')?.addEventListener('click', () => {
        setTabsPosition(sys, dock, 'top');
    });
    dock.querySelector('.tgh-pos-bottom')?.addEventListener('click', () => {
        setTabsPosition(sys, dock, 'bottom');
    });
    dock.querySelector('.tgh-pos-left')?.addEventListener('click', () => {
        setTabsPosition(sys, dock, 'left');
    });
    dock.querySelector('.tgh-pos-right')?.addEventListener('click', () => {
        setTabsPosition(sys, dock, 'right');
    });

    dock.querySelector('.tgh-collapse')?.addEventListener('click', () => {
        if (canCollapse(dock)) {
            toggleCollapse(dock);
            updateResizeHandles(sys);
            updateConnectionPoints(sys);
        }
    });

    dock.querySelector('.tgh-remove')?.addEventListener('click', () => {
        removeDock(sys, dock);
    });

    /* ── Dock Header ───────────────────────────────────────────────────
        "☰ Move"
            multi-tab → detach active tab as standalone dock  (mode: 'detach')
            single    → move entire dock                      (mode: 'move')

        "⊞ Tab"
            multi-tab → move active tab into another dock     (mode: 'tab-move')
            single    → merge whole dock as tab               (mode: 'tabify')

        "▼ Collapse" (single dock only)
            collapse dock horizontally or vertically based on parent layout

        "✕ Remove"
            multi-tab → close the active tab
            single    → remove the dock
    ── */
    dock.querySelector('.dh-move')?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hasTabs
            ? beginDrag(sys, e, dock, 'detach',  dock.activePanelIndex)
            : beginDrag(sys, e, dock, 'move',    null);
    });

    dock.querySelector('.dh-tabify')?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hasTabs
            ? beginDrag(sys, e, dock, 'tab-move', dock.activePanelIndex)
            : beginDrag(sys, e, dock, 'tabify',   null);
    });

    dock.querySelector('.dh-collapse')?.addEventListener('click', () => {
        if (canCollapse(dock)) {
            toggleCollapse(dock);
            updateResizeHandles(sys);
            updateConnectionPoints(sys);
        }
    });

    dock.querySelector('.dh-remove')?.addEventListener('click', () => {
        hasTabs
            ? removePanel(sys, dock, dock.activePanelIndex)
            : removeDock(sys, dock);
    });

    /* ── Tabs bar ──────────────────────────────────────────────────────
        Click a tab title → activate that panel.
        Click × → close that tab.
    ── */
    dock.querySelectorAll('.dock-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close'))
                activatePanel(sys, dock, +tab.dataset.pi);
        });
        tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removePanel(sys, dock, +tab.dataset.pi);
        });
    });
}
