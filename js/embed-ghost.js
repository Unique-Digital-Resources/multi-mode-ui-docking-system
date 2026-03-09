/* ═══════════════════════════════════════════════════════
   EmbedGhost — drag ghost label element + _dockAt utility
═══════════════════════════════════════════════════════ */

const EmbedGhost = {

  _showGhost(label) {
    let g = document.getElementById('embed-ghost');
    if (!g) {
      g = document.createElement('div');
      g.id = 'embed-ghost';
      document.body.appendChild(g);
    }
    g.textContent = label;
    g.style.display = 'block';
  },

  _hideGhost() {
    const g = document.getElementById('embed-ghost');
    if (g) g.style.display = 'none';
  },

  _moveGhost(e) {
    const g = document.getElementById('embed-ghost');
    if (g) {
      g.style.left = (e.clientX + 12) + 'px';
      g.style.top  = (e.clientY - 10) + 'px';
    }
  },

  /* Return the topmost .dock element under the given point (excluding sentinels) */
  _dockAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    return els.find(el =>
      el.classList.contains('dock') &&
      !el.classList.contains('ec-ejected-drag')
    ) || null;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmbedGhost;
}
