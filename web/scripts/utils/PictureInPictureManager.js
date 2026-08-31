import {CATEGORIES} from '../constants/LoggerConstants.js';
import settingsSync from './SettingsSync.js';

const DEFAULT_OPACITY_PERCENT = 100;

class PictureInPictureManager {
    constructor() {
        this.pipCanvas = null;
        this.pipCtx = null;
        this.videoElement = null; // legacy video-based PiP (Firefox/Safari fallback)
        this.stream = null;
        this.isActive = false;
        this.canvasManager = null;
        this.size = 500;
        this._onCanvasSizeChanged = null;
        this._onLeavePip = null;

        // Document Picture-in-Picture (Chrome/Edge 116+): a real popup window we can put
        // actual DOM content into, unlike the video-element approach below — that's what
        // makes an adjustable opacity possible at all (a native video PiP window is drawn
        // by the browser/OS itself and can't be restyled from the page).
        this.pipWindow = null;
        this.usingDocumentPiP = false;
        this.opacityPercent = settingsSync.getNumber('settingPipOpacity', DEFAULT_OPACITY_PERCENT);
    }

    supportsDocumentPiP() {
        return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
    }

    isSupported() {
        return this.supportsDocumentPiP() || document.pictureInPictureEnabled === true;
    }

    initialize(canvasManager) {
        if (!this.isSupported()) {
            window.logger?.warn(CATEGORIES.SYSTEM, 'PiP_NotSupported', {reason: 'browser'});
            return false;
        }

        this.canvasManager = canvasManager;

        const canvases = canvasManager.canvases || canvasManager.getAllCanvases();
        const firstCanvas = canvases.mapCanvas || canvases.drawCanvas;
        this.size = firstCanvas?.width || 500;

        this.createPipCanvas();
        if (!this.supportsDocumentPiP()) {
            // Only the legacy path needs a video element as its capture target.
            this.createVideoElement();
        }
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
            if (this.pipCanvas && !this.usingDocumentPiP) {
                // While a Document PiP popup is open, resizing the backing canvas would
                // fight with its own layout — only follow live size changes when inactive.
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

        return this.supportsDocumentPiP() ? this.startDocumentPiP() : this.startVideoPiP();
    }

    async startDocumentPiP() {
        try {
            this.pipWindow = await window.documentPictureInPicture.requestWindow({
                width: this.size,
                height: this.size + 36,
            });

            const doc = this.pipWindow.document;
            const style = doc.createElement('style');
            style.textContent = `
                html, body { margin:0; padding:0; height:100%; background:#0b0d12; overflow:hidden; }
                #pipRoot { display:flex; flex-direction:column; height:100%; font-family:system-ui,sans-serif; }
                #pipOpacityBar { display:flex; align-items:center; gap:8px; padding:6px 10px;
                    font-size:12px; color:#cfd3da; background:#14171f; flex:0 0 auto; }
                #pipOpacityBar input[type=range] { flex:1; accent-color:#6366f1; }
                #pipOpacityValue { min-width:3ch; text-align:right; }
                #pipCanvasHolder { flex:1 1 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; }
                #pipCanvasHolder canvas { max-width:100%; max-height:100%; }
            `;
            doc.head.appendChild(style);

            const root = doc.createElement('div');
            root.id = 'pipRoot';

            const bar = doc.createElement('div');
            bar.id = 'pipOpacityBar';
            bar.innerHTML = `
                <span>Opacidade</span>
                <input type="range" id="pipOpacitySlider" min="20" max="100" step="5" value="${this.opacityPercent}">
                <span id="pipOpacityValue">${this.opacityPercent}%</span>
            `;
            root.appendChild(bar);

            const holder = doc.createElement('div');
            holder.id = 'pipCanvasHolder';
            // Moving an existing canvas (with its already-created 2D context) into another
            // window's DOM keeps that context usable — this is the documented Document PiP
            // use case, not a hack.
            holder.appendChild(this.pipCanvas);
            root.appendChild(holder);

            doc.body.appendChild(root);

            this.applyOpacity(this.opacityPercent);

            const slider = doc.getElementById('pipOpacitySlider');
            const valueLabel = doc.getElementById('pipOpacityValue');
            slider.addEventListener('input', () => {
                const percent = Number(slider.value);
                this.applyOpacity(percent);
                valueLabel.textContent = `${percent}%`;
                settingsSync.setNumber('settingPipOpacity', percent);
            });

            this.pipWindow.addEventListener('pagehide', () => this.onPipClosed(), {once: true});

            this.compositeFrame();
            this.isActive = true;
            this.usingDocumentPiP = true;
            this.dispatchStatusEvent('started');

            return true;
        } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_StartFailed', {error: error.message});
            return false;
        }
    }

    async startVideoPiP() {
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
            this.usingDocumentPiP = false;
            this.dispatchStatusEvent('started');

            return true;
        } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'PiP_StartFailed', {error: error.message});
            return false;
        }
    }

    applyOpacity(percent) {
        this.opacityPercent = percent;
        if (this.pipCanvas) {
            this.pipCanvas.style.opacity = String(Math.max(0, Math.min(100, percent)) / 100);
        }
    }

    async stop() {
        if (this.usingDocumentPiP) {
            if (this.pipWindow && !this.pipWindow.closed) {
                this.pipWindow.close();
            }
            // pagehide (registered in startDocumentPiP) drives cleanup + the stopped event.
            return;
        }

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
        if (this.usingDocumentPiP && this.pipCanvas) {
            // Reclaim the canvas before the popup's document (and everything left in it) is
            // torn down, so it's available again if the user reopens PiP.
            if (this.pipCanvas.parentNode) {
                this.pipCanvas.parentNode.removeChild(this.pipCanvas);
            }
            this.pipCanvas.style.opacity = '';
            document.body.appendChild(this.pipCanvas);
            this.pipCanvas.style.display = 'none';
        }
        this.pipWindow = null;
        this.usingDocumentPiP = false;
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

        this.pipCtx.clearRect(0, 0, this.size, this.size);

        if (mapCanvas) this.pipCtx.drawImage(mapCanvas, 0, 0);
        if (drawCanvas) this.pipCtx.drawImage(drawCanvas, 0, 0);
        if (ourPlayerCanvas) this.pipCtx.drawImage(ourPlayerCanvas, 0, 0);
        if (uiCanvas) this.pipCtx.drawImage(uiCanvas, 0, 0);
    }

    dispatchStatusEvent(status) {
        document.dispatchEvent(new CustomEvent('pipStatusChange', {
            detail: {status, isActive: this.isActive}
        }));
    }

    destroy() {
        if (this.usingDocumentPiP) {
            if (this.pipWindow && !this.pipWindow.closed) {
                this.pipWindow.close();
            }
        } else if (document.pictureInPictureElement) {
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

        this.pipWindow = null;
        this.usingDocumentPiP = false;
        this.pipCanvas = null;
        this.pipCtx = null;
        this.canvasManager = null;
    }
}

const pictureInPictureManager = new PictureInPictureManager();
export default pictureInPictureManager;
