import {CanvasManager} from './CanvasManager.js';
import {CATEGORIES} from "../constants/LoggerConstants.js";
import settingsSync from "./SettingsSync.js";
import zonesDatabase from "../data/ZonesDatabase.js";
import {shouldRenderLivingResource, shouldRenderStaticResource} from './LivingResourceFilter.js';
import {EnemyType} from '../handlers/MobsHandler.js';
import {spriteCache} from './SpriteCache.js';

// The loop used to repaint all four canvas layers 30 times a second whether or not
// anything had changed, which kept the GPU (the one resource the game is already
// saturating) busy even with the player standing still in town. Now a frame is only
// drawn while something recently happened (markDirty), while an animation is running,
// or once a second as a safety net.
//
// SETTLE_MS: how long after the last change the loop keeps drawing, so the position
// interpolation (lerp towards the target, t = dt/100ms) has visibly settled before the
// radar goes quiet.
const SETTLE_MS = 500;
// Upper bound on how stale the picture can get if some change ever slips past
// markDirty: an idle radar still redraws once a second instead of 30 times.
const IDLE_FRAME_INTERVAL_MS = 1000;

export class RadarRenderer {
    constructor(dependencies) {
        this.handlers = dependencies.handlers;
        this.drawings = dependencies.drawings;
        this.drawingUtils = dependencies.drawingUtils;

        this.canvasManager = new CanvasManager();
        this.contexts = {};

        this.lpX = 0;
        this.lpY = 0;
        this.map = null;

        this.previousTime = performance.now();
        this.animationFrameId = null;

        this.TARGET_FPS = 30;
        this.FRAME_TIME = 1000 / this.TARGET_FPS;
        this.CLUSTER_UPDATE_INTERVAL = 2000;
        this.lastFrameTime = 0;
        this.lastClusterUpdate = 0;
        this.cachedClusters = null;

        this.dirtyUntil = 0;
        this.lastRenderTime = 0;
        this._onSettingChanged = () => this.markDirty();
        this._onViewportChanged = () => this.markDirty();
    }

    /**
     * Initialize the renderer (setup canvases)
     */
    initialize() {
        const { contexts } = this.canvasManager.initialize();
        this.contexts = contexts;

        settingsSync.on?.('*', this._onSettingChanged);
        if (typeof window !== 'undefined') {
            window.addEventListener('canvasSizeChanged', this._onViewportChanged);
            window.addEventListener('resize', this._onViewportChanged);
        }
        this.markDirty();

        window.logger?.info(CATEGORIES.MAP, 'RadarRendererInitialized', {});
    }

    /**
     * Flag that something drawn on the radar changed, so the next frames are rendered.
     */
    markDirty() {
        this.dirtyUntil = performance.now() + SETTLE_MS;
    }

    /**
     * Update local player position
     * @param {number} x - Player X coordinate
     * @param {number} y - Player Y coordinate
     */
    setLocalPlayerPosition(x, y) {
        this.lpX = x;
        this.lpY = y;
        this.markDirty();
    }

    /**
     * Update current map
     * @param {Object} mapData - Map object
     */
    setMap(mapData) {
        this.map = mapData;
        this.markDirty();
    }


    /**
     * Start the game loop
     */
    start() {
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
        window.logger?.info(CATEGORIES.MAP, 'RadarRendererGameLoopStarted', {});
    }

