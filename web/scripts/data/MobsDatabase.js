/**
 * Mobs Database - Phase 5
 * Parses mobs.json and provides living resource type identification
 * Follows the same pattern as HarvestablesDatabase
 *
 * OBJECTIF: Remplacer MobsInfo.js (235 TypeIDs hardcodés) par cette database
 *
 * Structure mobs.json:
 * {
 *   "Mobs": {
 *     "Mob": [
 *       {
 *         "@uniquename": "KEEPCRITTER_FOREST_SWAMP_GREEN_HIDE",
 *         "@tier": "4",
 *         "Loot": {
 *           "Harvestable": { "@type": "HIDE", "@tier": "4" }
 *         }
 *       }
 *     ]
 *   }
 * }
 */

import {CATEGORIES} from '../constants/LoggerConstants.js';

export class MobsDatabase {
    // Anchor: wire 444 (hp=20) -> idx 428 = T1_MOB_HIDE_SWAMP_TOAD.
    static OFFSET = 16;

    // Game patches insert/remove rows in the upstream mob table, so wire typeIds
    // drift away from a stale local dump (this already happened once: OFFSET 15 -> 16).
    // Every NewMob event carries maxHP (parameters[13]) and every dump row has hp,
    // so lookups are re-anchored at runtime by matching observed hp near the
    // expected row (CALIBRATION_WINDOW), with a vote-based consensus delta used
    // for spawns whose hp cannot be matched (e.g. enchant-scaled HP).
    static CALIBRATION_WINDOW = 40;
    static CALIBRATION_MIN_VOTES = 3;
    static CALIBRATION_DECAY_LIMIT = 400;

    constructor() {
        /**
         * Map<typeId, {type: string, tier: number, uniqueName: string, category: string}>
         * typeId = server TypeID (index + OFFSET)
         */
        this.mobsById = new Map();

        /**
         * Map<uniqueName, typeId>
         * Pour lookup inverse par nom
         */
        this.mobsByName = new Map();

        /**
         * Set des typeIds qui sont des ressources (ont Loot.Harvestable)
         */
        this.harvestableTypeIds = new Set();

        this.isLoaded = false;
        this.stats = {
            totalMobs: 0,
            harvestables: 0,
            loadTimeMs: 0
        };

        /**
         * Runtime offset calibration state.
         * calibrationDelta d means: the live server row for wire typeId sits at
         * local key (typeId - d), i.e. the server table has d extra rows before it.
         */
        this.calibrationDelta = 0;
        this.deltaVotes = new Map();
        this.calibrationObservations = 0;
    }

