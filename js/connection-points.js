const ConnectionPoints = {
    updateConnectionPoints(system) {
        document.querySelectorAll('.connection-point').forEach(cp => cp.remove());
        const handles = document.querySelectorAll('.resize-handle');
        const vList = [], hList = [];

        handles.forEach(h => {
            const r = h.getBoundingClientRect();
            if (h.classList.contains('vertical')) {
                vList.push({
                    handle: h,
                    x: Math.round(r.left + r.width / 2),
                    y1: Math.round(r.top),
                    y2: Math.round(r.bottom)
                });
            } else {
                hList.push({
                    handle: h,
                    y: Math.round(r.top + r.height / 2),
                    x1: Math.round(r.left),
                    x2: Math.round(r.right)
                });
            }
        });

        const conns = new Map();
        const addC = (key, h1, h2) => {
            if (!conns.has(key)) conns.set(key, new Set());
            conns.get(key).add(h1);
            conns.get(key).add(h2);
        };

        const hGrp = new Map();
        hList.forEach(h => {
            if (!hGrp.has(h.y)) hGrp.set(h.y, []);
            hGrp.get(h.y).push(h);
        });
        for (const g of hGrp.values()) {
            g.sort((a, b) => a.x1 - b.x1);
            for (let i = 0; i < g.length - 1; i++) {
                if (Math.abs(g[i].x2 - g[i + 1].x1) <= 5) {
                    addC(`${Math.round((g[i].x2 + g[i + 1].x1) / 2)},${g[i].y}`, g[i].handle, g[i + 1].handle);
                }
            }
        }

        const vGrp = new Map();
        vList.forEach(v => {
            if (!vGrp.has(v.x)) vGrp.set(v.x, []);
            vGrp.get(v.x).push(v);
        });
        for (const g of vGrp.values()) {
            g.sort((a, b) => a.y1 - b.y1);
            for (let i = 0; i < g.length - 1; i++) {
                if (Math.abs(g[i].y2 - g[i + 1].y1) <= 5) {
                    addC(`${g[i].x},${Math.round((g[i].y2 + g[i + 1].y1) / 2)}`, g[i].handle, g[i + 1].handle);
                }
            }
        }

        vList.forEach(v => hList.forEach(h => {
            if (h.y >= v.y1 && h.y <= v.y2 && v.x >= h.x1 && v.x <= h.x2) {
                addC(`${v.x},${h.y}`, v.handle, h.handle);
            }
        }));
        hList.forEach(h => vList.forEach(v => {
            if (Math.abs(h.x1 - v.x) <= 3 && h.y >= v.y1 && h.y <= v.y2) {
                addC(`${v.x},${h.y}`, h.handle, v.handle);
            }
            if (Math.abs(h.x2 - v.x) <= 3 && h.y >= v.y1 && h.y <= v.y2) {
                addC(`${v.x},${h.y}`, h.handle, v.handle);
            }
        }));
        vList.forEach(v => hList.forEach(h => {
            if (Math.abs(v.y1 - h.y) <= 3 && v.x >= h.x1 && v.x <= h.x2) {
                addC(`${v.x},${h.y}`, v.handle, h.handle);
            }
            if (Math.abs(v.y2 - h.y) <= 3 && v.x >= h.x1 && v.x <= h.x2) {
                addC(`${v.x},${h.y}`, v.handle, h.handle);
            }
        }));

        conns.forEach((set, key) => {
            if (set.size < 2) return;
            const [x, y] = key.split(',').map(Number);
            const cp = document.createElement('div');
            cp.classList.add('connection-point');
            cp.style.left = `${x - 5}px`;
            cp.style.top = `${y - 5}px`;
            const arr = Array.from(set);
            const hasV = arr.some(h => h.classList.contains('vertical'));
            const hasH = arr.some(h => h.classList.contains('horizontal'));
            cp.style.cursor = hasV && hasH ? 'move' : hasV ? 'ew-resize' : 'ns-resize';
            document.body.appendChild(cp);
            cp.addEventListener('mousedown', (e) => ConnectionPoints.startConnectionDrag(system, e, arr));
        });
    },

    startConnectionDrag(system, e, handleList) {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        let appliedX = 0, appliedY = 0;
        const verts = handleList.filter(h => h.classList.contains('vertical'));
        const horizs = handleList.filter(h => h.classList.contains('horizontal'));

        const onMove = (e) => {
            const dx = e.clientX - startX - appliedX;
            const dy = e.clientY - startY - appliedY;

            if (verts.length) {
                let minD = -Infinity, maxD = Infinity;
                verts.forEach(h => {
                    const prev = h.parentElement;
                    const next = prev.nextElementSibling;
                    if (!next) return;
                    minD = Math.max(minD, ResizeManager.getMinSize(prev, 'width') - prev.offsetWidth);
                    maxD = Math.min(maxD, next.offsetWidth - ResizeManager.getMinSize(next, 'width'));
                });
                const c = Math.max(minD, Math.min(dx, maxD));
                verts.forEach(h => {
                    const prev = h.parentElement;
                    const next = prev.nextElementSibling;
                    if (!next) return;
                    prev.style.flex = prev.offsetWidth + c;
                    next.style.flex = next.offsetWidth - c;
                });
                appliedX += c;
            }
            if (horizs.length) {
                let minD = -Infinity, maxD = Infinity;
                horizs.forEach(h => {
                    const prev = h.parentElement;
                    const next = prev.nextElementSibling;
                    if (!next) return;
                    minD = Math.max(minD, ResizeManager.getMinSize(prev, 'height') - prev.offsetHeight);
                    maxD = Math.min(maxD, next.offsetHeight - ResizeManager.getMinSize(next, 'height'));
                });
                const c = Math.max(minD, Math.min(dy, maxD));
                horizs.forEach(h => {
                    const prev = h.parentElement;
                    const next = prev.nextElementSibling;
                    if (!next) return;
                    prev.style.flex = prev.offsetHeight + c;
                    next.style.flex = next.offsetHeight - c;
                });
                appliedY += c;
            }
            ConnectionPoints.updateConnectionPoints(system);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            ConnectionPoints.updateConnectionPoints(system);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionPoints;
}