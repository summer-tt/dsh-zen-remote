import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AdminAdmission } from './admin-routes.js'
import { ClientRouteError, requireSessionHostRelay } from './client-routes.js'
import { responseJson, sameOriginPost } from './http.js'
import { NewConversationError, parseNewConversationRequest, type NewConversationRequest } from './new-conversation/index.js'
import {
  DRAFT_FILE_CANDIDATES_METHOD, draftFileCandidateRows, draftFileCandidatesUnsupported, parseDraftFileCandidatesRequest,
  type ListDraftFileCandidates,
} from './new-conversation/draft-file-candidates.js'
import { DRAFT_SKILL_CANDIDATES_METHOD, draftSkillRows, draftSkillsUnsupported, parseDraftSkillRequest, type ListDraftSkillCandidates } from './new-conversation/draft-skill-candidates.js'
import { DRAFT_MODEL_CONTROLS_METHOD, parseDraftControlsAddress, parseDraftModelControls, type DraftControlsAddress, type DraftModelControls } from './new-conversation/model-controls.js'
import type { RelayPool } from './relay-pool.js'
import { RelayError } from './relay-client.js'
import { SESSION_REFERENCE_URI, decodeSessionReferenceUri, encodeSessionReferenceUri } from './session-reference.js'
import { fromVirtual, toVirtual } from './virtual-id.js'
import { MAX_DRAFT_REQUEST_BYTES } from './upload-limits.js'

export const NEW_CONVERSATION_ROUTE = '/_dsh/zen-remote/new-conversation'

interface Options {
  admit(req: IncomingMessage): AdminAdmission
  getPool(): RelayPool | undefined
  getRecentHost(): string
  saveRecentHost(hostId: string): Promise<void>
  submitLocal(request: NewConversationRequest): Promise<{ sessionId: string }>
  listLocalDraftFileCandidates: ListDraftFileCandidates
  listLocalDraftSkillCandidates?: ListDraftSkillCandidates
  describeLocalModelControls?(address: DraftControlsAddress): Promise<DraftModelControls>
  onRemoteCreated(sessionId: string): void
}

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_DRAFT_REQUEST_BYTES) throw new NewConversationError(413, 'body-too-large', 'The draft is too large')
    chunks.push(bytes)
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) return data as Record<string, unknown>
  } catch { /* Report the same error for malformed JSON. */ }
  throw new NewConversationError(400, 'bad-request', 'Expected a JSON object')
}

function translatedPrompt(text: string, hostId: string): string {
  for (const match of text.matchAll(SESSION_REFERENCE_URI)) {
    const uri = match[1] ?? match[2]
    const id = decodeSessionReferenceUri(uri)
    if (id === undefined) continue
    const virtual = fromVirtual(id)
    if (virtual === undefined && hostId === 'local') continue
    if (virtual === undefined || virtual.serverId !== hostId) throw new NewConversationError(400, 'remote-mismatch', 'The draft references a different Host')
    text = text.replaceAll(uri, encodeSessionReferenceUri(virtual.id))
  }
  return text
}

async function submitRemote(options: Options, hostId: string, request: NewConversationRequest): Promise<{ sessionId: string }> {
  const pool = options.getPool()
  if (request.modelControls !== undefined && pool?.getByServerId(hostId)?.identityPending === true) {
    throw new ClientRouteError(503, 'remote-connecting', 'Waiting for the selected Host')
  }
  const relay = requireSessionHostRelay(pool, hostId)
  if (relay.handshakeInfo?.supportsCreateDraft !== true) {
    throw new NewConversationError(409, 'remote-unsupported', 'The selected Host does not support this new conversation flow')
  }
  if (request.images !== undefined && relay.handshakeInfo.supportsCreateDraftImages !== true) {
    throw new NewConversationError(409, 'draft-images-unsupported', 'The selected Host does not support images in a new conversation')
  }
  if (request.modelControls !== undefined && relay.handshakeInfo.supportsDraftModelControls !== true) {
    throw new NewConversationError(409, 'draft-model-controls-unsupported', 'The selected Host cannot apply draft model controls')
  }
  const result = await relay.invoke('session', 'createWithFirstMessage', {
    request: { ...request, text: translatedPrompt(request.text, hostId) },
  }) as { sessionId?: unknown } | null | undefined
  if (typeof result?.sessionId !== 'string' || !result.sessionId || fromVirtual(result.sessionId) !== undefined) {
    throw new NewConversationError(502, 'invalid-reply', 'The selected Host returned an invalid Session ID')
  }
  const sessionId = toVirtual(hostId, result.sessionId)
  options.onRemoteCreated(sessionId)
  return { sessionId }
}

