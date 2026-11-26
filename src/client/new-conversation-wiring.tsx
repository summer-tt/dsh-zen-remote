import { createElement, type ComponentType } from 'react'
import { mainSessionIdOf, type ClientContext, type SessionId } from './compat/types.ts'
import { fromVirtual } from '../virtual-id.js'
import { DraftTarget, draftKey, hostSelectable, type HostDirectorySnapshot, type HostId, type Source } from './new-conversation/target.ts'
import { browserDraftStorage, createDraftStore } from './new-conversation/draft-store.ts'
import { NativeDraftComposer, NativeDraftTarget, NewConversationPanel, type ModelSelection, type NewConversationView, type SubmitInput } from './new-conversation/NewConversationPanel.tsx'
import { NewConversationTrigger } from './new-conversation/NewConversationTrigger.tsx'
import { NEW_CONVERSATION_PANEL_ID, registerNewConversation, type NativeDraftNavigation } from './new-conversation/register.ts'

const CREATE = '/_dsh/zen-remote/new-conversation'
const HOSTS = '/_dsh/zen-remote/client/session-hosts'
const HOST = '/_dsh/zen-remote/client/session-host'

interface HostRow { hostId: string; displayName: string; state: string; supportsCreateDraft?: true }
interface Favorite { provider: string; model: string }
interface Preset { id: string; name?: string; isDefault?: boolean; broken?: string }
const modeNames: Record<string, readonly [string, string]> = {
  standard: ['标准模式', 'Standard mode'], ptc: ['PTC 模式', 'PTC mode'],
  minimal: ['极简模式', 'Minimal mode'], cordis: ['创造模式', 'Creator mode'],
}
interface Catalog { default: ModelSelection | null; groups: readonly { id: string; name: string; models: readonly { id: string; name?: string }[] }[]; routableProviders?: readonly string[] }
interface PickerProps {
  hostId: string; catalog: Catalog | null; selection: ModelSelection | null
  onSelect(model: ModelSelection): void; openerRef: { current: (() => void) | null }
  favorites?: readonly Favorite[]; setFavorite?(favorite: Favorite & { favorite: boolean }): Promise<void>
  catalogError?: string; favoritesError?: string; onReload?(): void; onReloadFavorites?(): void; disabled?: boolean
}

function source<T>(initial: T): Source<T> & { set(value: T): void } {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(value) { current = value; for (const listener of listeners) listener() },
  }
}

class HostRequestError extends Error {}

const rejectedBeforeCreation = new Set([
  'bad-request', 'body-too-large', 'origin-rejected', 'remote-mismatch', 'remote-unsupported',
  'references-require-session', 'workspace-not-found', 'model-unavailable',
])

