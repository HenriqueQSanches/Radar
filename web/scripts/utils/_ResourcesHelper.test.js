import {describe, test, expect, beforeEach, vi} from 'vitest';
import {
    generateResourceGrid, attachCheckboxListeners, toggleEnchantRow,
    updateEnchantRowState, selectAllTierEnchants,
} from './ResourcesHelper.js';

// Row toggles: the checkbox in front of E0..E4 sets every tier of that row at once.
describe('ResourcesHelper enchant row toggles', () => {
    const rowBoxes = (level) => [...document.querySelectorAll(`#fsp-${level} input[type=checkbox]`)];

    beforeEach(() => {
        document.body.innerHTML = `<div id="static-fiber-grid"></div>`;
        document.getElementById('static-fiber-grid').innerHTML =
            generateResourceGrid({prefix: 'fsp', name: 'Fiber', emoji: ''});
        attachCheckboxListeners();
    });

    test('the grid has one row toggle per enchant level and the E1-E4 rows have five tiers', () => {
        ['e0', 'e1', 'e2', 'e3', 'e4'].forEach(level => {
            expect(document.getElementById(`fsp-${level}-row`)).not.toBeNull();
        });
        expect(rowBoxes('e0')).toHaveLength(8);
        expect(rowBoxes('e2')).toHaveLength(5);
    });

    test('checking a row toggle checks every tier of that row and fires change on each', () => {
        const changes = vi.fn();
        rowBoxes('e2').forEach(cb => cb.addEventListener('change', changes));

        const toggle = document.getElementById('fsp-e2-row');
        toggle.click();

        expect(rowBoxes('e2').every(cb => cb.checked)).toBe(true);
        expect(changes).toHaveBeenCalledTimes(5);
        expect(rowBoxes('e3').some(cb => cb.checked)).toBe(false);
    });

    test('unchecking the row toggle clears the row', () => {
        toggleEnchantRow('fsp', 'e3', true);
        toggleEnchantRow('fsp', 'e3', false);
        expect(rowBoxes('e3').some(cb => cb.checked)).toBe(false);
        expect(document.getElementById('fsp-e3-row').checked).toBe(false);
    });

    test('the toggle reflects a partially ticked row as indeterminate', () => {
        rowBoxes('e1')[0].checked = true;
        updateEnchantRowState('fsp', 'e1');
        const toggle = document.getElementById('fsp-e1-row');
        expect(toggle.checked).toBe(false);
        expect(toggle.indeterminate).toBe(true);

        rowBoxes('e1').forEach(cb => cb.checked = true);
        updateEnchantRowState('fsp', 'e1');
        expect(toggle.checked).toBe(true);
        expect(toggle.indeterminate).toBe(false);
    });

    test('the tier column button keeps the row toggles in sync', () => {
        for (let i = 0; i < 8; i++) selectAllTierEnchants('fsp', i);
        expect(document.getElementById('fsp-e0-row').checked).toBe(true);
        expect(document.getElementById('fsp-e4-row').checked).toBe(true);
    });
});
