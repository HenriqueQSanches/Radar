// "Select all" / "Clear all" for a settings page: toggles every setting checkbox on the
// page in one go instead of one click per box.
//
// Each checkbox is toggled with el.click() rather than by setting .checked, so the
// page's own listeners run (some pages bind "change", Enemies binds "click") and each
// value is persisted through settingsSync exactly as a manual click would be.

// Checkboxes that are not settings: DaisyUI collapse toggles, and the Enemies "All"
// master box, which the page keeps in sync from the four classic enemy boxes itself.
const SKIP_ID_PREFIXES = ['collapse-'];
const SKIP_IDS = new Set(['settingAllEnemies']);

export function isBulkSelectable(el) {
    if (!el || el.type !== 'checkbox' || el.disabled) return false;
    const id = el.id || '';
    if (SKIP_IDS.has(id)) return false;
    return !SKIP_ID_PREFIXES.some(prefix => id.startsWith(prefix));
}

/**
 * Set every selectable checkbox under `root` to `checked`.
 * @param {ParentNode} root - Page container (defaults to #page-content).
 * @param {boolean} checked
 * @returns {number} How many checkboxes changed state.
 */
export function setAllCheckboxes(checked, root = document.getElementById('page-content') || document) {
    let changed = 0;
    for (const el of root.querySelectorAll('input[type="checkbox"]')) {
        if (!isBulkSelectable(el)) continue;
        if (el.checked === checked) continue;
        el.click();
        changed++;
    }
    return changed;
}

/**
 * Wire the page header buttons (#btnSelectAll / #btnClearAll) when present.
 * @param {(el: Element, event: string, handler: EventListener) => void} addListener - page's
 *   own listener registrar, so the handlers are removed on page destroy.
 */
export function bindBulkSelectButtons(addListener) {
    const selectAll = document.getElementById('btnSelectAll');
    const clearAll = document.getElementById('btnClearAll');
    if (selectAll) addListener(selectAll, 'click', () => setAllCheckboxes(true));
    if (clearAll) addListener(clearAll, 'click', () => setAllCheckboxes(false));
}
