import type { DraftSkillCandidate } from '../client-data/draft-skills.js';
import { NewConversationError } from './index.js';
export declare const DRAFT_SKILL_CANDIDATES_METHOD = "draftSkillCandidates";
export interface DraftSkillRequest {
    readonly workspaceId?: string;
    readonly agentPreset?: string;
}
export type ListDraftSkillCandidates = (request: DraftSkillRequest, signal: AbortSignal) => Promise<readonly DraftSkillCandidate[]>;
export declare function parseDraftSkillRequest(value: unknown): DraftSkillRequest;
export declare function draftSkillRows(value: unknown, request: DraftSkillRequest): DraftSkillCandidate[];
export declare function draftSkillsUnsupported(): NewConversationError;
export declare function createDraftSkillCandidates(getCatalog: () => unknown): ListDraftSkillCandidates;
//# sourceMappingURL=draft-skill-candidates.d.ts.map