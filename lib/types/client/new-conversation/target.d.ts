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
export type HostId = string;
/** The Host the Web GUI itself runs on; always selectable and never listed. */
export declare const LOCAL_HOST = "local";
/**
 * Reversible workspace id as the client half sees it. A local Workspace is
 * its bare id; a remote one is Zen's virtual id `zr~<serverId>~<original>`
 * (src/virtual-id.ts). Draft keys use the ORIGINAL id, because the virtual
 * form's serverId half changes between connection periods.
 */
export type WorkspaceId = string;
/** One paired Host and its current reachability, as the directory reports it. */
export interface HostDirectoryEntry {
    readonly hostId: HostId;
    /** Display name shown wherever the target Host is named. */
    readonly label: string;
    /**
     * `paired` and `offline` are both still paired and remain selectable: an
     * offline default Host stays selected so the user can retry or rechoose.
     * `unpaired` is a remembered Host whose pairing was revoked; it can no
     * longer be selected and is listed only so a stored preference for it can
     * be explained.
     */
    readonly status: 'paired' | 'offline' | 'unpaired';
}
/** The directory's answer, or the reason it has none. */
export type HostDirectorySnapshot = {
    readonly phase: 'pending';
} | {
    readonly phase: 'error';
    readonly message: string;
} | {
    readonly phase: 'ready';
    readonly hosts: readonly HostDirectoryEntry[];
};
/** The directory answer when nothing listed any Host: only `local` exists. */
export declare const HOSTS_LOCAL_ONLY: HostDirectorySnapshot;
/**
 * Whether a Host can be selected now. `local` always can. A listed `paired`
 * or `offline` Host can. A `ready` roster without the Host, and any
 * `unpaired` entry, cannot. A roster still pending or in error confirms
 * nothing but `local`.
 * @param snapshot - the directory's current answer.
 * @param hostId - Host to test.
 * @returns whether the Host is selectable.
 */
export declare function hostSelectable(snapshot: HostDirectorySnapshot, hostId: HostId): boolean;
/**
 * Storage suffix naming one draft's owner. A JSON tuple, so no Host id or
 * Workspace id can collide with another through a shared separator (both are
 * free-form: a serverId is 8 hex chars, an original workspace id is a uuid,
 * but the key must not depend on that).
 * @param hostId - Host the draft targets.
 * @param workspaceId - original Workspace id, or absent for the Host's no-Workspace draft.
 * @returns the opaque key the draft store persists under.
 */
export declare function draftKey(hostId: HostId, workspaceId: WorkspaceId | undefined): string;
/** The command whose bare invocation opens the model picker; the same one the native composer registers. */
export declare const MODEL_COMMAND = "/model";
/**
 * Whether a draft is a BARE `/model`: the whole text, trimmed, is the command
 * with no arguments. Mirrors the native composer's bare-token rule
 * (ui-commands: first whitespace-delimited token, bare when nothing follows).
 * `/model <args>` is not bare and is left alone — it is a command with
 * arguments, which the new-conversation panel does not dispatch.
 * @param text - the draft.
 * @returns whether Enter or the submit action should open the picker instead of sending.
 */
