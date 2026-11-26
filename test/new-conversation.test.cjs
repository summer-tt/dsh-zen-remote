const assert = require('node:assert/strict')
const { mkdir, mkdtemp, readdir, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { createRelayHandler } = require('../lib/relay-server.js')
const { createShareStore } = require('../lib/share-store.js')
const { encodeSessionReferenceUri } = require('../lib/session-reference.js')

const modulePromise = import('../lib/new-conversation/index.js')
const selection = { provider: 'test', model: 'picked', reasoningEffort: 'high' }
const request = {
  workspaceId: 'workspace-1', creationRequestId: 'create-1', requestId: 'prompt-1',
  model: selection, text: '  First message  ',
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
  const created = await invoke(request)
  assert.equal(created.status, 200)
  assert.equal(store.isShared(created.body.value.sessionId), true)
  assert.deepEqual(await invoke(request), created)
  assert.equal(store.unshare(created.body.value.sessionId, 'manual'), true)
  store = createShareStore({ file: shareFile, idleHours: 48 })
  host = newHost()
  handler = createHandler()
  assert.equal((await invoke(request)).status, 409)
  assert.equal(store.isShared(created.body.value.sessionId), false)
  assert.equal(log.filter(event => event[0] === 'prompt').length, 1)
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
