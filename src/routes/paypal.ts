import { Router, Request, Response } from 'express';
import { prisma, supabase } from '../services/db.js';

const router = Router();
const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as { error_description?: string; access_token?: string };
  if (!res.ok) throw new Error(data.error_description || 'Failed to get PayPal token');
  return data.access_token as string;
}

// GET /api/paypal/create-subscription (get user info for auth check)
router.get('/create-subscription', async (req: Request, res: Response) => {
  res.status(405).json({ error: 'Method not allowed' });
});

// POST /api/paypal/create-subscription
router.post('/create-subscription', async (req: Request, res: Response) => {
  try {
    const { planId } = req.body as { planId?: string };
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'PayPal is not configured. Please contact support.' });
      return;
    }

    if (!planId) {
      res.status(400).json({ error: 'planId is required' });
      return;
    }

    // Get authenticated user from Supabase token
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader && supabase) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          userId = user.id;
          userEmail = user.email || null;
        }
      } catch (e) {
        // auth failed, continue without user context
      }
    }

    const accessToken = await getPayPalAccessToken(clientId, clientSecret);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.background-remover-tools.online';

    const createRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        subscriber: userEmail ? { email_address: userEmail } : undefined,
        application_context: {
          brand_name: 'RemoveBG',
          landing_page: 'BILLING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${appUrl}/pricing?success=true&plan=pro`,
          cancel_url: `${appUrl}/pricing?canceled=true`,
        },
      }),
    });

    const subscriptionData = await createRes.json() as { id?: string; message?: string; links?: Array<{ rel?: string; href?: string }> };
    if (!createRes.ok) {
      console.error('PayPal create subscription error:', subscriptionData);
      res.status(createRes.status).json({ error: subscriptionData.message || 'Failed to create PayPal subscription' });
      return;
    }

    const paypalSubId = subscriptionData.id as string;
    const approvalUrl = subscriptionData.links?.find(
      (link) => link.rel === 'approve'
    )?.href;

    if (!approvalUrl) {
      res.status(500).json({ error: 'Could not get PayPal approval URL' });
      return;
    }

    // Store pending subscription in DB (user is PRO after PayPal confirms payment)
    if (userId) {
      try {
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            paypalSubscriptionId: paypalSubId,
            plan: 'PRO',
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          create: {
            userId,
            paypalSubscriptionId: paypalSubId,
            plan: 'PRO',
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        console.log(`[PayPal] Created pending subscription ${paypalSubId} for user ${userId}`);
      } catch (err) {
        console.error('[PayPal] Failed to create subscription record:', err);
      }
    }

    res.json({
      subscriptionId: paypalSubId,
      approvalUrl,
    });
  } catch (error: any) {
    console.error('PayPal subscription error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
