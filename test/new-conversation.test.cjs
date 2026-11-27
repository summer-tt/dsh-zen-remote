const assert = require('node:assert/strict')
const { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { createRelayHandler } = require('../lib/relay-server.js')
const { createNewConversationRoute, NEW_CONVERSATION_ROUTE } = require('../lib/new-conversation-routes.js')
const { createDraftSkillCandidates } = require('../lib/new-conversation/draft-skill-candidates.js')
const { createDraftFileCandidates } = require('../lib/new-conversation/draft-file-candidates.js')
const { RelayError } = require('../lib/relay-client.js')
const { toVirtual } = require('../lib/virtual-id.js')
const { createShareStore } = require('../lib/share-store.js')
const { encodeSessionReferenceUri } = require('../lib/session-reference.js')

const modulePromise = import('../lib/new-conversation/index.js')
const selection = { provider: 'test', model: 'picked', reasoningEffort: 'high' }
const request = {
  workspaceId: 'workspace-1', creationRequestId: 'create-1', requestId: 'prompt-1',
  model: selection, text: '  First message  ',
}

const screenshot = {
  type: 'image', mediaType: 'image/png', name: 'screenshot.png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWOQlJQEAACaAEy6nTjCAAAAAElFTkSuQmCC',
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'zr-conversation-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const { NewConversationHost } = await modulePromise
  const log = []
  const stored = new Map()
  const live = new Map()
  const currentModel = { provider: 'other', model: 'default' }
  const workspace = {
    path: directory,
    sessionIds: [],
    attachSession: async (id) => { workspace.sessionIds.push(id); log.push(['attach', id]) },
  }
  const services = {
    workspaceRegistry: { get: (id) => (id === request.workspaceId ? workspace : undefined), archivedSessionIds: [] },
    agents: {
      get: (id) => live.get(id),
      create: async (options) => {
        const { sessionId: id } = options
        assert.equal(stored.has(id), false)
        const journal = await readdir(directory)
        assert.ok(journal.some(file => file.endsWith('.json')))
        const state = { header: { id, ...options.meta }, events: [] }
        stored.set(id, state)
        log.push(['create', id])
        return publish(state, options)
      },
      resume: async (options) => {
        log.push(['resume', options.resumeSessionId])
        return publish(stored.get(options.resumeSessionId), options)
      },
    },
    llm: {
      listModels: async (provider) => (provider === selection.provider ? [{ id: selection.model }] : []),
      resolveCallConfig: async (model) => assert.deepEqual(model, selection),
    },
    sessionPersistence: { stat: async (id) => stored.get(id) },
    sessions: { flush: async (session) => { log.push(['flush', session.header.id]); return true } },
    sessionQuery: {
      observeSession: async (id) => ({
        events: stored.get(id).events,
        [Symbol.dispose]: () => { log.push(['observation disposed', id]) },
      }),
    },
    agentPresets: {
      resolve: async (id) => ({ id: id ?? 'default-preset' }),
      mount: async (_ctx, id) => { log.push(['mount', id]) },
    },
    agentDefaultModel: { currentSelection: () => currentModel, saveSelection: () => assert.fail('updated Host default') },
    sessionController: {
      prompt: async (prompt) => {
        const agent = live.get(prompt.sessionId)
        log.push(['prompt', agent.model.current(), prompt])
        const source = { kind: 'user', rpcId: prompt.requestId }
        agent.session.events.push({ type: 'agent/inbox/spliced', data: { inserted: [{ source }] } })
        return { accepted: true }
      },
    },
  }
  async function publish(session, options) {
    let model = session.events.findLast(event => event.type === 'model/selection')?.data ?? options.agentOptions
    const agent = { id: session.header.id, session, model: {
      current: () => model,
      select: (value) => {
        assert.equal(live.has(agent.id), false)
        model = value
        session.events.push({ type: 'model/selection', data: value })
        log.push(['select', model])
      },
    } }
    await options.setup({}, agent)
    live.set(agent.id, agent)
    log.push(['publish', agent.id])
    return { agent }
  }
  const newHost = () => new NewConversationHost({
    get: (key) => services[key], journalDirectory: directory,
    installModelSelection: () => { log.push(['install notice']) },
  })
  return { directory, log, stored, live, currentModel, workspace, services, newHost }
}

test('draft controls describe defaults without a Session and initialize explicit values before the first prompt', async (t) => {
  const { newHost, log, services, live } = await fixture(t)
  const selected = { contextWindow: 500000, speed: 'fast' }
  const defaults = { contextWindow: { options: [272000, 500000], value: 272000 }, speed: { options: ['standard', 'fast'], value: 'standard' } }
  const applied = new Map()
  services.magpieDraftModelControls = {
    describe(address) { assert.deepEqual(address, { provider: selection.provider, model: selection.model }); return defaults },
    validate({ controls }) { assert.deepEqual(controls, selected); log.push(['validate controls']) },
    initialize({ sessionId, controls }) {
      log.push(['initialize controls', sessionId]); assert.equal(live.has(sessionId), false)
      applied.set(sessionId, controls)
    },
  }
  const host = newHost()
  const address = { provider: selection.provider, model: selection.model, agentPreset: 'chosen' }
  assert.deepEqual(await host.describeModelControls(address), defaults)
  assert.deepEqual(await host.describeModelControls({ ...address, workspaceId: request.workspaceId }), defaults)
  await assert.rejects(host.describeModelControls({ ...address, workspaceId: 'missing' }), { code: 'workspace-not-found' })
  assert.deepEqual(log, [])
  const prompt = services.sessionController.prompt
  services.sessionController.prompt = async (input, signal) => {
    assert.deepEqual(applied.get(input.sessionId), selected)
    assert.deepEqual(live.get(input.sessionId).model.current(), selection)
    return prompt(input, signal)
  }
  const payload = { ...request, agentPreset: 'chosen', modelControls: selected }
  const first = await host.submit('owner', payload)
  assert.deepEqual(await newHost().submit('owner', { ...payload, modelControls: { speed: 'fast', contextWindow: 500000 } }), first)
  await assert.rejects(newHost().submit('owner', { ...payload, modelControls: { speed: 'standard' } }), { code: 'creation-conflict' })
  const names = log.map(([name]) => name)
  assert.equal(names.filter(name => name === 'initialize controls').length, 1)
  assert.equal(names.filter(name => name === 'prompt').length, 1)
  assert.ok(names.indexOf('mount') < names.indexOf('initialize controls'))
  assert.ok(names.indexOf('initialize controls') < names.indexOf('publish'))
})

test('a failed controls seed resumes the reservation before sending the first prompt', async (t) => {
  const { newHost, log, services } = await fixture(t)
  let writes = 0
  services.magpieDraftModelControls = {
    describe() { return {} }, validate() {},
    initialize() { if (++writes === 1) throw new Error('write failed') },
  }
  const payload = { ...request, modelControls: { speed: 'fast' } }
  await assert.rejects(newHost().submit('owner', payload), /write failed/)
  assert.equal(log.some(([name]) => name === 'prompt' || name === 'attach'), false)
  const { sessionId } = await newHost().submit('owner', payload)
  assert.deepEqual(log.filter(([name]) => name === 'create' || name === 'resume'), [['create', sessionId], ['resume', sessionId]])
  assert.equal(log.filter(([name]) => name === 'prompt').length, 1)
  assert.equal(writes, 2)
})

test('invalid draft settings and older Magpie installs cannot enqueue a prompt with silently discarded settings', async (t) => {
  const { newHost, log, services, directory } = await fixture(t)
  const payload = { ...request, modelControls: { speed: 'fast' } }
  assert.deepEqual(await newHost().describeModelControls({ provider: selection.provider, model: selection.model }), {})
  await assert.rejects(newHost().submit('owner', payload), { code: 'draft-model-controls-unsupported' })
  services.magpieDraftModelControls = {
    describe() { return {} },
    validate() { throw Object.assign(new Error('invalid choices'), { code: 'draft-model-controls-invalid' }) },
    initialize() { assert.fail('cannot initialize') },
  }
  await assert.rejects(newHost().submit('owner', payload), { code: 'draft-model-controls-rejected' })
  assert.deepEqual(await readdir(directory), [])
  assert.deepEqual(log, [])
  assert.ok((await newHost().submit('owner', request)).sessionId)
})

test('loads the public model-selection listener from the launched DSH package and matches the live registry', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'zr-agent-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'node_modules', '@deepseek-ai', 'dsh-agent')
  await mkdir(directory, { recursive: true })
  const entrypoint = join(root, 'dsh.mjs')
  const modulePath = join(directory, 'index.mjs')
  await writeFile(entrypoint, '')
  await writeFile(join(directory, 'package.json'), JSON.stringify({ main: './index.mjs' }))
  await writeFile(modulePath, `
    export default class AgentRegistry {}
    export class AgentModel {}
    export function installModelSelection(ctx) { ctx.installed = true }
  `)
  const { loadHostModelSelection } = await import('../lib/new-conversation/model-selection.js')
  const { default: AgentRegistry } = await import(pathToFileURL(modulePath).href)
  const ctx = {}
  const install = await loadHostModelSelection(new AgentRegistry(), entrypoint)
  install(ctx)
  assert.equal(ctx.installed, true)
  await assert.rejects(loadHostModelSelection({}, entrypoint), /active DSH Agent registry/)
  await assert.rejects(loadHostModelSelection(new AgentRegistry(), ''), /entry point is unavailable/)
})

