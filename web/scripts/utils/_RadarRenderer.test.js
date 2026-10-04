// synthetic: narrow coverage of _collectClusterCandidates(); assertions only reach the living/static filter gate,
// so no pcap fixture is needed and the full RadarRenderer setup (canvas, game loop, zones) is stubbed out.

import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';

vi.mock('./SettingsSync.js', () => ({
    default: {
        getBool: vi.fn(() => true),
        getJSON: vi.fn(() => null),
        getNumber: vi.fn((_k, d) => d ?? 0),
    },
}));
vi.mock('./CanvasManager.js', () => ({
    CanvasManager: class { initialize() { return {contexts: {}}; } destroy() {} },
}));
vi.mock('../data/ZonesDatabase.js', () => ({default: {zones: {}}}));

const {RadarRenderer} = await import('./RadarRenderer.js');
const {EnemyType} = await import('../handlers/MobsHandler.js');
const settingsSync = (await import('./SettingsSync.js')).default;

function makeRenderer({harvestableList = [], mobsList = []} = {}) {
    return new RadarRenderer({
        handlers: {
            harvestablesHandler: {harvestableList},
            mobsHandler: {mobsList},
        },
        drawings: {},
        drawingUtils: {detectClusters: vi.fn(() => [])},
    });
}

function allTrue() {
    return {e0: Array(8).fill(true), e1: Array(8).fill(true), e2: Array(8).fill(true), e3: Array(8).fill(true), e4: Array(8).fill(true)};
}

function allFalse() {
    return {e0: Array(8).fill(false), e1: Array(8).fill(false), e2: Array(8).fill(false), e3: Array(8).fill(false), e4: Array(8).fill(false)};
}

