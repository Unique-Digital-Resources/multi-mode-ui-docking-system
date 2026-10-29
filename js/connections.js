/* ═══════════════════════════════════════════════════════════════
   connections.js — Splitter intersection "connection dot" system
   No external dependencies.
═══════════════════════════════════════════════════════════════ */

/**
 * updateConnections() — Redraws all connection dots at splitter intersections.
 *
 * Scans all .lc-splitter elements, finds where horizontal and vertical
 * splitters meet (T-junctions, crossings, collinear touches), and renders
 * a small draggable dot at each junction. Dragging a junction dot moves
 * all adjacent splitters simultaneously.
 */
function updateConnections() {
  document.querySelectorAll('.conn-dot').forEach(d => d.remove());
  const splitters = [...document.querySelectorAll('.lc-splitter')];
  if (splitters.length < 2) return;

  const hList = [], vList = [];
  splitters.forEach(s => {
    const r = s.getBoundingClientRect();
    if (s.classList.contains('vertical')) {
      vList.push({ x: Math.round(r.left + r.width / 2), y1: Math.round(r.top), y2: Math.round(r.bottom), s });
    } else {
      hList.push({ y: Math.round(r.top + r.height / 2), x1: Math.round(r.left), x2: Math.round(r.right), s });
    }
  });

  const conns  = new Map();
  const addConn = (key, ...ss) => {
    if (!conns.has(key)) conns.set(key, new Set());
    ss.forEach(s => conns.get(key).add(s));
  };

  // h–h collinear touching
  const hGrp = new Map();
  hList.forEach(h => { if (!hGrp.has(h.y)) hGrp.set(h.y, []); hGrp.get(h.y).push(h); });
  for (const g of hGrp.values()) {
    g.sort((a, b) => a.x1 - b.x1);
    for (let i = 0; i < g.length - 1; i++) {
      if (Math.abs(g[i].x2 - g[i + 1].x1) <= 6)
        addConn(`${Math.round((g[i].x2 + g[i + 1].x1) / 2)},${g[i].y}`, g[i].s, g[i + 1].s);
    }
  }

  // v–v collinear touching
  const vGrp = new Map();
  vList.forEach(v => { if (!vGrp.has(v.x)) vGrp.set(v.x, []); vGrp.get(v.x).push(v); });
  for (const g of vGrp.values()) {
    g.sort((a, b) => a.y1 - b.y1);
    for (let i = 0; i < g.length - 1; i++) {
      if (Math.abs(g[i].y2 - g[i + 1].y1) <= 6)
        addConn(`${g[i].x},${Math.round((g[i].y2 + g[i + 1].y1) / 2)}`, g[i].s, g[i + 1].s);
    }
  }

  // v × h cross intersections
  vList.forEach(v => hList.forEach(h => {
    if (h.y >= v.y1 && h.y <= v.y2 && v.x >= h.x1 && v.x <= h.x2)
      addConn(`${v.x},${h.y}`, v.s, h.s);
  }));

  // T-junctions: h ends touching v
  hList.forEach(h => vList.forEach(v => {
    for (const ex of [h.x1, h.x2])
      if (Math.abs(ex - v.x) <= 4 && h.y >= v.y1 && h.y <= v.y2)
        addConn(`${v.x},${h.y}`, h.s, v.s);
  }));

  // T-junctions: v ends touching h
  vList.forEach(v => hList.forEach(h => {
    for (const ey of [v.y1, v.y2])
      if (Math.abs(ey - h.y) <= 4 && v.x >= h.x1 && v.x <= h.x2)
        addConn(`${v.x},${h.y}`, v.s, h.s);
  }));

  conns.forEach((splSet, key) => {
    if (splSet.size < 2) return;
    const [cx, cy] = key.split(',').map(Number);
    const dot = document.createElement('div');
    dot.className = 'conn-dot';
    dot.style.left = cx + 'px';
    dot.style.top  = cy + 'px';
    const splArr = [...splSet];
    const hasV = splArr.some(s => s.classList.contains('vertical'));
    const hasH = splArr.some(s => s.classList.contains('horizontal'));
    dot.style.cursor = hasV && hasH ? 'move' : hasV ? 'ew-resize' : 'ns-resize';
    dot.addEventListener('mousedown', e => startConnDrag(e, splArr));
    document.body.appendChild(dot);
  });
}

/**
 * startConnDrag(e, splArr) — Drag a junction dot to resize adjacent splitters.
 */
function startConnDrag(e, splArr) {
  e.preventDefault();
  const startX = e.clientX, startY = e.clientY;
  const verts  = splArr.filter(s => s.classList.contains('vertical'));
  const horizs = splArr.filter(s => s.classList.contains('horizontal'));

  // Snapshot all adjacent sizes at drag start for absolute-delta math.
  const initSizes = new Map();
  [...verts, ...horizs].forEach(s => {
    const p = s.previousElementSibling, n = s.nextElementSibling;
    if (p && n) initSizes.set(s, {
      pW: p.offsetWidth,  nW: n.offsetWidth,
      pH: p.offsetHeight, nH: n.offsetHeight,
    });
  });

  const onMove = ev => {
    const totalDX = ev.clientX - startX;
    const totalDY = ev.clientY - startY;

    if (verts.length) {
      // Clamp totalDX to the tightest constraint across all linked splitters.
      let clampedDX = totalDX;
      verts.forEach(s => {
        const init = initSizes.get(s);
        if (!init) return;
        clampedDX = Math.max(60 - init.pW, Math.min(clampedDX, init.nW - 60));
      });
      verts.forEach(s => {
        const p = s.previousElementSibling, n = s.nextElementSibling;
        const init = initSizes.get(s);
        if (!p || !n || !init) return;
        p.style.flexGrow = init.pW + clampedDX;
        n.style.flexGrow = init.nW - clampedDX;
      });
    }

    if (horizs.length) {
      let clampedDY = totalDY;
      horizs.forEach(s => {
        const init = initSizes.get(s);
        if (!init) return;
        clampedDY = Math.max(60 - init.pH, Math.min(clampedDY, init.nH - 60));
      });
      horizs.forEach(s => {
        const p = s.previousElementSibling, n = s.nextElementSibling;
        const init = initSizes.get(s);
        if (!p || !n || !init) return;
        p.style.flexGrow = init.pH + clampedDY;
        n.style.flexGrow = init.nH - clampedDY;
      });
    }

    updateConnections();
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    updateConnections();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
