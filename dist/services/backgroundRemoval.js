"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeBackground = removeBackground;
exports.isBackgroundServiceAvailable = isBackgroundServiceAvailable;
const form_data_1 = __importDefault(require("form-data"));
const stream_1 = require("stream");
const BG_SERVICE_URL = process.env.BG_SERVICE_URL || 'http://localhost:8000';
async function removeBackground(imageBuffer) {
    const startTime = Date.now();
    try {
        const form = new form_data_1.default();
        form.append('file', stream_1.Readable.from(imageBuffer), {
            filename: 'image.png',
            contentType: 'image/*',
        });
        // Use native fetch (available in Node.js 18+)
        const response = await fetch(`${BG_SERVICE_URL}/process`, {
            method: 'POST',
            body: form,
            // Let FormData set its own headers including the boundary
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Background service error: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        return {
            result_url: result.result_url,
            original_size: result.original_size,
            result_size: result.result_size,
            processingTimeMs: Date.now() - startTime,
        };
    }
    catch (error) {
        console.error('Background removal failed:', error);
        throw new Error('Failed to process image');
    }
}
function isBackgroundServiceAvailable() {
    // Simple health check - service URL is configured
    return !!BG_SERVICE_URL && BG_SERVICE_URL !== 'http://localhost:8000';
}
//# sourceMappingURL=backgroundRemoval.js.map