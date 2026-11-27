import { isSessionHostId, parseHostAppearance, type HostStyle } from './session-host-appearance.ts'
import type { ClientServerView, SettingsFormOp } from './settings-form.ts'

export interface PairedHostAppearance {
  entryId: string
  pairingId: string
  serverUrl: string
  profile?: string
  style: HostStyle
}

export function confirmedAppearanceHost(
  pending: PairedHostAppearance,
  servers: readonly ClientServerView[],
  profile?: string,
): string | undefined {
  if (pending.profile !== profile) return undefined
  const server = servers.find(row => row.entryId === pending.entryId && row.confirmedPairingId === pending.pairingId)
  return server && server.serverId !== 'local' && isSessionHostId(server.serverId) ? server.serverId : undefined
}

export function hostStyleOps(hostId: string, style: HostStyle, current: HostStyle = {}): SettingsFormOp[] {
  return (['color', 'icon'] as const).flatMap<SettingsFormOp>(field => {
    const value = style[field]
    if (value === current[field]) return []
    const path = ['hosts', hostId, field]
    return value === undefined ? [{ op: 'unset', path }] : [{ op: 'set', path, value }]
  })
}

const PENDING_KEY = 'zr:paired-host-appearance'

export function readPendingHostAppearance(): PairedHostAppearance | undefined {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (raw === null) return undefined
    const value = JSON.parse(raw) as Partial<PairedHostAppearance> | null
    if (typeof value?.entryId !== 'string' || value.entryId === '' ||
      typeof value.pairingId !== 'string' || value.pairingId === '' || typeof value.serverUrl !== 'string' || typeof value.profile !== 'string') return undefined
    const style = parseHostAppearance({ hosts: { local: value.style } }).hosts.local
    return style === undefined ? undefined : { entryId: value.entryId, pairingId: value.pairingId, serverUrl: value.serverUrl, profile: value.profile, style }
  } catch {
    return undefined
  }
}

export function storePendingHostAppearance(value: PairedHostAppearance | undefined): void {
  try {
    if (value?.profile === undefined) sessionStorage.removeItem(PENDING_KEY)
    else sessionStorage.setItem(PENDING_KEY, JSON.stringify(value))
  } catch {
    // In-memory state still covers environments that deny browser storage.
  }
}

// Feedback only. This marker cannot trigger a write after the client activation reload.
const NOTICE_KEY = 'zr:host-appearance-notice'

export function storeHostAppearanceNotice(): void {
  try { sessionStorage.setItem(NOTICE_KEY, 'unsupported') } catch { /* storage unavailable */ }
}

export function takeHostAppearanceNotice(): boolean {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY)
    sessionStorage.removeItem(NOTICE_KEY)
    return notice === 'unsupported'
  } catch {
    return false
  }
}
