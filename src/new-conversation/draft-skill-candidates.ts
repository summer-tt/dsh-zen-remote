import type { DraftSkillCandidate } from '../client-data/draft-skills.js'
import { NewConversationError } from './index.js'

export const DRAFT_SKILL_CANDIDATES_METHOD = 'draftSkillCandidates'

export interface DraftSkillRequest {
  readonly workspaceId?: string
  readonly agentPreset?: string
}

export type ListDraftSkillCandidates = (request: DraftSkillRequest, signal: AbortSignal) => Promise<readonly DraftSkillCandidate[]>

interface SkillCatalog {
  previewDraft(request: DraftSkillRequest, signal: AbortSignal): Promise<{ skills: unknown }>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseDraftSkillRequest(value: unknown): DraftSkillRequest {
  if (!record(value) || Object.entries(value).some(([key, field]) =>
    (key !== 'workspaceId' && key !== 'agentPreset') || typeof field !== 'string' || field.trim() === '' || field.length > 256)) {
    throw new NewConversationError(400, 'bad-request', 'Invalid draft skill request')
  }
  return value as DraftSkillRequest
}

export function draftSkillRows(value: unknown, request: DraftSkillRequest): DraftSkillCandidate[] {
  if (!Array.isArray(value)) throw new NewConversationError(502, 'invalid-reply', 'Invalid draft skill catalog reply')
  const names = new Set<string>()
  const rows: DraftSkillCandidate[] = []
  for (const row of value as readonly unknown[]) {
    if (!record(row) || typeof row.name !== 'string' || row.name.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.name) ||
      (row.scope !== 'user' && (row.scope !== 'project' || request.workspaceId === undefined)) || names.has(row.name)) continue
    names.add(row.name)
    rows.push({ name: row.name, scope: row.scope })
    if (rows.length >= 2000) break
  }
  return rows
}

export function draftSkillsUnsupported(): NewConversationError {
  return new NewConversationError(409, 'draft-skills-unsupported', 'The selected Host does not support draft skill previews')
}

export function createDraftSkillCandidates(getCatalog: () => unknown): ListDraftSkillCandidates {
  return async (request, signal) => {
    signal.throwIfAborted()
    const catalog = getCatalog() as SkillCatalog | undefined
    if (typeof catalog?.previewDraft !== 'function') throw draftSkillsUnsupported()
    try {
      const { skills } = await catalog.previewDraft(request, signal)
      signal.throwIfAborted()
      return draftSkillRows(skills, request)
    } catch (error) {
      signal.throwIfAborted()
      const code = record(error) ? error.code : undefined
      if (code === 'DRAFT_SKILL_INVALID_WORKSPACE') throw new NewConversationError(404, 'workspace-not-found', 'The selected workspace is unavailable')
      if (code === 'DRAFT_SKILL_PRESET_NOT_FOUND' || code === 'DRAFT_SKILL_PRESET_INVALID') {
        throw new NewConversationError(409, 'preset-unavailable', 'The selected Agent preset is unavailable')
      }
      throw new NewConversationError(503, 'draft-skills-unavailable', 'The selected Host could not preview draft skills')
    }
  }
}
