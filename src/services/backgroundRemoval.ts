import fetch from 'node-fetch';
import FormData from 'form-data';
import { Readable } from 'stream';

const BG_SERVICE_URL = process.env.BG_SERVICE_URL || 'http://localhost:8000';

export interface RemoveBackgroundResult {
  resultUrl: string;
  processingTimeMs: number;
}

export async function removeBackground(
  imageBuffer: Buffer,
  filename: string
): Promise<RemoveBackgroundResult> {
  const startTime = Date.now();
  
  try {
    const form = new FormData();
    form.append('file', Readable.from(imageBuffer), {
      filename,
      contentType: 'image/*',
    });
    
    const response = await fetch(`${BG_SERVICE_URL}/process`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Background service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json() as { result_url: string };
    
    return {
      resultUrl: result.result_url,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Background removal failed:', error);
    throw new Error('Failed to process image');
  }
}

export function isBackgroundServiceAvailable(): boolean {
  // Simple health check
  return !!BG_SERVICE_URL;
}
