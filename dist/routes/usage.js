"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../services/db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// Get usage statistics
router.get('/stats', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [totalStats, thisMonthStats,] = await Promise.all([
        db_js_1.prisma.usageLog.aggregate({
            where: { userId },
            _count: true,
            _sum: { imageSize: true },
            _avg: { processingTimeMs: true },
        }),
        db_js_1.prisma.usageLog.aggregate({
            where: {
                userId,
                createdAt: { gte: startOfMonth },
            },
            _count: true,
            _sum: { imageSize: true },
        }),
    ]);
    const stats = {
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
router.get('/logs', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
        db_js_1.prisma.usageLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        db_js_1.prisma.usageLog.count({ where: { userId } }),
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
exports.default = router;
//# sourceMappingURL=usage.js.map