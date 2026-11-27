/**
 * Target controller and draft store for the plugin-first new-conversation
 * panel. Drives src/client/new-conversation/{target,draft-store}.ts directly
 * under Node's type stripping: both are browser-import-free by design.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DraftTarget,
  HOSTS_LOCAL_ONLY,
  LOCAL_HOST,
  draftKey,
  hostSelectable,
  isBareModelCommand,
  pastedImages,
  submitActivation,
  submitBlockOf,
} from '../src/client/new-conversation/target.ts'
import { createDraftStore } from '../src/client/new-conversation/draft-store.ts'
import { createDraftImageStore } from '../src/client/new-conversation/draft-images.ts'
import { MAX_DRAFT_IMAGE_BYTES } from '../src/upload-limits.ts'
import { registerNewConversation } from '../src/client/new-conversation/register.ts'

/** An in-memory localStorage stand-in recording every call. */
function memoryStorage() {
  const map = new Map()
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
  }
}

/** A roster source whose snapshot tests move by hand. */
function roster(initial = { phase: 'pending' }) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    listeners,
  }
}

/** A preference whose reads and writes tests settle by hand. */
function preference(initial = 'local') {
  let value = initial
  const writes = []
  const pendingReads = []
  const pendingWrites = []
  return {
    writes,
    pendingReads,
    pendingWrites,
    hostPreference: {
      readLastHost: () => new Promise((resolve, reject) => pendingReads.push({ resolve, reject })),
      saveLastHost: (hostId) => {
        writes.push(hostId)
        return new Promise((resolve, reject) => pendingWrites.push({ resolve, reject, hostId }))
      },
    },
    get value() { return value },
    set value(next) { value = next },
  }
}

/** Flush microtasks so an awaited preference read lands before assertions. */
const settled = () => new Promise((resolve) => setImmediate(resolve))

const HOST_A = { hostId: 'aaaaaaaa', label: 'Host A', status: 'paired' }
const HOST_B = { hostId: 'bbbbbbbb', label: 'Host B', status: 'offline' }
const HOST_X = { hostId: 'xxxxxxxx', label: 'Host X', status: 'unpaired' }
const ready = (...hosts) => ({ phase: 'ready', hosts })

// ------------------------------------------------------------- bare /model

test('isBareModelCommand: only the bare command, whitespace-tolerant, never an argument form', () => {
  // Bare: opens the picker before any validation.
  assert.equal(isBareModelCommand('/model'), true)
  assert.equal(isBareModelCommand('  /model  '), true)
  assert.equal(isBareModelCommand('\n/model\t'), true)
  // Not bare: a command with arguments is left to its own dispatch, and is never a picker open.
  assert.equal(isBareModelCommand('/model gpt'), false)
  assert.equal(isBareModelCommand('/model --reasoning high'), false)
  // Other commands and ordinary text are not intercepted.
  assert.equal(isBareModelCommand('/models'), false)
  assert.equal(isBareModelCommand('/help'), false)
  assert.equal(isBareModelCommand('/'), false)
  assert.equal(isBareModelCommand(''), false)
  assert.equal(isBareModelCommand('   '), false)
  // The command embedded in a message is a message, not a bare invocation.
  assert.equal(isBareModelCommand('please run /model'), false)
  assert.equal(isBareModelCommand('use /model to switch'), false)
  // Case is significant: the registered command is lowercase, as in the native composer.
  assert.equal(isBareModelCommand('/Model'), false)
  assert.equal(isBareModelCommand('/MODEL'), false)
})

// ------------------------------------------------------- submit gate + activation

/** A complete, submittable gate input; tests override one member to isolate a gate. */
function readyGate(overrides = {}) {
  return {
    directory: ready(HOST_A),
    hostId: HOST_A.hostId,
    workspaceId: 'w1',
    text: 'hello',
    hasSelection: true,
    pendingSubmission: false,
    ...overrides,
  }
}

test('submitBlockOf: a complete input may send; each missing prerequisite blocks with its own reason', () => {
  assert.equal(submitBlockOf(readyGate()), undefined)
  assert.equal(submitBlockOf(readyGate({ directory: { phase: 'pending' } })), 'pick-host')
  assert.equal(submitBlockOf(readyGate({ directory: { phase: 'error', message: 'x' } })), 'pick-host')
  assert.equal(submitBlockOf(readyGate({ workspaceId: undefined })), 'pick-workspace')
  assert.equal(submitBlockOf(readyGate({ text: '   ' })), 'write-message')
  assert.equal(submitBlockOf(readyGate({ hasSelection: false })), 'pick-model')
  assert.equal(submitBlockOf(readyGate({ directory: ready(HOST_B), hostId: HOST_B.hostId })), 'host-offline')
})

