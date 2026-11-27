import { createElement, type ComponentType } from 'react'
import { mainSessionIdOf, type ClientContext, type SessionId } from './compat/types.ts'
import { fromVirtual } from '../virtual-id.js'
import { DraftTarget, draftKey, hostSelectable, type HostDirectorySnapshot, type HostId, type Source } from './new-conversation/target.ts'
import { browserDraftStorage, createDraftStore } from './new-conversation/draft-store.ts'
import { draftCompletionSessions } from './new-conversation/completion-sessions.ts'
import { bareSessionOnlyCommand, type DraftFileCandidate } from './new-conversation/completion.ts'
import { createDraftImageStore, createPendingImageStorage, encodeDraftImage, type DraftImageFailure, type DraftImageFile } from './new-conversation/draft-images.ts'
import { NativeDraftComposer, NativeDraftTarget, NewConversationPanel, type ModelSelection, type NewConversationView, type SubmitInput } from './new-conversation/NewConversationPanel.tsx'
import type { RemoteDirectoryListing, RemoteWorkspaceActions } from './new-conversation/RemoteWorkspaceDialog.tsx'
import type { WorkspaceHostOperation } from '../client-data/workspace-host.ts'
import type { DraftImagePart } from '../client-data/draft-images.ts'
import { NewConversationTrigger } from './new-conversation/NewConversationTrigger.tsx'
import { NEW_CONVERSATION_PANEL_ID, registerNewConversation, type NativeDraftNavigation } from './new-conversation/register.ts'

const CREATE = '/_dsh/zen-remote/new-conversation'
const HOSTS = '/_dsh/zen-remote/client/session-hosts'
const HOST = '/_dsh/zen-remote/client/session-host'

interface HostRow { hostId: string; displayName: string; state: string; supportsCreateDraft?: true; supportsCreateDraftImages?: true; supportsWorkspaceAdd?: true }
interface StoredSubmission {
  workspaceId: string
  text: string
  model: ModelSelection | null
  clientTimeZone: string
  agentPreset?: string
  creationRequestId: string
  requestId: string
  imageIds?: readonly string[]
}
interface Favorite { provider: string; model: string }
interface Preset { id: string; name?: string; description?: string; isDefault?: boolean; broken?: string }
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
  'references-require-session', 'workspace-not-found', 'model-unavailable', 'draft-images-unsupported',
])

