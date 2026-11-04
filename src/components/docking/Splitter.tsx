"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/app/store";
import { getEngine } from "@/lib/app/store";
import type { DockId } from "@/lib/domain-foundation/docking";
import { can } from "@/lib/domain-foundation/docking";

/**
 * Layout splitter between two row/col siblings.
 * Uses absolute-delta math (snapshot at mousedown, never cumulative) so there
 * is no drift. Mirrors `makeSplitter` in js/renderer.js. Updates both the DOM
 * (inline flexGrow) and the data model via a direct mutation + sync.
 */
export function Splitter({
  orientation,
  containerId,
  prevIdx,
  nextIdx,
}: {
  orientation: "vertical" | "horizontal";
  containerId: DockId;
  prevIdx: number;
  nextIdx: number;
}) {
  const startRef = useRef<{ pos: number; prevSize: number; nextSize: number } | null>(null);
  const { domain } = getEngine();
  const syncFromEngine = useAppStore((s) => s.syncFromEngine);

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const splitter = e.currentTarget as HTMLElement;
      const container = splitter.parentElement;
      if (!container) return;
      const prev = container.children[prevIdx * 2] as HTMLElement; // children interleaved with splitters
      const next = container.children[nextIdx * 2] as HTMLElement;
      // find prev/next dock wrapper elements (skip text nodes)
      const wrappers = Array.from(container.children).filter(
        (c) => (c as HTMLElement).dataset.dockWrapper === "true",
      ) as HTMLElement[];
      const prevEl = wrappers[prevIdx];
      const nextEl = wrappers[nextIdx];
      if (!prevEl || !nextEl) return;
      // if either adjacent dock is collapsed, the splitter is inert — the
      // collapsed dock has a fixed 34px size (flex: 0 0 34px !important) so
      // resizing it has no effect and only cascades weirdly to other docks
      const prevCollapsed = prevEl.classList.contains("col-h") || prevEl.classList.contains("col-v");
      const nextCollapsed = nextEl.classList.contains("col-h") || nextEl.classList.contains("col-v");
      if (prevCollapsed || nextCollapsed) return;
      // if either adjacent dock is not resizable (capability flag), the
      // splitter is inert — can't resize a locked dock
      const layout = domain.dockingLayout;
      const containerNode = findContainer(layout.root, containerId);
      const prevNode = containerNode && (containerNode.type === "row" || containerNode.type === "col" || containerNode.type === "tabs") ? containerNode.children[prevIdx] : null;
      const nextNode = containerNode && (containerNode.type === "row" || containerNode.type === "col" || containerNode.type === "tabs") ? containerNode.children[nextIdx] : null;
      if (!can(prevNode, "resizable") || !can(nextNode, "resizable")) return;
      const isRow = orientation === "vertical";
      const startPos = isRow ? e.clientX : e.clientY;
      // NORMALIZE all siblings' flexGrow to their current pixel sizes BEFORE
      // the drag starts. Without this, siblings with the default flexGrow=1
      // get squeezed to near-zero when the two resized docks receive large
      // pixel-based flexGrow values (e.g., 60 + 868 vs 1 → the 1 gets ~0.1%).
      // After normalization, all siblings have consistent pixel-based values
      // so the proportional distribution keeps non-adjacent docks stable.
      //
      // CRITICAL: batch-read ALL offsetWidth values FIRST, then batch-write.
      // Reading offsetWidth after setting a previous element's flexGrow forces
      // a synchronous reflow (layout thrashing) and returns wrong sizes.
      const allWrappers = Array.from(container.children).filter(
        (c) => (c as HTMLElement).dataset.dockWrapper === "true",
      ) as HTMLElement[];
      const allSizes = allWrappers.map((w) => isRow ? w.offsetWidth : w.offsetHeight);
      allWrappers.forEach((wrapper, i) => {
        wrapper.style.flexGrow = String(allSizes[i]);
        const wid = wrapper.dataset.id;
        if (wid) {
          const wnode = findContainer(layout.root, wid);
          if (wnode) wnode.flexGrow = allSizes[i];
        }
      });
      const prevSize = isRow ? prevEl.offsetWidth : prevEl.offsetHeight;
      const nextSize = isRow ? nextEl.offsetWidth : nextEl.offsetHeight;
      startRef.current = { pos: startPos, prevSize, nextSize };
      splitter.classList.add("resizing");
      document.body.style.cursor = isRow ? "ew-resize" : "ns-resize";

      const onMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const totalD = (isRow ? ev.clientX : ev.clientY) - startRef.current.pos;
        // Keep the total flexGrow constant (prevSize + nextSize) so the flex
        // container doesn't redistribute excess to OTHER siblings — which would
        // resize non-adjacent docks (including non-resizable ones) when one
        // dock reaches its minimum.
        const totalSize = startRef.current.prevSize + startRef.current.nextSize;
        // Use the dock's actual declared min sizes (minW for row, minH for col)
        const prevMin = isRow ? (prevNode?.minW ?? 20) : (prevNode?.minH ?? 20);
        const nextMin = isRow ? (nextNode?.minW ?? 20) : (nextNode?.minH ?? 20);
        // Clamp prev to [prevMin, totalSize - nextMin]; next = totalSize - prev.
        // When prev hits its min, next stops growing (total is constant) → the
        // resize effectively STOPS instead of cascading.
        const maxPrev = Math.max(prevMin, totalSize - nextMin);
        const newPrev = Math.max(prevMin, Math.min(maxPrev, startRef.current.prevSize + totalD));
        const newNext = totalSize - newPrev;
        prevEl.style.flexGrow = String(newPrev);
        nextEl.style.flexGrow = String(newNext);
        // mirror to data model so re-renders preserve proportions
        const layout = domain.dockingLayout;
        const found = findContainer(layout.root, containerId);
        if (found && (found.type === "row" || found.type === "col" || found.type === "tabs")) {
          if (found.children[prevIdx]) found.children[prevIdx].flexGrow = newPrev;
          if (found.children[nextIdx]) found.children[nextIdx].flexGrow = newNext;
        }
        // notify connection dots to reposition in real-time
        window.dispatchEvent(new CustomEvent("dock:layout-move"));
      };
      const onUp = () => {
        splitter.classList.remove("resizing");
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        syncFromEngine();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [orientation, prevIdx, nextIdx, containerId, domain, syncFromEngine],
  );

  return (
    <div
      className={`lc-splitter ${orientation}`}
      onMouseDown={onDown}
      aria-hidden
    />
  );
}

