/**
 * splitter.js
 * ───────────
 * Responsible for:
 *  • Computing minimum layout sizes (getMinSize)
 *  • Creating and wiring resize-handle elements between sibling docks
 *  • Handling mouse-driven resize between two adjacent docks
 *  • Computing and rendering connection-point dots where resize handles meet
 *  • Multi-handle connection-point dragging (drag a corner to move two axes)
 */

/* ══════════════════════════════════════════════════════════════════════════
   MINIMUM SIZE
══════════════════════════════════════════════════════════════════════════ */

/**
 * Recursively computes the minimum width or height of a layout element
 * (dock, dock-row, or dock-column) by summing/maxing children's minimums.
 *
 * @param {DockingSystem} sys   (unused – kept for API consistency)
 * @param {HTMLElement}   el
 * @param {'width'|'height'} dim
 * @returns {number}  minimum size in pixels
 */
export function getMinSize(_sys, el, dim) {
    if (el.classList.contains('dock'))
        return dim === 'width' ? 200 : 150;

    const style   = getComputedStyle(el);
    const isRow   = style.flexDirection === 'row';
    const isAlong = (dim === 'width' && isRow) || (dim === 'height' && !isRow);
    let min = 0, maxMin = 0;

    for (const c of el.children) {
        if (c.classList.contains('resize-handle')) {
            // Resize handles themselves consume space along the main axis
            if (isAlong) min += dim === 'width' ? c.offsetWidth : c.offsetHeight;
        } else if (
            c.classList.contains('dock') ||
            c.classList.contains('dock-row') ||
            c.classList.contains('dock-column')
        ) {
            const cm = getMinSize(_sys, c, dim);
            if (isAlong) min    += cm;
            else         maxMin  = Math.max(maxMin, cm);
        }
    }

    return isAlong ? min : maxMin;
}

/* ══════════════════════════════════════════════════════════════════════════
   RESIZE HANDLES
══════════════════════════════════════════════════════════════════════════ */

/**
 * Removes all existing resize handles and recreates them between every pair of
 * adjacent sibling docks (or layout wrappers) in the container tree.
 *
 * A vertical handle is placed between horizontal siblings (dock-row).
 * A horizontal handle is placed between vertical siblings (dock-column).
 *
 * @param {DockingSystem} sys
 */
export function updateResizeHandles(sys) {
    // Remove stale handles
    document.querySelectorAll('.resize-handle').forEach(h => h.remove());

    const containers = [
        sys.container,
        ...document.querySelectorAll('.dock-row, .dock-column'),
    ];

    containers.forEach(container => {
        const isRow = container === sys.container ||
                      container.classList.contains('dock-row');

        const kids = Array.from(container.children).filter(c =>
            c.classList.contains('dock') ||
            c.classList.contains('dock-row') ||
            c.classList.contains('dock-column')
        );

        kids.forEach((child, i) => {
            if (i >= kids.length - 1) return; // no handle after the last child

            const handle      = document.createElement('div');
            handle.className  = `resize-handle ${isRow ? 'vertical' : 'horizontal'}`;
            child.appendChild(handle);

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startResize(sys, e, child, kids[i + 1], isRow);
                handle.classList.add('resizing');
            });
        });
    });
}

/**
 * Records the initial state needed to perform a resize drag.
 *
 * @param {DockingSystem} sys
 * @param {MouseEvent}    e
 * @param {HTMLElement}   d1      – element before the handle
 * @param {HTMLElement}   d2      – element after the handle
 * @param {boolean}       isHorizontal – true for vertical (left/right) handles
 */
export function startResize(sys, e, d1, d2, isHorizontal) {
    const dim = isHorizontal ? 'width' : 'height';
    sys.resizing = {
        dock1:        d1,
        dock2:        d2,
        isHorizontal,
        startPos:    isHorizontal ? e.clientX   : e.clientY,
        startSize1:  isHorizontal ? d1.offsetWidth  : d1.offsetHeight,
        startSize2:  isHorizontal ? d2.offsetWidth  : d2.offsetHeight,
        minSize1:    getMinSize(sys, d1, dim),
        minSize2:    getMinSize(sys, d2, dim),
        handle:      e.target,
    };
}

