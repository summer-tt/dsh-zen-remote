export const DRAFT_IMAGE_LIMIT = 20;
export const DRAFT_IMAGE_NAME_LIMIT = 255;
const mediaTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function isDraftImageMediaType(type) {
    return mediaTypes.some(mediaType => mediaType === type);
}
//# sourceMappingURL=draft-images.js.map