function findContainer(
  root: import("@/lib/domain-foundation/docking").DockNode,
  id: DockId,
): import("@/lib/domain-foundation/docking").DockNode | null {
  if (root.id === id) return root;
  switch (root.type) {
    case "panel": return null;
    case "row":
    case "col":
    case "tabs":
      for (const c of root.children) { const r = findContainer(c, id); if (r) return r; }
      return null;
    case "embed":
      for (const z of Object.values(root.zones)) if (z) { const r = findContainer(z, id); if (r) return r; }
      for (const f of root.floats) { const r = findContainer(f.node, id); if (r) return r; }
      return null;
  }
}

/**
 * Connection dots — render at every intersection of `.lc-splitter` elements.
 * Dragging a dot resizes all linked splitters together (60px min clamp).
 * Port of js/connections.js (active system).
 */
export function ConnectionDots() {
  const rev = useAppStore((s) => s.rev);
  const settings = getEngine().registries.settings;
  const enabled = settings.get("ui.show_connection_dots", true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!containerRef.current) return;
    const layer = containerRef.current;
    const compute = () => {
      // clear previous dots
      layer.innerHTML = "";
      const splitters = Array.from(document.querySelectorAll<HTMLElement>(".lc-splitter"));
      const vertical = splitters.filter((s) => s.classList.contains("vertical"));
      const horizontal = splitters.filter((s) => s.classList.contains("horizontal"));
      type Junction = { x: number; y: number; splitters: HTMLElement[] };
      const junctions = new Map<string, Junction>();

      const addJunction = (x: number, y: number, el: HTMLElement) => {
        const key = `${Math.round(x)},${Math.round(y)}`;
        const j = junctions.get(key) ?? { x, y, splitters: [] };
        if (!j.splitters.includes(el)) j.splitters.push(el);
        junctions.set(key, j);
      };

      // Helper: center of a rect
      const cx = (r: DOMRect) => r.left + r.width / 2;
      const cy = (r: DOMRect) => r.top + r.height / 2;
      const TOL = 6;

      // h × v cross / T-junction — the dot sits at the intersection center
      for (const v of vertical) {
        for (const h of horizontal) {
          const vr = v.getBoundingClientRect();
          const hr = h.getBoundingClientRect();
          // vertical splitter's center x within horizontal's x-span (±tol)
          const xInRange = cx(vr) >= hr.left - TOL && cx(vr) <= hr.right + TOL;
          // horizontal splitter's center y within vertical's y-span (±tol)
          // (covers both full crosses and T-junctions where v ends at h)
          const yInRange = cy(hr) >= vr.top - TOL && cy(hr) <= vr.bottom + TOL;
          if (xInRange && yInRange) {
            // junction at the exact center of the intersection
            addJunction(cx(vr), cy(hr), v);
            addJunction(cx(vr), cy(hr), h);
          }
        }
      }
      // v-v end-to-end (same center x, one's bottom meets other's top)
      for (let i = 0; i < vertical.length; i++) {
        for (let j = i + 1; j < vertical.length; j++) {
          const a = vertical[i].getBoundingClientRect();
          const b = vertical[j].getBoundingClientRect();
          if (Math.abs(cx(a) - cx(b)) <= TOL) {
            // a's bottom near b's top, or b's bottom near a's top
            const ab = Math.abs(a.bottom - b.top);
            const ba = Math.abs(b.bottom - a.top);
            if (ab <= TOL) {
              const my = (a.bottom + b.top) / 2;
              addJunction(cx(a), my, vertical[i]);
              addJunction(cx(b), my, vertical[j]);
            } else if (ba <= TOL) {
              const my = (b.bottom + a.top) / 2;
              addJunction(cx(a), my, vertical[i]);
              addJunction(cx(b), my, vertical[j]);
            }
          }
        }
      }
      // h-h end-to-end (same center y, one's right meets other's left)
      for (let i = 0; i < horizontal.length; i++) {
        for (let j = i + 1; j < horizontal.length; j++) {
          const a = horizontal[i].getBoundingClientRect();
          const b = horizontal[j].getBoundingClientRect();
          if (Math.abs(cy(a) - cy(b)) <= TOL) {
            const ar = Math.abs(a.right - b.left);
            const ra = Math.abs(b.right - a.left);
            if (ar <= TOL) {
              const mx = (a.right + b.left) / 2;
              addJunction(mx, cy(a), horizontal[i]);
              addJunction(mx, cy(b), horizontal[j]);
            } else if (ra <= TOL) {
              const mx = (b.right + a.left) / 2;
              addJunction(mx, cy(a), horizontal[i]);
              addJunction(mx, cy(b), horizontal[j]);
            }
          }
        }
      }

      for (const j of junctions.values()) {
        if (j.splitters.length < 2) continue;
        const dot = document.createElement("div");
        dot.className = "conn-dot";
        dot.style.left = `${j.x}px`;
        dot.style.top = `${j.y}px`;
        // dots must capture pointer events even though the layer is pointer-events:none
        dot.style.pointerEvents = "auto";
        const hasV = j.splitters.some((s) => s.classList.contains("vertical"));
        const hasH = j.splitters.some((s) => s.classList.contains("horizontal"));
        dot.style.cursor = hasV && hasH ? "move" : hasV ? "ew-resize" : "ns-resize";
        dot.title = "Drag to resize all connected splitters";
        dot.addEventListener("mousedown", (e) => startConnDrag(e, j.splitters));
        layer.appendChild(dot);
      }
    };
    // defer to next frame so layout is settled before measuring
    const raf = requestAnimationFrame(compute);
    const onResize = () => requestAnimationFrame(compute);
    // recompute dot positions in real-time as splitters are dragged
    // (the intersection point moves when flexGrow changes mid-drag)
    const onLayoutMove = () => requestAnimationFrame(compute);
    window.addEventListener("resize", onResize);
    window.addEventListener("dock:layout-move", onLayoutMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("dock:layout-move", onLayoutMove);
    };
  }, [rev, enabled]);

  return <div ref={containerRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50 }} />;
}

