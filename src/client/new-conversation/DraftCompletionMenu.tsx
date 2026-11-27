import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import {
  IconChevronRightOutlineRegular, IconDataOutlineRegular, MenuSurface, rankByName, ReferenceIconRegular,
  relativeTime, useAnchoredMaxHeight,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  detectDraftCompletion, formatDraftFileMention, formatDraftSessionMention, matchDraftCompletionSessions,
  replaceDraftCompletion, type DraftCompletionToken, type DraftFileCandidate,
} from './completion.ts'
import type { NewConversationPanelActions, NewConversationView } from './NewConversationPanel.tsx'
import { LOCAL_HOST } from './target.ts'

const copy = (zh: boolean) => zh ? {
  model: '模型', modelDescription: '选择新会话使用的模型', commands: '命令', suggestions: '补全建议',
  files: '文件与文件夹', sessions: '会话', drill: '进入文件夹', loading: '正在搜索文件…',
  chooseWorkspace: '选择工作区后即可搜索文件。', fileError: '无法搜索所选工作区的文件。', empty: '没有匹配的引用。',
  offline: '主机离线，恢复连接后可搜索文件。',
  remoteSessions: '创建会话后可引用远端会话。', otherCommands: '打开会话后可使用其他命令。',
} : {
  model: 'Model', modelDescription: 'Choose a model for the new session', commands: 'Commands', suggestions: 'Completion suggestions',
  files: 'Files & folders', sessions: 'Sessions', drill: 'Open folder', loading: 'Searching files…',
  chooseWorkspace: 'Choose a workspace to search its files.', fileError: 'Could not search files in this workspace.', empty: 'No matching references.',
  offline: 'The host is offline. File search will resume when it reconnects.',
  remoteSessions: 'Remote session references are available after creating a session.', otherCommands: 'Other commands are available after opening a session.',
}

type CompletionCopy = ReturnType<typeof copy>

type Row = {
  readonly id: string
  readonly section: 'commands' | 'files' | 'sessions'
  readonly label: string
  readonly description?: string
} & (
  | { readonly kind: 'model' }
  | { readonly kind: 'file' | 'folder' | 'session'; readonly mention: string; readonly drill?: string }
)

interface EditorSnapshot {
  readonly text: string
  readonly caret: number
  readonly generation: number
  readonly catalogGeneration: number
}

interface FileRequest { readonly snapshot: EditorSnapshot }

interface FileResult {
  readonly request: FileRequest
  readonly rows: readonly DraftFileCandidate[] | null
}

function sameEditor(left: EditorSnapshot | null, right: EditorSnapshot): boolean {
  return left !== null && left.text === right.text && left.caret === right.caret
    && left.generation === right.generation && left.catalogGeneration === right.catalogGeneration
}

function fileRows(rows: readonly DraftFileCandidate[], token: DraftCompletionToken): Row[] {
  return rows.flatMap((candidate): Row[] => {
    const mention = formatDraftFileMention(candidate, token.quoted)
    if (mention === undefined) return []
    const slash = candidate.path.lastIndexOf('/')
    const directory = candidate.kind === 'directory'
    const drill = directory ? formatDraftFileMention(candidate, token.quoted, true) : undefined
    return [{
      id: `${candidate.kind}:${candidate.path}`, section: 'files', kind: directory ? 'folder' : 'file',
      label: candidate.path.slice(slash + 1) + (directory ? '/' : ''),
      ...(slash < 0 ? {} : { description: candidate.path.slice(0, slash) }), mention,
      ...(drill === undefined ? {} : { drill }),
    }]
  })
}

function sessionAge(at: number | undefined, zh: boolean): string | undefined {
  if (at === undefined) return undefined
  const { n, unit } = relativeTime(at, Date.now())
  if (unit === 'now') return zh ? '刚刚' : 'now'
  const units = zh
    ? { minutes: '分钟', hours: '小时', days: '天', months: '个月', years: '年' }
    : { minutes: 'min', hours: 'h', days: 'd', months: 'mo', years: 'y' }
  return `${n}${units[unit]}`
}

