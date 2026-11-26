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
import { useId, useState, type ReactNode } from 'react'
import { Button, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  isBareModelCommand, LOCAL_HOST, submitActivation, submitBlockOf,
  type DraftTargetState, type HostDirectorySnapshot, type HostId,
  type SubmitGateInput, type WorkspaceId,
} from './target.ts'

/** The model a draft will start with, resolved by the user before the first send. */
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  /** Explicit reasoning effort; absent follows the adapter default (DSH `ModelSelection`). */
  readonly reasoningEffort?: string | undefined
}

/** One Workspace candidate of the current Host. */
export interface WorkspaceOption {
  /** Original Workspace id, as draft keys use it. */
  readonly workspaceId: WorkspaceId
  /** Display title. */
  readonly label: string
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
  readonly resume?: boolean | undefined
  /** Target generation now; on a resume, which draft the user resumed from. */
  readonly generation: number
  /** Absent on a resume (the frozen request names its own Host). */
  readonly hostId?: HostId | undefined
  /** Absent on a resume (the frozen request names its own Workspace). */
  readonly workspaceId?: WorkspaceId | undefined
  /** Absent on a resume (the frozen request names its own model). */
  readonly selection?: ModelSelection | undefined
  /** Absent on a resume (the frozen request carries its own text). */
  readonly text?: string | undefined
}

/** A confirmed creation or an error to display alongside the retained draft. */
export type SubmitResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** Every product-visible string the panel renders. */
export interface NewConversationCopy {
  readonly title: string
  readonly hostLabel: string
  readonly workspaceLabel: string
  readonly localHost: string
  readonly chooseWorkspace: string
  readonly noWorkspaces: string
  readonly loadingHosts: string
  readonly directoryFailed: string
  readonly retry: string
  readonly offlineHost: string
  readonly unpairedNotice: string
  /** Label of the model seat while no model is staged; it is the picker's trigger, not a default. */
  readonly modelUnset: string
  readonly placeholder: string
  readonly submit: string
  readonly submitting: string
  /** The submit action's label while the draft is a bare `/model`. */
  readonly openModelPicker: string
  /** The submit action's label while a previous request is pending resumption. */
  readonly retrySubmission: string
  /** Hint under the submit while a previous request is pending: it resumes the submitted snapshot, not the draft. */
  readonly resumeHint: string
  readonly pickWorkspaceFirst: string
  readonly pickHostFirst: string
  readonly writeFirstMessage: string
  /** Why submit waits while no model is resolved; also the hint under the submit. */
  readonly pickModelFirst: string
  readonly hostOffline: string
  readonly ariaHostPicker: string
  readonly ariaWorkspacePicker: string
  /** Spoken name of the model seat's trigger when the wiring mounts no picker node. */
  readonly ariaOpenModelPicker: string
}

/**
 * Everything the panel renders that can change from outside React, as one
 * snapshot. The wiring publishes a new object when any member moves; the
 * panel subscribes once. `modelPicker` is the one node-valued member: the
 * T3 `DraftPicker` is mounted by the wiring and placed here, so the panel
 * never imports another plugin's component.
 */
export interface NewConversationView {
  readonly target: DraftTargetState
  readonly directory: HostDirectorySnapshot
  /** Why the roster failed, when it did; shown with the retry action. */
  readonly directoryError: string | undefined
  readonly workspaces: readonly WorkspaceOption[]
  /** The current target's draft text. */
  readonly text: string
  /** The staged model; null until the user resolves one, which blocks submit. */
  readonly selection: ModelSelection | null
  /**
   * The model picker the wiring mounts (T3 `DraftPicker`), or undefined when
   * none is mounted: the seat then shows the unset label and opens the
   * picker through `actions.onOpenModelPicker` instead.
   */
  readonly modelPicker: ReactNode | undefined
  /**
   * A previous submit the Host has not confirmed or refused, so its frozen
   * request can be resumed. While set, the submit action RETRIES that
   * snapshot rather than sending the draft: the model, text, roster and
   * offline gates do not apply, because none of them describe the request
   * being resumed. `false`/absent means no such request is pending.
   */
  readonly pendingSubmission?: boolean | undefined
  readonly copy: NewConversationCopy
}

