import {DrawingUtils} from "../utils/DrawingUtils.js";
import settingsSync from "../utils/SettingsSync.js";
import {CATEGORIES} from "../constants/LoggerConstants.js";

export class FishingDrawing extends DrawingUtils
{
    constructor() {
        super();
        this.lastVisibleCount = 0;
        this._lastGateState = undefined;
    }

    interpolate(fishes, lpX, lpY, t)
    {
        for (const fish of fishes)
        {
            this.interpolateEntity(fish, lpX, lpY, t);
        }
    }

    draw(ctx, fishes)
    {
        this.lastVisibleCount = 0;
        const gateOpen = settingsSync.getBool("settingFishing");

        // One log per gate flip rather than per frame — tells us whether pools known to the
        // handler exist at all vs. are just hidden by the settingFishing checkbox.
        if (gateOpen !== this._lastGateState) {
            this._lastGateState = gateOpen;
            window.logger?.debug(CATEGORIES.FISHING, 'FishingRenderGate', {
                settingFishing: gateOpen, knownPoolCount: fishes.length,
            });
        }

        if (!gateOpen) return;
        const showCount = settingsSync.getBool("settingResourceCount");
        for (const fish of fishes)
        {
            const point = this.transformPoint(fish.hX, fish.hY);

            this.DrawCustomImage(ctx, point.x, point.y, "fish", "Resources", 18);
            if (showCount) {
                // The post game-update protocol no longer distinguishes "already caught" from
                // "left to spawn" reliably (see FishingHandler.newFishEvent) — show a single
                // capacity count instead of a spawned/total fraction that would misleadingly
                // read as "0 available" for a fresh, untouched pool.
                const label = fish.isNewFormat ? `${fish.totalSize}` : `${fish.sizeSpawned}/${fish.totalSize}`;
                this.drawText(point.x, point.y + this.getMarkerSize(18), label, ctx);
            }
            this.lastVisibleCount++;
        }
    }
}