function startConnDrag(e: MouseEvent, splitters: HTMLElement[]) {
  e.preventDefault();
  e.stopPropagation();
  // capture the dot element now — e.currentTarget is nulled after the event
  // handler returns, so it can't be read in the later onUp callback.
  const dot = e.currentTarget as HTMLElement;
  dot.classList.add("dragging");
  // NORMALIZE all siblings in each affected container to pixel-based flexGrow
  // BEFORE the drag starts — same reason as the Splitter: without this, siblings
  // with default flexGrow=1 get squeezed when resized docks get large values.
  // Batch-read ALL sizes first, then batch-write (avoids layout thrashing).
  const { domain: initDomain } = getEngineRef();
  const normalizedContainers = new Set<HTMLElement>();
  for (const s of splitters) {
    const container = s.parentElement!;
    if (normalizedContainers.has(container)) continue;
    normalizedContainers.add(container);
    const isRow = s.classList.contains("vertical");
    const wrappers = Array.from(container.children).filter(
      (c) => (c as HTMLElement).dataset.dockWrapper === "true",
    ) as HTMLElement[];
    const sizes = wrappers.map((w) => isRow ? w.offsetWidth : w.offsetHeight);
    wrappers.forEach((wrapper, i) => {
      wrapper.style.flexGrow = String(sizes[i]);
      const wid = wrapper.dataset.id;
      if (wid) {
        const wnode = findContainer(initDomain.dockingLayout.root, wid);
        if (wnode) wnode.flexGrow = sizes[i];
      }
    });
  }
  const init = splitters.map((s) => {
    const container = s.parentElement!;
    const wrappers = Array.from(container.children).filter(
      (c) => (c as HTMLElement).dataset.dockWrapper === "true",
    ) as HTMLElement[];
    const idx = Array.from(container.children).indexOf(s);
    // wrappers are at even indices interleaved with splitters
    const prevIdx = Math.floor(idx / 2);
    const nextIdx = prevIdx + 1;
    const prevEl = wrappers[prevIdx];
    const nextEl = wrappers[nextIdx];
    const isRow = s.classList.contains("vertical");
    // Look up dock nodes from the domain layout for actual min sizes + the
    // resizable capability check. Non-resizable docks are skipped entirely.
    const prevId = prevEl?.dataset.id;
    const nextId = nextEl?.dataset.id;
    const { domain } = getEngineRef();
    const prevNode = prevId ? findContainer(domain.dockingLayout.root, prevId) : null;
    const nextNode = nextId ? findContainer(domain.dockingLayout.root, nextId) : null;
    if (!can(prevNode, "resizable") || !can(nextNode, "resizable")) return null;
    const prevMin = isRow ? (prevNode?.minW ?? 20) : (prevNode?.minH ?? 20);
    const nextMin = isRow ? (nextNode?.minW ?? 20) : (nextNode?.minH ?? 20);
    return {
      s,
      prevEl,
      nextEl,
      isRow,
      pW: isRow ? prevEl.offsetWidth : prevEl.offsetHeight,
      nW: isRow ? nextEl.offsetWidth : nextEl.offsetHeight,
      prevMin,
      nextMin,
      prevId,
      nextId,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  const startX = e.clientX;
  const startY = e.clientY;
  const onMove = (ev: MouseEvent) => {
    for (const it of init) {
      if (!it.prevEl || !it.nextEl) continue;
      const totalD = it.isRow ? ev.clientX - startX : ev.clientY - startY;
      // Clamp delta so neither dock goes below its ACTUAL minimum (not a
      // hardcoded 60px). newP + newN = pW + nW (total constant → no cascade).
      const clamped = Math.max(it.prevMin - it.pW, Math.min(totalD, it.nW - it.nextMin));
      const newP = it.pW + clamped;
      const newN = it.nW - clamped;
      it.prevEl.style.flexGrow = String(newP);
      it.nextEl.style.flexGrow = String(newN);
      // mirror to data model so re-renders preserve proportions
      if (it.prevId) updateNodeFlexGrow(it.prevId, newP);
      if (it.nextId) updateNodeFlexGrow(it.nextId, newN);
    }
    // notify connection dots to reposition in real-time (the intersection
    // point moves as splitters are dragged)
    window.dispatchEvent(new CustomEvent("dock:layout-move"));
  };
  const onUp = () => {
    dot.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    // sync the store so rev bumps and the layout snapshot updates
    syncFromEngineStore();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

/** Update a dock node's flexGrow in the domain layout by id. */
function updateNodeFlexGrow(id: string, flexGrow: number): void {
  const { domain } = getEngineRef();
  const found = findContainer(domain.dockingLayout.root, id);
  if (found) found.flexGrow = flexGrow;
}

/** Access the store's syncFromEngine without importing the full store module
 *  (avoids a circular import). */
function getEngineRef() {
  return { domain: (window as unknown as { __engine?: { domain: import("@/lib/domain-engine").DomainEngine } }).__engine!.domain };
}
function syncFromEngineStore(): void {
  // use the Zustand store's getState to call syncFromEngine
  const store = (window as unknown as { __appStore?: { getState: () => { syncFromEngine: () => void } } }).__appStore;
  if (store) store.getState().syncFromEngine();
}
