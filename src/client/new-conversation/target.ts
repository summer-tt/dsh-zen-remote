/**
 * New-conversation target, the pure half (host-scoped picker). Which Host and
 * original Workspace an unsent draft belongs to, before any Session exists:
 * the preselection decision (most recently created-in Host, falling back to
 * the local Host), the load generations downstream loads use to drop late
 * results, and the storage key naming one draft's owner. Draft text lives in
 * draft-store.ts; Host listing, model catalogs and Session creation are the
 * wiring's. Browser-import-free so test/*.test.mjs drives it directly.
 */

/** Stable identity of one Host a new conversation can target: `LOCAL_HOST`, or a paired Host's `serverId`. */
export type HostId = string

/** The Host the Web GUI itself runs on; always selectable and never listed. */
export const LOCAL_HOST = 'local'

/**
 * Reversible workspace id as the client half sees it. A local Workspace is
 * its bare id; a remote one is Zen's virtual id `zr~<serverId>~<original>`
 * (src/virtual-id.ts). Draft keys use the ORIGINAL id, because the virtual
 * form's serverId half changes between connection periods.
 */
export type WorkspaceId = string

/** One paired Host and its current reachability, as the directory reports it. */
export interface HostDirectoryEntry {
  readonly hostId: HostId
  /** Display name shown wherever the target Host is named. */
  readonly label: string
  /**
   * `paired` and `offline` are both still paired and remain selectable: an
   * offline default Host stays selected so the user can retry or rechoose.
   * `unpaired` is a remembered Host whose pairing was revoked; it can no
   * longer be selected and is listed only so a stored preference for it can
   * be explained.
   */
  readonly status: 'paired' | 'offline' | 'unpaired'
}

/** The directory's answer, or the reason it has none. */
export type HostDirectorySnapshot =
  | { readonly phase: 'pending' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'ready'; readonly hosts: readonly HostDirectoryEntry[] }

/** The directory answer when nothing listed any Host: only `local` exists. */
export const HOSTS_LOCAL_ONLY: HostDirectorySnapshot = Object.freeze({ phase: 'ready', hosts: Object.freeze([]) })

/**
 * Whether a Host can be selected now. `local` always can. A listed `paired`
 * or `offline` Host can. A `ready` roster without the Host, and any
 * `unpaired` entry, cannot. A roster still pending or in error confirms
 * nothing but `local`.
 * @param snapshot - the directory's current answer.
 * @param hostId - Host to test.
 * @returns whether the Host is selectable.
 */
export function hostSelectable(snapshot: HostDirectorySnapshot, hostId: HostId): boolean {
  if (hostId === LOCAL_HOST) return true
  if (snapshot.phase !== 'ready') return false
  const entry = snapshot.hosts.find(host => host.hostId === hostId)
  return entry !== undefined && entry.status !== 'unpaired'
}

/**
 * Storage suffix naming one draft's owner. A JSON tuple, so no Host id or
 * Workspace id can collide with another through a shared separator (both are
 * free-form: a serverId is 8 hex chars, an original workspace id is a uuid,
 * but the key must not depend on that).
 * @param hostId - Host the draft targets.
 * @param workspaceId - original Workspace id, or absent for the Host's no-Workspace draft.
 * @returns the opaque key the draft store persists under.
 */
export function draftKey(hostId: HostId, workspaceId: WorkspaceId | undefined): string {
  return JSON.stringify(workspaceId === undefined ? ['host', hostId] : ['host', hostId, 'workspace', workspaceId])
}

/** The command whose bare invocation opens the model picker; the same one the native composer registers. */
export const MODEL_COMMAND = '/model'

/**
 * Whether a draft is a BARE `/model`: the whole text, trimmed, is the command
 * with no arguments. Mirrors the native composer's bare-token rule
 * (ui-commands: first whitespace-delimited token, bare when nothing follows).
 * `/model <args>` is not bare and is left alone — it is a command with
 * arguments, which the new-conversation panel does not dispatch.
 * @param text - the draft.
 * @returns whether Enter or the submit action should open the picker instead of sending.
 */
