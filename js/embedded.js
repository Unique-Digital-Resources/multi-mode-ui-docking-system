/**
 * embedded.js
 * ───────────
 * Responsible for:
 *  • Creating embedded dock elements inside parent docks
 *  • Managing embedded dock modes: floating and insert
 *  • Handling embedded dock dragging, resizing, and placement
 *  • Drop indicators for embedded placement
 */

import { rebuildDockUI } from './dock.js';
import { updateResizeHandles, updateConnectionPoints } from './splitter.js';

const EMBED_DROP_ZONE_THRESHOLD = 0.25;
const EMBED_MIN_HEIGHT = 80;
const EMBED_MIN_WIDTH = 120;
const EMBED_DEFAULT_HEIGHT = 150;
const EMBED_DEFAULT_WIDTH = 200;

export function getEmbedDropZone(x, y, w, h) {
    const t = EMBED_DROP_ZONE_THRESHOLD;
    if (y < h * t) return 'top';
    if (y > h * (1 - t)) return 'bottom';
    if (x < w * t) return 'left';
    if (x > w * (1 - t)) return 'right';
    return 'floating';
}

export function createEmbeddedLayer(parentDock) {
    let layer = parentDock.querySelector(':scope > .dock-body > .dock-main > .dock-content > .dock-embedded-layer');
    if (!layer) {
        const dockContent = parentDock.querySelector('.dock-content');
        if (!dockContent) return null;
        
        layer = document.createElement('div');
        layer.className = 'dock-embedded-layer';
        
        layer.innerHTML = `
            <div class="embed-drop-indicator top" data-label="Top"></div>
            <div class="embed-drop-indicator bottom" data-label="Bottom"></div>
            <div class="embed-drop-indicator left" data-label="Left"></div>
            <div class="embed-drop-indicator right" data-label="Right"></div>
        `;
        
        dockContent.appendChild(layer);
    }
    return layer;
}

export function showEmbedDropIndicators(parentDock, activeZone = null) {
    const layer = createEmbeddedLayer(parentDock);
    if (!layer) return;
    
    layer.classList.add('active');
    
    layer.querySelectorAll('.embed-drop-indicator').forEach(indicator => {
        indicator.classList.remove('active');
    });
    
    if (activeZone && activeZone !== 'floating') {
        const indicator = layer.querySelector(`.embed-drop-indicator.${activeZone}`);
        if (indicator) indicator.classList.add('active');
    }
}

export function hideEmbedDropIndicators(parentDock) {
    if (!parentDock) {
        hideAllEmbedDropIndicators();
        return;
    }
    const layer = parentDock.querySelector(':scope > .dock-body > .dock-main > .dock-content > .dock-embedded-layer');
    if (layer) {
        layer.classList.remove('active');
        layer.querySelectorAll('.embed-drop-indicator').forEach(indicator => {
            indicator.classList.remove('active');
        });
    }
}

export function hideAllEmbedDropIndicators() {
    document.querySelectorAll('.dock-embedded-layer').forEach(layer => {
        layer.classList.remove('active');
        layer.querySelectorAll('.embed-drop-indicator').forEach(indicator => {
            indicator.classList.remove('active');
        });
    });
}

export function createEmbeddedDock(sys, parentDock, dock, panelIndex, position = 'floating', insertSide = null) {
    const layer = createEmbeddedLayer(parentDock);
    if (!layer) return null;
    
    const embeddedDock = document.createElement('div');
    embeddedDock.className = `embedded-dock embedded-${position}`;
    if (insertSide) {
        embeddedDock.classList.add(`embedded-${insertSide}`);
    }
    
    let panelData;
    if (panelIndex !== null && dock.panelData.length > 1) {
        panelData = [dock.panelData[panelIndex]];
    } else {
        panelData = [...dock.panelData];
    }
    
    embeddedDock.panelData = panelData;
    embeddedDock.activePanelIndex = 0;
    embeddedDock.dataset.tabsPos = 'top';
    embeddedDock.dataset.embeddedMode = position;
    if (insertSide) {
        embeddedDock.dataset.insertSide = insertSide;
    }
    embeddedDock.dataset.parentDockId = parentDock.dataset.dockId || parentDock.id;
    
    applyEmbeddedPosition(embeddedDock, position, insertSide, parentDock);
    
    layer.appendChild(embeddedDock);
    sys.embeddedDocks.push(embeddedDock);
    
    rebuildEmbeddedDockUI(sys, embeddedDock);
    addEmbeddedResizeHandles(embeddedDock);
    
    embeddedDock.classList.remove('dragging');
    
    return embeddedDock;
}

