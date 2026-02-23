/**
 * collapse.js
 * ───────────
 * Responsible for:
 *  • Determining collapse direction based on parent layout
 *  • Collapsing / expanding docks and tab groups
 *  • Storing/restoring flex values for proper expansion
 *
 * Collapse Rules:
 *  • Dock in horizontal layout (dock-row) → collapse horizontally (collapsed-h)
 *  • Dock in vertical layout (dock-column) → collapse vertically (collapsed-v)
 *  • Tab group follows same rules based on its parent container
 *  • IMPORTANT: A dock in a horizontal tabs group (top/bottom tabs) can only 
 *    collapse if the tabs group is ordered vertically with other docks/groups.
 *  • A dock in a vertical tabs group (left/right tabs) can only collapse if
 *    the tabs group is ordered horizontally with other docks/groups.
 */

/**
 * Determines if a dock can be collapsed and in which direction.
 * Returns null if collapse is not allowed.
 *
 * @param {HTMLElement} dock
 * @returns {'h'|'v'|null} 'h' for horizontal, 'v' for vertical, null if not allowed
 */
export function getCollapseDirection(dock) {
    // Already collapsed - return current direction
    if (dock.classList.contains('collapsed-h')) return 'h';
    if (dock.classList.contains('collapsed-v')) return 'v';

    const parent = dock.parentElement;
    if (!parent) return null;

    // Check if dock is in a tab group (multi-tab dock)
    const hasTabs = dock.panelData && dock.panelData.length > 1;

    // Determine parent layout direction
    const isParentRow = parent.classList.contains('dock-row');
    const isParentColumn = parent.classList.contains('dock-column');

    // If parent is the root container, check its flex-direction
    if (!isParentRow && !isParentColumn) {
        const computedStyle = window.getComputedStyle(parent);
        const flexDir = computedStyle.flexDirection;
        // Default container is row (flex-direction: row)
        if (flexDir === 'column') {
            return 'v';
        }
        return 'h';
    }

    // For tab groups, check if collapse is allowed based on tabs position
    // Rule: Horizontal tabs (top/bottom) can only collapse if parent is column (vertical order)
    // Rule: Vertical tabs (left/right) can only collapse if parent is row (horizontal order)
    if (hasTabs) {
        const tabsPos = dock.dataset.tabsPos || 'top';
        const isHorizontalTabs = tabsPos === 'top' || tabsPos === 'bottom';

        if (isHorizontalTabs) {
            // Horizontal tabs can only collapse vertically (parent must be column)
            if (isParentColumn) {
                return 'v';
            }
            // Cannot collapse horizontal tabs in a row layout
            return null;
        } else {
            // Vertical tabs can only collapse horizontally (parent must be row)
            if (isParentRow) {
                return 'h';
            }
            // Cannot collapse vertical tabs in a column layout
            return null;
        }
    }

    // Single panel dock - collapse based on parent direction
    if (isParentRow) {
        return 'h';
    } else if (isParentColumn) {
        return 'v';
    }

    return 'h'; // Default to horizontal
}

/**
 * Checks if a tab group can be collapsed based on its context.
 * A tab group cannot be collapsed if it would conflict with the layout.
 *
 * @param {HTMLElement} dock
 * @returns {boolean}
 */
export function canCollapse(dock) {
    return getCollapseDirection(dock) !== null;
}

/**
 * Collapses a dock or tab group.
 *
 * @param {HTMLElement} dock
 */
export function collapseDock(dock) {
    const direction = getCollapseDirection(dock);
    if (!direction) return;

    // Store current flex value for restoration
    if (!dock.dataset.originalFlex) {
        dock.dataset.originalFlex = dock.style.flex || '1';
    }

    // Apply collapse class
    if (direction === 'h') {
        dock.classList.remove('collapsed-v');
        dock.classList.add('collapsed-h');
    } else {
        dock.classList.remove('collapsed-h');
        dock.classList.add('collapsed-v');
    }
}

/**
 * Expands a collapsed dock or tab group.
 *
 * @param {HTMLElement} dock
 */
export function expandDock(dock) {
    const wasCollapsedH = dock.classList.contains('collapsed-h');
    const wasCollapsedV = dock.classList.contains('collapsed-v');

    dock.classList.remove('collapsed-h', 'collapsed-v');

    // Restore original flex value
    if (dock.dataset.originalFlex) {
        dock.style.flex = dock.dataset.originalFlex;
        delete dock.dataset.originalFlex;
    }
}

/**
 * Toggles collapse state of a dock.
 *
 * @param {HTMLElement} dock
 * @returns {boolean} true if now collapsed, false if expanded
 */
export function toggleCollapse(dock) {
    const isCollapsed = dock.classList.contains('collapsed-h') ||
                        dock.classList.contains('collapsed-v');

    if (isCollapsed) {
        expandDock(dock);
        return false;
    } else {
        collapseDock(dock);
        return true;
    }
}

/**
 * Checks if a dock is currently collapsed.
 *
 * @param {HTMLElement} dock
 * @returns {boolean}
 */
export function isCollapsed(dock) {
    return dock.classList.contains('collapsed-h') ||
           dock.classList.contains('collapsed-v');
}
