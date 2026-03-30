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

export function isBackgroundServiceAvailable(): boolean {
  // Simple health check - service URL is configured
  return !!BG_SERVICE_URL && BG_SERVICE_URL !== 'http://localhost:8000';
}