function applyEmbeddedPosition(embeddedDock, position, insertSide, parentDock) {
    embeddedDock.style.position = 'absolute';
    
    if (position === 'insert' && insertSide) {
        embeddedDock.classList.remove('embedded-top', 'embedded-bottom', 'embedded-left', 'embedded-right', 'embedded-floating');
        embeddedDock.classList.add(`embedded-${insertSide}`);
        embeddedDock.dataset.embeddedMode = 'insert';
        embeddedDock.dataset.insertSide = insertSide;
        
        const padding = 8;
        
        switch (insertSide) {
            case 'top':
                embeddedDock.style.top = `${padding}px`;
                embeddedDock.style.left = `${padding}px`;
                embeddedDock.style.right = `${padding}px`;
                embeddedDock.style.bottom = 'auto';
                embeddedDock.style.width = 'auto';
                embeddedDock.style.height = `${EMBED_DEFAULT_HEIGHT}px`;
                embeddedDock.style.margin = '0';
                embeddedDock.style.minWidth = '150px';
                embeddedDock.style.minHeight = `${EMBED_MIN_HEIGHT}px`;
                break;
            case 'bottom':
                embeddedDock.style.bottom = `${padding}px`;
                embeddedDock.style.left = `${padding}px`;
                embeddedDock.style.right = `${padding}px`;
                embeddedDock.style.top = 'auto';
                embeddedDock.style.width = 'auto';
                embeddedDock.style.height = `${EMBED_DEFAULT_HEIGHT}px`;
                embeddedDock.style.margin = '0';
                embeddedDock.style.minWidth = '150px';
                embeddedDock.style.minHeight = `${EMBED_MIN_HEIGHT}px`;
                break;
            case 'left':
                embeddedDock.style.left = `${padding}px`;
                embeddedDock.style.top = `${padding}px`;
                embeddedDock.style.bottom = `${padding}px`;
                embeddedDock.style.right = 'auto';
                embeddedDock.style.height = 'auto';
                embeddedDock.style.width = `${EMBED_DEFAULT_WIDTH}px`;
                embeddedDock.style.margin = '0';
                embeddedDock.style.minWidth = `${EMBED_MIN_WIDTH}px`;
                embeddedDock.style.minHeight = '100px';
                break;
            case 'right':
                embeddedDock.style.right = `${padding}px`;
                embeddedDock.style.top = `${padding}px`;
                embeddedDock.style.bottom = `${padding}px`;
                embeddedDock.style.left = 'auto';
                embeddedDock.style.height = 'auto';
                embeddedDock.style.width = `${EMBED_DEFAULT_WIDTH}px`;
                embeddedDock.style.margin = '0';
                embeddedDock.style.minWidth = `${EMBED_MIN_WIDTH}px`;
                embeddedDock.style.minHeight = '100px';
                break;
        }
    } else {
        embeddedDock.classList.remove('embedded-top', 'embedded-bottom', 'embedded-left', 'embedded-right');
        embeddedDock.classList.add('embedded-floating');
        embeddedDock.dataset.embeddedMode = 'floating';
        delete embeddedDock.dataset.insertSide;
        
        embeddedDock.style.top = '8px';
        embeddedDock.style.left = '8px';
        embeddedDock.style.width = `${EMBED_DEFAULT_WIDTH}px`;
        embeddedDock.style.height = `${EMBED_DEFAULT_HEIGHT}px`;
        embeddedDock.style.right = 'auto';
        embeddedDock.style.bottom = 'auto';
        embeddedDock.style.margin = '0';
        embeddedDock.style.minWidth = '150px';
        embeddedDock.style.minHeight = '100px';
    }
}

