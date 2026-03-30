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
    const { token: idToken, access_token: accessToken, code } = req.body;

    let payload: any;

    if (code) {
      // Exchange authorization code for tokens (with 10s timeout)
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          redirect_uri: `${process.env.FRONTEND_URL}/auth/callback`,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.text();
        throw new UnauthorizedError(`Token exchange failed: ${errData}`);
      }

      const tokens = await tokenRes.json() as { id_token?: string };
      const idTokenFromCode = tokens.id_token!;

      const ticket = await googleClient.verifyIdToken({
        idToken: idTokenFromCode,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else if (idToken) {
      // Verify ID token (JWT)
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else if (accessToken) {
      // Verify access token by fetching user info from Google
      const userInfoRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`
      );
      if (!userInfoRes.ok) {
        throw new UnauthorizedError('Invalid Google access token');
      }
      payload = await userInfoRes.json();
    } else {
      throw new BadRequestError('Token, access_token, or code is required');
    }

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
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(401).json({ success: false, error: 'Google authentication failed' });
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

// Exchange Supabase access token for our backend JWT
// This is needed because frontend uses Supabase OAuth but backend uses its own JWT
router.post('/supabase-exchange', async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;
    
    if (!access_token) {
      throw new BadRequestError('access_token is required');
    }
    
    // Verify Supabase token by fetching user info
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured on backend');
    }
    
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': supabaseKey,
      },
    });
    
    if (!userRes.ok) {
      throw new UnauthorizedError('Invalid Supabase token');
    }
    
    const supabaseUser = await userRes.json() as {
      id: string;
      email?: string;
      user_metadata?: {
        full_name?: string;
        name?: string;
        avatar_url?: string;
      };
    };
    
    if (!supabaseUser?.email) {
      throw new UnauthorizedError('No email in Supabase user');
    }
    
    const email = supabaseUser.email.toLowerCase();
    const name = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null;
    const avatar = supabaseUser.user_metadata?.avatar_url || null;
    const providerId = supabaseUser.id;
    
    // Find or create user in our DB
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email, provider: 'GOOGLE' },
          { email, providerId },
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
          providerId,
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
    console.error('Supabase exchange error:', error);
    if (error instanceof BadRequestError || error instanceof UnauthorizedError) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    res.status(401).json({ success: false, error: 'Supabase token exchange failed' });
  }
});

export default router;
