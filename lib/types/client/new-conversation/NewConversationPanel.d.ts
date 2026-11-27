/**
 * The new-conversation panel: a Session-less draft editor whose text, Host,
 * and Workspace belong together before any Session exists. It is the plugin
 * answer to the native composer, which the Conversation shell keeps inert
 * while no Session is current (ui-conversation ConversationContent.tsx:
 * `inert = sessionId === undefined`); a `main` keyed panel gets no Session
 * binding, so this panel owns its own textarea.
 *
 * The panel is presentation plus local UI state. Everything durable or
 * cross-cutting arrives through props. Live data comes in as ONE observable
 * ({@link NewConversationView}) rather than as plain inject fields: the
 * renderer caches a root entry's inject result for the registration's
 * lifetime, so a value read there would freeze at the first render, while a
 * source in the `hooks` compartment stays live. Callbacks are stable and
 * travel as plain props. Submitting hands the wiring one frozen snapshot and
 * reports back; the panel never creates a Session, never selects a model,
 * and never reads a catalog.
 *
 * Copy is a typed dictionary inside the view (the wiring re-publishes the
 * view on a locale switch), so this module carries no locale import and a
 * Node test can drive it with plain strings.
 */
import { type ReactNode } from 'react';
import type { DraftSlotProps, NativeDraftPreset, NativeWorkspaceControl } from './register.ts';
import { type RemoteWorkspaceActions } from './RemoteWorkspaceDialog.tsx';
import { type DraftTargetState, type HostDirectorySnapshot, type HostId, type WorkspaceId } from './target.ts';
/** The model a draft will start with, resolved by the user before the first send. */
export interface ModelSelection {
    readonly provider: string;
    readonly model: string;
    /** Explicit reasoning effort; absent follows the adapter default (DSH `ModelSelection`). */
    readonly reasoningEffort?: string | undefined;
}
/** One Workspace candidate of the current Host. */
export interface WorkspaceOption {
    /** Original Workspace id, as draft keys use it. */
    readonly workspaceId: WorkspaceId;
    /** ID as displayed by the merged workspace controller. */
    readonly displayId?: string;
    /** Display title. */
    readonly label: string;
    readonly path?: string;
}
/**
 * What one submit asks for. A fresh send carries the full snapshot the
 * wiring creates the Session and sends the first message from. A resume
 * (`resume: true`) carries only the generation: the wiring resends the
 * request it froze earlier, so the target, model and text are left absent
 * here — they are that request's own, not the draft's current values, and a
 * value read off the draft would be a guess.
 */
export interface SubmitInput {
    /** `true` resumes the wiring's frozen request instead of sending the draft. */
    readonly resume?: boolean | undefined;
    /** Target generation now; on a resume, which draft the user resumed from. */
    readonly generation: number;
    /** Absent on a resume (the frozen request names its own Host). */
    readonly hostId?: HostId | undefined;
    /** Absent on a resume (the frozen request names its own Workspace). */
    readonly workspaceId?: WorkspaceId | undefined;
    /** Absent on a resume (the frozen request names its own model). */
    readonly selection?: ModelSelection | undefined;
    /** Absent on a resume (the frozen request carries its own text). */
    readonly text?: string | undefined;
}
/** A confirmed creation or an error to display alongside the retained draft. */
export type SubmitResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly message: string;
};
/** Every product-visible string the panel renders. */
export interface NewConversationCopy {
    readonly title: string;
    readonly hostLabel: string;
    readonly workspaceLabel: string;
    readonly localHost: string;
    readonly chooseWorkspace: string;
    readonly noWorkspaces: string;
    readonly loadingHosts: string;
    readonly directoryFailed: string;
    readonly retry: string;
    readonly offlineHost: string;
    readonly unpairedNotice: string;
    /** Label of the model seat while no model is staged; it is the picker's trigger, not a default. */
    readonly modelUnset: string;
    readonly placeholder: string;
    readonly submit: string;
    readonly submitting: string;
    /** The submit action's label while the draft is a bare `/model`. */
    readonly openModelPicker: string;
    /** The submit action's label while a previous request is pending resumption. */
    readonly retrySubmission: string;
    /** Hint under the submit while a previous request is pending: it resumes the submitted snapshot, not the draft. */
    readonly resumeHint: string;
    readonly pickWorkspaceFirst: string;
    readonly pickHostFirst: string;
    readonly writeFirstMessage: string;
    /** Why submit waits while no model is resolved; also the hint under the submit. */
    readonly pickModelFirst: string;
    readonly hostOffline: string;
    readonly ariaHostPicker: string;
    readonly ariaWorkspacePicker: string;
    /** Spoken name of the model seat's trigger when the wiring mounts no picker node. */
    readonly ariaOpenModelPicker: string;
}
/**
 * Everything the panel renders that can change from outside React, as one
 * snapshot. The wiring publishes a new object when any member moves; the
 * panel subscribes once. `modelPicker` is the one node-valued member: the
 * T3 `DraftPicker` is mounted by the wiring and placed here, so the panel
 * never imports another plugin's component.
 */
