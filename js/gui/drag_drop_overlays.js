/* ═══════════════════════════════════════════════════════════════
   gui/drag_drop_overlays.js — Drop overlays with parenting modes
   GUI knows commands (via ctx.dispatch); commands don't know GUI.
═══════════════════════════════════════════════════════════════ */

/** Zone labels per mode */
const ZONE_LABELS = {
  insert: { top: 'Top',      bottom: 'Bottom',   left: 'Left',    right: 'Right',   center: 'Swap'  },
  tab:    { top: 'Tab ↑',    bottom: 'Tab ↓',    left: 'Tab ←',   right: 'Tab →',   center: 'Tab'   },
  embed:  { top: 'Embed ↑',  bottom: 'Embed ↓',  left: 'Embed ←', right: 'Embed →', center: 'Float' },
};

/**
 * buildOverlay(forId, ctx) — Creates and returns a drop-overlay element.
 *
 * The overlay lives inside the dock element it covers. Its `data-for`
 * attribute identifies which tree node is the drop target.
 */
function buildOverlay(forId, ctx) {
  const ov = document.createElement('div');
  ov.className   = 'lc-drop-overlay';
  ov.dataset.for = forId;
  ov.innerHTML = `
    <div class="dz-corner"></div>
    <div class="lc-dz dz-top"    data-zone="top">   <div class="dz-inner"><span class="dz-lbl">Top</span></div></div>
    <div class="dz-corner"></div>
    <div class="lc-dz dz-left"   data-zone="left">  <div class="dz-inner"><span class="dz-lbl">Left</span></div></div>
    <div class="lc-dz dz-center" data-zone="center"><div class="dz-inner"><span class="dz-lbl">Swap</span></div></div>
    <div class="lc-dz dz-right"  data-zone="right"> <div class="dz-inner"><span class="dz-lbl">Right</span></div></div>
    <div class="dz-corner"></div>
    <div class="lc-dz dz-bottom" data-zone="bottom"><div class="dz-inner"><span class="dz-lbl">Bottom</span></div></div>
    <div class="dz-corner"></div>`;

  // Prevent drops falling through gaps in the overlay grid
  ov.addEventListener('dragover',  e => e.preventDefault());
  ov.addEventListener('dragenter', e => e.preventDefault());

  ov.querySelectorAll('.lc-dz').forEach(zone => {
    zone.addEventListener('dragenter', e => {
      e.preventDefault();
      ov.querySelectorAll('.lc-dz').forEach(z => z.classList.remove('drag-over'));
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragover',  e => e.preventDefault());
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const { srcId, mode } = ctx.dragState;
      if (srcId) {
        ctx.dispatch({
          type:   'DROP',
          srcId,
          tgtId:  forId,
          zone:   zone.dataset.zone,
          mode,
        });
      }
    });
  });

  return ov;
}

/**
 * syncOverlays(visible, mode, exceptId) — Show / hide all overlays.
 *
 * Called after SHOW_OVERLAYS / HIDE_OVERLAYS dispatch, and after re-render
 * when a drag is in progress.
 *
 * @param {boolean} visible
 * @param {string}  mode      - 'insert' | 'tab' | 'embed'
 * @param {string}  [exceptId] - data-for value to keep hidden (the dragged node)
 */
function syncOverlays(visible, mode = 'insert', exceptId = null) {
  const labels = ZONE_LABELS[mode] || ZONE_LABELS.insert;

  document.querySelectorAll('.lc-drop-overlay').forEach(ov => {
    const show = visible && ov.dataset.for !== exceptId;
    ov.classList.toggle('active', show);
    ov.dataset.mode = mode;

    if (show) {
      ov.querySelectorAll('.lc-dz').forEach(z => {
        const lbl = z.querySelector('.dz-lbl');
        if (lbl) lbl.textContent = labels[z.dataset.zone] ?? z.dataset.zone;
      });
    } else {
      ov.querySelectorAll('.lc-dz').forEach(z => z.classList.remove('drag-over'));
    }
  });
}