test('submitBlockOf: gates apply in the order a user meets the prerequisites', () => {
  // Several things are missing at once; the earliest prerequisite wins.
  assert.equal(submitBlockOf(readyGate({ directory: { phase: 'pending' }, workspaceId: undefined, text: '', hasSelection: false })), 'pick-host')
  assert.equal(submitBlockOf(readyGate({ workspaceId: undefined, text: '', hasSelection: false })), 'pick-workspace')
  assert.equal(submitBlockOf(readyGate({ text: '', hasSelection: false })), 'write-message')
  assert.equal(submitBlockOf(readyGate({ hasSelection: false, directory: ready(HOST_B), hostId: HOST_B.hostId })), 'pick-model')
})

test('submitBlockOf: the local Host is never offline and an unpaired Host is not reachable through the gate', () => {
  // local is not in the roster, so it has no status and cannot read as offline.
  assert.equal(submitBlockOf(readyGate({ hostId: LOCAL_HOST })), undefined)
})

test('submitBlockOf: a pending submission is never blocked — it resumes the frozen request, not the draft', () => {
  // Every gate would block, and none applies: the resumed request carries its own target, text and model.
  assert.equal(submitBlockOf(readyGate({
    pendingSubmission: true,
    directory: { phase: 'pending' },
    workspaceId: undefined,
    text: '',
    hasSelection: false,
  })), undefined)
})

test('submitActivation: bare /model comes before EVERYTHING, including a pending resume and every gate', () => {
  // A bare /model opens the picker even with nothing else in place…
  assert.equal(submitActivation('/model', readyGate({
    directory: { phase: 'pending' }, workspaceId: undefined, text: '', hasSelection: false,
  })), 'open-model-picker')
  // …and even while a previous request is pending, so the command is never swallowed by a resume.
  assert.equal(submitActivation('  /model ', readyGate({ pendingSubmission: true })), 'open-model-picker')
  // /model with arguments is NOT bare: it falls through to the ordinary decision.
  assert.equal(submitActivation('/model gpt', readyGate()), 'send')
  assert.equal(submitActivation('/model gpt', readyGate({ pendingSubmission: true })), 'resume')
})

test('submitActivation: a pending submission resumes ahead of the gates, bare /model excepted', () => {
  assert.equal(submitActivation('anything', readyGate({ pendingSubmission: true, hasSelection: false, text: '' })), 'resume')
  assert.equal(submitActivation('anything', readyGate({ pendingSubmission: true, workspaceId: undefined })), 'resume')
})

test('submitActivation: with nothing pending it sends only when unblocked, otherwise it is blocked', () => {
  assert.equal(submitActivation('hello', readyGate()), 'send')
  assert.equal(submitActivation('hello', readyGate({ hasSelection: false })), 'blocked')
  assert.equal(submitActivation('hello', readyGate({ workspaceId: undefined })), 'blocked')
  // The gate reads the draft from `input.text`, not the command argument: an
  // empty draft blocks as "write a message", it does not fall through.
  assert.equal(submitActivation('', readyGate({ text: '' })), 'blocked')
  assert.equal(submitBlockOf(readyGate({ text: '' })), 'write-message')
})

test('clipboard intake leaves ordinary text alone and takes each pasted image only once', () => {
  const png = new File(['image'], 'image.png', { type: 'image/png' })
  const text = new File(['text'], 'note.txt', { type: 'text/plain' })
  const item = { kind: 'file', getAsFile: () => png }
  assert.deepEqual(pastedImages({ files: [], items: [{ kind: 'string', getAsFile: () => assert.fail('read text as a file') }] }), [])
  assert.deepEqual(pastedImages({ files: [text, png], items: [item] }), [png])
  assert.deepEqual(pastedImages({ files: [], items: [item] }), [png])
})

test('draft image previews stay on the selected Host and Workspace and release their object URLs', () => {
  const created = []
  const revoked = []
  const images = createDraftImageStore({
    createObjectURL(file) { created.push(file.name); return `blob:${file.name}` },
    revokeObjectURL(url) { revoked.push(url) },
  })
  const local = { hostId: 'local', workspaceId: undefined, generation: 1 }
  const remote = { hostId: HOST_A.hostId, workspaceId: 'w1', generation: 2 }
  const workspace = { ...local, workspaceId: 'w1', generation: 3 }
  const key = ({ hostId, workspaceId }) => draftKey(hostId, workspaceId)
  const png = new File([new Uint8Array([1, 2, 3])], 'clipboard.png', { type: 'image/png' })
  assert.equal(images.add(local, 1, [png]), undefined)
  const [screenshot] = images.read(key(local))
  assert.equal(screenshot.url, 'blob:clipboard.png')
  assert.deepEqual(images.read(key(remote)), [])
  assert.equal(images.add(remote, 1, [png]), undefined)
  assert.deepEqual(images.read(key(remote)), [])
  images.adopt(local.hostId, workspace.workspaceId)
  assert.equal(images.read(key(workspace))[0], screenshot)
  assert.deepEqual(images.read(key(local)), [])
  images.remove(workspace, 2, screenshot.id)
  assert.equal(images.read(key(workspace)).length, 1)
  images.remove(workspace, 3, screenshot.id)
  assert.deepEqual(images.read(key(workspace)), [])
  assert.deepEqual(revoked, ['blob:clipboard.png'])
  images.adopt(local.hostId, 'w2')
  assert.deepEqual(images.read(draftKey(local.hostId, 'w2')), [])
  assert.deepEqual(created, ['clipboard.png'])
})