export function rebuildEmbeddedDockUI(sys, embeddedDock) {
    const panels = embeddedDock.panelData;
    const ai = Math.min(embeddedDock.activePanelIndex ?? 0, panels.length - 1);
    embeddedDock.activePanelIndex = ai;
    
    const hasTabs = panels.length > 1;
    const tabsPos = embeddedDock.dataset.tabsPos || 'top';
    const embeddedMode = embeddedDock.dataset.embeddedMode || 'floating';
    const insertSide = embeddedDock.dataset.insertSide;
    
    const tabsBar = hasTabs ? `
        <div class="dock-tabs-bar">
            ${panels.map((p, i) => `
            <div class="dock-tab ${i === ai ? 'active' : ''}" data-pi="${i}">
                <span class="tab-title">${escapeHTML(p.title)}</span>
                <button class="tab-close" title="Close tab">×</button>
            </div>`).join('')}
        </div>` : '';
    
    const panelsHTML = panels.map((p, i) => `
        <div class="dock-panel ${i === ai ? 'active' : ''}" data-pi="${i}">
            ${p.contentHTML}
        </div>`).join('');
    
    embeddedDock.innerHTML = `
        <div class="dock-header">
            <span class="dock-title">${escapeHTML(panels[ai].title)}</span>
            <div class="dock-controls">
                <div class="embedded-sub-mode">
                    <button class="dc-btn dh-float ${embeddedMode === 'floating' ? 'active' : ''}"
                            title="Drag to move freely inside parent dock">Float</button>
                    <button class="dc-btn dh-insert ${embeddedMode === 'insert' ? 'active' : ''}"
                            title="Drag to insert at top/bottom/left/right of parent dock">Insert</button>
                </div>
                <button class="dc-btn dh-extract"
                        title="Extract from parent dock">⬚</button>
                <button class="dc-btn dh-remove"
                        title="Remove ${hasTabs ? 'this tab' : 'this dock'}">✕</button>
            </div>
        </div>
        <div class="dock-body">
            ${tabsBar}
            <div class="dock-main">
                <div class="dock-content">${panelsHTML}</div>
            </div>
        </div>
    `;
    
    setupEmbeddedDockEvents(sys, embeddedDock);
}

function setupEmbeddedDockEvents(sys, embeddedDock) {
    const header = embeddedDock.querySelector('.dock-header');
    const floatBtn = embeddedDock.querySelector('.dh-float');
    const insertBtn = embeddedDock.querySelector('.dh-insert');
    const extractBtn = embeddedDock.querySelector('.dh-extract');
    const removeBtn = embeddedDock.querySelector('.dh-remove');
    
    if (floatBtn) {
        floatBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setEmbeddedMode(sys, embeddedDock, 'floating');
            setTimeout(() => {
                startEmbeddedDrag(sys, e, embeddedDock);
            }, 0);
        });
    }
    
    if (insertBtn) {
        insertBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const newSide = embeddedDock.dataset.insertSide || 'top';
            setEmbeddedMode(sys, embeddedDock, 'insert', newSide);
            setTimeout(() => {
                startEmbeddedDrag(sys, e, embeddedDock);
            }, 0);
        });
    }
    
    if (extractBtn) {
        extractBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            extractEmbeddedDock(sys, embeddedDock);
        });
    }
    
    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeEmbeddedDock(sys, embeddedDock);
        });
    }
    
    embeddedDock.querySelectorAll('.dock-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.classList.contains('tab-close')) {
                activateEmbeddedPanel(embeddedDock, +tab.dataset.pi);
            }
        });
        tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeEmbeddedPanel(sys, embeddedDock, +tab.dataset.pi);
        });
    });
}

