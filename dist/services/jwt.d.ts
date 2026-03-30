import { TokenPayload, AuthUser } from '../types/index.js';
export declare function generateToken(payload: TokenPayload): string;
export declare function verifyToken(token: string): TokenPayload | null;
export declare function getUserFromToken(token: string): AuthUser | null;
//# sourceMappingURL=jwt.d.ts.map