test('pasting skips empty, oversized and unsupported images, and rejected sends leave previews intact', () => {
  const images = createDraftImageStore({ createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} })
  const target = { hostId: HOST_A.hostId, workspaceId: 'w1', generation: 1 }
  const key = draftKey(target.hostId, target.workspaceId)
  assert.equal(images.add(target, 1, [new File(['svg'], 'clip.svg', { type: 'image/svg+xml' })]), 'unsupported')
  assert.equal(images.add(target, 1, [new File([], 'empty.png', { type: 'image/png' })]), 'empty')
  const png = new File(['image'], 'clip.png', { type: 'image/png' })
  assert.equal(images.add(target, 1, [png]), undefined)
  const [preview] = images.read(key)
  const frozen = [preview.id]
  assert.equal(images.add(target, 1, [new File([new Uint8Array(MAX_DRAFT_IMAGE_BYTES)], 'large.png', { type: 'image/png' })]), 'limit')
  assert.equal(images.matches(key, frozen), true)
  assert.equal(images.read(key)[0], preview)
  assert.equal(images.add(target, 1, [png]), undefined)
  assert.equal(images.matches(key, frozen), false)
  assert.equal(images.read(key)[0], preview)
  images.clearSent(key, frozen)
  assert.equal(images.read(key).length, 1)
  assert.notEqual(images.read(key)[0].id, preview.id)
  images.dispose()
})

test('image-only drafts can send and only image drafts require remote image support', () => {
  const imageOnly = readyGate({ text: '', hasImages: true })
  assert.equal(submitActivation('', imageOnly), 'send')
  assert.equal(submitBlockOf({ ...imageOnly, imagesUnavailable: true }), 'images-unsupported')
  assert.equal(submitBlockOf(readyGate({ imagesUnavailable: true })), undefined)
  assert.equal(submitActivation('', { ...imageOnly, imagesUnavailable: true, pendingSubmission: true }), 'resume')
  assert.equal(submitActivation('/model', { ...imageOnly, text: '/model' }), 'open-model-picker')
})

// ---------------------------------------------------------------- target keys

test('draftKey: JSON tuple, distinct for Host-only vs Workspace, no separator collisions', () => {
  assert.equal(draftKey('local', undefined), '["host","local"]')
  assert.equal(draftKey('aaaaaaaa', 'w1'), '["host","aaaaaaaa","workspace","w1"]')
  // A Host id containing the separator-ish text cannot collide with another pair.
  assert.notEqual(draftKey('a", "workspace", "b', undefined), draftKey('a', 'b'))
  assert.notEqual(draftKey('aaaaaaaa', undefined), draftKey('aaaaaaaa', ''))
})

test('hostSelectable: local always; paired and offline yes; unpaired, absent, and non-ready rosters no', () => {
  const snapshot = ready(HOST_A, HOST_B, HOST_X)
  assert.equal(hostSelectable(snapshot, LOCAL_HOST), true)
  assert.equal(hostSelectable(snapshot, HOST_A.hostId), true)
  assert.equal(hostSelectable(snapshot, HOST_B.hostId), true)
  assert.equal(hostSelectable(snapshot, HOST_X.hostId), false)
  assert.equal(hostSelectable(snapshot, 'zzzzzzzz'), false)
  assert.equal(hostSelectable({ phase: 'pending' }, HOST_A.hostId), false)
  assert.equal(hostSelectable({ phase: 'error', message: 'x' }, HOST_A.hostId), false)
  assert.equal(hostSelectable(HOSTS_LOCAL_ONLY, LOCAL_HOST), true)
  assert.equal(hostSelectable(HOSTS_LOCAL_ONLY, HOST_A.hostId), false)
})

// --------------------------------------------------------- preselection logic

test('first use with no stored preference selects local, resolving then ready', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  assert.equal(target.state.getSnapshot().phase, 'resolving')
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  pref.pendingReads[0].resolve('local')
  await settled()
  assert.equal(target.state.getSnapshot().phase, 'ready')
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
})

test('stored preference names a paired Host once the roster confirms it', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
})

test('roster still pending keeps the preference decision open; a late confirming roster selects the stored Host', async () => {
  const pref = preference()
  const directory = roster()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  // Phase is ready (the preference was read) but no Host is confirmed yet: local stays.
  assert.equal(target.state.getSnapshot().phase, 'ready')
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
  const before = target.state.getSnapshot().generation
  directory.set(ready(HOST_A))
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  assert.equal(target.state.getSnapshot().generation, before + 1)
})

test('stored Host unpaired: preselect local with reason, and do not call it a roster failure', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_X))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_X.hostId)
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(state.defaultHostReason, 'unpaired')
})