test('validates wire fields, including non-empty text and no caller-selected Session ID', async () => {
  const { parseNewConversationRequest, isManagedConversation } = await modulePromise
  assert.deepEqual(parseNewConversationRequest(request), request)
  for (const extra of [{ sessionId: 'user-selected' }, { text: '   ' }, { clientTimeZone: '+02:00' }, { clientTimeZone: 'Mars/Olympus' }, { model: { ...selection, injected: true } }]) {
    assert.throws(() => parseNewConversationRequest({ ...request, ...extra }), { code: 'bad-request' })
  }
  assert.equal(isManagedConversation('zen-conversation-11111111-1111-4111-8111-111111111111'), true)
  assert.equal(isManagedConversation('zen-conversation-11111111-1111-4111-8111-111111111111\n'), false)
  assert.equal(isManagedConversation('zen-conversation-11111111-1111-1111-1111-111111111111'), false)
})

test('validates draft images without accepting caller-supplied attachment references', async () => {
  const { parseNewConversationRequest } = await modulePromise
  const imageOnly = { ...request, text: '', images: [screenshot] }
  assert.deepEqual(parseNewConversationRequest(imageOnly), imageOnly)
  assert.deepEqual(parseNewConversationRequest({ ...request, images: [] }), request)
  for (const images of [null, [null], [{ ...screenshot, data: '' }], [{ ...screenshot, data: 'ab==' }],
    [{ ...screenshot, mediaType: 'image/svg+xml' }], [{ ...screenshot, receiptId: 'foreign' }], Array(21).fill(screenshot)]) {
    assert.throws(() => parseNewConversationRequest({ ...request, images }), { code: 'bad-request' })
  }
})

test('a model that rejects images is detected before creating a Session', async (t) => {
  const { services, stored, newHost } = await fixture(t)
  services.llm.resolveModelInfo = async () => ({ inputModalities: ['text'] })
  await assert.rejects(newHost().submit('owner', { ...request, images: [screenshot] }), { code: 'draft-model-no-images' })
  assert.equal(stored.size, 0)
  await newHost().submit('owner', request)
  assert.equal(stored.size, 1)
})