export function setEmbeddedMode(sys, embeddedDock, mode, insertSide = null) {
    const parentDock = embeddedDock.closest('.dock');
    if (!parentDock) return;
    
    const parentContent = parentDock.querySelector('.dock-content');
    if (!parentContent) return;
    
    const parentRect = parentContent.getBoundingClientRect();
    
    if (mode === 'insert') {
        const currentSide = insertSide || embeddedDock.dataset.insertSide || 'top';
        embeddedDock.dataset.embeddedMode = 'insert';
        embeddedDock.dataset.insertSide = currentSide;
        
        updateEmbeddedDockForZone(embeddedDock, currentSide, parentRect);
    } else {
        embeddedDock.dataset.embeddedMode = 'floating';
        delete embeddedDock.dataset.insertSide;
        
        embeddedDock.classList.remove('embedded-top', 'embedded-bottom', 'embedded-left', 'embedded-right');
        embeddedDock.classList.add('embedded-floating');
        
        const currentWidth = embeddedDock.offsetWidth || EMBED_DEFAULT_WIDTH;
        const currentHeight = embeddedDock.offsetHeight || EMBED_DEFAULT_HEIGHT;
        
        embeddedDock.style.position = 'absolute';
        embeddedDock.style.top = '8px';
        embeddedDock.style.left = '8px';
        embeddedDock.style.right = 'auto';
        embeddedDock.style.bottom = 'auto';
        embeddedDock.style.width = `${currentWidth}px`;
        embeddedDock.style.height = `${currentHeight}px`;
        embeddedDock.style.margin = '0';
        embeddedDock.style.minWidth = '150px';
        embeddedDock.style.minHeight = '100px';
    }
    
    rebuildEmbeddedDockUI(sys, embeddedDock);
    addEmbeddedResizeHandles(embeddedDock);
}

function activateEmbeddedPanel(embeddedDock, index) {
    embeddedDock.activePanelIndex = index;
    
    embeddedDock.querySelectorAll('.dock-tab')
        .forEach((t, i) => t.classList.toggle('active', i === index));
    embeddedDock.querySelectorAll('.dock-panel')
        .forEach((p, i) => p.classList.toggle('active', i === index));
    
    const titleEl = embeddedDock.querySelector('.dock-header .dock-title');
    if (titleEl) titleEl.textContent = embeddedDock.panelData[index].title;
}

function removeEmbeddedPanel(sys, embeddedDock, index) {
    if (embeddedDock.panelData.length <= 1) {
        removeEmbeddedDock(sys, embeddedDock);
        return;
    }
    
    embeddedDock.panelData.splice(index, 1);
    
    if (embeddedDock.activePanelIndex >= embeddedDock.panelData.length) {
        embeddedDock.activePanelIndex = embeddedDock.panelData.length - 1;
    } else if (embeddedDock.activePanelIndex > index) {
        embeddedDock.activePanelIndex--;
    }
    
    rebuildEmbeddedDockUI(sys, embeddedDock);
}

export function removeEmbeddedDock(sys, embeddedDock) {
    const parentDock = embeddedDock.closest('.dock');
    embeddedDock.remove();
    sys.embeddedDocks = sys.embeddedDocks.filter(d => d !== embeddedDock);
    
    if (parentDock) {
        const layer = parentDock.querySelector(':scope > .dock-body > .dock-main > .dock-content > .dock-embedded-layer');
        if (layer && layer.querySelectorAll('.embedded-dock').length === 0) {
            layer.classList.remove('active');
        }
    }
}

export function extractEmbeddedDock(sys, embeddedDock) {
    const parentDock = embeddedDock.closest('.dock');
    const panelData = embeddedDock.panelData;
    const activeIndex = embeddedDock.activePanelIndex;
    
    removeEmbeddedDock(sys, embeddedDock);
    
    const newDock = document.createElement('div');
    newDock.className = 'dock';
    newDock.dataset.tabsPos = 'top';
    newDock.panelData = panelData;
    newDock.activePanelIndex = activeIndex;
    newDock.style.flex = '1';
    
    sys.docks.push(newDock);
    sys.container.appendChild(newDock);
    rebuildDockUI(sys, newDock);
    
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
    
    return newDock;
}

