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
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { DraftSlotProps, NativeDraftPreset, NativeWorkspaceControl } from './register.ts'
import { fromVirtual } from '../../virtual-id.js'
import { RemoteWorkspaceDialog, remoteWorkspaceCopy, type RemoteWorkspaceActions } from './RemoteWorkspaceDialog.tsx'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconCloseFillRegular,
  IconFolderCloseRegular, IconPlusOutlineRegular, ImageLightbox, Menu, observeComposition, type ImageLightboxLabels, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { DRAFT_IMAGE_LIMIT } from '../../client-data/draft-images.ts'
import { MAX_DRAFT_IMAGE_BYTES } from '../../upload-limits.ts'
import {
  isBareModelCommand, LOCAL_HOST, pastedImages, submitActivation, submitBlockOf,
  type DraftTargetState, type HostDirectorySnapshot, type HostId,
  type SubmitGateInput, type WorkspaceId,
} from './target.ts'

/** One image attached to the draft, as the wiring already holds it. */
export interface DraftImageView {
  /** Stable identity for removal and for React's key. */
  readonly id: string
  /** Display name, already trimmed and defaulted by the wiring. */
  readonly name: string
  /** An object URL of the image bytes, owned and revoked by the wiring. */
  readonly url: string
}

/** Why the last paste or restore did not add every image; one verdict per draft, keyed by the wiring. */
export type DraftImageFailure = 'unsupported' | 'limit' | 'empty' | 'preview'

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
  /** ID as displayed by the merged workspace controller. */
  readonly displayId?: string
  /** Display title. */
  readonly label: string
  readonly path?: string
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
  readonly submit: string
  readonly submitting: string
  /** The submit action's label while the draft is a bare `/model`. */
  readonly openModelPicker: string
  /** The submit action's label while a previous request is pending resumption. */
  readonly retrySubmission: string
  /** Hint under the submit while a previous request is pending: it resumes the submitted snapshot, not the draft. */
  readonly resumeHint: string
  /** The same hint while the frozen request carried images, so the user knows those resend too. */
  readonly resumeImagesHint: string
  readonly pickWorkspaceFirst: string
  readonly pickHostFirst: string
  /** Why submit waits while the draft has neither text nor images; also the hint under the submit. */
  readonly writeFirstMessage: string
  /**
   * The textarea's placeholder: the one place an empty draft is told it can
   * take an image. The submit's own hint stays `writeFirstMessage`, so the
   * same sentence is not shown twice.
   */
  readonly writeOrPasteFirst: string
  /** Why submit waits while no model is resolved; also the hint under the submit. */
  readonly pickModelFirst: string
  readonly hostOffline: string
  /** Why submit waits while the draft's images exceed what the selected Host can take. */
  readonly imagesUnavailable: string
  /** A pasted image had a type the Host refuses (not PNG, JPG, WebP or GIF). */
  readonly imageUnsupported: string
  /** The draft reached the image count or total size; `{count}` and `{mib}` are replaced. */
  readonly imageLimit: string
  /** A pasted image had no bytes. */
  readonly imageEmpty: string
  /** The browser could not make a preview of the image. */
  readonly imagePreviewFailed: string
  readonly ariaHostPicker: string
  readonly ariaWorkspacePicker: string
  /** Spoken name of the model seat's trigger when the wiring mounts no picker node. */
  readonly ariaOpenModelPicker: string
  /** Spoken name of the thumbnail rail group. */
  readonly ariaImages: string
  /** Spoken name of one image's remove button; `{name}` is replaced. */
  readonly ariaRemoveImage: string
  /** Spoken name of the rail's paging arrows, shown while it overflows. */
  readonly ariaImageScrollLeft: string
  readonly ariaImageScrollRight: string
  /** Spoken name of the original-image preview dialog and of its close control. */
  readonly ariaImagePreviewDialog: string
  readonly ariaImagePreviewClose: string
  /** Tooltip of a thumbnail, which opens the original image. */
  readonly ariaOpenOriginal: string
}

