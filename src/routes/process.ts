import { Router, Response } from 'express';
import { prisma } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { removeBackground, isBackgroundServiceAvailable } from '../services/backgroundRemoval.js';

const router = Router();

const DAILY_QUOTAS: Record<string, number | null> = {
  FREE: 5,
  PRO: 50,
  ENTERPRISE: null,
};

// ─── POST /api/process ──────────────────────────────────────────────────────
// PRO users only - processes image via Python AI service
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  // Check subscription plan
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  const plan = subscription?.plan || 'FREE';

  // Only PRO and ENTERPRISE can use this endpoint
  if (plan !== 'PRO' && plan !== 'ENTERPRISE') {
    res.status(403).json({
      success: false,
      error: 'This feature is only available for PRO subscribers',
    });
    return;
  }

  // Check if background service is available
  if (!isBackgroundServiceAvailable()) {
    res.status(503).json({
      success: false,
      error: 'AI processing service is currently unavailable. Please try again later.',
    });
    return;
  }

  // Check daily quota
  const dailyLimit = DAILY_QUOTAS[plan];
  if (dailyLimit !== null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayUsage = await prisma.usageLog.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
    });

    if (todayUsage >= dailyLimit) {
      res.status(429).json({
        success: false,
        error: 'Daily quota exceeded',
        data: {
          plan,
          dailyLimit,
          used: todayUsage,
          remaining: 0,
        },
      });
      return;
    }
  }

  // Get image from request
  const imageData = req.body.image;
  if (!imageData) {
    res.status(400).json({
      success: false,
      error: 'Image data is required',
    });
    return;
  }

  // Remove data:image/png;base64, prefix if present
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  try {
    // Call Python bg-service
    const result = await removeBackground(imageBuffer);

    // Record usage
    await prisma.usageLog.create({
      data: {
        userId,
        imageSize: imageBuffer.length,
        resultSize: result.result_base64 ? Buffer.from(result.result_base64, 'base64').length : 0,
        processingTimeMs: result.processingTimeMs,
      },
    });

    res.json({
      success: true,
      data: {
        resultUrl: result.result_url,
        originalSize: result.original_size,
        resultSize: result.result_size,
        processingTimeMs: result.processingTimeMs,
      },
    });
  } catch (error: any) {
    console.error('Background removal failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process image',
    });
  }
});

export default router;