export declare function isBareModelCommand(text: string): boolean;
/** Why the submit action is unavailable, as a stable discriminant the panel maps to copy. */
export type SubmitBlock = 'pick-host' | 'pick-workspace' | 'write-message' | 'pick-model' | 'host-offline';
/** The facts the submit gate reads; the panel passes its view's members. */
export interface SubmitGateInput {
    readonly directory: HostDirectorySnapshot;
    readonly hostId: HostId;
    readonly workspaceId: WorkspaceId | undefined;
    readonly text: string;
    /** Whether a model is resolved; unresolved blocks a fresh send. */
    readonly hasSelection: boolean;
    /** A previous request awaiting resume, which every gate below yields to. */
    readonly pendingSubmission: boolean;
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
 * Workspace, then text, then a model, and only then the Host's reachability
 * — an offline Host stays selected, so its message is the last word and only
 * after everything else is in place.
 * @param input - the gate's inputs.
 * @returns the blocking reason, or undefined when the send may go.
 */
export declare function submitBlockOf(input: SubmitGateInput): SubmitBlock | undefined;
/** Enter or submit can open the picker, resume a frozen request, send a new draft, or do nothing. */
export type SubmitActivation = 'open-model-picker' | 'resume' | 'send' | 'blocked';
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
export declare function submitActivation(text: string, input: SubmitGateInput): SubmitActivation;
/** Why the selected Host is a fallback instead of the stored preference; absent when it is the stored one or the user's own choice. */
export type DefaultHostReason = 'unpaired' | 'directoryError';
/** Whether the preselection has been decided. */
export type PreferencePhase = 'resolving' | 'ready';
/** The current target and everything derived from its identity. */
export interface DraftTargetState {
    /** `resolving` until the stored preference has been read. */
    readonly phase: PreferencePhase;
    readonly hostId: HostId;
    /** Original Workspace id; absent while the Host is selected and no Workspace is. */
    readonly workspaceId: WorkspaceId | undefined;
    /** Why `hostId` is a fallback rather than the stored preference. */
    readonly defaultHostReason: DefaultHostReason | undefined;
    /**
     * Advance on every target identity change (`hostId`, `workspaceId`). A
     * draft write or a submit result carries the generation it was issued
     * under and is dropped when the target has since moved.
     */
    readonly generation: number;
    /**
     * Advance on every Host identity change and on every `connectionReset`:
     * catalogs and Workspace listings are per-connection facts of one Host,
     * and a result returned under an older value belongs to a connection or
     * Host the user has left.
     */
    readonly catalogGeneration: number;
}
/** The most recent Host a Session was created in; owned by the initiating Web profile. */
export interface HostPreference {
    /** @returns the stored `serverId` or `local`; rejects when the store cannot be read. */
    readLastHost(): Promise<string>;
    /** @param hostId - Host of the just-confirmed creation. Rejects when the store cannot be written. */
    saveLastHost(hostId: HostId): Promise<void>;
}
/** Minimal observable source; `getSnapshot` keeps one reference between changes. */
export interface Source<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
/** Operations over the draft target; `state` is the read side. */
export interface DraftTargetController {
    /** Current target; one reference between changes. */
    readonly state: Source<DraftTargetState>;
    /**
     * @param hostId - Host to target; leaves any Workspace, which belonged to the previous Host.
     * A Host the roster cannot confirm is refused and moves nothing.
     */
    selectHost(hostId: HostId): void;
    /**
     * @param workspaceId - original Workspace id on the current Host, or absent for the Host's own draft.
     */
    selectWorkspace(workspaceId: WorkspaceId | undefined): void;
    /**
     * Remember `hostId` after the Host confirmed a Session creation. A failed
     * write stays pending and the next confirmation retries it. A failed
     * creation or first message must not call this.
     * @param hostId - Host the Session was created on.
     */
    confirmCreated(hostId: HostId): Promise<void>;
    /** @param source - roster provider; replaces any previous one. @returns disposer that restores the no-provider answer. */
    registerHostDirectory(source: Source<HostDirectorySnapshot>): () => void;
    /** @returns the roster's current answer. */
    directory(): HostDirectorySnapshot;
    /** Note a transport reconnection: invalidates every per-connection load of the current Host. */
    connectionReset(): void;
    /** End the controller; nothing is published afterwards. */
    dispose(): void;
}
/** Controller over one new-conversation draft target. */
export declare class DraftTarget implements DraftTargetController {
    private readonly preference;
    private readonly warn;
    private current;
    private readonly listeners;
    private directorySource;
    private readonly directoryChanged;
    private stored;
    private origin;
    private disposed;
    /**
     * Which preference read is current. `resetToPreferredHost` starts a new
     * one while an earlier may still be in flight; a response whose token is
     * no longer current described a decision the user has since superseded,
     * and must not publish.
     */
    private readToken;
    /** The preference write a failed `saveLastHost` left behind, retried by the next confirmation. */
    private pendingSave;
    /**
     * Field declarations stay explicit: the client tests import this module
     * under Node's type stripping, which rejects parameter properties.
     * @param preference - the Web profile's most-recent-Host store.
     * @param warn - diagnostic sink; the controller reports a failed preference read or write and continues.
     */
    constructor(preference: HostPreference, warn?: (message: string, error: unknown) => void);
    readonly state: Source<DraftTargetState>;
    selectHost(hostId: HostId): void;
    /**
     * Select a Workspace on the current Host. During a preference read started
     * by {@link resetToPreferredHost} this is a manual choice: it marks the
     * target as the user's, so the read's eventual answer ends the resolving
     * phase without moving the Host out from under the chosen Workspace.
     */
    selectWorkspace(workspaceId: WorkspaceId | undefined): void;
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
    resetToPreferredHost(): void;
    confirmCreated(hostId: HostId): Promise<void>;
    private flushSave;
    registerHostDirectory(source: Source<HostDirectorySnapshot>): () => void;
    directory(): HostDirectorySnapshot;
    connectionReset(): void;
    dispose(): void;
    private readPreference;
    /**
     * Bring the selected Host in line with the stored preference and the
     * roster. Runs when either arrives, and again whenever the roster changes.
     *
     * A selected Host is only ever moved by a roster that rules it out. While
     * `local` stands in for an unresolved preference, the reverse also holds:
     * a roster that comes back and confirms the stored Host takes it back.
     */
    private reconcile;
    private move;
    private notify;
}
//# sourceMappingURL=target.d.ts.map