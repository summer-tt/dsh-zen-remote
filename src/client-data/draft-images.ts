export const DRAFT_IMAGE_LIMIT = 20
export const DRAFT_IMAGE_NAME_LIMIT = 255

const mediaTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type DraftImageMediaType = typeof mediaTypes[number]

export function isDraftImageMediaType(type: unknown): type is DraftImageMediaType {
  return mediaTypes.some(mediaType => mediaType === type)
}

/** Encoded image input accepted by DSH's Session prompt admission. */
export interface DraftImagePart {
  readonly type: 'image'
  readonly mediaType: DraftImageMediaType
  readonly data: string
  readonly name?: string
}
