import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, IconFolderCloseRegular, IconPlusOutlineRegular, Input, Modal, observeComposition } from '@deepseek-ai/dsh-client-ui-primitives'

export interface RemoteDirectoryListing {
  readonly path: string
  readonly crumbs: readonly { name: string; path: string }[]
  readonly entries: readonly { name: string; path: string; hidden: boolean }[]
  readonly truncated: boolean
}

export interface RemoteWorkspaceActions {
  list(path: string | undefined, signal: AbortSignal): Promise<RemoteDirectoryListing>
  createDirectory(path: string, name: string): Promise<string>
  add(path: string): Promise<void>
}

export function remoteWorkspaceCopy(zh: boolean) {
  return zh ? {
    add: '添加工作区', menuAdd: '添加工作区…', title: '选择工作区目录', path: '目录路径', browse: '前往',
    folder: '新建文件夹', folderName: '文件夹名称', create: '创建', cancel: '取消', close: '关闭',
    loading: '正在加载…', working: '正在处理…', empty: '没有可显示的子目录', hidden: '显示隐藏文件',
    truncated: '目录条目过多，仅显示部分结果。', retry: '重试', unavailable: '所选主机当前不可用。',
    unsupported: '所选主机不支持浏览目录。', exists: '这个文件夹已存在。', timedOut: '请求超时，请重试。',
    invalidPath: '该路径无法注册为工作区，请选择一个可访问的目录。',
    listFailed: '无法读取目录。请检查路径和权限后重试。',
    addFailed: '无法添加工作区。请检查目录和权限后重试。',
    createFailed: '无法新建文件夹。请检查权限以及是否已有同名文件夹。',
  } : {
    add: 'Add workspace', menuAdd: 'Add workspace…', title: 'Select Workspace Directory', path: 'Directory path', browse: 'Go',
    folder: 'New folder', folderName: 'Folder name', create: 'Create', cancel: 'Cancel', close: 'Close',
    loading: 'Loading…', working: 'Working…', empty: 'No subdirectories to show', hidden: 'Show hidden files',
    truncated: 'Only part of this directory listing is shown.', retry: 'Retry', unavailable: 'The selected host is unavailable.',
    unsupported: 'The selected host does not support directory browsing.', exists: 'This folder already exists.',
    timedOut: 'The request timed out. Try again.', invalidPath: 'Choose an accessible directory to register as a workspace.',
    listFailed: 'Could not read the directory. Check the path and permissions, then try again.',
    addFailed: 'Could not add the workspace. Check the directory and permissions, then try again.',
    createFailed: 'Could not create the folder. Check permissions and whether the name is already in use.',
  }
}

type OperationFailure = 'listFailed' | 'createFailed' | 'addFailed'
type Feedback = OperationFailure | 'unavailable' | 'unsupported' | 'exists' | 'timedOut' | 'invalidPath'

function failureOf(error: unknown, fallback: OperationFailure): Feedback {
  switch (error instanceof Error ? error.message : '') {
    case 'remote-offline':
    case 'remote-unpaired':
    case 'remote-connecting': return 'unavailable'
    case 'remote-unsupported':
    case 'directory-picker/unavailable': return 'unsupported'
    case 'directory-picker/exists': return 'exists'
    case 'request-timeout': return 'timedOut'
    case 'workspace/invalid-path': return 'invalidPath'
    default: return fallback
  }
}

