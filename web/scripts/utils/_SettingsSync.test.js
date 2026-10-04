// synthetic: getJSON memoization. The resource filter grid is read for every drawn
// resource on every frame; the parsed object must be reused until the setting changes.

import {describe, test, expect, beforeEach} from 'vitest';
import {SettingsSync} from './SettingsSync.js';

describe('SettingsSync.getJSON memoization', () => {
    let sync;

    beforeEach(() => {
        localStorage.clear();
        sync = new SettingsSync();
    });

    test('returns the same parsed object until the setting changes', () => {
        sync.setJSON('settingStaticFiberEnchants', {e0: [true, false]});

        const first = sync.getJSON('settingStaticFiberEnchants');
        const second = sync.getJSON('settingStaticFiberEnchants');
        expect(first).toEqual({e0: [true, false]});
        expect(second).toBe(first);

        sync.setJSON('settingStaticFiberEnchants', {e0: [false, false]});
        const third = sync.getJSON('settingStaticFiberEnchants');
        expect(third).not.toBe(first);
        expect(third).toEqual({e0: [false, false]});
    });

    test('a change arriving from another tab invalidates the parsed value', () => {
        sync.setJSON('settingLivingHideEnchants', {e1: [true]});
        const before = sync.getJSON('settingLivingHideEnchants');

        sync.handleMessage({type: 'setting-changed', key: 'settingLivingHideEnchants', value: '{"e1":[false]}'});

        const after = sync.getJSON('settingLivingHideEnchants');
        expect(after).not.toBe(before);
        expect(after).toEqual({e1: [false]});
    });

    test('removing the setting falls back to the default', () => {
        sync.setJSON('settingLivingOreEnchants', {e2: [true]});
        expect(sync.getJSON('settingLivingOreEnchants')).toEqual({e2: [true]});

        sync.remove('settingLivingOreEnchants');
        expect(sync.getJSON('settingLivingOreEnchants', null)).toBeNull();
    });
});