export function isBareModelCommand(text: string): boolean {
  return text.trim() === MODEL_COMMAND
}

/** Why the submit action is unavailable, as a stable discriminant the panel maps to copy. */
export type SubmitBlock =
  | 'pick-host'
  | 'pick-workspace'
  | 'write-message'
  | 'pick-model'
  /** The draft carries images the selected Host cannot take; pasting still works, sending does not. */
  | 'images-unsupported'
  | 'host-offline'

/** The facts the submit gate reads; the panel passes its view's members. */
export interface SubmitGateInput {
  readonly directory: HostDirectorySnapshot
  readonly hostId: HostId
  readonly workspaceId: WorkspaceId | undefined
  readonly text: string
  /** Whether a model is resolved; unresolved blocks a fresh send. */
  readonly hasSelection: boolean
  /** A previous request awaiting resume, which every gate below yields to. */
  readonly pendingSubmission: boolean
  /**
   * Whether the draft holds at least one image. An image alone is a message:
   * with one present, empty text is not `write-message`. Absent reads as none.
   */
  readonly hasImages?: boolean | undefined
  /**
   * Whether the selected Host cannot take images (an older online remote
   * Host). Only a draft WITH images is blocked by it, and only after a model
   * is resolved, like every other gate. Absent reads as supported.
   */
  readonly imagesUnavailable?: boolean | undefined
}

/**
 * Why a FRESH send is unavailable, or undefined when it is available.
 *
 * A pending submission is never blocked: the action then resumes the wiring's
 * frozen request, and none of these gates describe that request. A bare
 * `/model` is not decided here either — the activation order takes it before
 * any send (see {@link submitActivation}).
 *
 * The order is the order a user meets the prerequisites: a Host, then a
 * Workspace, then a message (text or images), then a model, then whether the
 * Host can take the draft's images, and only then the Host's reachability
 * — an offline Host stays selected, so its message is the last word and only
 * after everything else is in place.
 * @param input - the gate's inputs.
 * @returns the blocking reason, or undefined when the send may go.
 */
export function submitBlockOf(input: SubmitGateInput): SubmitBlock | undefined {
  if (input.pendingSubmission) return undefined
  // No roster, no routing: a Host the roster has not listed cannot be targeted.
  if (input.directory.phase !== 'ready') return 'pick-host'
  if (input.workspaceId === undefined) return 'pick-workspace'
  if (input.text.trim() === '' && input.hasImages !== true) return 'write-message'
  if (!input.hasSelection) return 'pick-model'
  if (input.hasImages === true && input.imagesUnavailable === true) return 'images-unsupported'
  const host = input.directory.hosts.find(entry => entry.hostId === input.hostId)
  if (host?.status === 'offline') return 'host-offline'
  return undefined
}

/** The one member of a browser `File` the paste reader looks at; any object with it stands in under Node. */
export interface PastedFile {
  /** The browser's declared MIME type. */
  readonly type: string
}

/**
 * What one paste event carries, duck-typed; a real `DataTransfer` has both
 * members. The lists are `ArrayLike` rather than arrays: a `DataTransfer`'s
 * `files` and `items` are browser list objects, iterable in modern engines
 * but not typed as such everywhere, so they are read by index here.
 * `getData` is not read by this module; it is declared only so a real
 * `DataTransfer` is assignable without a cast.
 */
export interface PastedTransfer<T extends PastedFile = PastedFile> {
  readonly files?: ArrayLike<T> | undefined
  readonly items?: ArrayLike<{ readonly kind: string; getAsFile(): T | null }> | undefined
  getData?(format: string): string
}