test('stored Host absent from a ready roster reads as unpaired', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_X.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().defaultHostReason, 'unpaired')
})

test('roster in error with a non-local stored Host: local with directoryError, never a false unpaired', async () => {
  const pref = preference()
  const directory = roster({ phase: 'error', message: 'unreachable' })
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(state.defaultHostReason, 'directoryError')
})

test('preference read fails: local preselected, phase ready, store untouched, no reason claimed', async () => {
  const warnings = []
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference, (...args) => warnings.push(args))
  pref.pendingReads[0].reject(new Error('500'))
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.phase, 'ready')
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(state.defaultHostReason, undefined)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0], 'last Host preference read failed:')
})

// --------------------------------------------------------------- user choices

test('selectHost moves to a selectable Host, drops the Workspace, bumps both generations', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(roster(ready(HOST_A, HOST_B)))
  pref.pendingReads[0].resolve('local')
  await settled()
  target.selectWorkspace('w-local')
  const before = target.state.getSnapshot()
  target.selectHost(HOST_B.hostId)
  const after = target.state.getSnapshot()
  assert.equal(after.hostId, HOST_B.hostId)
  assert.equal(after.workspaceId, undefined)
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.catalogGeneration, before.catalogGeneration + 1)
})

test('selectHost refuses an unpaired, an unknown, and a not-yet-listed Host without moving the target', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_X))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve('local')
  await settled()
  const before = target.state.getSnapshot()
  target.selectHost(HOST_X.hostId)
  target.selectHost('zzzzzzzz')
  directory.set({ phase: 'pending' })
  target.selectHost(HOST_A.hostId)
  assert.equal(target.state.getSnapshot(), before)
})

test('an offline Host stays selectable so the user can retry it', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(roster(ready(HOST_B)))
  pref.pendingReads[0].resolve('local')
  await settled()
  target.selectHost(HOST_B.hostId)
  assert.equal(target.state.getSnapshot().hostId, HOST_B.hostId)
})

test('selectWorkspace keeps the Host and bumps only the target generation', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(roster(ready(HOST_A)))
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  const before = target.state.getSnapshot()
  target.selectWorkspace('w-remote')
  const after = target.state.getSnapshot()
  assert.equal(after.hostId, HOST_A.hostId)
  assert.equal(after.workspaceId, 'w-remote')
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.catalogGeneration, before.catalogGeneration)
})

test('re-selecting the current target is a no-op: same snapshot reference', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(roster(ready(HOST_A)))
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  const before = target.state.getSnapshot()
  target.selectHost(HOST_A.hostId)
  target.selectWorkspace(undefined)
  assert.equal(target.state.getSnapshot(), before)
})

test('a user-selected Host is not overridden by the stored preference, even after the roster changes', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_B))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  target.selectHost(HOST_B.hostId)
  assert.equal(target.state.getSnapshot().hostId, HOST_B.hostId)
  // A roster refresh that still confirms the stored Host must not pull the target back.
  directory.set(ready(HOST_A, HOST_B))
  assert.equal(target.state.getSnapshot().hostId, HOST_B.hostId)
})

test('the roster revoking the user-selected Host moves it to local with the unpaired reason', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_B))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve('local')
  await settled()
  target.selectHost(HOST_B.hostId)
  target.selectWorkspace('w-b')
  directory.set(ready(HOST_A, { ...HOST_B, status: 'unpaired' }))
  const state = target.state.getSnapshot()
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(state.workspaceId, undefined)
  assert.equal(state.defaultHostReason, 'unpaired')
})

test('the stored Host becoming unpaired after it was selected moves to local; re-pairing takes it back', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  directory.set(ready({ ...HOST_A, status: 'unpaired' }))
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  assert.equal(target.state.getSnapshot().defaultHostReason, 'unpaired')
  directory.set(ready(HOST_A))
  const restored = target.state.getSnapshot()
  assert.equal(restored.hostId, HOST_A.hostId)
  assert.equal(restored.defaultHostReason, undefined)
})

test('a roster drop to error does not evict a selectable Host as if unpaired', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  directory.set({ phase: 'error', message: 'offline' })
  // Error names no decision: the selected Host stays, so an open draft is not relocated.
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
})

test('a roster drop to pending does not evict a selectable Host either', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  const before = target.state.getSnapshot()
  directory.set({ phase: 'pending' })
  assert.equal(target.state.getSnapshot(), before)
})

test('a local stand-in whose roster errors carries directoryError, and a recovering roster resolves the stored Host', async () => {
  const pref = preference()
  const directory = roster({ phase: 'error', message: 'down' })
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  let state = target.state.getSnapshot()
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(state.defaultHostReason, 'directoryError')
  // Still error: no repeated publication.
  directory.set({ phase: 'error', message: 'still down' })
  assert.equal(target.state.getSnapshot(), state)
  directory.set(ready(HOST_A))
  state = target.state.getSnapshot()
  assert.equal(state.hostId, HOST_A.hostId)
  assert.equal(state.defaultHostReason, undefined)
})

