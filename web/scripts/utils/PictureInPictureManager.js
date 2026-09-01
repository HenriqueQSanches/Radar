import {CATEGORIES} from '../constants/LoggerConstants.js';

class PictureInPictureManager {
    constructor() {
        this.pipCanvas = null;
        this.pipCtx = null;
        this.videoElement = null;
        this.stream = null;
        this.isActive = false;
        this.canvasManager = null;
        this.size = 500;
        this._onCanvasSizeChanged = null;
        this._onLeavePip = null;
    }

    initialize(canvasManager) {
        if (!document.pictureInPictureEnabled) {
            window.logger?.warn(CATEGORIES.SYSTEM, 'PiP_NotSupported', {reason: 'browser'});
            return false;
        }

        this.canvasManager = canvasManager;

        const canvases = canvasManager.canvases || canvasManager.getAllCanvases();
        const firstCanvas = canvases.mapCanvas || canvases.drawCanvas;
        this.size = firstCanvas?.width || 500;

        this.createPipCanvas();
        this.createVideoElement();
        this.setupEventListeners();

        return true;
    }

    createPipCanvas() {
        this.pipCanvas = document.createElement('canvas');
        this.pipCanvas.width = this.size;
        this.pipCanvas.height = this.size;
        this.pipCtx = this.pipCanvas.getContext('2d');
        this.pipCtx.imageSmoothingEnabled = true;
        this.pipCtx.imageSmoothingQuality = 'high';
    }

    createVideoElement() {
        this.videoElement = document.createElement('video');
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;';
        document.body.appendChild(this.videoElement);

        this._onLeavePip = () => this.onPipClosed();
        this.videoElement.addEventListener('leavepictureinpicture', this._onLeavePip);
    }

    setupEventListeners() {
        this._onCanvasSizeChanged = (e) => {
            const newSize = e.detail?.size || 500;
            this.size = newSize;
            if (this.pipCanvas) {
                this.pipCanvas.width = newSize;
                this.pipCanvas.height = newSize;
            }
        };
        document.addEventListener('canvasSizeChanged', this._onCanvasSizeChanged);
    }

    async toggle() {
        if (this.isActive) {
            await this.stop();
        } else {
            await this.start();
        }
        return this.isActive;
    }

    async start() {
        if (!this.canvasManager) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_NoCanvasManager', {});
            return false;
        }

        if (!document.pictureInPictureEnabled) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_NotSupported', {});
            return false;
        }

        try {
            this.compositeFrame();
            this.stream = this.pipCanvas.captureStream(30);
            this.videoElement.srcObject = this.stream;

            await new Promise((resolve, reject) => {
                const onCanPlay = () => {
                    this.videoElement.removeEventListener('canplay', onCanPlay);
                    this.videoElement.removeEventListener('error', onError);
                    resolve();
                };
                const onError = (e) => {
                    this.videoElement.removeEventListener('canplay', onCanPlay);
                    this.videoElement.removeEventListener('error', onError);
                    reject(e);
                };
                this.videoElement.addEventListener('canplay', onCanPlay);
                this.videoElement.addEventListener('error', onError);
                setTimeout(resolve, 100);
            });

            await this.videoElement.play();
            await this.videoElement.requestPictureInPicture();

            this.isActive = true;
            this.dispatchStatusEvent('started');

            return true;
        } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_StartFailed', {error: error.message});
            return false;
        }
    }

    async stop() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            }
        } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_ExitFailed', {error: error.message});
        }

        this.cleanup();
    }

    onPipClosed() {
        this.cleanup();
        this.dispatchStatusEvent('stopped');
    }

    cleanup() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.isActive = false;
    }

    onRadarRendered() {
        if (this.isActive) {
            this.compositeFrame();
        }
    }

    compositeFrame() {
        if (!this.pipCtx || !this.canvasManager) return;

        const canvases = this.canvasManager.canvases || this.canvasManager.getAllCanvases();
        const {mapCanvas, drawCanvas, ourPlayerCanvas, uiCanvas} = canvases;

        const sourceSize = mapCanvas?.width || this.size;
        if (this.pipCanvas.width !== sourceSize) {
            this.pipCanvas.width = sourceSize;
            this.pipCanvas.height = sourceSize;
            this.size = sourceSize;
        }

        const ctx = this.pipCtx;
        const center = this.size / 2;
        // Leave room for the ring stroke so it isn't clipped at the canvas edge.
        const borderWidth = Math.max(2, Math.round(this.size * 0.012));
        const radius = center - borderWidth;

        ctx.clearRect(0, 0, this.size, this.size);

        // The source canvases are square (map/background fills corner-to-corner, not just
        // the dashed circle guide drawn on top) — clip to a circle so the PiP frame shows
        // only the round radar instead of a square with dead corners. Clipped-out pixels
        // stay transparent on the canvas, which captureStream flattens to black, matching
        // the app's dark theme instead of looking like missing content.
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.clip();

        if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0);
        if (drawCanvas) ctx.drawImage(drawCanvas, 0, 0);
        if (ourPlayerCanvas) ctx.drawImage(ourPlayerCanvas, 0, 0);
        if (uiCanvas) ctx.drawImage(uiCanvas, 0, 0);

        ctx.restore();

        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = this._getAccentColor();
        ctx.stroke();
    }

    // Reads the active theme's primary color at draw time so the ring always matches
    // whatever theme is current instead of a hardcoded color that would drift out of sync.
    _getAccentColor() {
        const value = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
        return value || '#e8823a';
    }

    dispatchStatusEvent(status) {
        document.dispatchEvent(new CustomEvent('pipStatusChange', {
            detail: {status, isActive: this.isActive}
        }));
    }

    destroy() {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch((e) => {
                window.logger?.warn(CATEGORIES.SYSTEM, 'PiP_DestroyExitFailed', {error: e?.message});
            });
        }

        this.cleanup();

        if (this._onCanvasSizeChanged) {
            document.removeEventListener('canvasSizeChanged', this._onCanvasSizeChanged);
            this._onCanvasSizeChanged = null;
        }

        if (this.videoElement) {
            if (this._onLeavePip) {
                this.videoElement.removeEventListener('leavepictureinpicture', this._onLeavePip);
                this._onLeavePip = null;
            }
            if (this.videoElement.parentNode) {
                this.videoElement.parentNode.removeChild(this.videoElement);
            }
            this.videoElement = null;
        }

        this.pipCanvas = null;
        this.pipCtx = null;
        this.canvasManager = null;
    }

    isSupported() {
        return document.pictureInPictureEnabled === true;
    }
}

const pictureInPictureManager = new PictureInPictureManager();
export default pictureInPictureManager;
