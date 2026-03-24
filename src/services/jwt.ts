import jwt from 'jsonwebtoken';
import { TokenPayload, AuthUser } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function getUserFromToken(token: string): AuthUser | null {
  const payload = verifyToken(token);
  if (!payload) return null;
  
  return {
    id: payload.userId,
    email: payload.email,
    name: null,
    provider: 'EMAIL', // Default, will be populated from DB if needed
  };
}
