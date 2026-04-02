import { Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';
import { AuthenticatedRequest } from '../types/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function validateSupabaseToken(token: string): Promise<{ userId: string; email: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string; email?: string };
    if (!data.id || !data.email) return null;
    return { userId: data.id, email: data.email };
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    
    const token = authHeader.substring(7);

    // Try Supabase token (most common case for logged-in users)
    let supabaseUser = await validateSupabaseToken(token);
    let userId: string;
    let email: string;

    if (supabaseUser) {
      userId = supabaseUser.userId;
      email = supabaseUser.email;
    } else {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Upsert user if not exists
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, provider: true },
    });

    if (!user) {
      user = await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: email || `user_${userId}@unknown`, provider: 'GOOGLE' },
        select: { id: true, email: true, name: true, provider: true },
      });
    }
    
    req.user = user as any;
    next();
  } catch (error: any) {
    console.error('[Auth Middleware Error]:', error?.message || error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  
  authMiddleware(req, res, next);
}