test('records Session-local selection and preset before publication, admits once, and shares only after flushing', async (t) => {
  const { directory, log, stored, currentModel, newHost } = await fixture(t)
  const host = newHost()
  const options = { confirmShare: (sessionId, state) => { log.push(['share', sessionId, state]) } }
  const payload = { ...request, agentPreset: 'custom' }
  const [first, duplicate] = await Promise.all([host.submit('device-1', payload, options), host.submit('device-1', payload, options)])
  assert.deepEqual(first, duplicate)
  const id = first.sessionId
  assert.equal(host.isManaged(id), true)
  assert.equal(stored.get(id).header.agentPreset, 'custom')
  assert.deepEqual(log.map(event => event[0]), ['create', 'install notice', 'mount', 'select', 'flush', 'publish', 'attach', 'prompt', 'flush', 'share', 'share'])
  assert.deepEqual(log.find(event => event[0] === 'prompt'), ['prompt', selection,
    { sessionId: id, requestId: request.requestId, mode: 'queue', content: [{ type: 'text', text: request.text }] }])
  assert.deepEqual(log.slice(-2), [['share', id, 'initial'], ['share', id, 'confirmed']])
  assert.deepEqual(currentModel, { provider: 'other', model: 'default' })
  const journalFile = (await readdir(directory)).find(file => file.endsWith('.json'))
  assert.ok(journalFile)
  const manifest = await readFile(join(directory, journalFile), 'utf8')
  assert.ok(!manifest.includes(request.text) && !manifest.includes('device-1'))
  await assert.rejects(host.submit('device-1', { ...payload, text: 'different' }), { code: 'creation-conflict' })
  assert.notEqual((await host.submit('device-2', payload)).sessionId, id)
})

test('rejects unauthorized or unavailable input before writing a Session', async (t) => {
  const { directory, stored, newHost } = await fixture(t)
  const host = newHost()
  await assert.rejects(host.submit('device-1', request, { authorize: () => { throw new Error('no longer authorized') } }), /no longer authorized/)
  await assert.rejects(host.submit('device-1', { ...request, workspaceId: 'missing' }), { code: 'workspace-not-found' })
  await assert.rejects(host.submit('device-1', { ...request, model: { ...selection, model: 'missing' } }), { code: 'model-unavailable' })
  assert.equal(stored.size, 0)
  assert.deepEqual(await readdir(directory), [])
})

test('resumes the same reservation after a partial create and attachment failure', async (t) => {
  const { log, live, stored, workspace, services, newHost } = await fixture(t)
  const flush = services.sessions.flush
  services.sessions.flush = async () => { throw new Error('selection flush failed') }
  await assert.rejects(newHost().submit('device-1', request), /selection flush failed/)
  const [id] = stored.keys()
  stored.get(id).events.length = 0
  services.sessions.flush = flush
  const attach = workspace.attachSession
  workspace.attachSession = async () => { throw new Error('attach failed') }
  await assert.rejects(newHost().submit('device-1', request), /attach failed/)
  workspace.attachSession = attach
  live.clear()
  assert.deepEqual(await newHost().submit('device-1', request), { sessionId: id })
  assert.equal(stored.size, 1)
  assert.equal(log.filter(event => event[0] === 'prompt').length, 1)
  assert.ok(log.filter(event => event[0] === 'resume').every(event => event[1] === id))
  assert.deepEqual(workspace.sessionIds, [id])
})

test('recovers a durable inbox receipt after losing the prompt response and uses the recorded share state', async (t) => {
  const { log, stored, live, services, newHost } = await fixture(t)
  const prompt = services.sessionController.prompt
  services.sessionController.prompt = async (...args) => {
    await prompt(...args)
    throw new Error('Lost response')
  }
  await assert.rejects(newHost().submit('device-1', request), /Lost response/)
  const [id] = stored.keys()
  live.clear()
  services.llm.listModels = async () => []
  let shareState
  await assert.rejects(newHost().submit('device-1', request, { confirmShare: (sessionId, state) => {
    assert.equal(sessionId, id)
    shareState = state
    throw new Error('Unsure whether share landed')
  } }), /Unsure whether share landed/)
  assert.equal(shareState, 'initial')
  assert.deepEqual(await newHost().submit('device-1', request, { confirmShare: (sessionId, state) => {
    assert.equal(sessionId, id)
    assert.equal(state, 'recovering')
  } }), { sessionId: id })
  await assert.rejects(newHost().submit('device-1', request, { confirmShare: (_sessionId, state) => {
    assert.equal(state, 'confirmed')
    throw new Error('Share revoked')
  } }), /Share revoked/)
  assert.equal(log.filter(event => event[0] === 'prompt').length, 1)
})

test('image-only submission reuses the accepted request ID after a lost response', async (t) => {
  const { log, stored, services, newHost } = await fixture(t)
  const payload = { ...request, text: '', images: [screenshot] }
  const admit = services.sessionController.prompt
  services.sessionController.prompt = async (...args) => {
    await admit(...args)
    throw new Error('Lost response')
  }
  await assert.rejects(newHost().submit('owner', payload), /Lost response/)
  const [sessionId] = stored.keys()
  assert.deepEqual(await newHost().submit('owner', payload), { sessionId })
  assert.deepEqual(log.filter(([event]) => event === 'prompt').map(([, , prompt]) => prompt), [
    { sessionId, requestId: request.requestId, mode: 'queue', content: [screenshot] },
  ])
  await assert.rejects(newHost().submit('owner', { ...payload, images: [{ ...screenshot, data: 'QQ==' }] }), { code: 'creation-conflict' })
})

test('requires a persistence acknowledgement before sharing or returning', async (t) => {
  const { services, newHost } = await fixture(t)
  services.sessions.flush = async () => false
  await assert.rejects(newHost().submit('device-1', request, { confirmShare: () => assert.fail('shared') }), { code: 'persistence-unavailable' })
})