/**
 * Applies a resize delta from a mousemove event during an active resize drag.
 * Respects the computed minimum sizes of both flex siblings.
 *
 * @param {DockingSystem} sys
 * @param {MouseEvent}    e
 */
export function handleResize(sys, e) {
    if (!sys.resizing) return;
    const { dock1, dock2, isHorizontal, startPos, startSize1, startSize2, minSize1, minSize2 } = sys.resizing;
    const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
    const s1    = startSize1 + delta;
    const s2    = startSize2 - delta;
    if (s1 >= minSize1 && s2 >= minSize2) {
        dock1.style.flex = s1;
        dock2.style.flex = s2;
        updateConnectionPoints(sys);
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   CONNECTION POINTS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Recomputes and renders small circular dots at intersections between
 * horizontal and vertical resize handles (and between co-linear handles of
 * the same orientation).  Clicking and dragging a dot moves both axes
 * simultaneously.
 *
 * @param {DockingSystem} sys
 */
export function updateConnectionPoints(sys) {
    document.querySelectorAll('.connection-point').forEach(cp => cp.remove());

    const handles = document.querySelectorAll('.resize-handle');
    const vList = [], hList = [];

    handles.forEach(h => {
        const r = h.getBoundingClientRect();
        if (h.classList.contains('vertical')) {
            vList.push({
                handle: h,
                x:  Math.round(r.left + r.width  / 2),
                y1: Math.round(r.top),
                y2: Math.round(r.bottom),
            });
        } else {
            hList.push({
                handle: h,
                y:  Math.round(r.top + r.height / 2),
                x1: Math.round(r.left),
                x2: Math.round(r.right),
            });
        }
    });

    /* ── Collect intersections ── */
    const conns = new Map(); // key = "x,y" → Set of handle elements

    const addC = (key, h1, h2) => {
        if (!conns.has(key)) conns.set(key, new Set());
        conns.get(key).add(h1);
        conns.get(key).add(h2);
    };

    // Co-linear horizontal handles at the same y that meet end-to-end
    const hGrp = new Map();
    hList.forEach(h => {
        if (!hGrp.has(h.y)) hGrp.set(h.y, []);
        hGrp.get(h.y).push(h);
    });
    for (const g of hGrp.values()) {
        g.sort((a, b) => a.x1 - b.x1);
        for (let i = 0; i < g.length - 1; i++)
            if (Math.abs(g[i].x2 - g[i + 1].x1) <= 5)
                addC(`${Math.round((g[i].x2 + g[i + 1].x1) / 2)},${g[i].y}`,
                     g[i].handle, g[i + 1].handle);
    }

    // Co-linear vertical handles at the same x that meet end-to-end
    const vGrp = new Map();
    vList.forEach(v => {
        if (!vGrp.has(v.x)) vGrp.set(v.x, []);
        vGrp.get(v.x).push(v);
    });
    for (const g of vGrp.values()) {
        g.sort((a, b) => a.y1 - b.y1);
        for (let i = 0; i < g.length - 1; i++)
            if (Math.abs(g[i].y2 - g[i + 1].y1) <= 5)
                addC(`${g[i].x},${Math.round((g[i].y2 + g[i + 1].y1) / 2)}`,
                     g[i].handle, g[i + 1].handle);
    }

    // True cross-intersections between a vertical and a horizontal handle
    vList.forEach(v => hList.forEach(h => {
        if (h.y >= v.y1 && h.y <= v.y2 && v.x >= h.x1 && v.x <= h.x2)
            addC(`${v.x},${h.y}`, v.handle, h.handle);
    }));

    // Near-intersections (handle end-points within 3 px of each other)
    hList.forEach(h => vList.forEach(v => {
        if (Math.abs(h.x1 - v.x) <= 3 && h.y >= v.y1 && h.y <= v.y2)
            addC(`${v.x},${h.y}`, h.handle, v.handle);
        if (Math.abs(h.x2 - v.x) <= 3 && h.y >= v.y1 && h.y <= v.y2)
            addC(`${v.x},${h.y}`, h.handle, v.handle);
    }));
    vList.forEach(v => hList.forEach(h => {
        if (Math.abs(v.y1 - h.y) <= 3 && v.x >= h.x1 && v.x <= h.x2)
            addC(`${v.x},${h.y}`, v.handle, h.handle);
        if (Math.abs(v.y2 - h.y) <= 3 && v.x >= h.x1 && v.x <= h.x2)
            addC(`${v.x},${h.y}`, v.handle, h.handle);
    }));

    /* ── Render connection-point dots ── */
    conns.forEach((handleSet, key) => {
        if (handleSet.size < 2) return;

        const [x, y] = key.split(',').map(Number);
        const cp     = document.createElement('div');
        cp.classList.add('connection-point');
        cp.style.left = `${x - 5}px`;
        cp.style.top  = `${y - 5}px`;

        const arr  = Array.from(handleSet);
        const hasV = arr.some(h => h.classList.contains('vertical'));
        const hasH = arr.some(h => h.classList.contains('horizontal'));
        cp.style.cursor = hasV && hasH ? 'move' : hasV ? 'ew-resize' : 'ns-resize';

        document.body.appendChild(cp);
        cp.addEventListener('mousedown', e => startConnectionDrag(sys, e, arr));
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   CONNECTION-POINT DRAG  (simultaneous multi-axis resize)
══════════════════════════════════════════════════════════════════════════ */

/**
 * Starts a drag on a connection point that may span both vertical and
 * horizontal handles, allowing the user to resize two axes simultaneously.
 *
 * @param {DockingSystem}  sys
 * @param {MouseEvent}     e
 * @param {HTMLElement[]}  handleList – all handles that share this point
 */
export function startConnectionDrag(sys, e, handleList) {
    e.preventDefault();

    const startX = e.clientX, startY = e.clientY;
    let appliedX = 0,          appliedY = 0;

    const verts  = handleList.filter(h => h.classList.contains('vertical'));
    const horizs = handleList.filter(h => h.classList.contains('horizontal'));

    const onMove = (e) => {
        const dx = e.clientX - startX - appliedX;
        const dy = e.clientY - startY - appliedY;

        if (verts.length) {
            let minD = -Infinity, maxD = Infinity;
            verts.forEach(h => {
                const prev = h.parentElement, next = prev.nextElementSibling;
                if (!next) return;
                minD = Math.max(minD, getMinSize(sys, prev, 'width') - prev.offsetWidth);
                maxD = Math.min(maxD, next.offsetWidth - getMinSize(sys, next, 'width'));
            });
            const c = Math.max(minD, Math.min(dx, maxD));
            verts.forEach(h => {
                const prev = h.parentElement, next = prev.nextElementSibling;
                if (!next) return;
                prev.style.flex = prev.offsetWidth  + c;
                next.style.flex = next.offsetWidth  - c;
            });
            appliedX += c;
        }

        if (horizs.length) {
            let minD = -Infinity, maxD = Infinity;
            horizs.forEach(h => {
                const prev = h.parentElement, next = prev.nextElementSibling;
                if (!next) return;
                minD = Math.max(minD, getMinSize(sys, prev, 'height') - prev.offsetHeight);
                maxD = Math.min(maxD, next.offsetHeight - getMinSize(sys, next, 'height'));
            });
            const c = Math.max(minD, Math.min(dy, maxD));
            horizs.forEach(h => {
                const prev = h.parentElement, next = prev.nextElementSibling;
                if (!next) return;
                prev.style.flex = prev.offsetHeight + c;
                next.style.flex = next.offsetHeight - c;
            });
            appliedY += c;
        }

        updateConnectionPoints(sys);
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        updateConnectionPoints(sys);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
}