async function lookupDraftCandidates(options: Options, hostId: string, method: string, request: object, res: ServerResponse,
  listLocal: (signal: AbortSignal) => Promise<unknown>, filter: (value: unknown) => unknown,
  unsupported: (cause?: unknown) => NewConversationError,
): Promise<void> {
  const controller = new AbortController()
  const onClose = () => { if (!res.writableEnded) controller.abort() }
  res.once('close', onClose)
  if (res.destroyed) onClose()
  const { signal } = controller
  try {
    signal.throwIfAborted()
    let value: unknown
    if (hostId === 'local') {
      value = await listLocal(signal)
    } else {
      const pool = options.getPool()
      const skillLookup = method === DRAFT_SKILL_CANDIDATES_METHOD
      if (skillLookup && pool?.getByServerId(hostId)?.identityPending === true) {
        throw new NewConversationError(503, 'remote-connecting', 'Waiting for the selected Host to confirm its identity')
      }
      const relay = requireSessionHostRelay(pool, hostId)
      const credentials = relay.lastHandshakeDigest
      let interrupted = false
      const unsubscribe = skillLookup ? relay.subscribe(state => { if (state !== 'online') interrupted = true }) : undefined
      try {
        value = await relay.invoke('session', method, { request }, signal)
        if (skillLookup) {
          const current = options.getPool()?.getByServerId(hostId)
          if (interrupted || current?.identityPending === true || current?.client !== relay ||
            relay.state !== 'online' || relay.lastHandshakeDigest !== credentials) {
            throw new NewConversationError(503, 'remote-binding-changed', 'The selected Host connection changed')
          }
        }
      } catch (error) {
        // Older Hosts return the unregistered-method refusal for this dedicated invoke.
        if (error instanceof RelayError && (error.code === 'forbidden-method' || error.code === 'unsupported')) {
          throw unsupported(error)
        }
        throw error
      } finally {
        unsubscribe?.()
      }
    }
    if (!signal.aborted) responseJson(res, 200, { ok: true, value: filter(value) })
  } finally {
    res.off('close', onClose)
  }
}

async function describeDraftModelControls(options: Options, hostId: string, input: unknown, res: ServerResponse): Promise<void> {
  const address = parseDraftControlsAddress(input)
  if (address === undefined) throw new NewConversationError(400, 'bad-request', 'Invalid draft model address')
  const controller = new AbortController()
  const close = () => { if (!res.writableEnded) controller.abort() }
  res.once('close', close)
  if (res.destroyed) close()
  try {
    controller.signal.throwIfAborted()
    let value: unknown = {}
    if (hostId === 'local') value = await options.describeLocalModelControls?.(address) ?? {}
    else {
      const pool = options.getPool()
      if (pool?.getByServerId(hostId)?.identityPending === true) throw new ClientRouteError(503, 'remote-connecting', 'Waiting for the selected Host')
      const relay = requireSessionHostRelay(pool, hostId)
      if (relay.handshakeInfo?.supportsDraftModelControls === true) {
        const credentials = relay.lastHandshakeDigest
        let interrupted = false
        const unsubscribe = relay.subscribe(state => { if (state !== 'online') interrupted = true })
        try {
          value = await relay.invoke('session', DRAFT_MODEL_CONTROLS_METHOD, { request: address }, controller.signal)
        } finally {
          unsubscribe()
        }
        const current = options.getPool()?.getByServerId(hostId)
        if (interrupted || current?.client !== relay || current.identityPending === true ||
          relay.state !== 'online' || credentials !== relay.lastHandshakeDigest) {
          throw new ClientRouteError(503, 'remote-binding-changed', 'The selected Host connection changed')
        }
      }
    }
    const result = parseDraftModelControls(value)
    if (result === undefined) throw new NewConversationError(502, 'invalid-reply', 'Invalid Host draft model controls')
    if (!controller.signal.aborted) responseJson(res, 200, { ok: true, value: result })
  } finally {
    res.off('close', close)
  }
}

