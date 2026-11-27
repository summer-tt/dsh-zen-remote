import { DRAFT_IMAGE_LIMIT, DRAFT_IMAGE_NAME_LIMIT, isDraftImageMediaType, type DraftImageMediaType, type DraftImagePart } from '../../client-data/draft-images.ts'
import { MAX_DRAFT_IMAGE_BYTES } from '../../upload-limits.ts'
import { draftKey, type DraftTargetState } from './target.ts'

type DraftImageTarget = Pick<DraftTargetState, 'hostId' | 'workspaceId' | 'generation'>

export type DraftImageFailure = 'unsupported' | 'limit' | 'empty' | 'preview'

export interface DraftImageFile {
  readonly id: string
  readonly name: string
  readonly mediaType: DraftImageMediaType
  readonly file: File
}

interface Preview extends DraftImageFile {
  readonly url: string
}

/** Own the preview URLs for the images staged under each draft target. */
export function createDraftImageStore(urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL) {
  const drafts = new Map<string, readonly Preview[]>()
  const read = (key: string): readonly Preview[] => drafts.get(key) ?? []
  function replace(key: string, next: readonly Preview[]): void {
    const previous = read(key)
    if (next.length > 0) drafts.set(key, next)
    else drafts.delete(key)
    for (const image of previous) {
      if (!next.includes(image)) urls.revokeObjectURL(image.url)
    }
  }

  return {
    read,
    add(target: DraftImageTarget, generation: number, files: readonly File[]): DraftImageFailure | undefined {
      if (target.generation !== generation) return
      const key = draftKey(target.hostId, target.workspaceId)
      const existing = read(key)
      const next = [...existing]
      let size = existing.reduce((total, image) => total + image.file.size, 0)
      let failure: DraftImageFailure | undefined
      for (const file of files) {
        if (!isDraftImageMediaType(file.type)) { failure = 'unsupported'; continue }
        if (file.size === 0) { failure = 'empty'; continue }
        if (next.length >= DRAFT_IMAGE_LIMIT || size + file.size > MAX_DRAFT_IMAGE_BYTES) { failure = 'limit'; continue }
        try {
          const id = crypto.randomUUID()
          const name = file.name.trim().slice(0, DRAFT_IMAGE_NAME_LIMIT) || file.type.replace('/', '.')
          next.push({ id, name, mediaType: file.type, file, url: urls.createObjectURL(file) })
          size += file.size
        } catch { failure = 'preview' }
      }
      if (next.length !== existing.length) replace(key, next)
      return failure
    },
    remove(target: DraftImageTarget, generation: number, id: string): void {
      if (target.generation !== generation) return
      const key = draftKey(target.hostId, target.workspaceId)
      replace(key, read(key).filter(image => image.id !== id))
    },
    adopt(hostId: string, workspaceId: string): void {
      const key = draftKey(hostId, workspaceId)
      const hostKey = draftKey(hostId, undefined)
      if (read(key).length > 0 || !drafts.has(hostKey)) return
      drafts.set(key, read(hostKey))
      drafts.delete(hostKey)
    },
    restore(key: string, files: readonly DraftImageFile[]): boolean {
      if (read(key).length > 0) return true
      const previews: Preview[] = []
      try {
        for (const image of files) previews.push({ ...image, url: urls.createObjectURL(image.file) })
        replace(key, previews)
        return true
      } catch {
        for (const image of previews) urls.revokeObjectURL(image.url)
        return false
      }
    },
    matches(key: string, ids: readonly string[]): boolean {
      const existing = read(key)
      return existing.length === ids.length && existing.every((image, index) => image.id === ids[index])
    },
    clearSent(key: string, ids: readonly string[]): void {
      replace(key, read(key).filter(image => !ids.includes(image.id)))
    },
    dispose(): void { for (const key of drafts.keys()) replace(key, []) },
  }
}

/** Keep frozen image bytes out of localStorage so screenshots can exceed its string quota. */
export function createPendingImageStorage() {
  async function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('dsh.zen.newConversation.images', 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('pending') }
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        request.onsuccess = () => request.result.close()
        reject(new Error('Pending image storage is blocked'))
      }
      request.onsuccess = () => resolve(request.result)
    })
  }
  async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('pending', mode)
        const request = operation(tx.objectStore('pending'))
        tx.oncomplete = () => resolve(request.result)
        tx.onabort = () => reject(tx.error ?? request.error)
      })
    } finally {
      db.close()
    }
  }
  return {
    read: (key: string): Promise<readonly DraftImageFile[] | undefined> => run('readonly', store => store.get(key)),
    write: (key: string, files: readonly DraftImageFile[]) => run('readwrite', store => store.put(files, key)),
    remove: (key: string) => run('readwrite', store => store.delete(key)),
  }
}

export function encodeDraftImage({ file, mediaType, name }: DraftImageFile): Promise<DraftImagePart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') { reject(new Error('Unexpected image encoding')); return }
      resolve({ type: 'image', mediaType, data: result.slice(result.indexOf(',') + 1), name })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
