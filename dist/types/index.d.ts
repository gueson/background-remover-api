import { Request } from 'express';
export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    provider: 'GOOGLE' | 'GITHUB' | 'EMAIL';
}
export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
export interface TokenPayload {
    userId: string;
    email: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface SubscriptionInfo {
    plan: 'FREE' | 'PRO' | 'ENTERPRISE';
    status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE';
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    quota: {
        monthly: number | null;
        used: number;
        remaining: number | null;
    };
}
export interface UsageStats {
    totalRequests: number;
    totalImageSize: number;
    averageProcessingTime: number;
    thisMonth: {
        requests: number;
        imageSize: number;
    };
}
//# sourceMappingURL=index.d.ts.map