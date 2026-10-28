import {describe, test, expect, beforeEach, vi} from 'vitest';
import {setAllCheckboxes, isBulkSelectable, bindBulkSelectButtons} from './BulkSelect.js';

describe('BulkSelect', () => {
    let root;

    beforeEach(() => {
        document.body.innerHTML = `
            <main id="page-content">
                <input type="checkbox" id="collapse-fiber" checked>
                <input type="checkbox" id="settingAllEnemies">
                <input type="checkbox" id="settingA">
                <input type="checkbox" id="settingB" checked>
                <input type="checkbox" id="fsp-e0-3">
                <input type="checkbox" id="settingDisabled" disabled>
                <input type="number" id="settingClusterRadius" value="30">
                <button id="btnSelectAll"></button>
                <button id="btnClearAll"></button>
            </main>`;
        root = document.getElementById('page-content');
    });

    test('skips collapse toggles, the Enemies master box and disabled boxes', () => {
        expect(isBulkSelectable(root.querySelector('#collapse-fiber'))).toBe(false);
        expect(isBulkSelectable(root.querySelector('#settingAllEnemies'))).toBe(false);
        expect(isBulkSelectable(root.querySelector('#settingDisabled'))).toBe(false);
        expect(isBulkSelectable(root.querySelector('#settingA'))).toBe(true);
        expect(isBulkSelectable(root.querySelector('#fsp-e0-3'))).toBe(true);
    });

    test('select all checks every selectable box and leaves the rest alone', () => {
        const changed = setAllCheckboxes(true, root);
        expect(changed).toBe(2); // settingA and fsp-e0-3 (settingB was already on)
        expect(root.querySelector('#settingA').checked).toBe(true);
        expect(root.querySelector('#fsp-e0-3').checked).toBe(true);
        expect(root.querySelector('#collapse-fiber').checked).toBe(true);
        expect(root.querySelector('#settingAllEnemies').checked).toBe(false);
        expect(root.querySelector('#settingDisabled').checked).toBe(false);
    });

    test('clear all unchecks every selectable box', () => {
        const changed = setAllCheckboxes(false, root);
        expect(changed).toBe(1); // only settingB was on
        expect(root.querySelector('#settingB').checked).toBe(false);
        expect(root.querySelector('#collapse-fiber').checked).toBe(true);
    });

    test('toggles through click so the page listeners persist each value', () => {
        const change = vi.fn();
        const click = vi.fn();
        root.querySelector('#settingA').addEventListener('change', change);
        root.querySelector('#settingA').addEventListener('click', click);
        setAllCheckboxes(true, root);
        expect(change).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
    });

    test('bindBulkSelectButtons wires the header buttons through the page registrar', () => {
        const registered = [];
        const addListener = (el, event, handler) => {
            el.addEventListener(event, handler);
            registered.push(el.id);
        };
        bindBulkSelectButtons(addListener);
        expect(registered).toEqual(['btnSelectAll', 'btnClearAll']);

        document.getElementById('btnClearAll').click();
        expect(root.querySelector('#settingB').checked).toBe(false);
        document.getElementById('btnSelectAll').click();
        expect(root.querySelector('#settingA').checked).toBe(true);
        expect(root.querySelector('#settingB').checked).toBe(true);
    });
});