test('a local stand-in withdraws its reason while the roster is pending, then re-applies the roster decision', async () => {
  const pref = preference()
  const directory = roster({ phase: 'error', message: 'down' })
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().defaultHostReason, 'directoryError')
  directory.set({ phase: 'pending' })
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
  directory.set(ready(HOST_X))
  assert.equal(target.state.getSnapshot().defaultHostReason, 'unpaired')
  // The stored Host was ruled out for good; it does not come back while it stays unpaired.
  directory.set({ phase: 'pending' })
  assert.equal(target.state.getSnapshot().defaultHostReason, undefined)
})

test('after the roster revokes the selected Host, re-pairing it takes it back only if it is the stored Host', async () => {
  // User-selected (not the stored one): once revoked, a re-pair does not resurrect the user's choice.
  const prefUser = preference()
  const directoryUser = roster(ready(HOST_A, HOST_B))
  const userTarget = new DraftTarget(prefUser.hostPreference)
  userTarget.registerHostDirectory(directoryUser)
  prefUser.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  userTarget.selectHost(HOST_B.hostId)
  directoryUser.set(ready(HOST_A, { ...HOST_B, status: 'unpaired' }))
  assert.equal(userTarget.state.getSnapshot().hostId, LOCAL_HOST)
  directoryUser.set(ready(HOST_A, HOST_B))
  // The stored Host A is confirmed again, so the stand-in resolves to A — not back to the user's revoked B.
  assert.equal(userTarget.state.getSnapshot().hostId, HOST_A.hostId)
})

test('a stored local preference stays local regardless of the roster', async () => {
  const pref = preference()
  const directory = roster({ phase: 'error', message: 'down' })
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve(LOCAL_HOST)
  await settled()
  const before = target.state.getSnapshot()
  assert.equal(before.hostId, LOCAL_HOST)
  assert.equal(before.defaultHostReason, undefined)
  directory.set(ready(HOST_A))
  directory.set({ phase: 'error', message: 'down again' })
  assert.equal(target.state.getSnapshot(), before)
})

test('connectionReset bumps only catalogGeneration', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  pref.pendingReads[0].resolve('local')
  await settled()
  const before = target.state.getSnapshot()
  target.connectionReset()
  const after = target.state.getSnapshot()
  assert.equal(after.catalogGeneration, before.catalogGeneration + 1)
  assert.equal(after.generation, before.generation)
})

test('state keeps one reference between changes and notifies subscribers once per move', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(roster(ready(HOST_A)))
  pref.pendingReads[0].resolve('local')
  await settled()
  let notified = 0
  const unsubscribe = target.state.subscribe(() => { notified += 1 })
  const before = target.state.getSnapshot()
  target.selectHost(HOST_A.hostId)
  assert.equal(notified, 1)
  assert.notEqual(target.state.getSnapshot(), before)
  target.selectHost(HOST_A.hostId)
  assert.equal(notified, 1)
  unsubscribe()
  target.selectHost(LOCAL_HOST)
  assert.equal(notified, 1)
})

// ---------------------------------------------- resetToPreferredHost (generic New Conversation)

test('resetToPreferredHost re-reads the preference, so a Host remembered after a creation is picked up', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_B))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve('local')
  await settled()
  target.selectHost(HOST_B.hostId)
  target.selectWorkspace('w-b')
  assert.equal(target.state.getSnapshot().hostId, HOST_B.hostId)
  // A Session was created on A meanwhile, so the remembered Host moved to A.
  target.resetToPreferredHost()
  const resolving = target.state.getSnapshot()
  assert.equal(resolving.phase, 'resolving')
  assert.equal(resolving.workspaceId, undefined)
  assert.equal(resolving.hostId, HOST_B.hostId, 'the Host is not guessed before the read answers')
  pref.pendingReads[1].resolve(HOST_A.hostId)
  await settled()
  const after = target.state.getSnapshot()
  assert.equal(after.phase, 'ready')
  assert.equal(after.hostId, HOST_A.hostId)
  assert.equal(after.workspaceId, undefined)
})

test('resetToPreferredHost drops a stale preference read: the latest reset wins', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_B))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  // Two resets while the first read is still in flight.
  target.resetToPreferredHost()
  target.resetToPreferredHost()
  assert.equal(pref.pendingReads.length, 3)
  // The FIRST read answers last with B; it is stale and must publish nothing.
  pref.pendingReads[2].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  pref.pendingReads[1].resolve(HOST_B.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId, 'a superseded read must not move the target')
  pref.pendingReads[0].resolve('local')
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  assert.equal(target.state.getSnapshot().phase, 'ready')
})

