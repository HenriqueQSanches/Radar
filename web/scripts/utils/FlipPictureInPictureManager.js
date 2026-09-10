import {CATEGORIES} from '../constants/LoggerConstants.js';

// A second, independent Picture-in-Picture window for the Flip page —
// separate from PictureInPictureManager.js (the main radar's PiP), which is
// tightly coupled to the radar's own canvases and can't be reused here.
//
// Same underlying browser technique (canvas -> captureStream -> hidden
// <video> -> requestPictureInPicture): that API only ever streams whatever
// gets drawn onto a canvas, so this can't host a real scrollable table —
// it draws a compact text summary instead (captured/opportunity counts plus
// the latest capture), enough to confirm Flip is still working without
// alt-tabbing out of the game.
class FlipPictureInPictureManager {
    constructor() {
        this.pipCanvas = null;
        this.pipCtx = null;
        this.videoElement = null;
        this.stream = null;
        this.isActive = false;
        this.width = 320;
        this.height = 160;
        this._onLeavePip = null;
        this.summary = {orderCount: 0, opportunityCount: 0, lastOrderText: ''};
    }

    initialize() {
        if (!document.pictureInPictureEnabled) {
            window.logger?.warn(CATEGORIES.SYSTEM, 'FlipPiP_NotSupported', {reason: 'browser'});
            return false;
        }

        this.createPipCanvas();
        this.createVideoElement();
        return true;
    }

    isSupported() {
        return document.pictureInPictureEnabled === true;
    }

    createPipCanvas() {
        this.pipCanvas = document.createElement('canvas');
        this.pipCanvas.width = this.width;
        this.pipCanvas.height = this.height;
        this.pipCtx = this.pipCanvas.getContext('2d');
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

    async toggle() {
        if (this.isActive) {
            await this.stop();
        } else {
            await this.start();
        }
        return this.isActive;
    }

    async start() {
        if (!document.pictureInPictureEnabled) {
            window.logger?.error(CATEGORIES.SYSTEM, 'FlipPiP_NotSupported', {});
            return false;
        }

        try {
            this.render();
            this.stream = this.pipCanvas.captureStream(5);
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
            window.logger?.error(CATEGORIES.SYSTEM, 'FlipPiP_StartFailed', {error: error.message});
            return false;
        }
    }

    async stop() {
        try {
            if (document.pictureInPictureElement === this.videoElement) {
                await document.exitPictureInPicture();
            }
        } catch (error) {
            window.logger?.error(CATEGORIES.SYSTEM, 'FlipPiP_ExitFailed', {error: error.message});
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

    // Called whenever the Flip page fetches fresh data — updates the drawn
    // summary immediately if the PiP window is open, same idea as the radar
    // PiP's onRadarRendered.
    updateSummary({orderCount, opportunityCount, lastOrderText}) {
        this.summary = {
            orderCount: orderCount ?? this.summary.orderCount,
            opportunityCount: opportunityCount ?? this.summary.opportunityCount,
            lastOrderText: lastOrderText ?? this.summary.lastOrderText,
        };
        if (this.isActive) {
            this.render();
        }
    }

    render() {
        if (!this.pipCtx) return;
        const ctx = this.pipCtx;
        const {width, height} = this;

        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue('--color-base-200').trim() || '#1d1a17';
        const fg = style.getPropertyValue('--color-base-content').trim() || '#f2ece4';
        const accent = style.getPropertyValue('--color-primary').trim() || '#e8823a';

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = accent;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('Flip', 16, 30);

        ctx.fillStyle = fg;
        ctx.font = '16px sans-serif';
        ctx.fillText(`${this.summary.orderCount} ordens capturadas`, 16, 62);
        ctx.fillText(`${this.summary.opportunityCount} oportunidades`, 16, 86);

        ctx.font = '13px sans-serif';
        ctx.fillStyle = style.getPropertyValue('--color-base-content').trim() || '#c9c2b8';
        const lastLine = this.summary.lastOrderText || 'Aguardando captura...';
        ctx.fillText(truncateToWidth(ctx, lastLine, width - 32), 16, 118);
    }

    dispatchStatusEvent(status) {
        document.dispatchEvent(new CustomEvent('flipPipStatusChange', {
            detail: {status, isActive: this.isActive}
        }));
    }

    destroy() {
        if (document.pictureInPictureElement === this.videoElement) {
            document.exitPictureInPicture().catch((e) => {
                window.logger?.warn(CATEGORIES.SYSTEM, 'FlipPiP_DestroyExitFailed', {error: e?.message});
            });
        }

        this.cleanup();

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
    }
}

function truncateToWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
}

const flipPictureInPictureManager = new FlipPictureInPictureManager();
export default flipPictureInPictureManager;
export {FlipPictureInPictureManager};
