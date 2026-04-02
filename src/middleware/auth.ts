import { Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';
import { AuthenticatedRequest } from '../types/index.js';

function decodeSupabaseToken(token: string): { userId: string; email: string } | { error: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { error: `Token does not have 3 parts: ${parts.length}` };
    }
    const payloadB64 = parts[1];
    // Try URL-safe base64 first, then standard base64
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      try {
        payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
      } catch {
        return { error: 'Could not decode payload' };
      }
    }
    const userId = payload.sub || payload.user_id;
    if (!userId) {
      return { error: `No sub/user_id in token payload: ${JSON.stringify(Object.keys(payload))}` };
    }
    return { userId, email: payload.email || `user_${userId}@unknown` };
  } catch (err: any) {
    return { error: `JWT decode failed: ${err.message}` };
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
    const decoded = decodeSupabaseToken(token);

    if ('error' in decoded) {
      console.error('[Auth] Token decode failed:', decoded.error, '| token prefix:', token.substring(0, 50));
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { userId, email } = decoded;

    let user = await prisma.user.findUnique({ where: { id: userId } }) as any;

    if (!user) {
      try {
        user = await prisma.user.create({
          data: { id: userId, email, provider: 'GOOGLE' },
        }) as any;
      } catch (createErr: any) {
        // Email already exists with different userId — use that user
        if (createErr?.code === 'P2002') {
          user = await prisma.user.findUnique({ where: { email } }) as any;
        } else {
          throw createErr;
        }
      }
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
