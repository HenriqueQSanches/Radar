// synthetic: compositeFrame() clips the square radar composite to a circle and strokes an
// accent-colored ring — happy-dom has no real canvas 2D context, so pipCtx is a hand-rolled
// spy object recording calls instead of an actual CanvasRenderingContext2D.

import {describe, test, expect, beforeEach, vi} from 'vitest';

const {default: pictureInPictureManager} = await import('./PictureInPictureManager.js');

function makeCtxSpy() {
    return {
        calls: [],
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        lineWidth: 0,
        strokeStyle: '',
    };
}

describe('PictureInPictureManager.compositeFrame', () => {
    let ctx;
    let mapCanvas, drawCanvas, ourPlayerCanvas, uiCanvas;

    beforeEach(() => {
        ctx = makeCtxSpy();
        pictureInPictureManager.pipCtx = ctx;
        pictureInPictureManager.pipCanvas = {width: 500, height: 500};
        pictureInPictureManager.size = 500;

        mapCanvas = {width: 500, tag: 'map'};
        drawCanvas = {tag: 'draw'};
        ourPlayerCanvas = {tag: 'ourPlayer'};
        uiCanvas = {tag: 'ui'};

        pictureInPictureManager.canvasManager = {
            canvases: {mapCanvas, drawCanvas, ourPlayerCanvas, uiCanvas},
        };
    });

    // @verified 2026-09-01: clips to a circle (clip() called between the arc and the four
    // drawImage calls) instead of drawing the raw square composite.
    test('clips the composite to a circle before drawing the canvas layers', () => {
        pictureInPictureManager.compositeFrame();

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.arc).toHaveBeenCalledWith(250, 250, expect.any(Number), 0, Math.PI * 2);
        expect(ctx.clip).toHaveBeenCalled();
        expect(ctx.drawImage).toHaveBeenCalledWith(mapCanvas, 0, 0);
        expect(ctx.drawImage).toHaveBeenCalledWith(drawCanvas, 0, 0);
        expect(ctx.drawImage).toHaveBeenCalledWith(ourPlayerCanvas, 0, 0);
        expect(ctx.drawImage).toHaveBeenCalledWith(uiCanvas, 0, 0);

        const clipIndex = ctx.clip.mock.invocationCallOrder[0];
        const firstDrawIndex = ctx.drawImage.mock.invocationCallOrder[0];
        expect(clipIndex).toBeLessThan(firstDrawIndex);
    });

    // @verified 2026-09-01: strokes a ring after restore(), sized to leave the border
    // width inside the canvas edge (radius < size/2) rather than clipped off.
    test('strokes an accent-colored ring after restoring the clip', () => {
        pictureInPictureManager.compositeFrame();

        expect(ctx.restore).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.lineWidth).toBeGreaterThan(0);
        expect(ctx.strokeStyle).toMatch(/^#|^rgb|^oklch/);

        const restoreIndex = ctx.restore.mock.invocationCallOrder[0];
        const strokeIndex = ctx.stroke.mock.invocationCallOrder[0];
        expect(strokeIndex).toBeGreaterThan(restoreIndex);
    });

    // @verified 2026-09-01: falls back to a sane default color when the theme doesn't
    // define --color-primary (e.g. a test environment with no stylesheet loaded).
    test('_getAccentColor falls back to a default when the CSS variable is unset', () => {
        expect(pictureInPictureManager._getAccentColor()).toBe('#e8823a');
    });
});
