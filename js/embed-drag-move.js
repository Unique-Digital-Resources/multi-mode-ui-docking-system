/* ═══════════════════════════════════════════════════════
   EmbedDragMove — ☰ Move button: eject embedded slots as real docks.

   _startMoveDrag    — eject a card or tabgroup into DragDrop's move/tabify flow.
   _startZCMoveDrag  — eject a zonecontainer (plain = each child as own dock,
                        Ctrl = all children as one tabbed dock).
   _startZCEmbedDrag — ⊞ button on zonecontainer: merge with sibling or reposition.
   _ejectOneDock     — shared helper: park a new real dock in system.container,
                        hand it to DragDrop as the dragged dock.
   _ejectZCChildren  — eject all children of a zonecontainer as sibling docks.
═══════════════════════════════════════════════════════ */

const EmbedDragMove = {

  /* ── ☰ on card or tabgroup ── */
  _startMoveDrag(system, srcDock, slot, e, capturedCtrl) {
    if (!system) return;

    const rem = EmbedSlots._removeSlot(srcDock, slot.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedRender.renderZone(srcDock, rem.from);
    else                      EmbedRender.renderFloats(srcDock);
    EmbedResize._updateCorners(srcDock);

    let panels;
    if (slot.type === 'tabgroup') {
      panels = slot.tabs.map(t => ({
        id:          EmbedCore.uid(),
        title:       t.title,
        contentHTML: `<div class="dock-card">${DockingUtils.esc(t.title)}</div>`
      }));
    } else if (slot.type === 'zonecontainer') {
      /* ZC without Ctrl → eject children individually, preserving zone axis */
      const wasH = rem.from === 'top' || rem.from === 'bottom';
      EmbedDragMove._ejectZCChildren(system, srcDock, slot, e, wasH);
      return;
    } else {
      panels = [{
        id:          EmbedCore.uid(),
        title:       slot.title,
        contentHTML: `<div class="dock-card">${DockingUtils.esc(slot.title)}</div>`
      }];
    }

    EmbedDragMove._ejectOneDock(system, srcDock, panels, e, capturedCtrl, null);
  },

  /* ── ☰ on zonecontainer ── */
  _startZCMoveDrag(system, srcDock, zc, e, capturedCtrl) {
    if (!system) return;
    const rem = EmbedSlots._removeSlot(srcDock, zc.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedRender.renderZone(srcDock, rem.from);
    else EmbedRender.renderFloats(srcDock);
    EmbedResize._updateCorners(srcDock);

    const wasH = rem.from === 'top' || rem.from === 'bottom';

    if (capturedCtrl) {
      /* Ctrl: collapse entire container into one tabbed dock */
      const panels = [];
      zc.slots.forEach(sw => {
        const s = sw.slot;
        if (s.type === 'tabgroup') {
          s.tabs.forEach(t => panels.push({
            id: EmbedCore.uid(), title: t.title,
            contentHTML: `<div class="dock-card">${DockingUtils.esc(t.title)}</div>`
          }));
        } else if (s.type === 'card') {
          panels.push({
            id: EmbedCore.uid(), title: s.title,
            contentHTML: `<div class="dock-card">${DockingUtils.esc(s.title)}</div>`
          });
        } else if (s.type === 'zonecontainer') {
          s.slots.forEach(csw => {
            const cs = csw.slot;
            if (cs.type === 'tabgroup')
              cs.tabs.forEach(t => panels.push({
                id: EmbedCore.uid(), title: t.title,
                contentHTML: `<div class="dock-card">${DockingUtils.esc(t.title)}</div>`
              }));
            else
              panels.push({
                id: EmbedCore.uid(), title: cs.title || 'Panel',
                contentHTML: `<div class="dock-card">${DockingUtils.esc(cs.title || 'Panel')}</div>`
              });
          });
        }
      });
      if (!panels.length)
        panels.push({ id: EmbedCore.uid(), title: zc.label || 'Group', contentHTML: '<div class="dock-card">Group</div>' });
      EmbedDragMove._ejectOneDock(system, srcDock, panels, e, true, null);
    } else {
      EmbedDragMove._ejectZCChildren(system, srcDock, zc, e, wasH);
    }
  },

  /* ── Shared: park a new real dock in system.container, hand to DragDrop ── */
  _ejectOneDock(system, srcDock, panels, e, capturedCtrl, firstDockRef) {
    const newDock = document.createElement('div');
    newDock.className = 'dock ec-ejected-drag'; /* sentinel: excluded from layout ops */
    newDock.dataset.tabsPos = 'top';
    newDock.panelData = panels;
    newDock.activePanelIndex = 0;
    /* Park absolutely off-screen so it doesn't affect flex layout */
    newDock.style.cssText = 'flex:1;position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
    system.container.appendChild(newDock);
    newDock.innerHTML = DOMBuilder.buildDockHTML(newDock);
    system.docks.push(newDock);
    system.setupDockEvents(newDock);

    system.dragMode        = capturedCtrl ? 'tabify' : 'move';
    system.draggedDock     = newDock;
    system.extractPanelIdx = null;
    system.dragWithCtrl    = capturedCtrl;
    system.dragWithShift   = false;
    newDock.classList.add('dragging');

    /* Strip parking styles just before DragDrop.onMouseUp places the dock */
    const _unstash = () => {
      newDock.classList.remove('ec-ejected-drag');
      newDock.style.cssText = 'flex:1;';
      if (firstDockRef) firstDockRef.dock = newDock;
      document.removeEventListener('mouseup', _unstash, true);
    };
    document.addEventListener('mouseup', _unstash, true);
    DragDrop.onMouseMove(system, e);
  },

  /* ── Eject all ZC children as individual docks.
     First child goes through DragDrop normally; siblings are inserted beside it after drop. ── */
  _ejectZCChildren(system, srcDock, zc, e, wasH) {
    if (!zc.slots.length) return;

    const makePanel = s => {
      if (s.type === 'tabgroup')
        return s.tabs.map(t => ({ id: EmbedCore.uid(), title: t.title, contentHTML: `<div class="dock-card">${DockingUtils.esc(t.title)}</div>` }));
      if (s.type === 'card')
        return [{ id: EmbedCore.uid(), title: s.title, contentHTML: `<div class="dock-card">${DockingUtils.esc(s.title)}</div>` }];
      if (s.type === 'zonecontainer')
        return s.slots.flatMap(csw => makePanel(csw.slot));
      return [{ id: EmbedCore.uid(), title: 'Panel', contentHTML: '<div class="dock-card">Panel</div>' }];
    };

    const allPanelGroups = zc.slots.map(sw => makePanel(sw.slot));

    /* Park sibling docks (all but the first) invisibly */
    const siblingDocks = [];
    for (let i = 1; i < allPanelGroups.length; i++) {
      const sd = document.createElement('div');
      sd.className = 'dock ec-ejected-drag';
      sd.dataset.tabsPos = 'top';
      sd.panelData = allPanelGroups[i];
      sd.activePanelIndex = 0;
      sd.style.cssText = 'flex:1;position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
      system.container.appendChild(sd);
      sd.innerHTML = DOMBuilder.buildDockHTML(sd);
      system.docks.push(sd);
      system.setupDockEvents(sd);
      siblingDocks.push(sd);
    }

    const firstDockRef = { dock: null };

    /* Eject first child — registers _unstash (capture) internally */
    EmbedDragMove._ejectOneDock(system, srcDock, allPanelGroups[0], e, false, firstDockRef);

    /* _afterDrop runs in bubble phase — after DragDrop.onMouseUp has placed/merged firstDock */
    const _afterDrop = () => {
      document.removeEventListener('mouseup', _afterDrop);
      if (!siblingDocks.length) return;

      const firstDock = firstDockRef.dock;
      if (!firstDock) {
        siblingDocks.forEach(sd => { sd.remove(); system.docks = system.docks.filter(d => d !== sd); });
        return;
      }

      /* Detect tabification: mergeDockAsTab removes firstDock from the DOM.
         Find absorber by matching panelData panel references (pushed by reference in mergeDockAsTab). */
      if (!firstDock.isConnected) {
        const firstPanel = firstDock.panelData?.[0];
        const absorber   = firstPanel && system.docks.find(d => d.panelData?.includes(firstPanel));
        if (absorber) {
          const tabPos = absorber.dataset.tabsPos || 'top';
          siblingDocks.forEach(sd => {
            sd.classList.remove('ec-ejected-drag');
            sd.style.cssText = 'flex:1;';
            DockManager.mergeDockAsTab(system, sd, absorber, tabPos);
          });
        } else {
          siblingDocks.forEach(sd => { sd.remove(); system.docks = system.docks.filter(d => d !== sd); });
        }
        system.updateResizeHandles();
        system.updateConnectionPoints();
        return;
      }

      /* Plain move: insert siblings immediately after firstDock (and each other), in order.
         wasH = top/bottom zone → dock-row (side-by-side)
         !wasH = left/right zone → dock-column (stacked) */
      let lastInserted = firstDock;
      siblingDocks.forEach(sd => {
        sd.classList.remove('ec-ejected-drag');
        sd.style.cssText = 'flex:1;';
        const parent = firstDock.parentElement;
        if (!parent) return;
        if (wasH) {
          if (!parent.classList.contains('dock-row')) {
            const row = document.createElement('div');
            row.className = 'dock-row';
            row.style.flex = firstDock.style.flex || '1';
            parent.insertBefore(row, firstDock);
            firstDock.style.flex = '1';
            firstDock.remove();
            row.appendChild(firstDock);
            lastInserted = firstDock;
          }
          lastInserted.parentElement.insertBefore(sd, lastInserted.nextSibling);
        } else {
          if (!parent.classList.contains('dock-column')) {
            const col = document.createElement('div');
            col.className = 'dock-column';
            col.style.flex = firstDock.style.flex || '1';
            parent.insertBefore(col, firstDock);
            firstDock.style.flex = '1';
            firstDock.remove();
            col.appendChild(firstDock);
            lastInserted = firstDock;
          }
          lastInserted.parentElement.insertBefore(sd, lastInserted.nextSibling);
        }
        lastInserted = sd;
      });
      system.updateResizeHandles();
      system.updateConnectionPoints();
    };
    document.addEventListener('mouseup', _afterDrop); /* bubble — fires after DragDrop.onMouseUp */
  },

  /* ── ⊞ on zonecontainer: merge with sibling container or reposition in zone ── */
  _startZCEmbedDrag(system, srcDock, zc, e) {
    const rem = EmbedSlots._removeSlot(srcDock, zc.id);
    if (!rem) return;
    if (rem.from !== 'float') EmbedRender.renderZone(srcDock, rem.from);
    else EmbedRender.renderFloats(srcDock);
    EmbedResize._updateCorners(srcDock);

    EmbedGhost._showGhost('⊞ Container · ' + zc.slots.length + ' items');

    /* Wire into standard _DD so EmbedOverlay._updateOverlay handles highlight */
    EmbedDragDock._DD = { slot: zc, srcDock, side: null, pos: null, tDock: null };

    const _clearOverlays = (exceptDock) => {
      document.querySelectorAll('.ez-drop-overlay.show').forEach(o => {
        const ownerPanel = EmbedCore._activePanel(exceptDock);
        if (!exceptDock || o !== ownerPanel?.embedState?.overlay) {
          o.classList.remove('show'); o.innerHTML = '';
        }
      });
    };

    const mv = ev => {
      EmbedGhost._moveGhost(ev);
      const hb = EmbedGhost._dockAt(ev.clientX, ev.clientY);
      _clearOverlays(hb || null);
      if (hb) {
        EmbedCore.initDock(null, hb);
        EmbedOverlay._showOverlay(hb);
        EmbedOverlay._updateOverlay(hb, ev.clientX, ev.clientY);
      } else {
        if (EmbedDragDock._DD) { EmbedDragDock._DD.side = null; EmbedDragDock._DD.tDock = null; }
      }
    };

    const up = ev => {
      _clearOverlays(null);
      EmbedGhost._hideGhost();
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);

      if (!EmbedDragDock._DD) return;
      const { tDock, side, pos } = EmbedDragDock._DD;
      EmbedDragDock._DD = null;

      if (!tDock || !side) {
        /* No valid drop — restore as float on source dock */
        EmbedCore.initDock(null, srcDock);
        const cr = EmbedCore._panelRect(srcDock);
        const ap = EmbedCore._activePanel(srcDock);
        if (ap) {
          ap.embedState.floats.push({ slot: zc, x: ev.clientX - cr.left - 50, y: ev.clientY - cr.top - 14, z: ++EmbedCore._topZ });
          EmbedRender.renderFloats(srcDock);
        }
        return;
      }

      EmbedCore.initDock(null, tDock);
      EmbedSlots._dockTo(tDock, zc, side, pos || 'last');
      EmbedRender.renderZone(tDock, side);
      EmbedResize._updateCorners(tDock);
    };

    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedDragMove;
}