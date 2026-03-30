"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const db_js_1 = require("../services/db.js");
const jwt_js_1 = require("../services/jwt.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const router = (0, express_1.Router)();
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
// Google OAuth Login/Register
router.post('/google', async (req, res) => {
    try {
        const { token: idToken, access_token: accessToken, code } = req.body;
        let payload;
        if (code) {
            // Exchange authorization code for tokens (with 10s timeout)
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    redirect_uri: `${process.env.FRONTEND_URL}/auth/callback`,
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!tokenRes.ok) {
                const errData = await tokenRes.text();
                throw new errorHandler_js_1.UnauthorizedError(`Token exchange failed: ${errData}`);
            }
            const tokens = await tokenRes.json();
            const idTokenFromCode = tokens.id_token;
            const ticket = await googleClient.verifyIdToken({
                idToken: idTokenFromCode,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        }
        else if (idToken) {
            // Verify ID token (JWT)
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        }
        else if (accessToken) {
            // Verify access token by fetching user info from Google
            const userInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`);
            if (!userInfoRes.ok) {
                throw new errorHandler_js_1.UnauthorizedError('Invalid Google access token');
            }
            payload = await userInfoRes.json();
        }
        else {
            throw new errorHandler_js_1.BadRequestError('Token, access_token, or code is required');
        }
        if (!payload || !payload.email) {
            throw new errorHandler_js_1.UnauthorizedError('Invalid Google token');
        }
        const email = payload.email.toLowerCase();
        const name = payload.name || null;
        const avatar = payload.picture || null;
        // Find or create user
        let user = await db_js_1.prisma.user.findFirst({
            where: {
                OR: [
                    { email, provider: 'GOOGLE' },
                    { email, providerId: payload.sub },
                ],
            },
        });
        if (!user) {
            user = await db_js_1.prisma.user.create({
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
        }
        else {
            // Update user info if changed
            user = await db_js_1.prisma.user.update({
                where: { id: user.id },
                data: { name, avatar },
            });
        }
        const jwtToken = (0, jwt_js_1.generateToken)({ userId: user.id, email: user.email });
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
    }
    catch (error) {
        console.error('Google auth error:', error);
        if (error instanceof errorHandler_js_1.BadRequestError || error instanceof errorHandler_js_1.UnauthorizedError) {
            res.status(error.statusCode).json({ success: false, error: error.message });
            return;
        }
        res.status(401).json({ success: false, error: 'Google authentication failed' });
    }
});
// GitHub OAuth (simplified - in production, implement proper OAuth flow)
router.post('/github', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            throw new errorHandler_js_1.BadRequestError('Code is required');
        }
        // Exchange code for access token (implement GitHub OAuth)
        // This is a simplified version - real implementation would:
        // 1. Exchange code for access token via GitHub API
        // 2. Get user info from GitHub API
        // 3. Create/find user in database
        // Placeholder response
        throw new errorHandler_js_1.BadRequestError('GitHub OAuth not configured. Please use Google login.');
    }
    catch (error) {
        if (error instanceof errorHandler_js_1.BadRequestError) {
            throw error;
        }
        throw new errorHandler_js_1.BadRequestError('GitHub authentication failed');
    }
});
// Get current user
router.get('/me', async (req, res) => {
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
    const user = await db_js_1.prisma.user.findUnique({
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
router.post('/supabase-exchange', async (req, res) => {
    try {
        const { access_token } = req.body;
        if (!access_token) {
            throw new errorHandler_js_1.BadRequestError('access_token is required');
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
            throw new errorHandler_js_1.UnauthorizedError('Invalid Supabase token');
        }
        const supabaseUser = await userRes.json();
        if (!supabaseUser?.email) {
            throw new errorHandler_js_1.UnauthorizedError('No email in Supabase user');
        }
        const email = supabaseUser.email.toLowerCase();
        const name = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null;
        const avatar = supabaseUser.user_metadata?.avatar_url || null;
        const providerId = supabaseUser.id;
        // Find or create user in our DB
        let user = await db_js_1.prisma.user.findFirst({
            where: {
                OR: [
                    { email, provider: 'GOOGLE' },
                    { email, providerId },
                ],
            },
        });
        if (!user) {
            user = await db_js_1.prisma.user.create({
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
        }
        else {
            // Update user info if changed
            user = await db_js_1.prisma.user.update({
                where: { id: user.id },
                data: { name, avatar },
            });
        }
        const jwtToken = (0, jwt_js_1.generateToken)({ userId: user.id, email: user.email });
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
    }
    catch (error) {
        console.error('Supabase exchange error:', error);
        if (error instanceof errorHandler_js_1.BadRequestError || error instanceof errorHandler_js_1.UnauthorizedError) {
            res.status(error.statusCode).json({ success: false, error: error.message });
            return;
        }
        res.status(401).json({ success: false, error: 'Supabase token exchange failed' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map