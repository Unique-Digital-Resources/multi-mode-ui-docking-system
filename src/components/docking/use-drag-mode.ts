"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/lib/app/store";
import type { DockId, DockNode, DragMode } from "@/lib/domain-foundation/docking";
import { find } from "@/lib/domain-foundation/docking/model";
import { can } from "@/lib/domain-foundation/docking";
import { computeExcludeIds } from "./DropOverlay";

/**
 * Live drag-mode tracking hook (port of js/gui/kbd_shortcuts.js mode logic).
 *   default = insert (green)
 *   Ctrl    = tab    (blue)
 *   Shift   = embed  (orange)
 *
 * The mode is CLAMPED by the source dock's capabilities:
 *   !tabbable  → Ctrl won't switch to tab mode (stays insert)
 *   !embeddable → Shift won't switch to embed mode (stays insert)
 *
 * During an active HTML5 drag, Chrome does NOT reliably deliver keydown/keyup
 * to the page, so `liveShift`/`liveCtrl` would stay stale. The ORIGINAL JS
 * system solves this by listening to `document.dragover` — which fires
 * continuously during drag AND carries reliable modifier state (shiftKey /
 * ctrlKey). We mirror that here: the dragover listener is the primary source
 * of mode changes mid-drag, with the keydown listener + RAF poll as fallbacks.
 */
function modeFromMods(shift: boolean, ctrl: boolean, srcNode?: DockNode | null): DragMode {
  if (shift && can(srcNode, "embeddable")) return "embed";
  if (ctrl && can(srcNode, "tabbable")) return "tab";
  return "insert";
}

export function useDragMode() {
  const drag = useAppStore((s) => s.drag);
  const setDrag = useAppStore((s) => s.setDrag);
  const liveShift = useRef(false);
  const liveCtrl = useRef(false);
  const rafId = useRef<number | null>(null);

  // global keydown / keyup / blur (fallback — browsers may not fire these
  // during an active HTML5 drag)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      liveShift.current = e.shiftKey;
      liveCtrl.current = e.ctrlKey || e.metaKey;
      if (drag.active) {
        const st = useAppStore.getState();
        const srcNode = st.drag.srcId ? find(st.layout, st.drag.srcId)?.node : null;
        setDrag({ mode: modeFromMods(liveShift.current, liveCtrl.current, srcNode) });
      }
    };
    const onBlur = () => {
      liveShift.current = false;
      liveCtrl.current = false;
      if (drag.active) setDrag({ mode: "insert" });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [drag.active, setDrag]);

  // PRIMARY mode tracker: dragover fires continuously during HTML5 drag and
  // carries reliable shiftKey/ctrlKey state (unlike keydown). This is how the
  // original JS system tracks live mode switches.
  useEffect(() => {
    if (!drag.active) return;
    const onDragOver = (e: DragEvent) => {
      liveShift.current = e.shiftKey;
      liveCtrl.current = e.ctrlKey || e.metaKey;
      const st = useAppStore.getState();
      const srcNode = st.drag.srcId ? find(st.layout, st.drag.srcId)?.node : null;
      const m = modeFromMods(liveShift.current, liveCtrl.current, srcNode);
      if (m !== st.drag.mode) st.setDrag({ mode: m });
    };
    document.addEventListener("dragover", onDragOver);
    return () => document.removeEventListener("dragover", onDragOver);
  }, [drag.active]);

  // RAF poll during drag (extra fallback for edge cases where dragover isn't
  // firing, e.g. dragging outside the viewport)
  useEffect(() => {
    if (!drag.active) return;
    const poll = () => {
      const st = useAppStore.getState();
      const srcNode = st.drag.srcId ? find(st.layout, st.drag.srcId)?.node : null;
      const m = modeFromMods(liveShift.current, liveCtrl.current, srcNode);
      if (m !== st.drag.mode) st.setDrag({ mode: m });
      rafId.current = requestAnimationFrame(poll);
    };
    rafId.current = requestAnimationFrame(poll);
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [drag.active]);
}

/**
 * Pending focus rAF — scheduled on mousedown, cancelled on dragstart.
 * This prevents the setFocused re-render from firing between mousedown and
 * dragstart (which would cancel the HTML5 drag).
 */
let pendingFocusRaf: number | null = null;

export function scheduleFocus(cb: () => void): void {
  if (pendingFocusRaf != null) cancelAnimationFrame(pendingFocusRaf);
  pendingFocusRaf = requestAnimationFrame(() => {
    pendingFocusRaf = null;
    cb();
  });
}

export function cancelPendingFocus(): void {
  if (pendingFocusRaf != null) {
    cancelAnimationFrame(pendingFocusRaf);
    pendingFocusRaf = null;
  }
}

