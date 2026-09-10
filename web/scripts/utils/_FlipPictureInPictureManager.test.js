// synthetic: render() draws a compact text summary onto a canvas — happy-dom has no real
// canvas 2D context, so pipCtx is a hand-rolled spy object recording calls instead of an
// actual CanvasRenderingContext2D, same convention as _PictureInPictureManager.test.js.

import {describe, test, expect, beforeEach, vi} from 'vitest';

const {default: flipPipManager} = await import('./FlipPictureInPictureManager.js');

function makeCtxSpy() {
    return {
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: (text) => ({width: text.length * 7}),
        fillStyle: '',
        font: '',
    };
}

describe('FlipPictureInPictureManager.render', () => {
    let ctx;

    beforeEach(() => {
        ctx = makeCtxSpy();
        flipPipManager.pipCtx = ctx;
        flipPipManager.width = 320;
        flipPipManager.height = 160;
        flipPipManager.summary = {orderCount: 0, opportunityCount: 0, lastOrderText: ''};
    });

    test('draws the order/opportunity counts and a waiting message with no captures yet', () => {
        flipPipManager.render();

        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 320, 160);
        const drawnText = ctx.fillText.mock.calls.map(call => call[0]);
        expect(drawnText).toContain('0 ordens capturadas');
        expect(drawnText).toContain('0 oportunidades');
        expect(drawnText.some(t => t.includes('Aguardando captura'))).toBe(true);
    });

    test('updateSummary merges partial updates and re-renders only while active', () => {
        flipPipManager.isActive = false;
        ctx.fillText.mockClear();
        flipPipManager.updateSummary({orderCount: 5});
        expect(ctx.fillText).not.toHaveBeenCalled();
        expect(flipPipManager.summary.orderCount).toBe(5);

        flipPipManager.isActive = true;
        flipPipManager.updateSummary({opportunityCount: 2, lastOrderText: 'T4_BAG @ Lymhurst — 100'});
        const drawnText = ctx.fillText.mock.calls.map(call => call[0]);
        expect(drawnText).toContain('5 ordens capturadas');
        expect(drawnText).toContain('2 oportunidades');
        expect(drawnText).toContain('T4_BAG @ Lymhurst — 100');
    });

    test('truncates a last-order line that would overflow the canvas width', () => {
        flipPipManager.updateSummary({
            lastOrderText: 'T4_2H_ARCANESTAFF_MORGANA@3 @ Fort Sterling — 999999999',
        });
        flipPipManager.isActive = true;
        ctx.fillText.mockClear();
        flipPipManager.render();

        const lastLine = ctx.fillText.mock.calls.at(-1)[0];
        expect(lastLine.length).toBeLessThan('T4_2H_ARCANESTAFF_MORGANA@3 @ Fort Sterling — 999999999'.length);
        expect(lastLine.endsWith('…')).toBe(true);
    });
});

describe('FlipPictureInPictureManager.isSupported', () => {
    test('reflects document.pictureInPictureEnabled', () => {
        expect(flipPipManager.isSupported()).toBe(document.pictureInPictureEnabled === true);
    });
});