test('relay creation authenticates the device, enforces reference access, and preserves revocation across a restart', async (t) => {
  const { directory, log, newHost } = await fixture(t)
  const { NewConversationError, parseNewConversationRequest } = await modulePromise
  const secret = 'a'.repeat(64)
  const headers = {
    'content-type': 'application/json', 'x-zen-remote-secret': secret, 'x-zen-remote-via': 'gateway',
    'x-zen-remote-role': 'desktop-client', 'x-zen-remote-device': 'device-1',
  }
  const shareFile = join(directory, 'shares.json')
  let store = createShareStore({ file: shareFile, idleHours: 48 })
  let host = newHost()
  function createHandler() {
    return createRelayHandler({
      secret, store, serverInfo: { serverId: '0123abcd', serverName: () => 'test', dshVersion: 'test' },
      gateway: { invoke() { assert.fail('forwarded the specialized request to the native gateway') } },
      createWithFirstMessage: (device, incoming, authorize) => host.submit(`paired-device:${device}`, parseNewConversationRequest(incoming), {
        authorize,
        confirmShare(sessionId, state) {
          if (!(state === 'confirmed' ? store.isShared(sessionId) : store.shareNewConversation(sessionId))) {
            throw new NewConversationError(409, 'share-unconfirmed', 'Shared Session was revoked')
          }
        },
      }),
    })
  }
  let handler = createHandler()
  const server = createServer((req, res) => { void handler(req, res).catch(error => res.destroy(error)) })
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const invoke = async (payload, auth = headers) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/_dsh/zen-remote/relay/v1/invoke`, {
      method: 'POST', headers: auth, body: JSON.stringify({ namespace: 'session', method: 'createWithFirstMessage', args: { request: payload } }),
    })
    return { status: res.status, body: await res.json() }
  }
  assert.equal((await invoke(request, { ...headers, 'x-zen-remote-secret': 'wrong' })).status, 401)
  const linked = { ...request, text: `Link to ${encodeSessionReferenceUri('private-session')}` }
  assert.deepEqual(await invoke(linked), { status: 403, body: { ok: false, error: { code: 'not-shared' } } })
  store.share('private-session')
  assert.deepEqual(await invoke(linked), { status: 409, body: { ok: false, error: { code: 'references-require-session' } } })
  assert.equal(log.length, 0)
  const payload = { ...request, images: [screenshot] }
  const created = await invoke(payload)
  assert.equal(created.status, 200)
  assert.equal(store.isShared(created.body.value.sessionId), true)
  assert.deepEqual(await invoke(payload), created)
  assert.equal(store.unshare(created.body.value.sessionId, 'manual'), true)
  store = createShareStore({ file: shareFile, idleHours: 48 })
  host = newHost()
  handler = createHandler()
  assert.equal((await invoke(payload)).status, 409)
  assert.equal(store.isShared(created.body.value.sessionId), false)
  assert.deepEqual(log.filter(([event]) => event === 'prompt').map(([, , prompt]) => prompt.content), [
    [{ type: 'text', text: request.text }, screenshot],
  ])
})

test('draft HTTP requests send image bytes only to the selected Host and keep older text Hosts compatible', async (t) => {
  const { log, newHost } = await fixture(t)
  const host = newHost()
  const relayCalls = []
  const relays = new Map(['aaaaaaaa', 'bbbbbbbb'].map(hostId => [hostId, {
    entryId: hostId,
    client: {
      state: 'online',
      handshakeInfo: { serverId: hostId, supportsCreateDraft: true, ...(hostId === 'aaaaaaaa' ? { supportsCreateDraftImages: true } : {}) },
      invoke: async (...args) => { relayCalls.push([hostId, ...args]); return { sessionId: 'remote-session' } },
    },
  }]))
  const handler = createNewConversationRoute({
    admit: () => ({}), getPool: () => ({ getByServerId: id => relays.get(id), isVirtual: () => false }),
    submitLocal: input => host.submit('owner', input), getRecentHost: () => 'local',
    saveRecentHost: async () => {}, onRemoteCreated() {},
  })
  const server = createServer((req, res) => { void handler(req, res).catch(error => res.destroy(error)) })
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  async function submit(hostId, input) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/_dsh/zen-remote/new-conversation`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostId, request: input }),
    })
    return { status: response.status, body: await response.json() }
  }
  const localRef = encodeSessionReferenceUri('local-source')
  const remoteRef = encodeSessionReferenceUri(toVirtual('aaaaaaaa', 'shared-source'))
  for (const [hostId, uri] of [['local', remoteRef], ['bbbbbbbb', remoteRef], ['aaaaaaaa', localRef]]) {
    assert.deepEqual(await submit(hostId, { ...request, text: `@[Session](${uri})` }), {
      status: 400, body: { ok: false, error: { code: 'remote-mismatch' } },
    })
  }
  assert.equal(log.length, 0)
  assert.equal(relayCalls.length, 0)
  const payload = { ...request, images: [screenshot] }
  assert.equal((await submit('local', payload)).status, 200)
  assert.deepEqual(log.find(([event]) => event === 'prompt')[2].content, [{ type: 'text', text: request.text }, screenshot])
  assert.equal(relayCalls.length, 0)
  assert.deepEqual(await submit('bbbbbbbb', payload), { status: 409, body: { ok: false, error: { code: 'draft-images-unsupported' } } })
  assert.equal(relayCalls.length, 0)
  assert.deepEqual(await submit('aaaaaaaa', payload), {
    status: 200, body: { ok: true, value: { sessionId: toVirtual('aaaaaaaa', 'remote-session'), preferenceSaved: true } },
  })
  assert.equal((await submit('bbbbbbbb', request)).status, 200)
  assert.deepEqual(relayCalls, [
    ['aaaaaaaa', 'session', 'createWithFirstMessage', { request: payload }],
    ['bbbbbbbb', 'session', 'createWithFirstMessage', { request }],
  ])
  // A screenshot above the old text JSON cap must still reach the selected relay.
  const large = { ...payload, images: [{ ...screenshot, data: 'AAAA'.repeat(600_000) }] }
  assert.equal((await submit('aaaaaaaa', large)).status, 200)
  assert.deepEqual(relayCalls.at(-1), ['aaaaaaaa', 'session', 'createWithFirstMessage', { request: large }])
})

