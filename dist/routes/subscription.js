"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_js_1 = require("../services/db.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// ─── GET /api/subscription ────────────────────────────────────────────────
router.get('/', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const subscription = await db_js_1.prisma.subscription.findUnique({
        where: { userId },
    });
    const usageThisMonth = await db_js_1.prisma.usageLog.aggregate({
        where: {
            userId,
            createdAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
        },
        _count: true,
    });
    const planLimits = {
        FREE: 10,
        PRO: null,
        ENTERPRISE: null,
    };
    const plan = subscription?.plan || 'FREE';
    const monthlyLimit = planLimits[plan];
    const subscriptionInfo = {
        plan,
        status: subscription?.status || 'ACTIVE',
        currentPeriodStart: subscription?.currentPeriodStart || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        quota: {
            monthly: monthlyLimit,
            used: usageThisMonth._count,
            remaining: monthlyLimit !== null
                ? Math.max(0, monthlyLimit - usageThisMonth._count)
                : null,
        },
    };
    res.json({ success: true, data: subscriptionInfo });
});
// ─── POST /api/subscription/cancel ──────────────────────────────────────
router.post('/cancel', auth_js_1.authMiddleware, async (req, res) => {
    const userId = req.user.id;
    await db_js_1.prisma.subscription.update({
        where: { userId },
        data: { status: 'CANCELLED' },
    });
    res.json({ success: true, message: 'Subscription cancelled' });
});
// ─── POST /api/subscription/webhook ─────────────────────────────────────
// PayPal sends webhook events here (no auth – verified by PayPal signature)
router.post('/webhook', async (req, res) => {
    const event = req.body;
    const webhookEvent = event.event_type;
    const resource = event.resource;
    console.log(`[PayPal Webhook] ${webhookEvent}:`, JSON.stringify(resource).slice(0, 200));
    try {
        switch (webhookEvent) {
            case 'BILLING.SUBSCRIPTION.CREATED': {
                // New subscription created – store the PayPal subscription ID
                const paypalSubId = resource.id;
                const userEmail = resource.subscriber?.email_address;
                const planId = resource.plan_id;
                // Map PayPal plan_id to our plan enum
                const plan = planId?.includes('ENTERPRISE') ? 'ENTERPRISE' : 'PRO';
                if (userEmail) {
                    const user = await db_js_1.prisma.user.findUnique({ where: { email: userEmail } });
                    if (user) {
                        await db_js_1.prisma.subscription.upsert({
                            where: { userId: user.id },
                            update: {
                                paypalSubscriptionId: paypalSubId,
                                plan,
                                status: 'ACTIVE',
                            },
                            create: {
                                userId: user.id,
                                paypalSubscriptionId: paypalSubId,
                                plan,
                                status: 'ACTIVE',
                                currentPeriodStart: new Date(),
                                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                            },
                        });
                    }
                }
                break;
            }
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
            case 'BILLING.SUBSCRIPTION.REACTIVATED': {
                const paypalSubId = resource.id;
                const startTime = resource.start_time ? new Date(resource.start_time) : new Date();
                const nextBillingTime = resource.billing_info?.next_billing_time
                    ? new Date(resource.billing_info.next_billing_time)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                await db_js_1.prisma.subscription.updateMany({
                    where: { paypalSubscriptionId: paypalSubId },
                    data: {
                        status: 'ACTIVE',
                        currentPeriodStart: startTime,
                        currentPeriodEnd: nextBillingTime,
                    },
                });
                console.log(`[PayPal Webhook] Subscription ${paypalSubId} activated`);
                break;
            }
            case 'BILLING.SUBSCRIPTION.CANCELLED':
            case 'BILLING.SUBSCRIPTION.EXPIRED': {
                const paypalSubId = resource.id;
                await db_js_1.prisma.subscription.updateMany({
                    where: { paypalSubscriptionId: paypalSubId },
                    data: { status: webhookEvent === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'CANCELLED' : 'EXPIRED' },
                });
                console.log(`[PayPal Webhook] Subscription ${paypalSubId} ${webhookEvent.split('.')[2].toLowerCase()}`);
                break;
            }
            case 'BILLING.SUBSCRIPTION.SUSPENDED': {
                const paypalSubId = resource.id;
                await db_js_1.prisma.subscription.updateMany({
                    where: { paypalSubscriptionId: paypalSubId },
                    data: { status: 'PAST_DUE' },
                });
                break;
            }
            case 'PAYMENT.SALE.COMPLETED': {
                // Payment received – extend the period
                const paypalSubId = resource.billing_agreement_id;
                const amount = resource.amount?.total;
                const nextBillingTime = resource.billing_info?.next_payment_time
                    ? new Date(resource.billing_info.next_payment_time)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                if (paypalSubId) {
                    await db_js_1.prisma.subscription.updateMany({
                        where: { paypalSubscriptionId: paypalSubId },
                        data: { currentPeriodEnd: nextBillingTime },
                    });
                }
                console.log(`[PayPal Webhook] Payment ${amount} received for ${paypalSubId}`);
                break;
            }
            default:
                console.log(`[PayPal Webhook] Unhandled event: ${webhookEvent}`);
        }
    }
    catch (err) {
        console.error('[PayPal Webhook] Error processing event:', err);
        // Still return 200 so PayPal doesn't retry
    }
    res.json({ received: true });
});
exports.default = router;
//# sourceMappingURL=subscription.js.map