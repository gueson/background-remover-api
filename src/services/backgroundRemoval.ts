import FormData from 'form-data';

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
    form.append('file', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png',
    });
    
    // Use getBuffer() + manual Content-Type to ensure boundary is sent correctly.
    // Passing FormData directly to fetch() does not reliably set the boundary header.
    const formHeaders = form.getHeaders();
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000); // 10 min timeout (bria-rmbg cold start can be slow on CPU)
    
    let response: Response;
    try {
      response = await fetch(`${BG_SERVICE_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': formHeaders['content-type'],
        },
        body: form.getBuffer(),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        throw new Error('AI processing timed out after 10 minutes. Please try with a smaller image.');
      }
      throw new Error(`Network error: ${fetchError.message}`);
    }
    
    clearTimeout(timeout);
    
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
