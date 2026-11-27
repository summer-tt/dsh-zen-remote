import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type HostAppearanceStore, type HostColor, type HostIcon } from '../client-data/session-host-appearance.ts';
import { NS } from './locales.ts';
export declare function HostGlyph({ icon, color, size, label, surface }: {
    icon: HostIcon;
    color: HostColor;
    size: 14 | 16;
    label: string;
    surface?: 'sidebar' | 'header';
}): import("react").JSX.Element;
export type SessionHostIconProps = PropsLocale<typeof NS> & {
    appearance: HostAppearanceStore;
    sessionId: string;
};
export declare function SidebarSessionHostIcon(props: SessionHostIconProps): import("react").JSX.Element;
export declare function HeaderSessionHostIcon(props: SessionHostIconProps): import("react").JSX.Element;
export type SidebarSessionHostHoverProps = SessionHostIconProps & PropsRuntime<'sidebar.session.row.hover'>;
export declare function SidebarSessionHostHover({ appearance, sessionId, useSessions, t }: SidebarSessionHostHoverProps): import("react").JSX.Element | null;
//# sourceMappingURL=SessionHostIcon.d.ts.map