    /**
     * Load and parse mobs.json
     * @param {string} jsonPath - Path to mobs.json file
     */
    async load(jsonPath) {
        const startTime = performance.now();

        try {
            window.logger?.info(
                CATEGORIES.SYSTEM,
                'MobsDatabaseLoading',
                { path: jsonPath }
            );

            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch mobs: ${response.status}`);
            }

            const mobs = await response.json();

            if (!Array.isArray(mobs)) {
                throw new Error('Invalid mobs.min.json structure: expected array');
            }

            this._parseMobs(mobs);

            this.stats.loadTimeMs = Math.round(performance.now() - startTime);
            this.isLoaded = true;

            // Log sample harvestable mobs for verification
            const sampleHarvestables = [];
            for (const typeId of Array.from(this.harvestableTypeIds).slice(0, 10)) {
                const info = this.mobsById.get(typeId);
                if (info) {
                    sampleHarvestables.push({
                        typeId,
                        type: info.type,
                        tier: info.tier,
                        uniqueName: info.uniqueName
                    });
                }
            }

            window.logger?.info(
                CATEGORIES.SYSTEM,
                'MobsDatabaseLoaded',
                {
                    totalMobs: this.stats.totalMobs,
                    harvestables: this.stats.harvestables,
                    loadTimeMs: this.stats.loadTimeMs,
                    sampleHarvestables
                }
            );

        } catch (error) {
            window.logger?.error(
                CATEGORIES.SYSTEM,
                'MobsDatabaseLoadError',
                {
                    error: error.message,
                    stack: error.stack,
                    path: jsonPath
                }
            );
            throw error;
        }
    }

    /**
     * Parse mobs array from JSON
     * @private
     * @param {Array} mobs - Array of mob objects from mobs.json
     */
    _parseMobs(mobs) {
        // Server TypeID = index + OFFSET
        mobs.forEach((mob, index) => {
            const typeId = index + MobsDatabase.OFFSET;
            const uniqueName = mob.u || '';
            const tier = mob.t || 0;
            const category = mob.c || '';
            const namelocatag = mob.n || '';

            let resourceType = null;
            let resourceTier = tier;

            if (mob.l) {
                resourceType = this._normalizeResourceType(mob.l);
                resourceTier = mob.lt || tier;

                if (resourceType) {
                    this.harvestableTypeIds.add(typeId);
                    this.stats.harvestables++;
                }
            }

            this.mobsById.set(typeId, {
                type: resourceType,
                tier: resourceTier,
                combatTier: tier,
                lootType: mob.l || null,
                hp: Number.isFinite(mob.hp) ? mob.hp : null,
                uniqueName,
                category,
                namelocatag,
                isHarvestable: !!resourceType
            });

            this.mobsByName.set(uniqueName, typeId);
            this.stats.totalMobs++;
        });
    }

    /**
     * Normalize resource type from mobs.json to match our naming
     * @private
     * @param {string} type - Type from Loot.Harvestable (HIDE, HIDE_CRITTER, FIBER_GUARDIAN, etc.)
     * @returns {string|null} Normalized type (Hide, Log, Fiber, Rock, Ore) or null if not a resource
     *
     * Types in mobs.json:
     * - HIDE, HIDE_CRITTER, HIDE_GUARDIAN, HIDE_MINIGUARDIAN, HIDE_TREASURE, etc.
     * - FIBER_CRITTER, FIBER_GUARDIAN, FIBER_MINIGUARDIAN, FIBER_TREASURE, etc.
     * - WOOD_CRITTER, WOOD_GUARDIAN, WOOD_MINIGUARDIAN, WOOD_TREASURE, etc.
     * - ROCK_CRITTER, ROCK_GUARDIAN, ROCK_MINIGUARDIAN, etc.
     * - ORE_CRITTER, ORE_GUARDIAN, ORE_MINIGUARDIAN, ORE_TREASURE, etc.
     * - SILVERCOINS_* (NOT resources, ignored)
     */
    _normalizeResourceType(type) {
        if (!type) return null;

        const normalized = type.toUpperCase();

        // Ignore non-resource types (silver coins, etc.)
        if (normalized.startsWith('SILVERCOINS') || normalized.startsWith('DEADRAT')) {
            return null;
        }

        // Check for resource type prefix
        // Order matters: check longer prefixes first to avoid false matches
        if (normalized.startsWith('HIDE') || normalized.startsWith('LEATHER')) {
            return 'Hide';
        }
        if (normalized.startsWith('FIBER')) {
            return 'Fiber';
        }
        if (normalized.startsWith('WOOD')) {
            return 'Log';
        }
        if (normalized.startsWith('ROCK') || normalized.startsWith('STONE')) {
            return 'Rock';
        }
        if (normalized.startsWith('ORE')) {
            return 'Ore';
        }

        return null;
    }

    /**
     * Get mob info by typeId, correcting for game-data drift.
     *
     * When observedMaxHp is provided (NewMob parameters[13]), the lookup is
     * anchored on hp: if the row at the consensus delta does not match, nearby
     * rows (within CALIBRATION_WINDOW) with that exact hp are considered and
     * the closest one to the consensus is used. Each hp-confirmed lookup votes
     * for its delta; the winning delta also serves spawns without a usable hp
     * (enchanted mobs have scaled HP and never match).
     *
     * @param {number} typeId - The wire mob type ID
     * @param {number} [observedMaxHp] - Real max HP from the spawn event, if known
     * @param {boolean} [isEnchanted] - True if the mob carries an enchant (>0)
     * @returns {Object|null} Mob info or null if not found
     */
    getMobInfo(typeId, observedMaxHp, isEnchanted = false) {
        const primary = this.mobsById.get(typeId - this.calibrationDelta) || null;

        if (isEnchanted) {
            // Enchant-scaled hp can't verify this lookup, so it blindly trusts
            // whatever calibrationDelta currently is. That's fine for most
            // rows, but ROCK/ORE/FIBER/WOOD "_ROADS" critters (and other
            // families) share the *exact same* hp at the same tier by game
            // design — if the delta is off by exactly the gap between two
            // such rows (observed drifts of ~20-30 happen in real sessions),
            // an enchanted Rock could get silently reported as Fiber with no
            // way to catch it. Detect that this exact row has a same-hp,
            // same-tier, different-type sibling nearby and refuse to name a
            // specific material in that case — safer than guessing wrong.
            if (primary && this._hasTypeAmbiguousSibling(typeId - this.calibrationDelta, primary)) {
                return {...primary, type: null, isHarvestable: false};
            }
            return primary;
        }

        const hp = Number(observedMaxHp);
        if (!Number.isFinite(hp) || hp <= 0) return primary;

        if (primary && primary.hp === hp) {
            this._voteDeltas([this.calibrationDelta]);
            return primary;
        }

        const searchWindow = MobsDatabase.CALIBRATION_WINDOW;
        const candidates = [];
        for (let d = -searchWindow; d <= searchWindow; d++) {
            const row = this.mobsById.get(typeId - d);
            if (row && row.hp === hp) candidates.push(d);
        }
        if (candidates.length === 0) {
            if (primary && this._hasTypeAmbiguousSibling(typeId - this.calibrationDelta, primary)) {
                return {...primary, type: null, isHarvestable: false};
            }
            return primary;
        }

        // Prefer the candidate closest to the current consensus (falling back
        // to proximity to zero, the vendored anchor) among the hp-confirmed
        // rows. `primary` is not an option for the final return here: we only
        // reach this branch because primary.hp !== hp, so it is a
        // confirmed-wrong guess, while every candidate's hp is confirmed correct.
        let best = candidates[0];
        for (const d of candidates) {
            if (this._deltaDistance(d) < this._deltaDistance(best)) best = d;
        }
        const bestRow = this.mobsById.get(typeId - best);

        // Duplicate-hp rows are common by game design across totally different
        // resource types at the same tier (e.g. WOOD/ROCK/ORE/FIBER critters,
        // or a decorative VANITY_SUMMON pet, sharing a HIDE critter's hp and
        // tier). Such a window is not trustworthy evidence of the *server's*
        // typeId offset: voting on it every time one of these very common
        // mobs spawns can, over a session, outvote the real delta and corrupt
        // identification for unrelated mobs elsewhere ("pelego T1 marcado como
        // T7", "tronco confundido com pelego"). Only feed the calibration
        // vote from windows where every hp match agrees on identity.
        const coherent = candidates.every(d => {
            const row = this.mobsById.get(typeId - d);
            return row.isHarvestable === bestRow.isHarvestable
                && row.type === bestRow.type
                && row.tier === bestRow.tier;
        });

        if (coherent) {
            // The true delta is always among the candidates here; voting for
            // all of them lets the one delta consistent across spawns win the
            // consensus within a few observations.
            this._voteDeltas(candidates);

            // Voting may have just moved the consensus — if it now explains
            // this spawn, trust it.
            if (candidates.includes(this.calibrationDelta)) {
                return this.mobsById.get(typeId - this.calibrationDelta);
            }
            return bestRow;
        }

        window.logger?.debug(CATEGORIES.SYSTEM, 'MobsDatabaseIncoherentHpMatch', {
            typeId, hp, candidates, chosenDelta: best,
        });

        // Some duplicate-hp windows are a genuine game-design ambiguity, not
        // just a calibration artifact: distinct resource-type critters (e.g.
        // ROCK/ORE/FIBER "_ROADS" variants) share the *exact same* hp at the
        // same tier by design. No calibration delta can tell them apart from
        // hp alone — the true row could be any of them. Picking one anyway
        // (as the coherent path does) risks reporting a wrong material
        // (Ore shown as Fiber), which is worse for the player than showing
        // nothing: don't guess a specific resource type in that case.
        const harvestableTypes = new Set(
            candidates
                .map(d => this.mobsById.get(typeId - d))
                .filter(row => row.isHarvestable)
                .map(row => row.type)
        );
        if (harvestableTypes.size > 1) {
            window.logger?.debug(CATEGORIES.SYSTEM, 'MobsDatabaseTypeAmbiguous', {
                typeId, hp, tier: bestRow.tier, candidateTypes: [...harvestableTypes],
            });
            return {...bestRow, type: null, isHarvestable: false};
        }

        return bestRow;
    }

    /**
     * Check whether some other row within the calibration window shares
     * `row`'s hp and tier but names a different resource type — i.e. hp+tier
     * alone can never disambiguate which of them a given wire id really is.
     * @param {number} key - The mobsById key `row` was found at (typeId - delta)
     * @param {Object} row - The candidate row to check for ambiguous siblings
     * @returns {boolean}
     * @private
     */
    _hasTypeAmbiguousSibling(key, row) {
        if (!row || !row.isHarvestable) return false;
        const searchWindow = MobsDatabase.CALIBRATION_WINDOW;
        for (let offset = -searchWindow; offset <= searchWindow; offset++) {
            if (offset === 0) continue;
            const sibling = this.mobsById.get(key + offset);
            if (sibling && sibling.isHarvestable && sibling.hp === row.hp
                && sibling.tier === row.tier && sibling.type !== row.type) {
                return true;
            }
        }
        return false;
    }

    /**
     * Rank candidate deltas: prefer the one closest to the current consensus,
     * tie-broken by proximity to zero (the vendored anchor).
     * @private
     */
    _deltaDistance(d) {
        return Math.abs(d - this.calibrationDelta) * 1000 + Math.abs(d);
    }

    /**
     * Register the candidate deltas of one hp-confirmed observation and update
     * the consensus. A new delta is adopted once it has enough votes and
     * clearly outvotes both the current delta and the runner-up; the vote
     * table decays so a mid-session game patch can still re-converge.
     * @private
     */
    _voteDeltas(deltas) {
        for (const d of deltas) {
            this.deltaVotes.set(d, (this.deltaVotes.get(d) || 0) + 1);
        }
        this.calibrationObservations++;

        if (this.calibrationObservations > MobsDatabase.CALIBRATION_DECAY_LIMIT) {
            this.calibrationObservations = 0;
            for (const [d, votes] of this.deltaVotes) {
                const halved = Math.floor(votes / 2);
                if (halved > 0) this.deltaVotes.set(d, halved);
                else this.deltaVotes.delete(d);
            }
        }

        let bestDelta = this.calibrationDelta;
        let bestVotes = this.deltaVotes.get(this.calibrationDelta) || 0;
        for (const [d, votes] of this.deltaVotes) {
            if (votes > bestVotes) {
                bestDelta = d;
                bestVotes = votes;
            }
        }

        if (bestDelta === this.calibrationDelta) return;
        if (bestVotes < MobsDatabase.CALIBRATION_MIN_VOTES) return;
        const currentVotes = this.deltaVotes.get(this.calibrationDelta) || 0;
        if (bestVotes < currentVotes * 2) return;
        let runnerUpVotes = 0;
        for (const [d, votes] of this.deltaVotes) {
            if (d !== bestDelta && votes > runnerUpVotes) runnerUpVotes = votes;
        }
        if (bestVotes < runnerUpVotes + 2) return;

        window.logger?.warn(CATEGORIES.SYSTEM, 'MobsDatabaseOffsetDrift', {
            previousDelta: this.calibrationDelta,
            newDelta: bestDelta,
            votes: bestVotes,
            effectiveOffset: MobsDatabase.OFFSET + bestDelta,
        });
        this.calibrationDelta = bestDelta;
    }

    /**
     * Current calibration state, for diagnostics.
     * @returns {{delta: number, observations: number, votes: Object<string, number>}}
     */
    getCalibrationStats() {
        return {
            delta: this.calibrationDelta,
            observations: this.calibrationObservations,
            votes: Object.fromEntries(this.deltaVotes),
        };
    }

    /**
     * Check if typeId is a harvestable resource
     * @param {number} typeId - The mob type ID
     * @returns {boolean} True if this mob drops a harvestable resource
     */
    isHarvestable(typeId) {
        return !!this.getMobInfo(typeId)?.isHarvestable;
    }

    /**
     * Get resource info if mob is harvestable.
     *
     * Used for dead critters turned into harvestable corpses, which carry no
     * HP to verify the typeId lookup against (unlike live mobs via
     * getMobInfo's observedMaxHp). If the caller knows the server-reported
     * loot tier (reliable — it comes straight off the wire, not from this
     * calibrated table), pass it as `expectedTier`: it's used the same way
     * observedMaxHp is elsewhere, to catch and correct a drifted calibration
     * instead of silently returning the wrong resource type (e.g. "minério
     * marcado com ícone errado").
     * @param {number} typeId - The mob type ID
     * @param {number} [expectedTier] - Server-reported loot tier, if known
     * @returns {{type: string, tier: number}|null} Resource info or null
     */
    getResourceInfo(typeId, expectedTier) {
        const info = this.getMobInfo(typeId);
        if (info && info.isHarvestable && (!Number.isFinite(expectedTier) || info.tier === expectedTier)) {
            return {
                type: info.type,
                tier: info.tier
            };
        }

        if (Number.isFinite(expectedTier)) {
            // Tie-break by proximity to zero (the vendored anchor), NOT to the
            // current calibrationDelta: that delta is exactly what we're
            // trying to correct for here, so weighting toward it would just
            // reintroduce the same corruption this check exists to catch.
            const searchWindow = MobsDatabase.CALIBRATION_WINDOW;
            let best = null;
            for (let d = -searchWindow; d <= searchWindow; d++) {
                const row = this.mobsById.get(typeId - d);
                if (row && row.isHarvestable && row.tier === expectedTier) {
                    if (!best || Math.abs(d) < Math.abs(best.d)) best = {d, row};
                }
            }
            if (best) return {type: best.row.type, tier: best.row.tier};
        }

        if (info && info.isHarvestable) {
            return {
                type: info.type,
                tier: info.tier
            };
        }
        return null;
    }

    /**
     * Get typeId by unique name
     * @param {string} uniqueName - The mob unique name
     * @returns {number|null} TypeId or null if not found
     */
    getTypeIdByName(uniqueName) {
        return this.mobsByName.get(uniqueName) ?? null;
    }
}