/**
 * The image files of one paste, in clipboard order.
 *
 * Only the declared MIME prefix decides: anything `image/*` (an SVG, an
 * empty file, a type the Host will refuse) is passed on, so the owner that
 * stores the draft gives ONE consistent verdict on format, size and count,
 * and this pure half repeats none of it. A paste with no image returns an
 * empty array, which is how the caller knows to leave the text paste alone.
 *
 * A browser fills `files` and `items` with the SAME files, so reading both
 * would add every image twice. `files` is read when it holds anything, and
 * `items` only when it is empty or absent (some browsers expose a pasted
 * image through `items` alone). A `files` list that holds no image is final:
 * falling through to `items` then could only repeat what it already said.
 * @param transfer - the paste event's clipboard payload.
 * @returns the pasted image files; empty when the paste carried none.
 */
export function pastedImages<T extends PastedFile>(transfer: PastedTransfer<T>): T[] {
  let source: readonly T[]
  if (transfer.files !== undefined && transfer.files.length > 0) {
    source = Array.from(transfer.files)
  } else {
    source = Array.from(transfer.items ?? [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is T => file !== null)
  }
  return source.filter(file => file.type.startsWith('image/'))
}

/** Enter or submit can open the picker, resume a frozen request, send a new draft, or do nothing. */
export type SubmitActivation = 'open-model-picker' | 'resume' | 'send' | 'blocked'

/**
 * Decide what Enter or the submit action does, in a fixed order:
 * 1. a bare `/model` is taken before anything else, so neither an unresolved
 *    model nor a pending request can turn the command into a refusal or a send;
 * 2. a pending submission resumes its frozen request, whatever the draft,
 *    roster or model now say;
 * 3. otherwise a fresh send, behind the submit gates.
 * @param text - the draft.
 * @param input - the gate's inputs.
 * @returns the activation to perform.
 */
export function submitActivation(text: string, input: SubmitGateInput): SubmitActivation {
  if (isBareModelCommand(text)) return 'open-model-picker'
  if (input.pendingSubmission) return 'resume'
  return submitBlockOf(input) === undefined ? 'send' : 'blocked'
}

/** Why the selected Host is a fallback instead of the stored preference; absent when it is the stored one or the user's own choice. */
export type DefaultHostReason = 'unpaired' | 'directoryError'

/** Whether the preselection has been decided. */
export type PreferencePhase = 'resolving' | 'ready'

/** The current target and everything derived from its identity. */
export interface DraftTargetState {
  /** `resolving` until the stored preference has been read. */
  readonly phase: PreferencePhase
  readonly hostId: HostId
  /** Original Workspace id; absent while the Host is selected and no Workspace is. */
  readonly workspaceId: WorkspaceId | undefined
  /** Why `hostId` is a fallback rather than the stored preference. */
  readonly defaultHostReason: DefaultHostReason | undefined
  /**
   * Advance on every target identity change (`hostId`, `workspaceId`). A
   * draft write or a submit result carries the generation it was issued
   * under and is dropped when the target has since moved.
   */
  readonly generation: number
  /**
   * Advance on every Host identity change and on every `connectionReset`:
   * catalogs and Workspace listings are per-connection facts of one Host,
   * and a result returned under an older value belongs to a connection or
   * Host the user has left.
   */
  readonly catalogGeneration: number
}

/** The most recent Host a Session was created in; owned by the initiating Web profile. */
export interface HostPreference {
  /** @returns the stored `serverId` or `local`; rejects when the store cannot be read. */
  readLastHost(): Promise<string>
  /** @param hostId - Host of the just-confirmed creation. Rejects when the store cannot be written. */
  saveLastHost(hostId: HostId): Promise<void>
}

/** Minimal observable source; `getSnapshot` keeps one reference between changes. */
export interface Source<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Operations over the draft target; `state` is the read side. */
export interface DraftTargetController {
  /** Current target; one reference between changes. */
  readonly state: Source<DraftTargetState>
  /**
   * @param hostId - Host to target; leaves any Workspace, which belonged to the previous Host.
   * A Host the roster cannot confirm is refused and moves nothing.
   */
  selectHost(hostId: HostId): void
  /**
   * @param workspaceId - original Workspace id on the current Host, or absent for the Host's own draft.
   */
  selectWorkspace(workspaceId: WorkspaceId | undefined): void
  /**
   * Remember `hostId` after the Host confirmed a Session creation. A failed
   * write stays pending and the next confirmation retries it. A failed
   * creation or first message must not call this.
   * @param hostId - Host the Session was created on.
   */
  confirmCreated(hostId: HostId): Promise<void>
  /** @param source - roster provider; replaces any previous one. @returns disposer that restores the no-provider answer. */
  registerHostDirectory(source: Source<HostDirectorySnapshot>): () => void
  /** @returns the roster's current answer. */
  directory(): HostDirectorySnapshot
  /** Note a transport reconnection: invalidates every per-connection load of the current Host. */
  connectionReset(): void
  /** End the controller; nothing is published afterwards. */
  dispose(): void
}

/** Who decided the selected Host, which decides what may move it. */
type HostOrigin =
  /**
   * The stored preference resolved to this Host and the roster confirmed it.
   * Later roster changes may revoke it, but a roster that stops answering
   * (pending or error) never relocates it: the draft is already filed here.
   */
  | 'preference'
  /** The user selected this Host; only the roster revoking it moves it. */
  | 'user'
  /**
   * The preference could not resolve to a real Host (nothing stored, the
   * read failed, or the roster ruled the stored Host out), so `local` stands
   * in. Unlike a confirmed selection, this one is still awaiting a decision:
   * a roster that later confirms the stored Host takes it back.
   */
  | 'fallback'

/** The stored preference as the controller learned it. */
type StoredHost =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'known'; readonly hostId: HostId }