/**
 * The view as an observable source, placed in the registration's `hooks`
 * compartment. The renderer binds it into a `useView` selector hook and
 * hands the component THAT (ui-renderer bindInjectSources), so the panel
 * reads the framework-made hook and owns no subscription.
 */
export type NewConversationViewSource = {
  getSnapshot(): NewConversationView
  subscribe(listener: () => void): () => void
}

/**
 * Selector hook over the view, as the renderer binds it. Canonical
 * `SnapshotSelectorHook` shape: select one member, re-render only when that
 * member's reference changes.
 */
export type UseNewConversationView = <S>(selector: (view: NewConversationView) => S) => S

/** Stable callbacks the wiring provides. */
export interface NewConversationPanelActions {
  readonly onSelectHost: (hostId: HostId) => void
  readonly onSelectWorkspace: (workspaceId: WorkspaceId) => void
  readonly onTextChange: (text: string) => void
  /**
   * Open the model picker for the current target (the T3 `/model` panel).
   * The wiring owns the opener: it mounts the picker node in the view and
   * drives the same instance here, so a click on the model seat and the
   * `/model` command reach one panel.
   */
  readonly onOpenModelPicker: () => void
  /** Re-fetch the roster after an error; absent when the roster cannot be refetched. */
  readonly onRetryDirectory: (() => void) | undefined
  /**
   * Create the Session and send the first message from one frozen snapshot.
   * The wiring owns everything that follows a success — clearing the
   * submitted draft by compare-and-set against `input`, and navigating to
   * the created Session — so the panel only reports the outcome.
   */
  readonly onSubmit: (input: SubmitInput) => Promise<SubmitResult>
}

/** Props of the new-conversation panel: the framework-bound view hook, the stable actions. */
export interface NewConversationPanelProps {
  readonly useView: UseNewConversationView
  readonly actions: NewConversationPanelActions
}

/** The roster entry for a Host, or undefined for `local` and unknown Hosts. */
function hostEntry(directory: HostDirectorySnapshot, hostId: HostId) {
  return directory.phase === 'ready' ? directory.hosts.find(host => host.hostId === hostId) : undefined
}

/** The name a Host is shown under. */
function hostName(copy: NewConversationCopy, directory: HostDirectorySnapshot, hostId: HostId): string {
  return hostEntry(directory, hostId)?.label ?? (hostId === LOCAL_HOST ? copy.localHost : hostId)
}

/** The submit gates' inputs, read off the view. */
function gateInput(view: NewConversationView): SubmitGateInput {
  return {
    directory: view.directory,
    hostId: view.target.hostId,
    workspaceId: view.target.workspaceId,
    text: view.text,
    hasSelection: view.selection !== null,
    pendingSubmission: view.pendingSubmission === true,
  }
}

/** The gate's reason as user-visible copy; null when the send may go. */
function submitBlock(view: NewConversationView): string | null {
  const { copy } = view
  const reason = submitBlockOf(gateInput(view))
  switch (reason) {
    case undefined: return null
    case 'pick-host': return copy.pickHostFirst
    case 'pick-workspace': return copy.pickWorkspaceFirst
    case 'write-message': return copy.writeFirstMessage
    case 'pick-model': return copy.pickModelFirst
    case 'host-offline': return copy.hostOffline
    /* v8 ignore next -- the union is closed; a new reason must name its copy. */
    default: return assertUnreachable(reason)
  }
}

/** Exhaustiveness for the closed `SubmitBlock` union. */
function assertUnreachable(reason: never): never {
  throw new Error(`unhandled submit block reason: ${String(reason)}`)
}

/** One anchored picker: a trigger button and a portal menu. */
function Picker(props: {
  readonly label: string
  readonly ariaLabel: string
  readonly open: boolean
  readonly onToggle: () => void
  readonly onClose: () => void
  readonly items: readonly MenuEntry[]
  readonly selectedId: string | undefined
  readonly onSelect: (id: string) => void
  readonly disabled: boolean
}) {
  return (
    <Menu
      open={props.open}
      anchor={(
        <button
          type="button"
          className="zr-newc-picker"
          data-zen-remote="new-conversation-picker"
          aria-label={props.ariaLabel}
          aria-haspopup="menu"
          aria-expanded={props.open}
          disabled={props.disabled}
          onClick={props.onToggle}
        >
          <span className="zr-newc-pickerLabel">{props.label}</span>
        </button>
      )}
      items={props.items}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      onClose={props.onClose}
      portal
    />
  )
}

