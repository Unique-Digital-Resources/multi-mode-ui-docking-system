/**
 * shortcuts.js
 * ────────────
 * Responsible for:
 *  • Wiring all document-level and window-level event listeners
 *  • Ctrl key → toggle dock / tabs-group headers on the hovered dock
 *  • Window blur → hide all open headers
 *  • mousemove → route to splitter (resize) or placement (drag) logic
 *  • mouseup   → finalise resize or drag-drop
 *  • First-hover hint toast (guides new users toward Ctrl interaction)
 *
 * Nothing in this file modifies the DOM layout directly; it delegates to the
 * appropriate module for every action.
 */

import { showDockHeaders, hideDockHeaders, hideAllDockHeaders } from './header.js';
import { onMouseMove, onMouseUp }                               from './placement.js';
import { handleResize, updateConnectionPoints }                  from './splitter.js';
import { 
    handleEmbeddedDragMove, 
    handleEmbeddedDragEnd 
} from './embedded.js';

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC INIT
══════════════════════════════════════════════════════════════════════════ */

/**
 * Attaches all global event listeners for the docking system.
 * Must be called once after the initial docks are created.
 *
 * @param {DockingSystem} sys
 */
export function initShortcuts(sys) {
    _initMouseListeners(sys);
    _initKeyboardListeners(sys);
    _initHint(sys);
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUSE EVENTS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Unified mousemove handler.
 * Priority: active resize → active drag → idle (no-op).
 *
 * Triggered on: document mousemove
 */
function _initMouseListeners(sys) {
    document.addEventListener('mousemove', (e) => {
        if (sys.resizing) {
            handleResize(sys, e);
            return;
        }
        if (sys.embeddedDrag) {
            handleEmbeddedDragMove(sys, e);
            return;
        }
        if (sys.dragMode) {
            onMouseMove(sys, e);
        }
    });

    document.addEventListener('mouseup', () => {
        if (sys.resizing) {
            sys.resizing.handle.classList.remove('resizing');
            sys.resizing = null;
            updateConnectionPoints(sys);
            return;
        }
        if (sys.embeddedDrag) {
            handleEmbeddedDragEnd(sys);
            return;
        }
        if (sys.dragMode) {
            onMouseUp(sys);
        }
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Keyboard event map:
 *
 *   Ctrl (keydown, non-repeat)
 *     • While hovering a dock → toggle its dock-header and (if multi-tab)
 *       its tabs-group-header.
 *     • No hovered dock → no-op.
 *
 * Window blur:
 *     • Hide all open headers (user tabbed away or lost focus).
 *
 * @param {DockingSystem} sys
 */
function _initKeyboardListeners(sys) {
    document.addEventListener('keydown', (e) => {
        // Only react to the first Ctrl press (ignore auto-repeat)
        if (e.key !== 'Control' || e.repeat || !sys.hoveredDock) return;

        const dock = sys.hoveredDock;
        const hdr  = dock.querySelector(':scope > .dock-header');

        // Toggle: show if hidden, hide if already visible
        hdr?.classList.contains('visible')
            ? hideDockHeaders(dock)
            : showDockHeaders(dock);
    });

    window.addEventListener('blur', () => hideAllDockHeaders(sys));
}

/* ══════════════════════════════════════════════════════════════════════════
   HINT TOAST
══════════════════════════════════════════════════════════════════════════ */

/**
 * Shows a brief floating hint the first time the user's cursor enters the
 * docking container, telling them about the Ctrl shortcut.
 *
 * The { once: true } option ensures the listener is automatically removed
 * after firing so there is no ongoing overhead.
 *
 * @param {DockingSystem} sys
 */
function _initHint(sys) {
    sys.container.addEventListener('mouseenter', () => _showHint(sys), { once: true });
}

/**
 * Displays the hint element for 4.5 seconds then fades it out.
 *
 * @param {DockingSystem} sys
 */
function _showHint(sys) {
    const el = document.getElementById('ctrl-hint');
    if (!el) return;

    el.classList.add('show');
    clearTimeout(sys.hintTimeout);
    sys.hintTimeout = setTimeout(() => el.classList.remove('show'), 4500);
}