test('resetToPreferredHost: a stale read that FAILS late does not demote a good resolution to local', async () => {
  // The case reconcile cannot repair: a failed read records "preference
  // unknown", which stops reconcile, so only the read token protects the
  // already-resolved Host. The stale read must still be UNSETTLED when the
  // newer one answers — a promise settles once, so an earlier-settled read
  // cannot fail afterwards.
  const warnings = []
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference, (...args) => warnings.push(args))
  target.registerHostDirectory(directory)
  // The constructor's read (0) stays in flight; a reset starts read 1.
  target.resetToPreferredHost()
  pref.pendingReads[1].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  assert.equal(target.state.getSnapshot().phase, 'ready')
  // Now the original read fails, late.
  pref.pendingReads[0].reject(new Error('late failure'))
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.hostId, HOST_A.hostId, 'a superseded failure must not demote the resolved Host')
  assert.equal(state.phase, 'ready')
  assert.equal(warnings.length, 0, 'a superseded failure is not reported either')
})

test('resetToPreferredHost: a stale read that RESOLVES late does not overwrite a newer failure either', async () => {
  // The mirror case: the newer read fails (so `local` is the honest answer),
  // and an older read then resolves with a real Host. That Host is stale.
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  target.resetToPreferredHost()
  pref.pendingReads[1].reject(new Error('down'))
  await settled()
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST, 'a superseded success must not replace the newer failure')
})

test('resetToPreferredHost: a manual Workspace click during the read is not undone by the read', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A, HOST_B))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve('local')
  await settled()
  target.selectHost(HOST_A.hostId)
  target.resetToPreferredHost()
  // The user picks a Workspace on the still-shown Host before the read answers.
  target.selectWorkspace('w-a')
  assert.equal(target.state.getSnapshot().workspaceId, 'w-a')
  // The preference meanwhile says B. It must not relocate the target off the user's pick.
  pref.pendingReads[1].resolve(HOST_B.hostId)
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.phase, 'ready', 'the read still ends the resolving phase')
  assert.equal(state.hostId, HOST_A.hostId)
  assert.equal(state.workspaceId, 'w-a')
})

test('resetToPreferredHost: a read that fails lands on local with the phase ready', async () => {
  const warnings = []
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference, (...args) => warnings.push(args))
  target.registerHostDirectory(roster(ready(HOST_A)))
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
  target.resetToPreferredHost()
  pref.pendingReads[1].reject(new Error('500'))
  await settled()
  const state = target.state.getSnapshot()
  assert.equal(state.phase, 'ready')
  assert.equal(state.hostId, LOCAL_HOST)
  assert.equal(warnings.length, 1)
})

test('resetToPreferredHost after a failed initial read re-reads and can recover the stored Host', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].reject(new Error('down'))
  await settled()
  assert.equal(target.state.getSnapshot().hostId, LOCAL_HOST)
  target.resetToPreferredHost()
  pref.pendingReads[1].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().hostId, HOST_A.hostId)
})

test('resetToPreferredHost is a no-op after disposal and starts no read', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  pref.pendingReads[0].resolve('local')
  await settled()
  const before = target.state.getSnapshot()
  target.dispose()
  const reads = pref.pendingReads.length
  target.resetToPreferredHost()
  assert.equal(pref.pendingReads.length, reads)
  assert.equal(target.state.getSnapshot(), before)
})

test('resetToPreferredHost keeps the target generation when no Workspace was selected, bumps it otherwise', async () => {
  const prefA = preference()
  const a = new DraftTarget(prefA.hostPreference)
  a.registerHostDirectory(roster(ready(HOST_A)))
  prefA.pendingReads[0].resolve('local')
  await settled()
  const genA = a.state.getSnapshot().generation
  a.resetToPreferredHost()
  assert.equal(a.state.getSnapshot().generation, genA, 'nothing moved, so the draft is not re-keyed')

  const prefB = preference()
  const b = new DraftTarget(prefB.hostPreference)
  b.registerHostDirectory(roster(ready(HOST_A)))
  prefB.pendingReads[0].resolve('local')
  await settled()
  b.selectWorkspace('w1')
  const genB = b.state.getSnapshot().generation
  b.resetToPreferredHost()
  assert.equal(b.state.getSnapshot().generation, genB + 1, 'the Workspace was dropped, a real move')
})

// ------------------------------------------------------------------ preference

test('confirmCreated writes the Host once the creation is confirmed', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  const done = target.confirmCreated(HOST_A.hostId)
  assert.deepEqual(pref.writes, [HOST_A.hostId])
  pref.pendingWrites[0].resolve()
  await done
})

test('a failed preference write is reported, stays pending, and the next confirmation retries it first', async () => {
  const warnings = []
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference, (...args) => warnings.push(args))
  const first = target.confirmCreated(HOST_A.hostId)
  pref.pendingWrites[0].reject(new Error('503'))
  await first
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0], 'last Host preference write failed:')
  const second = target.confirmCreated(HOST_B.hostId)
  assert.deepEqual(pref.writes, [HOST_A.hostId, HOST_B.hostId])
  pref.pendingWrites[1].resolve()
  await second
})

