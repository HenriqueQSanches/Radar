import {describe, test, expect, beforeEach, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {MobsDatabase} from './MobsDatabase.js';

const here = dirname(fileURLToPath(import.meta.url));
const rawMobs = JSON.parse(readFileSync(join(here, '..', '..', 'ao-bin-dumps', 'mobs.min.json'), 'utf8'));

// Anchor rows used across the suite (see MobsDatabase.OFFSET comment). Indices
// are derived from the live dump by name so a data refresh can't stale them.
const OFFSET = MobsDatabase.OFFSET;
const SWAMP_TOAD_IDX = rawMobs.findIndex(m => m.u === 'T1_MOB_HIDE_SWAMP_TOAD');
// Contiguous swamp hide series (toad T1, snake T2, giant toad T3, monitor T4,
// dragon T6) — distinct hp values so the calibration can converge on one delta.
const SWAMP_HIDE_RUN = [0, 1, 2, 4, 8].map(d => SWAMP_TOAD_IDX + d);
// A hide mob a few rows in, used for enchant-scaled-hp fallbacks.
const ENCHANTED_IDX = SWAMP_TOAD_IDX + 3;

function loadDb() {
    const db = new MobsDatabase();
    db._parseMobs(rawMobs);
    db.isLoaded = true;
    return db;
}

describe('MobsDatabase runtime offset calibration', () => {
    let db;

    beforeEach(() => {
        window.logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        db = loadDb();
    });

    test('aligned wire id with matching hp resolves normally and keeps delta 0', () => {
        const idx = SWAMP_TOAD_IDX;
        const info = db.getMobInfo(idx + OFFSET, rawMobs[idx].hp);
        expect(info?.uniqueName).toBe('T1_MOB_HIDE_SWAMP_TOAD');
        expect(db.getCalibrationStats().delta).toBe(0);
    });

    test('lookup without hp behaves like the legacy static mapping', () => {
        const idx = SWAMP_TOAD_IDX;
        expect(db.getMobInfo(idx + OFFSET)?.uniqueName).toBe('T1_MOB_HIDE_SWAMP_TOAD');
        expect(db.getMobInfo(idx + OFFSET, 0)?.uniqueName).toBe('T1_MOB_HIDE_SWAMP_TOAD');
        expect(db.getMobInfo(idx + OFFSET, undefined)?.uniqueName).toBe('T1_MOB_HIDE_SWAMP_TOAD');
    });

    test('drifted wire ids (+7) get the correct label from the first sight on', () => {
        const DRIFT = 7;
        // Swamp hide run: T1 toad .. T6 dragon — the exact block behind the
        // "T2/T3 pelego labeled T6" report. Before consensus converges the row
        // may be a same-label sibling (duplicate hp), but type and tier — what
        // the radar draws and filters on — must already be right.
        for (const idx of SWAMP_HIDE_RUN) {
            const info = db.getMobInfo(idx + OFFSET + DRIFT, rawMobs[idx].hp);
            expect(info?.type).toBe('Hide');
            expect(info?.isHarvestable).toBe(true);
            expect(info?.tier).toBe(rawMobs[idx].lt ?? rawMobs[idx].t);
        }
    });

    test('consensus delta converges after a few drifted spawns and serves hp-less lookups', () => {
        const DRIFT = 7;
        for (const idx of SWAMP_HIDE_RUN) {
            db.getMobInfo(idx + OFFSET + DRIFT, rawMobs[idx].hp);
        }
        expect(db.getCalibrationStats().delta).toBe(DRIFT);

        // Post-convergence, drifted lookups resolve to the exact rows.
        for (const idx of SWAMP_HIDE_RUN) {
            const info = db.getMobInfo(idx + OFFSET + DRIFT, rawMobs[idx].hp);
            expect(info?.uniqueName).toBe(rawMobs[idx].u);
        }
        expect(window.logger.warn).toHaveBeenCalledWith(
            expect.anything(), 'MobsDatabaseOffsetDrift', expect.objectContaining({newDelta: DRIFT}));

        // An enchanted mob's hp is scaled and matches no row: it must fall back
        // to the consensus-corrected mapping, not the stale static one.
        const idx = ENCHANTED_IDX;
        const scaledHp = rawMobs[idx].hp * 3 + 1;
        const info = db.getMobInfo(idx + OFFSET + DRIFT, scaledHp);
        expect(info?.uniqueName).toBe(rawMobs[idx].u);

        // Plain hp-less lookups follow the consensus too.
        expect(db.getMobInfo(idx + OFFSET + DRIFT)?.uniqueName).toBe(rawMobs[idx].u);
    });

    test('a single ambiguous observation does not move the consensus', () => {
        const DRIFT = 7;
        db.getMobInfo(SWAMP_TOAD_IDX + OFFSET + DRIFT, rawMobs[SWAMP_TOAD_IDX].hp);
        expect(db.getCalibrationStats().delta).toBe(0);
    });

    test('getResourceInfo follows the calibrated mapping', () => {
        const DRIFT = 7;
        for (const idx of SWAMP_HIDE_RUN) {
            db.getMobInfo(idx + OFFSET + DRIFT, rawMobs[idx].hp);
        }
        expect(db.getCalibrationStats().delta).toBe(DRIFT);

        const idx = ENCHANTED_IDX;
        const res = db.getResourceInfo(idx + OFFSET + DRIFT);
        expect(res).toEqual({type: 'Hide', tier: rawMobs[idx].lt ?? rawMobs[idx].t});
    });

    test('hp mismatch with no candidate anywhere falls back to the primary row', () => {
        const idx = SWAMP_TOAD_IDX;
        const info = db.getMobInfo(idx + OFFSET, 999999);
        expect(info?.uniqueName).toBe('T1_MOB_HIDE_SWAMP_TOAD');
        expect(db.getCalibrationStats().delta).toBe(0);
    });

    test('enchanted mob keeps its own tier when scaled hp collides with a higher-tier neighbour', () => {
        // Regression for "pelego T2/T3 marcado como T6": enchant inflates a mob's
        // HP, so a T2 hide's observed maxHP can exactly equal a nearby T6 hide's
        // base hp. Without the enchant guard the hp window search rehomes it onto
        // the T6 row. With the guard, the enchanted lookup trusts the typeId map.
        const foxIdx = rawMobs.findIndex(m => m.u === 'T2_MOB_HIDE_MISTS_FOX');
        const houndIdx = rawMobs.findIndex(m => m.u === 'T6_MOB_HIDE_MISTS_HOUND');
        expect(foxIdx).toBeGreaterThan(-1);
        expect(houndIdx).toBeGreaterThan(-1);
        const collidingHp = rawMobs[houndIdx].hp; // T6 base hp the scaled fox hp lands on

        const enchanted = db.getMobInfo(foxIdx + OFFSET, collidingHp, true);
        expect(enchanted?.uniqueName).toBe('T2_MOB_HIDE_MISTS_FOX');
        expect(enchanted?.tier).toBe(2);
        // The guard must not pollute calibration with the bogus collision delta.
        expect(db.getCalibrationStats().delta).toBe(0);

        // Sanity: the same collision without the flag is exactly the wrong T6
        // adoption the guard prevents.
        expect(db.getMobInfo(foxIdx + OFFSET, collidingHp, false)?.tier).toBe(6);
    });
});