export function createNewConversationRoute(options: Options) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const admission = options.admit(req)
    if ('rejection' in admission || req.headers['x-zen-remote-via'] !== undefined) {
      const status = 'rejection' in admission ? admission.rejection : 403
      responseJson(res, status, { ok: false, error: { code: 'forbidden' } })
      return
    }
    if (req.method === 'GET') {
      responseJson(res, 200, { ok: true, value: { lastHost: options.getRecentHost() } })
      return
    }
    if (req.method !== 'POST' || !sameOriginPost(req)) {
      const status = req.method === 'POST' ? 403 : 405
      responseJson(res, status, { ok: false, error: { code: status === 403 ? 'origin-rejected' : 'method-not-allowed' } })
      return
    }
    try {
      const { hostId, request: incoming, fileCandidates, skillCandidates, modelControls, ...rest } = await bodyOf(req)
      if (typeof hostId !== 'string' || !/^(?:local|[a-f0-9]{8})$/u.test(hostId) || Object.keys(rest).length !== 0
        || [incoming, fileCandidates, skillCandidates, modelControls].filter(value => value !== undefined).length !== 1) {
        throw new NewConversationError(400, 'bad-request', 'Select the conversation Host and one draft operation')
      }
      if (fileCandidates !== undefined) {
        const request = parseDraftFileCandidatesRequest(fileCandidates)
        await lookupDraftCandidates(options, hostId, DRAFT_FILE_CANDIDATES_METHOD, request, res,
          signal => options.listLocalDraftFileCandidates(request, signal), draftFileCandidateRows, draftFileCandidatesUnsupported)
        return
      }
      if (skillCandidates !== undefined) {
        const request = parseDraftSkillRequest(skillCandidates)
        await lookupDraftCandidates(options, hostId, DRAFT_SKILL_CANDIDATES_METHOD, request, res,
          signal => {
            if (options.listLocalDraftSkillCandidates === undefined) throw draftSkillsUnsupported()
            return options.listLocalDraftSkillCandidates(request, signal)
          }, value => draftSkillRows(value, request), draftSkillsUnsupported)
        return
      }
      if (modelControls !== undefined) {
        await describeDraftModelControls(options, hostId, modelControls, res)
        return
      }
      const request = parseNewConversationRequest(incoming)
      const value = hostId === 'local'
        ? await options.submitLocal({ ...request, text: translatedPrompt(request.text, hostId) })
        : await submitRemote(options, hostId, request)
      let preferenceSaved = true
      try { await options.saveRecentHost(hostId) } catch { preferenceSaved = false }
      responseJson(res, 200, { ok: true, value: { ...value, preferenceSaved } })
    } catch (error) {
      if (res.destroyed) return
      if (error instanceof NewConversationError || error instanceof ClientRouteError) {
        responseJson(res, error.status, { ok: false, error: { code: error.code } })
      } else if (error instanceof RelayError) {
        responseJson(res, error.status ?? 502, { ok: false, error: { code: error.code } })
      } else {
        responseJson(res, 500, { ok: false, error: { code: 'create-failed' } })
      }
    }
  }
}
