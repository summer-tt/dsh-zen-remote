import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NewConversationError } from './index.js'

export const DRAFT_FILE_CANDIDATES_METHOD = 'draftFileCandidates'

const MAX_RESULTS = 20
const MAX_PATH_BYTES = 4096
const UNINSERTABLE_MENTION_CHARACTERS = /[\u0000-\u001f\u007f-\u009f"]/u

export interface DraftFileCandidatesRequest {
  readonly workspaceId: string
  readonly query: string
}

export interface DraftFileCandidate {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

export type ListDraftFileCandidates = (request: DraftFileCandidatesRequest, signal: AbortSignal) => Promise<readonly DraftFileCandidate[]>

interface WorkspaceRegistry {
  get(id: string): { readonly path: string } | undefined
}

interface SearchConfig {
  readonly maxResults: number
  readonly maxEntries: number
  readonly excludedDirectories: readonly string[]
}

interface FileSearch {
  list(query: string, signal: AbortSignal): Promise<readonly DraftFileCandidate[]>
  dispose(): void
}

export function draftFileCandidatesUnsupported(cause?: unknown): NewConversationError {
  return new NewConversationError(409, 'draft-file-candidates-unsupported', 'The selected Host does not support draft file candidates', { cause })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkspaceRelative(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  return !normalized.startsWith('/') && !/^[a-z]:/iu.test(normalized) && !normalized.split('/').includes('..') && !path.includes('\0')
}

export function parseDraftFileCandidatesRequest(input: unknown): DraftFileCandidatesRequest {
  if (!isRecord(input) || Object.keys(input).some(key => key !== 'workspaceId' && key !== 'query')
    || typeof input.workspaceId !== 'string' || input.workspaceId.trim() === '' || input.workspaceId.length > 256
    || typeof input.query !== 'string' || Buffer.byteLength(input.query, 'utf8') > 4096 || input.query.includes('\0')) {
    throw new NewConversationError(400, 'bad-request', 'Invalid draft file candidate request')
  }
  return { workspaceId: input.workspaceId, query: input.query }
}

export function draftFileCandidateRows(input: unknown): readonly DraftFileCandidate[] {
  if (!Array.isArray(input)) throw new NewConversationError(502, 'invalid-reply', 'The selected Host returned invalid draft file candidates')
  const rows: DraftFileCandidate[] = []
  for (const row of input as readonly unknown[]) {
    if (!isRecord(row) || typeof row.path !== 'string' || (row.kind !== 'file' && row.kind !== 'directory')) {
      throw new NewConversationError(502, 'invalid-reply', 'The selected Host returned an invalid draft file candidate')
    }
    if (row.path === '' || Buffer.byteLength(row.path, 'utf8') > MAX_PATH_BYTES
      || UNINSERTABLE_MENTION_CHARACTERS.test(row.path) || !isWorkspaceRelative(row.path)) continue
    rows.push({ path: row.path, kind: row.kind })
    if (rows.length === MAX_RESULTS) break
  }
  return rows
}

/** Resolve the public search exports from the launched DSH, as for model selection. */
async function loadWorkspaceFileSearch(entrypoint: string | undefined): Promise<(root: string) => FileSearch> {
  try {
    if (!entrypoint) throw new Error('DSH entry point is unavailable')
    const anchor = createRequire(pathToFileURL(await realpath(entrypoint)))
    const specifier = '@deepseek-ai/dsh-file-reference-local'
    let entry: string
    try {
      entry = anchor.resolve(specifier)
    } catch {
      // Strict installs expose the file-reference dependency to the DSH Web bundle.
      const webApp = anchor.resolve('@deepseek-ai/dsh-web-app/package.json')
      entry = createRequire(webApp).resolve(specifier)
    }
    const {
      WorkspaceFileSearch, DEFAULT_FILE_SEARCH_MAX_RESULTS: maxResults,
      DEFAULT_FILE_SEARCH_MAX_ENTRIES: maxEntries, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: excludedDirectories,
    } = await import(pathToFileURL(entry).href) as {
      WorkspaceFileSearch?: new (root: string, config: SearchConfig) => FileSearch
      DEFAULT_FILE_SEARCH_MAX_RESULTS?: unknown
      DEFAULT_FILE_SEARCH_MAX_ENTRIES?: unknown
      DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES?: unknown
    }
    if (typeof WorkspaceFileSearch !== 'function' || typeof WorkspaceFileSearch.prototype.list !== 'function'
      || typeof WorkspaceFileSearch.prototype.dispose !== 'function'
      || typeof maxResults !== 'number' || !Number.isSafeInteger(maxResults) || maxResults <= 0
      || typeof maxEntries !== 'number' || !Number.isSafeInteger(maxEntries) || maxEntries <= 0
      || !Array.isArray(excludedDirectories) || excludedDirectories.some(name => typeof name !== 'string')) {
      throw new Error('The active DSH does not expose the workspace file search API')
    }
    return root => new WorkspaceFileSearch(root, { maxResults, maxEntries, excludedDirectories })
  } catch (cause) {
    throw draftFileCandidatesUnsupported(cause)
  }
}

export function createDraftFileCandidates(
  getRegistry: () => WorkspaceRegistry | undefined,
  entrypoint = process.argv[1],
): ListDraftFileCandidates {
  let implementation: ReturnType<typeof loadWorkspaceFileSearch> | undefined
  return async ({ workspaceId, query }, signal) => {
    signal.throwIfAborted()
    const registry = getRegistry()
    if (typeof registry?.get !== 'function') throw draftFileCandidatesUnsupported()
    const root = registry.get(workspaceId)?.path
    const missing = () => new NewConversationError(404, 'workspace-not-found', 'The selected workspace does not exist')
    if (typeof root !== 'string' || !isAbsolute(root)) throw missing()
    const stillRegistered = async () => {
      // WorkspaceRegistry stores fs.realpath's canonical spelling, including on macOS.
      return await realpath(root).catch(() => undefined) === root && getRegistry()?.get(workspaceId)?.path === root
    }
    const makeSearch = await (implementation ??= loadWorkspaceFileSearch(entrypoint))
    signal.throwIfAborted()
    if (!isWorkspaceRelative(query)) return []

    if (!await stillRegistered()) throw missing()
    signal.throwIfAborted()
    const search = makeSearch(root)
    try {
      const rows = await search.list(query, signal)
      signal.throwIfAborted()
      if (!await stillRegistered()) throw missing()
      signal.throwIfAborted()
      return draftFileCandidateRows(rows)
    } catch (cause) {
      signal.throwIfAborted()
      if (cause instanceof NewConversationError) throw cause
      throw new NewConversationError(503, 'draft-file-candidates-failed', 'The selected workspace could not be searched', { cause })
    } finally {
      // A bare fuzzy query owns this index. Disposing also cancels its scan
      // when the call stops waiting because the browser disconnected.
      search.dispose()
    }
  }
}
