import { useMemo, useSyncExternalStore, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { getRemoteStatusStore } from '../client-data/remote-status.ts'
import {
  hostDisplayName, visibleSessionHostId, resolveHostStyle, type HostAppearanceStore, type HostColor, type HostIcon,
} from '../client-data/session-host-appearance.ts'
import { NS } from './locales.ts'

const GLYPHS: Record<HostIcon, string> = {
  monitor: 'M6 14h4m-2-3v3M2.5 2.5h11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z',
  server: 'M3 2.5h10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Zm0 6h10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM4.5 5h.25m-.25 6h.25',
  laptop: 'M3 11V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v7m-11.5 0h13v1a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-1Z',
  cloud: 'M4.5 12.5a3 3 0 1 1 .3-6 3.5 3.5 0 0 1 6.8.6 2.7 2.7 0 1 1 .4 5.4Z',
  terminal: 'M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM4.5 6l2 2-2 2m4 0h3',
}

const COLORS: Record<HostColor, readonly [light: string, dark: string]> = {
  gray: ['#606875', '#a9b0bc'],
  blue: ['#2465a8', '#83baff'],
  teal: ['#16776e', '#66d5c4'],
  violet: ['#744ab2', '#c7a5ff'],
  amber: ['#925700', '#f8c277'],
  rose: ['#a63564', '#ffa0c7'],
  indigo: ['#4754ad', '#a9afff'],
  green: ['#416f22', '#a7d983'],
}

export function HostGlyph({ icon, color, size, label, surface }: {
  icon: HostIcon
  color: HostColor
  size: 14 | 16
  label: string
  surface?: 'sidebar' | 'header'
}) {
  const [light, dark] = COLORS[color]
  return (
    <span
      data-zr-session-host={surface}
      role="img"
      aria-label={label}
      title={label}
      className="zr-session-host-glyph"
      style={{ '--zr-host-light': light, '--zr-host-dark': dark } as CSSProperties}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        <path d={GLYPHS[icon]} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export type SessionHostIconProps = PropsLocale<typeof NS> & {
  appearance: HostAppearanceStore
  sessionId: string
}

function useHostName(hostId: string, t: SessionHostIconProps['t']): string {
  const status = getRemoteStatusStore()
  const store = useMemo(() => ({
    subscribe: hostId === 'local' ? () => () => {} : status.subscribe,
    getSnapshot: () => hostDisplayName(hostId, status.getSnapshot().view, t('hostAppearance.local')),
  }), [hostId, status, t])
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

function NamedHostGlyph({ hostId, style, surface, t }: {
  hostId: string
  style: ReturnType<typeof resolveHostStyle>
  surface: 'sidebar' | 'header'
  t: SessionHostIconProps['t']
}) {
  const host = useHostName(hostId, t)
  return <HostGlyph {...style} size={surface === 'sidebar' ? 14 : 16} surface={surface} label={t('hostAppearance.hostLabel', { host })} />
}

function SessionHostIcon({ appearance, sessionId, surface, t }: SessionHostIconProps & { surface: 'sidebar' | 'header' }) {
  const config = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot)
  const hostId = visibleSessionHostId(config, sessionId, surface)
  if (hostId === undefined) return null
  return <NamedHostGlyph hostId={hostId} style={resolveHostStyle(config, hostId)} surface={surface} t={t} />
}

export function SidebarSessionHostIcon(props: SessionHostIconProps) {
  return <SessionHostIcon {...props} surface="sidebar" />
}

export function HeaderSessionHostIcon(props: SessionHostIconProps) {
  return <SessionHostIcon {...props} surface="header" />
}

function HostHoverLabel({ hostId, t }: { hostId: string, t: SessionHostIconProps['t'] }) {
  const host = useHostName(hostId, t)
  return <div className="zr-session-host-hover">{t('hostAppearance.hostLabel', { host })}</div>
}

export type SidebarSessionHostHoverProps = SessionHostIconProps & PropsRuntime<'sidebar.session.row.hover'>

export function SidebarSessionHostHover({ appearance, sessionId, useSessions, t }: SidebarSessionHostHoverProps) {
  const config = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot)
  const blank = useSessions(sessions => sessions.byId[sessionId]?.blank !== false)
  // The trailing slot omits blank rows, but the host may still open their hover card.
  const hostId = visibleSessionHostId(config, sessionId, 'sidebar', blank)
  if (hostId === undefined) return null
  return <HostHoverLabel hostId={hostId} t={t} />
}
