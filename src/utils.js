const DockingUtils = {
    esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },

    mkPanel(title, html, panelCounter) {
        return { id: `p-${++panelCounter}`, title, contentHTML: html };
    },

    isDockOrWrapper(el) {
        return el.classList.contains('dock') ||
               el.classList.contains('dock-row') ||
               el.classList.contains('dock-column');
    },

    getChildren(container) {
        return Array.from(container.children).filter(c =>
            c.classList.contains('dock') ||
            c.classList.contains('dock-row') ||
            c.classList.contains('dock-column')
        );
    },

    // Embedded dock zone constants
    EMBED_DEF_H: 180,
    EMBED_DEF_V: 220,
    EMBED_MIN_Z: 50,
    EMBED_SNAP:  120,
    EMBED_PAD:   5
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DockingUtils;
}