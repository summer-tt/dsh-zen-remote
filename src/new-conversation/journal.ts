import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const MANAGED_SESSION = /^zen-conversation-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/** Identify the IDs reserved for the new-conversation submission flow. */
export function isManagedConversation(id: unknown): boolean {
  return typeof id === 'string' && id.length === 53 && MANAGED_SESSION.test(id)
}

export type Reservation = {
  readonly sessionId: string
  readonly fingerprint: string
  readonly agentPreset?: string
}

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

/** A reservation and each milestone can only be published once. */
export class ConversationJournal {
  private readonly base: string

  constructor(directory: string, key: string) {
    this.base = join(directory, key)
  }

  async reservation(): Promise<Reservation | undefined> {
    let raw: string
    try {
      raw = await readFile(`${this.base}.json`, 'utf8')
    } catch (error) {
      if (missing(error)) return undefined
      throw error
    }
    const value = JSON.parse(raw) as Partial<Reservation> | null
    if (value === null || !isManagedConversation(value.sessionId)
      || typeof value.fingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.fingerprint)
      || (value.agentPreset !== undefined && typeof value.agentPreset !== 'string')) {
      throw new Error('New conversation reservation is invalid')
    }
    await syncDirectory(dirname(this.base))
    return value as Reservation
  }

  async reserve(fingerprint: string, agentPreset: string | undefined): Promise<Reservation> {
    const record = { sessionId: `zen-conversation-${randomUUID()}`, fingerprint, agentPreset }
    if (await this.publish(`${this.base}.json`, JSON.stringify(record))) return record
    const existing = await this.reservation()
    if (existing === undefined) throw new Error('New conversation reservation disappeared')
    return existing
  }

  async has(milestone: 'prompt' | 'sharing' | 'shared'): Promise<boolean> {
    const target = `${this.base}.${milestone}`
    let value: string
    try {
      value = await readFile(target, 'utf8')
    } catch (error) {
      if (missing(error)) return false
      throw error
    }
    if (value !== '1') throw new Error('New conversation milestone is invalid')
    await syncDirectory(dirname(this.base))
    return true
  }

  mark(milestone: 'prompt' | 'sharing' | 'shared'): Promise<boolean> {
    return this.publish(`${this.base}.${milestone}`, '1')
  }

  private async publish(target: string, value: string): Promise<boolean> {
    const directory = dirname(target)
    const created = await mkdir(directory, { recursive: true, mode: 0o700 })
    if (created !== undefined) await syncDirectory(dirname(directory))
    const temporary = `${target}.${randomUUID()}.tmp`
    const handle = await open(temporary, 'wx', 0o600)
    try {
      try {
        await handle.writeFile(value, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      let installed = true
      try {
        await link(temporary, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EEXIST') throw error
        installed = false
      }
      await syncDirectory(directory)
      return installed
    } finally {
      await unlink(temporary)
    }
  }
}