async function call<T>(url: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, input === undefined ? undefined : {
    signal: signal ?? null, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await response.json() as { ok: true; value: T } | { ok: false; error: { code: string } }
  if (!data.ok) throw new HostRequestError(data.error.code)
  return data.value
}

function copy(zh: boolean): NewConversationView['copy'] {
  return zh ? {
    imageUnsupported: '仅支持 PNG、JPG、WebP 和 GIF 格式的图片',
    imageLimit: '一条消息最多添加 {count} 张图片，合计不超过 {mib} MiB',
    imageEmpty: '图片内容为空，未能添加',
    imagePreviewFailed: '无法生成图片预览',
    imagesUnavailable: '所选 Host 的 Zen Remote 版本不支持首条消息附图。请移除图片或升级该 Host。',
    ariaImages: '草稿图片', ariaRemoveImage: '移除图片 {name}',
    ariaImageScrollLeft: '向左滚动图片', ariaImageScrollRight: '向右滚动图片',
    ariaImagePreviewDialog: '原图预览', ariaImagePreviewClose: '关闭原图预览', ariaOpenOriginal: '查看原图',
    writeOrPasteFirst: '输入消息，使用 / 查看指令，使用 @ 引用',
    resumeImagesHint: '重试会继续提交上次发送的文字、图片和模型。',
    title: '新会话', hostLabel: 'Host', workspaceLabel: '工作区', localHost: '本机', chooseWorkspace: '选择工作区', noWorkspaces: '这个 Host 没有可用工作区', loadingHosts: '正在加载 Host', directoryFailed: '无法读取 Host 列表', retry: '重试', offlineHost: '离线', unpairedNotice: '上次使用的 Host 已解除配对，已预选本机。', modelUnset: '选择模型', openModelPicker: '打开模型面板', retrySubmission: '重试上一次提交', resumeHint: '重试会继续提交上次发送的文字和模型。', submit: '发送', submitting: '正在发送', pickWorkspaceFirst: '请先选择工作区', pickHostFirst: '请先选择 Host', writeFirstMessage: '请输入问题', pickModelFirst: '请先选择模型', hostOffline: '所选 Host 当前不可用', ariaHostPicker: '选择 Host', ariaWorkspacePicker: '选择工作区', ariaOpenModelPicker: '选择模型',
  } : {
    imageUnsupported: 'Only PNG, JPG, WebP, and GIF images are supported',
    imageLimit: 'Add up to {count} images and {mib} MiB total per message',
    imageEmpty: 'The image is empty and could not be added',
    imagePreviewFailed: 'Could not preview the image',
    imagesUnavailable: 'This Host’s version of Zen Remote cannot send images in the first message. Remove the images or update the Host.',
    ariaImages: 'Draft images', ariaRemoveImage: 'Remove image {name}',
    ariaImageScrollLeft: 'Scroll images left', ariaImageScrollRight: 'Scroll images right',
    ariaImagePreviewDialog: 'Original image preview', ariaImagePreviewClose: 'Close original image preview', ariaOpenOriginal: 'View original',
    writeOrPasteFirst: 'Write a message, use / for commands or @ for references',
    resumeImagesHint: 'Retry uses the text, images, and model from the previous submission.',
    title: 'New conversation', hostLabel: 'Host', workspaceLabel: 'Workspace', localHost: 'Local', chooseWorkspace: 'Choose a workspace', noWorkspaces: 'No workspaces on this Host', loadingHosts: 'Loading Hosts', directoryFailed: 'Could not load Hosts', retry: 'Retry', offlineHost: 'Offline', unpairedNotice: 'The previous Host was unpaired. Local is selected.', modelUnset: 'Select a model', openModelPicker: 'Open model picker', retrySubmission: 'Retry previous submission', resumeHint: 'Retry uses the text and model from the previous submission.', submit: 'Send', submitting: 'Sending', pickWorkspaceFirst: 'Choose a workspace first', pickHostFirst: 'Choose a Host first', writeFirstMessage: 'Enter your question first', pickModelFirst: 'Choose a model first', hostOffline: 'The selected Host is unavailable', ariaHostPicker: 'Choose Host', ariaWorkspacePicker: 'Choose workspace', ariaOpenModelPicker: 'Choose model',
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

function matchesFrozenImages(files: readonly DraftImageFile[] | undefined, ids: readonly string[]): files is readonly DraftImageFile[] {
  return files !== undefined && files.length === ids.length && files.every((image, index) => image.id === ids[index])
}

export function mountNewConversation(ctx: ClientContext): ((workspaceId?: string) => boolean) | undefined {
  const availableStorage = browserDraftStorage()
  if (availableStorage === undefined) return
  const storage = availableStorage
  const drafts = createDraftStore(storage)
  const draftImages = createDraftImageStore()
  const pendingImages = createPendingImageStorage()
  const imageFailures = new Map<string, DraftImageFailure>()
  const inFlight = new Set<string>()
  const imageRestores = new Set<string>()
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
  function readPending(hostId: string, workspaceId: string | undefined): StoredSubmission | null {
    try { return JSON.parse(storage.getItem(pendingKey(hostId, workspaceId)) ?? 'null') as StoredSubmission | null }
    catch { return null }
  }
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
  // A registration response can arrive ahead of the workspace/follow upsert.
  let addedWorkspace: { hostId: HostId; workspaceId: string; label: string } | undefined
  const strings = () => copy(document.documentElement.lang.toLowerCase().startsWith('zh'))
  const model = () => selection ?? (catalog?.default != null && matches(catalog, catalog.default) ? catalog.default : null)
  let completionCache: {
    generation: number
    workspaces: ReturnType<typeof ctx.workspaces.list.getSnapshot>
    sessions: ReturnType<typeof ctx.sessions.list.getSnapshot>
    rows: ReturnType<typeof draftCompletionSessions>
  } | undefined

  const snap = (): NewConversationView => {
    const state = target.state.getSnapshot()
    const words = strings()
    const key = draftKey(state.hostId, state.workspaceId)
    const images = draftImages.read(key)
    const pending = readPending(state.hostId, state.workspaceId)
    const imageFailure = imageFailures.get(key)
    const workspaceSnapshot = ctx.workspaces.list.getSnapshot()
    const sessionSnapshot = ctx.sessions.list.getSnapshot()
    if (completionCache?.generation !== state.generation || completionCache.workspaces !== workspaceSnapshot || completionCache.sessions !== sessionSnapshot) {
      completionCache = {
        generation: state.generation, workspaces: workspaceSnapshot, sessions: sessionSnapshot,
        rows: draftCompletionSessions(state, workspaceSnapshot.items, sessionSnapshot.byId, workspaceSnapshot.archivedSessionIds),
      }
    }
    const workspaces: NewConversationView['workspaces'][number][] = workspaceSnapshot.items.flatMap(row => {
      const ws = hostWorkspace(row.workspaceId)
      const hostName = hosts.find(host => host.hostId === ws.hostId)?.displayName
      const prefix = hostName === undefined ? undefined : `${hostName} · `
      const label = prefix !== undefined && row.title.startsWith(prefix) ? row.title.slice(prefix.length) : row.title
      return ws.hostId === state.hostId ? [{ workspaceId: ws.workspaceId, displayId: row.workspaceId, label, path: row.path }] : []
    })
    if (addedWorkspace?.hostId === state.hostId && addedWorkspace.workspaceId === state.workspaceId) {
      const added = addedWorkspace
      if (workspaces.some(row => row.workspaceId === added.workspaceId)) addedWorkspace = undefined
      else workspaces.push({ workspaceId: added.workspaceId, label: added.label })
    }
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
    const presets = presetRows.map(row => ({
      id: row.id, label: row.name ?? modeNames[row.id]?.[zh ? 0 : 1] ?? row.id,
      ...(row.name === undefined ? {} : { name: row.name }),
      ...(row.description === undefined ? {} : { description: row.description }),
    }))
    return { target: state, directory: roster, directoryError: roster.phase === 'error' ? roster.message : undefined,
      workspaces, canAddRemoteWorkspace: host?.state === 'online' && host.supportsWorkspaceAdd === true, presets, agentPreset: chosenPreset ?? presetRows.find(row => row.isDefault)?.id,
      text: drafts.read(state.hostId, state.workspaceId), selection: model(), modelPicker: pickerNode,
      copy: { ...words, hostOffline },
      mainSessionId: mainSession(), returnSessionId, images, completionSessions: completionCache.rows,
      ...(imageFailure === undefined ? {} : { imageFailure }),
      imageSubmitUnavailable: state.hostId !== 'local' && host?.state === 'online' && host.supportsCreateDraftImages !== true,
      pendingSubmission: pending !== null,
      pendingImages: pending?.imageIds !== undefined,
      submitting: inFlight.has(key) }
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
      const result = hostId === 'local' ? await remote?.agentPresets?.list() : {
        ok: true, value: await call<{ presets: Preset[] }>(HOST, { operation: 'agentPresets', hostId }),
      }
      if (disposed || request !== presetRequest) return
      if (!result?.ok || result.value === undefined) return
      presetRows = result.value.presets.filter(row => !row.broken && fromVirtual(row.id) === undefined)
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

  function restorePendingImages() {
    const { hostId, workspaceId } = target.state.getSnapshot()
    const key = draftKey(hostId, workspaceId)
    const pending = readPending(hostId, workspaceId)
    const imageIds = pending?.imageIds
    if (pending === null || imageIds === undefined || draftImages.read(key).length > 0 || imageRestores.has(key)) return
    imageRestores.add(key)
    void pendingImages.read(pending.creationRequestId).then(files => {
      if (disposed || readPending(hostId, workspaceId)?.creationRequestId !== pending.creationRequestId) return
      if (!matchesFrozenImages(files, imageIds) || !draftImages.restore(key, files)) imageFailures.set(key, 'preview')
      else if (imageFailures.get(key) === 'preview') imageFailures.delete(key)
      publish()
    }).catch(() => {
      if (disposed || readPending(hostId, workspaceId)?.creationRequestId !== pending.creationRequestId) return
      imageFailures.set(key, 'preview')
      publish()
    }).finally(() => { imageRestores.delete(key) })
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
    restorePendingImages()
    publish()
  }

  function selectWorkspace(id: string) {
    const current = target.state.getSnapshot()
    if (current.workspaceId === undefined && drafts.read(current.hostId, id) === ''
      && draftImages.read(draftKey(current.hostId, id)).length === 0 && readPending(current.hostId, id) === null) {
      drafts.adoptHostDraft(current.hostId, id)
      draftImages.adopt(current.hostId, id)
    }
    target.selectWorkspace(id)
  }

  function remoteWorkspace(hostId: HostId, generation: number): RemoteWorkspaceActions {
    const navigationAtOpen = draftNavigation
    const isCurrent = () => !disposed && isOpen() && draftNavigation === navigationAtOpen &&
      target.state.getSnapshot().generation === generation && target.state.getSnapshot().hostId === hostId
    const request = <T,>(operation: WorkspaceHostOperation, signal?: AbortSignal) => {
      if (!isCurrent()) return Promise.reject(new HostRequestError('draft-changed'))
      return call<T>(HOST, operation, signal)
    }
    return {
      list: (path, signal) => request<RemoteDirectoryListing>({ operation: 'listDirectories', hostId, ...(path === undefined ? {} : { path }) }, signal),
      createDirectory: (path, name) => request<string>({ operation: 'createDirectory', hostId, path, name }),
      async add(path) {
        const { workspace } = await request<{ workspace: { workspaceId: string; title: string } }>({ operation: 'createWorkspace', hostId, path })
        if (!isCurrent()) return
        addedWorkspace = { hostId, workspaceId: workspace.workspaceId, label: workspace.title }
        selectWorkspace(workspace.workspaceId)
      },
    }
  }

  async function submit(input: SubmitInput) {
    const current = target.state.getSnapshot()
    const submittedFrom = draftNavigation
    const { hostId, workspaceId } = current
    const words = strings()
    const zh = words.title === '新会话'
    if (input.generation !== current.generation || (input.hostId !== undefined && input.hostId !== hostId)
      || (input.workspaceId !== undefined && input.workspaceId !== workspaceId)) {
      return { ok: false as const, message: zh ? '草稿目标已变更' : 'The draft target changed' }
    }
    if (workspaceId === undefined) return { ok: false as const, message: words.pickWorkspaceFirst }
    const host = hosts.find(row => row.hostId === hostId)
    if (hostId !== 'local' && (host?.state !== 'online' || host.supportsCreateDraft !== true)) {
      return { ok: false as const, message: words.hostOffline }
    }
    const key = draftKey(hostId, workspaceId)
    if (inFlight.has(key)) return { ok: false as const, message: words.submitting }
    const storageKey = pendingKey(hostId, workspaceId)
    const existing = readPending(hostId, workspaceId)
    if (input.resume && existing === null) return { ok: false as const, message: words.writeFirstMessage }
    const text = existing?.text ?? input.text ?? drafts.read(hostId, workspaceId)
    const sessionCommand = existing === null ? bareSessionOnlyCommand(text) : undefined
    if (sessionCommand !== undefined) return { ok: false as const, message: zh
      ? `请打开会话后再使用 /${sessionCommand}。`
      : `Open a session before using /${sessionCommand}.` }
    const staged = input.selection ?? model()
    if (existing === null && (staged === null || !matches(catalog, staged))) {
      return { ok: false as const, message: words.pickModelFirst }
    }
    const currentImages = draftImages.read(key)
    const hasImages = existing === null ? currentImages.length > 0 : existing.imageIds !== undefined
    const imagesUnavailable = existing?.imageIds === undefined ? words.imagesUnavailable
      : (zh ? '请恢复支持首条消息附图的 Host 版本，再重试上次提交。'
        : 'Restore a Host version that supports images in the first message, then retry the previous submission.')
    if (hasImages && hostId !== 'local' && host?.supportsCreateDraftImages !== true) {
      return { ok: false as const, message: imagesUnavailable }
    }
    const revision = textRevision.get(key) ?? 0
    const frozen: StoredSubmission = existing ?? {
      workspaceId, text, model: staged,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(chosenPreset === undefined ? {} : { agentPreset: chosenPreset }),
      ...(currentImages.length === 0 ? {} : { imageIds: currentImages.map(image => image.id) }),
      creationRequestId: crypto.randomUUID(), requestId: crypto.randomUUID(),
    }
    const { imageIds, ...request } = frozen
    const stored = JSON.stringify(frozen)
    const releasePending = () => {
      if (readPending(hostId, workspaceId)?.creationRequestId !== frozen.creationRequestId) return
      storage.removeItem(storageKey)
      if (imageIds !== undefined) void pendingImages.remove(frozen.creationRequestId).catch(() => {})
    }
    inFlight.add(key)
    try {
      publish()
      let images: DraftImagePart[] | undefined
      if (imageIds !== undefined) {
        let files: readonly DraftImageFile[] | undefined
        try {
          files = draftImages.matches(key, imageIds)
            ? currentImages.map(({ id, name, mediaType, file }) => ({ id, name, mediaType, file }))
            : await pendingImages.read(frozen.creationRequestId)
          if (!matchesFrozenImages(files, imageIds)) {
            // A missing record cannot be reconstructed. Leave the current draft intact and never send it with the old IDs.
            releasePending()
            imageFailures.delete(key)
            return { ok: false as const, message: zh
              ? '浏览器中已找不到上次提交的图片。请先检查会话列表，再决定是否重新添加图片发送。'
              : 'The previous submission’s images are missing from the browser. Check the session list before attaching the images and sending again.' }
          }
          images = await Promise.all(files.map(encodeDraftImage))
          if (existing === null) await pendingImages.write(frozen.creationRequestId, files)
          else if (!disposed && draftImages.read(key).length === 0) draftImages.restore(key, files)
        } catch {
          return { ok: false as const, message: zh ? '浏览器无法读取或保存此次提交的图片' : 'The browser could not read or save the images for this submission' }
        }
      }
      const latest = readPending(hostId, workspaceId)
      if (existing === null) {
        if (latest !== null) {
          if (imageIds !== undefined) void pendingImages.remove(frozen.creationRequestId).catch(() => {})
          return { ok: false as const, message: words.retrySubmission }
        }
        try { storage.setItem(storageKey, stored) } catch (error) {
          if (imageIds !== undefined) void pendingImages.remove(frozen.creationRequestId).catch(() => {})
          throw error
        }
      } else if (latest?.creationRequestId !== frozen.creationRequestId) {
        // Another tab may have finished this request while its images were being encoded.
        return { ok: false as const, message: zh ? '上次提交的状态已更新，请检查会话列表。' : 'The previous submission changed. Check the session list.' }
      }
      const result = await call<{ sessionId: SessionId; preferenceSaved: boolean }>(CREATE, {
        hostId, request: { ...request, ...(images === undefined ? {} : { images }) },
      })
      if (readPending(hostId, workspaceId)?.creationRequestId === frozen.creationRequestId) {
        if ((textRevision.get(key) ?? 0) === revision && drafts.read(hostId, workspaceId) === frozen.text) drafts.clear(hostId, workspaceId)
        if (imageIds !== undefined) {
          draftImages.clearSent(key, imageIds)
          imageFailures.delete(key)
        }
      }
      releasePending()
      if (!disposed && input.generation === target.state.getSnapshot().generation && submittedFrom === draftNavigation && isOpen()) {
        workspace?.openSession(result.sessionId)
      }
      return { ok: true as const }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'create-failed'
      if (error instanceof HostRequestError) {
        if (code === 'draft-model-no-images' || code === 'draft-image-invalid') {
          releasePending()
          const message = code === 'draft-model-no-images'
            ? (zh ? '所选模型不支持图片。请选择支持图片的模型后再发送。' : 'The selected model does not support images. Choose a model that accepts images and send again.')
            : (zh ? '所选 Host 拒绝了图片。请移除或更换图片后再发送。' : 'The selected Host rejected an image. Remove or replace the image and send again.')
          return { ok: false as const, message }
        }
        if (existing === null && rejectedBeforeCreation.has(code)) releasePending()
        if (code === 'draft-images-unsupported') return { ok: false as const, message: imagesUnavailable }
      }
      return { ok: false as const, message: code }
    } finally {
      inFlight.delete(key)
      publish()
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
      restorePendingImages()
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
    onSelectWorkspace: selectWorkspace,
    remoteWorkspace,
    onSelectPreset: id => {
      if (!presetRows.some(row => row.id === id)) return
      chosenPreset = id
      publish()
    },
    onTextChange: (text, expectedGeneration, expectedText) => {
      const current = target.state.getSnapshot()
      if (disposed || (expectedGeneration !== undefined && (!isOpen() || current.generation !== expectedGeneration))
        || (expectedText !== undefined && drafts.read(current.hostId, current.workspaceId) !== expectedText)) return false
      const key = draftKey(current.hostId, current.workspaceId)
      textRevision.set(key, (textRevision.get(key) ?? 0) + 1)
      drafts.write(current.hostId, current.workspaceId, text)
      publish()
      return true
    },
    async loadFileCandidates(generation, query, signal) {
      const requested = target.state.getSnapshot()
      const navigationAtRequest = draftNavigation
      const isCurrent = () => !disposed && isOpen() && draftNavigation === navigationAtRequest
        && target.state.getSnapshot().generation === generation
      if (!isCurrent() || requested.workspaceId === undefined) return []
      const candidates = await call<readonly DraftFileCandidate[]>(CREATE, {
        hostId: requested.hostId, fileCandidates: { workspaceId: requested.workspaceId, query },
      }, signal)
      signal.throwIfAborted()
      return isCurrent() ? candidates : []
    },
    onPasteImages: (generation, files) => {
      const current = target.state.getSnapshot()
      if (disposed || !isOpen() || current.generation !== generation) return
      const key = draftKey(current.hostId, current.workspaceId)
      if (inFlight.has(key) || readPending(current.hostId, current.workspaceId) !== null) return
      const failure = draftImages.add(current, generation, files)
      if (failure === undefined) imageFailures.delete(key)
      else imageFailures.set(key, failure)
      publish()
    },
    onRemoveImage: (generation, id) => {
      const current = target.state.getSnapshot()
      if (disposed || !isOpen() || current.generation !== generation) return
      const key = draftKey(current.hostId, current.workspaceId)
      if (inFlight.has(key) || readPending(current.hostId, current.workspaceId)?.imageIds !== undefined) return
      draftImages.remove(current, generation, id)
      imageFailures.delete(key)
      publish()
    },
    onRetryDirectory: () => { void reloadHosts(); void loadCatalog(); void loadFavorites(); void loadPresets() },
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
      restorePendingImages()
      void reloadHosts(); void loadCatalog(); void loadFavorites(); void loadPresets()
    })
    const interval = window.setInterval(() => {
      if (isOpen() || (mainSession() !== undefined && directory.getSnapshot().phase === 'error')) void reloadHosts()
    }, 5000)
    void preference().then(() => { if (!disposed) enabled.set(true) }, () => {})
    void reloadHosts()
    return () => { disposed = true; window.clearInterval(interval); stopTarget(); stopSessions(); stopWorkspaces(); stopPanel(); stopDirectory(); target.dispose(); draftImages.dispose() }
  })
  return open
}