export function startEmbeddedDrag(sys, e, embeddedDock) {
    const parentDock = embeddedDock.closest('.dock');
    if (!parentDock) return;
    
    const rect = embeddedDock.getBoundingClientRect();
    const parentContent = parentDock.querySelector('.dock-content');
    if (!parentContent) return;
    
    const parentRect = parentContent.getBoundingClientRect();
    
    const currentLeft = rect.left - parentRect.left;
    const currentTop = rect.top - parentRect.top;
    const currentWidth = embeddedDock.offsetWidth;
    const currentHeight = embeddedDock.offsetHeight;
    
    const mode = embeddedDock.dataset.embeddedMode;
    
    sys.embeddedDrag = {
        dock: embeddedDock,
        parentDock: parentDock,
        mode: mode,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: currentLeft,
        startTop: currentTop,
        startWidth: currentWidth,
        startHeight: currentHeight,
        currentZone: null
    };
    
    embeddedDock.classList.add('dragging');
    
    if (mode === 'insert') {
        createEmbeddedLayer(parentDock);
        showEmbedDropIndicators(parentDock, embeddedDock.dataset.insertSide || 'top');
    }
}

export function handleEmbeddedDragMove(sys, e) {
    if (!sys.embeddedDrag) return;
    
    const { dock, parentDock, mode, startX, startY, startLeft, startTop, startWidth, startHeight } = sys.embeddedDrag;
    const parentContent = parentDock.querySelector('.dock-content');
    if (!parentContent) return;
    
    const parentRect = parentContent.getBoundingClientRect();
    
    if (mode === 'insert') {
        const x = e.clientX - parentRect.left;
        const y = e.clientY - parentRect.top;
        const zone = getEmbedDropZone(x, y, parentRect.width, parentRect.height);
        
        showEmbedDropIndicators(parentDock, zone);
        
        if (zone !== 'floating') {
            updateEmbeddedDockForZone(dock, zone, parentRect);
        }
        
        sys.embeddedDrag.currentZone = zone;
    } else {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        dock.classList.remove('embedded-top', 'embedded-bottom', 'embedded-left', 'embedded-right');
        dock.classList.add('embedded-floating');
        dock.style.position = 'absolute';
        dock.style.left = `${startLeft + dx}px`;
        dock.style.top = `${startTop + dy}px`;
        dock.style.right = 'auto';
        dock.style.bottom = 'auto';
        dock.style.margin = '0';
        dock.style.width = `${startWidth}px`;
        dock.style.height = `${startHeight}px`;
        dock.style.minWidth = '150px';
        dock.style.minHeight = '100px';
        
        const dockWidth = dock.offsetWidth;
        const dockHeight = dock.offsetHeight;
        
        const maxLeft = parentRect.width - dockWidth;
        const maxTop = parentRect.height - dockHeight;
        
        if (parseInt(dock.style.left) < 0) dock.style.left = '0px';
        if (parseInt(dock.style.top) < 0) dock.style.top = '0px';
        if (parseInt(dock.style.left) > maxLeft) dock.style.left = `${Math.max(0, maxLeft)}px`;
        if (parseInt(dock.style.top) > maxTop) dock.style.top = `${Math.max(0, maxTop)}px`;
    }
}

