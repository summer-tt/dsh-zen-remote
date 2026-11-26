import type { Context } from '@deepseek-ai/cordis'
import { ConversationJournal, digest, isManagedConversation, type Reservation } from './journal.js'
import { loadHostModelSelection } from './model-selection.js'

export { isManagedConversation } from './journal.js'
export { saveRecentConversationHost } from './preferences.js'

export interface ConversationModel {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export interface NewConversationRequest {
  readonly workspaceId: string
  readonly creationRequestId: string
  readonly requestId: string
  readonly model: ConversationModel
  readonly text: string
  readonly agentPreset?: string
  readonly clientTimeZone?: string
}

export class NewConversationError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'NewConversationError'
    this.status = status
    this.code = code
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validString(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit && value.trim().length > 0
}

function hasOnly(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every(key => fields.includes(key))
}

/** Parse the complete text-only request before invoking any Host operations. */
export function parseNewConversationRequest(input: unknown): NewConversationRequest {
  const fail = (): never => {
    throw new NewConversationError(400, 'bad-request', 'Invalid new conversation request')
  }
  if (!record(input) || !hasOnly(input, ['workspaceId', 'creationRequestId', 'requestId', 'model', 'text', 'agentPreset', 'clientTimeZone'])) return fail()
  const { workspaceId, creationRequestId, requestId, model, text, agentPreset, clientTimeZone } = input
  if (!validString(workspaceId, 256) || !validString(creationRequestId, 128) || !validString(requestId, 128)
    || !validString(text, 256 * 1024) || Buffer.byteLength(text, 'utf8') > 256 * 1024
    || (agentPreset !== undefined && !validString(agentPreset, 256))
    || (clientTimeZone !== undefined && !validString(clientTimeZone, 128))
    || !record(model) || !hasOnly(model, ['provider', 'model', 'reasoningEffort'])
    || !validString(model.provider, 256) || !validString(model.model, 256)
    || (model.reasoningEffort !== undefined && !validString(model.reasoningEffort, 256))) return fail()
  if (clientTimeZone !== undefined) {
    try {
      if (clientTimeZone !== 'UTC' && !clientTimeZone.includes('/')) return fail()
      new Intl.DateTimeFormat('en', { timeZone: clientTimeZone })
    } catch { return fail() }
  }
  return {
    workspaceId, creationRequestId, requestId, text,
    model: { provider: model.provider, model: model.model, ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }) },
    ...(agentPreset === undefined ? {} : { agentPreset }),
    ...(clientTimeZone === undefined ? {} : { clientTimeZone }),
  }
}

interface Workspace {
  readonly path: string
  readonly sessionIds: readonly string[]
  attachSession(id: string): Promise<void>
}

interface SessionHeader {
  readonly id: string
  readonly cwd?: string
  readonly origin?: string
  readonly isSeeded?: boolean
  readonly agentPreset?: string
}

interface Agent {
  readonly id: string
  readonly session: { readonly header: SessionHeader }
  readonly model: { current(): ConversationModel | undefined; select(model: ConversationModel): void }
}

type Setup = (ctx: Context, agent: Agent) => Promise<void>

type HostServices = {
  workspaceRegistry: { get(id: string): Workspace | undefined; readonly archivedSessionIds: readonly string[] }
  agents: {
    get(id: string): Agent | undefined
    create(options: { sessionId: string; meta: { cwd: string; agentPreset?: string }; agentOptions: ConversationModel; setup: Setup }): Promise<{ agent: Agent }>
    resume(options: { resumeSessionId: string; agentOptions: ConversationModel; setup: Setup }): Promise<{ agent: Agent }>
  }
  sessionPersistence: { stat(id: string): Promise<{ header: SessionHeader } | undefined> }
  sessions: { flush(session: Agent['session']): Promise<boolean> }
  sessionQuery: {
    observeSession(id: string, options: { projectionMode: 'none' }): Promise<{
      readonly events: readonly { type: string; data: unknown }[]
      [Symbol.dispose](): void
    }>
  }
  sessionController: {
    prompt(request: { sessionId: string; requestId: string; mode: 'queue'; content: [{ type: 'text'; text: string }]; clientTimeZone?: string }, signal: AbortSignal): Promise<{ accepted: true }>
  }
  llm: {
    listModels(provider: string): Promise<readonly { id: string }[]>
    resolveCallConfig(selection: ConversationModel): Promise<unknown>
  }
  agentPresets: { resolve(id?: string): Promise<{ id: string }>; mount(ctx: Context, id: string): Promise<unknown> }
}

export type ShareState = 'initial' | 'recovering' | 'confirmed'

export interface NewConversationOptions {
  /** Revalidate access to the selected Workspace using the request's authenticated origin. */
  readonly authorize?: () => void | Promise<void>
  /** Persist the link to the Session, or validate a preceding share without reopening a revoked one. */
  readonly confirmShare?: (sessionId: string, state: ShareState) => void | Promise<void>
}