test('draft lookup uses the released native search with Workspace roots, limits, and live contents', async (t) => {
  if (!process.env.DSH_INSTALL_DIR) return t.skip('requires a launched DSH installation')
  const entrypoint = join(process.env.DSH_INSTALL_DIR, 'lib/bin.js')
  const { directory, log, workspace, services } = await fixture(t)
  const root = await realpath(directory)
  workspace.path = join(root, 'workspace')
  const outside = join(root, 'outside')
  await Promise.all([
    mkdir(join(workspace.path, 'src'), { recursive: true }),
    mkdir(join(workspace.path, 'node_modules'), { recursive: true }),
    mkdir(outside),
  ])
  await Promise.all([
    writeFile(join(workspace.path, 'src', 'hello.ts'), 'private file contents'),
    writeFile(join(workspace.path, 'node_modules', 'hidden-dependency'), ''),
    writeFile(join(workspace.path, '.hidden-file'), ''),
    writeFile(join(outside, 'outside-secret'), ''),
    symlink(outside, join(workspace.path, 'external'), 'junction'),
    ...Array.from({ length: 24 }, (_, i) => writeFile(join(workspace.path, `pick-${i}.txt`), '')),
  ])
  const lookup = createDraftFileCandidates(() => services.workspaceRegistry, entrypoint)
  const query = (query, workspaceId = request.workspaceId, signal = new AbortController().signal) => lookup({ workspaceId, query }, signal)
  assert.deepEqual(await query('src/'), [{ path: 'src/hello.ts', kind: 'file' }])
  assert.deepEqual(await query('hello'), [{ path: 'src/hello.ts', kind: 'file' }])
  assert.deepEqual((await query('src'))[0], { path: 'src', kind: 'directory' })
  assert.equal((await query('pick')).length, 20)
  for (const input of ['../outside/', 'src/../../outside/', outside + '/', 'C:\\Windows\\', 'external/', 'hidden-dependency', 'outside-secret', 'hidden-file']) {
    assert.deepEqual(await query(input), [], input)
  }
  assert.deepEqual(await query('.hidden-file'), [{ path: '.hidden-file', kind: 'file' }])
  await assert.rejects(query('', outside), { code: 'workspace-not-found' })
  await assert.rejects(query('', request.workspaceId, AbortSignal.abort()), { name: 'AbortError' })
  await rm(join(workspace.path, 'src', 'hello.ts'))
  assert.deepEqual(await query('hello'), [])
  workspace.path = join(workspace.path, 'external')
  await assert.rejects(query(''), { code: 'workspace-not-found' })
  assert.deepEqual(log, [])
})

test('draft lookup resolves the public search through a strict DSH Web dependency layout', async (t) => {
  const { directory, workspace, services } = await fixture(t)
  const root = await realpath(directory)
  workspace.path = root
  const entrypoint = join(root, 'dsh.mjs')
  const web = join(root, 'node_modules', '@deepseek-ai', 'dsh-web-app')
  const pkg = join(web, 'node_modules', '@deepseek-ai', 'dsh-file-reference-local')
  await mkdir(pkg, { recursive: true })
  await Promise.all([
    writeFile(entrypoint, ''),
    writeFile(join(web, 'package.json'), JSON.stringify({ exports: { './package.json': './package.json' } })),
    writeFile(join(pkg, 'package.json'), JSON.stringify({ exports: './index.mjs' })),
    writeFile(join(pkg, 'index.mjs'), `
      export const DEFAULT_FILE_SEARCH_MAX_RESULTS = 20
      export const DEFAULT_FILE_SEARCH_MAX_ENTRIES = 50000
      export const DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = ['node_modules']
      export class WorkspaceFileSearch {
        constructor(root, config) {
          if (root !== ${JSON.stringify(root)} || config.maxResults !== 20 || config.maxEntries !== 50000
              || config.excludedDirectories[0] !== 'node_modules') throw new Error('Expected the native defaults and registry root')
        }
        async list(query, signal) {
          signal.throwIfAborted()
          return [{ path: query, kind: 'file' }]
        }
        dispose() {}
      }
    `),
  ])
  const lookup = createDraftFileCandidates(() => services.workspaceRegistry, entrypoint)
  assert.deepEqual(await lookup({ workspaceId: request.workspaceId, query: 'example.txt' }, new AbortController().signal), [
    { path: 'example.txt', kind: 'file' },
  ])
})

test('draft lookup reports an unsupported DSH installation even when the Workspace is known', async (t) => {
  const { services } = await fixture(t)
  const lookup = createDraftFileCandidates(() => services.workspaceRegistry, '')
  await assert.rejects(lookup({ workspaceId: request.workspaceId, query: '' }, new AbortController().signal), {
    status: 409, code: 'draft-file-candidates-unsupported',
  })
})