/**
 * Everything the panel renders that can change from outside React, as one
 * snapshot. The wiring publishes a new object when any member moves; the
 * panel subscribes once. `modelPicker` is the one node-valued member: the
 * T3 `DraftPicker` is mounted by the wiring and placed here, so the panel
 * never imports another plugin's component.
 */
export interface NewConversationView {
  readonly mainSessionId?: string | undefined
  readonly returnSessionId?: string | undefined
  readonly target: DraftTargetState
  readonly directory: HostDirectorySnapshot
  /** Why the roster failed, when it did; shown with the retry action. */
  readonly directoryError: string | undefined
  readonly workspaces: readonly WorkspaceOption[]
  readonly canAddRemoteWorkspace?: boolean
  readonly presets?: readonly { id: string; label: string; name?: string; description?: string }[]
  readonly agentPreset?: string | undefined
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
  /**
   * The images attached to the current draft, in paste order, as the wiring
   * holds them. The panel reads and displays them and never stores a copy.
   */
  readonly images: readonly DraftImageView[]
  /**
   * `true` while the pending request froze images along with its text, so the
   * resume hint can say those resend too. Absent/false when it carried none.
   */
  readonly pendingImages?: boolean | undefined
  /**
   * Why the last paste or restore left something out, shown once beside the
   * rail. It is the wiring's verdict, keyed to the draft, so it never travels
   * to another Host or Workspace's draft.
   */
  readonly imageFailure?: DraftImageFailure | undefined
  /**
   * The selected Host cannot take images in a first message (an older online
   * remote Host). Pasting and previewing still work; only a fresh send that
   * carries images waits.
   */
  readonly imageSubmitUnavailable?: boolean | undefined
  /**
   * A submit for the current target is in flight on the wiring's side (it
   * may spend a while encoding images before the request leaves). The panel
   * keeps its own flag for the call it made; this one covers a composer that
   * was remounted meanwhile, whose local flag started over at rest.
   */
  readonly submitting?: boolean | undefined
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
  readonly onOpenHostDraft?: (hostId: HostId) => void
  readonly onReturnToSession?: () => void
  readonly onSelectWorkspace: (workspaceId: WorkspaceId) => void
  readonly remoteWorkspace?: (hostId: HostId, generation: number) => RemoteWorkspaceActions
  readonly onSelectPreset?: (id: string) => void
  readonly onTextChange: (text: string) => void
  /**
   * Add pasted image files to the current draft. `generation` names the
   * target the paste was made on: the wiring drops it when the target has
   * since moved, so an image never lands on a Host the user has left. Every
   * file is `image/*`; the wiring alone decides which ones it takes.
   */
  readonly onPasteImages: (generation: number, files: readonly File[]) => void
  /** Remove one image from the current draft, under the same generation rule. */
  readonly onRemoveImage: (generation: number, id: string) => void
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
    hasImages: view.images.length > 0,
    imagesUnavailable: view.imageSubmitUnavailable === true,
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
    case 'images-unsupported': return copy.imagesUnavailable
    case 'host-offline': return copy.hostOffline
    /* v8 ignore next -- the union is closed; a new reason must name its copy. */
    default: return assertUnreachable(reason)
  }
}

/** Fill a copy string's `{placeholder}`s; an unfilled one is the copy author's, not the panel's, to notice. */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (_match, key: string) => String(values[key] ?? `{${key}}`))
}

/** The image-count/size copy with its two numbers filled from the wiring's shared limits. */
function imageLimitCopy(copy: NewConversationCopy): string {
  // Whole MiB: the limit is a whole number of mebibytes, and a fraction here would be noise.
  return fill(copy.imageLimit, { count: DRAFT_IMAGE_LIMIT, mib: Math.round(MAX_DRAFT_IMAGE_BYTES / (1024 * 1024)) })
}