export interface NewConversationHostOptions {
  /** Resolve public DSH services from the plugin scope. */
  readonly get: (name: string) => unknown
  readonly journalDirectory: string
  readonly installModelSelection?: (ctx: Context) => void
}

function sameModel(left: ConversationModel | undefined, right: ConversationModel): boolean {
  return left?.provider === right.provider && left.model === right.model && left.reasoningEffort === right.reasoningEffort
}

function isModel(value: unknown): value is ConversationModel {
  return record(value) && typeof value.provider === 'string' && typeof value.model === 'string'
    && (value.reasoningEffort === undefined || typeof value.reasoningEffort === 'string')
}

function isPromptSource(value: unknown, requestId: string): boolean {
  return record(value) && value.kind === 'user' && value.rpcId === requestId
}

/** Own new-conversation submission until DSH has durably accepted its first prompt. */
export class NewConversationHost {
  private readonly submissions = new Map<string, Promise<void>>()

  private readonly services: NewConversationHostOptions

  constructor(services: NewConversationHostOptions) {
    this.services = services
  }

  isManaged(sessionId: unknown): boolean {
    return isManagedConversation(sessionId)
  }

  /** `scope` is supplied by the authenticated server call site, independently of the wire request. */
  async submit(scope: string, input: NewConversationRequest, options: NewConversationOptions = {}): Promise<{ sessionId: string }> {
    const request = parseNewConversationRequest(input)
    if (scope.length === 0) throw new NewConversationError(403, 'forbidden', 'New conversation caller is unavailable')
    const key = digest([scope, request.creationRequestId])
    const prior = this.submissions.get(key) ?? Promise.resolve()
    const operation = prior.then(() => this.process(key, request, options))
    const settled = operation.then(() => undefined, () => undefined)
    this.submissions.set(key, settled)
    try {
      return await operation
    } finally {
      if (this.submissions.get(key) === settled) this.submissions.delete(key)
    }
  }

  private async process(key: string, request: NewConversationRequest, options: NewConversationOptions): Promise<{ sessionId: string }> {
    await options.authorize?.()
    const workspace = this.workspace(request.workspaceId)
    const journal = new ConversationJournal(this.services.journalDirectory, key)
    const fingerprint = digest([request.workspaceId, request.requestId, request.model.provider, request.model.model,
      request.model.reasoningEffort, request.text, request.agentPreset, request.clientTimeZone])
    let reservation = await journal.reservation()
    let validatedModel = false
    if (reservation === undefined) {
      await this.validateModel(request.model)
      validatedModel = true
      const presets = this.presets()
      if (presets === undefined && request.agentPreset !== undefined) {
        throw new NewConversationError(409, 'preset-unavailable', 'The selected Host has no Agent preset registry')
      }
      const preset = await presets?.resolve(request.agentPreset)
      reservation = await journal.reserve(fingerprint, preset?.id)
    }
    if (reservation.fingerprint !== fingerprint) {
      throw new NewConversationError(409, 'creation-conflict', 'The creation request ID already belongs to different input')
    }
    const { sessionId } = reservation
    const persistent = this.service('sessionPersistence', ['stat'])
    const saved = await persistent.stat(sessionId)
    if (await journal.has('prompt')) {
      if (saved === undefined || !workspace.sessionIds.includes(sessionId)) {
        throw new NewConversationError(409, 'session-unavailable', 'The accepted session is unavailable in this workspace')
      }
      this.validateSession(saved.header, workspace, reservation)
    } else {
      await this.admit(workspace, request, reservation, validatedModel, options.authorize, saved?.header)
      await journal.mark('prompt')
    }
    await options.authorize?.()
    if (options.confirmShare !== undefined) {
      const shareState = await journal.has('shared') ? 'confirmed'
        : await journal.mark('sharing') ? 'initial' : 'recovering'
      await options.confirmShare(sessionId, shareState)
      if (shareState !== 'confirmed') await journal.mark('shared')
    }
    return { sessionId }
  }

