import {CATEGORIES} from "../constants/LoggerConstants.js";

const CHANNEL_NAME = 'openradar-settings';

// Visibility and alert toggles that should be ON until the player turns them off.
// getBool() returns false for a setting that was never written, so without this every
// one of these stayed off until its settings page was opened and the box ticked by
// hand: no player alerts, no fishing spots, no chests on a fresh install. Seeded once,
// on every page load, so the radar page works before any settings page is visited.
export const DEFAULT_ON_SETTINGS = [
    // Players
    'settingShowPlayers', 'settingItems', 'settingShowSpells', 'settingShowPlayerHealthBar',
    'settingSound', 'settingFlash', 'settingFlashDangerousPlayer',
    'settingPassivePlayers', 'settingFactionPlayers', 'settingDangerousPlayers',
    // Resources
    'settingFishing', 'settingResourceCount', 'settingLivingResourcesHealthBar',
    // Enemies
    'settingAllEnemies', 'settingNormalEnemy', 'settingEnchantedEnemy', 'settingMiniBossEnemy',
    'settingBossEnemy', 'settingShowUnmanagedEnemies', 'settingAvaloneDrones', 'settingShowEventEnemies',
    'settingBossCrystalSpider', 'settingBossFairyDragon', 'settingBossVeilWeaver', 'settingBossGriffin',
    // Chests, Mists, Dungeons
    'settingChestGreen', 'settingChestBlue', 'settingChestPurple', 'settingChestYellow',
    'settingMistSolo', 'settingMistDuo', 'settingMistE0', 'settingMistE1', 'settingMistE2',
    'settingMistE3', 'settingMistE4', 'settingCage', 'settingWispSpawn',
    'settingDungeonSolo', 'settingDungeonDuo', 'settingDungeonE0', 'settingDungeonE1',
    'settingDungeonE2', 'settingDungeonE3', 'settingDungeonE4', 'settingDungeonCorrupted',
    'settingDungeonHellgate',
];

export class SettingsSync {
    constructor() {
        this.channel = null;
        this.listeners = new Map();
        this.isInitialized = false;
        this.cache = new Map();
        // Parsed getJSON results, keyed by setting. The resource filter grid is read for
        // every drawn resource on every frame; re-parsing the same JSON thousands of
        // times a second was pure waste.
        this.jsonCache = new Map();

        this._boundMessageHandler = (event) => this.handleMessage(event.data);
        this._boundStorageHandler = (event) => {
            if (event.key && event.newValue !== null) {
                this.handleMessage({ type: 'setting-changed', key: event.key, value: event.newValue });
            }
        };
        this._usingFallback = false;

        if (typeof BroadcastChannel !== 'undefined') {
            this.initialize();
        } else {
            this.setupFallback();
        }
        this.seedDefaults();
    }

    // Writes DEFAULT_ON_SETTINGS that have never been set. Only the first page load of a
    // fresh install writes anything; a box the player unticked stays unticked.
    seedDefaults() {
        for (const key of DEFAULT_ON_SETTINGS) {
            if (localStorage.getItem(key) === null) localStorage.setItem(key, 'true');
        }
    }

    initialize() {
        try {
            this.channel = new BroadcastChannel(CHANNEL_NAME);
            this.channel.addEventListener('message', this._boundMessageHandler);
            this.isInitialized = true;
        } catch (e) {
            window.logger?.info(CATEGORIES.SYSTEM, 'BroadcastChannel_Fallback', {reason: e?.message});
            this.setupFallback();
        }
    }

    setupFallback() {
        window.addEventListener('storage', this._boundStorageHandler);
        this._usingFallback = true;
        window.logger?.info(CATEGORIES.SYSTEM, 'SettingsSync_UsingStorageFallback', {});
    }

    _getCached(key) {
        if (this.cache.has(key)) return this.cache.get(key);
        const value = localStorage.getItem(key);
        this.cache.set(key, value);
        return value;
    }