/**
 * The new-conversation panel.
 * @param props - the framework-bound `useView` selector hook and the stable actions.
 * @returns the panel element tree.
 */
export function NewConversationPanel({ useView, actions }: NewConversationPanelProps) {
  // One subscription to the whole view: every member is published together
  // as one snapshot, so selecting members separately would gain nothing.
  const view = useView(member => member)
  const {
    target, directory, directoryError, workspaces, text, selection, modelPicker, copy,
  } = view
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** The failure of the last submit, shown until the next submit or an edit. */
  const [failure, setFailure] = useState<string | null>(null)
  const titleId = useId()
  const hintId = useId()

  // The textarea is controlled and stays mounted across target changes: only
  // its value moves, so focus and caret survive a Host or Workspace switch.
  const hostItems: MenuEntry[] = directory.phase === 'ready'
    ? [
        { id: LOCAL_HOST, label: copy.localHost },
        ...directory.hosts
          .filter(host => host.status !== 'unpaired')
          .map(host => ({ id: host.hostId, label: host.label })),
      ]
    : []
  const workspaceItems: MenuEntry[] = workspaces.map(workspace => ({
    id: workspace.workspaceId,
    label: workspace.label,
  }))
  const selectedWorkspace = workspaces.find(workspace => workspace.workspaceId === target.workspaceId)
  const pending = view.pendingSubmission === true
  const gate = gateInput(view)
  /** A bare `/model` turns the submit action into the picker's opener. */
  const bareModel = isBareModelCommand(text)
  const block = bareModel ? null : submitBlock(view)
  const offline = hostEntry(directory, target.hostId)?.status === 'offline'

  /**
   * Enter and the submit action share this one entry. The order is decided
   * by `submitActivation` (target.ts), which the tests pin: a bare `/model`
   * first, then a pending resume, then a gated fresh send.
   */
  const activate = (): void => {
    switch (submitActivation(text, gate)) {
      case 'open-model-picker':
        // The command is consumed the way the native composer consumes a bare one.
        actions.onTextChange('')
        actions.onOpenModelPicker()
        return
      case 'resume':
        send({ resume: true, generation: target.generation })
        return
      case 'send':
        if (target.workspaceId === undefined || selection === null) return
        send({
          hostId: target.hostId,
          workspaceId: target.workspaceId,
          selection,
          text,
          generation: target.generation,
        })
        return
      case 'blocked':
        return
      /* v8 ignore next -- the union is closed. */
      default:
        return
    }
  }

  const send = (input: SubmitInput): void => {
    if (submitting) return
    setSubmitting(true)
    setFailure(null)
    void actions.onSubmit(input).then((result) => {
      setSubmitting(false)
      // The wiring owns everything after a success (clearing the submitted
      // draft and navigating), so the panel reports only a refusal. A refusal
      // is always shown: it is about the request the user still has.
      if (!result.ok) setFailure(result.message)
    })
  }

  return (
    <section
      className="zr-newc"
      data-zen-remote="new-conversation"
      data-phase={directory.phase}
      data-offline={offline || undefined}
      data-submitting={submitting || undefined}
      aria-labelledby={titleId}
    >
      <header className="zr-newc-header">
        <h2 id={titleId} className="zr-newc-title">{copy.title}</h2>
        <div className="zr-newc-target">
          <span className="zr-newc-targetLabel">{copy.hostLabel}</span>
          <Picker
            label={hostName(copy, directory, target.hostId)}
            ariaLabel={copy.ariaHostPicker}
            open={hostMenuOpen}
            onToggle={() => { setHostMenuOpen(open => !open) }}
            onClose={() => { setHostMenuOpen(false) }}
            items={hostItems}
            selectedId={target.hostId}
            onSelect={(id) => {
              setHostMenuOpen(false)
              if (id !== target.hostId) actions.onSelectHost(id as HostId)
            }}
            disabled={directory.phase !== 'ready'}
          />
          <span className="zr-newc-targetLabel">{copy.workspaceLabel}</span>
          <Picker
            label={selectedWorkspace?.label ?? (workspaces.length === 0 ? copy.noWorkspaces : copy.chooseWorkspace)}
            ariaLabel={copy.ariaWorkspacePicker}
            open={workspaceMenuOpen}
            onToggle={() => { setWorkspaceMenuOpen(open => !open) }}
            onClose={() => { setWorkspaceMenuOpen(false) }}
            items={workspaceItems}
            selectedId={target.workspaceId}
            onSelect={(id) => {
              setWorkspaceMenuOpen(false)
              if (id !== target.workspaceId) actions.onSelectWorkspace(id as WorkspaceId)
            }}
            disabled={directory.phase !== 'ready' || workspaces.length === 0}
          />
        </div>
      </header>

      {target.defaultHostReason === 'unpaired' && (
        <p className="zr-newc-notice" role="status" data-zen-remote="new-conversation-unpaired">{copy.unpairedNotice}</p>
      )}
      {directory.phase === 'pending' && (
        <p className="zr-newc-status" role="status">{copy.loadingHosts}</p>
      )}
      {directory.phase === 'error' && (
        <div className="zr-newc-notice zr-newc-noticeError" role="alert">
          <span>{directoryError ?? copy.directoryFailed}</span>
          {actions.onRetryDirectory !== undefined && (
            <Button variant="outline" size="sm" onClick={actions.onRetryDirectory}>{copy.retry}</Button>
          )}
        </div>
      )}
      {offline && (
        <div className="zr-newc-notice" role="status">
          <span>{copy.hostOffline}</span>
          <Button variant="outline" size="sm" onClick={actions.onRetryDirectory}>{copy.retry}</Button>
        </div>
      )}

      <textarea
        className="zr-newc-text"
        data-zen-remote="new-conversation-text"
        aria-label={copy.title}
        placeholder={directory.phase === 'ready' ? copy.placeholder : copy.pickHostFirst}
        value={text}
        disabled={directory.phase !== 'ready' || submitting}
        onChange={(event) => {
          setFailure(null)
          actions.onTextChange(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          // The native composer's Enter-to-send: Enter activates, Shift+Enter
          // breaks the line. An IME composition's Enter commits the candidate.
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          activate()
        }}
      />

      <footer className="zr-newc-footer">
        {/* The model seat. With a mounted picker node (T3 DraftPicker) the
            node IS the control and owns its own opener; without one the seat
            is a button that asks the wiring to open `/model`, so the seat and
            the command reach the same panel. */}
        <div className="zr-newc-model" data-zen-remote="new-conversation-model">
          {modelPicker ?? (
            <button
              type="button"
              className="zr-newc-modelTrigger"
              data-zen-remote="new-conversation-model-trigger"
              aria-label={copy.ariaOpenModelPicker}
              aria-haspopup="dialog"
              disabled={directory.phase !== 'ready' || submitting}
              onClick={actions.onOpenModelPicker}
            >
              {selection?.model ?? copy.modelUnset}
            </button>
          )}
        </div>
        {failure !== null && (
          <p className="zr-newc-failure" role="alert">{failure}</p>
        )}
        <Button
          variant="primary"
          className="zr-newc-submit"
          data-zen-remote="new-conversation-submit"
          disabled={(!bareModel && block !== null) || submitting}
          {...(!bareModel && block !== null && !submitting ? { 'aria-describedby': hintId } : {})}
          onClick={activate}
        >
          {submitting
            ? copy.submitting
            : bareModel
              ? copy.openModelPicker
              : pending
                ? copy.retrySubmission
                : copy.submit}
        </Button>
      </footer>
      {block !== null && !bareModel && !submitting && (
        <p id={hintId} className="zr-newc-hint" data-zen-remote="new-conversation-hint">{block}</p>
      )}
      {/* The resume hint names what the action will do, so the user does not
          expect the edited draft to be what resumes. It is separate from the
          submit's own described-by, which stays on the gate hint above. */}
      {pending && !bareModel && !submitting && (
        <p className="zr-newc-hint" role="status" data-zen-remote="new-conversation-resume-hint">{copy.resumeHint}</p>
      )}
    </section>
  )
}
