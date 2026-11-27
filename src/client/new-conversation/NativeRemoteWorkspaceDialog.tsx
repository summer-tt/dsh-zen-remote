import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { RemoteWorkspaceDialog, remoteWorkspaceCopy, remoteWorkspaceError, type RemoteWorkspaceActions } from './RemoteWorkspaceDialog.tsx'
import type { RenderNativeDirectoryBrowser } from './register.ts'

export function NativeRemoteWorkspaceDialog({ host, zh, actions, available, onClose, renderFactorySlot }: {
  host: string
  zh: boolean
  actions: RemoteWorkspaceActions
  available: boolean
  onClose: () => void
  renderFactorySlot?: RenderNativeDirectoryBrowser | undefined
}) {
  const words = remoteWorkspaceCopy(zh)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const fallback: ReactNode = <RemoteWorkspaceDialog host={host} zh={zh} actions={actions} available={available} onClose={onClose} />
  const listDirectory = useCallback((path?: string, signal?: AbortSignal) =>
    actions.list(path, signal).catch(reason => { throw new Error(remoteWorkspaceError(reason, 'listFailed', zh)) }), [actions, zh])
  const createDirectory = useCallback((path: string, name: string) =>
    actions.createDirectory(path, name).catch(reason => { throw new Error(remoteWorkspaceError(reason, 'createFailed', zh)) }), [actions, zh])

  if (renderFactorySlot === undefined) return fallback
  if (!available && !busy) return <Modal open title={words.title} closeLabel={words.close} onClose={onClose}
    footer={<Button variant="outline" onClick={onClose}>{words.cancel}</Button>}>
    <p role="alert">{words.unavailable}</p>
  </Modal>

  return <>
    {renderFactorySlot('directoryPicker.browser', {
      open: error === null,
      busy,
      listDirectory,
      createDirectory,
      onClose,
      onOpen(path) {
        if (!available || pending.current) return
        pending.current = true
        setBusy(true)
        void actions.add(path).then(onClose, reason => {
          setError(remoteWorkspaceError(reason, 'addFailed', zh))
        }).finally(() => {
          pending.current = false
          setBusy(false)
        })
      },
    }, { fallback })}
    <Modal open={error !== null} title={words.title} closeLabel={words.close} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>{words.cancel}</Button>
        <Button variant="primary" onClick={() => setError(null)}>{zh ? '重新选择' : 'Choose again'}</Button>
      </>}>
      <p role="alert">{error}</p>
    </Modal>
  </>
}
