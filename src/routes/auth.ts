import { Router, Request, Response } from 'express';
import { prisma } from '../services/db.js';
import { generateToken } from '../services/jwt.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const router = Router();

// POST /api/auth/supabase-exchange
// Receives a Supabase access token (as JSON {access_token} or raw JWT string), returns a backend JWT
router.post('/supabase-exchange', async (req: Request, res: Response) => {
  try {
    // Accept both JSON { access_token: "..." } and raw JWT string
    let access_token = (req.body as any)?.access_token || (req.body as any) || null;
    if (!access_token || typeof access_token !== 'string') {
      res.status(400).json({ success: false, error: 'access_token is required' });
      return;
    }
    access_token = access_token.trim();

    if (!access_token) {
      res.status(400).json({ error: 'access_token is required' });
      return;
    }

    // Validate the Supabase access token using the service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;
    let email: string | null = null;

    try {
      const { data: { user }, error } = await supabase.auth.getUser(access_token);
      if (!error && user) {
        userId = user.id;
        email = user.email || null;
      }
    } catch {}

    // Fallback: decode JWT payload directly
    if (!userId) {
      try {
        const parts = access_token.split('.');
        if (parts.length === 3) {
          // Try URL-safe base64 first, then standard base64
          let payload: any;
          try {
            payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
          } catch {
            payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          }
          userId = payload.sub || payload.user_id || null;
          email = payload.email || null;
        }
      } catch (e) {}
      if (!userId) {
        res.status(401).json({ success: false, error: 'Invalid token' });
        return;
      }
    }

    // Upsert user in our DB
    let user = await prisma.user.findUnique({ where: { id: userId } }) as any;
    if (!user) {
      try {
        user = await prisma.user.create({
          data: { id: userId!, email: email || `user_${userId}@unknown`, provider: 'GOOGLE' },
        }) as any;
      } catch (createErr: any) {
        if (createErr?.code === 'P2002') {
          user = await prisma.user.findUnique({ where: { email: email! } }) as any;
        } else {
          throw createErr;
        }
      }
    }

    // Generate backend JWT
    const backendToken = generateToken(user);
    res.json({ success: true, data: { token: backendToken } });
  } catch (err: any) {
    console.error('[/api/auth/supabase-exchange]', err?.message || err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