/** How a target moved, for the generation counters. */
interface Move {
  readonly hostChanged: boolean
  readonly reason: DefaultHostReason | undefined
}

/**
 * Why a Host the roster has OPINED ON cannot be the selected Host, or
 * `undefined` when it can or when the roster cannot say yet.
 *
 * A `pending` roster has not answered. An `error` roster has answered for
 * nothing: it names no decision either, so a Host already selected is never
 * evicted on its account — an open draft must not be relocated because a
 * listing failed to load. The one place `error` is a reason is the stored
 * preference, which cannot be confirmed without a roster at all
 * (see {@link storedFallback}).
 */
function fallbackReason(snapshot: HostDirectorySnapshot, hostId: HostId): DefaultHostReason | undefined {
  if (hostSelectable(snapshot, hostId)) return undefined
  if (snapshot.phase !== 'ready') return undefined
  // A ready roster without the entry, or with it marked revoked, both mean
  // the pairing is gone; the roster keeps revoked entries only to label them.
  return 'unpaired'
}

/**
 * The stored preference's fallback: like {@link fallbackReason}, except that
 * a roster in error is a reason of its own — the preference cannot be
 * confirmed, and saying `local` is preselected *because the listing failed*
 * is a different fact from the Host having been unpaired.
 */
function storedFallback(snapshot: HostDirectorySnapshot, hostId: HostId): DefaultHostReason | undefined {
  if (hostSelectable(snapshot, hostId)) return undefined
  if (snapshot.phase === 'error') return 'directoryError'
  if (snapshot.phase !== 'ready') return undefined
  return 'unpaired'
}

function initialState(hostId: HostId): DraftTargetState {
  return {
    phase: 'resolving',
    hostId,
    workspaceId: undefined,
    defaultHostReason: undefined,
    generation: 0,
    catalogGeneration: 0,
  }
}

/** Controller over one new-conversation draft target. */
export class DraftTarget implements DraftTargetController {
  private readonly preference: HostPreference
  private readonly warn: (message: string, error: unknown) => void
  private current: DraftTargetState = initialState(LOCAL_HOST)
  private readonly listeners = new Set<() => void>()
  private directorySource: Source<HostDirectorySnapshot> | undefined
  private readonly directoryChanged = (): void => { this.reconcile() }
  private stored: StoredHost = { kind: 'pending' }
  private origin: HostOrigin = 'fallback'
  private disposed = false
  /**
   * Which preference read is current. `resetToPreferredHost` starts a new
   * one while an earlier may still be in flight; a response whose token is
   * no longer current described a decision the user has since superseded,
   * and must not publish.
   */
  private readToken = 0
  /** The preference write a failed `saveLastHost` left behind, retried by the next confirmation. */
  private pendingSave: HostId | undefined