async function call<T>(url: string, input?: unknown): Promise<T> {
  const response = await fetch(url, input === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await response.json() as { ok: true; value: T } | { ok: false; error: { code: string } }
  if (!data.ok) throw new HostRequestError(data.error.code)
  return data.value
}

function copy(zh: boolean): NewConversationView['copy'] {
  return zh ? {
    title: '新会话', hostLabel: 'Host', workspaceLabel: '工作区', localHost: '本机', chooseWorkspace: '选择工作区', noWorkspaces: '这个 Host 没有可用工作区', loadingHosts: '正在加载 Host', directoryFailed: '无法读取 Host 列表', retry: '重试', offlineHost: '离线', unpairedNotice: '上次使用的 Host 已解除配对，已预选本机。', modelUnset: '选择模型', openModelPicker: '打开模型面板', retrySubmission: '重试上一次提交', resumeHint: '重试会继续提交上次发送的文字和模型。', placeholder: '输入你的问题', submit: '发送', submitting: '正在发送', pickWorkspaceFirst: '请先选择工作区', pickHostFirst: '请先选择 Host', writeFirstMessage: '请输入问题', pickModelFirst: '请先选择模型', hostOffline: '所选 Host 当前不可用', ariaHostPicker: '选择 Host', ariaWorkspacePicker: '选择工作区', ariaOpenModelPicker: '选择模型',
  } : {
    title: 'New conversation', hostLabel: 'Host', workspaceLabel: 'Workspace', localHost: 'Local', chooseWorkspace: 'Choose a workspace', noWorkspaces: 'No workspaces on this Host', loadingHosts: 'Loading Hosts', directoryFailed: 'Could not load Hosts', retry: 'Retry', offlineHost: 'Offline', unpairedNotice: 'The previous Host was unpaired. Local is selected.', modelUnset: 'Select a model', openModelPicker: 'Open model picker', retrySubmission: 'Retry previous submission', resumeHint: 'Retry uses the text and model from the previous submission.', placeholder: 'Enter your question', submit: 'Send', submitting: 'Sending', pickWorkspaceFirst: 'Choose a workspace first', pickHostFirst: 'Choose a Host first', writeFirstMessage: 'Enter your question first', pickModelFirst: 'Choose a model first', hostOffline: 'The selected Host is unavailable', ariaHostPicker: 'Choose Host', ariaWorkspacePicker: 'Choose workspace', ariaOpenModelPicker: 'Choose model',
  }
}

function hostWorkspace(id: string) {
  const remote = fromVirtual(id)
  return remote === undefined ? { hostId: 'local', workspaceId: id }
    : { hostId: remote.serverId, workspaceId: remote.id.replace(/^#\d+~/u, '') }
}

function matches(catalog: Catalog | null, selection: ModelSelection): boolean {
  return catalog?.groups.some(group => group.id === selection.provider && group.models.some(model => model.id === selection.model)) === true
}

export function mountNewConversation(ctx: ClientContext): ((workspaceId?: string) => boolean) | undefined {
  const availableStorage = browserDraftStorage()
  if (availableStorage === undefined) return
  const storage = availableStorage
  const drafts = createDraftStore(storage)
  let creationForbidden = false
  async function preference(): Promise<{ lastHost: string }> {
    try {
      return await call<{ lastHost: string }>(CREATE)
    } catch (error) {
      if (error instanceof HostRequestError && error.message === 'forbidden') {
        creationForbidden = true
        if (isOpen() && draftNavigation !== undefined) {
          active.set(false)
          workspace?.startSession?.()
        }
      }
      throw error
    }
  }
  const target = new DraftTarget({ readLastHost: async () => (await preference()).lastHost, saveLastHost: async () => {} })
  const directory = source<HostDirectorySnapshot>({ phase: 'pending' })
  const stopDirectory = target.registerHostDirectory(directory)
  const label = source('New conversation')
  const pendingKey = (hostId: string, workspaceId: string | undefined) => `dsh.zen.newConversation.submit.${draftKey(hostId, workspaceId)}`
  const enabled = source(false)
  const active = source(false)
  const workspace = ctx.get('uiWorkspace') as (Partial<NativeDraftNavigation> & {
    openSession(id: SessionId): void
    startSession(): void
  }) | undefined
  const navigation = typeof workspace?.registerNewSessionDraft === 'function' && typeof workspace.openSessionDraft === 'function'
    ? workspace as NativeDraftNavigation : undefined
  let draftNavigation: AbortSignal | undefined
  let returnSessionId: SessionId | undefined
  const mainSession = () => mainSessionIdOf(ctx.sessions.list.getSnapshot().byId)
  const isOpen = () => navigation === undefined
    ? ctx.layout.panelInfo.getSnapshot().activePanelId === NEW_CONVERSATION_PANEL_ID
    : draftNavigation?.aborted === false
  const openerRef: PickerProps['openerRef'] = { current: null }
  let nativePicker: HTMLSelectElement | null = null
  let view: ReturnType<typeof source<NewConversationView>>
  let hosts: HostRow[] = []
  let generation = -1
  let rosterRequest = 0
  let catalogRequest = 0
  let favoritesRequest = 0
  let catalog: Catalog | null = null
  let presetRequest = 0
  let presetRows: readonly Preset[] = []
  let chosenPreset: string | undefined
  let presetHost: string | undefined
  let favorites: Favorite[] = []
  let selection: ModelSelection | null = null
  let catalogError: string | undefined
  let favoritesError: string | undefined
  let picker: ComponentType<PickerProps> | undefined
  let disposed = false
  const textRevision = new Map<string, number>()
  const strings = () => copy(document.documentElement.lang.toLowerCase().startsWith('zh'))
  const model = () => selection ?? (catalog?.default != null && matches(catalog, catalog.default) ? catalog.default : null)

  const snap = (): NewConversationView => {
    const state = target.state.getSnapshot()
    const words = strings()
    const workspaces = ctx.workspaces.list.getSnapshot().items.flatMap(row => {
      const ws = hostWorkspace(row.workspaceId)
      const hostName = hosts.find(host => host.hostId === ws.hostId)?.displayName
      const prefix = hostName === undefined ? undefined : `${hostName} · `
      const label = prefix !== undefined && row.title.startsWith(prefix) ? row.title.slice(prefix.length) : row.title
      return ws.hostId === state.hostId ? [{ workspaceId: ws.workspaceId, displayId: row.workspaceId, label }] : []
    })
    const pickerNode = picker === undefined ? createElement('select', {
      'aria-label': words.ariaOpenModelPicker,
      ref: (node: HTMLSelectElement | null) => { nativePicker = node },
      value: model() === null ? '' : JSON.stringify([model()?.provider, model()?.model]),
      disabled: catalog === null,
      onChange: (event: { currentTarget: { value: string } }) => {
        const [provider, name] = JSON.parse(event.currentTarget.value) as [string, string]
        selection = { provider, model: name }
        publish()
      },
    }, createElement('option', { value: '', disabled: true }, catalogError ?? words.modelUnset),
    ...((catalog?.groups ?? []).map(group => createElement('optgroup', { key: group.id, label: group.name },
      ...group.models.map(row => createElement('option', { key: row.id, value: JSON.stringify([group.id, row.id]) }, row.name ?? row.id))))))
      : createElement(picker, {
        key: state.hostId, hostId: state.hostId, catalog, selection: model(), openerRef,
        onSelect: next => { if (target.state.getSnapshot().catalogGeneration === state.catalogGeneration && matches(catalog, next)) { selection = next; publish() } },
        ...(state.hostId === 'local' ? {} : { favorites, setFavorite: (change: Favorite & { favorite: boolean }) => updateFavorite(state.hostId, state.catalogGeneration, change) }),
        ...(catalogError === undefined ? {} : { catalogError }), ...(favoritesError === undefined ? {} : { favoritesError }),
        onReload: () => { void loadCatalog() }, onReloadFavorites: () => { void loadFavorites() },
      })
    const roster = directory.getSnapshot()
    const host = hosts.find(row => row.hostId === state.hostId)
    const incompatible = host?.state === 'incompatible' || (host?.state === 'online' && host.supportsCreateDraft !== true)
    const zh = words.title === '新会话'
    const hostOffline = host?.state === 'connecting'
      ? (zh ? '正在连接所选 Host' : 'Connecting to the selected Host')
      : incompatible ? (zh ? '此 Host 的版本不支持新会话' : 'This Host version does not support new conversations')
        : words.hostOffline
    const presetPrefix = state.hostId === 'local' || host === undefined ? undefined : `[${host.displayName}] `
    const presets = presetRows.map(row => {
      const label = row.name ?? modeNames[row.id]?.[zh ? 0 : 1] ?? row.id
      return { id: row.id, label: presetPrefix !== undefined && label.startsWith(presetPrefix) ? label.slice(presetPrefix.length) : label }
    })
    return { target: state, directory: roster, directoryError: roster.phase === 'error' ? roster.message : undefined,
      workspaces, presets, agentPreset: chosenPreset ?? presetRows.find(row => row.isDefault)?.id,
      text: drafts.read(state.hostId, state.workspaceId), selection: model(), modelPicker: pickerNode,
      copy: { ...words, hostOffline },
      mainSessionId: mainSession(), returnSessionId,
      pendingSubmission: storage.getItem(pendingKey(state.hostId, state.workspaceId)) !== null }
  }
  const publish = () => { if (!disposed) { const current = snap(); view.set(current); label.set(current.copy.title) } }

  async function reloadHosts() {
    const request = ++rosterRequest
    try {
      let rows: HostRow[]
      const response = await fetch(HOSTS)
      if (response.status === 404) rows = []
      else {
        const result = await response.json() as { ok: boolean; value?: HostRow[] }
        if (!result.ok || !Array.isArray(result.value)) throw new Error(strings().directoryFailed)
        rows = result.value
      }
      if (disposed || request !== rosterRequest) return
      const selectedHost = target.state.getSnapshot().hostId
      const wasOnline = hosts.some(row => row.hostId === selectedHost && row.state === 'online')
      hosts = rows
      directory.set({ phase: 'ready', hosts: rows.filter(row => row.hostId !== 'local').map(row => ({
        hostId: row.hostId, label: row.displayName,
        status: row.state === 'revoked' || row.state === 'unpaired' ? 'unpaired' : row.state === 'online' && row.supportsCreateDraft === true ? 'paired' : 'offline',
      })) })
      if (!wasOnline && rows.some(row => row.hostId === selectedHost && row.state === 'online')) {
        if (selectedHost === target.state.getSnapshot().hostId) {
          void loadCatalog()
          void loadFavorites()
          void loadPresets()
        }
      }
    } catch {
      if (!disposed && request === rosterRequest) directory.set({ phase: 'error', message: strings().directoryFailed })
    }
    publish()
  }

  async function loadCatalog() {
    const request = ++catalogRequest
    const { hostId } = target.state.getSnapshot()
    try {
      const remote = ctx.get('remote') as { session?: { modelCatalog(): Promise<{ ok: boolean; value: Catalog }> } } | undefined
      const result = hostId === 'local' ? await remote?.session?.modelCatalog() : { ok: true, value: await call<Catalog>(HOST, { operation: 'modelCatalog', hostId }) }
      if (!result?.ok) throw new Error('model-catalog-unavailable')
      if (disposed || request !== catalogRequest) return
      catalog = hostId !== 'local' ? result.value : { ...result.value, groups: result.value.groups.filter(group => fromVirtual(group.id) === undefined) }
      if (selection !== null && !matches(catalog, selection)) selection = null
      catalogError = undefined
    } catch (error) {
      if (disposed || request !== catalogRequest) return
      catalog = null
      catalogError = error instanceof Error ? error.message : 'model-catalog-unavailable'
    }
    publish()
  }

  async function loadPresets() {
    const request = ++presetRequest
    const { hostId } = target.state.getSnapshot()
    try {
      const remote = ctx.get('remote') as { agentPresets?: { list(): Promise<{ ok: boolean; value?: { presets: Preset[] } }> } } | undefined
      const result = await remote?.agentPresets?.list()
      if (disposed || request !== presetRequest) return
      if (!result?.ok || result.value === undefined) return
      presetRows = result.value.presets.flatMap(row => {
        const origin = fromVirtual(row.id)
        if (row.broken || (origin?.serverId ?? 'local') !== hostId) return []
        return [{ ...row, id: origin?.id ?? row.id }]
      })
      if (!presetRows.some(row => row.id === chosenPreset)) chosenPreset = undefined
      publish()
    } catch { /* The target Host can still choose its default preset. */ }
  }

  async function loadFavorites() {
    const request = ++favoritesRequest
    const { hostId } = target.state.getSnapshot()
    if (hostId === 'local' || picker === undefined) return
    try {
      const result = await call<{ favorites: Favorite[] }>(HOST, { operation: 'getFavorites', hostId })
      if (disposed || request !== favoritesRequest) return
      favorites = result.favorites
      favoritesError = undefined
    } catch (error) {
      if (disposed || request !== favoritesRequest) return
      favoritesError = error instanceof Error ? error.message : 'favorites-unavailable'
    }
    publish()
  }

  async function updateFavorite(hostId: string, activeGeneration: number, change: Favorite & { favorite: boolean }) {
    if (target.state.getSnapshot().catalogGeneration !== activeGeneration) return
    await call<{ favorites: Favorite[] }>(HOST, { operation: 'setFavorite', hostId, ...change })
    if (target.state.getSnapshot().catalogGeneration === activeGeneration) await loadFavorites()
  }

  function targetChanged() {
    const state = target.state.getSnapshot()
    if (state.hostId !== presetHost) {
      presetHost = state.hostId
      presetRows = []
      chosenPreset = undefined
      void loadPresets()
    }
    if (state.catalogGeneration !== generation) {
      generation = state.catalogGeneration
      catalog = null; selection = null; favorites = []; catalogError = undefined; favoritesError = undefined
      void loadCatalog(); void loadFavorites()
    }
    publish()
  }

  async function submit(input: SubmitInput) {
    const current = target.state.getSnapshot()
    const submittedFrom = draftNavigation
    const hostId = input.hostId ?? current.hostId
    const workspaceId = input.workspaceId ?? current.workspaceId
    if (workspaceId === undefined) return { ok: false as const, message: strings().pickWorkspaceFirst }
    const staged = input.selection ?? model()
    if (hostId !== 'local' && !hosts.some(row => row.hostId === hostId && row.state === 'online' && row.supportsCreateDraft === true)) {
      return { ok: false as const, message: strings().hostOffline }
    }
    const key = draftKey(hostId, workspaceId)
    const revision = textRevision.get(key) ?? 0
    const storageKey = pendingKey(hostId, workspaceId)
    const data = {
      workspaceId, text: input.text ?? drafts.read(hostId, workspaceId), model: staged,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(chosenPreset === undefined ? {} : { agentPreset: chosenPreset }),
    }
    try {
      type StoredSubmission = typeof data & { creationRequestId: string; requestId: string }
      const existing = JSON.parse(storage.getItem(storageKey) ?? 'null') as StoredSubmission | null
      if (input.resume && existing === null) return { ok: false as const, message: strings().writeFirstMessage }
      if (existing === null && (staged === null || !matches(catalog, staged))) {
        return { ok: false as const, message: strings().pickModelFirst }
      }
      const frozen = existing ?? { ...data, creationRequestId: crypto.randomUUID(), requestId: crypto.randomUUID() }
      const stored = JSON.stringify(frozen)
      storage.setItem(storageKey, stored)
      const result = await call<{ sessionId: SessionId; preferenceSaved: boolean }>(CREATE, { hostId: hostId, request: frozen })
      if ((textRevision.get(key) ?? 0) === revision && drafts.read(hostId, workspaceId) === frozen.text) {
        drafts.clear(hostId, workspaceId)
      }
      if (storage.getItem(storageKey) === stored) storage.removeItem(storageKey)
      if (!disposed && input.generation === target.state.getSnapshot().generation && submittedFrom === draftNavigation && isOpen()) {
        workspace?.openSession(result.sessionId)
      }
      publish()
      return { ok: true as const }
    } catch (error) {
      if (!input.resume && error instanceof HostRequestError && rejectedBeforeCreation.has(error.message)) storage.removeItem(storageKey)
      publish()
      return { ok: false as const, message: error instanceof Error ? error.message : 'create-failed' }
    }
  }

  function open(workspaceId?: string, hostId?: HostId): boolean {
    if (creationForbidden || (navigation === undefined && !enabled.getSnapshot())) return false
    returnSessionId = hostId === undefined ? undefined : mainSession()
    if (hostId !== undefined) {
      if (!hostSelectable(directory.getSnapshot(), hostId)) return false
      target.selectHost(hostId)
      if (target.state.getSnapshot().hostId !== hostId) return false
    } else if (workspaceId === undefined) target.resetToPreferredHost()
    else {
      const item = hostWorkspace(workspaceId)
      if (item.hostId !== 'local' && !hosts.some(host => host.hostId === item.hostId && host.supportsCreateDraft === true)) return false
      target.selectHost(item.hostId)
      if (target.state.getSnapshot().hostId !== item.hostId) return false
      target.selectWorkspace(item.workspaceId)
    }
    if (navigation === undefined) ctx.layout.selectPanel(NEW_CONVERSATION_PANEL_ID)
    else {
      const signal = navigation.openSessionDraft()
      draftNavigation = signal
      signal.addEventListener('abort', () => active.set(false), { once: true })
      active.set(true)
      publish()
      void reloadHosts(); void loadCatalog(); void loadFavorites(); void loadPresets()
    }
    return true
  }

  view = source(snap())
  registerNewConversation(ctx, NewConversationPanel, NewConversationTrigger, {
    view, label, enabled, onBeforeOpen: () => target.resetToPreferredHost(),
    ...(navigation === undefined ? {} : { native: { navigation, active, open, target: NativeDraftTarget, composer: NativeDraftComposer } }),
    actions: {
    onSelectHost: hostId => target.selectHost(hostId),
    onOpenHostDraft: hostId => { open(undefined, hostId) },
    onReturnToSession: () => {
      const id = returnSessionId
      returnSessionId = undefined
      if (id !== undefined && isOpen()) workspace?.openSession(id)
    },
    onSelectWorkspace: id => {
      const current = target.state.getSnapshot()
      if (current.workspaceId === undefined) drafts.adoptHostDraft(current.hostId, id)
      target.selectWorkspace(id)
    },
    onSelectPreset: id => {
      if (!presetRows.some(row => row.id === id)) return
      chosenPreset = id
      publish()
    },
    onTextChange: text => {
      const current = target.state.getSnapshot()
      const key = draftKey(current.hostId, current.workspaceId)
      textRevision.set(key, (textRevision.get(key) ?? 0) + 1)
      drafts.write(current.hostId, current.workspaceId, text)
      publish()
    },
    onRetryDirectory: () => { void reloadHosts(); void loadCatalog(); void loadFavorites() },
    onOpenModelPicker: () => {
      if (openerRef.current !== null) openerRef.current()
      else if (nativePicker !== null) {
        nativePicker.focus()
        try { nativePicker.showPicker?.() } catch { /* Focus supports browsers without a picker API. */ }
      }
    },
    onSubmit: submit,
  } })
  ctx.inject(['contextMenus'], scope => {
    const menus = scope.get('contextMenus') as { register(contribution: {
      id: string; target: 'workspace'; order: number;
      resolve(item: { workspaceId: string }): readonly { id: string; label: string; run(): void }[]
    }): () => void }
    scope.effect(() => menus.register({
      id: 'zen-remote.new-conversation', target: 'workspace', order: 70,
      resolve: item => {
        const selected = hostWorkspace(item.workspaceId)
        if (!enabled.getSnapshot() || (selected.hostId !== 'local' && !hosts.some(host => host.hostId === selected.hostId && host.supportsCreateDraft === true))) return []
        return [{ id: 'new', label: strings().title, run() { open(item.workspaceId) } }]
      },
    }))
  })
  ctx.inject(['t3ModelPicker'], scope => {
    scope.effect(() => {
      picker = (scope.get('t3ModelPicker') as { DraftPicker: ComponentType<PickerProps> }).DraftPicker
      publish(); void loadFavorites()
      return () => { picker = undefined; publish() }
    })
  })
  ctx.effect(() => {
    const stopTarget = target.state.subscribe(targetChanged)
    const stopSessions = ctx.sessions.list.subscribe(publish)
    const stopWorkspaces = ctx.workspaces.list.subscribe(publish)
    const stopPanel = ctx.layout.panelInfo.subscribe(() => {
      if (navigation !== undefined || !isOpen()) return
      void reloadHosts(); void loadCatalog(); void loadFavorites(); void loadPresets()
    })
    const interval = window.setInterval(() => {
      if (isOpen() || (mainSession() !== undefined && directory.getSnapshot().phase === 'error')) void reloadHosts()
    }, 5000)
    void preference().then(() => { if (!disposed) enabled.set(true) }, () => {})
    void reloadHosts()
    return () => { disposed = true; window.clearInterval(interval); stopTarget(); stopSessions(); stopWorkspaces(); stopPanel(); stopDirectory(); target.dispose() }
  })
  return open
}