async function listenForDraftRequests(t, handler) {
  const server = createServer((req, res) => { void handler(req, res).catch(error => res.destroy(error)) })
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

test('draft capabilities dispatch only to the chosen Host and gracefully omit fields on an older peer', async (t) => {
  const { newHost, services, log } = await fixture(t)
  const address = { provider: selection.provider, model: selection.model, agentPreset: 'preset-a' }
  const local = { speed: { options: ['standard', 'fast'], value: 'standard' } }
  const remote = { speed: { options: ['standard', 'ultrafast'], value: 'ultrafast' } }
  services.magpieDraftModelControls = { describe: () => local, validate() {}, initialize() {} }
  const calls = []
  const modern = {
    entryId: 'paired', client: { state: 'online', handshakeInfo: { serverId: 'aaaaaaaa', supportsCreateDraft: true, supportsDraftModelControls: true },
      subscribe: () => () => {}, invoke: async (...args) => { calls.push(args); return remote } },
  }
  const legacy = { entryId: 'legacy', client: { state: 'online', handshakeInfo: { serverId: 'bbbbbbbb', supportsCreateDraft: true }, invoke: () => assert.fail('older Host must not be invoked') } }
  const entries = new Map([['aaaaaaaa', modern], ['bbbbbbbb', legacy]])
  const host = newHost()
  const handler = createNewConversationRoute({
    admit: () => ({ peer: {} }), getPool: () => ({ getByServerId: id => entries.get(id), isVirtual: () => false }),
    describeLocalModelControls: input => host.describeModelControls(input),
    submitLocal: () => assert.fail('reading controls must not create a Session'),
  })
  const base = await listenForDraftRequests(t, handler)
  const post = payload => postDraftLookup(base + NEW_CONVERSATION_ROUTE, payload)
  const read = (hostId, modelControls) => post({ hostId, modelControls })
  assert.deepEqual((await read('local', address)).body, { ok: true, value: local })
  assert.deepEqual((await read('local', { ...address, workspaceId: request.workspaceId })).body, { ok: true, value: local })
  const remoteAddress = { ...address, agentPreset: 'preset-b', workspaceId: request.workspaceId }
  assert.deepEqual((await read('aaaaaaaa', remoteAddress)).body, { ok: true, value: remote })
  assert.deepEqual(calls[0].slice(0, 3), ['session', 'draftModelControls', { request: remoteAddress }])
  assert.deepEqual((await read('bbbbbbbb', address)).body, { ok: true, value: {} })
  assert.equal((await read('aaaaaaaa', { ...address, provider: toVirtual('bbbbbbbb', 'test') })).status, 400)
  assert.equal((await post({ hostId: 'local', request, modelControls: address })).status, 400)
  const oldWrite = await post({ hostId: 'bbbbbbbb', request: { ...request, modelControls: { speed: 'fast' } } })
  assert.equal(oldWrite.body.error.code, 'draft-model-controls-unsupported')
  assert.equal(calls.length, 1)
  assert.deepEqual(log, [])
})

const draftLookup = { workspaceId: request.workspaceId, query: 'src/' }
const candidates = [{ path: 'src/code.ts', kind: 'file' }, { path: 'src/nested', kind: 'directory' }]

async function postDraftLookup(url, payload, headers = {}, signal) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload), signal,
  })
  return { status: response.status, body: await response.json() }
}

function abortProbe() {
  let entered, aborted
  const started = new Promise(resolve => { entered = resolve })
  const closed = new Promise(resolve => { aborted = resolve })
  return {
    started, closed,
    lookup(_request, signal) {
      entered()
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted(); reject(signal.reason) }, { once: true })
      })
    },
  }
}

test('draft candidate HTTP lookup enforces admission and targets only the selected Host', { timeout: 5000 }, async (t) => {
  const local = abortProbe()
  const remote = abortProbe()
  const calls = []
  const relays = new Map(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].map(hostId => [hostId, {
    entryId: hostId,
    client: {
      state: 'online', handshakeInfo: { serverId: hostId },
      async invoke(namespace, method, args, signal) {
        calls.push([hostId, namespace, method, args])
        if (hostId === 'bbbbbbbb') throw new RelayError('forbidden-method', undefined, 403)
        if (hostId === 'cccccccc') return remote.lookup(args.request, signal)
        const invalidPaths = ['/private/path', 'src/../outside', 'src/line\nbreak', 'src/"quote"', 'x'.repeat(4097)]
        return [
          ...invalidPaths.map(path => ({ path, kind: 'file' })),
          { ...candidates[0], content: 'never forwarded' }, candidates[1],
          ...Array.from({ length: 20 }, (_, i) => ({ path: `src/${i}.txt`, kind: 'file' })),
        ]
      },
    },
  }]))
  const origin = await listenForDraftRequests(t, createNewConversationRoute({
    admit: req => req.headers['x-test-denied'] ? { rejection: 401 } : { peer: {} },
    getPool: () => ({ getByServerId: id => relays.get(id), isVirtual: () => false }),
    getRecentHost: () => 'local', saveRecentHost: () => assert.fail('saved a Host preference'),
    submitLocal: () => assert.fail('submitted a conversation'), onRemoteCreated: () => assert.fail('published a session'),
    listLocalDraftFileCandidates: (input, signal) => {
      calls.push(['local', input])
      return input.query === 'cancel' ? local.lookup(input, signal) : Promise.resolve(candidates)
    },
  }))
  const url = origin + NEW_CONVERSATION_ROUTE
  const post = (hostId, fields = {}, headers, signal) => postDraftLookup(url, { hostId, fileCandidates: draftLookup, ...fields }, headers, signal)
  assert.equal((await post('local', {}, { 'x-test-denied': 'yes' })).status, 401)
  assert.equal((await post('local', {}, { origin: 'https://foreign.test' })).status, 403)
  assert.equal((await post('local', {}, { 'x-zen-remote-via': 'gateway' })).status, 403)
  for (const fields of [{ request }, { fileCandidates: { ...draftLookup, cwd: '/tmp' } }, { fileCandidates: { ...draftLookup, query: 'x'.repeat(4097) } }, { fileCandidates: { ...draftLookup, query: '\0' } }]) {
    assert.equal((await post('local', fields)).status, 400)
  }
  assert.equal((await post('dddddddd')).status, 404)
  assert.deepEqual(calls, [])
  assert.deepEqual(await post('local'), { status: 200, body: { ok: true, value: candidates } })
  assert.deepEqual(await post('aaaaaaaa'), { status: 200, body: { ok: true, value: [
    ...candidates, ...Array.from({ length: 18 }, (_, i) => ({ path: `src/${i}.txt`, kind: 'file' })),
  ] } })
  assert.deepEqual(await post('bbbbbbbb'), { status: 409, body: { ok: false, error: { code: 'draft-file-candidates-unsupported' } } })
  assert.deepEqual(calls, [
    ['local', draftLookup],
    ['aaaaaaaa', 'session', 'draftFileCandidates', { request: draftLookup }],
    ['bbbbbbbb', 'session', 'draftFileCandidates', { request: draftLookup }],
  ])
  for (const [hostId, probe] of [['local', local], ['cccccccc', remote]]) {
    const controller = new AbortController()
    const result = assert.rejects(post(hostId, { fileCandidates: { ...draftLookup, query: 'cancel' } }, {}, controller.signal), { name: 'AbortError' })
    await probe.started
    controller.abort()
    await Promise.all([result, probe.closed])
  }
})

