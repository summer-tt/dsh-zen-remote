/**
 * Draft text for new conversations, keyed by {@link draftKey}. Text typed
 * before any Session exists has no other owner, so the panel persists it
 * here and hands it to the submit path. Pure of browser globals at import
 * time (the storage object is injected) so tests drive it with a Map.
 *
 * Copy rule from the design: text typed before a Workspace was selected
 * belongs to the Host. The first Workspace selection copies that text into
 * the Workspace draft only when the Workspace draft is empty, and keeps the
 * Host's record; an existing Workspace draft wins.
 */
import { draftKey, type HostId, type WorkspaceId } from './target.ts'

/** What one draft holds: its text, plus whether anything was ever stored for it. */
export interface DraftRecord {
  readonly text: string
}

/** Storage face; `localStorage`-shaped, injected for tests. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Reads and writes draft records under their opaque keys. */
export interface DraftStore {
  /** @param hostId - Host of the draft. @param workspaceId - original Workspace id, or absent for the Host's own draft. @returns the stored text, or '' when nothing is stored. */
  read(hostId: HostId, workspaceId: WorkspaceId | undefined): string
  /** Store `text`; an empty string removes the record. */
  write(hostId: HostId, workspaceId: WorkspaceId | undefined, text: string): void
  /** Drop one record. */
  clear(hostId: HostId, workspaceId: WorkspaceId | undefined): void
  /**
   * The first-Workspace-selection copy: when the Workspace draft holds no
   * text, copy the Host's no-Workspace draft into it. The Host record stays.
   * @returns the Workspace draft's text after the copy.
   */
  adoptHostDraft(hostId: HostId, workspaceId: WorkspaceId): string
}

/** One stored value's JSON shape; a bare string is the earlier plain-text form. */
const PREFIX = 'dsh.zen.newConversation.'

/** Decode one stored value; malformed JSON or shape yields no record. */
function decode(raw: string | null): string {
  if (raw === null) return ''
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string') return value.text
  } catch (_error: unknown) {
    // Malformed JSON has no usable text; an empty draft is the safe reading.
  }
  return ''
}

/**
 * Create the draft store over an injected storage.
 * @param storage - `localStorage`-shaped storage.
 * @returns the store.
 */
export function createDraftStore(storage: DraftStorage): DraftStore {
  const key = (hostId: HostId, workspaceId: WorkspaceId | undefined): string => PREFIX + draftKey(hostId, workspaceId)
  return {
    read(hostId, workspaceId) {
      return decode(storage.getItem(key(hostId, workspaceId)))
    },
    write(hostId, workspaceId, text) {
      const name = key(hostId, workspaceId)
      if (text === '') storage.removeItem(name)
      else storage.setItem(name, JSON.stringify({ text }))
    },
    clear(hostId, workspaceId) {
      storage.removeItem(key(hostId, workspaceId))
    },
    adoptHostDraft(hostId, workspaceId) {
      const hostText = decode(storage.getItem(key(hostId, undefined)))
      const own = decode(storage.getItem(key(hostId, workspaceId)))
      // An existing Workspace draft wins; the Host record is kept either way.
      if (own !== '' || hostText === '') return own
      storage.setItem(key(hostId, workspaceId), JSON.stringify({ text: hostText }))
      return hostText
    },
  }
}

/** The browser storage, or undefined where none exists (Node tests, workers). */
export function browserDraftStorage(): DraftStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage
}
