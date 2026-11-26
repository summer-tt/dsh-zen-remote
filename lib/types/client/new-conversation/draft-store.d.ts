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
import { type HostId, type WorkspaceId } from './target.ts';
/** What one draft holds: its text, plus whether anything was ever stored for it. */
export interface DraftRecord {
    readonly text: string;
}
/** Storage face; `localStorage`-shaped, injected for tests. */
export interface DraftStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Reads and writes draft records under their opaque keys. */
export interface DraftStore {
    /** @param hostId - Host of the draft. @param workspaceId - original Workspace id, or absent for the Host's own draft. @returns the stored text, or '' when nothing is stored. */
    read(hostId: HostId, workspaceId: WorkspaceId | undefined): string;
    /** Store `text`; an empty string removes the record. */
    write(hostId: HostId, workspaceId: WorkspaceId | undefined, text: string): void;
    /** Drop one record. */
    clear(hostId: HostId, workspaceId: WorkspaceId | undefined): void;
    /**
     * The first-Workspace-selection copy: when the Workspace draft holds no
     * text, copy the Host's no-Workspace draft into it. The Host record stays.
     * @returns the Workspace draft's text after the copy.
     */
    adoptHostDraft(hostId: HostId, workspaceId: WorkspaceId): string;
}
/**
 * Create the draft store over an injected storage.
 * @param storage - `localStorage`-shaped storage.
 * @returns the store.
 */
export declare function createDraftStore(storage: DraftStorage): DraftStore;
/** The browser storage, or undefined where none exists (Node tests, workers). */
export declare function browserDraftStorage(): DraftStorage | undefined;
//# sourceMappingURL=draft-store.d.ts.map