const DockManager = {
    createDock(system, parent, panels = null, tabsPos = 'top') {
        const num = ++system.dockCounter;
        const dock = document.createElement('div');
        dock.className = 'dock';
        dock.dataset.tabsPos = tabsPos;
        
        const defaultPanel = system.mkPanel(`Panel ${num}`, `<div class="dock-card">Panel ${num}</div>`);
        dock.panelData = panels ?? [defaultPanel];
        dock.activePanelIndex = 0;
        
        parent.appendChild(dock);
        system.docks.push(dock);
        
        DOMBuilder.buildDockHTML(dock);
        dock.innerHTML = DOMBuilder.buildDockHTML(dock);
        
        system.setupDockEvents(dock);
        return dock;
    },

    removeDock(system, dock) {
        if (system.docks.length <= 1) {
            alert('Cannot remove the last dock!');
            return;
        }
        const parent = dock.parentElement;
        dock.remove();
        system.docks = system.docks.filter(d => d !== dock);
        DockManager.cleanupEmptyContainer(system, parent);
        system.updateResizeHandles();
        system.updateConnectionPoints();
    },

    cleanupEmptyContainer(system, container) {
        if (!container || container === system.container) return;
        
        const kids = DockingUtils.getChildren(container);
        
        if (kids.length === 0) {
            const p = container.parentElement;
            container.remove();
            DockManager.cleanupEmptyContainer(system, p);
        } else if (kids.length === 1) {
            const child = kids[0];
            const p = container.parentElement;
            child.style.flex = container.style.flex || '1';
            if (p) {
                p.insertBefore(child, container);
                container.remove();
                DockManager.cleanupEmptyContainer(system, p);
            }
        }
    },

    ungroupTabs(system, dock) {
        if (dock.panelData.length <= 1) return;

        const tabsPos = dock.dataset.tabsPos || 'top';
        const isH = tabsPos === 'top' || tabsPos === 'bottom';
        const parent = dock.parentElement;
        const flexVal = dock.style.flex || '1';

        const wrapper = document.createElement('div');
        wrapper.className = isH ? 'dock-row' : 'dock-column';
        wrapper.style.flex = flexVal;

        dock.panelData.forEach(panel => {
            const newDock = document.createElement('div');
            newDock.className = 'dock';
            newDock.dataset.tabsPos = 'top';
            newDock.panelData = [panel];
            newDock.activePanelIndex = 0;
            wrapper.appendChild(newDock);
            system.docks.push(newDock);

            EmbedManager._saveEmbedLayers(newDock);
            newDock.innerHTML = DOMBuilder.buildDockHTML(newDock);
            EmbedManager._restoreEmbedLayers(newDock);
            system.setupDockEvents(newDock);
        });

        parent.insertBefore(wrapper, dock);
        dock.remove();
        system.docks = system.docks.filter(d => d !== dock);

        system.updateResizeHandles();
        system.updateConnectionPoints();
    },

    untabifyDock(system, dock) {
        if (dock.panelData.length <= 1) return dock;

        const tabsPos = dock.dataset.tabsPos || 'top';
        const isH = tabsPos === 'top' || tabsPos === 'bottom';
        const parent = dock.parentElement;
        const flexVal = dock.style.flex || '1';

        const wrapper = document.createElement('div');
        wrapper.className = isH ? 'dock-row' : 'dock-column';
        wrapper.style.flex = flexVal;

        const firstPanel = dock.panelData[0];
        const newDock = document.createElement('div');
        newDock.className = 'dock';
        newDock.dataset.tabsPos = 'top';
        newDock.panelData = [firstPanel];
        newDock.activePanelIndex = 0;
        newDock.style.flex = '1';
        wrapper.appendChild(newDock);
        system.docks.push(newDock);

        EmbedManager._saveEmbedLayers(newDock);
        newDock.innerHTML = DOMBuilder.buildDockHTML(newDock);
        EmbedManager._restoreEmbedLayers(newDock);
        system.setupDockEvents(newDock);

        for (let i = 1; i < dock.panelData.length; i++) {
            const panel = dock.panelData[i];
            const extraDock = document.createElement('div');
            extraDock.className = 'dock';
            extraDock.dataset.tabsPos = 'top';
            extraDock.panelData = [panel];
            extraDock.activePanelIndex = 0;
            extraDock.style.flex = '1';
            wrapper.appendChild(extraDock);
            system.docks.push(extraDock);

            EmbedManager._saveEmbedLayers(extraDock);
            extraDock.innerHTML = DOMBuilder.buildDockHTML(extraDock);
            EmbedManager._restoreEmbedLayers(extraDock);
            system.setupDockEvents(extraDock);
        }

        parent.insertBefore(wrapper, dock);
        dock.remove();
        system.docks = system.docks.filter(d => d !== dock);

        return newDock;
    },

    swapDocks(system, d1, d2) {
        const p1 = d1.parentElement;
        const p2 = d2.parentElement;
        const n1 = d1.nextSibling;
        const n2 = d2.nextSibling;

        if (n1 === d2) {
            p1.insertBefore(d2, d1);
        } else if (n2 === d1) {
            p2.insertBefore(d1, d2);
        } else {
            if (n1) p1.insertBefore(d2, n1); else p1.appendChild(d2);
            if (n2) p2.insertBefore(d1, n2); else p2.appendChild(d1);
        }
    },

    insertDock(system, dragged, target, zone) {
        const oldParent = dragged.parentElement;
        dragged.remove();
        dragged.style.flex = '1';
        DockManager.cleanupEmptyContainer(system, oldParent);

        /* Re-read target's parent AFTER cleanup — it may have been unwrapped */
        const parent = target.parentElement;

        if (zone === 'top' || zone === 'bottom') {
            if (!parent.classList.contains('dock-column')) {
                const col = document.createElement('div');
                col.className = 'dock-column';
                col.style.flex = target.style.flex || '1';
                parent.insertBefore(col, target);
                target.remove();
                target.style.flex = '1';
                col.appendChild(target);
            }
            if (zone === 'top') {
                target.parentElement.insertBefore(dragged, target);
            } else {
                if (target.nextSibling) {
                    target.parentElement.insertBefore(dragged, target.nextSibling);
                } else {
                    target.parentElement.appendChild(dragged);
                }
            }
        } else {
            if (!parent.classList.contains('dock-row')) {
                const row = document.createElement('div');
                row.className = 'dock-row';
                row.style.flex = target.style.flex || '1';
                parent.insertBefore(row, target);
                target.remove();
                target.style.flex = '1';
                row.appendChild(target);
            }
            if (zone === 'left') {
                target.parentElement.insertBefore(dragged, target);
            } else {
                if (target.nextSibling) {
                    target.parentElement.insertBefore(dragged, target.nextSibling);
                } else {
                    target.parentElement.appendChild(dragged);
                }
            }
        }
    },

    placeDetachedDock(system, newDock, target, zone) {
        const parent = target.parentElement;

        if (zone === 'top' || zone === 'bottom') {
            if (!parent.classList.contains('dock-column')) {
                const col = document.createElement('div');
                col.className = 'dock-column';
                col.style.flex = target.style.flex || '1';
                parent.insertBefore(col, target);
                target.remove();
                target.style.flex = '1';
                col.appendChild(target);
            }
            if (zone === 'top') {
                target.parentElement.insertBefore(newDock, target);
            } else {
                if (target.nextSibling) {
                    target.parentElement.insertBefore(newDock, target.nextSibling);
                } else {
                    target.parentElement.appendChild(newDock);
                }
            }
        } else {
            if (!parent.classList.contains('dock-row')) {
                const row = document.createElement('div');
                row.className = 'dock-row';
                row.style.flex = target.style.flex || '1';
                parent.insertBefore(row, target);
                target.remove();
                target.style.flex = '1';
                row.appendChild(target);
            }
            if (zone === 'left') {
                target.parentElement.insertBefore(newDock, target);
            } else {
                if (target.nextSibling) {
                    target.parentElement.insertBefore(newDock, target.nextSibling);
                } else {
                    target.parentElement.appendChild(newDock);
                }
            }
        }
    },

    mergeDockAsTab(system, src, tgt, tabsPos) {
        const oldParent = src.parentElement;
        src.panelData.forEach(p => tgt.panelData.push(p));
        tgt.dataset.tabsPos = tabsPos;
        tgt.activePanelIndex = 0;
        src.remove();
        system.docks = system.docks.filter(d => d !== src);
        DockManager.cleanupEmptyContainer(system, oldParent);
        EmbedManager._saveEmbedLayers(tgt);
        tgt.innerHTML = DOMBuilder.buildDockHTML(tgt);
        EmbedManager._restoreEmbedLayers(tgt);
        system.setupDockEvents(tgt);
        /* Re-render all embed boards so float closures point to this tgt dock */
        EmbedManager.renderBoard(tgt);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DockManager;
}