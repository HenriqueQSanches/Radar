// synthetic: drawing pipeline contract; canvas pixels not asserted (DrawingUtils mocked).

import {describe, test, expect, beforeEach, vi} from 'vitest';

vi.mock('../utils/SettingsSync.js', () => ({
    default: {getBool: vi.fn(() => true), getFloat: vi.fn(() => 1), getNumber: vi.fn(() => 500)},
}));
vi.mock('../utils/ImageCache.js', () => ({
    default: {GetPreloadedImage: vi.fn(() => ({})), preloadImageAndAddToList: vi.fn()},
}));

const {DungeonsDrawing} = await import('./DungeonsDrawing.js');

function makeCtxSpy() {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        font: '',
        fillStyle: '',
        textAlign: '',
    };
}

describe('DungeonsDrawing', () => {
    let drawing;
    let ctx;

    beforeEach(() => {
        vi.clearAllMocks();
        drawing = new DungeonsDrawing();
        drawing.transformPoint = vi.fn((hX, hY) => ({x: hX, y: hY}));
        drawing.DrawCustomImage = vi.fn();
        drawing.interpolateEntity = vi.fn();
        ctx = makeCtxSpy();
    });

    // @verified 2026-09-12: synthetic. draw skips entries with no drawName.
    test('draw skips a dungeon with undefined drawName', () => {
        drawing.draw(ctx, [{id: 1, hX: 0, hY: 0, drawName: undefined}]);

        expect(drawing.DrawCustomImage).not.toHaveBeenCalled();
    });

    // @verified 2026-09-12: synthetic. non-mist entries (regular dungeons) never get the enchant label.
    test('draw does not label a regular (non-mist) dungeon', () => {
        drawing.draw(ctx, [{id: 1, hX: 10, hY: 20, drawName: 'dungeon_2', isMist: false, enchant: 2}]);

        expect(drawing.DrawCustomImage).toHaveBeenCalledWith(ctx, 10, 20, 'dungeon_2', 'Resources', 28);
        expect(ctx.fillText).not.toHaveBeenCalled();
    });

    // @verified 2026-09-12: synthetic. a mist portal at enchant 0 (no numbered suffix in-game) skips the label too.
    test('draw does not label a mist portal at enchant 0', () => {
        drawing.draw(ctx, [{id: 1, hX: 10, hY: 20, drawName: 'mist_0', isMist: true, enchant: 0}]);

        expect(ctx.fillText).not.toHaveBeenCalled();
    });

    // @updated 2026-09-12: mist_0..mist_4 only differ by tint, reported as impossible to tell 1/2/3
    // apart at a glance/marker size — an enchant-number label is drawn on top so identification
    // doesn't depend on color perception.
    test('draw labels an enchanted mist portal with its enchant number', () => {
        drawing.draw(ctx, [{id: 1, hX: 10, hY: 20, drawName: 'mist_3', isMist: true, enchant: 3}]);

        expect(drawing.DrawCustomImage).toHaveBeenCalledWith(ctx, 10, 20, 'mist_3', 'Resources', 28);
        expect(ctx.fillText).toHaveBeenCalledWith('3', expect.any(Number), expect.any(Number));
        // drawn twice: a dark shadow pass then the white fill, in that order
        expect(ctx.fillText).toHaveBeenCalledTimes(2);
    });
});
