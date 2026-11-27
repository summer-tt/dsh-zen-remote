import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AdminAdmission } from './admin-routes.js'
import { ClientRouteError, requireSessionHostRelay } from './client-routes.js'
import { responseJson, sameOriginPost } from './http.js'
import { NewConversationError, parseNewConversationRequest, type NewConversationRequest } from './new-conversation/index.js'
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
  const relay = requireSessionHostRelay(options.getPool(), hostId)
  if (relay.handshakeInfo?.supportsCreateDraft !== true) {
    throw new NewConversationError(409, 'remote-unsupported', 'The selected Host does not support this new conversation flow')
  }
  if (request.images !== undefined && relay.handshakeInfo.supportsCreateDraftImages !== true) {
    throw new NewConversationError(409, 'draft-images-unsupported', 'The selected Host does not support images in a new conversation')
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
      const { hostId, request: incoming, ...rest } = await bodyOf(req)
      if (typeof hostId !== 'string' || !/^(?:local|[a-f0-9]{8})$/u.test(hostId) || Object.keys(rest).length !== 0) {
        throw new NewConversationError(400, 'bad-request', 'Select the conversation Host')
      }
      const request = parseNewConversationRequest(incoming)
      const value = hostId === 'local'
        ? await options.submitLocal({ ...request, text: translatedPrompt(request.text, hostId) })
        : await submitRemote(options, hostId, request)
      let preferenceSaved = true
      try { await options.saveRecentHost(hostId) } catch { preferenceSaved = false }
      responseJson(res, 200, { ok: true, value: { ...value, preferenceSaved } })
    } catch (error) {
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