test('dispose stops publication: later selections and roster changes move nothing', async () => {
  const pref = preference()
  const directory = roster(ready(HOST_A))
  const target = new DraftTarget(pref.hostPreference)
  target.registerHostDirectory(directory)
  pref.pendingReads[0].resolve('local')
  await settled()
  const before = target.state.getSnapshot()
  target.dispose()
  target.selectHost(HOST_A.hostId)
  directory.set(ready(HOST_X))
  assert.equal(target.state.getSnapshot(), before)
})

test('a preference read that settles after disposal publishes nothing', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  target.dispose()
  pref.pendingReads[0].resolve(HOST_A.hostId)
  await settled()
  assert.equal(target.state.getSnapshot().phase, 'resolving')
})

test('disposing the roster registration restores the local-only answer', async () => {
  const pref = preference()
  const target = new DraftTarget(pref.hostPreference)
  const dispose = target.registerHostDirectory(roster(ready(HOST_A)))
  assert.equal(target.directory().phase, 'ready')
  assert.deepEqual(target.directory().hosts, [HOST_A])
  dispose()
  assert.equal(target.directory(), HOSTS_LOCAL_ONLY)
})

// ----------------------------------------------------------------- draft store

test('draft store: write, read back, and an empty write removes the record', () => {
  const storage = memoryStorage()
  const drafts = createDraftStore(storage)
  assert.equal(drafts.read('aaaaaaaa', undefined), '')
  drafts.write('aaaaaaaa', undefined, 'hello')
  assert.equal(drafts.read('aaaaaaaa', undefined), 'hello')
  drafts.write('aaaaaaaa', undefined, '')
  assert.equal(drafts.read('aaaaaaaa', undefined), '')
  assert.equal(storage.map.size, 0)
})

test('draft store: Host-only and Workspace drafts are independent records per Host', () => {
  const drafts = createDraftStore(memoryStorage())
  drafts.write('aaaaaaaa', undefined, 'host A text')
  drafts.write('aaaaaaaa', 'w1', 'A/w1 text')
  drafts.write('bbbbbbbb', 'w1', 'B/w1 text')
  drafts.write(LOCAL_HOST, undefined, 'local text')
  assert.equal(drafts.read('aaaaaaaa', undefined), 'host A text')
  assert.equal(drafts.read('aaaaaaaa', 'w1'), 'A/w1 text')
  assert.equal(drafts.read('bbbbbbbb', 'w1'), 'B/w1 text')
  assert.equal(drafts.read(LOCAL_HOST, undefined), 'local text')
  assert.equal(drafts.read(LOCAL_HOST, 'w1'), '')
})

test('draft store: adoptHostDraft copies Host text into an EMPTY Workspace draft and keeps the Host record', () => {
  const drafts = createDraftStore(memoryStorage())
  drafts.write(HOST_A.hostId, undefined, 'typed before choosing')
  const adopted = drafts.adoptHostDraft(HOST_A.hostId, 'w1')
  assert.equal(adopted, 'typed before choosing')
  assert.equal(drafts.read(HOST_A.hostId, 'w1'), 'typed before choosing')
  assert.equal(drafts.read(HOST_A.hostId, undefined), 'typed before choosing')
})

test('draft store: an existing Workspace draft wins over the Host draft', () => {
  const drafts = createDraftStore(memoryStorage())
  drafts.write(HOST_A.hostId, undefined, 'host text')
  drafts.write(HOST_A.hostId, 'w1', 'existing workspace text')
  const adopted = drafts.adoptHostDraft(HOST_A.hostId, 'w1')
  assert.equal(adopted, 'existing workspace text')
  assert.equal(drafts.read(HOST_A.hostId, 'w1'), 'existing workspace text')
  assert.equal(drafts.read(HOST_A.hostId, undefined), 'host text')
})

test('draft store: no Host text leaves the Workspace draft untouched', () => {
  const drafts = createDraftStore(memoryStorage())
  assert.equal(drafts.adoptHostDraft(HOST_A.hostId, 'w1'), '')
  assert.equal(drafts.read(HOST_A.hostId, 'w1'), '')
})

test('draft store: clear drops exactly one record', () => {
  const drafts = createDraftStore(memoryStorage())
  drafts.write(HOST_A.hostId, undefined, 'host')
  drafts.write(HOST_A.hostId, 'w1', 'workspace')
  drafts.clear(HOST_A.hostId, undefined)
  assert.equal(drafts.read(HOST_A.hostId, undefined), '')
  assert.equal(drafts.read(HOST_A.hostId, 'w1'), 'workspace')
})

test('draft store: the earlier plain-string form and malformed values', () => {
  const storage = memoryStorage()
  const drafts = createDraftStore(storage)
  storage.map.set('dsh.zen.newConversation.' + draftKey('aaaaaaaa', undefined), JSON.stringify('legacy text'))
  storage.map.set('dsh.zen.newConversation.' + draftKey('aaaaaaaa', 'w1'), '{not json')
  storage.map.set('dsh.zen.newConversation.' + draftKey('aaaaaaaa', 'w2'), JSON.stringify({ text: 7 }))
  assert.equal(drafts.read('aaaaaaaa', undefined), 'legacy text')
  assert.equal(drafts.read('aaaaaaaa', 'w1'), '')
  assert.equal(drafts.read('aaaaaaaa', 'w2'), '')
})