/**
 * Begin an HTML5 drag for a dock header.
 * Sets dragState + dims the source element + computes exclude ids.
 */
export function useDragSource() {
  const setDrag = useAppStore((s) => s.setDrag);
  const layout = useAppStore((s) => s.layout);

  return useCallback(
    (e: React.DragEvent, srcId: DockId) => {
      // cancel any pending focus update from mousedown — this prevents the
      // setFocused re-render from firing between mousedown and dragstart,
      // which would cancel the HTML5 drag (especially for embedded docks)
      cancelPendingFocus();
      e.dataTransfer.setData("text/plain", srcId);
      e.dataTransfer.effectAllowed = "move";
      const srcNode = find(layout, srcId)?.node;
      const mode = modeFromMods(e.shiftKey, e.ctrlKey || e.metaKey, srcNode);
      const exceptIds = computeExcludeIds(layout, srcId);
      // CRITICAL: setDrag MUST be deferred to requestAnimationFrame —
      // Zustand v5's useSyncExternalStore triggers a synchronous re-render
      // during dragstart that cancels HTML5 drags (especially for embedded
      // docks and tabs groups).
      requestAnimationFrame(() => {
        setDrag({ active: true, srcId, exceptIds, mode });
      });
      // dim the source in the next frame (so the browser ghost is captured first)
      const target = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => {
        const wrapper = target.closest(".embed-float, [data-dock-wrapper]");
        if (wrapper) wrapper.classList.add("dragging-src");
      });
    },
    [setDrag, layout],
  );
}

/** End a drag — restore opacity + clear drag state. */
export function useDragEnd() {
  const setDrag = useAppStore((s) => s.setDrag);
  return useCallback(
    (e: React.DragEvent) => {
      const target = e.currentTarget as HTMLElement;
      const wrapper = target.closest("[data-dock-wrapper]");
      if (wrapper) wrapper.classList.remove("dragging-src");
      // also clear any stale opacity on other wrappers
      document
        .querySelectorAll(".dragging-src")
        .forEach((el) => el.classList.remove("dragging-src"));
      setDrag({ active: false, srcId: null, exceptIds: new Set(), mode: "insert" });
    },
    [setDrag],
  );
}

/** Global dragover (allow drop) + fallback drop (reset if outside a zone). */
export function useGlobalDragHandlers() {
  const setDrag = useAppStore((s) => s.setDrag);
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault(); // allow drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const onDrop = (e: DragEvent) => {
      // if we land outside any registered zone, reset drag state
      e.preventDefault();
      setDrag({ active: false, srcId: null, exceptIds: new Set(), mode: "insert" });
      document
        .querySelectorAll(".dragging-src")
        .forEach((el) => el.classList.remove("dragging-src"));
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [setDrag]);
}

/**
 * Sticky peek-header reveal (port of js/gui/kbd_shortcuts.js peek logic).
 *   Ctrl  + hover panel    → reveal panel header
 *   Shift + hover container/tabs/embed → reveal its header
 * Sticky until the cursor leaves the element (NOT until key release).
 */
export function usePeekHeader() {
  const peekedId = useAppStore((s) => s.peekedId);
  const setPeeked = useAppStore((s) => s.setPeeked);
  const drag = useAppStore((s) => s.drag);
  const liveShift = useRef(false);
  const liveCtrl = useRef(false);
  const lastEl = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastEl.current = e.target as HTMLElement;
      if (drag.active) {
        if (peekedId) setPeeked(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (liveCtrl.current) {
        const panel = target.closest<HTMLElement>("[data-dock-wrapper][data-peek-kind='panel']");
        if (panel && panel.dataset.id !== peekedId) setPeeked(panel.dataset.id ?? null);
      } else if (liveShift.current) {
        const group = target.closest<HTMLElement>(
          "[data-dock-wrapper][data-peek-kind='group'], [data-dock-wrapper][data-peek-kind='tabs'], [data-dock-wrapper][data-peek-kind='embed']",
        );
        if (group && group.dataset.id !== peekedId) setPeeked(group.dataset.id ?? null);
      } else if (peekedId) {
        // clear peek if the cursor left the peeked element
        const peekedEl = document.querySelector(`[data-id='${CSS.escape(peekedId)}']`);
        if (peekedEl && !peekedEl.contains(target)) setPeeked(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      liveShift.current = e.shiftKey;
      liveCtrl.current = e.ctrlKey || e.metaKey;
      if (!liveShift.current && !liveCtrl.current && peekedId) {
        // keep sticky until mouse leaves — don't clear here
      }
    };
    const onBlur = () => {
      liveShift.current = false;
      liveCtrl.current = false;
      if (peekedId) setPeeked(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [drag.active, peekedId, setPeeked]);
}
