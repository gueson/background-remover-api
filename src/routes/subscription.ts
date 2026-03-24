import { Router, Request, Response } from 'express';
import { prisma } from '../services/db.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, SubscriptionInfo } from '../types/index.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Initialize PayPal SDK
const paypal = require('@paypal/checkout-server-sdk');
const paypalEnvironment = process.env.PAYPAL_MODE === 'live'
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!);
const paypalClient = new paypal.core.PayPalHttpClient(paypalEnvironment);

// Get current subscription
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });
  
  const usageThisMonth = await prisma.usageLog.aggregate({
    where: {
      userId,
      createdAt: {
        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    },
    _count: true,
    _sum: { imageSize: true },
  });
  
  const planLimits: Record<string, number | null> = {
    FREE: 10,
    PRO: null, // unlimited
    ENTERPRISE: null,
  };
  
  const plan = subscription?.plan || 'FREE';
  const monthlyLimit = planLimits[plan];
  
  const subscriptionInfo: SubscriptionInfo = {
    plan,
    status: subscription?.status || 'ACTIVE',
    currentPeriodStart: subscription?.currentPeriodStart || null,
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    quota: {
      monthly: monthlyLimit,
      used: usageThisMonth._count,
      remaining: monthlyLimit !== null ? Math.max(0, monthlyLimit - usageThisMonth._count) : null,
    },
  };
  
  res.json({
    success: true,
    data: subscriptionInfo,
  });
});

// Create PayPal Checkout Session
router.post('/create-checkout', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { plan } = req.body; // 'PRO' or 'ENTERPRISE'
  
  if (!['PRO', 'ENTERPRISE'].includes(plan)) {
    throw new BadRequestError('Invalid plan. Choose PRO or ENTERPRISE.');
  }
  
  const userId = req.user!.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  const prices: Record<string, string> = {
    PRO: '9.00',
    ENTERPRISE: '29.00',
  };
  
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    customer: {
      purchase_unit: {
        reference_id: userId,
        amount: {
          currency_code: 'USD',
          value: prices[plan],
        },
        custom_id: JSON.stringify({ userId, plan }),
      },
    },
    checkout_setup: {
      flow_config: {
        bank_txn_pending_url: `${process.env.FRONTEND_URL}/subscription/pending`,
      },
    },
  });
  
  try {
    const order = await paypalClient.execute(request);
    
    // Find approval URL
    const approvalLink = order.result.links.find(
      (link: any) => link.rel === 'approve'
    );
    
    res.json({
      success: true,
      data: {
        orderId: order.result.id,
        approvalUrl: approvalLink?.href,
      },
    });
  } catch (error: any) {
    console.error('PayPal error:', error);
    throw new BadRequestError('Failed to create PayPal order. Please try again.');
  }
});

// Capture PayPal Order (after user approves)
router.post('/capture', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { orderId } = req.body;
  
  if (!orderId) {
    throw new BadRequestError('Order ID is required');
  }
  
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});
  
  try {
    const capture = await paypalClient.execute(request);
    
    if (capture.result.status === 'COMPLETED') {
      const customData = JSON.parse(
        capture.result.purchase_units[0].custom_id || '{}'
      );
      
      // Update subscription
      await prisma.subscription.upsert({
        where: { userId: customData.userId },
        update: {
          plan: customData.plan,
          status: 'ACTIVE',
          paypalSubscriptionId: orderId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        create: {
          userId: customData.userId,
          plan: customData.plan,
          status: 'ACTIVE',
          paypalSubscriptionId: orderId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      
      res.json({
        success: true,
        message: 'Subscription activated successfully',
      });
    } else {
      throw new BadRequestError('Payment not completed');
    }
  } catch (error: any) {
    console.error('PayPal capture error:', error);
    throw new BadRequestError('Failed to capture payment');
  }
});

// Cancel subscription
router.post('/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  
  await prisma.subscription.update({
    where: { userId },
    data: { status: 'CANCELLED' },
  });
  
  res.json({
    success: true,
    message: 'Subscription cancelled',
  });
});

// Webhook for PayPal events
router.post('/webhook', async (req: Request, res: Response) => {
  const webhookEvent = req.body;
  
  // In production, verify webhook signature
  console.log('PayPal webhook:', webhookEvent.event_type);
  
  if (webhookEvent.event_type === 'BILLING.SUBSCRIPTION.CANCELLED') {
    const subscriptionId = webhookEvent.resource.id;
    
    await prisma.subscription.updateMany({
      where: { paypalSubscriptionId: subscriptionId },
      data: { status: 'CANCELLED' },
    });
  }
  
  res.json({ received: true });
});

export default router;
