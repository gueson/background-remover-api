import FormData from 'form-data';
import sharp from 'sharp';

const BG_SERVICE_URL = process.env.BG_SERVICE_URL || 'http://localhost:8000';

// Compress image if over 1MB or larger than 1500px on longest side
const SIZE_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_DIMENSION = 1500; // px

async function compressImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const needsResize = (metadata.width ?? 0) > MAX_DIMENSION || (metadata.height ?? 0) > MAX_DIMENSION;
  const needsCompress = buffer.length > SIZE_THRESHOLD;

  if (!needsResize && !needsCompress) {
    return buffer;
  }

  let pipeline = sharp(buffer);

  // Resize if needed (maintains aspect ratio, never enlarges)
  if (needsResize) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to JPEG at quality 85 - 10x compression for photos vs PNG
  // bria-rmbg accepts JPEG input fine; output is still RGBA PNG with transparency
  return pipeline.jpeg({ quality: 85 }).toBuffer();
}

export interface RemoveBackgroundResult {
  result_id: string;
  original_size: number;
  result_size: number;
  processingTimeMs: number;
}

export async function removeBackground(imageBuffer: Buffer): Promise<RemoveBackgroundResult> {
  const startTime = Date.now();

  // Compress image before sending to bg-service to avoid timeout
  const compressed = await compressImage(imageBuffer);
  if (compressed.length < imageBuffer.length) {
    console.log(`[bg-service] Compressed image: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB → ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
  }

  try {
    const form = new FormData();
    form.append('file', compressed, {
      filename: 'image.jpg',
      contentType: 'image/jpeg',
    });

    const formHeaders = form.getHeaders();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000); // 10 min timeout

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
      result_id: string;
      original_size: number;
      result_size: number;
    };

    return {
      result_id: result.result_id,
      original_size: imageBuffer.length,
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
