// SpriteCache.js - offscreen canvas cache for things that are expensive to rasterize
// but rarely change: shadowed text, dashed rings, glow borders.
//
// Every frame the radar was re-running shadowBlur text for every visible badge, distance
// tag and health bar. A canvas shadow forces an offscreen layer plus a blur pass per
// call, which on a GPU-accelerated canvas is about the most expensive thing 2D canvas
// can do, and the GPU is exactly the resource the game is already saturating (reported
// as FPS drops in-game with the radar open, even with logging off). Rasterizing each
// unique (text, style) once into a small offscreen canvas and blitting it afterwards
// turns that into a plain textured quad.

const MAX_ENTRIES = 512;
const MAX_SPRITE_SIDE = 2048;

function defaultCreateCanvas(width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function fontPx(font) {
    const match = /(\d+(?:\.\d+)?)px/.exec(font || '');
    return match ? parseFloat(match[1]) : 12;
}

function applyTextStyle(ctx, style) {
    ctx.font = style.font;
    ctx.fillStyle = style.fillStyle;
    ctx.textAlign = style.textAlign || 'left';
    ctx.textBaseline = style.textBaseline || 'alphabetic';
    ctx.shadowColor = style.shadowColor || 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = style.shadowBlur || 0;
    ctx.shadowOffsetX = style.shadowOffsetX || 0;
    ctx.shadowOffsetY = style.shadowOffsetY || 0;
}

export class SpriteCache {
    constructor({maxEntries = MAX_ENTRIES, createCanvas = null} = {}) {
        this.maxEntries = maxEntries;
        this.entries = new Map();
        this._createCanvas = createCanvas || defaultCreateCanvas;
        this._measureCtx = undefined;
    }

    // Returns the cached entry for key, building it on first use. build() must return
    // an object with at least {canvas}, or null when a sprite can't be made (no 2D
    // context available, size out of range) so the caller can draw directly instead.
    get(key, build) {
        const hit = this.entries.get(key);
        if (hit) {
            this.entries.delete(key);
            this.entries.set(key, hit);
            return hit;
        }
        const entry = build();
        if (!entry) return null;
        this.entries.set(key, entry);
        if (this.entries.size > this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value);
        }
        return entry;
    }

    createCanvas(width, height) {
        const w = Math.ceil(width);
        const h = Math.ceil(height);
        if (!(w > 0) || !(h > 0) || w > MAX_SPRITE_SIDE || h > MAX_SPRITE_SIDE) return null;
        const canvas = this._createCanvas(w, h);
        const ctx = canvas?.getContext?.('2d');
        if (!ctx) return null;
        return {canvas, ctx};
    }

    measureContext() {
        if (this._measureCtx === undefined) {
            const made = this.createCanvas(1, 1);
            this._measureCtx = made ? made.ctx : null;
        }
        return this._measureCtx;
    }

    isAvailable() {
        return this.measureContext() !== null;
    }

    measureTextWidth(font, text) {
        const measure = this.measureContext();
        if (!measure) return null;
        measure.font = font;
        return measure.measureText(String(text)).width;
    }

    // Drop-in for ctx.fillText(text, x, y) with the given font/fill/shadow/alignment.
    // Falls back to a direct fillText (same visual, same cost as before) when no
    // offscreen context exists.
    drawText(ctx, text, style, x, y) {
        if (text === undefined || text === null || text === '') return;
        const str = String(text);
        const measure = this.measureContext();
        if (!measure) {
            applyTextStyle(ctx, style);
            ctx.fillText(str, x, y);
            return;
        }

        const align = style.textAlign || 'left';
        const baseline = style.textBaseline || 'alphabetic';
        const blur = style.shadowBlur || 0;
        const offsetX = style.shadowOffsetX || 0;
        const offsetY = style.shadowOffsetY || 0;
        const key = ['text', style.font, style.fillStyle, style.shadowColor || '', blur, offsetX, offsetY, align, baseline, str].join('\u001f');

        const entry = this.get(key, () => {
            measure.font = style.font;
            measure.textAlign = align;
            measure.textBaseline = baseline;
            const metrics = measure.measureText(str);
            const px = fontPx(style.font);
            const width = metrics.width || 0;
            const left = metrics.actualBoundingBoxLeft
                ?? (align === 'center' ? width / 2 : (align === 'right' || align === 'end') ? width : 0);
            const right = metrics.actualBoundingBoxRight ?? (width - left);
            const ascent = metrics.actualBoundingBoxAscent ?? px;
            const descent = metrics.actualBoundingBoxDescent ?? px * 0.3;
            const pad = Math.ceil(blur * 2 + Math.max(Math.abs(offsetX), Math.abs(offsetY))) + 2;
            const anchorX = Math.ceil(pad + Math.max(0, left));
            const anchorY = Math.ceil(pad + Math.max(0, ascent));
            const made = this.createCanvas(anchorX + Math.max(0, right) + pad, anchorY + Math.max(0, descent) + pad);
            if (!made) return null;
            applyTextStyle(made.ctx, style);
            made.ctx.fillText(str, anchorX, anchorY);
            return {canvas: made.canvas, anchorX, anchorY};
        });

        if (!entry) {
            applyTextStyle(ctx, style);
            ctx.fillText(str, x, y);
            return;
        }
        ctx.drawImage(entry.canvas, Math.round(x) - entry.anchorX, Math.round(y) - entry.anchorY);
    }

    clear() {
        this.entries.clear();
    }
}

export const spriteCache = new SpriteCache();
export default spriteCache;
