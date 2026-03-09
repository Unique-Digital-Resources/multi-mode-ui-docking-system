/* ═══════════════════════════════════════════════════════
   EmbedSlots — slot data operations (no DOM building or drag).
   All functions mutate embedState and trigger re-renders via EmbedRender.
═══════════════════════════════════════════════════════ */

const EmbedSlots = {

  /* ── Public: add a new floating card to the active panel ── */
  addFloat(dock, title) {
    EmbedCore.initDock(null, dock);
    const panel = EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    const card = {
      id:    EmbedCore.uid(),
      type:  'card',
      title: title || ('Panel ' + EmbedCore.uid())
    };
    const cr = EmbedCore._panelRect(dock);
    panel.embedState.floats.push({
      slot: card,
      x: 30 + Math.random() * Math.max(10, cr.width  - 220),
      y: 30 + Math.random() * Math.max(10, cr.height - 160),
      z: ++EmbedCore._topZ,
    });
    EmbedRender.renderFloats(dock);
  },

  /* ── Find which zone (or '_float_') owns a slot, searching all panels + ZC children ── */
  _findZone(dock, slotId) {
    /* Recursive helper: does this ZC (or any nested ZC) contain slotId? */
    const inZC = (zc) => {
      for (const csw of zc.slots) {
        if (csw.slot.id === slotId) return true;
        if (csw.slot.type === 'zonecontainer' && inZC(csw.slot)) return true;
      }
      return false;
    };
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      /* Direct float match */
      if (es.floats.some(fp => fp.slot.id === slotId)) return '_float_';
      /* Child of a floating ZC */
      if (es.floats.some(fp => fp.slot.type === 'zonecontainer' && inZC(fp.slot))) return '_float_';
      for (const s of ['top','bottom','left','right']) {
        const zone = es.zones[s];
        if (zone.slots.some(sw => sw.slot.id === slotId)) return s;
        if (zone.slots.some(sw => sw.slot.type === 'zonecontainer' && inZC(sw.slot))) return s;
      }
    }
    return null;
  },

  /* ── Remove a slot from any panel/zone/float (including ZC children); returns { slot, from } ── */
  _removeSlot(dock, slotId) {
    /* Recursive helper: remove slotId from inside a ZC tree; returns removed slot or null */
    const removeFromZC = (zc) => {
      const si = zc.slots.findIndex(sw => sw.slot.id === slotId);
      if (si !== -1) {
        const [sw] = zc.slots.splice(si, 1);
        zc.slots.forEach(s => s.flex = 1);
        return sw.slot;
      }
      for (const csw of zc.slots) {
        if (csw.slot.type === 'zonecontainer') {
          const found = removeFromZC(csw.slot);
          if (found) return found;
        }
      }
      return null;
    };

    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;

      /* Direct float match */
      const fi = es.floats.findIndex(fp => fp.slot.id === slotId);
      if (fi !== -1) {
        const fp = es.floats.splice(fi, 1)[0];
        return { slot: fp.slot, from: 'float' };
      }
      /* Child of a floating ZC */
      for (const fp of es.floats) {
        if (fp.slot.type !== 'zonecontainer') continue;
        const found = removeFromZC(fp.slot);
        if (found) return { slot: found, from: 'float' };
      }

      /* Zone top-level and inside zone-attached ZC */
      for (const side of ['top','bottom','left','right']) {
        const zone = es.zones[side];
        const si = zone.slots.findIndex(sw => sw.slot.id === slotId);
        if (si !== -1) {
          const [sw] = zone.slots.splice(si, 1);
          zone.slots.forEach(s => s.flex = 1);
          return { slot: sw.slot, from: side };
        }
        for (const sw of zone.slots) {
          if (sw.slot.type !== 'zonecontainer') continue;
          const found = removeFromZC(sw.slot);
          if (found) return { slot: found, from: side };
        }
      }
    }
    return null;
  },

  /* ── Place a slot into a zone at the given position ──
     pos: 'first' | 'last' | { tabWith: slotId } | { mergeContainer: zcId }
  ── */
  _dockTo(dock, slot, side, pos) {
    const panel = EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    const es   = panel.embedState;
    const zone = es.zones[side];

    /* Always stamp the destination side onto a ZC so _buildZoneContainerEl
       uses the correct axis when it renders, regardless of which path below fires. */
    if (slot.type === 'zonecontainer') slot.side = side;

    /* Merge-into-container shortcut */
    if (pos && pos.mergeContainer !== undefined) {
      const targetSW = zone.slots.find(sw => sw.slot.id === pos.mergeContainer);
      if (targetSW && targetSW.slot.type === 'zonecontainer') {
        if (slot.type === 'zonecontainer') {
          slot.slots.forEach(csw => targetSW.slot.slots.push({ slot: csw.slot, flex: 1 }));
        } else {
          targetSW.slot.slots.push({ slot, flex: 1 });
        }
        targetSW.slot.slots.forEach(s => s.flex = 1);
        return;
      }
      zone.slots.push({ slot, flex: 1 });
      zone.slots.forEach(s => s.flex = 1);
      return;
    }

    /* tabWith: merge into existing card/tabgroup */
    if (pos && pos.tabWith !== undefined) {
      const targetSW = zone.slots.find(sw => sw.slot.id === pos.tabWith);
      if (!targetSW) { zone.slots.push({ slot, flex: 1 }); zone.slots.forEach(s => s.flex = 1); return; }
      const tgt = targetSW.slot;

      if (tgt.type === 'zonecontainer') {
        tgt.slots.push({ slot, flex: 1 });
        tgt.slots.forEach(s => s.flex = 1);
        zone.slots.forEach(s => s.flex = 1);
        return;
      }

      if (tgt.type === 'card') {
        const tg = { id: EmbedCore.uid(), type: 'tabgroup', tabs: [], activeId: null };
        tg.tabs.push({ id: EmbedCore.uid(), title: tgt.title });
        if (slot.type === 'card') {
          const nt = { id: EmbedCore.uid(), title: slot.title };
          tg.tabs.push(nt); tg.activeId = nt.id;
        } else if (slot.type === 'tabgroup') {
          slot.tabs.forEach(t => tg.tabs.push({ id: EmbedCore.uid(), title: t.title }));
          tg.activeId = tg.tabs[tg.tabs.length - 1].id;
        } else if (slot.type === 'zonecontainer') {
          slot.slots.forEach(csw => {
            const s = csw.slot;
            if (s.type === 'tabgroup') s.tabs.forEach(t => tg.tabs.push({ id: EmbedCore.uid(), title: t.title }));
            else tg.tabs.push({ id: EmbedCore.uid(), title: s.title || 'Panel' });
          });
          tg.activeId = tg.tabs[tg.tabs.length - 1]?.id || tg.tabs[0]?.id;
        }
        if (!tg.activeId) tg.activeId = tg.tabs[0]?.id;
        targetSW.slot = tg;
      } else if (tgt.type === 'tabgroup') {
        if (slot.type === 'card') {
          const nt = { id: EmbedCore.uid(), title: slot.title };
          tgt.tabs.push(nt); tgt.activeId = nt.id;
        } else if (slot.type === 'tabgroup') {
          slot.tabs.forEach(t => tgt.tabs.push({ id: EmbedCore.uid(), title: t.title }));
          tgt.activeId = tgt.tabs[tgt.tabs.length - 1].id;
        } else if (slot.type === 'zonecontainer') {
          slot.slots.forEach(csw => {
            const s = csw.slot;
            if (s.type === 'tabgroup') s.tabs.forEach(t => tgt.tabs.push({ id: EmbedCore.uid(), title: t.title }));
            else tgt.tabs.push({ id: EmbedCore.uid(), title: s.title || 'Panel' });
          });
          tgt.activeId = tgt.tabs[tgt.tabs.length - 1]?.id;
        }
      }
      zone.slots.forEach(s => s.flex = 1);
      return;
    }

    /* first / last: plain insert with auto-zonecontainer wrapping */
    const rootSlots = zone.slots;

    /* Case A: zone empty — just add */
    if (rootSlots.length === 0) {
      rootSlots.push({ slot, flex: 1 });
      return;
    }

    /* Case B: zone has exactly one zonecontainer at root — add into it */
    if (rootSlots.length === 1 && rootSlots[0].slot.type === 'zonecontainer') {
      const zc = rootSlots[0].slot;
      zc.side = side; /* keep side fresh */
      if (pos === 'first') zc.slots.unshift({ slot, flex: 1 });
      else                 zc.slots.push({ slot, flex: 1 });
      zc.slots.forEach(s => s.flex = 1);
      return;
    }

    /* Case C: zone has other content — wrap all into a new zonecontainer */
    const zc = {
      id:    EmbedCore.uid(),
      type:  'zonecontainer',
      label: 'Group',
      side,                                               /* remember originating zone */
      slots: rootSlots.map(sw => ({ slot: sw.slot, flex: 1 }))
    };
    if (pos === 'first') zc.slots.unshift({ slot, flex: 1 });
    else                 zc.slots.push({ slot, flex: 1 });
    zc.slots.forEach(s => s.flex = 1);
    zone.slots = [{ slot: zc, flex: 1 }];
  },

  /* ── Detach one tab from a tabgroup → becomes its own card in the zone ── */
  _doUntab(dock, tg, tabId) {
    const side = EmbedSlots._findZone(dock, tg.id);
    if (!side || side === '_float_') return;
    let ownerPanel = null, zone = null;
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      if (es.zones[side].slots.some(sw => sw.slot.id === tg.id)) {
        ownerPanel = panel; zone = es.zones[side]; break;
      }
    }
    if (!zone) return;
    const ti = tg.tabs.findIndex(t => t.id === tabId);
    if (ti < 0) return;

    const [removedTab] = tg.tabs.splice(ti, 1);
    if (tg.activeId === tabId) tg.activeId = tg.tabs[0]?.id || null;

    const tgIdx = zone.slots.findIndex(sw => sw.slot.id === tg.id);

    if (tg.tabs.length === 1) {
      zone.slots[tgIdx] = {
        slot: { id: EmbedCore.uid(), type: 'card', title: tg.tabs[0].title },
        flex: zone.slots[tgIdx].flex
      };
    } else if (tg.tabs.length === 0) {
      zone.slots.splice(tgIdx, 1);
    }

    const insertAt = tgIdx >= 0 ? tgIdx : zone.slots.length;
    const newCard  = { id: EmbedCore.uid(), type: 'card', title: removedTab.title };
    zone.slots.splice(insertAt, 0, { slot: newCard, flex: 1 });
    zone.slots.forEach(s => s.flex = 1);
    EmbedRender.renderZone(dock, side, ownerPanel);
  },

  /* ── Split a tabgroup into individual cards in the same zone position ── */
  _doUngroupTabGroup(dock, tg) {
    const side = EmbedSlots._findZone(dock, tg.id);
    if (!side) return;

    let ownerPanel = null, zone = null, slotIdx = -1;
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      if (side === '_float_') {
        const fi = es.floats.findIndex(fp => fp.slot.id === tg.id);
        if (fi !== -1) {
          const fp = es.floats[fi];
          es.floats.splice(fi, 1);
          tg.tabs.forEach((tab, ti) => {
            const newCard = { id: EmbedCore.uid(), type: 'card', title: tab.title };
            es.floats.push({
              slot: newCard,
              x: fp.x + ti * 20,
              y: fp.y + ti * 20,
              z: ++EmbedCore._topZ
            });
          });
          EmbedRender.renderFloats(dock, panel);
          return;
        }
      } else {
        const si = es.zones[side]?.slots.findIndex(sw => sw.slot.id === tg.id);
        if (si !== undefined && si !== -1) {
          ownerPanel = panel; zone = es.zones[side]; slotIdx = si; break;
        }
      }
    }
    if (!zone || slotIdx < 0) return;

    const newSlots = tg.tabs.map(tab => ({
      slot: { id: EmbedCore.uid(), type: 'card', title: tab.title },
      flex: 1
    }));
    zone.slots.splice(slotIdx, 1, ...newSlots);
    zone.slots.forEach(s => s.flex = 1);
    EmbedRender.renderZone(dock, side, ownerPanel);
    EmbedResize._updateCorners(dock, ownerPanel);
  },

  /* ── Dissolve a zonecontainer: expand children flat into parent zone ── */
  _dissolveZoneContainer(dock, zc) {
    let ownerPanel = null, zone = null, zcIdx = -1, zoneSide = null;
    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      for (const s of ['top','bottom','left','right']) {
        const z  = es.zones[s];
        const si = z.slots.findIndex(sw => sw.slot.id === zc.id);
        if (si !== -1) { ownerPanel = panel; zone = z; zcIdx = si; zoneSide = s; break; }
      }
      if (zone) break;
      const fi = es.floats.findIndex(fp => fp.slot.id === zc.id);
      if (fi !== -1) {
        es.floats.splice(fi, 1);
        zc.slots.forEach((csw, i) => es.floats.push({
          slot: csw.slot, x: 30 + i * 20, y: 30 + i * 20, z: ++EmbedCore._topZ
        }));
        EmbedRender.renderFloats(dock, panel);
        return;
      }
    }
    if (!zone || zcIdx < 0) return;
    const newSlots = zc.slots.map(csw => ({ slot: csw.slot, flex: 1 }));
    zone.slots.splice(zcIdx, 1, ...newSlots);
    zone.slots.forEach(s => s.flex = 1);
    EmbedRender.renderZone(dock, zoneSide, ownerPanel);
    EmbedResize._updateCorners(dock, ownerPanel);
  },

  /* ── Auto-collapse ZCs with exactly one child (data-model only, no render) ── */
  _collapseSingletonZCs(dock) {
    /* Recursively collapse single-child ZCs inside a slots array in place.
       Returns true if anything changed. */
    const collapseArray = (slots) => {
      let changed = false;
      /* First recurse into nested ZCs */
      for (const sw of slots)
        if (sw.slot.type === 'zonecontainer' && collapseArray(sw.slot.slots)) changed = true;
      /* Then replace any ZC that now has exactly 1 child */
      for (let i = 0; i < slots.length; i++) {
        const sw = slots[i];
        if (sw.slot.type === 'zonecontainer' && sw.slot.slots.length === 1) {
          slots.splice(i, 1, { slot: sw.slot.slots[0].slot, flex: 1 });
          changed = true; i--;
        }
      }
      return changed;
    };

    for (const panel of dock.panelData) {
      const es = panel.embedState;
      if (!es) continue;
      for (const s of ['top','bottom','left','right'])
        collapseArray(es.zones[s].slots);
      /* Floats: replace a singleton-ZC float entry with its single child */
      for (let i = 0; i < es.floats.length; i++) {
        const fp = es.floats[i];
        if (fp.slot.type !== 'zonecontainer') continue;
        collapseArray(fp.slot.slots);
        if (fp.slot.slots.length === 1) {
          es.floats.splice(i, 1, {
            slot: fp.slot.slots[0].slot,
            x: fp.x, y: fp.y, z: fp.z, w: fp.w, h: fp.h
          });
          i--;
        }
      }
    }
  },

  /* ── Public: create a zonecontainer and add it to a zone ── */
  addZoneContainer(dock, side, label, slots) {
    EmbedCore.initDock(null, dock);
    const panel = EmbedCore._activePanel(dock);
    if (!panel?.embedState) return;
    const zc = {
      id:    EmbedCore.uid(),
      type:  'zonecontainer',
      label: label || 'Group',
      side,
      slots: slots || []
    };
    const zone = panel.embedState.zones[side];
    zone.slots.push({ slot: zc, flex: 1 });
    zone.slots.forEach(s => s.flex = 1);
    EmbedRender.renderZone(dock, side);
    EmbedResize._updateCorners(dock);
    return zc;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedSlots;
}