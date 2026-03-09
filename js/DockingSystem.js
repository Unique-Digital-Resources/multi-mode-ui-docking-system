(function(global) {
    class DockingSystem {
        constructor(containerId, options = {}) {
            this.container     = document.getElementById(containerId);
            this.docks         = [];
            this.dockCounter   = 0;
            this.panelCounter  = 0;
            this.hoveredDock   = null;
            this.hintTimeout   = null;
            this.dragMode      = null;
            this.draggedDock   = null;
            this.extractPanelIdx = null;
            this.dropTarget    = null;
            this.dropZone      = null;
            this.resizing      = null;
            this.dragWithCtrl  = null;
            this.dragWithShift = null;
            this.init();
        }

        init() {
            DockManager.createDock(this, this.container);
            DockManager.createDock(this, this.container);
            DockManager.createDock(this, this.container);
            this.updateResizeHandles();
            this.updateConnectionPoints();

            document.addEventListener('mousemove', this.onMouseMove.bind(this));
            document.addEventListener('mouseup',   this.onMouseUp.bind(this));

            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Control' || e.repeat || !this.hoveredDock) return;
                const dock = this.hoveredDock;
                const hdr  = dock.querySelector(':scope > .dock-header');
                hdr?.classList.contains('visible')
                    ? this.hideDockHeaders(dock)
                    : this.showDockHeaders(dock);
            });

            window.addEventListener('blur', () => this.hideAllDockHeaders());
            this.container.addEventListener('mouseenter', () => this.showHint(), { once: true });
        }

        showHint() {
            let el = document.getElementById('ctrl-hint');
            if (!el) {
                el = document.createElement('div');
                el.id = 'ctrl-hint';
                el.innerHTML =
                    '<kbd>Ctrl</kbd> hover = controls &nbsp;|&nbsp; ' +
                    'Drag ☰ = move &nbsp;|&nbsp; ' +
                    '<kbd>Ctrl</kbd>+Drag = tab &nbsp;|&nbsp; ' +
                    '<kbd>Shift</kbd>+Drag = embed into dock';
                document.body.appendChild(el);
            }
            el.classList.add('show');
            clearTimeout(this.hintTimeout);
            this.hintTimeout = setTimeout(() => el.classList.remove('show'), 7000);
        }

        mkPanel(title, html) {
            return DockingUtils.mkPanel(title, html, this.panelCounter);
        }

        showDockHeaders(dock) {
            dock.querySelector(':scope > .dock-header')?.classList.add('visible');
            if (dock.panelData.length > 1) {
                dock.querySelector(':scope > .tabs-group-header')?.classList.add('visible');
                dock.querySelector(':scope > .dock-body > .dock-tabs-bar')?.classList.add('ctrl-hidden');
            }
        }

        hideDockHeaders(dock) {
            dock.querySelector(':scope > .dock-header')?.classList.remove('visible');
            dock.querySelector(':scope > .tabs-group-header')?.classList.remove('visible');
            dock.querySelector(':scope > .dock-body > .dock-tabs-bar')?.classList.remove('ctrl-hidden');
        }

        hideAllDockHeaders() {
            this.docks.forEach(d => this.hideDockHeaders(d));
        }

        setupDockEvents(dock) {
            /* Initialise embed layer for this dock */
            EmbedManager.initDock(this, dock);

            const hasTabs = dock.panelData.length > 1;

            dock.addEventListener('mouseenter', () => { this.hoveredDock = dock; });
            dock.addEventListener('mouseleave', () => {
                if (this.hoveredDock === dock) this.hoveredDock = null;
                this.hideDockHeaders(dock);
            });

            /* ── tabs-group-header Move button (only on tabbed docks) ──
               Plain drag  = move whole group as-is
               Ctrl+drag   = merge all panels as tabs into drop target
               Shift+drag  = embed into another dock's zone              */
            dock.querySelector('.tgh-move')?.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    EmbedManager.startEmbedDrag(this, dock, e);
                } else {
                    DragDrop.beginDrag(this, e, dock, 'move', null);
                }
            });
            dock.querySelector('.tgh-ungroup')?.addEventListener('click', () => {
                DockManager.ungroupTabs(this, dock);
            });

            /* ── dock-header Move button ──────────────────────────────────
               Single-panel dock  : plain drag moves the whole dock, all modes.
               Tabbed dock        : operates on the ACTIVE tab only.
                 Plain drag  = detach active tab → place anywhere incl. back onto
                               own tabbed dock (center=re-tab, directional=new sibling)
                 Ctrl+drag   = move active tab into another dock as a new tab
                 Shift+drag  = embed active panel's dock into a zone            */
            dock.querySelector('.dh-move')?.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const isTabbed = dock.panelData.length > 1;
                if (isTabbed) {
                    if (e.shiftKey) {
                        EmbedManager.startEmbedDrag(this, dock, e);
                    } else {
                        const capturedCtrl = e.ctrlKey || e.metaKey;
                        DragDrop.beginDrag(this, e, dock, capturedCtrl ? 'tab-move' : 'detach', dock.activePanelIndex);
                    }
                } else {
                    if (e.shiftKey) {
                        EmbedManager.startEmbedDrag(this, dock, e);
                    } else {
                        DragDrop.beginDrag(this, e, dock, 'move', null);
                    }
                }
            });
            dock.querySelector('.dh-remove')?.addEventListener('click', () => {
                if (hasTabs) {
                    PanelManager.removePanel(this, dock, dock.activePanelIndex);
                } else {
                    DockManager.removeDock(this, dock);
                }
            });

            /* ── tab drag (only on tabbed docks) ──
               Plain drag  = detach this tab into its own dock, place at drop zone
               Ctrl+drag   = move this tab into the drop target as a new tab
               Uses a 5 px threshold so a plain click still switches the tab.   */
            dock.querySelectorAll('.dock-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('tab-close')) {
                        PanelManager.activatePanel(this, dock, +tab.dataset.pi);
                    }
                });
                tab.querySelector('.tab-close')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    PanelManager.removePanel(this, dock, +tab.dataset.pi);
                });

                tab.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('tab-close')) return;
                    if (e.button !== 0) return;

                    const startX = e.clientX, startY = e.clientY;
                    const pi     = +tab.dataset.pi;
                    const capturedCtrl = e.ctrlKey || e.metaKey;
                    const sys    = this;
                    const THRESH = 5;

                    const onMove = (mv) => {
                        if (Math.abs(mv.clientX - startX) < THRESH &&
                            Math.abs(mv.clientY - startY) < THRESH) return;
                        /* Crossed threshold — commit to drag */
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup',   onUp);
                        mv.preventDefault();
                        PanelManager.activatePanel(sys, dock, pi);
                        const mode = capturedCtrl ? 'tab-move' : 'detach';
                        DragDrop.beginDrag(sys, e, dock, mode, pi);
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup',   onUp);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup',   onUp);
                });
            });
        }

        onMouseMove(e) {
            if (this.resizing) { ResizeManager.handleResize(this, e); return; }
            DragDrop.onMouseMove(this, e);
        }

        onMouseUp(e) {
            if (this.resizing) { ResizeManager.endResize(this); return; }
            DragDrop.onMouseUp(this, e);
        }

        updateResizeHandles()    { ResizeManager.updateResizeHandles(this); }
        updateConnectionPoints() { ConnectionPoints.updateConnectionPoints(this); }

        addDock(panels, tabsPos) { return DockManager.createDock(this, this.container, panels, tabsPos); }
        getDocks()               { return this.docks; }

        destroy() {
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup',   this.onMouseUp);
            this.container.innerHTML = '';
            this.docks = [];
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DockingSystem;
    } else {
        global.DockingSystem = DockingSystem;
    }
})(typeof window !== 'undefined' ? window : this);