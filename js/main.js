/**
 * main.js
 * ───────
 * Entry point for the DockingSystem component.
 *
 * This module owns the shared system state object (`sys`) and wires together
 * all sub-modules:
 *
 *   dock.js        – individual dock creation, UI rebuild, event wiring
 *   header.js      – dock / tabs-group header HTML and visibility
 *   tab-group.js   – tab activation, removal, ungroup, merge
 *   placement.js   – drag initiation, drop zones, layout operations
 *   splitter.js    – resize handles, min-size calc, connection points
 *   shortcuts.js   – keyboard shortcuts and global mouse listeners
 *
 * Usage
 * ─────
 *   import { DockingSystem } from './js/main.js';
 *   const dock = new DockingSystem('my-container-id');
 *
 * The constructor creates three default docks inside #my-container-id.
 * After construction you can call the public API methods below to add
 * panels, create docks, etc. programmatically.
 *
 * State shape
 * ───────────
 *   container       HTMLElement   – root flex container
 *   docks           HTMLElement[] – all active dock elements
 *   dragMode        string|null   – 'move'|'tabify'|'detach'|'tab-move'|null
 *   draggedDock     HTMLElement|null
 *   extractPanelIdx number|null   – panel index during 'detach'/'tab-move'
 *   dropTarget      HTMLElement|null
 *   dropZone        string|null   – 'top'|'bottom'|'left'|'right'|'center'
 *   resizing        object|null   – active resize session data (see splitter.js)
 *   dockCounter     number        – monotonically increasing dock ID seed
 *   panelCounter    number        – monotonically increasing panel ID seed
 *   hoveredDock     HTMLElement|null – dock under the cursor (for Ctrl toggle)
 *   hintTimeout     number|null   – setTimeout handle for the hint toast
 */

import { createDock, mkPanel }                        from './dock.js';
import { updateResizeHandles, updateConnectionPoints } from './splitter.js';
import { initShortcuts }                               from './shortcuts.js';

export class DockingSystem {
    /* ── Construction ────────────────────────────────────────────────────── */

    /**
     * @param {string} containerId – id of the root container element
     */
    constructor(containerId) {
        /* ── Shared state ── */
        this.container       = document.getElementById(containerId);
        this.docks           = [];
        this.embeddedDocks   = [];

        /* Drag state */
        this.dragMode        = null;   // 'move' | 'tabify' | 'detach' | 'tab-move' | 'embed'
        this.draggedDock     = null;
        this.extractPanelIdx = null;

        /* Embedded drag state */
        this.embeddedDrag    = null;   // { dock, parentDock, mode, startX, startY, ... }

        /* Drop state */
        this.dropTarget      = null;
        this.dropZone        = null;   // 'top' | 'bottom' | 'left' | 'right' | 'center' | 'floating'

        /* Resize state */
        this.resizing        = null;   // set by splitter.startResize

        /* ID counters */
        this.dockCounter     = 0;
        this.panelCounter    = 0;

        /* Interaction helpers */
        this.hoveredDock     = null;   // dock currently under the cursor
        this.hintTimeout     = null;   // for the Ctrl hint toast

        this._init();
    }

    /* ── Private bootstrap ───────────────────────────────────────────────── */

    _init() {
        // Create the three default docks
        createDock(this);
        createDock(this);
        createDock(this);

        // Build resize handles and connection points for the initial layout
        updateResizeHandles(this);
        updateConnectionPoints(this);

        // Attach all keyboard / mouse event listeners
        initShortcuts(this);
    }

    /* ══════════════════════════════════════════════════════════════════════
       PUBLIC API
    ══════════════════════════════════════════════════════════════════════ */

    /**
     * Programmatically adds a new dock to the container.
     *
     * @param {HTMLElement}  [parent]   – parent element (defaults to root container)
     * @param {Array|null}   [panels]   – array of { id, title, contentHTML } objects;
     *                                    pass null for a single auto-named panel
     * @param {string}       [tabsPos]  – 'top'|'bottom'|'left'|'right'
     * @returns {HTMLElement} the created dock element
     *
     * @example
     *   const myDock = dockingSystem.addDock(null, [
     *     dockingSystem.createPanel('Console', '<pre>Hello</pre>'),
     *     dockingSystem.createPanel('Output',  '<pre>World</pre>'),
     *   ], 'bottom');
     */
    addDock(parent = null, panels = null, tabsPos = 'top') {
        const dock = createDock(this, parent ?? this.container, panels, tabsPos);
        updateResizeHandles(this);
        updateConnectionPoints(this);
        return dock;
    }

    /**
     * Creates a panel descriptor object without adding it to any dock.
     * Pass an array of these to addDock() or push directly to dock.panelData
     * and then call rebuildDockUI().
     *
     * @param {string} title       – tab label
     * @param {string} contentHTML – raw HTML string for the panel body
     * @returns {{ id:string, title:string, contentHTML:string }}
     *
     * @example
     *   const panel = dockingSystem.createPanel('My Tab', '<p>Hello</p>');
     */
    createPanel(title, contentHTML) {
        return mkPanel(this, title, contentHTML);
    }
}
