import FormData from 'form-data';
import { Readable } from 'stream';

const BG_SERVICE_URL = process.env.BG_SERVICE_URL || 'http://localhost:8000';

export interface RemoveBackgroundResult {
  result_url: string;
  result_base64?: string;
  original_size: number;
  result_size: number;
  processingTimeMs: number;
}

export async function removeBackground(imageBuffer: Buffer): Promise<RemoveBackgroundResult> {
  const startTime = Date.now();
  
  try {
    const form = new FormData();
    form.append('file', Readable.from(imageBuffer), {
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
    
    const result = await response.json() as {
      result_url: string;
      original_size: number;
      result_size: number;
    };
    
    return {
      result_url: result.result_url,
      original_size: result.original_size,
      result_size: result.result_size,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Background removal failed:', error);
    throw new Error('Failed to process image');
  }
}

export async function isBackgroundServiceAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${BG_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
