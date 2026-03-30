"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../services/db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// Daily quota limits per plan
const DAILY_QUOTAS = {
    FREE: 5,
    PRO: 50,
    ENTERPRISE: null, // unlimited
};
// ─── GET /api/quota ─────────────────────────────────────────────────────────
router.get('/', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    // Get subscription
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    const plan = subscription?.plan || 'FREE';
    const dailyLimit = DAILY_QUOTAS[plan];
    // Get today's usage
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayUsage = await db_js_1.prisma.usageLog.count({
        where: {
            userId,
            createdAt: { gte: startOfDay },
        },
    });
    res.json({
        success: true,
        data: {
            plan,
            dailyLimit,
            used: todayUsage,
            remaining: dailyLimit !== null ? Math.max(0, dailyLimit - todayUsage) : null,
        },
    });
});
// ─── POST /api/quota/check ─────────────────────────────────────────────────
router.post('/check', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    const plan = subscription?.plan || 'FREE';
    const dailyLimit = DAILY_QUOTAS[plan];
    if (dailyLimit === null) {
        // Unlimited
        res.json({ success: true, data: { allowed: true, reason: null } });
        return;
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayUsage = await db_js_1.prisma.usageLog.count({
        where: {
            userId,
            createdAt: { gte: startOfDay },
        },
    });
    if (todayUsage >= dailyLimit) {
        res.json({
            success: true,
            data: {
                allowed: false,
                reason: 'daily_limit_exceeded',
                plan,
                dailyLimit,
                used: todayUsage,
                remaining: 0,
            },
        });
        return;
    }
    res.json({
        success: true,
        data: {
            allowed: true,
            reason: null,
            plan,
            dailyLimit,
            used: todayUsage,
            remaining: dailyLimit - todayUsage,
        },
    });
});
// ─── POST /api/quota/use ────────────────────────────────────────────────────
router.post('/use', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { imageSize, resultSize, processingTimeMs } = req.body;
    // First check quota
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    const plan = subscription?.plan || 'FREE';
    const dailyLimit = DAILY_QUOTAS[plan];
    if (dailyLimit !== null) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayUsage = await db_js_1.prisma.usageLog.count({
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
    // Record usage
    const usageLog = await db_js_1.prisma.usageLog.create({
        data: {
            userId,
            imageSize: imageSize || 0,
            resultSize: resultSize || null,
            processingTimeMs: processingTimeMs || null,
        },
    });
    // Return remaining quota
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayUsage = await db_js_1.prisma.usageLog.count({
        where: {
            userId,
            createdAt: { gte: startOfDay },
        },
    });
    res.json({
        success: true,
        data: {
            recorded: true,
            usageId: usageLog.id,
            plan,
            dailyLimit,
            used: todayUsage,
            remaining: dailyLimit !== null ? dailyLimit - todayUsage : null,
        },
    });
});
exports.default = router;
//# sourceMappingURL=quota.js.map