  private async admit(
    workspace: Workspace, request: NewConversationRequest, reservation: Reservation,
    validatedModel: boolean, authorize: NewConversationOptions['authorize'], stored?: SessionHeader,
  ): Promise<void> {
    const { sessionId, agentPreset } = reservation
    const agents = this.service('agents', ['get', 'create', 'resume'])
    const sessions = this.service('sessions', ['flush'])
    const controller = this.service('sessionController', ['prompt'])
    let agent = agents.get(sessionId)
    let facts = { selected: false, accepted: false, started: false }
    const existing = agent?.session.header ?? stored
    if (existing !== undefined) {
      this.validateSession(existing, workspace, reservation)
      facts = await this.observed(sessionId, request)
    }
    if (facts.started && !facts.accepted) {
      throw new NewConversationError(409, 'session-in-use', 'The reserved session has already started another turn')
    }
    if (!facts.accepted && !validatedModel) await this.validateModel(request.model)
    const { model } = request
    if (agent === undefined) {
      const install = this.services.installModelSelection ?? await loadHostModelSelection(agents).catch(cause => {
        throw new NewConversationError(503, 'host-unavailable', 'New conversations require the DSH model-selection setup', { cause })
      })
      const setup: Setup = async (agentCtx, unpublished) => {
        if (typeof unpublished.model?.select !== 'function' || typeof unpublished.model.current !== 'function') {
          throw new NewConversationError(503, 'host-unavailable', 'New conversations require Session-local model selection')
        }
        install(agentCtx)
        if (agentPreset !== undefined) {
          const presets = this.presets()
          if (presets === undefined) throw new NewConversationError(409, 'preset-unavailable', 'The reserved Agent preset is unavailable')
          await presets.mount(agentCtx, agentPreset)
        }
        if (!facts.selected) {
          unpublished.model.select(model)
          await this.flush(sessions, unpublished)
        }
      }
      const created = stored === undefined
        ? await agents.create({
          sessionId,
          meta: { cwd: workspace.path, ...(agentPreset === undefined ? {} : { agentPreset }) },
          agentOptions: model,
          setup,
        })
        : await agents.resume({ resumeSessionId: sessionId, agentOptions: model, setup })
      agent = created.agent
    }
    this.validateSession(agent.session.header, workspace, reservation)
    if (!workspace.sessionIds.includes(sessionId)) await workspace.attachSession(sessionId)
    if (!facts.accepted) {
      await authorize?.()
      if (!sameModel(agent.model.current(), model)) {
        throw new NewConversationError(409, 'model-conflict', 'The reserved session model changed before prompt submission')
      }
      const accepted = await controller.prompt({
        sessionId, requestId: request.requestId, mode: 'queue', content: [{ type: 'text', text: request.text }],
        ...(request.clientTimeZone === undefined ? {} : { clientTimeZone: request.clientTimeZone }),
      }, new AbortController().signal)
      if (accepted.accepted !== true) throw new NewConversationError(502, 'prompt-unconfirmed', 'The Host did not confirm prompt acceptance')
    }
    await this.flush(sessions, agent)
  }

  private async observed(sessionId: string, request: NewConversationRequest) {
    const query = this.service('sessionQuery', ['observeSession'])
    const observation = await query.observeSession(sessionId, { projectionMode: 'none' })
    try {
      let selected = false
      let accepted = false
      let started = false
      for (const { type, data } of observation.events) {
        if (type === 'model/selection' && isModel(data) && sameModel(data, request.model)) selected = true
        if (type === 'turn/start') started = true
        if (!record(data)) continue
        if (type === 'user/message' && isPromptSource(data.source, request.requestId)) accepted = true
        if (type === 'agent/inbox/spliced' && Array.isArray(data.inserted)
          && data.inserted.some(message => record(message) && isPromptSource(message.source, request.requestId))) accepted = true
      }
      return { selected, accepted, started }
    } finally {
      observation[Symbol.dispose]()
    }
  }

  private validateSession(header: SessionHeader, workspace: Workspace, reservation: Reservation): void {
    if (header.id !== reservation.sessionId || header.cwd !== workspace.path || header.agentPreset !== reservation.agentPreset
      || header.origin !== undefined || header.isSeeded === true) {
      throw new NewConversationError(409, 'session-conflict', 'The reserved session does not match the workspace and preset')
    }
    if (this.service('workspaceRegistry', ['get']).archivedSessionIds.includes(header.id)) {
      throw new NewConversationError(409, 'session-unavailable', 'The reserved session has been archived')
    }
  }

  private workspace(workspaceId: string): Workspace {
    const workspace = this.service('workspaceRegistry', ['get']).get(workspaceId)
    if (workspace === undefined) throw new NewConversationError(404, 'workspace-not-found', 'The selected workspace does not exist')
    return workspace
  }

  private async validateModel(model: ConversationModel): Promise<void> {
    const llm = this.service('llm', ['listModels', 'resolveCallConfig'])
    try {
      if (!(await llm.listModels(model.provider)).some(candidate => candidate.id === model.model)) {
        throw new Error('Model is absent from the provider catalog')
      }
      await llm.resolveCallConfig(model)
    } catch (cause) {
      throw new NewConversationError(409, 'model-unavailable', 'The selected model or reasoning effort is unavailable on this Host', { cause })
    }
  }

  private async flush(sessions: HostServices['sessions'], agent: Agent): Promise<void> {
    if (!await sessions.flush(agent.session)) {
      throw new NewConversationError(503, 'persistence-unavailable', 'The Host did not confirm session persistence')
    }
  }

  private presets(): HostServices['agentPresets'] | undefined {
    if (this.services.get('agentPresets') === undefined) return undefined
    return this.service('agentPresets', ['resolve', 'mount'])
  }

  private service<Name extends keyof HostServices>(name: Name, methods: readonly (keyof HostServices[Name])[]): HostServices[Name] {
    const service = this.services.get(name)
    if (!record(service) || methods.some(method => typeof service[String(method)] !== 'function')) {
      throw new NewConversationError(503, 'host-unavailable', `New conversations require the Host ${name} service`)
    }
    return service as HostServices[Name]
  }
}
