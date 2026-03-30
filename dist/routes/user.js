"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../services/db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// Get current user profile
router.get('/me', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const user = await db_js_1.prisma.user.findUnique({
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
router.patch('/me', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { name, avatar } = req.body;
    const user = await db_js_1.prisma.user.update({
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
exports.default = router;
//# sourceMappingURL=user.js.map