function updateEmbeddedDockForZone(dock, zone, parentRect) {
    dock.classList.remove('embedded-top', 'embedded-bottom', 'embedded-left', 'embedded-right', 'embedded-floating');
    dock.classList.add(`embedded-${zone}`);
    
    dock.style.position = 'absolute';
    
    const padding = 8;
    const parentWidth = parentRect.width - padding * 2;
    const parentHeight = parentRect.height - padding * 2;
    
    switch (zone) {
        case 'top':
            dock.style.top = `${padding}px`;
            dock.style.left = `${padding}px`;
            dock.style.right = `${padding}px`;
            dock.style.bottom = 'auto';
            dock.style.width = 'auto';
            dock.style.height = `${EMBED_DEFAULT_HEIGHT}px`;
            dock.style.margin = '0';
            dock.style.minWidth = '150px';
            dock.style.minHeight = `${EMBED_MIN_HEIGHT}px`;
            break;
        case 'bottom':
            dock.style.bottom = `${padding}px`;
            dock.style.left = `${padding}px`;
            dock.style.right = `${padding}px`;
            dock.style.top = 'auto';
            dock.style.width = 'auto';
            dock.style.height = `${EMBED_DEFAULT_HEIGHT}px`;
            dock.style.margin = '0';
            dock.style.minWidth = '150px';
            dock.style.minHeight = `${EMBED_MIN_HEIGHT}px`;
            break;
        case 'left':
            dock.style.left = `${padding}px`;
            dock.style.top = `${padding}px`;
            dock.style.bottom = `${padding}px`;
            dock.style.right = 'auto';
            dock.style.height = 'auto';
            dock.style.width = `${EMBED_DEFAULT_WIDTH}px`;
            dock.style.margin = '0';
            dock.style.minWidth = `${EMBED_MIN_WIDTH}px`;
            dock.style.minHeight = '100px';
            break;
        case 'right':
            dock.style.right = `${padding}px`;
            dock.style.top = `${padding}px`;
            dock.style.bottom = `${padding}px`;
            dock.style.left = 'auto';
            dock.style.height = 'auto';
            dock.style.width = `${EMBED_DEFAULT_WIDTH}px`;
            dock.style.margin = '0';
            dock.style.minWidth = `${EMBED_MIN_WIDTH}px`;
            dock.style.minHeight = '100px';
            break;
    }
}

export function handleEmbeddedDragEnd(sys) {
    if (!sys.embeddedDrag) return;
    
    const { dock, parentDock, mode, currentZone, startWidth, startHeight } = sys.embeddedDrag;
    
    dock.classList.remove('dragging');
    
    if (mode === 'insert' && currentZone && currentZone !== 'floating') {
        dock.dataset.insertSide = currentZone;
        
        const parentContent = parentDock.querySelector('.dock-content');
        if (parentContent) {
            const parentRect = parentContent.getBoundingClientRect();
            updateEmbeddedDockForZone(dock, currentZone, parentRect);
        }
        
        rebuildEmbeddedDockUI(sys, dock);
        addEmbeddedResizeHandles(dock);
    } else if (mode === 'floating') {
        dock.style.width = `${startWidth}px`;
        dock.style.height = `${startHeight}px`;
    }
    
    hideEmbedDropIndicators(parentDock);
    sys.embeddedDrag = null;
}

export function addEmbeddedResizeHandles(embeddedDock) {
    embeddedDock.querySelectorAll('.embedded-resize-handle').forEach(h => h.remove());
    
    const mode = embeddedDock.dataset.embeddedMode;
    const insertSide = embeddedDock.dataset.insertSide;
    
    if (mode === 'insert' && insertSide) {
        if (insertSide === 'top') {
            const handle = document.createElement('div');
            handle.className = 'embedded-resize-handle embedded-h bottom';
            embeddedDock.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startEmbeddedResize(embeddedDock, e, 'height', 'bottom');
            });
        } else if (insertSide === 'bottom') {
            const handle = document.createElement('div');
            handle.className = 'embedded-resize-handle embedded-h top';
            embeddedDock.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startEmbeddedResize(embeddedDock, e, 'height', 'top');
            });
        } else if (insertSide === 'left') {
            const handle = document.createElement('div');
            handle.className = 'embedded-resize-handle embedded-v right';
            embeddedDock.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startEmbeddedResize(embeddedDock, e, 'width', 'right');
            });
        } else if (insertSide === 'right') {
            const handle = document.createElement('div');
            handle.className = 'embedded-resize-handle embedded-v left';
            embeddedDock.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startEmbeddedResize(embeddedDock, e, 'width', 'left');
            });
        }
    } else {
        ['top', 'bottom', 'left', 'right'].forEach(side => {
            const handle = document.createElement('div');
            handle.className = `embedded-resize-handle ${side === 'top' || side === 'bottom' ? 'embedded-h' : 'embedded-v'} ${side}`;
            embeddedDock.appendChild(handle);
            
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startEmbeddedResize(embeddedDock, e, 
                    side === 'top' || side === 'bottom' ? 'height' : 'width', side);
            });
        });
    }
}

