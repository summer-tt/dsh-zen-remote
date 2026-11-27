import type { ClientContext, SessionId } from './compat/types.ts'
import type { HostAppearanceStore } from '../client-data/session-host-appearance.ts'
import type { SessionHostIconProps, SidebarSessionHostHoverProps } from './SessionHostIcon.tsx'
import { NS } from './locales.ts'

// Structural mirror of ui-workspace's public slot. Older hosts simply never
// declare it, so the lazy registration leaves the sidebar untouched there.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.session.row.trailing': {
      kind: 'list'
      scope: 'root'
      inline: true
      owner: { readonly sessionId: SessionId }
    }
    'sidebar.session.row.hover': {
      kind: 'list'
      scope: 'root'
      owner: { readonly sessionId: SessionId }
    }
  }
}

type HostIconComponent = (props: SessionHostIconProps) => import('react').ReactNode

export function registerSessionHostIcons(
  ctx: ClientContext,
  appearance: HostAppearanceStore,
  sidebar: HostIconComponent,
  header: HostIconComponent,
  hover: (props: SidebarSessionHostHoverProps) => import('react').ReactNode,
): void {
  ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
    name: 'sidebar.session.row.trailing',
    id: 'zr-session-host',
    order: 10,
    locale: NS,
    inject: () => ({ appearance }),
  }, sidebar))

  // Hovering the row hides the trailing strip, so the host's existing card
  // carries the readable name during hover.
  ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
    name: 'sidebar.session.row.hover',
    id: 'zr-session-host',
    order: 10,
    locale: NS,
    inject: () => ({ appearance }),
  }, hover))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'zr-session-host',
    // Better Session Topbar's breadcrumb registers at -40.
    order: -39,
    locale: NS,
    inject: () => ({ appearance }),
  }, header))
}
