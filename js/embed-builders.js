/* ═══════════════════════════════════════════════════════
   EmbedBuilders — DOM builders for embedded slot elements:
     card, tabgroup, zonecontainer (floating or zone-mounted)
═══════════════════════════════════════════════════════ */

const EmbedBuilders = {

  _buildSlotEl(dock, slot, side, floating) {
    if (slot.type === 'zonecontainer') return EmbedBuilders._buildZoneContainerEl(dock, slot, side, floating);
    return slot.type === 'card'
      ? EmbedBuilders._buildCardEl(dock, slot, side, floating)
      : EmbedBuilders._buildTabGroupEl(dock, slot, side, floating);
  },

  /* ── CARD ─────────────────────────────────────────────────────────── */
  _buildCardEl(dock, card, side, floating) {
    const wrap = document.createElement('div');
    wrap.className = 'ec-embedded-dock' + (floating ? ' ec-floating' : '');
    wrap.dataset.slotId = card.id;

    const hdr = document.createElement('div');
    hdr.className = 'ec-hdr';

    /* ⠿ Free-float drag button */
    const bFree = document.createElement('button');
    bFree.className = 'ec-btn ec-b-free';
    bFree.title = 'Drag = free float  |  Shift+Drag = dock to zone';
    bFree.textContent = '⠿';

    /* ☰ Move button — ejects to real dock and uses standard DragDrop */
    const bMove = document.createElement('button');
    bMove.className = 'ec-btn ec-b-move';
    bMove.title = 'Drag = move to zone  |  Ctrl+Drag = tab into existing slot';
    bMove.textContent = '☰';

    const title = document.createElement('span');
    title.className = 'ec-title'; title.textContent = card.title;

    hdr.append(bFree, bMove, title);

    const body = document.createElement('div');
    body.className = 'ec-body';

    wrap.append(hdr, body);

    bFree.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) EmbedDragDock._startDockDrag(dock, card, e);
      else            EmbedDragFree._startFreeDrag(dock, card, e);
    });

    bMove.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      EmbedDragMove._startMoveDrag(dock._embedSystem, dock, card, e, e.ctrlKey || e.metaKey);
    });

    return wrap;
  },

  /* ── TAB GROUP ────────────────────────────────────────────────────── */
  _buildTabGroupEl(dock, tg, side, floating) {
    const wrap = document.createElement('div');
    wrap.className = 'ec-tab-group' + (floating ? ' ec-floating' : '');
    if (side === 'left')   wrap.classList.add('tbl-left');
    if (side === 'right')  wrap.classList.add('tbl-right');
    if (side === 'bottom') wrap.classList.add('tbl-bot');
    wrap.dataset.slotId = tg.id;

    /* ── Group header — HIDDEN by default, revealed by Ctrl press while inside ── */
    const grpHdr = document.createElement('div');
    grpHdr.className = 'ec-grp-hdr';

    const bFree = document.createElement('button');
    bFree.className = 'ec-btn ec-b-small ec-b-free';
    bFree.title = 'Drag = free float  |  Shift+Drag = dock to zone';
    bFree.textContent = '⠿';

    const bMove = document.createElement('button');
    bMove.className = 'ec-btn ec-b-small ec-b-move';
    bMove.title = 'Drag = move to zone  |  Ctrl+Drag = tab into existing slot';
    bMove.textContent = '☰';

    const bUngroup = document.createElement('button');
    bUngroup.className = 'ec-btn ec-b-small ec-b-ungroup';
    bUngroup.title = 'Ungroup — split all tabs into individual embedded docks';
    bUngroup.textContent = '⊟';

    const grpLabel = document.createElement('span');
    grpLabel.className = 'ec-grp-label';
    grpLabel.textContent = tg.tabs.length + ' tabs';

    grpHdr.append(bFree, bMove, grpLabel, bUngroup);

    /* ── Tab bar ── */
    const tabBar = document.createElement('div');
    tabBar.className = 'ec-tab-bar';

    tg.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'ec-tab-item' + (tab.id === tg.activeId ? ' active' : '');
      tabEl.dataset.tabId = tab.id;

      /* ── Per-tab ⠿ and ☰ buttons — hidden until Ctrl ── */
      const bTabFree = document.createElement('button');
      bTabFree.className = 'ec-btn ec-b-small ec-b-free ec-tab-ctrl';
      bTabFree.title = 'Drag = free float this tab  |  Shift+Drag = dock to zone';
      bTabFree.textContent = '⠿';
      bTabFree.style.display = 'none';

      const bTabMove = document.createElement('button');
      bTabMove.className = 'ec-btn ec-b-small ec-b-move ec-tab-ctrl';
      bTabMove.title = 'Drag = move this tab  |  Ctrl+Drag = tab into existing slot';
      bTabMove.textContent = '☰';
      bTabMove.style.display = 'none';

      const lbl = document.createElement('span');
      lbl.className = 'ec-tab-lbl'; lbl.textContent = tab.title;

      const untab = document.createElement('button');
      untab.className = 'ec-btn ec-b-untab'; untab.title = 'Detach tab'; untab.textContent = '↗';
      untab.addEventListener('click', e => {
        e.stopPropagation();
        EmbedSlots._doUntab(dock, tg, tab.id);
      });

      tabEl.append(bTabFree, bTabMove, lbl, untab);
      tabEl.addEventListener('click', e => {
        /* Ignore clicks that land on one of our control buttons */
        if (e.target.classList.contains('ec-tab-ctrl') || e.target.classList.contains('ec-b-untab')) return;
        tg.activeId = tab.id;
        const s = EmbedSlots._findZone(dock, tg.id);
        if (s && s !== '_float_') EmbedRender.renderZone(dock, s);
        else                      EmbedRender.renderFloats(dock);
      });
      tabBar.appendChild(tabEl);

      /* ─────────────────────────────────────────────────────────────────
         Per-tab drag helper.

         Strategy:
           1. Capture which zone owns this tabgroup BEFORE modifying tg.
           2. Splice the tab out of tg.tabs.
           3. If tg is now empty → remove it entirely via _removeSlot.
              If tg has exactly 1 tab left → replace it with a card in the
              zone/floats data so re-render produces a clean single card.
           4. Re-render the source zone/floats.
           5. Stage the new cardSlot as a float entry so the existing drag
              functions (_startFreeDrag / _startMoveDrag) can find and
              remove it via _removeSlot, then begin their drag loop.
      ───────────────────────────────────────────────────────────────── */
      const _extractAndDrag = (e, dragMode) => {
        /* Step 1 — snapshot zone ownership before we mutate tg */
        const zoneSide = EmbedSlots._findZone(dock, tg.id);

        /* Step 2 — remove this tab from the group */
        const ti = tg.tabs.findIndex(t => t.id === tab.id);
        if (ti < 0) return;
        const removedTab = tg.tabs.splice(ti, 1)[0];
        if (tg.activeId === tab.id) tg.activeId = tg.tabs[0]?.id || null;

        /* Step 3 — reconcile the tabgroup */
        if (tg.tabs.length === 0) {
          /* Group is now empty — remove it from wherever it lives */
          EmbedSlots._removeSlot(dock, tg.id);
        } else if (tg.tabs.length === 1) {
          /* Collapse solo-tab group → plain card (mirrors _doUntab behaviour) */
          const soloCard = { id: EmbedCore.uid(), type: 'card', title: tg.tabs[0].title };
          EmbedBuilders._replaceSlotInState(dock, tg.id, soloCard, zoneSide);
        }
        /* 2+ tabs remaining → tg is still valid; re-render will update the bar */

        /* Step 4 — re-render source */
        if (zoneSide && zoneSide !== '_float_') {
          EmbedRender.renderZone(dock, zoneSide);
          EmbedResize._updateCorners(dock);
        } else {
          EmbedRender.renderFloats(dock);
        }

        /* Step 5 — stage the extracted card as a float so the drag
           functions can locate it via _removeSlot and start dragging */
        const cardSlot = { id: EmbedCore.uid(), type: 'card', title: removedTab.title };
        const ap = EmbedCore._activePanel(dock);
        if (ap?.embedState) {
          ap.embedState.floats.push({ slot: cardSlot, x: 0, y: 0, z: ++EmbedCore._topZ });
        }

        if (dragMode === 'free') {
          if (e.shiftKey) EmbedDragDock._startDockDrag(dock, cardSlot, e);
          else            EmbedDragFree._startFreeDrag(dock, cardSlot, e);
        } else {
          EmbedDragMove._startMoveDrag(dock._embedSystem, dock, cardSlot, e, e.ctrlKey || e.metaKey);
        }
      };

      bTabFree.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        _extractAndDrag(e, 'free');
      });

      bTabMove.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        _extractAndDrag(e, 'move');
      });
    });

    const content = document.createElement('div');
    content.className = 'ec-tab-content';

    wrap.append(grpHdr, tabBar, content);

    /* Floating tab groups: group header is always visible (acts as drag handle
       and houses the collapse buttons injected by CollapseManager).
       Zone-embedded tab groups: revealed only on Ctrl press (Ctrl-hover pattern). */
    if (floating) {
      grpHdr.classList.add('visible');
    } else {
      const _showHdr = () => {
        grpHdr.classList.add('visible');
        wrap.querySelectorAll('.ec-tab-ctrl').forEach(b => { b.style.display = ''; });
      };
      const _hideHdr = () => {
        /* Don't hide while the slot is collapsed — grpHdr is the only visible face */
        if (wrap.classList.contains('ec-slot-collapsed')) return;
        grpHdr.classList.remove('visible');
        wrap.querySelectorAll('.ec-tab-ctrl').forEach(b => { b.style.display = 'none'; });
      };
      const _onKD = ev => { if (ev.key === 'Control' && !ev.repeat) _showHdr(); };
      wrap.addEventListener('mouseenter', () => document.addEventListener('keydown', _onKD));
      wrap.addEventListener('mouseleave', () => {
        _hideHdr();
        document.removeEventListener('keydown', _onKD);
      });
    }

    bFree.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) EmbedDragDock._startDockDrag(dock, tg, e);
      else            EmbedDragFree._startFreeDrag(dock, tg, e);
    });

    bMove.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      EmbedDragMove._startMoveDrag(dock._embedSystem, dock, tg, e, e.ctrlKey || e.metaKey);
    });

    bUngroup.addEventListener('click', e => {
      e.stopPropagation();
      EmbedSlots._doUngroupTabGroup(dock, tg);
    });

    return wrap;
  },

  /* ── Internal helper: replace a slot in the data model by id ────────
     Used when collapsing a 1-tab tabgroup into a plain card without
     going through a full _removeSlot + re-insert cycle.
  ── */
  _replaceSlotInState(dock, oldId, newSlot, zoneSide) {
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;

      if (zoneSide === '_float_') {
        const fi = es.floats.findIndex(fp => fp.slot.id === oldId);
        if (fi !== -1) { es.floats[fi].slot = newSlot; return; }
      } else if (zoneSide) {
        const zone = es.zones[zoneSide];
        if (!zone) continue;
        /* Direct slot in zone */
        const si = zone.slots.findIndex(sw => sw.slot.id === oldId);
        if (si !== -1) { zone.slots[si].slot = newSlot; return; }
        /* One level nested inside a zonecontainer */
        for (const sw of zone.slots) {
          if (sw.slot.type !== 'zonecontainer') continue;
          const ci = sw.slot.slots.findIndex(csw => csw.slot.id === oldId);
          if (ci !== -1) { sw.slot.slots[ci].slot = newSlot; return; }
        }
      }
    }
  },

  /* ── ZONE CONTAINER ───────────────────────────────────────────────── */
  /*
     Data: { id, type:'zonecontainer', slots:[{slot,flex}], label }
     Renders as a flex col (h-zone) or row (v-zone) holding child slot elements.

     Header tools (Ctrl-hover, identical pattern to tabgroup):
       ☰ Move    — plain: eject each child as individual real dock
                   Ctrl:  convert entire container into one tabbed dock
       ⊞ Embed   — drag onto another zonecontainer: merge; drag to zone: place
       ⊟ Dissolve — expand children flat into parent zone
  */
  _buildZoneContainerEl(dock, zc, side, floating) {
    /* Use the ZC's stored originating side for orientation so floating ZCs
       keep the same axis they had when zone-embedded. */
    const axisSide = zc.side || side;
    const isH = (axisSide === 'top' || axisSide === 'bottom' || axisSide === 'float');
    const wrap = document.createElement('div');
    wrap.className = 'ec-zone-container' + (floating ? ' ec-floating' : '');
    wrap.dataset.slotId = zc.id;

    /* ── Ctrl-hover header ── */
    const hdr = document.createElement('div');
    hdr.className = 'ec-zc-hdr';

    const lbl = document.createElement('span');
    lbl.className = 'ec-zc-label';
    lbl.textContent = (zc.label || '') + ' · ' + zc.slots.length + ' items';

    const bMove = document.createElement('button');
    bMove.className = 'ec-btn ec-b-small ec-b-move';
    bMove.title = 'Drag=eject as real docks | Ctrl+Drag=convert to tabbed dock';
    bMove.textContent = '☰';

    const bEmbed = document.createElement('button');
    bEmbed.className = 'ec-btn ec-b-small ec-b-zc-embed';
    bEmbed.title = 'Drag=merge with another container or move to zone';
    bEmbed.textContent = '⊞';

    const bDissolve = document.createElement('button');
    bDissolve.className = 'ec-btn ec-b-small ec-b-ungroup';
    bDissolve.title = 'Dissolve — expand children into parent zone';
    bDissolve.textContent = '⊟';

    hdr.append(bMove, bEmbed, lbl, bDissolve);
    if (floating) {
      /* Floating ZC: header always visible — it's the drag handle */
      hdr.classList.add('visible');
      hdr.classList.add('ec-zc-hdr-drag'); /* marks it as the float drag target */
    }
    wrap.appendChild(hdr);

    /* ── Children ── */
    const body = document.createElement('div');
    body.className = 'ec-zc-body ec-zc-' + (isH ? 'row' : 'col');
    zc.slots.forEach(sw => {
      const childEl = EmbedBuilders._buildSlotEl(dock, sw.slot, side, false);
      childEl.style.flex = String(sw.flex);
      body.appendChild(childEl);
    });
    wrap.appendChild(body);

    /* ── Ctrl-hover (zone-embedded only): show header on Ctrl press; hide on mouseleave ── */
    if (!floating) {
      const _showH = () => hdr.classList.add('visible');
      const _hideH = () => {
        /* Don't hide while collapsed — hdr is the only visible face */
        if (wrap.classList.contains('ec-slot-collapsed')) return;
        hdr.classList.remove('visible');
      };
      const _kd = ev => { if (ev.key === 'Control' && !ev.repeat) _showH(); };
      wrap.addEventListener('mouseenter', () => document.addEventListener('keydown', _kd));
      wrap.addEventListener('mouseleave', () => { _hideH(); document.removeEventListener('keydown', _kd); });
    }

    bMove.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      EmbedDragMove._startZCMoveDrag(dock._embedSystem, dock, zc, e, e.ctrlKey || e.metaKey);
    });

    bEmbed.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      EmbedDragMove._startZCEmbedDrag(dock._embedSystem, dock, zc, e);
    });

    bDissolve.addEventListener('click', e => {
      e.stopPropagation();
      EmbedSlots._dissolveZoneContainer(dock, zc);
    });

    return wrap;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedBuilders;
}