export declare const DRAFT_IMAGE_LIMIT = 20;
export declare const DRAFT_IMAGE_NAME_LIMIT = 255;
declare const mediaTypes: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
export type DraftImageMediaType = typeof mediaTypes[number];
export declare function isDraftImageMediaType(type: unknown): type is DraftImageMediaType;
/** Encoded image input accepted by DSH's Session prompt admission. */
export interface DraftImagePart {
    readonly type: 'image';
    readonly mediaType: DraftImageMediaType;
    readonly data: string;
    readonly name?: string;
}
export {};
//# sourceMappingURL=draft-images.d.ts.map