describe('RadarRenderer._collectClusterCandidates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.EnemyType = EnemyType;
        window.logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
    });

    // @verified 2026-04-24: pure-static harvestable with Static settings off is dropped from cluster input so
    // cluster rings stop surrounding entities the drawings already skip (Important #1 in PR #82 review).
    test('pure static harvestable with Static off is excluded from cluster candidates', () => {
        settingsSync.getJSON.mockImplementation(key => key === 'settingStaticFiberEnchants' ? allFalse() : null);
        const renderer = makeRenderer({
            harvestableList: [{id: 1, stringType: 'Fiber', tier: 4, charges: 0, mobileTypeId: -1, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(0);
    });

    // @verified 2026-04-24: pure-static harvestable with Static on is kept.
    test('pure static harvestable with Static on is kept in cluster candidates', () => {
        settingsSync.getJSON.mockImplementation(key => key === 'settingStaticFiberEnchants' ? allTrue() : null);
        const renderer = makeRenderer({
            harvestableList: [{id: 1, stringType: 'Fiber', tier: 4, charges: 0, mobileTypeId: -1, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(1);
    });

    // @verified 2026-04-24: living harvestable (mobileTypeId=real typeId) consults Living key, not Static.
    test('living harvestable with Living on but Static off is kept', () => {
        settingsSync.getJSON.mockImplementation(key => {
            if (key === 'settingLivingFiberEnchants') return allTrue();
            if (key === 'settingStaticFiberEnchants') return allFalse();
            return null;
        });
        const renderer = makeRenderer({
            harvestableList: [{id: 2, stringType: 'Fiber', tier: 4, charges: 0, mobileTypeId: 529, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(1);
    });

    // @verified 2026-04-24: living mob with Living off is excluded even if Static is on, matching MobsDrawing.
    test('living mob with Living off is excluded from cluster candidates', () => {
        settingsSync.getJSON.mockImplementation(key => {
            if (key === 'settingLivingFiberEnchants') return allFalse();
            if (key === 'settingStaticFiberEnchants') return allTrue();
            return null;
        });
        const renderer = makeRenderer({
            mobsList: [{id: 10, name: 'Fiber', tier: 4, enchantmentLevel: 0, type: EnemyType.LivingHarvestable, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(0);
    });

    // @verified 2026-04-24: hostile (non-living) mob is never considered a cluster candidate regardless of settings.
    test('hostile mob is excluded from cluster candidates', () => {
        settingsSync.getJSON.mockReturnValue(allTrue());
        const renderer = makeRenderer({
            mobsList: [{id: 20, name: 'T5_MOB_KEEPER', tier: 5, enchantmentLevel: 0, type: EnemyType.Enemy, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(0);
    });

    // @verified 2026-04-24: batch-spawn sentinel mobileTypeId=null routes as pure-static.
    test('batch-spawn harvestable (mobileTypeId=null) is gated by Static setting', () => {
        settingsSync.getJSON.mockImplementation(key => key === 'settingStaticFiberEnchants' ? allTrue() : null);
        const renderer = makeRenderer({
            harvestableList: [{id: 3, stringType: 'Fiber', tier: 4, charges: 0, mobileTypeId: null, hX: 1, hY: 1}],
        });

        expect(renderer._collectClusterCandidates()).toHaveLength(1);
    });
});

// synthetic: the loop only draws while something changed recently, an overlay is animating,
// or once a second as a safety net. update()/render() are stubbed; only the gate is exercised.
describe('RadarRenderer change-driven rendering', () => {
    let now;
    let renderer;

    function makeIdleRenderer(extraHandlers = {}) {
        const r = new RadarRenderer({
            handlers: {
                harvestablesHandler: {harvestableList: []},
                mobsHandler: {mobsList: []},
                playersHandler: {lastFlashAt: 0, FLASH_DURATION_MS: 300, getThreatPlayers: () => []},
                ...extraHandlers,
            },
            drawings: {},
            drawingUtils: {detectClusters: vi.fn(() => [])},
        });
        r.update = vi.fn();
        r.render = vi.fn();
        return r;
    }

    function tick(ms) {
        now += ms;
        renderer.gameLoop();
    }

    beforeEach(() => {
        vi.clearAllMocks();
        now = 10000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        window.logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        renderer = makeIdleRenderer();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('draws the first frame, then stays quiet while nothing changes', () => {
        tick(0);
        expect(renderer.render).toHaveBeenCalledTimes(1);

        tick(40);
        tick(40);
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(1);
        expect(renderer.update).toHaveBeenCalledTimes(1);
    });

    test('markDirty keeps frames flowing until the interpolation has settled', () => {
        tick(0);
        renderer.markDirty();

        tick(40);
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(3);

        // 500ms settle window: past it (and short of the 1s safety frame) nothing is drawn.
        tick(600);
        expect(renderer.render).toHaveBeenCalledTimes(3);
    });

    test('an idle radar still repaints once a second as a safety net', () => {
        tick(0);
        tick(500);
        expect(renderer.render).toHaveBeenCalledTimes(1);

        tick(600);
        expect(renderer.render).toHaveBeenCalledTimes(2);
    });

    test('local player movement and map changes mark the radar dirty', () => {
        tick(0);
        renderer.setLocalPlayerPosition(12, 34);
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(2);

        tick(600);
        tick(40);
        const before = renderer.render.mock.calls.length;
        renderer.setMap({id: 'X'});
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(before + 1);
    });

    test('a visible threat border keeps animating every frame', () => {
        renderer = makeIdleRenderer({
            playersHandler: {lastFlashAt: 0, FLASH_DURATION_MS: 300, getThreatPlayers: () => [{id: 1}]},
        });
        tick(0);
        tick(40);
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(3);
    });

    test('the screen flash keeps animating only while it is fading', () => {
        const players = {lastFlashAt: 0, FLASH_DURATION_MS: 300, getThreatPlayers: () => []};
        renderer = makeIdleRenderer({playersHandler: players});
        tick(0);

        players.lastFlashAt = now;
        tick(40);
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(3);

        tick(400);
        expect(renderer.render).toHaveBeenCalledTimes(3);
    });

    test('still honours the 30fps throttle while dirty', () => {
        tick(0);
        renderer.markDirty();
        tick(40);
        expect(renderer.render).toHaveBeenCalledTimes(2);

        tick(10);
        tick(10);
        expect(renderer.render).toHaveBeenCalledTimes(2);
        tick(10);
        expect(renderer.render).toHaveBeenCalledTimes(3);
    });
});
