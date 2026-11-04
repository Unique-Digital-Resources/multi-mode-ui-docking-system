"use client";

import { useAppStore } from "@/lib/app/store";
import { executeCommand } from "@/lib/app/store";
import { useDragSource, useDragEnd } from "./use-drag-mode";
import { ContentIcon } from "./icons";
import type { DockId } from "@/lib/domain-foundation/docking";
import type {
  PanelNode,
  RowNode,
  ColNode,
  TabsNode,
  EmbedNode,
} from "@/lib/domain-foundation/docking";

/**
 * Dock headers (port of js/gui/dock_header.js).
 * Each header is `draggable="true"`; the drag source wires dragState via
 * useDragSource. Headers are hidden by default and revealed by the
 * `.peek-header` class (set on the wrapper when peekedId matches).
 */

function CmdBtn({
  role,
  onClick,
  children,
  danger,
}: {
  role: "collapse" | "close";
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      className={`cmd-btn ${danger ? "danger" : ""}`}
      data-role={role}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

const GRIP = (
  <svg width="14" height="10" viewBox="0 0 14 10" className="panel-grip" aria-hidden>
    <circle cx="2" cy="2" r="1.2" fill="currentColor" />
    <circle cx="7" cy="2" r="1.2" fill="currentColor" />
    <circle cx="12" cy="2" r="1.2" fill="currentColor" />
    <circle cx="2" cy="8" r="1.2" fill="currentColor" />
    <circle cx="7" cy="8" r="1.2" fill="currentColor" />
    <circle cx="12" cy="8" r="1.2" fill="currentColor" />
  </svg>
);

export function PanelHeader({ node }: { node: PanelNode }) {
  const onDragStart = useDragSource();
  const onDragEnd = useDragEnd();
  const closeDock = useAppStore((s) => s.closeDock);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  return (
    <div
      className="lc-panel-header"
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragEnd={onDragEnd}
    >
      <span className={`panel-dot dot-${node.contentType}`} />
      <span className="panel-title">{node.label}</span>
      <span className="header-cmds">
        <CmdBtn role="collapse" onClick={() => toggleCollapse(node.id)}>
          {node.collapsed ? "+" : "−"}
        </CmdBtn>
        <CmdBtn role="close" danger onClick={() => closeDock(node.id)}>
          ✕
        </CmdBtn>
      </span>
      {GRIP}
    </div>
  );
}

export function ContainerHeader({ node }: { node: RowNode | ColNode }) {
  const onDragStart = useDragSource();
  const onDragEnd = useDragEnd();
  const closeDock = useAppStore((s) => s.closeDock);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const badge = node.type === "row" ? "ROW" : "COL";
  return (
    <div
      className="lc-container-header"
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragEnd={onDragEnd}
    >
      <span className="container-type-badge">{badge}</span>
      <span className="panel-title">{node.label ?? `${badge} Group`}</span>
      <span className="header-cmds">
        <CmdBtn role="collapse" onClick={() => toggleCollapse(node.id)}>
          {node.collapsed ? "+" : "−"}
        </CmdBtn>
        <CmdBtn role="close" danger onClick={() => closeDock(node.id)}>
          ✕
        </CmdBtn>
      </span>
      {GRIP}
    </div>
  );
}

export function TabsGroupControls({ node }: { node: TabsNode }) {
  const onDragStart = useDragSource();
  const onDragEnd = useDragEnd();
  const closeDock = useAppStore((s) => s.closeDock);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  return (
    <>
      <div
        className="tabs-group-handle"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(e, node.id);
        }}
        onDragEnd={onDragEnd}
      >
        {GRIP}
        <span className="panel-title">{node.label}</span>
      </div>
      <div className="tabs-group-cmds">
        <CmdBtn role="collapse" onClick={() => toggleCollapse(node.id)}>
          {node.collapsed ? "+" : "−"}
        </CmdBtn>
        <CmdBtn role="close" danger onClick={() => closeDock(node.id)}>
          ✕
        </CmdBtn>
      </div>
    </>
  );
}

export function EmbedHeader({ node }: { node: EmbedNode }) {
  const onDragStart = useDragSource();
  const onDragEnd = useDragEnd();
  const closeDock = useAppStore((s) => s.closeDock);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  return (
    <div
      className="lc-embed-header"
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragEnd={onDragEnd}
    >
      <span className={`panel-dot dot-${node.contentType}`} />
      <span className="panel-title">{node.label} (embed host)</span>
      <span className="header-cmds">
        <CmdBtn role="collapse" onClick={() => toggleCollapse(node.id)}>
          {node.collapsed ? "+" : "−"}
        </CmdBtn>
        <CmdBtn role="close" danger onClick={() => closeDock(node.id)}>
          ✕
        </CmdBtn>
      </span>
      {GRIP}
    </div>
  );
}

/** Tab grip (tear-out) — drags an individual tab's underlying node. */
export function TabGrip({ childId, groupId }: { childId: DockId; groupId: DockId }) {
  const onDragStart = useDragSource();
  const onDragEnd = useDragEnd();
  return (
    <span
      className="tab-drag-grip"
      draggable
      title="Drag to tear out"
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(e, childId);
        // also exclude the parent group's overlay
        const drag = useAppStore.getState().drag;
        drag.exceptIds.add(groupId);
        useAppStore.getState().setDrag({ exceptIds: new Set([...drag.exceptIds]) });
      }}
      onDragEnd={onDragEnd}
    >
      ⠿
    </span>
  );
}
