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
 *
 * Pasted images join the draft the same way they do in the native composer:
 * a thumbnail rail above the text, each one removable, and an original-size
 * preview. The panel only reads them ({@link NewConversationView.images}) and
 * forwards two gestures; which images a draft holds, their object URLs and
 * every verdict on format, size and count belong to the wiring, so the same
 * verdict is given whether an image arrives by paste or is restored.
 */
import { type ReactNode } from 'react';
import type { DraftSlotProps, NativeDraftPreset, NativeWorkspaceControl, RenderNativeDirectoryBrowser } from './register.ts';
import { type RemoteWorkspaceActions } from './RemoteWorkspaceDialog.tsx';
import type { DraftCompletionSession, DraftFileCandidate } from './completion.ts';
import { type DraftTargetState, type HostDirectorySnapshot, type HostId, type WorkspaceId } from './target.ts';
/** One image attached to the draft, as the wiring already holds it. */
export interface DraftImageView {
    /** Stable identity for removal and for React's key. */
    readonly id: string;
    /** Display name, already trimmed and defaulted by the wiring. */
    readonly name: string;
    /** An object URL of the image bytes, owned and revoked by the wiring. */
    readonly url: string;
}
/** Why the last paste or restore did not add every image; one verdict per draft, keyed by the wiring. */
export type DraftImageFailure = 'unsupported' | 'limit' | 'empty' | 'preview';
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
    readonly submit: string;
    readonly submitting: string;
    /** The submit action's label while the draft is a bare `/model`. */
    readonly openModelPicker: string;
    /** The submit action's label while a previous request is pending resumption. */
    readonly retrySubmission: string;
    /** Hint under the submit while a previous request is pending: it resumes the submitted snapshot, not the draft. */
    readonly resumeHint: string;
    /** The same hint while the frozen request carried images, so the user knows those resend too. */
    readonly resumeImagesHint: string;
    readonly pickWorkspaceFirst: string;
    readonly pickHostFirst: string;
    /** Why submit waits while the draft has neither text nor images; also the hint under the submit. */
    readonly writeFirstMessage: string;
    /**
     * The textarea's placeholder: the one place an empty draft is told it can
     * take an image. The submit's own hint stays `writeFirstMessage`, so the
     * same sentence is not shown twice.
     */
    readonly writeOrPasteFirst: string;
    /** Why submit waits while no model is resolved; also the hint under the submit. */
    readonly pickModelFirst: string;
    readonly hostOffline: string;
    /** Why submit waits while the draft's images exceed what the selected Host can take. */
    readonly imagesUnavailable: string;
    /** A pasted image had a type the Host refuses (not PNG, JPG, WebP or GIF). */
    readonly imageUnsupported: string;
    /** The draft reached the image count or total size; `{count}` and `{mib}` are replaced. */
    readonly imageLimit: string;
    /** A pasted image had no bytes. */
    readonly imageEmpty: string;
    /** The browser could not make a preview of the image. */
    readonly imagePreviewFailed: string;
    readonly ariaHostPicker: string;
    readonly ariaWorkspacePicker: string;
    /** Spoken name of the model seat's trigger when the wiring mounts no picker node. */
    readonly ariaOpenModelPicker: string;
    /** Spoken name of the thumbnail rail group. */
    readonly ariaImages: string;
    /** Spoken name of one image's remove button; `{name}` is replaced. */
    readonly ariaRemoveImage: string;
    /** Spoken name of the rail's paging arrows, shown while it overflows. */
    readonly ariaImageScrollLeft: string;
    readonly ariaImageScrollRight: string;
    /** Spoken name of the original-image preview dialog and of its close control. */
    readonly ariaImagePreviewDialog: string;
    readonly ariaImagePreviewClose: string;
    /** Tooltip of a thumbnail, which opens the original image. */
    readonly ariaOpenOriginal: string;
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
    readonly completionSessions: readonly DraftCompletionSession[];
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
    /**
     * The images attached to the current draft, in paste order, as the wiring
     * holds them. The panel reads and displays them and never stores a copy.
     */
    readonly images: readonly DraftImageView[];
    /**
     * `true` while the pending request froze images along with its text, so the
     * resume hint can say those resend too. Absent/false when it carried none.
     */
    readonly pendingImages?: boolean | undefined;
    /**
     * Why the last paste or restore left something out, shown once beside the
     * rail. It is the wiring's verdict, keyed to the draft, so it never travels
     * to another Host or Workspace's draft.
     */
    readonly imageFailure?: DraftImageFailure | undefined;
    /**
     * The selected Host cannot take images in a first message (an older online
     * remote Host). Pasting and previewing still work; only a fresh send that
     * carries images waits.
     */
    readonly imageSubmitUnavailable?: boolean | undefined;
    /**
     * A submit for the current target is in flight on the wiring's side (it
     * may spend a while encoding images before the request leaves). The panel
     * keeps its own flag for the call it made; this one covers a composer that
     * was remounted meanwhile, whose local flag started over at rest.
     */
    readonly submitting?: boolean | undefined;
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
    readonly onSelectWorkspace: (workspaceId: WorkspaceId) => void;
    readonly remoteWorkspace?: (hostId: HostId, generation: number) => RemoteWorkspaceActions;
    readonly onSelectPreset?: (id: string) => void;
    readonly onTextChange: (text: string, expectedGeneration?: number, expectedText?: string) => boolean;
    readonly loadFileCandidates: (generation: number, query: string, signal: AbortSignal) => Promise<readonly DraftFileCandidate[]>;
    /**
     * Add pasted image files to the current draft. `generation` names the
     * target the paste was made on: the wiring drops it when the target has
     * since moved, so an image never lands on a Host the user has left. Every
     * file is `image/*`; the wiring alone decides which ones it takes.
     */
    readonly onPasteImages: (generation: number, files: readonly File[]) => void;
    /** Remove one image from the current draft, under the same generation rule. */
    readonly onRemoveImage: (generation: number, id: string) => void;
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
    readonly renderFactorySlot?: RenderNativeDirectoryBrowser | undefined;
}
/** Host and workspace selection for the native hero row. */
export declare function NewConversationTarget({ useView, actions, renderWorkspace, renderDraftPreset, renderFactorySlot }: NewConversationPanelProps & {
    renderWorkspace?: NativeWorkspaceControl;
    renderDraftPreset?: NativeDraftPreset;
}): import("react").JSX.Element;
/**
 * Composer for a draft that has no Session binding yet: its text, and the
 * images pasted into it.
 */
export declare function NewConversationComposer({ useView, actions, legacy }: NewConversationPanelProps & {
    legacy?: boolean;
}): import("react").JSX.Element;
export declare function NativeDraftTarget({ useActive, draftAvailable, children, targetSessionId, renderNativeTarget, ...draft }: DraftSlotProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode> | null | undefined;
export declare function NativeDraftComposer({ useActive, draftAvailable, children, ...draft }: DraftSlotProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode> | null | undefined;
/** Compatibility panel for DSH versions without the native draft slots. */
export declare function NewConversationPanel(props: NewConversationPanelProps): import("react").JSX.Element;
//# sourceMappingURL=NewConversationPanel.d.ts.map