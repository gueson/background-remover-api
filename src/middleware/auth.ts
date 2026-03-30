import { Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';
import { verifyToken } from '../services/jwt.js';
import { AuthenticatedRequest } from '../types/index.js';
import { verifySupabaseToken } from '../routes/auth.js';

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
    
    // Try our own JWT first
    let payload = verifyToken(token);
    
    if (!payload) {
      // If our JWT fails, try verifying as Supabase token
      const supabaseUser = await verifySupabaseToken(token);
      if (!supabaseUser) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      
      // Find or create user in our DB based on Supabase user
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: supabaseUser.email.toLowerCase(), provider: 'GOOGLE' },
            { email: supabaseUser.email.toLowerCase(), providerId: supabaseUser.id },
          ],
        },
      });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: supabaseUser.email.toLowerCase(),
            name: supabaseUser.name || null,
            avatar: supabaseUser.avatar || null,
            provider: 'GOOGLE',
            providerId: supabaseUser.id,
            subscription: {
              create: {
                plan: 'FREE',
                status: 'ACTIVE',
              },
            },
          },
        });
      } else {
        // Update user info if changed
        user = await prisma.user.update({
          where: { id: user.id },
          data: { 
            name: supabaseUser.name || user.name,
            avatar: supabaseUser.avatar || user.avatar,
          },
        });
      }
      
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
      };
      next();
      return;
    }
    
    // Our own JWT succeeded - fetch full user from DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        provider: true,
      },
    });
    
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    req.user = user as any;
    next();
  } catch (error) {
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
