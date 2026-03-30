export interface RemoveBackgroundResult {
    result_url: string;
    result_base64?: string;
    original_size: number;
    result_size: number;
    processingTimeMs: number;
}
export declare function removeBackground(imageBuffer: Buffer): Promise<RemoveBackgroundResult>;
export declare function isBackgroundServiceAvailable(): boolean;
//# sourceMappingURL=backgroundRemoval.d.ts.map