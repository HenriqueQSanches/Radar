// synthetic: happy-dom has no 2D canvas, so the offscreen canvases are hand-rolled spies.
// Covers the two paths the drawing code relies on: a real sprite (rasterize once, blit
// afterwards) and the direct-fillText fallback when no offscreen context exists.

import {describe, test, expect, beforeEach, vi} from 'vitest';
import {SpriteCache} from './SpriteCache.js';

function makeCtx() {
    return {
        fillText: vi.fn(),
        drawImage: vi.fn(),
        measureText: vi.fn(() => ({
            width: 20,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: 20,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 2,
        })),
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
    };
}

function makeFactory() {
    const created = [];
    const createCanvas = vi.fn((width, height) => {
        const ctx = makeCtx();
        const canvas = {width, height, ctx, getContext: () => ctx};
        created.push(canvas);
        return canvas;
    });
    return {createCanvas, created};
}

const style = {
    font: 'bold 10px monospace',
    fillStyle: '#FFFFFF',
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 2,
};

describe('SpriteCache.drawText without an offscreen context', () => {
    let cache;
    let target;

    beforeEach(() => {
        cache = new SpriteCache({createCanvas: () => null});
        target = makeCtx();
    });

    test('falls back to a direct fillText with the style applied', () => {
        cache.drawText(target, '12', style, 100.4, 50);

        expect(target.fillText).toHaveBeenCalledWith('12', 100.4, 50);
        expect(target.font).toBe(style.font);
        expect(target.fillStyle).toBe('#FFFFFF');
        expect(target.shadowBlur).toBe(2);
        expect(target.textAlign).toBe('left');
        expect(target.textBaseline).toBe('alphabetic');
        expect(target.drawImage).not.toHaveBeenCalled();
        expect(cache.isAvailable()).toBe(false);
        expect(cache.measureTextWidth(style.font, '12')).toBeNull();
    });

    test('skips empty text entirely', () => {
        cache.drawText(target, '', style, 1, 1);
        cache.drawText(target, null, style, 1, 1);
        expect(target.fillText).not.toHaveBeenCalled();
    });
});

describe('SpriteCache.drawText with an offscreen context', () => {
    let cache;
    let factory;
    let target;

    beforeEach(() => {
        factory = makeFactory();
        cache = new SpriteCache({createCanvas: factory.createCanvas, maxEntries: 2});
        target = makeCtx();
    });

    test('rasterizes once and blits the sprite anchored on the text origin', () => {
        cache.drawText(target, '12', style, 100.4, 50);

        // One canvas for measuring, one for the sprite itself.
        expect(factory.created).toHaveLength(2);
        const sprite = factory.created[1];
        expect(sprite.ctx.fillText).toHaveBeenCalledTimes(1);
        expect(sprite.ctx.shadowBlur).toBe(2);
        expect(sprite.ctx.font).toBe(style.font);

        // pad = ceil(2*2 + 0) + 2 = 6; anchorX = 6 + left(0) = 6; anchorY = 6 + ascent(8) = 14
        const [, anchorX, anchorY] = sprite.ctx.fillText.mock.calls[0];
        expect(anchorX).toBe(6);
        expect(anchorY).toBe(14);
        expect(sprite.width).toBe(6 + 20 + 6);
        expect(sprite.height).toBe(14 + 2 + 6);

        expect(target.fillText).not.toHaveBeenCalled();
        expect(target.drawImage).toHaveBeenCalledWith(sprite, 100 - 6, 50 - 14);
    });

    test('reuses the sprite for the same text and style', () => {
        cache.drawText(target, '12', style, 10, 10);
        cache.drawText(target, '12', style, 30, 40);

        expect(factory.created).toHaveLength(2);
        expect(target.drawImage).toHaveBeenCalledTimes(2);
        expect(target.drawImage.mock.calls[1][0]).toBe(factory.created[1]);
    });

    test('a different text or style gets its own sprite', () => {
        cache.drawText(target, '12', style, 10, 10);
        cache.drawText(target, '13', style, 10, 10);
        cache.drawText(target, '12', {...style, fillStyle: '#FF0000'}, 10, 10);

        expect(factory.created).toHaveLength(4);
    });

    test('evicts the least recently used sprite past maxEntries', () => {
        cache.drawText(target, 'a', style, 0, 0);
        cache.drawText(target, 'b', style, 0, 0);
        cache.drawText(target, 'a', style, 0, 0); // bumps 'a'
        cache.drawText(target, 'c', style, 0, 0); // evicts 'b'
        expect(factory.created).toHaveLength(4);

        cache.drawText(target, 'a', style, 0, 0); // still cached
        expect(factory.created).toHaveLength(4);

        cache.drawText(target, 'b', style, 0, 0); // rebuilt
        expect(factory.created).toHaveLength(5);
    });

    test('get() does not cache a null build result', () => {
        const build = vi.fn(() => null);
        expect(cache.get('k', build)).toBeNull();
        expect(cache.get('k', build)).toBeNull();
        expect(build).toHaveBeenCalledTimes(2);
    });

    test('createCanvas refuses empty or oversized sprites', () => {
        expect(cache.createCanvas(0, 10)).toBeNull();
        expect(cache.createCanvas(10, 4096)).toBeNull();
        expect(cache.createCanvas(10.2, 10.7).canvas.width).toBe(11);
    });
});
