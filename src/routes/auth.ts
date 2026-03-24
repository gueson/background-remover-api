import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../services/db.js';
import { generateToken } from '../services/jwt.js';
import { BadRequestError, UnauthorizedError } from '../middleware/errorHandler.js';
import { AuthUser } from '../types/index.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google OAuth Login/Register
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      throw new BadRequestError('Token is required');
    }
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedError('Invalid Google token');
    }
    
    const email = payload.email.toLowerCase();
    const name = payload.name || null;
    const avatar = payload.picture || null;
    
    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email, provider: 'GOOGLE' },
          { email, providerId: payload.sub },
        ],
      },
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar,
          provider: 'GOOGLE',
          providerId: payload.sub,
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
        data: { name, avatar },
      });
    }
    
    const jwtToken = generateToken({ userId: user.id, email: user.email });
    
    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.provider,
        },
      },
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    if (error instanceof BadRequestError || error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Google authentication failed');
  }
});

// GitHub OAuth (simplified - in production, implement proper OAuth flow)
router.post('/github', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      throw new BadRequestError('Code is required');
    }
    
    // Exchange code for access token (implement GitHub OAuth)
    // This is a simplified version - real implementation would:
    // 1. Exchange code for access token via GitHub API
    // 2. Get user info from GitHub API
    // 3. Create/find user in database
    
    // Placeholder response
    throw new BadRequestError('GitHub OAuth not configured. Please use Google login.');
  } catch (error: any) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError('GitHub authentication failed');
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.json({
      success: true,
      data: { authenticated: false },
    });
    return;
  }
  
  const token = authHeader.substring(7);
  const jwt = await import('../services/jwt.js');
  const payload = jwt.verifyToken(token);
  
  if (!payload) {
    res.json({
      success: true,
      data: { authenticated: false },
    });
    return;
  }
  
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
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
    data: {
      authenticated: !!user,
      user,
    },
  });
});

export default router;
