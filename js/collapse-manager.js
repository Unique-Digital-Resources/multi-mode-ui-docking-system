/* ═══════════════════════════════════════════════════════
   CollapseManager — collapsing for:

   1. Regular docks (single-panel) and tab-groups
      Axis determined by parent container:
        'h' → dock lives in a row   → collapses to a 32 px wide vertical strip
        'v' → dock lives in a column → collapses to a 32 px tall horizontal bar

      GUARD: at least one dock in each row/column must stay expanded.
      The last non-collapsed dock in a group cannot be collapsed.
      Its collapse button is visually disabled and ignored on click.
      The button re-enables automatically when a sibling is expanded.

   2. Zone-embedded slots — TOP-LEVEL only
      Children inside a ZC cannot collapse independently; the ZC collapses them.
      Collapse axis follows the zone's VISUAL orientation:
        left/right zones → HORIZONTAL collapse → ◀/▶ arrows → slot shrinks to a
                           26 px tall horizontal bar (flex controls height in column)
        top/bottom zones → VERTICAL collapse   → ▲/▼ arrows → slot shrinks to a
                           26 px wide vertical strip (flex controls width in row)

   3. Free-floating slots — independent H (width) and V (height)
      Two buttons always visible in the header bar:
        ◀/▶ collapses/expands the WIDTH  → body hidden, header remains
        ▲/▼ collapses/expands the HEIGHT → body hidden, header remains
═══════════════════════════════════════════════════════ */

