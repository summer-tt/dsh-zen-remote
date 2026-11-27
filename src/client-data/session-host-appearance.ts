import { fromVirtual } from '../virtual-id.ts'
import type { RemoteStatusView } from './remote-status.ts'
import type { SettingsFormScope } from './settings-form.ts'

export const HOST_APPEARANCE_FIELD = 'sessionHostAppearance'
export const HOST_COLORS = ['gray', 'blue', 'teal', 'violet', 'amber', 'rose', 'indigo', 'green'] as const
export const HOST_ICONS = ['monitor', 'server', 'laptop', 'cloud', 'terminal'] as const
export type HostColor = (typeof HOST_COLORS)[number]
export type HostIcon = (typeof HOST_ICONS)[number]

interface HostStyle {
  color?: HostColor
  icon?: HostIcon
}

export interface HostAppearance {
  enabled: boolean
  sidebar: boolean
  header: boolean
  hosts: Readonly<Record<string, HostStyle>>
}

const DEFAULTS: HostAppearance = { enabled: true, sidebar: true, header: true, hosts: {} }

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function isSessionHostId(id: string): boolean {
  return id === 'local' || /^[0-9a-f]{8}$/u.test(id)
}

export function parseHostAppearance(value: unknown): HostAppearance {
  const config = asRecord(value)
  const hosts: Record<string, HostStyle> = {}
  for (const [key, entry] of Object.entries(asRecord(config.hosts))) {
    if (!isSessionHostId(key)) continue
    const { color, icon } = asRecord(entry)
    const style: HostStyle = {}
    if (HOST_COLORS.includes(color as HostColor)) style.color = color as HostColor
    if (HOST_ICONS.includes(icon as HostIcon)) style.icon = icon as HostIcon
    if (style.color !== undefined || style.icon !== undefined) hosts[key] = style
  }
  return { enabled: config.enabled !== false, sidebar: config.sidebar !== false, header: config.header !== false, hosts }
}

export function hostIdOfSession(sessionId: string, surface: 'sidebar' | 'header'): string | undefined {
  return fromVirtual(sessionId)?.serverId ?? (surface === 'sidebar' ? 'local' : undefined)
}

export function resolveHostStyle(config: HostAppearance, hostId: string): Required<HostStyle> {
  const style = config.hosts[hostId]
  // The complete 32-bit id, including its upper bits, contributes to the palette.
  const id = Number.parseInt(hostId, 16)
  const hash = Math.imul(id ^ (id >>> 16), 0x45d9f3b) >>> 0
  return {
    color: style?.color ?? (hostId === 'local' ? 'gray' : HOST_COLORS[1 + hash % (HOST_COLORS.length - 1)]!),
    icon: style?.icon ?? (hostId === 'local' ? 'monitor' : 'server'),
  }
}

export function hostDisplayName(hostId: string, status: RemoteStatusView | undefined, localName: string): string {
  if (hostId === 'local') return localName
  const servers = status?.servers ?? {}
  const server = servers[hostId]
  const name = server?.displayName?.trim() || server?.serverName.trim() || hostId
  const duplicate = name === localName || Object.entries(servers).some(([id, other]) =>
    id !== hostId && (other.displayName?.trim() || other.serverName.trim() || id) === name,
  )
  return duplicate ? `${name} (${hostId})` : name
}

export type HostAppearanceStore = ReturnType<typeof createHostAppearanceStore>

/** One profile settings source shared by both slots, also in compositions with no settings UI. */
export function createHostAppearanceStore() {
  let config = DEFAULTS
  let scope: SettingsFormScope | undefined
  let raw: unknown
  const listeners = new Set<() => void>()

  const update = (value: unknown): void => {
    if (value === raw) return
    raw = value
    config = value === undefined ? DEFAULTS : parseHostAppearance(value)
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => config,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    attach(form: SettingsFormScope): () => void {
      scope = form
      const read = () => {
        const snapshot = form.getSnapshot()
        if (snapshot.status !== 'loading') update(snapshot.value?.[HOST_APPEARANCE_FIELD])
      }
      const unsubscribe = form.subscribe(read)
      read()
      return () => {
        unsubscribe()
        if (scope !== form) return
        scope = undefined
        update(undefined)
      }
    },
  }
}
