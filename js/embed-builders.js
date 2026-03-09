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

      const lbl = document.createElement('span');
      lbl.className = 'ec-tab-lbl'; lbl.textContent = tab.title;

      const untab = document.createElement('button');
      untab.className = 'ec-btn ec-b-untab'; untab.title = 'Detach tab'; untab.textContent = '↗';
      untab.addEventListener('click', e => {
        e.stopPropagation();
        EmbedSlots._doUntab(dock, tg, tab.id);
      });

      tabEl.append(lbl, untab);
      tabEl.addEventListener('click', () => {
        tg.activeId = tab.id;
        const s = EmbedSlots._findZone(dock, tg.id);
        if (s) EmbedRender.renderZone(dock, s);
        else   EmbedRender.renderFloats(dock);
      });
      tabBar.appendChild(tabEl);
    });

    const content = document.createElement('div');
    content.className = 'ec-tab-content';

    wrap.append(grpHdr, tabBar, content);

    /* ── Ctrl-hover: press Ctrl once while inside → show header; mouseleave → hide ── */
    const _showHdr = () => grpHdr.classList.add('visible');
    const _hideHdr = () => grpHdr.classList.remove('visible');
    const _onKD = ev => { if (ev.key === 'Control' && !ev.repeat) _showHdr(); };
    wrap.addEventListener('mouseenter', () => document.addEventListener('keydown', _onKD));
    wrap.addEventListener('mouseleave', () => {
      _hideHdr();
      document.removeEventListener('keydown', _onKD);
    });

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
      const _hideH = () => hdr.classList.remove('visible');
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