function startEmbeddedResize(embeddedDock, e, dimension, side) {
    e.preventDefault();
    e.stopPropagation();
    
    const startSize = dimension === 'height' ? embeddedDock.offsetHeight : embeddedDock.offsetWidth;
    const startPos = dimension === 'height' ? e.clientY : e.clientX;
    
    const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        
        let delta;
        if (dimension === 'height') {
            if (side === 'top') {
                delta = startPos - moveEvent.clientY;
            } else {
                delta = moveEvent.clientY - startPos;
            }
        } else {
            if (side === 'left') {
                delta = startPos - moveEvent.clientX;
            } else {
                delta = moveEvent.clientX - startPos;
            }
        }
        
        const minSize = dimension === 'height' ? EMBED_MIN_HEIGHT : EMBED_MIN_WIDTH;
        const newSize = Math.max(minSize, startSize + delta);
        
        if (dimension === 'height') {
            embeddedDock.style.height = `${newSize}px`;
        } else {
            embeddedDock.style.width = `${newSize}px`;
        }
    };
    
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

export function beginEmbedDrag(sys, e, dock, panelIndex) {
    sys.dragMode = 'embed';
    sys.draggedDock = dock;
    sys.extractPanelIdx = panelIndex;
    dock.classList.add('dragging');
}

export function performEmbed(sys) {
    const { draggedDock: src, dropTarget: tgt, dropZone: zone, extractPanelIdx: pi } = sys;
    if (!src || !tgt || src === tgt) return;
    
    const position = zone === 'floating' ? 'floating' : 'insert';
    const insertSide = zone !== 'floating' ? zone : null;
    
    createEmbeddedDock(sys, tgt, src, pi, position, insertSide);
    
    if (pi !== null && src.panelData.length > 1) {
        src.panelData.splice(pi, 1);
        if (src.activePanelIndex >= src.panelData.length) {
            src.activePanelIndex = src.panelData.length - 1;
        } else if (src.activePanelIndex > pi) {
            src.activePanelIndex--;
        }
        rebuildDockUI(sys, src);
    } else {
        const oldParent = src.parentElement;
        src.remove();
        sys.docks = sys.docks.filter(d => d !== src);
        
        if (oldParent) {
            import('./placement.js').then(({ cleanupEmptyContainer }) => {
                cleanupEmptyContainer(sys, oldParent);
            });
        }
    }
    
    updateResizeHandles(sys);
    updateConnectionPoints(sys);
}

export function updateEmbeddedDocksPosition(sys) {
    sys.embeddedDocks.forEach(embeddedDock => {
        const parentDock = embeddedDock.closest('.dock');
        if (!parentDock) return;
        
        const parentContent = parentDock.querySelector('.dock-content');
        if (!parentContent) return;
        
        if (embeddedDock.dataset.embeddedMode === 'floating') {
            const left = parseInt(embeddedDock.style.left) || 0;
            const top = parseInt(embeddedDock.style.top) || 0;
            const dockWidth = embeddedDock.offsetWidth;
            const dockHeight = embeddedDock.offsetHeight;
            const parentWidth = parentContent.clientWidth;
            const parentHeight = parentContent.clientHeight;
            
            if (left + dockWidth > parentWidth) {
                embeddedDock.style.left = `${Math.max(0, parentWidth - dockWidth)}px`;
            }
            if (top + dockHeight > parentHeight) {
                embeddedDock.style.top = `${Math.max(0, parentHeight - dockHeight)}px`;
            }
        }
    });
}

function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