export function useDraftCompletion(
  view: NewConversationView, actions: NewConversationPanelActions, editor: RefObject<HTMLTextAreaElement>, disabled: boolean, legacy: boolean,
) {
  const { target, text } = view
  const { generation, catalogGeneration } = target
  const zh = view.copy.title === '新会话'
  const words = copy(zh)
  const id = useId()
  const composing = useRef(false)
  const pickedWithEnter = useRef(false)
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null)
  const [dismissed, setDismissed] = useState<EditorSnapshot | null>(null)
  const [highlight, setHighlight] = useState<{ request: EditorSnapshot; id: string } | null>(null)
  const [result, setResult] = useState<FileResult | null>(null)
  const [restore, setRestore] = useState<(EditorSnapshot & { readonly keepOpen: boolean }) | null>(null)
  const active = !disabled && snapshot !== dismissed && snapshot?.text === text
    && snapshot.generation === generation && snapshot.catalogGeneration === catalogGeneration ? snapshot : null
  const token = active === null ? null : detectDraftCompletion(active.text, active.caret)
  const query = token?.query ?? ''
  const online = target.hostId === LOCAL_HOST || (view.directory.phase === 'ready'
    && view.directory.hosts.find(host => host.hostId === target.hostId)?.status === 'paired')
  const fileActive = token?.trigger === '@' && target.workspaceId !== undefined && online ? active : null
  const fileRequest = useMemo<FileRequest | null>(() => fileActive === null ? null : { snapshot: fileActive }, [fileActive])
  const currentFiles = result?.request === fileRequest ? result?.rows : undefined
  const { loadFileCandidates } = actions

  useEffect(() => {
    if (fileRequest === null) return
    const controller = new AbortController()
    const fetchFiles = async () => {
      try {
        const rows = await loadFileCandidates(fileRequest.snapshot.generation, query, controller.signal)
        if (!controller.signal.aborted) setResult({ request: fileRequest, rows })
      } catch {
        if (!controller.signal.aborted) setResult({ request: fileRequest, rows: null })
      }
    }
    const timer = setTimeout(() => { void fetchFiles() }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  }, [fileRequest, loadFileCandidates, query])

  useLayoutEffect(() => {
    if (disabled) setSnapshot(null)
  }, [disabled, generation, catalogGeneration])

  useLayoutEffect(() => {
    if (restore === null) return
    setRestore(null)
    const el = editor.current
    if (disabled || restore.text !== text || restore.generation !== generation || restore.catalogGeneration !== catalogGeneration
      || el === null || el.ownerDocument.activeElement !== el || el.value !== restore.text) return
    el.setSelectionRange(restore.caret, restore.caret)
    setSnapshot(restore)
    setDismissed(restore.keepOpen ? null : restore)
  }, [restore, text, generation, catalogGeneration, disabled, editor])

  const matchesModel = (value: string) => rankByName([{ name: 'model', label: words.model }], value).length > 0
  const rows: Row[] = []
  const statuses: string[] = []
  if (token?.trigger === '/') {
    if (matchesModel(query)) {
      rows.push({ id: 'model', section: 'commands', kind: 'model', label: words.model, description: words.modelDescription })
    }
    statuses.push(words.otherCommands)
  } else if (token?.trigger === '@') {
    if (target.workspaceId === undefined) statuses.push(words.chooseWorkspace)
    else if (!online) statuses.push(words.offline)
    else if (currentFiles === null) statuses.push(words.fileError)
    else if (currentFiles === undefined) statuses.push(words.loading)
    else rows.push(...fileRows(currentFiles, token))

    if (!token.quoted && !/[\\/]/u.test(query)) {
      if (target.hostId === LOCAL_HOST && currentFiles !== undefined) {
        // Files rank before Sessions; wait for that section before exposing a
        // default selection so a late response cannot change what Enter picks.
        for (const session of matchDraftCompletionSessions(view.completionSessions, query)) {
          const age = sessionAge(session.updatedAt, zh)
          rows.push({ id: `session:${session.id}`, section: 'sessions', kind: 'session', label: session.label,
            ...(age === undefined ? {} : { description: age }), mention: formatDraftSessionMention(session) })
        }
      } else if (target.hostId !== LOCAL_HOST) {
        statuses.push(words.remoteSessions)
      }
    }
    if (rows.length === 0 && Array.isArray(currentFiles)) statuses.unshift(words.empty)
  }

  const activeRow = (highlight?.request === active ? rows.find(row => row.id === highlight.id) : undefined) ?? rows[0]
  const activeIndex = activeRow === undefined ? -1 : rows.indexOf(activeRow)
  const readCaret = (el: HTMLTextAreaElement): void => {
    if (disabled || composing.current || el.ownerDocument.activeElement !== el || el.selectionStart !== el.selectionEnd) {
      setSnapshot(null)
      return
    }
    const next = { text: el.value, caret: el.selectionStart, generation, catalogGeneration }
    setSnapshot(previous => sameEditor(previous, next) ? previous : next)
  }
  const pick = (row: Row, drill: boolean): boolean => {
    const el = editor.current
    if (active === null || token === null || el === null || composing.current || el.ownerDocument.activeElement !== el
      || el.value !== active.text || el.selectionStart !== active.caret || el.selectionEnd !== active.caret) return false
    const descent = drill && row.kind === 'folder' ? row.drill : undefined
    const value = row.kind === 'model' ? '' : descent ?? row.mention
    const next = replaceDraftCompletion(active.text, token, value, row.kind !== 'model' && descent === undefined)
    if (!actions.onTextChange(next.text, active.generation, active.text)) return false
    setDismissed(active)
    setRestore({ ...next, generation, catalogGeneration, keepOpen: descent !== undefined })
    if (row.kind === 'model') actions.onOpenModelPicker()
    return true
  }
  const select = (row: Row): void => {
    if (active !== null) setHighlight({ request: active, id: row.id })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.key === 'Enter') {
      // Holding the key that settled a row must not send on its next repeat.
      if (event.repeat && pickedWithEnter.current) return true
      pickedWithEnter.current = false
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return false
    if (event.key === 'Escape' && active !== null && token !== null) {
      setDismissed(active)
      return true
    }
    if (disabled || event.shiftKey) return false
    if (event.key === 'Enter') {
      if (activeRow !== undefined && pick(activeRow, false)) {
        pickedWithEnter.current = true
        return true
      }
      const el = event.currentTarget
      const live = { text: el.value, caret: el.selectionStart, generation, catalogGeneration }
      // Selection can change before React paints the menu. Keep a live completion
      // from falling through to first send even if its row has not rendered yet.
      if (activeRow !== undefined) return true
      if (el.selectionStart !== el.selectionEnd || sameEditor(dismissed, live)) return false
      const liveToken = detectDraftCompletion(live.text, live.caret)
      return liveToken?.trigger === '@' || (liveToken?.trigger === '/' && matchesModel(liveToken.query))
    }
    if (active === null || token === null) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (activeIndex < 0) return false
      const offset = event.key === 'ArrowDown' ? 1 : -1
      const row = rows[(activeIndex + offset + rows.length) % rows.length]
      if (row !== undefined) select(row)
      return true
    }
    return event.key === 'Tab' && activeRow !== undefined && pick(activeRow, true)
  }

  const open = token !== null
  return {
    readCaret,
    onKeyDown,
    onBlur: () => { composing.current = false; pickedWithEnter.current = false; setSnapshot(null) },
    onCompositionStart: () => { composing.current = true; setSnapshot(null) },
    onCompositionEnd: (el: HTMLTextAreaElement) => { composing.current = false; readCaret(el) },
    listId: open ? id : undefined,
    activeId: open && activeIndex >= 0 ? optionId(id, activeIndex) : undefined,
    menu: open ? <DraftCompletionMenu id={id} rows={rows} activeIndex={activeIndex} statuses={statuses}
      words={words} anchorSignal={view} legacy={legacy} onPick={pick} onHighlight={select} /> : null,
  }
}

