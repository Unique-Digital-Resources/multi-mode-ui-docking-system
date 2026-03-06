const ResizeManager = {
    getMinSize(el, dim) {
        if (el.classList.contains('dock')) return dim === 'width' ? 200 : 150;
        const style = getComputedStyle(el);
        const isRow = style.flexDirection === 'row';
        const isAlong = (dim === 'width' && isRow) || (dim === 'height' && !isRow);
        let min = 0, maxMin = 0;
        for (const c of el.children) {
            if (c.classList.contains('resize-handle')) {
                if (isAlong) min += dim === 'width' ? c.offsetWidth : c.offsetHeight;
            } else if (DockingUtils.isDockOrWrapper(c)) {
                const cm = ResizeManager.getMinSize(c, dim);
                if (isAlong) min += cm; else maxMin = Math.max(maxMin, cm);
            }
        }
        return isAlong ? min : maxMin;
    },

    updateResizeHandles(system) {
        document.querySelectorAll('.resize-handle').forEach(h => h.remove());
        
        const containers = [system.container, ...document.querySelectorAll('.dock-row, .dock-column')];
        
        containers.forEach(container => {
            const isRow = container === system.container || container.classList.contains('dock-row');
            const kids = DockingUtils.getChildren(container);
            
            kids.forEach((child, i) => {
                if (i < kids.length - 1) {
                    const h = document.createElement('div');
                    h.className = `resize-handle ${isRow ? 'vertical' : 'horizontal'}`;
                    child.appendChild(h);
                    h.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        ResizeManager.startResize(system, e, child, kids[i + 1], isRow);
                        h.classList.add('resizing');
                    });
                }
            });
        });
    },

    startResize(system, e, d1, d2, isH) {
        const dim = isH ? 'width' : 'height';
        system.resizing = {
            dock1: d1,
            dock2: d2,
            isHorizontal: isH,
            startPos: isH ? e.clientX : e.clientY,
            startSize1: isH ? d1.offsetWidth : d1.offsetHeight,
            startSize2: isH ? d2.offsetWidth : d2.offsetHeight,
            minSize1: ResizeManager.getMinSize(d1, dim),
            minSize2: ResizeManager.getMinSize(d2, dim),
            handle: e.target
        };
    },

    handleResize(system, e) {
        if (!system.resizing) return;
        const { dock1, dock2, isHorizontal, startPos, startSize1, startSize2, minSize1, minSize2 } = system.resizing;
        const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
        const s1 = startSize1 + delta;
        const s2 = startSize2 - delta;
        if (s1 >= minSize1 && s2 >= minSize2) {
            dock1.style.flex = s1;
            dock2.style.flex = s2;
            system.updateConnectionPoints();
        }
    },

    endResize(system) {
        if (system.resizing) {
            system.resizing.handle.classList.remove('resizing');
            system.resizing = null;
            system.updateConnectionPoints();
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResizeManager;
}