/** Why the last paste left something out; one sentence from the wiring's verdict. */
function imageFailureCopy(copy: NewConversationCopy, failure: DraftImageFailure): string {
  switch (failure) {
    case 'unsupported': return copy.imageUnsupported
    case 'limit': return imageLimitCopy(copy)
    case 'empty': return copy.imageEmpty
    case 'preview': return copy.imagePreviewFailed
    /* v8 ignore next -- the union is closed; a new verdict must name its copy. */
    default: return assertUnreachable(failure)
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
  readonly kind: 'host' | 'workspace' | 'preset'
  readonly open: boolean
  readonly onToggle: () => void
  readonly onClose: () => void
  readonly items: readonly MenuEntry[]
  readonly footer?: readonly MenuEntry[]
  readonly opensDialog?: boolean
  readonly triggerRef?: RefObject<HTMLButtonElement>
  readonly selectedId: string | undefined
  readonly onSelect: (id: string) => void
  readonly disabled: boolean
}) {
  const trigger = (
    <button
      ref={props.triggerRef}
      type="button"
      className="zr-newc-picker"
      data-zen-remote="new-conversation-picker"
      aria-label={props.ariaLabel}
      aria-haspopup={props.opensDialog ? 'dialog' : 'menu'}
      aria-expanded={props.opensDialog ? undefined : props.open}
      disabled={props.disabled}
      onClick={props.onToggle}
    >
      {props.opensDialog ? <IconPlusOutlineRegular size={16} /> : props.kind === 'workspace' ? <IconFolderCloseRegular size={16} /> : <TargetIcon kind={props.kind} />}
      <span className="zr-newc-pickerLabel">{props.label}</span>
      {!props.opensDialog && <Chevron />}
    </button>
  )
  if (props.opensDialog) return trigger
  return (
    <Menu
      open={props.open}
      anchor={trigger}
      items={props.items}
      {...(props.footer === undefined ? {} : { footer: props.footer })}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      onClose={props.onClose}
      portal
    />
  )
}

function Chevron() {
  return <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

function TargetIcon({ kind }: { kind: 'host' | 'preset' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" aria-hidden>
      {kind === 'host' && <path d="M2 3h12v8H2zM6 14h4m-2-3v3" />}
      {kind === 'preset' && <><path d="m8 3 5 9H3z" /><circle cx="8" cy="3" r="1.5" fill="var(--dsw-alias-bg-base)" /><circle cx="3" cy="12" r="1.5" fill="var(--dsw-alias-bg-base)" /><circle cx="13" cy="12" r="1.5" fill="var(--dsw-alias-bg-base)" /></>}
    </svg>
  )
}

function HostPicker({ copy, directory, hostId, onSelect }: {
  copy: NewConversationCopy; directory: HostDirectorySnapshot; hostId: HostId; onSelect: (id: HostId) => void
}) {
  const [open, setOpen] = useState(false)
  const items: MenuEntry[] = directory.phase === 'ready'
    ? [{ id: LOCAL_HOST, label: copy.localHost }, ...directory.hosts
        .filter(host => host.status !== 'unpaired')
        .map(host => ({ id: host.hostId, label: host.label }))]
    : []
  if (items.length <= 1 && hostId === LOCAL_HOST) return null
  return <Picker
    label={hostName(copy, directory, hostId)}
    kind="host"
    ariaLabel={copy.ariaHostPicker}
    open={open}
    onToggle={() => { setOpen(value => !value) }}
    onClose={() => { setOpen(false) }}
    items={items}
    selectedId={hostId}
    onSelect={id => {
      setOpen(false)
      if (id !== hostId) onSelect(id)
    }}
    disabled={directory.phase !== 'ready'}
  />
}

function workspacePathSuffix(path: string, paths: readonly string[]): string {
  const segments = path.split(/([\\/])/u)
  const peers = paths.filter(peer => peer !== path)
  for (let count = 1; count < segments.length; count += 2) {
    const suffix = segments.slice(-count).join('')
    if (suffix !== '' && peers.every(peer => peer !== suffix && !peer.endsWith(`/${suffix}`) && !peer.endsWith(`\\${suffix}`))) return suffix
  }
  return path
}

function DraftWorkspacePicker({ view, actions }: { view: NewConversationView; actions: NewConversationPanelActions }) {
  const { target, directory, workspaces, copy, canAddRemoteWorkspace } = view
  const { hostId, generation } = target
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (adding || !restoreFocus.current) return
    restoreFocus.current = false
    trigger.current?.focus()
  }, [adding])
  const openAdd = () => { restoreFocus.current = true; setAdding(true) }
  const remote = useMemo(() => actions.remoteWorkspace?.(hostId, generation), [actions, hostId, generation])
  const canAdd = remote !== undefined && canAddRemoteWorkspace === true
  const zh = copy.title === '新会话'
  const words = remoteWorkspaceCopy(zh)
  const addId = '::add-workspace'
  const pathsByTitle = new Map<string, string[]>()
  for (const { label, path } of workspaces) {
    if (path === undefined) continue
    const paths = pathsByTitle.get(label) ?? []
    paths.push(path)
    pathsByTitle.set(label, paths)
  }
  const items: MenuEntry[] = workspaces.map(({ workspaceId, label, path }) => {
    const paths = pathsByTitle.get(label) ?? []
    const suffix = path === undefined || paths.length < 2 ? undefined : workspacePathSuffix(path, paths)
    return {
      id: workspaceId,
      label: suffix === undefined ? label : <span className="zr-newc-workspaceOption" title={path}>
        <span>{label}</span>{' '}<small>{suffix}</small>
      </span>,
      icon: <IconFolderCloseRegular size={16} />,
    }
  })
  const openDialogDirectly = items.length === 0 && canAdd
  const selected = workspaces.find(workspace => workspace.workspaceId === target.workspaceId)
  return <>
    <Picker
      kind="workspace"
      label={openDialogDirectly ? words.menuAdd : selected?.label ?? (items.length === 0 ? copy.noWorkspaces : copy.chooseWorkspace)}
      ariaLabel={openDialogDirectly ? words.menuAdd : copy.ariaWorkspacePicker}
      opensDialog={openDialogDirectly}
      open={open}
      triggerRef={trigger}
      onToggle={() => { if (openDialogDirectly) openAdd(); else setOpen(value => !value) }}
      onClose={() => setOpen(false)}
      items={items}
      footer={canAdd ? [{ id: addId, label: words.menuAdd, icon: <IconPlusOutlineRegular size={16} /> }] : []}
      selectedId={target.workspaceId}
      onSelect={id => {
        setOpen(false)
        if (id === addId) openAdd()
        else if (id !== target.workspaceId) actions.onSelectWorkspace(id)
      }}
      disabled={directory.phase !== 'ready' || (items.length === 0 && !canAdd)}
    />
    {adding && remote !== undefined && <RemoteWorkspaceDialog
      host={hostName(copy, directory, hostId)} zh={zh} actions={remote} available={canAdd} onClose={() => setAdding(false)}
    />}
  </>
}

