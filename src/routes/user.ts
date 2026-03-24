import { Router, Response } from 'express';
import { prisma } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Get current user profile
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      provider: true,
      createdAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
        },
      },
    },
  });
  
  res.json({
    success: true,
    data: user,
  });
});

// Update user profile
router.patch('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, avatar } = req.body;
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name, avatar },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      provider: true,
    },
  });
  
  res.json({
    success: true,
    data: user,
  });
});

export default router;
