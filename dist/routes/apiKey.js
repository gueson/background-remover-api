"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
const db_js_1 = require("../services/db.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
// Generate random API key
function generateApiKey() {
    const key = (0, crypto_1.randomBytes)(32).toString('hex');
    const keyHash = (0, crypto_2.createHash)('sha256').update(key).digest('hex');
    const keyPrefix = key.substring(0, 8);
    return { key, keyHash, keyPrefix };
}
// List user's API keys
router.get('/', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    // Check if user has Pro or Enterprise plan
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    if (!subscription || subscription.plan === 'FREE') {
        throw new errorHandler_js_1.ForbiddenError('API keys are only available for Pro and Enterprise plans');
    }
    const apiKeys = await db_js_1.prisma.apiKey.findMany({
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
router.post('/', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { name } = req.body;
    // Check subscription
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    if (!subscription || subscription.plan === 'FREE') {
        throw new errorHandler_js_1.ForbiddenError('API keys are only available for Pro and Enterprise plans');
    }
    const { key, keyHash, keyPrefix } = generateApiKey();
    const apiKey = await db_js_1.prisma.apiKey.create({
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
router.delete('/:id', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const apiKey = await db_js_1.prisma.apiKey.findFirst({
        where: { id, userId },
    });
    if (!apiKey) {
        throw new errorHandler_js_1.BadRequestError('API key not found');
    }
    await db_js_1.prisma.apiKey.delete({ where: { id } });
    res.json({
        success: true,
        message: 'API key deleted',
    });
});
exports.default = router;
//# sourceMappingURL=apiKey.js.map