    /**
     * Stop the game loop and cleanup resources
     */
    stop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            window.logger?.info(CATEGORIES.MAP, 'RadarRendererGameLoopStopped', {});
        }

        settingsSync.off?.('*', this._onSettingChanged);
        if (typeof window !== 'undefined') {
            window.removeEventListener('canvasSizeChanged', this._onViewportChanged);
            window.removeEventListener('resize', this._onViewportChanged);
        }

        this.canvasManager?.destroy();
    }

    /**
     * Main game loop - runs every frame (throttled to TARGET_FPS)
     */
    gameLoop() {
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());

        const currentTime = performance.now();

        const elapsed = currentTime - this.lastFrameTime;
        if (elapsed < this.FRAME_TIME) return;

        this.lastFrameTime = currentTime - (elapsed % this.FRAME_TIME);

        if (!this.shouldRender(currentTime)) return;

        this.update();
        this.render();
        this.lastRenderTime = currentTime;
        window.pipManager?.onRadarRendered();
    }

    shouldRender(now) {
        if (now < this.dirtyUntil) return true;
        if (now - this.lastRenderTime >= IDLE_FRAME_INTERVAL_MS) return true;
        return this.hasActiveAnimation(now);
    }

    // Overlays that animate on their own clock (no event behind them) still need every frame.
    hasActiveAnimation(now) {
        const players = this.handlers.playersHandler;

        if (settingsSync.getBool('settingFlash') && players?.lastFlashAt) {
            const elapsed = now - players.lastFlashAt;
            if (elapsed >= 0 && elapsed <= (players.FLASH_DURATION_MS || 300)) return true;
        }

        if (settingsSync.getBool('settingFlashDangerousPlayer')
            && (players?.getThreatPlayers?.()?.length ?? 0) > 0) {
            return true;
        }

        if (settingsSync.getBool('settingResourceClusters') && (this.cachedClusters?.length ?? 0) > 0) {
            return true;
        }

        return false;
    }

    /**
     * Update phase - interpolate entity positions
     */
    update() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.previousTime;
        const t = Math.min(1, deltaTime / 100);

        if (settingsSync.getBool('settingShowMap', true) && this.drawings.mapsDrawing) {
            this.drawings.mapsDrawing.interpolate(this.map, this.lpX, this.lpY, t);
        }

        if (this.handlers.harvestablesHandler && this.drawings.harvestablesDrawing) {
            this.handlers.harvestablesHandler.removeNotInRange(this.lpX, this.lpY);
            this.drawings.harvestablesDrawing.interpolate(
                this.handlers.harvestablesHandler.harvestableList,
                this.lpX,
                this.lpY,
                t
            );
        }

        if (this.handlers.mobsHandler && this.drawings.mobsDrawing) {
            this.drawings.mobsDrawing.interpolate(
                this.handlers.mobsHandler.mobsList,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.playersHandler && this.drawings.playersDrawing) {
            this.drawings.playersDrawing.interpolate(
                this.handlers.playersHandler.getFilteredPlayers(),
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.chestsHandler && this.drawings.chestsDrawing) {
            this.drawings.chestsDrawing.interpolate(
                this.handlers.chestsHandler.chestsList,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.wispCageHandler && this.drawings.wispCageDrawing) {
            this.drawings.wispCageDrawing.interpolate(
                this.handlers.wispCageHandler.cages,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.mistsDungeonHandler && this.drawings.mistsDungeonDrawing) {
            this.drawings.mistsDungeonDrawing.interpolate(
                this.handlers.mistsDungeonHandler.portalList,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.mobsHandler && this.drawings.mistsWispDrawing) {
            this.drawings.mistsWispDrawing.interpolate(
                this.handlers.mobsHandler.mistList,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.fishingHandler && this.drawings.fishingDrawing) {
            this.drawings.fishingDrawing.interpolate(
                this.handlers.fishingHandler.fishes,
                this.lpX, this.lpY, t
            );
        }

        if (this.handlers.dungeonsHandler && this.drawings.dungeonsDrawing) {
            this.drawings.dungeonsDrawing.interpolate(
                this.handlers.dungeonsHandler.dungeonList,
                this.lpX,
                this.lpY,
                t
            );
        }

        this.previousTime = currentTime;
    }

    /**
     * Render phase - draw all entities
     */
    render() {
        this.canvasManager.clearDynamicLayers();

        const contextMap = this.contexts.mapCanvas;
        const context = this.contexts.drawCanvas;

        if (this.drawings.mapsDrawing && contextMap) {
            this.drawings.mapsDrawing.draw(contextMap, this.map);
        }

        // Cluster detection with caching (recalculated every CLUSTER_UPDATE_INTERVAL)
        let clustersForInfo = null;
        if (settingsSync.getBool('settingResourceClusters') && context) {
            const currentTime = performance.now();
            const timeSinceLastUpdate = currentTime - this.lastClusterUpdate;

            if (!this.cachedClusters || timeSinceLastUpdate > this.CLUSTER_UPDATE_INTERVAL) {
                try {
                    const merged = this._collectClusterCandidates();

                    this.cachedClusters = this.drawingUtils.detectClusters(
                        merged,
                        settingsSync.getNumber('settingClusterRadius'),
                        settingsSync.getNumber('settingClusterMinSize')
                    );
                    this.lastClusterUpdate = currentTime;
                } catch (e) {
                    window.logger?.error(CATEGORIES.RENDERING, 'cluster_compute_failed', e);
                }
            }

            clustersForInfo = this.cachedClusters;

            if (clustersForInfo) {
                for (const cluster of clustersForInfo) {
                    if (typeof this.drawingUtils?.drawClusterRingsFromCluster === 'function') {
                        this.drawingUtils.drawClusterRingsFromCluster(context, cluster);
                    } else if (typeof this.drawingUtils?.drawClusterIndicatorFromCluster === 'function') {
                        this.drawingUtils.drawClusterIndicatorFromCluster(context, cluster);
                    }
                }
            }
        }

        if (context) {
            if (this.drawings.harvestablesDrawing && this.handlers.harvestablesHandler) {
                this.drawings.harvestablesDrawing.invalidate(
                    context,
                    this.handlers.harvestablesHandler.harvestableList
                );
            }

            if (this.drawings.mobsDrawing && this.handlers.mobsHandler) {
                this.drawings.mobsDrawing.invalidate(
                    context,
                    this.handlers.mobsHandler.mobsList
                );
            }

            if (this.drawings.chestsDrawing && this.handlers.chestsHandler) {
                this.drawings.chestsDrawing.invalidate(
                    context,
                    this.handlers.chestsHandler.chestsList
                );
            }

            if (this.drawings.playersDrawing && this.handlers.playersHandler) {
                this.drawings.playersDrawing.invalidate(
                    context,
                    this.handlers.playersHandler.getFilteredPlayers()
                );
            }

            if (this.drawings.wispCageDrawing && this.handlers.wispCageHandler) {
                this.drawings.wispCageDrawing.draw(
                    context,
                    this.handlers.wispCageHandler.cages
                );
            }

            if (this.drawings.mistsDungeonDrawing && this.handlers.mistsDungeonHandler) {
                this.drawings.mistsDungeonDrawing.draw(
                    context,
                    this.handlers.mistsDungeonHandler.portalList
                );
            }

            if (this.drawings.mistsWispDrawing && this.handlers.mobsHandler) {
                this.drawings.mistsWispDrawing.invalidate(
                    context,
                    this.handlers.mobsHandler.mistList
                );
            }

            if (this.drawings.fishingDrawing && this.handlers.fishingHandler) {
                this.drawings.fishingDrawing.draw(
                    context,
                    this.handlers.fishingHandler.fishes
                );
            }

            if (this.drawings.dungeonsDrawing && this.handlers.dungeonsHandler) {
                this.drawings.dungeonsDrawing.draw(
                    context,
                    this.handlers.dungeonsHandler.dungeonList
                );
            }
        }

        if (clustersForInfo?.length && context) {
            for (const cluster of clustersForInfo) {
                try {
                    if (typeof this.drawingUtils?.drawClusterInfoBox === 'function') {
                        this.drawingUtils.drawClusterInfoBox(context, cluster);
                    } else if (typeof this.drawingUtils?.drawClusterIndicatorFromCluster === 'function') {
                        this.drawingUtils.drawClusterIndicatorFromCluster(context, cluster);
                    }
                } catch (e) {
                    window.logger?.error(CATEGORIES.RENDERING, 'cluster_draw_failed', e);
                }
            }
        }

        this.renderUI();
    }

    /**
     * Render UI overlay elements (zone, counters, etc.)
     */
    renderUI() {
        const ctx = this.contexts.uiCanvas;
        if (!ctx) return;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        this.renderDistanceRings(ctx);
        this.renderZoneInfo(ctx);
        this.renderStatsBox(ctx);
        this.renderThreatBorder(ctx);
        this.renderFlashOverlay(ctx);
    }

    renderFlashOverlay(ctx) {
        if (!settingsSync.getBool('settingFlash')) return;
        const handler = this.handlers.playersHandler;
        if (!handler?.lastFlashAt) return;

        const duration = handler.FLASH_DURATION_MS || 300;
        const elapsed = performance.now() - handler.lastFlashAt;
        if (elapsed < 0 || elapsed > duration) return;

        const alpha = 0.6 * (1 - elapsed / duration);
        ctx.save();
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }

    /**
     * Render distance rings centered on player. Dashed arcs are re-stroked by the CPU
     * on every call, so the rings are rasterized once per (canvas size, zoom) and blitted.
     */
    renderDistanceRings(ctx) {
        const canvasSize = ctx.canvas.width;
        const isSmall = typeof window !== 'undefined' && window.innerWidth < 640;
        const zoomLevel = isSmall ? 0.9 : (settingsSync.getFloat('settingRadarZoom') || 1.0);

        const sprite = spriteCache.get(`rings|${canvasSize}|${zoomLevel}`, () => {
            const made = spriteCache.createCanvas(canvasSize, canvasSize);
            if (!made) return null;
            this.paintDistanceRings(made.ctx, canvasSize, zoomLevel);
            return {canvas: made.canvas};
        });
        if (sprite) {
            ctx.drawImage(sprite.canvas, 0, 0);
            return;
        }
        this.paintDistanceRings(ctx, canvasSize, zoomLevel);
    }

    paintDistanceRings(ctx, canvasSize, zoomLevel) {
        const center = canvasSize / 2;
        const distances = [10, 20];
        const pixelsPerMeter = (canvasSize / 60) * zoomLevel;

        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;

        distances.forEach(dist => {
            const radius = dist * pixelsPerMeter;
            if (radius > center - 5) return;

            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.font = '9px monospace';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${dist}m`, center + radius + 4, center);
            ctx.setLineDash([4, 6]);
        });

        ctx.restore();
    }

    renderZoneInfo(ctx) {
        if (!this.map?.id) return;

        const zone = zonesDatabase.getZone(this.map.id);
        const zoneName = zone?.name || this.map.id;
        const tier = zone?.tier ? `T${zone.tier}` : '';
        const pvpType = zone?.pvpType || 'safe';

        const pvpStyles = {
            'black': {icon: '\u{1F480}', color: '#ff4444'},
            'red': {icon: '\u{2694}️', color: '#ff8800'},
            'yellow': {icon: '\u{1F536}', color: '#ffff00'},
            'safe': {icon: '\u{1F6E1}️', color: '#44ff44'}
        };
        const style = pvpStyles[pvpType] || pvpStyles.safe;

        const scale = Math.min(1, ctx.canvas.width / 500);
        const fontPx = Math.max(8, Math.round(11 * scale));
        const boxH = Math.round(22 * scale) + 4;
        const zoneText = `${zoneName}${tier ? ` (${tier})` : ''} ${style.icon}`;
        const font = `bold ${fontPx}px monospace`;

        // Box at (10, 10). The sprite keeps a 1px margin around it so the 1px stroke
        // straddling the box edge is not clipped, hence the (9, 9) blit.
        const sprite = spriteCache.get(`zone|${ctx.canvas.width}|${style.color}|${zoneText}`, () => {
            const textWidth = spriteCache.measureTextWidth(font, zoneText);
            if (textWidth === null) return null;
            const made = spriteCache.createCanvas(textWidth + 16 + 2, boxH + 2);
            if (!made) return null;
            this.paintZoneInfo(made.ctx, 1, 1, zoneText, textWidth, boxH, font, style.color);
            return {canvas: made.canvas};
        });
        if (sprite) {
            ctx.drawImage(sprite.canvas, 9, 9);
            return;
        }

        ctx.font = font;
        const textWidth = ctx.measureText(zoneText).width;
        this.paintZoneInfo(ctx, 10, 10, zoneText, textWidth, boxH, font, style.color);
    }

    paintZoneInfo(ctx, x, y, zoneText, textWidth, boxH, font, color) {
        ctx.font = font;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, textWidth + 16, boxH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, textWidth + 16, boxH);

        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(zoneText, x + 8, y + 6);
    }

    /**
     * Render stats box (top right, conditional based on settings)
     */
    renderStatsBox(ctx) {
        const playerCount = this.handlers.playersHandler?.getFilteredPlayers?.()?.length ?? 0;
        const resourceCount = this.drawings.harvestablesDrawing?.lastVisibleCount ?? 0;
        const mobCount = this.drawings.mobsDrawing?.lastVisibleCount ?? 0;

        const stats = [];
        if (settingsSync.getBool('settingShowPlayers')) {
            stats.push({ emoji: '👥', count: playerCount, label: 'players', color: '#ffffff' });
        }
        stats.push({ emoji: '📦', count: resourceCount, label: 'resources', color: '#00d4ff' });
        stats.push({ emoji: '👾', count: mobCount, label: 'mobs', color: '#ff6b6b' });

        const canvasSize = ctx.canvas.width;
        const scale = Math.min(1, canvasSize / 500);
        const fontPx = Math.max(8, Math.round(11 * scale));
        const lineHeight = Math.max(11, Math.round(14 * scale));
        const padX = Math.max(4, Math.round(8 * scale));
        const padY = Math.max(4, Math.round(8 * scale));
        const font = `bold ${fontPx}px monospace`;
        const labels = stats.map(s => `${s.emoji} ${s.count} ${s.label}`);
        const boxHeight = padY + stats.length * lineHeight + padY;

        const sprite = spriteCache.get(`stats|${canvasSize}|${labels.join('|')}`, () => {
            const widths = labels.map(t => spriteCache.measureTextWidth(font, t));
            if (widths.some(w => w === null)) return null;
            const boxWidth = Math.ceil(Math.max(...widths)) + padX * 2;
            const made = spriteCache.createCanvas(boxWidth + 2, boxHeight + 2);
            if (!made) return null;
            this.paintStatsBox(made.ctx, 1, 1, boxWidth, boxHeight, stats, labels, font, padX, padY, lineHeight);
            return {canvas: made.canvas, boxWidth};
        });
        if (sprite) {
            ctx.drawImage(sprite.canvas, canvasSize - sprite.boxWidth - 10 - 1, 10 - 1);
            return;
        }

        ctx.font = font;
        const maxTextWidth = labels.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
        const boxWidth = Math.ceil(maxTextWidth) + padX * 2;
        this.paintStatsBox(ctx, canvasSize - boxWidth - 10, 10, boxWidth, boxHeight, stats, labels, font, padX, padY, lineHeight);
    }

    paintStatsBox(ctx, boxX, boxY, boxWidth, boxHeight, stats, labels, font, padX, padY, lineHeight) {
        ctx.font = font;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        stats.forEach((stat, index) => {
            ctx.fillStyle = stat.color;
            ctx.fillText(labels[index], boxX + padX, boxY + padY + index * lineHeight);
        });
    }

    /**
     * Render threat border when hostile players detected. The 24px glow is a full-canvas
     * blur; it's rasterized once at full opacity and faded with globalAlpha per frame,
     * which composes to the same pulse without re-blurring 30 times a second.
     */
    renderThreatBorder(ctx) {
        if (!settingsSync.getBool('settingFlashDangerousPlayer')) return;

        const threats = this.handlers.playersHandler?.getThreatPlayers?.() || [];

        if (threats.length === 0) return;

        const pulse = Math.sin(Date.now() / 140) * 0.35 + 0.6;
        const canvasSize = ctx.canvas.width;

        const sprite = spriteCache.get(`threatBorder|${canvasSize}`, () => {
            const made = spriteCache.createCanvas(canvasSize, canvasSize);
            if (!made) return null;
            this.paintThreatBorder(made.ctx, canvasSize, 1);
            return {canvas: made.canvas};
        });
        if (sprite) {
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.drawImage(sprite.canvas, 0, 0);
            ctx.restore();
            return;
        }
        this.paintThreatBorder(ctx, canvasSize, pulse);
    }

    paintThreatBorder(ctx, canvasSize, alpha) {
        ctx.save();
        ctx.shadowColor = `rgba(255, 50, 50, ${alpha})`;
        ctx.shadowBlur = 24;
        ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
        ctx.lineWidth = 5;
        ctx.strokeRect(3, 3, canvasSize - 6, canvasSize - 6);
        ctx.restore();
    }

    _collectClusterCandidates() {
        const getSetting = key => settingsSync.getJSON(key);
        const staticList = (this.handlers.harvestablesHandler?.harvestableList || []).filter(h => {
            const entity = {name: h.stringType, tier: h.tier, enchantmentLevel: h.charges};
            const isPureStatic = h.mobileTypeId === null || h.mobileTypeId === undefined
                || h.mobileTypeId === -1 || h.mobileTypeId === 65535;
            return isPureStatic
                ? shouldRenderStaticResource(entity, getSetting)
                : shouldRenderLivingResource(entity, getSetting);
        });
        const livingList = (this.handlers.mobsHandler?.mobsList || [])
            .filter(mob => mob.type === EnemyType.LivingHarvestable
                || mob.type === EnemyType.LivingSkinnable)
            .filter(mob => shouldRenderLivingResource(mob, getSetting));
        return staticList.concat(livingList);
    }
}

/**
 * Factory function to create RadarRenderer instance
 * @param {Object} dependencies - Handlers, drawings, settings, etc.
 * @returns {RadarRenderer}
 */
export function createRadarRenderer(dependencies) {
    return new RadarRenderer(dependencies);
}
