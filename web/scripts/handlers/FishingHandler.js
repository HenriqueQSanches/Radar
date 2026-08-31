import {CATEGORIES} from "../constants/LoggerConstants.js";

class Fish
{
    constructor(id, posX, posY, type, sizeSpawned = 0, sizeLeftToSpawn = 0)
    {
        this.id = id;
        this.posX = posX;
        this.posY = posY;
        this.type = type;
        this.sizeSpawned = sizeSpawned;
        this.sizeLeftToSpawn = sizeLeftToSpawn;
        this.totalSize = this.sizeSpawned + this.sizeLeftToSpawn;
        this.hX = 0;
        this.hY = 0;
        this.lastUpdateTime = Date.now();
    }

    touch() {
        this.lastUpdateTime = Date.now();
    }
}

export class FishingHandler
{
    constructor()
    {
        this.fishes = [];
    }

    // cachedPosition: [x, y] from EventRouter's event-19 position cache, used when this
    // event no longer carries its own coordinates (see below).
    newFishEvent(Parameters, cachedPosition)
    {
        const id = Parameters[0];
        let posX, posY, type, sizeSpawned, sizeLeftToSpawn, trustPositionUpdate;

        if (Array.isArray(Parameters[1])) {
            // Original shape (pre game-update): id, [x,y], sizeSpawned, sizeLeftToSpawn, type.
            // The game sends this id's real position every time, so later updates can be
            // trusted too.
            type = Parameters[4];
            if (!type) return;
            [posX, posY] = Parameters[1];
            sizeSpawned = Parameters[2];
            sizeLeftToSpawn = Parameters[3];
            trustPositionUpdate = true;
        } else if (cachedPosition) {
            // Current shape: id, chargesRemaining — no position, no type. The game now
            // sends this entity's position earlier via a generic event 19 broadcast;
            // EventRouter caches it by id and hands it to us here. Photon recycles ids
            // constantly, so a LATER event 19 for this same id could belong to a totally
            // different, moving entity (a player walking by, say) — trustPositionUpdate=false
            // tells upsertFish to only use this position while creating the fish, never to
            // relocate one already on the map.
            [posX, posY] = cachedPosition;
            type = '';
            sizeSpawned = 0;
            sizeLeftToSpawn = Parameters[1];
            trustPositionUpdate = false;
        } else {
            // No cached position for this id yet — nothing to draw.
            return;
        }

        if (!Number.isFinite(posX) || !Number.isFinite(posY)) return;

        window.logger?.debug(CATEGORIES.FISHING, 'fish_spawn', {
            id, type, posX, posY, sizeSpawned, sizeLeftToSpawn,
            total: sizeSpawned + sizeLeftToSpawn
        });

        this.upsertFish(
            id,
            posX,
            posY,
            type,
            sizeSpawned,
            sizeLeftToSpawn,
            trustPositionUpdate,
        )
    }

    upsertFish(id, posX, posY, type, sizeSpawned, sizeLeftToSpawn, trustPositionUpdate = true)
    {
        const existing = this.fishes.find(f => f.id === id);
        if (existing) {
            // Fish don't move — only relocate an already-known one when the caller trusts this
            // update's position (see newFishEvent). Otherwise keep the position we first saw it
            // at, since a stale-shape tick's "position" may really belong to whatever this
            // recycled id now points at.
            if (trustPositionUpdate) {
                existing.posX = posX;
                existing.posY = posY;
            }
            existing.sizeSpawned = sizeSpawned;
            existing.sizeLeftToSpawn = sizeLeftToSpawn;
            existing.totalSize = sizeSpawned + sizeLeftToSpawn;
            existing.touch();
            return;
        }

        const fish = new Fish(id, posX, posY, type, sizeSpawned, sizeLeftToSpawn);
        this.fishes.push(fish);
    }

    fishingEnd(Parameters)
    {
        window.logger?.debug(CATEGORIES.FISHING, 'fishing_end', {
            parameters: Parameters
        });

        const id = Parameters[0];

        if (!this.fishes.some(fish => fish.id === id))
            return;

        this.removeFish(id);
    }

    removeFish(id)
    {
        this.fishes = this.fishes.filter(fish => fish.id !== id);
    }

    Clear()
    {
        this.fishes = [];
    }

    cleanupStaleEntities(maxAgeMs = 120000) {
        const now = Date.now();
        const before = this.fishes.length;
        this.fishes = this.fishes.filter(fish =>
            (now - fish.lastUpdateTime) < maxAgeMs
        );
        const removed = before - this.fishes.length;
        if (removed > 0) {
            window.logger?.debug(CATEGORIES.FISHING, 'fish_cleanup', {removed, maxAgeMs});
        }
        return removed;
    }
}