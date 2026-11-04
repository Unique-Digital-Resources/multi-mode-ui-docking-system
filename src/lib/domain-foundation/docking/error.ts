/**
 * Docking Domain Foundation — Errors
 * ===================================
 * Mirrors AppShell `DockingError` (29 variants) but scoped to the
 * tree-based model ported from the JS system. Each error is `Eq`-friendly
 * (carries ids/indexes, never raw float payloads that would break equality).
 */

export type DockingError =
  // creation / reference
  | { kind: "DockNotFound"; id: string }
  | { kind: "UnknownReference"; id: string }
  | { kind: "DuplicateMembership"; id: string }
  | { kind: "AlreadyPlaced"; id: string }
  | { kind: "InsufficientChildren"; id: string }
  | { kind: "SizeCountMismatch"; id: string }
  | { kind: "ActiveIndexOutOfRange"; id: string; index: number; len: number }
  | { kind: "RootAlreadySet" }
  // validation (steady-state)
  | { kind: "OrphanDock"; id: string }
  | { kind: "DuplicatePlacement"; id: string }
  | { kind: "InvalidRoot"; id: string }
  | { kind: "MissingRoot"; dockCount: number }
  | { kind: "CycleDetected"; id: string }
  | { kind: "InvalidSizeState"; id: string }
  // operations
  | { kind: "IneligibleDock"; id: string }
  | { kind: "NotSplittable"; id: string }
  | { kind: "NotATabGroup"; id: string }
  | { kind: "TabIndexOutOfRange"; index: number; len: number }
  | { kind: "CannotCollapseLastSibling"; id: string }
  // sizing
  | { kind: "NotASplit"; id: string }
  | { kind: "SplitChildIndexOutOfRange"; index: number; len: number }
  | { kind: "SizeBoundViolation"; requested: number; min: number }
  // embed / floating
  | { kind: "NotAnEmbedHost"; id: string }
  | { kind: "RegionOccupied"; host: string; edge: string }
  | { kind: "RegionUnoccupied"; host: string; edge: string }
  | { kind: "RegionBoundViolation"; requested: number; min: number }
  | { kind: "InvalidRegionState"; id: string }
  | { kind: "FloatingIndexOutOfRange"; index: number; len: number }
  | { kind: "FloatingBoundViolation"; field: string; value: number; min: number }
  | { kind: "InvalidFloatingState"; id: string };

export function dockingErrorToString(e: DockingError): string {
  switch (e.kind) {
    case "DockNotFound": return `dock #${e.id} not found`;
    case "UnknownReference": return `unknown reference to #${e.id}`;
    case "DuplicateMembership": return `#${e.id} already a member`;
    case "AlreadyPlaced": return `#${e.id} already placed`;
    case "InsufficientChildren": return `#${e.id} has fewer than 2 children`;
    case "SizeCountMismatch": return `#${e.id} size count does not match children`;
    case "ActiveIndexOutOfRange": return `active index ${e.index} out of range (len ${e.len})`;
    case "RootAlreadySet": return `root already set`;
    case "OrphanDock": return `#${e.id} is an orphan`;
    case "DuplicatePlacement": return `#${e.id} has duplicate placement`;
    case "InvalidRoot": return `root #${e.id} is also owned`;
    case "MissingRoot": return `layout with ${e.dockCount} docks has no root`;
    case "CycleDetected": return `cycle detected at #${e.id}`;
    case "InvalidSizeState": return `#${e.id} has invalid size state`;
    case "IneligibleDock": return `#${e.id} is ineligible for this operation`;
    case "NotSplittable": return `#${e.id} is not splittable`;
    case "NotATabGroup": return `#${e.id} is not a tab group`;
    case "TabIndexOutOfRange": return `tab index ${e.index} out of range (len ${e.len})`;
    case "CannotCollapseLastSibling": return `cannot collapse #${e.id}: last expanded sibling`;
    case "NotASplit": return `#${e.id} is not a split container`;
    case "SplitChildIndexOutOfRange": return `split child index ${e.index} out of range (len ${e.len})`;
    case "SizeBoundViolation": return `size ${e.requested} below min ${e.min}`;
    case "NotAnEmbedHost": return `#${e.id} is not an embed host`;
    case "RegionOccupied": return `host #${e.host} region ${e.edge} occupied`;
    case "RegionUnoccupied": return `host #${e.host} region ${e.edge} unoccupied`;
    case "RegionBoundViolation": return `region size ${e.requested} below min ${e.min}`;
    case "InvalidRegionState": return `#${e.id} has invalid region state`;
    case "FloatingIndexOutOfRange": return `floating index ${e.index} out of range (len ${e.len})`;
    case "FloatingBoundViolation": return `floating ${e.field} ${e.value} below min ${e.min}`;
    case "InvalidFloatingState": return `#${e.id} has invalid floating state`;
  }
}