test('the specialized relay lookup checks device authentication and cancels on disconnect', { timeout: 5000 }, async (t) => {
  const { directory, log } = await fixture(t)
  const probe = abortProbe()
  const secret = 'a'.repeat(64)
  const headers = {
    'x-zen-remote-secret': secret, 'x-zen-remote-via': 'gateway',
    'x-zen-remote-role': 'desktop-client', 'x-zen-remote-device': 'device-1',
  }
  const base = {
    secret, store: createShareStore({ file: join(directory, 'shares.json'), idleHours: 48 }),
    serverInfo: { serverId: '0123abcd', serverName: () => 'test', dshVersion: 'test' },
    gateway: { invoke() { assert.fail('forwarded the specialized request to the native gateway') } },
    createWithFirstMessage() { assert.fail('submitted a conversation') },
  }
  const handler = createRelayHandler({ ...base, listDraftFileCandidates: (input, signal) => {
    log.push(input)
    return input.query === 'cancel' ? probe.lookup(input, signal) : Promise.resolve(candidates)
  } })
  const origin = await listenForDraftRequests(t, handler)
  const older = await listenForDraftRequests(t, createRelayHandler(base))
  const invoke = (args = { request: draftLookup }, auth = headers, signal, target = origin) => postDraftLookup(
    `${target}/_dsh/zen-remote/relay/v1/invoke`, { namespace: 'session', method: 'draftFileCandidates', args }, auth, signal,
  )
  assert.equal((await invoke(undefined, { ...headers, 'x-zen-remote-secret': 'wrong' })).status, 401)
  assert.equal((await invoke(undefined, { ...headers, 'x-zen-remote-role': 'browser' })).status, 401)
  assert.equal((await invoke(undefined, { ...headers, 'x-zen-remote-device': '' })).status, 403)
  assert.equal((await invoke({ request: draftLookup, cwd: '/tmp' })).status, 400)
  assert.equal((await invoke({ request: { ...draftLookup, cwd: '/tmp' } })).status, 400)
  assert.deepEqual(await invoke(undefined, headers, undefined, older), { status: 409, body: { ok: false, error: { code: 'draft-file-candidates-unsupported' } } })
  assert.deepEqual(log, [])
  assert.deepEqual(await invoke(), { status: 200, body: { ok: true, value: candidates } })
  assert.deepEqual(log, [draftLookup])
  const controller = new AbortController()
  const result = assert.rejects(invoke({ request: { ...draftLookup, query: 'cancel' } }, headers, controller.signal), { name: 'AbortError' })
  await probe.started
  controller.abort()
  await Promise.all([result, probe.closed])
  assert.deepEqual(await invoke(), { status: 200, body: { ok: true, value: candidates } })
})

test('draft skills use the trusted Core catalog and return only names and scopes', async () => {
  const rows = [
    { name: 'global-skill', scope: 'user', path: '/private', description: 'private description', content: 'private skill' },
    { name: 'project-skill', scope: 'project' }, { name: 'global-skill', scope: 'project' },
    { name: 'a/b', scope: 'user' }, { name: 'builtin', scope: 'bundled' },
  ]
  const ops = []
  const lookup = createDraftSkillCandidates(() => ({ async previewDraft(input, signal) {
    ops.push(input)
    assert.equal(signal.aborted, false)
    if (input.workspaceId === 'unknown') throw Object.assign(new Error('/private'), { code: 'DRAFT_SKILL_INVALID_WORKSPACE' })
    return { skills: rows }
  } }))
  const signal = new AbortController().signal
  assert.deepEqual(await lookup({}, signal), [{ name: 'global-skill', scope: 'user' }])
  assert.deepEqual(await lookup({ workspaceId: 'work', agentPreset: 'standard' }, signal), [
    { name: 'global-skill', scope: 'user' }, { name: 'project-skill', scope: 'project' },
  ])
  await assert.rejects(lookup({ workspaceId: 'unknown' }, signal), { code: 'workspace-not-found', status: 404 })
  await assert.rejects(createDraftSkillCandidates(() => undefined)({}, signal), { code: 'draft-skills-unsupported' })
  assert.deepEqual(ops, [{}, { workspaceId: 'work', agentPreset: 'standard' }, { workspaceId: 'unknown' }])
})

