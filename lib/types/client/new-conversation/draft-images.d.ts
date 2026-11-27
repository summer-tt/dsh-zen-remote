import { type DraftImageMediaType, type DraftImagePart } from '../../client-data/draft-images.ts';
import { type DraftTargetState } from './target.ts';
type DraftImageTarget = Pick<DraftTargetState, 'hostId' | 'workspaceId' | 'generation'>;
export type DraftImageFailure = 'unsupported' | 'limit' | 'empty' | 'preview';
export interface DraftImageFile {
    readonly id: string;
    readonly name: string;
    readonly mediaType: DraftImageMediaType;
    readonly file: File;
}
interface Preview extends DraftImageFile {
    readonly url: string;
}
/** Own the preview URLs for the images staged under each draft target. */
export declare function createDraftImageStore(urls?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>): {
    read: (key: string) => readonly Preview[];
    add(target: DraftImageTarget, generation: number, files: readonly File[]): DraftImageFailure | undefined;
    remove(target: DraftImageTarget, generation: number, id: string): void;
    adopt(hostId: string, workspaceId: string): void;
    restore(key: string, files: readonly DraftImageFile[]): boolean;
    matches(key: string, ids: readonly string[]): boolean;
    clearSent(key: string, ids: readonly string[]): void;
    dispose(): void;
};
/** Keep frozen image bytes out of localStorage so screenshots can exceed its string quota. */
export declare function createPendingImageStorage(): {
    read: (key: string) => Promise<readonly DraftImageFile[] | undefined>;
    write: (key: string, files: readonly DraftImageFile[]) => Promise<IDBValidKey>;
    remove: (key: string) => Promise<undefined>;
};
export declare function encodeDraftImage({ file, mediaType, name }: DraftImageFile): Promise<DraftImagePart>;
export {};
//# sourceMappingURL=draft-images.d.ts.map