  /**
   * Field declarations stay explicit: the client tests import this module
   * under Node's type stripping, which rejects parameter properties.
   * @param preference - the Web profile's most-recent-Host store.
   * @param warn - diagnostic sink; the controller reports a failed preference read or write and continues.
   */
  constructor(preference: HostPreference, warn: (message: string, error: unknown) => void = () => {}) {
    this.preference = preference
    this.warn = warn
    void this.readPreference()
  }

  readonly state: Source<DraftTargetState> = {
    getSnapshot: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  selectHost(hostId: HostId): void {
    if (this.disposed) return
    // A Host the roster cannot confirm is refused without moving the target:
    // falling back silently would file the user's text under another Host.
    if (!hostSelectable(this.directory(), hostId)) return
    const current = this.current
    // Re-selecting the Host already targeted with no Workspace is the same
    // target, whoever chose it first; it must not re-key the draft.
    this.origin = 'user'
    if (current.phase === 'resolving') ++this.readToken
    if (current.phase === 'ready' && current.hostId === hostId && current.workspaceId === undefined) return
    this.move({ hostId, workspaceId: undefined }, { hostChanged: current.hostId !== hostId, reason: undefined })
  }

  /**
   * Select a Workspace on the current Host. During a preference read started
   * by {@link resetToPreferredHost} this is a manual choice: it marks the
   * target as the user's, so the read's eventual answer ends the resolving
   * phase without moving the Host out from under the chosen Workspace.
   */
  selectWorkspace(workspaceId: WorkspaceId | undefined): void {
    if (this.disposed) return
    const current = this.current
    if (current.workspaceId === workspaceId) return
    if (current.phase === 'resolving' && workspaceId !== undefined) this.origin = 'user'
    this.move({ hostId: current.hostId, workspaceId }, { hostChanged: false, reason: current.defaultHostReason })
  }

  /**
   * Start a generic new conversation over: clear the Workspace and resolve
   * the target afresh from the stored preference.
   *
   * For an explicit generic New Conversation entry — a sidebar button, a
   * brand click, a shortcut. The preference is read again, because a Session
   * created since the panel opened may have moved it: without this the next
   * new conversation would open on whichever Host the user last picked by
   * hand, not the one just remembered. The phase returns to `resolving` so
   * the UI shows it is deciding, and a manual Workspace selection made while
   * the read is in flight is not undone by its response (see
   * {@link readPreference}).
   */
  resetToPreferredHost(): void {
    if (this.disposed) return
    const current = this.current
    this.origin = 'fallback'
    this.stored = { kind: 'pending' }
    // Only the Workspace is dropped here; the Host stays as it was until the
    // read answers, so the draft keyed to it is not relocated on a guess.
    this.current = {
      ...current,
      phase: 'resolving',
      workspaceId: undefined,
      defaultHostReason: undefined,
      generation: current.generation + (current.workspaceId === undefined ? 0 : 1),
    }
    this.notify()
    void this.readPreference()
  }

  async confirmCreated(hostId: HostId): Promise<void> {
    if (this.disposed) return
    this.pendingSave = hostId
    await this.flushSave()
  }

  private async flushSave(): Promise<void> {
    const hostId = this.pendingSave
    if (hostId === undefined) return
    try {
      await this.preference.saveLastHost(hostId)
    } catch (error: unknown) {
      // The preference only preselects the next conversation; the creation
      // it follows already succeeded, so the owner is told and the value
      // stays pending for the next confirmation to retry.
      this.warn('last Host preference write failed:', error)
      return
    }
    if (this.pendingSave === hostId) this.pendingSave = undefined
  }

  registerHostDirectory(source: Source<HostDirectorySnapshot>): () => void {
    this.directorySource = source
    const unsubscribe = source.subscribe(this.directoryChanged)
    this.reconcile()
    return () => {
      unsubscribe()
      if (this.directorySource !== source) return
      this.directorySource = undefined
      this.reconcile()
    }
  }

  directory(): HostDirectorySnapshot {
    return this.directorySource?.getSnapshot() ?? HOSTS_LOCAL_ONLY
  }

  connectionReset(): void {
    if (this.disposed) return
    this.current = { ...this.current, catalogGeneration: this.current.catalogGeneration + 1 }
    this.notify()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.directorySource = undefined
    this.listeners.clear()
  }

  private async readPreference(): Promise<void> {
    // Claim this read; a response under an older token is a decision the
    // user has superseded by resetting again, and publishes nothing.
    const token = ++this.readToken
    let hostId: HostId
    try {
      hostId = await this.preference.readLastHost()
    } catch (error: unknown) {
      if (this.disposed || token !== this.readToken) return
      this.warn('last Host preference read failed:', error)
      this.stored = { kind: 'failed' }
      // The stored value is unknown, so `local` is a preselection the next
      // start can replace; the store itself is left untouched.
      this.origin = 'fallback'
      this.current = { ...this.current, phase: 'ready', hostId: LOCAL_HOST }
      this.reconcile()
      this.notify()
      return
    }
    if (this.disposed || token !== this.readToken) return
    this.stored = { kind: 'known', hostId }
    // A manual Workspace selection during the read set `origin` to `user`:
    // that choice stands, and the read only ends the resolving phase.
    this.current = { ...this.current, phase: 'ready' }
    this.reconcile()
  }

  /**
   * Bring the selected Host in line with the stored preference and the
   * roster. Runs when either arrives, and again whenever the roster changes.
   *
   * A selected Host is only ever moved by a roster that rules it out. While
   * `local` stands in for an unresolved preference, the reverse also holds:
   * a roster that comes back and confirms the stored Host takes it back.
   */
  private reconcile(): void {
    const current = this.current
    if (this.disposed || current.phase !== 'ready' || this.stored.kind !== 'known') return
    const snapshot = this.directory()
    const stored = this.stored.hostId
    if (this.origin !== 'fallback') {
      // A confirmed selection: move only once the roster rules it out, and only to `local`.
      const reason = fallbackReason(snapshot, current.hostId)
      if (reason === undefined) return
      this.origin = 'fallback'
      this.move({ hostId: LOCAL_HOST, workspaceId: undefined }, { hostChanged: true, reason })
      return
    }
    // `local` stands in. The roster decides whether the stored Host takes over.
    if (hostSelectable(snapshot, stored)) {
      this.origin = 'preference'
      this.move({ hostId: stored, workspaceId: undefined }, { hostChanged: true, reason: undefined })
      return
    }
    const fallback = storedFallback(snapshot, stored)
    // Pending names no decision; an earlier reason is withdrawn until it does.
    if (fallback === undefined) {
      if (current.defaultHostReason !== undefined) {
        this.move({ hostId: LOCAL_HOST, workspaceId: undefined }, { hostChanged: false, reason: undefined })
      }
      return
    }
    if (current.defaultHostReason === fallback) return
    this.move({ hostId: LOCAL_HOST, workspaceId: undefined }, { hostChanged: false, reason: fallback })
  }

  private move(
    target: { readonly hostId: HostId; readonly workspaceId: WorkspaceId | undefined },
    change: Move,
  ): void {
    this.current = {
      phase: 'ready',
      hostId: target.hostId,
      workspaceId: target.workspaceId,
      defaultHostReason: change.reason,
      generation: this.current.generation + 1,
      catalogGeneration: this.current.catalogGeneration + (change.hostChanged ? 1 : 0),
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