// ------------------------------------------------------- registration (register.ts)

/** The minimal `document`/`ctx` the registration touches, recording every call in order. */
function registrationBench(overrides = {}) {
  const calls = []
  const styles = []
  const registrations = new Map()
  const injected = []
  globalThis.document = {
    createElement: () => ({ dataset: {}, set textContent(value) { this._text = value }, get textContent() { return this._text } }),
    head: { appendChild: (node) => { styles.push(node) } },
  }
  const ctx = {
    effect: (factory) => { const dispose = factory(); return dispose },
    layout: { selectPanel: (id) => { calls.push(['selectPanel', id]) } },
    slots: {
      register: (options, component) => {
        const key = `${options.name}:${options.key ?? options.id ?? ''}`
        registrations.set(key, { options, component })
        return () => {}
      },
      inject: (name, factory) => { injected.push([name, factory]); return () => {} },
    },
  }
  const panel = () => null
  const trigger = () => null
  const registration = {
    view: { getSnapshot: () => ({}), subscribe: () => () => {} },
    actions: {},
    enabled: { getSnapshot: () => true, subscribe: () => () => {} },
    label: { getSnapshot: () => 'New', subscribe: () => () => {} },
    ...overrides,
  }
  registerNewConversation(ctx, panel, trigger, registration)
  return { calls, styles, registrations, injected, registration }
}

test('registerNewConversation: registers the main panel, the sidebar hoc layer with its runtime id, and the stylesheet', () => {
  const b = registrationBench()
  assert.ok(b.registrations.has('main:zen-new-conversation'), 'main panel keyed by the panel id')
  const main = b.registrations.get('main:zen-new-conversation')
  assert.equal(main.options.key, 'zen-new-conversation')
  // The trigger is registered lazily, once the `sidebar.session.action` slot is declared.
  assert.equal(b.injected.length, 1)
  assert.equal(b.injected[0][0], 'sidebar.session.action')
  b.injected[0][1]()
  assert.ok(b.registrations.has('sidebar.session.action:zen-new-conversation'))
  const hoc = b.registrations.get('sidebar.session.action:zen-new-conversation')
  // DSH 0.2.2 addresses a hoc layer BY its id: it must reach the runtime.
  assert.equal(hoc.options.id, 'zen-new-conversation')
  assert.equal(hoc.options.name, 'sidebar.session.action')
  assert.equal(b.styles.length, 1, 'one stylesheet tag for the panel')
  delete globalThis.document
})

test('registerNewConversation: native navigation registers only the draft slots and shared opener', () => {
  const opened = []
  const open = () => true
  const active = { getSnapshot: () => true, subscribe: () => () => {} }
  const b = registrationBench({ native: {
    navigation: { registerNewSessionDraft(fn) { opened.push(fn); return () => {} } },
    active, open, target: () => null, composer: () => null,
  } })
  assert.deepEqual(opened, [open])
  assert.deepEqual(b.injected.map(([name]) => name), ['conversation.hero.draftTarget', 'conversation.hero.draftComposer'])
  for (const [, register] of b.injected) register()
  assert.equal(b.registrations.size, 2)
  assert.equal(b.registrations.get('conversation.hero.draftTarget:zen-new-conversation').options.inject().hooks.active, active)
  delete globalThis.document
})

test('registerNewConversation: the sidebar entry resets to the preferred Host BEFORE the panel is selected', () => {
  // Reset and navigation write the SAME log, so the asserted sequence pins
  // their relative order (two separate logs could not).
  const b = registrationBench({ onBeforeOpen: () => { b.calls.push(['reset']) } })
  b.injected[0][1]()
  b.registrations.get('sidebar.session.action:zen-new-conversation').options.inject().open()
  // The reset must have completed by the time the panel becomes visible, so
  // the user never sees the previously selected Host flash first.
  assert.deepEqual(b.calls, [['reset'], ['selectPanel', 'zen-new-conversation']])
  delete globalThis.document
})

test('registerNewConversation: without onBeforeOpen the entry only selects the panel', () => {
  const b = registrationBench()
  b.injected[0][1]()
  b.registrations.get('sidebar.session.action:zen-new-conversation').options.inject().open()
  assert.deepEqual(b.calls, [['selectPanel', 'zen-new-conversation']])
  delete globalThis.document
})

test('registerNewConversation: the trigger injects live sources in hooks and a stable open callback', () => {
  const b = registrationBench()
  b.injected[0][1]()
  const face = b.registrations.get('sidebar.session.action:zen-new-conversation').options.inject()
  // `hooks` is the reserved compartment the renderer turns into useEnabled / useLabel.
  assert.equal(face.hooks.enabled, b.registration.enabled)
  assert.equal(face.hooks.label, b.registration.label)
  assert.equal(typeof face.open, 'function')
  assert.equal(face.label, undefined, 'label must not also be a plain field')
  delete globalThis.document
})
