declare const router: import("express-serve-static-core").Router;
export declare function verifySupabaseToken(accessToken: string): Promise<{
    id: string;
    email: string;
    name?: string;
    avatar?: string;
} | null>;
export default router;
//# sourceMappingURL=auth.d.ts.map