const DOMBuilder = {
    buildDockHTML(dock) {
        const panels = dock.panelData;
        const ai = Math.min(dock.activePanelIndex ?? 0, panels.length - 1);
        const hasTabs = panels.length > 1;
        const esc = DockingUtils.esc;

        const groupHdr = hasTabs ? `
        <div class="tabs-group-header">
            <span class="tgh-label">${panels.length} tabs</span>
            <div class="tgh-controls">
                <button class="tgh-btn tgh-move" title="Drag=move · Ctrl+Drag=tab · Shift+Drag=embed into dock">☰ Move</button>
                <button class="tgh-btn tgh-ungroup" title="Split all tabs into individual docks">⊟ Ungroup</button>
            </div>
        </div>` : '';

        const tabsBar = hasTabs ? `
        <div class="dock-tabs-bar">
            ${panels.map((p, i) => `
            <div class="dock-tab ${i===ai?'active':''}" data-pi="${i}">
                <span class="tab-title">${esc(p.title)}</span>
                <button class="tab-close" title="Close tab">×</button>
            </div>`).join('')}
        </div>` : '';

        const panelsHTML = panels.map((p, i) => `
        <div class="dock-panel ${i===ai?'active':''}" data-pi="${i}">
            ${p.contentHTML}
        </div>`).join('');

        return `
            ${groupHdr}
            <div class="dock-header">
                <span class="dock-title">${esc(panels[ai].title)}</span>
                <div class="dock-controls">
                    <button class="dc-btn dh-move" title="${hasTabs ? 'Drag=detach active tab · Ctrl+Drag=move tab into dock · Shift+Drag=embed' : 'Drag=move · Ctrl+Drag=tab into dock · Shift+Drag=embed'}">☰</button>
                    <button class="dc-btn dh-remove" title="Remove ${hasTabs ? 'this tab' : 'this dock'}">✕</button>
                </div>
            </div>
            <div class="dock-body">
                ${tabsBar}
                <div class="dock-main">
                    <div class="dock-content">${panelsHTML}</div>
                </div>
            </div>
            <div class="drop-indicator top"></div>
            <div class="drop-indicator bottom"></div>
            <div class="drop-indicator left"></div>
            <div class="drop-indicator right"></div>
            <div class="drop-indicator center"></div>
        `;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMBuilder;
}