export interface NewConversationView {
    readonly mainSessionId?: string | undefined;
    readonly returnSessionId?: string | undefined;
    readonly target: DraftTargetState;
    readonly directory: HostDirectorySnapshot;
    /** Why the roster failed, when it did; shown with the retry action. */
    readonly directoryError: string | undefined;
    readonly workspaces: readonly WorkspaceOption[];
    readonly canAddRemoteWorkspace?: boolean;
    readonly presets?: readonly {
        id: string;
        label: string;
        name?: string;
        description?: string;
    }[];
    readonly agentPreset?: string | undefined;
    /** The current target's draft text. */
    readonly text: string;
    /** The staged model; null until the user resolves one, which blocks submit. */
    readonly selection: ModelSelection | null;
    /**
     * The model picker the wiring mounts (T3 `DraftPicker`), or undefined when
     * none is mounted: the seat then shows the unset label and opens the
     * picker through `actions.onOpenModelPicker` instead.
     */
    readonly modelPicker: ReactNode | undefined;
    /**
     * A previous submit the Host has not confirmed or refused, so its frozen
     * request can be resumed. While set, the submit action RETRIES that
     * snapshot rather than sending the draft: the model, text, roster and
     * offline gates do not apply, because none of them describe the request
     * being resumed. `false`/absent means no such request is pending.
     */
    readonly pendingSubmission?: boolean | undefined;
    readonly copy: NewConversationCopy;
}
/**
 * The view as an observable source, placed in the registration's `hooks`
 * compartment. The renderer binds it into a `useView` selector hook and
 * hands the component THAT (ui-renderer bindInjectSources), so the panel
 * reads the framework-made hook and owns no subscription.
 */
export type NewConversationViewSource = {
    getSnapshot(): NewConversationView;
    subscribe(listener: () => void): () => void;
};
/**
 * Selector hook over the view, as the renderer binds it. Canonical
 * `SnapshotSelectorHook` shape: select one member, re-render only when that
 * member's reference changes.
 */
export type UseNewConversationView = <S>(selector: (view: NewConversationView) => S) => S;
/** Stable callbacks the wiring provides. */
export interface NewConversationPanelActions {
    readonly onSelectHost: (hostId: HostId) => void;
    readonly onOpenHostDraft?: (hostId: HostId) => void;
    readonly onReturnToSession?: () => void;
    readonly onSelectWorkspace: (workspaceId: WorkspaceId) => void;
    readonly remoteWorkspace?: (hostId: HostId, generation: number) => RemoteWorkspaceActions;
    readonly onSelectPreset?: (id: string) => void;
    readonly onTextChange: (text: string) => void;
    /**
     * Open the model picker for the current target (the T3 `/model` panel).
     * The wiring owns the opener: it mounts the picker node in the view and
     * drives the same instance here, so a click on the model seat and the
     * `/model` command reach one panel.
     */
    readonly onOpenModelPicker: () => void;
    /** Re-fetch the roster after an error; absent when the roster cannot be refetched. */
    readonly onRetryDirectory: (() => void) | undefined;
    /**
     * Create the Session and send the first message from one frozen snapshot.
     * The wiring owns everything that follows a success — clearing the
     * submitted draft by compare-and-set against `input`, and navigating to
     * the created Session — so the panel only reports the outcome.
     */
    readonly onSubmit: (input: SubmitInput) => Promise<SubmitResult>;
}
/** Props of the new-conversation panel: the framework-bound view hook, the stable actions. */
export interface NewConversationPanelProps {
    readonly useView: UseNewConversationView;
    readonly actions: NewConversationPanelActions;
}
/** Host and workspace selection for the native hero row. */
export declare function NewConversationTarget({ useView, actions, renderWorkspace, renderDraftPreset }: NewConversationPanelProps & {
    renderWorkspace?: NativeWorkspaceControl;
    renderDraftPreset?: NativeDraftPreset;
}): import("react").JSX.Element;
/**
 * Text-only composer for a draft that has no Session binding yet.
 */
export declare function NewConversationComposer({ useView, actions }: NewConversationPanelProps): import("react").JSX.Element;
export declare function NativeDraftTarget({ useActive, draftAvailable, children, targetSessionId, renderNativeTarget, ...draft }: DraftSlotProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode> | null | undefined;
export declare function NativeDraftComposer({ useActive, draftAvailable, children, ...draft }: DraftSlotProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode> | null | undefined;
/** Compatibility panel for DSH versions without the native draft slots. */
export declare function NewConversationPanel(props: NewConversationPanelProps): import("react").JSX.Element;
//# sourceMappingURL=NewConversationPanel.d.ts.map