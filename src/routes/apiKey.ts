import { Router, Response } from 'express';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { prisma } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { BadRequestError, ForbiddenError } from '../middleware/errorHandler.js';

const router = Router();

// Generate random API key
function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(key).digest('hex');
  const keyPrefix = key.substring(0, 8);
  return { key, keyHash, keyPrefix };
}

// List user's API keys
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  // Check if user has Pro or Enterprise plan
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  
  if (!subscription || subscription.plan === 'FREE') {
    throw new ForbiddenError('API keys are only available for Pro and Enterprise plans');
  }
  
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  
  res.json({
    success: true,
    data: apiKeys,
  });
});

// Create new API key
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { name } = req.body;
  
  // Check subscription
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  
  if (!subscription || subscription.plan === 'FREE') {
    throw new ForbiddenError('API keys are only available for Pro and Enterprise plans');
  }
  
  const { key, keyHash, keyPrefix } = generateApiKey();
  
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      keyHash,
      keyPrefix,
      name: name || `API Key ${keyPrefix}`,
    },
  });
  
  res.json({
    success: true,
    data: {
      id: apiKey.id,
      key, // Only returned once!
      keyPrefix: apiKey.keyPrefix,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    },
  });
});

// Delete API key
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  
  const apiKey = await prisma.apiKey.findFirst({
    where: { id, userId },
  });
  
  if (!apiKey) {
    throw new BadRequestError('API key not found');
  }
  
  await prisma.apiKey.delete({ where: { id } });
  
  res.json({
    success: true,
    message: 'API key deleted',
  });
});

export default router;
