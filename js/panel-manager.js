const PanelManager = {
    activatePanel(system, dock, index) {
        dock.activePanelIndex = index;
        dock.querySelectorAll('.dock-tab').forEach((t, i) => t.classList.toggle('active', i === index));
        dock.querySelectorAll('.dock-panel').forEach((p, i) => p.classList.toggle('active', i === index));
        const titleEl = dock.querySelector(':scope > .dock-header .dock-title');
        if (titleEl) titleEl.textContent = dock.panelData[index].title;
    },

    removePanel(system, dock, index) {
        if (dock.panelData.length <= 1) {
            DockManager.removeDock(system, dock);
            return;
        }
        dock.panelData.splice(index, 1);
        if (dock.activePanelIndex >= dock.panelData.length) {
            dock.activePanelIndex = dock.panelData.length - 1;
        } else if (dock.activePanelIndex > index) {
            dock.activePanelIndex--;
        }
        EmbedManager._saveEmbedLayers(dock);
        dock.innerHTML = DOMBuilder.buildDockHTML(dock);
        EmbedManager._restoreEmbedLayers(dock);
        system.setupDockEvents(dock);
        EmbedManager.renderBoard(dock);
    },

    performDetach(system) {
        const { draggedDock: src, dropTarget: tgt, dropZone: zone, extractPanelIdx: pi } = system;
        if (!src || !tgt || pi == null) return;

        /* Dropped back onto own dock */
        if (src === tgt) {
            if (zone === 'center') return; /* Re-tab — already tabbed, no-op */
            /* Directional: pull the active tab out as a new sibling dock */
            const panel = src.panelData[pi];
            src.panelData.splice(pi, 1);
            if (src.activePanelIndex >= src.panelData.length) src.activePanelIndex = src.panelData.length - 1;
            else if (src.activePanelIndex > pi) src.activePanelIndex--;

            const newDock = document.createElement('div');
            newDock.className = 'dock';
            newDock.dataset.tabsPos = 'top';
            newDock.panelData = [panel];
            newDock.activePanelIndex = 0;
            newDock.style.flex = '1';
            system.docks.push(newDock);
            newDock.innerHTML = DOMBuilder.buildDockHTML(newDock);
            system.setupDockEvents(newDock);
            EmbedManager.renderBoard(newDock);

            EmbedManager._saveEmbedLayers(src);
            src.innerHTML = DOMBuilder.buildDockHTML(src);
            EmbedManager._restoreEmbedLayers(src);
            system.setupDockEvents(src);
            EmbedManager.renderBoard(src);

            DockManager.placeDetachedDock(system, newDock, src, zone);
            system.updateResizeHandles();
            system.updateConnectionPoints();
            return;
        }

        const panel = src.panelData[pi];

        src.panelData.splice(pi, 1);
        if (src.activePanelIndex >= src.panelData.length) src.activePanelIndex = src.panelData.length - 1;
        else if (src.activePanelIndex > pi) src.activePanelIndex--;

        const newDock = document.createElement('div');
        newDock.className = 'dock';
        newDock.dataset.tabsPos = 'top';
        newDock.panelData = [panel];
        newDock.activePanelIndex = 0;
        newDock.style.flex = '1';
        system.docks.push(newDock);
        
        newDock.innerHTML = DOMBuilder.buildDockHTML(newDock);
        system.setupDockEvents(newDock);
        /* Re-render floats so their drag-handler closures reference newDock, not the old dock */
        EmbedManager.renderBoard(newDock);

        if (src.panelData.length === 0) {
            const srcParent = src.parentElement;
            src.remove();
            system.docks = system.docks.filter(d => d !== src);
            DockManager.cleanupEmptyContainer(system, srcParent);
        } else {
            EmbedManager._saveEmbedLayers(src);
            src.innerHTML = DOMBuilder.buildDockHTML(src);
            EmbedManager._restoreEmbedLayers(src);
            system.setupDockEvents(src);
            EmbedManager.renderBoard(src);
        }

        DockManager.placeDetachedDock(system, newDock, tgt, zone === 'center' ? 'right' : zone);

        system.updateResizeHandles();
        system.updateConnectionPoints();
    },

    performTabMove(system) {
        const { draggedDock: src, dropTarget: tgt, dropZone: zone, extractPanelIdx: pi } = system;
        if (!src || !tgt || pi == null) return;
        /* Dropped back onto self — no move needed, tab stays where it is */
        if (src === tgt) return;

        const panel = src.panelData[pi];
        const tabPos = zone === 'center' ? (tgt.dataset.tabsPos || 'top') : zone;

        src.panelData.splice(pi, 1);
        if (src.activePanelIndex >= src.panelData.length) src.activePanelIndex = src.panelData.length - 1;
        else if (src.activePanelIndex > pi) src.activePanelIndex--;

        tgt.panelData.push(panel);
        tgt.dataset.tabsPos = tabPos;
        tgt.activePanelIndex = tgt.panelData.length - 1;

        if (src.panelData.length === 0) {
            const parent = src.parentElement;
            src.remove();
            system.docks = system.docks.filter(d => d !== src);
            DockManager.cleanupEmptyContainer(system, parent);
        } else {
            EmbedManager._saveEmbedLayers(src);
            src.innerHTML = DOMBuilder.buildDockHTML(src);
            EmbedManager._restoreEmbedLayers(src);
            system.setupDockEvents(src);
        }

        EmbedManager._saveEmbedLayers(tgt);
        tgt.innerHTML = DOMBuilder.buildDockHTML(tgt);
        EmbedManager._restoreEmbedLayers(tgt);
        system.setupDockEvents(tgt);
        /* Re-render so float closures reference the correct dock (tgt) */
        EmbedManager.renderBoard(tgt);
        if (src.panelData.length > 0) EmbedManager.renderBoard(src);
        
        system.updateResizeHandles();
        system.updateConnectionPoints();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PanelManager;
}