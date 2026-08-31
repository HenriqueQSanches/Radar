// synthetic: documentPictureInPicture is mocked with a fake window backed by the real `document`
// global (happy-dom) — good enough to exercise the manager's DOM wiring and opacity logic
// without needing a truly separate window.

import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';

// happy-dom doesn't implement a real 2D canvas rendering context; stub just enough of it
// for createPipCanvas/compositeFrame to run without throwing.
HTMLCanvasElement.prototype.getContext = function () {
    return {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        clearRect: vi.fn(),
        drawImage: vi.fn(),
    };
};

vi.mock('./SettingsSync.js', () => ({
    default: {
        getNumber: vi.fn(() => 100),
        setNumber: vi.fn(),
    },
}));

const {default: pictureInPictureManager} = await import('./PictureInPictureManager.js');
const settingsSync = (await import('./SettingsSync.js')).default;

function buildCanvasManager() {
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = 500;
    mapCanvas.height = 500;
    return {
        canvases: {mapCanvas, drawCanvas: null, ourPlayerCanvas: null, uiCanvas: null},
    };
}

describe('PictureInPictureManager', () => {
    let fakePipWindow;
    let pagehideHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        window.logger = {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        settingsSync.getNumber.mockReturnValue(100);

        pagehideHandler = null;
        fakePipWindow = {
            document,
            closed: false,
            close: vi.fn(function () { this.closed = true; }),
            addEventListener: vi.fn((event, handler) => {
                if (event === 'pagehide') pagehideHandler = handler;
            }),
        };

        window.documentPictureInPicture = {
            requestWindow: vi.fn(() => Promise.resolve(fakePipWindow)),
        };

        // Reset singleton state between tests (module is imported once for the whole file).
        pictureInPictureManager.destroy();
        pictureInPictureManager.opacityPercent = 100;
    });

    afterEach(() => {
        delete window.documentPictureInPicture;
        document.getElementById('pipRoot')?.remove();
    });

    test('isSupported is true when documentPictureInPicture exists, even without video PiP', () => {
        Object.defineProperty(document, 'pictureInPictureEnabled', {value: false, configurable: true});

        expect(pictureInPictureManager.isSupported()).toBe(true);
    });

    test('initialize skips creating a video element when Document PiP is supported', () => {
        pictureInPictureManager.initialize(buildCanvasManager());

        expect(pictureInPictureManager.videoElement).toBeNull();
        expect(pictureInPictureManager.pipCanvas).not.toBeNull();
    });

    test('start() opens a Document PiP window with the canvas and an opacity slider', async () => {
        pictureInPictureManager.initialize(buildCanvasManager());

        const ok = await pictureInPictureManager.start();

        expect(ok).toBe(true);
        expect(pictureInPictureManager.isActive).toBe(true);
        expect(pictureInPictureManager.usingDocumentPiP).toBe(true);
        expect(window.documentPictureInPicture.requestWindow).toHaveBeenCalled();
        expect(document.getElementById('pipOpacitySlider')).not.toBeNull();
        expect(document.getElementById('pipCanvasHolder')?.contains(pictureInPictureManager.pipCanvas)).toBe(true);
    });

    test('moving the opacity slider updates canvas style.opacity and persists the setting', async () => {
        pictureInPictureManager.initialize(buildCanvasManager());
        await pictureInPictureManager.start();

        const slider = document.getElementById('pipOpacitySlider');
        slider.value = '55';
        slider.dispatchEvent(new Event('input'));

        expect(pictureInPictureManager.pipCanvas.style.opacity).toBe('0.55');
        expect(settingsSync.setNumber).toHaveBeenCalledWith('settingPipOpacity', 55);
        expect(document.getElementById('pipOpacityValue').textContent).toBe('55%');
    });

    test('initial opacity comes from the persisted setting', async () => {
        settingsSync.getNumber.mockReturnValue(42);
        pictureInPictureManager.opacityPercent = settingsSync.getNumber('settingPipOpacity', 100);
        pictureInPictureManager.initialize(buildCanvasManager());

        await pictureInPictureManager.start();

        expect(pictureInPictureManager.pipCanvas.style.opacity).toBe('0.42');
    });

    test('closing the popup (pagehide) reclaims the canvas and fires a stopped status event', async () => {
        pictureInPictureManager.initialize(buildCanvasManager());
        await pictureInPictureManager.start();

        const statusHandler = vi.fn();
        document.addEventListener('pipStatusChange', statusHandler);

        pagehideHandler();

        expect(pictureInPictureManager.isActive).toBe(false);
        expect(pictureInPictureManager.usingDocumentPiP).toBe(false);
        expect(pictureInPictureManager.pipCanvas.parentNode).toBe(document.body);
        expect(statusHandler).toHaveBeenCalledWith(
            expect.objectContaining({detail: {status: 'stopped', isActive: false}})
        );

        document.removeEventListener('pipStatusChange', statusHandler);
    });

    test('stop() while active closes the Document PiP window', async () => {
        pictureInPictureManager.initialize(buildCanvasManager());
        await pictureInPictureManager.start();

        await pictureInPictureManager.stop();

        expect(fakePipWindow.close).toHaveBeenCalled();
    });

    test('falls back to video-based PiP when Document PiP is unsupported', () => {
        delete window.documentPictureInPicture;
        Object.defineProperty(document, 'pictureInPictureEnabled', {value: true, configurable: true});

        pictureInPictureManager.initialize(buildCanvasManager());

        expect(pictureInPictureManager.videoElement).not.toBeNull();
        expect(pictureInPictureManager.supportsDocumentPiP()).toBe(false);
    });
});
