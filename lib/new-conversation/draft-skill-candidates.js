import { NewConversationError } from './index.js';
export const DRAFT_SKILL_CANDIDATES_METHOD = 'draftSkillCandidates';
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseDraftSkillRequest(value) {
    if (!record(value) || Object.entries(value).some(([key, field]) => (key !== 'workspaceId' && key !== 'agentPreset') || typeof field !== 'string' || field.trim() === '' || field.length > 256)) {
        throw new NewConversationError(400, 'bad-request', 'Invalid draft skill request');
    }
    return value;
}
export function draftSkillRows(value, request) {
    if (!Array.isArray(value))
        throw new NewConversationError(502, 'invalid-reply', 'Invalid draft skill catalog reply');
    const names = new Set();
    const rows = [];
    for (const row of value) {
        if (!record(row) || typeof row.name !== 'string' || row.name.length > 64 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.name) ||
            (row.scope !== 'user' && (row.scope !== 'project' || request.workspaceId === undefined)) || names.has(row.name))
            continue;
        names.add(row.name);
        rows.push({ name: row.name, scope: row.scope });
        if (rows.length >= 2000)
            break;
    }
    return rows;
}
export function draftSkillsUnsupported() {
    return new NewConversationError(409, 'draft-skills-unsupported', 'The selected Host does not support draft skill previews');
}
export function createDraftSkillCandidates(getCatalog) {
    return async (request, signal) => {
        signal.throwIfAborted();
        const catalog = getCatalog();
        if (typeof catalog?.previewDraft !== 'function')
            throw draftSkillsUnsupported();
        try {
            const { skills } = await catalog.previewDraft(request, signal);
            signal.throwIfAborted();
            return draftSkillRows(skills, request);
        }
        catch (error) {
            signal.throwIfAborted();
            const code = record(error) ? error.code : undefined;
            if (code === 'DRAFT_SKILL_INVALID_WORKSPACE')
                throw new NewConversationError(404, 'workspace-not-found', 'The selected workspace is unavailable');
            if (code === 'DRAFT_SKILL_PRESET_NOT_FOUND' || code === 'DRAFT_SKILL_PRESET_INVALID') {
                throw new NewConversationError(409, 'preset-unavailable', 'The selected Agent preset is unavailable');
            }
            throw new NewConversationError(503, 'draft-skills-unavailable', 'The selected Host could not preview draft skills');
        }
    };
}
//# sourceMappingURL=draft-skill-candidates.js.map