/**
 * The draft's images as a horizontal thumbnail rail above the text, laid out
 * like the native composer's (`ui-attachment` AttachmentRail +
 * ComposerAttachments): 64px rounded thumbnails, a remove control at each
 * one's top-right corner that shows on hover and stays on touch, a click on a
 * thumbnail opening the original, and edge arrows that page an overflow.
 *
 * The owner mounts it only while the draft has an image, so a mount is what
 * installs the observers below.
 *
 * The rail scrolls horizontally only. A vertical wheel tick is turned into a
 * horizontal step and consumed, so panning the images never scrolls the page
 * behind the composer.
 */
function DraftImageRail({ images, copy, locked, onRemove }: {
  images: readonly DraftImageView[]
  copy: NewConversationCopy
  /** No image may be removed; viewing stays open. */
  locked: boolean
  onRemove: (id: string) => void
}) {
  const rail = useRef<HTMLDivElement>(null)
  /** How many images the previous layout counted; null before the first pass. */
  const count = useRef<number | null>(null)
  /** Which paging arrows the overflow needs; null until the first layout, so none flash in. */
  const [edges, setEdges] = useState<{ readonly left: boolean; readonly right: boolean } | null>(null)
  /** The image shown in the original-size preview; closed by the lightbox or by the image leaving the draft. */
  const [preview, setPreview] = useState<DraftImageView | null>(null)
  const lightboxLabels = useMemo<ImageLightboxLabels>(() => ({ dialog: copy.ariaImagePreviewDialog, close: copy.ariaImagePreviewClose }), [copy])
  /** Stable across re-renders: the lightbox keeps its dialog binding, focus return included, through every view publish. */
  const closePreview = useCallback(() => { setPreview(null) }, [])
  const updateEdges = useCallback(() => {
    const el = rail.current
    if (el === null) return
    // 1px slack: engines report fractional scroll positions at the edges.
    const left = el.scrollLeft > 1
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    setEdges(previous => previous !== null && previous.left === left && previous.right === right ? previous : { left, right })
  }, [])
  useLayoutEffect(() => {
    // Read before the count is moved: a mount (no earlier count) reveals the
    // newest image, which is at the end of a draft the user pasted into, and
    // a count that grew reveals the image just added. A removal moves nothing,
    // as in the native rail.
    const grew = count.current === null || images.length > count.current
    count.current = images.length
    const el = rail.current
    if (el === null) return
    if (grew) el.scrollLeft = el.scrollWidth - el.clientWidth
    updateEdges()
  }, [images.length, updateEdges])
  useEffect(() => {
    const el = rail.current
    if (el === null) return
    // The rail's width follows the composer, which resizes with sidebars and
    // panels and not only the window, so the element itself is observed.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateEdges)
    observer?.observe(el)
    // React's root wheel listener is passive, so the exclusion needs this
    // manually attached non-passive one. LINE and PAGE deltas (Firefox notch
    // wheels) are normalised to pixels before the per-tick clamp. A diagonal
    // trackpad pan keeps its horizontal intent; a pure vertical wheel is
    // turned into a horizontal step.
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientWidth : 1
      event.preventDefault()
      el.scrollBy({
        left: event.deltaX !== 0 ? event.deltaX * scale : Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) * scale, 60),
        behavior: 'auto',
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { observer?.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [updateEdges])
  // A removed image cannot stay the preview: close rather than show a revoked URL.
  useEffect(() => {
    if (preview !== null && !images.some(image => image.id === preview.id)) setPreview(null)
  }, [images, preview])
  const page = (direction: -1 | 1): void => {
    const el = rail.current
    if (el === null) return
    // One viewport minus a thumbnail keeps the last visible image as context;
    // the floor keeps a narrow rail paging a useful distance.
    el.scrollBy({ left: direction * Math.max(el.clientWidth - 64, 200), behavior: 'auto' })
  }
  return (
    <div className="zr-newc-images" data-zen-remote="new-conversation-images" data-locked={locked || undefined}>
      {edges?.left === true && (
        <button type="button" className="zr-newc-imageArrow zr-newc-imageArrowLeft" aria-label={copy.ariaImageScrollLeft} onClick={() => { page(-1) }}>
          <IconChevronLeftOutlineRegular />
        </button>
      )}
      <div ref={rail} className="zr-newc-imageRail" role="group" aria-label={copy.ariaImages} onScroll={updateEdges}>
        {images.map(image => (
          <div key={image.id} className="zr-newc-image" data-zen-remote="new-conversation-image" data-image-id={image.id}>
            <button
              type="button"
              className="zr-newc-imagePreview"
              data-zen-remote="new-conversation-image-preview"
              title={copy.ariaOpenOriginal}
              onClick={() => { setPreview(image) }}
            >
              <img src={image.url} alt={image.name} />
            </button>
            <button
              type="button"
              className="zr-newc-imageRemove"
              data-zen-remote="new-conversation-image-remove"
              aria-label={fill(copy.ariaRemoveImage, { name: image.name })}
              disabled={locked}
              onClick={() => { onRemove(image.id) }}
            >
              <IconCloseFillRegular size={12} />
            </button>
          </div>
        ))}
      </div>
      {edges?.right === true && (
        <button type="button" className="zr-newc-imageArrow zr-newc-imageArrowRight" aria-label={copy.ariaImageScrollRight} onClick={() => { page(1) }}>
          <IconChevronRightOutlineRegular />
        </button>
      )}
      {preview !== null && <ImageLightbox src={preview.url} alt={preview.name} labels={lightboxLabels} onClose={closePreview} />}
    </div>
  )
}

/** Host and workspace selection for the native hero row. */
export function NewConversationTarget({ useView, actions, renderWorkspace, renderDraftPreset }: NewConversationPanelProps & { renderWorkspace?: NativeWorkspaceControl; renderDraftPreset?: NativeDraftPreset }) {
  const view = useView(state => state)
  const { target, directory, workspaces, presets, agentPreset, copy, returnSessionId } = view
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const mode = copy.title === '新会话' ? '模式' : 'Mode'
  const selectedWorkspace = workspaces.find(workspace => workspace.workspaceId === target.workspaceId)
  const fallbackPreset = presets !== undefined && (
    <Picker
      kind="preset"
      label={presets.find(preset => preset.id === agentPreset)?.label ?? mode}
      ariaLabel={mode}
      open={presetMenuOpen}
      onToggle={() => { setPresetMenuOpen(open => !open) }}
      onClose={() => { setPresetMenuOpen(false) }}
      items={presets}
      selectedId={agentPreset}
      onSelect={id => { setPresetMenuOpen(false); actions.onSelectPreset?.(id) }}
      disabled={directory.phase !== 'ready' || presets.length < 2}
    />
  )
  return (
    <>
      <HostPicker copy={copy} directory={directory} hostId={target.hostId} onSelect={actions.onSelectHost} />
      {returnSessionId !== undefined && <Button variant="outline" size="sm" onClick={actions.onReturnToSession}>
        {copy.title === '新会话' ? '返回原会话' : 'Return to previous session'}
      </Button>}
      {target.hostId === LOCAL_HOST && renderWorkspace !== undefined ? renderWorkspace({
        label: selectedWorkspace?.label,
        selectedId: selectedWorkspace?.displayId,
        filterWorkspace: id => (fromVirtual(id)?.serverId ?? LOCAL_HOST) === target.hostId,
        workspaceTitle: (id, title) => workspaces.find(workspace => workspace.displayId === id)?.label ?? title,
        allowAddWorkspace: true,
        onPick: id => {
          const origin = fromVirtual(id)
          if ((origin?.serverId ?? LOCAL_HOST) !== target.hostId) return
          actions.onSelectWorkspace(origin === undefined ? id : origin.id.replace(/^#\d+~/u, ''))
        },
      }) : <DraftWorkspacePicker key={target.hostId} view={view} actions={actions} />}
      {renderDraftPreset === undefined ? fallbackPreset : renderDraftPreset({
        options: presets ?? [],
        selectedId: agentPreset,
        disabled: directory.phase !== 'ready',
        remote: target.hostId !== LOCAL_HOST,
        onSelect: id => actions.onSelectPreset?.(id),
      }, fallbackPreset)}
    </>
  )
}

/**
 * Composer for a draft that has no Session binding yet: its text, and the
 * images pasted into it.
 */
export function NewConversationComposer({ useView, actions }: NewConversationPanelProps) {
  // One subscription to the whole view: every member is published together
  // as one snapshot, so selecting members separately would gain nothing.
  const view = useView(member => member)
  const {
    target, directory, directoryError, text, selection, modelPicker, copy,
    images, imageFailure,
  } = view
  /** Whether the pending request froze images; edits to the visible images wait until it is resolved. */
  const pendingImages = view.pendingImages === true
  /** This composer's own submit is in flight: the call it made has not answered. */
  const [starting, setStarting] = useState(false)
  /**
   * A submit is in flight: this composer's own, or the wiring's for the
   * current target. The second matters for a composer remounted while the
   * wiring is still encoding images: its local flag started over at rest.
   */
  const submitting = starting || view.submitting === true
  /**
   * The failure of the last submit, shown until the next submit or an edit.
   * It is filed under the generation it was reported for: a refusal is about
   * one request to one target, and the Host and Workspace pickers stay usable
   * during a submit, so a late answer for a draft the user has left must not
   * surface on the draft they moved to.
   */
  const [failure, setFailure] = useState<{ readonly generation: number; readonly message: string } | null>(null)
  /** The failure, only while the target it belongs to is still the one on screen. */
  const shownFailure = failure !== null && failure.generation === target.generation ? failure.message : null
  const hintId = useId()
  const editor = useRef<HTMLTextAreaElement>(null)
  const composition = useRef<ReturnType<typeof observeComposition> | undefined>(undefined)
  useEffect(() => {
    const document = editor.current?.ownerDocument
    if (document === undefined) return
    const observer = observeComposition(document)
    composition.current = observer
    return () => { observer.dispose(); composition.current = undefined }
  }, [])
  const ready = directory.phase === 'ready'
  useEffect(() => { if (ready) editor.current?.focus() }, [ready])

  const pending = view.pendingSubmission === true
  const gate = gateInput(view)
  /** A bare `/model` turns the submit action into the picker's opener. */
  const bareModel = isBareModelCommand(text)
  const block = bareModel ? null : submitBlock(view)
  const offline = hostEntry(directory, target.hostId)?.status === 'offline'
  /** Neither typing nor pasting is possible: the roster is not in, or a submit is in flight. */
  const locked = !ready || submitting
  /**
   * No image may be ADDED while any request awaits its retry. The retry
   * resends what it froze and, on success, leaves for the new Session; an
   * image pasted meanwhile would be on screen when that happened yet in no
   * message at all. Text-only pending requests are included for that reason.
   */
  const pasteLocked = locked || pending
  /**
   * The visible images cannot be REMOVED while the frozen request carried
   * images: that retry resends the images it froze, and an edit here would
   * change what the user sees without changing what sends. A text-only
   * pending request froze no images, so the ones on screen are only the
   * draft's and stay removable. Viewing stays open throughout.
   */
  const imagesLocked = locked || pendingImages

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
    setStarting(true)
    setFailure(null)
    // The generation is read here, not in the callback: the answer belongs to
    // the target the request was made from, whichever draft is on screen when
    // it arrives (a resume names the draft the user resumed from, which is the
    // same rule).
    const generation = input.generation
    void actions.onSubmit(input).then((result) => {
      setStarting(false)
      // The wiring owns everything after a success (clearing the submitted
      // draft and navigating), so the panel reports only a refusal. A refusal
      // is always filed: it is about the request the user still has, and it is
      // shown while that request's target is the one on screen.
      if (!result.ok) setFailure({ generation, message: result.message })
    })
  }

  return (
    <div className="zr-newc-composer" data-zen-remote="new-conversation-composer" data-offline={offline || undefined} data-submitting={submitting || undefined}>
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

      <div className="zr-newc-card" data-composer-card>
        {/* Mounted only while the draft has an image, and keyed by the target:
            its scroll and preview state belong to one draft, and a rail that
            mounts is what installs its observers (an always-mounted rail that
            renders nothing until an image exists would never run them). */}
        {images.length > 0 && (
          <DraftImageRail
            key={target.generation}
            images={images}
            copy={copy}
            locked={imagesLocked}
            onRemove={id => { setFailure(null); actions.onRemoveImage(target.generation, id) }}
          />
        )}
        {imageFailure !== undefined && (
          <p className="zr-newc-failure" role="alert" data-zen-remote="new-conversation-image-failure" data-reason={imageFailure}>
            {imageFailureCopy(copy, imageFailure)}
          </p>
        )}
        <textarea
          ref={editor}
          rows={2}
          className="zr-newc-text"
          data-zen-remote="new-conversation-text"
          aria-label={copy.title}
          placeholder={ready ? copy.writeOrPasteFirst : copy.pickHostFirst}
          value={text}
          disabled={locked}
          onChange={(event) => {
            setFailure(null)
            actions.onTextChange(event.currentTarget.value)
          }}
          onPaste={(event) => {
            const transfer = event.clipboardData
            if (transfer === null) return
            // Only a paste that carries an image is the draft's business; a
            // plain text paste never reaches the wiring.
            const files = pastedImages(transfer)
            if (files.length === 0) return
            const hasText = transfer.getData('text/plain') !== ''
            // A request awaiting its retry is the next send, and it resends
            // what it froze: an image added now would be on screen but in no
            // message. The text beside the image, if any, is still the
            // textarea's; the resume hint below already says why.
            if (pasteLocked) {
              if (!hasText) event.preventDefault()
              return
            }
            // The images are the draft's. Text beside them, when the clipboard
            // holds both, stays the textarea's: its own paste inserts it at the
            // caret, as the native composer keeps both. So the default is
            // prevented only when there is no text for it to insert.
            if (!hasText) event.preventDefault()
            setFailure(null)
            actions.onPasteImages(target.generation, files)
          }}
          onKeyDown={(event) => {
            // Enter activates send, Shift+Enter inserts a line break, and IME Enter commits the candidate.
            const composing = composition.current?.guards(event.nativeEvent) ?? event.nativeEvent.isComposing
            if (event.key !== 'Enter' || event.shiftKey || composing) return
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
                disabled={locked}
                onClick={actions.onOpenModelPicker}
              >
                {selection?.model ?? copy.modelUnset}
              </button>
            )}
          </div>
          {shownFailure !== null && (
            <p className="zr-newc-failure" role="alert">{shownFailure}</p>
          )}
          <button
            type="button"
            className="zr-newc-submit"
            data-zen-remote="new-conversation-submit"
            aria-label={submitting ? copy.submitting : bareModel ? copy.openModelPicker : pending ? copy.retrySubmission : copy.submit}
            aria-busy={submitting}
            disabled={(!bareModel && block !== null) || submitting}
            {...(!bareModel && block !== null && block !== copy.writeFirstMessage && !submitting ? { 'aria-describedby': hintId } : {})}
            onClick={activate}
          >
            {submitting ? (
              <svg className="zr-newc-spinner" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
                <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                <path d="M8 14V2M2.5 7.5 8 2l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </footer>
      </div>
      {block !== null && block !== copy.writeFirstMessage && !bareModel && !submitting && (
        <p id={hintId} className="zr-newc-hint" data-zen-remote="new-conversation-hint">{block}</p>
      )}
      {/* The resume hint names what the action will do, so the user does not
          expect the edited draft to be what resumes; a frozen request that
          carried images says so. It is separate from the submit's own
          described-by, which stays on the gate hint above. */}
      {pending && !bareModel && !submitting && (
        <p className="zr-newc-hint" role="status" data-zen-remote="new-conversation-resume-hint" data-images={pendingImages || undefined}>
          {pendingImages ? copy.resumeImagesHint : copy.resumeHint}
        </p>
      )}
    </div>
  )
}

export function NativeDraftTarget({ useActive, draftAvailable, children, targetSessionId, renderNativeTarget, ...draft }: DraftSlotProps) {
  const directory = draft.useView(view => view.directory)
  const copy = draft.useView(view => view.copy)
  const mainSessionId = draft.useView(view => view.mainSessionId)
  if (useActive(active => active && draftAvailable)) return <NewConversationTarget {...draft} />
  if (renderNativeTarget === undefined) return children
  const hostId = fromVirtual(targetSessionId ?? '')?.serverId ?? LOCAL_HOST
  const name = hostEntry(directory, hostId)?.label
  const prefix = name === undefined ? undefined : `[${name}] `
  const nativeTarget = renderNativeTarget((id, label) => {
    if ((fromVirtual(id)?.serverId ?? LOCAL_HOST) !== hostId) return undefined
    return prefix !== undefined && label.startsWith(prefix) ? label.slice(prefix.length) : label
  })
  return <>
    {targetSessionId !== undefined && targetSessionId === mainSessionId && draft.actions.onOpenHostDraft !== undefined && (
      <HostPicker copy={copy} directory={directory} hostId={hostId} onSelect={draft.actions.onOpenHostDraft} />
    )}
    {nativeTarget}
  </>
}

export function NativeDraftComposer({ useActive, draftAvailable, children, ...draft }: DraftSlotProps) {
  return useActive(active => active && draftAvailable) ? <NewConversationComposer {...draft} /> : children
}

/** Compatibility panel for DSH versions without the native draft slots. */
export function NewConversationPanel(props: NewConversationPanelProps) {
  const { copy, directory } = props.useView(state => state)
  const titleId = useId()
  return (
    <section className="zr-newc" data-zen-remote="new-conversation" data-phase={directory.phase} aria-labelledby={titleId}>
      <header className="zr-newc-header">
        <h2 id={titleId} className="zr-newc-title">{copy.title}</h2>
        <div className="zr-newc-target"><NewConversationTarget {...props} /></div>
      </header>
      <NewConversationComposer {...props} />
    </section>
  )
}