export function RemoteWorkspaceDialog({ host, zh, actions, available, onClose }: {
  host: string
  zh: boolean
  actions: RemoteWorkspaceActions
  available: boolean
  onClose: () => void
}) {
  const words = remoteWorkspaceCopy(zh)
  const [destination, setDestination] = useState<{ path?: string }>({})
  const [listing, setListing] = useState<RemoteDirectoryListing | null>(null)
  const [path, setPath] = useState('')
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ operation: OperationFailure; message: Feedback } | null>(null)
  const pathField = useRef<HTMLInputElement>(null)
  const editedPath = useRef(false)
  const composition = useRef<ReturnType<typeof observeComposition> | undefined>(undefined)
  useEffect(() => {
    const document = pathField.current?.ownerDocument
    if (document === undefined) return
    const observer = observeComposition(document)
    composition.current = observer
    return () => { observer.dispose(); composition.current = undefined }
  }, [])
  const guardEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (composition.current?.guards(event.nativeEvent) ?? event.nativeEvent.isComposing)) {
      event.preventDefault()
    }
  }
  const pathId = useId()
  const folderId = useId()
  const list = actions.list

  useEffect(() => {
    if (!available) return
    const controller = new AbortController()
    setLoading(true)
    setFailure(null)
    void list(destination.path, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setListing(result)
      if (!editedPath.current) setPath(result.path)
      setLoading(false)
    }, error => {
      if (controller.signal.aborted) return
      setFailure({ operation: 'listFailed', message: failureOf(error, 'listFailed') })
      setLoading(false)
    })
    return () => controller.abort()
  }, [available, destination, list])

  const browse = (next?: string) => {
    editedPath.current = false
    pathField.current?.focus()
    setNewFolder(null)
    setLoading(true)
    setFailure(null)
    setDestination(next === undefined ? {} : { path: next })
  }
  const close = () => { if (!busy) onClose() }
  const blocked = busy || loading || !available
  const canUseListing = !blocked && listing !== null && failure?.operation !== 'listFailed' && path === listing.path
  const add = async () => {
    if (!canUseListing || newFolder !== null) return
    setBusy(true)
    setFailure(null)
    try {
      await actions.add(listing.path)
      onClose()
    } catch (error) {
      setFailure({ operation: 'addFailed', message: failureOf(error, 'addFailed') })
    } finally {
      setBusy(false)
    }
  }
  const name = newFolder ?? ''
  const validName = name.trim() !== '' && name !== '.' && name !== '..' && !/[/\\\0]/u.test(name)
  const createFolder = async () => {
    if (!canUseListing || !validName) return
    setBusy(true)
    setFailure(null)
    try {
      browse(await actions.createDirectory(listing.path, name))
    } catch (error) {
      setFailure({ operation: 'createFailed', message: failureOf(error, 'createFailed') })
    } finally {
      setBusy(false)
    }
  }
  const entries = listing?.entries.filter(entry => showHidden || !entry.hidden) ?? []

  return <Modal
    open className="zr-newc-directoryModal" contentClassName="zr-newc-directoryContent" title={words.title} description={host} closeLabel={words.close} onClose={close}
    footer={<>
      <Button variant="outline" disabled={busy} onClick={close}>{words.cancel}</Button>
      <Button variant="primary" disabled={!canUseListing || newFolder !== null} onClick={() => { void add() }}>{words.add}</Button>
    </>}
  >
    <div className="zr-newc-directory" aria-busy={available && (busy || loading)}>
      <form onKeyDown={guardEnter} onSubmit={event => { event.preventDefault(); if (!blocked && path.trim() !== '') browse(path) }}>
        <label htmlFor={pathId}>{words.path}</label>
        <div className="zr-newc-directoryForm">
          <Input ref={pathField} id={pathId} data-modal-autofocus value={path} disabled={busy || !available}
            spellCheck={false} autoComplete="off" onChange={event => { editedPath.current = true; setPath(event.target.value) }} />
          <Button type="submit" variant="outline" disabled={blocked || path.trim() === ''}>{words.browse}</Button>
        </div>
      </form>
      {listing !== null && <>
        <nav className="zr-newc-directoryCrumbs" aria-label={words.path}>
          {listing.crumbs.map(crumb => <Button key={crumb.path} size="sm" variant="ghost"
            aria-current={crumb.path === listing.path ? 'location' : undefined} disabled={blocked}
            onClick={() => browse(crumb.path)}>{crumb.name}</Button>)}
        </nav>
        <div className="zr-newc-directoryEntries">
          {entries.length === 0 && <p>{words.empty}</p>}
          {entries.map(entry => <Button key={entry.path} size="sm" variant="ghost" disabled={blocked}
            onClick={() => browse(entry.path)}><IconFolderCloseRegular size={16} />{entry.name}</Button>)}
        </div>
        {listing.truncated && <p>{words.truncated}</p>}
        <div className="zr-newc-directoryTools">
          <Button size="sm" variant="ghost" disabled={!canUseListing || newFolder !== null}
            onClick={() => setNewFolder('')}><IconPlusOutlineRegular size={16} />{words.folder}</Button>
          <label><input type="checkbox" checked={showHidden} disabled={busy} onChange={event => setShowHidden(event.target.checked)} /> {words.hidden}</label>
        </div>
      </>}
      {newFolder !== null && <form onKeyDown={guardEnter} onSubmit={event => { event.preventDefault(); void createFolder() }}>
        <label htmlFor={folderId}>{words.folderName}</label>
        <div className="zr-newc-directoryForm">
          <Input id={folderId} autoFocus value={newFolder} disabled={busy} onChange={event => setNewFolder(event.target.value)} />
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setNewFolder(null); setFailure(null) }}>{words.cancel}</Button>
          <Button type="submit" variant="outline" disabled={!canUseListing || !validName}>{words.create}</Button>
        </div>
      </form>}
      {available && (loading || busy) && <p role="status">{busy ? words.working : words.loading}</p>}
      {!available && <p role="alert">{words.unavailable}</p>}
      {available && failure !== null && <p role="alert">{words[failure.message]}</p>}
      {available && failure?.operation === 'listFailed' && <Button variant="outline" size="sm" onClick={() => browse(destination.path)}>{words.retry}</Button>}
    </div>
  </Modal>
}