    handleMessage(data) {
        if (data.type === 'setting-changed' || data.type === 'setting-removed') {
            if (data.type === 'setting-changed') {
                this.cache.set(data.key, data.value);
            } else {
                this.cache.delete(data.key);
            }
            this.jsonCache.delete(data.key);

            const listeners = this.listeners.get(data.key) || [];
            listeners.forEach(callback => {
                try { callback(data.key, data.value); } catch (error) {
                    window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncListenerError', {
                        key: data.key,
                        error: error?.message || error
                    });
                }
            });

            const wildcardListeners = this.listeners.get('*') || [];
            wildcardListeners.forEach(callback => {
                try { callback(data.key, data.value); } catch (error) {
                    window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncWildcardListenerError', {
                        key: data.key,
                        error: error?.message || error
                    });
                }
            });
        }
    }

    broadcast(key, value) {
        localStorage.setItem(key, value);

        if (this.channel && this.isInitialized) {
            try {
                this.channel.postMessage({ type: 'setting-changed', key, value, timestamp: Date.now() });
            } catch (error) {
                window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncBroadcastFailed', {
                    key,
                    error: error?.message || error
                });
            }
        }

        this.handleMessage({ type: 'setting-changed', key, value });
    }

    on(key, callback) {
        if (!this.listeners.has(key)) this.listeners.set(key, []);
        this.listeners.get(key).push(callback);
    }

    off(key, callback) {
        if (!this.listeners.has(key)) return;
        const listeners = this.listeners.get(key);
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
    }

    removeAllListeners(key) { this.listeners.delete(key); }

    get(key, defaultValue = null) {
        const value = this._getCached(key);
        return value !== null ? value : defaultValue;
    }

    set(key, value) { this.broadcast(key, value); }

    getBool(key, defaultValue = false) {
        const value = this._getCached(key);
        if (value === null) return defaultValue;
        return value === 'true';
    }

    setBool(key, value) { this.broadcast(key, value.toString()); }

    getNumber(key, defaultValue = 0) {
        const value = this._getCached(key);
        if (value === null || value === '') return defaultValue;
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    setNumber(key, value) { this.broadcast(key, value.toString()); }

    getFloat(key, defaultValue = 0) {
        const value = this._getCached(key);
        if (value === null || value === '') return defaultValue;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    setFloat(key, value) { this.broadcast(key, value.toString()); }

    getJSON(key, defaultValue = null) {
        const value = this._getCached(key);
        if (value === null || value === '') return defaultValue;
        const cached = this.jsonCache.get(key);
        if (cached && cached.raw === value) return cached.parsed;
        try {
            const parsed = JSON.parse(value);
            this.jsonCache.set(key, {raw: value, parsed});
            return parsed;
        }
        catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncJSONParseFailed', {
                key,
                error: error?.message || error
            });
            return defaultValue;
        }
    }

    setJSON(key, value) {
        try { this.broadcast(key, JSON.stringify(value)); } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncJSONStringifyFailed', {
                key,
                error: error?.message || error
            });
        }
    }

    remove(key) {
        localStorage.removeItem(key);

        if (this.channel && this.isInitialized) {
            try {
                this.channel.postMessage({ type: 'setting-removed', key, timestamp: Date.now() });
            } catch (error) {
                window.logger?.error(CATEGORIES.SYSTEM, 'SettingsSyncRemoveFailed', {
                    key,
                    error: error?.message || error
                });
            }
        }

        this.handleMessage({ type: 'setting-removed', key, value: null });
    }

    destroy() {
        if (this.channel) {
            this.channel.removeEventListener('message', this._boundMessageHandler);
            this.channel.close();
            this.channel = null;
        }
        if (this._usingFallback) {
            window.removeEventListener('storage', this._boundStorageHandler);
        }
        this.listeners.clear();
        this.cache.clear();
        this.jsonCache.clear();
        this.isInitialized = false;
    }
}

let settingsSyncInstance = null;

export function getSettingsSync() {
    if (!settingsSyncInstance) {
        settingsSyncInstance = new SettingsSync();
        window.addEventListener('beforeunload', () => {
            if (settingsSyncInstance) settingsSyncInstance.destroy();
        });
    }
    return settingsSyncInstance;
}

export default getSettingsSync();
