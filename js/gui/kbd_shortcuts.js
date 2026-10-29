/* ═══════════════════════════════════════════════════════════════
   gui/kbd_shortcuts.js — Keyboard modifier system

   1. Header reveal  (sticky until mouseleave)
      ─────────────────────────────────────────
      Ctrl  held → press once → panel header appears.
      Shift held → press once → parent dock header appears.
      Releasing the key does NOT hide the header.
      Moving the mouse OUT of the dock hides it.

      Tracked by NODE ID (data-id attribute) so re-renders don't
      break the sticky state — we re-query the element by ID on
      every access, never hold a stale DOM reference.

      mousemove on document checks containment: if cursor is no
      longer inside the tracked element, clear the peek.

   2. Drag mode      (real-time, reliable)
      ─────────────────────────────────────
      Shift = embed  |  Ctrl = tab  |  default = insert.
      Updated from: keydown/keyup AND global dragover (dragover
      carries reliable shiftKey/ctrlKey; the `drag` source-event
      does NOT in Chrome — known browser bug).
      A RAF loop keeps mode in sync between events.
═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   1.  HEADER REVEAL — ID-BASED STICKY PEEK
══════════════════════════════════════════════════════════════ */

let _peekedNodeId  = null;   // data-id of the currently peeked dock
let _lastMouseEl   = null;   // deepest DOM element last seen under cursor

const _PARENT_SELS = ['.lc-container-wrapper', '.lc-tabs', '.lc-embed'];
const _CHILD_SELS  = ['.lc-panel'];

/** Find the DOM element for a tracked node ID (handles re-renders). */
function _getPeekedEl() {
  return _peekedNodeId
    ? document.querySelector(`[data-id="${_peekedNodeId}"]`)
    : null;
}

/**
 * Walk up from `el` to find the nearest element matching any selector.
 * Stops at #layout-root.
 */
function _closest(el, sels) {
  let node = el;
  while (node && node !== document.body) {
    if (node.id === 'layout-root') break;
    for (const s of sels) {
      try { if (node.matches && node.matches(s)) return node; } catch (_) {}
    }
    node = node.parentElement;
  }
  return null;
}

/** Remove .peek-header from the currently tracked dock. */
function clearPeek() {
  const el = _getPeekedEl();
  if (el) el.classList.remove('peek-header');
  _peekedNodeId = null;
}

/**
 * Add .peek-header to a dock element.
 * Tracks by data-id so re-renders don't lose the state.
 */
function _setPeek(el) {
  if (!el) return;
  const id = el.dataset.id;
  if (!id) return;
  if (id === _peekedNodeId) return;  // same element — no-op

  clearPeek();
  _peekedNodeId = id;
  el.classList.add('peek-header');
}

/**
 * On every mousemove: check if the cursor is still inside the peeked dock.
 * If not, clear it. Then (if a modifier is held) try to peek a new dock.
 */
document.addEventListener('mousemove', e => {
  _lastMouseEl = e.target;

  // --- Containment check (runs regardless of modifier state) ---
  if (_peekedNodeId) {
    const el = _getPeekedEl();
    // Clear if element is gone (re-render removed it) or cursor left it
    if (!el || !el.contains(e.target)) {
      clearPeek();
    }
  }

  // --- Try to reveal a new dock if modifier held ---
  // Only when no dock is currently peeked (avoid flickering between docks)
  if (!_peekedNodeId && (_liveCtrl || _liveShift)) {
    _tryReveal();
  }
}, { passive: true });

/** Find and peek the dock under the cursor according to modifier state. */
function _tryReveal() {
  if (typeof dragState !== 'undefined' && dragState.active) return;

  let target = null;
  if (_liveShift) target = _closest(_lastMouseEl, _PARENT_SELS);
  if (!target && _liveCtrl) target = _closest(_lastMouseEl, _CHILD_SELS);
  _setPeek(target);
}

/**
 * Re-apply .peek-header after a render() call replaces DOM elements.
 * Called from main.js immediately after root.innerHTML replacement.
 */
function reapplyPeek() {
  if (!_peekedNodeId) return;
  const el = document.querySelector(`[data-id="${_peekedNodeId}"]`);
  if (el) {
    el.classList.add('peek-header');
  } else {
    // Node no longer exists in tree (was closed / moved)
    _peekedNodeId = null;
  }
}

/* ══════════════════════════════════════════════════════════════
   2.  DRAG MODE — REAL-TIME MODIFIER TRACKING
══════════════════════════════════════════════════════════════ */

let _liveShift = false;
let _liveCtrl  = false;

function _trackMods(e) {
  if (typeof e.shiftKey === 'boolean') _liveShift = e.shiftKey;
  if (typeof e.ctrlKey  === 'boolean') _liveCtrl  = e.ctrlKey;
}

function modeFromMods(shift, ctrl) {
  return shift ? 'embed' : ctrl ? 'tab' : 'insert';
}

function _applyDragMode(newMode) {
  if (typeof dragState === 'undefined' || !dragState.active) return;
  if (newMode === dragState.mode) return;
  dragState.mode = newMode;
  if (typeof state        !== 'undefined') state.overlayMode = newMode;
  if (typeof syncOverlays === 'function')  syncOverlays(true, newMode, dragState.exceptIds);
  if (typeof updateBadge  === 'function')  updateBadge();
}

/* keydown: update mods + try to reveal header + update drag mode */
document.addEventListener('keydown', e => {
  _trackMods(e);
  _tryReveal();                                       // may set a new peek
  _applyDragMode(modeFromMods(_liveShift, _liveCtrl));
});

/* keyup: update mods + update drag mode — do NOT clear peek */
document.addEventListener('keyup', e => {
  _trackMods(e);
  _applyDragMode(modeFromMods(_liveShift, _liveCtrl));
  // Header stays: clearPeek() is NOT called here
});

/* Window blur: full reset */
window.addEventListener('blur', () => {
  _liveShift = false;
  _liveCtrl  = false;
  clearPeek();
  _applyDragMode('insert');
});

/* dragstart: kick off the RAF loop */
document.addEventListener('dragstart', e => {
  _trackMods(e);
  _rafPoll();
});

/* dragover: most reliable source of modifier state during HTML5 drag */
document.addEventListener('dragover', e => {
  _trackMods(e);
  _applyDragMode(modeFromMods(_liveShift, _liveCtrl));
});

/* RAF loop — keeps mode in sync while cursor is stationary */
function _rafPoll() {
  if (typeof dragState === 'undefined' || !dragState.active) return;
  _applyDragMode(modeFromMods(_liveShift, _liveCtrl));
  requestAnimationFrame(_rafPoll);
}

/** Called from dragover handlers in drag_drop_overlays.js. */
function refreshDragModeFromEvent(e) {
  _trackMods(e);
  _applyDragMode(modeFromMods(_liveShift, _liveCtrl));
}
