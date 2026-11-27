import { NewConversationError } from './index.js';
export declare const DRAFT_FILE_CANDIDATES_METHOD = "draftFileCandidates";
export interface DraftFileCandidatesRequest {
    readonly workspaceId: string;
    readonly query: string;
}
export interface DraftFileCandidate {
    readonly path: string;
    readonly kind: 'file' | 'directory';
}
export type ListDraftFileCandidates = (request: DraftFileCandidatesRequest, signal: AbortSignal) => Promise<readonly DraftFileCandidate[]>;
interface WorkspaceRegistry {
    get(id: string): {
        readonly path: string;
    } | undefined;
}
export declare function draftFileCandidatesUnsupported(cause?: unknown): NewConversationError;
export declare function parseDraftFileCandidatesRequest(input: unknown): DraftFileCandidatesRequest;
export declare function draftFileCandidateRows(input: unknown): readonly DraftFileCandidate[];
export declare function createDraftFileCandidates(getRegistry: () => WorkspaceRegistry | undefined, entrypoint?: string): ListDraftFileCandidates;
export {};
//# sourceMappingURL=draft-file-candidates.d.ts.map