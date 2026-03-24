import { Router, Response } from 'express';
import { prisma } from '../services/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthenticatedRequest, UsageStats } from '../types/index.js';

const router = Router();

// Get usage statistics
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  
  const [
    totalStats,
    thisMonthStats,
  ] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { userId },
      _count: true,
      _sum: { imageSize: true },
      _avg: { processingTimeMs: true },
    }),
    prisma.usageLog.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
      },
      _count: true,
      _sum: { imageSize: true },
    }),
  ]);
  
  const stats: UsageStats = {
    totalRequests: totalStats._count,
    totalImageSize: totalStats._sum.imageSize || 0,
    averageProcessingTime: totalStats._avg.processingTimeMs || 0,
    thisMonth: {
      requests: thisMonthStats._count,
      imageSize: thisMonthStats._sum.imageSize || 0,
    },
  };
  
  res.json({
    success: true,
    data: stats,
  });
});

// Get usage logs
router.get('/logs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const [logs, total] = await Promise.all([
    prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.usageLog.count({ where: { userId } }),
  ]);
  
  res.json({
    success: true,
    data: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default router;