const CollapseManager = {

  /* ═══════════════════════════════════════════════════
     SECTION 1 — REGULAR DOCK / TAB-GROUP
  ═══════════════════════════════════════════════════ */

  /** Returns 'v' if the dock's parent lays out children vertically (collapses to a bar),
      'h' if horizontal (collapses to a strip).
      Uses computed flex-direction so it works for the root container, dock-row,
      dock-column, or any other flex parent — not just elements with class dock-column. */
  _dockAxis(dock) {
    const parent = dock.parentElement;
    if (!parent) return 'h';
    const dir = getComputedStyle(parent).flexDirection;
    return (dir === 'column' || dir === 'column-reverse') ? 'v' : 'h';
  },

  /**
   * Returns true if this dock is allowed to collapse.
   * Rule: there must be at least one other non-collapsed sibling in the
   * same parent container so that the layout never goes fully empty.
   */
  _canCollapseDock(dock) {
    const parent = dock.parentElement;
    if (!parent) return false;
    const siblings = DockingUtils.getChildren(parent);
    if (siblings.length <= 1) return false; // only child — can never collapse
    const uncollapsed = siblings.filter(s => s.dataset.collapsed !== '1');
    return uncollapsed.length > 1; // can collapse only if more than one is open
  },

  /**
   * Refresh the collapse button icon/title/disabled state on a dock,
   * then do the same for all of its siblings (called after any state change
   * so siblings learn when they become the last open panel in the group).
   */
  /**
   * Refresh buttons for the dock AND every sibling in the same container.
   * Must refresh the whole group so the last-standing guard is consistent
   * no matter which dock triggered the refresh.
   */
  refreshDockButton(dock) {
    CollapseManager.refreshAllSiblings(dock);
  },

  refreshAllSiblings(dock) {
    const parent = dock.parentElement;
    if (!parent) { CollapseManager._refreshOneDockButton(dock); return; }
    DockingUtils.getChildren(parent).forEach(s => {
      /* Only refresh actual dock elements — skip dock-row/dock-column wrappers.
         Wrappers don't have their own collapse buttons; refreshing them would
         walk into their descendant docks via querySelectorAll and corrupt those
         docks' button state with the wrong axis / canCollapse value. */
      if (s.classList.contains('dock')) CollapseManager._refreshOneDockButton(s);
    });
  },

  _refreshOneDockButton(dock) {
    const axis      = CollapseManager._dockAxis(dock);
    const collapsed = dock.dataset.collapsed === '1';
    const canCollapse = collapsed || CollapseManager._canCollapseDock(dock);

    let icon, tip;
    if (collapsed) {
      icon = axis === 'h' ? '▶' : '▼';
      tip  = 'Expand';
    } else {
      icon = axis === 'h' ? '◀' : '▲';
      tip  = canCollapse ? 'Collapse' : 'Cannot collapse — last open panel in group';
    }

    /* :scope > prevents descending into nested docks inside this dock's body */
    dock.querySelectorAll(
      ':scope > .dock-header > .dock-controls > .dh-collapse, ' +
      ':scope > .tabs-group-header > .tgh-controls > .tgh-collapse'
    ).forEach(btn => {
      btn.textContent = icon;
      btn.title       = tip;
      btn.removeAttribute('disabled');
      btn.style.opacity = (!canCollapse && !collapsed) ? '0.25' : '';
      btn.style.cursor  = (!canCollapse && !collapsed) ? 'not-allowed' : '';
    });

    /* Sync axis classes if still collapsed (parent may have moved) */
    if (collapsed) {
      dock.classList.toggle('dock-clps-h', axis === 'h');
      dock.classList.toggle('dock-clps-v', axis === 'v');
      dock.dataset.collapseAxis = axis;
    }
  },

  /** Toggle collapse on a regular or tabbed dock. */
  toggleDock(system, dock) {
    if (dock.dataset.collapsed === '1') {
      CollapseManager._expandDock(system, dock);
    } else {
      if (!CollapseManager._canCollapseDock(dock)) return; // guard
      CollapseManager._collapseDock(system, dock);
    }
  },

  _collapseDock(system, dock) {
    const axis   = CollapseManager._dockAxis(dock);
    const MIN_PX = 32;

    dock.dataset.savedFlex    = dock.style.flex || '1';
    dock.dataset.collapsed    = '1';
    dock.dataset.collapseAxis = axis;

    dock.style.flex = `0 0 ${MIN_PX}px`;
    dock.classList.add('dock-collapsed', axis === 'h' ? 'dock-clps-h' : 'dock-clps-v');

    /* Pin headers visible so they survive mouse-leave */
    dock.querySelectorAll(':scope > .dock-header, :scope > .tabs-group-header')
        .forEach(el => el.classList.add('visible', 'clps-pinned'));

    CollapseManager.refreshAllSiblings(dock);
    system.updateResizeHandles();
    system.updateConnectionPoints();
  },

  _expandDock(system, dock) {
    dock.style.flex        = dock.dataset.savedFlex || '1';
    dock.dataset.collapsed = '0';
    delete dock.dataset.savedFlex;

    dock.classList.remove('dock-collapsed', 'dock-clps-h', 'dock-clps-v');

    /* Unpin — headers revert to normal Ctrl-hover behaviour */
    dock.querySelectorAll(':scope > .dock-header, :scope > .tabs-group-header')
        .forEach(el => el.classList.remove('visible', 'clps-pinned'));

    /* Refresh siblings — one more uncollapsed panel may re-enable their buttons */
    CollapseManager.refreshAllSiblings(dock);
    system.updateResizeHandles();
    system.updateConnectionPoints();
  },


  /* ═══════════════════════════════════════════════════
     SECTION 2 — ZONE-EMBEDDED SLOTS  (top-level only)
  ═══════════════════════════════════════════════════ */

  /**
   * Zone collapse orientation:
   *   left / right zones  → 'h'  HORIZONTAL collapse
   *                          ◀/▶ arrows; slot shrinks to a 26 px tall
   *                          horizontal bar (flex controls height in
   *                          the zone's flex-direction:column layout)
   *
   *   top / bottom zones  → 'v'  VERTICAL collapse
   *                          ▲/▼ arrows; slot shrinks to a 26 px wide
   *                          vertical strip (flex controls width in
   *                          the zone's flex-direction:row layout)
   */
  _zoneAxis(side) {
    return (side === 'left' || side === 'right') ? 'h' : 'v';
  },

  /**
   * Inject a collapse button into the slot's OWN direct header only.
   * `:scope >` prevents reaching into nested children's headers.
   * Called from EmbedRender.renderZone for each top-level slot.
   */
  injectZoneCollapseBtn(slotEl, slot, side) {
    const hdr = slotEl.querySelector(':scope > .ec-hdr')
             || slotEl.querySelector(':scope > .ec-grp-hdr')
             || slotEl.querySelector(':scope > .ec-zc-hdr');
    if (!hdr) return;

    const axis = CollapseManager._zoneAxis(side);
    const btn  = document.createElement('button');
    btn.className = 'ec-btn ec-b-collapse';
    CollapseManager._refreshZoneIcon(btn, axis, !!slot.collapsed);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      CollapseManager.toggleZoneSlot(slotEl, slot, side);
    });
    hdr.appendChild(btn);
  },

  /** Re-apply saved collapse state to a freshly built slot element.
      Must be called AFTER injectZoneCollapseBtn. */
  applyZoneCollapseState(slotEl, slot, side) {
    if (!slot.collapsed) return;
    const axis = CollapseManager._zoneAxis(side);
    /* CSS (ec-clps-h / ec-clps-v) handles the dimension via align-self + width/height.
       Do NOT touch inline flex here — renderZone already sets el.style.flex = sw.flex,
       and the CSS overrides the perpendicular dimension independently. */
    slotEl.classList.add('ec-slot-collapsed', axis === 'h' ? 'ec-clps-h' : 'ec-clps-v');
    /* Keep Ctrl-hover header visible (CSS !important also handles it) */
    const hdr = slotEl.querySelector(':scope > .ec-grp-hdr')
             || slotEl.querySelector(':scope > .ec-zc-hdr');
    if (hdr) hdr.classList.add('visible');
  },

  toggleZoneSlot(slotEl, slot, side) {
    slot.collapsed
      ? CollapseManager._expandZoneSlot(slotEl, slot, side)
      : CollapseManager._collapseZoneSlot(slotEl, slot, side);
  },

  _collapseZoneSlot(slotEl, slot, side) {
    const axis     = CollapseManager._zoneAxis(side);
    slot.collapsed = true;
    /* CSS handles the dimension collapse via align-self + width/height.
       Do NOT change inline flex — we never alter the main-axis size. */
    slotEl.classList.add('ec-slot-collapsed', axis === 'h' ? 'ec-clps-h' : 'ec-clps-v');

    /* Force Ctrl-hover header visible */
    const hdr = slotEl.querySelector(':scope > .ec-grp-hdr')
             || slotEl.querySelector(':scope > .ec-zc-hdr');
    if (hdr) hdr.classList.add('visible');

    /* Refresh the button icon */
    slotEl.querySelectorAll(
      ':scope > .ec-hdr > .ec-b-collapse, ' +
      ':scope > .ec-grp-hdr > .ec-b-collapse, ' +
      ':scope > .ec-zc-hdr > .ec-b-collapse'
    ).forEach(b => CollapseManager._refreshZoneIcon(b, axis, true));
  },

  _expandZoneSlot(slotEl, slot, side) {
    const axis     = CollapseManager._zoneAxis(side);
    slot.collapsed = false;
    /* We never changed flex, so nothing to restore. CSS classes are the sole
       mechanism — removing them restores the original layout automatically. */
    slotEl.classList.remove('ec-slot-collapsed', 'ec-clps-h', 'ec-clps-v');

    /* Return header to normal Ctrl-hover control */
    const hdr = slotEl.querySelector(':scope > .ec-grp-hdr')
             || slotEl.querySelector(':scope > .ec-zc-hdr');
    if (hdr) hdr.classList.remove('visible');

    slotEl.querySelectorAll(
      ':scope > .ec-hdr > .ec-b-collapse, ' +
      ':scope > .ec-grp-hdr > .ec-b-collapse, ' +
      ':scope > .ec-zc-hdr > .ec-b-collapse'
    ).forEach(b => CollapseManager._refreshZoneIcon(b, axis, false));
  },

  /**
   * Icon direction matches the zone's visual orientation:
   *   axis 'h' (left/right zone) → HORIZONTAL arrows ◀/▶
   *     collapsed item is a thin HORIZONTAL bar → ▶ = "expand it back out"
   *   axis 'v' (top/bottom zone) → VERTICAL arrows ▲/▼
   *     collapsed item is a thin VERTICAL strip → ▼ = "expand it back out"
   */
  _refreshZoneIcon(btn, axis, collapsed) {
    if (axis === 'h') {
      btn.textContent = collapsed ? '▶' : '◀';
    } else {
      btn.textContent = collapsed ? '▼' : '▲';
    }
    btn.title = collapsed ? 'Expand' : 'Collapse';
  },


  /* ═══════════════════════════════════════════════════
     SECTION 3 — FREE-FLOATING SLOTS  (independent H + V)
  ═══════════════════════════════════════════════════ */

  MIN_FLOAT: 30, /* px — smallest collapsed dimension */

  /**
   * Inject ◀/▶ (width) and ▲/▼ (height) collapse buttons into the
   * floating element's direct header bar.
   * Priority: grp/zc header (always-visible for floats) > card hdr.
   * `:scope >` prevents reaching into nested child slot headers.
   */
  injectFloatCollapseBtns(fp, floatEl) {
    const hdr = floatEl.querySelector(':scope > .ec-grp-hdr')
             || floatEl.querySelector(':scope > .ec-zc-hdr')
             || floatEl.querySelector(':scope > .ec-hdr');
    if (!hdr) return;

    const bH = document.createElement('button');
    bH.className = 'ec-btn ec-b-clps-h';
    bH.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      CollapseManager.toggleFloatH(fp, floatEl);
    });

    const bV = document.createElement('button');
    bV.className = 'ec-btn ec-b-clps-v';
    bV.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      CollapseManager.toggleFloatV(fp, floatEl);
    });

    hdr.appendChild(bH);
    hdr.appendChild(bV);
    CollapseManager._refreshFloatIcons(fp, floatEl);
  },

  /** Re-apply collapse dimensions after a re-render cycle. */
  applyFloatCollapseState(fp, floatEl) {
    const MIN = CollapseManager.MIN_FLOAT;
    if (fp.collapsedH) { fp.w = MIN; floatEl.style.width  = MIN + 'px'; }
    if (fp.collapsedV) { fp.h = MIN; floatEl.style.height = MIN + 'px'; }
    floatEl.classList.toggle('ec-float-clps-h', !!fp.collapsedH);
    floatEl.classList.toggle('ec-float-clps-v', !!fp.collapsedV);
  },

  /** Collapse / expand the WIDTH of a floating slot. */
  toggleFloatH(fp, floatEl) {
    const MIN = CollapseManager.MIN_FLOAT;
    if (fp.collapsedH) {
      fp.collapsedH = false;
      fp.w = fp._savedW || 200;
    } else {
      fp._savedW    = fp.w;
      fp.collapsedH = true;
      fp.w = MIN;
    }
    floatEl.style.width = fp.w + 'px';
    floatEl.classList.toggle('ec-float-clps-h', !!fp.collapsedH);
    CollapseManager._refreshFloatIcons(fp, floatEl);
  },

  /** Collapse / expand the HEIGHT of a floating slot. */
  toggleFloatV(fp, floatEl) {
    const MIN = CollapseManager.MIN_FLOAT;
    if (fp.collapsedV) {
      fp.collapsedV = false;
      fp.h = fp._savedH || 120;
    } else {
      fp._savedH    = fp.h;
      fp.collapsedV = true;
      fp.h = MIN;
    }
    floatEl.style.height = fp.h + 'px';
    floatEl.classList.toggle('ec-float-clps-v', !!fp.collapsedV);
    CollapseManager._refreshFloatIcons(fp, floatEl);
  },

  _refreshFloatIcons(fp, el) {
    const bH = el.querySelector('.ec-b-clps-h');
    const bV = el.querySelector('.ec-b-clps-v');
    if (bH) {
      bH.textContent = fp.collapsedH ? '▶' : '◀';
      bH.title       = fp.collapsedH ? 'Expand width'  : 'Collapse width';
    }
    if (bV) {
      bV.textContent = fp.collapsedV ? '▼' : '▲';
      bV.title       = fp.collapsedV ? 'Expand height' : 'Collapse height';
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CollapseManager;
}