function optionId(id: string, index: number): string { return `${id}-${index}` }

function DraftCompletionMenu({ id, rows, activeIndex, statuses, words, anchorSignal, legacy, onPick, onHighlight }: {
  id: string
  rows: readonly Row[]
  activeIndex: number
  statuses: readonly string[]
  words: CompletionCopy
  anchorSignal: unknown
  legacy: boolean
  onPick: (row: Row, drill: boolean) => boolean
  onHighlight: (row: Row) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const aboveHeight = useAnchoredMaxHeight(surface, 400, anchorSignal, 84)
  const [belowHeight, setBelowHeight] = useState(400)
  useLayoutEffect(() => {
    const el = surface.current
    const panel = el?.closest('.zr-newc')
    if (!legacy || el === null || el === undefined || panel === null || panel === undefined) return
    const fit = () => setBelowHeight(Math.min(400, Math.max(0, panel.getBoundingClientRect().bottom - el.getBoundingClientRect().top - 8)))
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit)
    observer?.observe(panel)
    window.addEventListener('resize', fit)
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit) }
  }, [legacy, anchorSignal])
  const maxHeight = legacy ? belowHeight : aboveHeight
  const activeId = activeIndex < 0 ? undefined : rows[activeIndex]?.id
  useLayoutEffect(() => {
    const list = viewport.current
    const option = list?.querySelector('[aria-selected="true"]')
    if (list === null || option === undefined || option === null) return
    const bounds = list.getBoundingClientRect()
    const row = option.getBoundingClientRect()
    if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom
    else if (row.top < bounds.top) list.scrollTop -= bounds.top - row.top
  }, [activeId, activeIndex, maxHeight])

  return (
    <MenuSurface ref={surface} className="zr-newc-completion" style={{ maxHeight }}
      data-placement={legacy ? 'below' : 'above'} data-zen-remote="new-conversation-completion">
      <div className="zr-newc-completionScroll" ref={viewport}>
        <div id={id} role="listbox" aria-label={words.suggestions}>
          {rows.map((row, index) => (
            <div key={row.id} role="presentation">
              {row.section !== rows[index - 1]?.section && (
                <div className="zr-newc-completionCaption" role="presentation">{words[row.section]}</div>
              )}
              <div className="zr-newc-completionLine">
                <button type="button" tabIndex={-1} role="option" aria-selected={index === activeIndex}
                  id={optionId(id, index)} className="zr-newc-completionOption"
                  onMouseDown={event => { event.preventDefault() }}
                  onMouseMove={index === activeIndex ? undefined : () => { onHighlight(row) }}
                  onClick={() => { onPick(row, false) }}>
                  {row.kind === 'model' ? <IconDataOutlineRegular size={14} /> : <ReferenceIconRegular kind={row.kind} size={14} />}
                  <span className="zr-newc-completionLabel" title={row.label}>{row.label}</span>
                  {row.kind === 'model' && <span className="zr-newc-completionAlias">/model</span>}
                  {row.description !== undefined && <span className="zr-newc-completionDetail" title={row.description}>{row.description}</span>}
                </button>
                {row.kind === 'folder' && row.drill !== undefined && <button type="button" tabIndex={-1}
                  className="zr-newc-completionDrill" aria-label={`${words.drill} ${row.label}`} title={words.drill}
                  onMouseDown={event => { event.preventDefault() }} onClick={() => { onPick(row, true) }}>
                  <kbd aria-hidden>Tab</kbd><IconChevronRightOutlineRegular size={12} />
                </button>}
              </div>
            </div>
          ))}
        </div>
        {statuses.length > 0 && <div role="status" className="zr-newc-completionCaption">
          {statuses.map(status => <div key={status}>{status}</div>)}
        </div>}
      </div>
    </MenuSurface>
  )
}