test('draft skill relay requires sharing, filters output, and rechecks disclosure after the lookup', { timeout: 5000 }, async (t) => {
  const { directory } = await fixture(t)
  const store = createShareStore({ file: join(directory, 'skill-shares.json'), idleHours: 48 })
  const secret = 'b'.repeat(64)
  const auth = { 'x-zen-remote-secret': secret, 'x-zen-remote-via': 'gateway',
    'x-zen-remote-role': 'desktop-client', 'x-zen-remote-device': 'device' }
  const calls = []
  const handler = createRelayHandler({ secret, store,
    serverInfo: { serverId: 'aaaaaaaa', serverName: () => 'test', dshVersion: 'test' },
    gateway: { invoke() { assert.fail('forwarded to the native gateway') } },
    async listDraftSkillCandidates(input) {
      calls.push(input)
      if (input.agentPreset === 'revoke') store.unshare('shared', 'manual')
      return [{ name: 'global-skill', scope: 'user', path: '/private' }, { name: 'project-skill', scope: 'project' }]
    },
  })
  const origin = await listenForDraftRequests(t, handler)
  const lookup = (request, headers = auth) => postDraftLookup(origin + '/_dsh/zen-remote/relay/v1/invoke',
    { namespace: 'session', method: 'draftSkillCandidates', args: { request } }, headers)
  assert.equal((await lookup({}, { ...auth, 'x-zen-remote-role': 'browser' })).status, 401)
  assert.equal((await lookup({})).status, 403)
  store.share('shared')
  assert.equal((await lookup({ cwd: '/private' })).status, 400)
  assert.deepEqual(calls, [])
  assert.deepEqual(await lookup({}), { status: 200, body: { ok: true, value: [{ name: 'global-skill', scope: 'user' }] } })
  assert.deepEqual(await lookup({ workspaceId: 'work' }), { status: 200, body: { ok: true, value: [
    { name: 'global-skill', scope: 'user' }, { name: 'project-skill', scope: 'project' },
  ] } })
  assert.equal((await lookup({ agentPreset: 'revoke' })).status, 403)
})

test('draft skill HTTP lookup discards a response from a replaced Host connection', { timeout: 5000 }, async (t) => {
  const input = { workspaceId: 'work', agentPreset: 'standard' }
  const relay = { state: 'online', handshakeInfo: { serverId: 'aaaaaaaa' }, lastHandshakeDigest: 'first',
    subscribe: () => () => {}, async invoke(namespace, method, args) {
      assert.deepEqual([namespace, method, args], ['session', 'draftSkillCandidates', { request: input }])
      relay.lastHandshakeDigest = 'second'
      return [{ name: 'stale-skill', scope: 'user' }]
    },
  }
  const origin = await listenForDraftRequests(t, createNewConversationRoute({
    admit: () => ({}), getPool: () => ({ getByServerId: id => id === 'aaaaaaaa' ? { entryId: id, client: relay } : undefined, isVirtual: () => false }),
    getRecentHost: () => 'local', saveRecentHost: () => assert.fail('saved a Host preference'),
    submitLocal: () => assert.fail('created a conversation'), onRemoteCreated: () => assert.fail('published a session'),
  }))
  const url = origin + NEW_CONVERSATION_ROUTE
  assert.deepEqual(await postDraftLookup(url, { hostId: 'aaaaaaaa', skillCandidates: input }), {
    status: 503, body: { ok: false, error: { code: 'remote-binding-changed' } },
  })
  assert.equal((await postDraftLookup(url, { hostId: 'bbbbbbbb', skillCandidates: input })).status, 404)
  assert.equal((await postDraftLookup(url, { hostId: 'aaaaaaaa', skillCandidates: input, request })).status, 400)
})

test('the relay dispatches an authenticated exact draft lookup without creating a Session', async (t) => {
  const { directory, log } = await fixture(t)
  const secret = 'a'.repeat(64)
  const headers = { 'x-zen-remote-secret': secret, 'x-zen-remote-via': 'gateway',
    'x-zen-remote-role': 'desktop-client', 'x-zen-remote-device': 'device-1' }
  const address = { provider: selection.provider, model: selection.model, workspaceId: request.workspaceId, agentPreset: 'preset-a' }
  const value = { contextWindow: { options: [272000, 500000], value: 500000 } }
  const handler = createRelayHandler({
    secret, store: createShareStore({ file: join(directory, 'shares.json'), idleHours: 48 }),
    serverInfo: { serverId: '0123abcd', serverName: () => 'test', dshVersion: 'test' },
    gateway: { invoke() { assert.fail('must use the dedicated draft read') } },
    describeDraftModelControls: async input => { log.push(input); return value },
    createWithFirstMessage() { assert.fail('lookup cannot create an Agent') },
  })
  const origin = await listenForDraftRequests(t, handler)
  const read = (args = { request: address }, auth = headers) => postDraftLookup(`${origin}/_dsh/zen-remote/relay/v1/invoke`,
    { namespace: 'session', method: 'draftModelControls', args }, auth)
  assert.equal((await read(undefined, { ...headers, 'x-zen-remote-role': 'browser' })).status, 401)
  assert.equal((await read(undefined, { ...headers, 'x-zen-remote-device': '' })).status, 403)
  assert.equal((await read({ request: { ...address, sessionId: 'unexpected' } })).status, 400)
  assert.equal((await read({ request: address, modelControls: { speed: 'fast' } })).status, 400)
  assert.deepEqual(log, [])
  assert.deepEqual(await read(), { status: 200, body: { ok: true, value } })
  assert.deepEqual(log, [address])
})

test('updates just the current profile row preference through the config editor', async () => {
  const { saveRecentConversationHost } = await modulePromise
  const entry = {}
  const ctx = { fiber: { entry }, reflect: { get: (name) => {
    assert.equal(name, 'configEditor')
    return { edit: async (actual, update) => {
      assert.equal(actual, entry)
      assert.deepEqual(update({ role: 'peer', recentConversationHost: 'local' }), { role: 'peer', recentConversationHost: '0123abcd' })
    } }
  } } }
  await saveRecentConversationHost(ctx, '0123abcd')
  await assert.rejects(saveRecentConversationHost(ctx, 'invalid'), /Invalid recent/)
  await assert.rejects(saveRecentConversationHost({ fiber: {} }, 'local'), /cannot be saved/)
})
