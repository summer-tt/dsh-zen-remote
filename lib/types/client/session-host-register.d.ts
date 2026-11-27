import type { ClientContext, SessionId } from './compat/types.ts';
import type { HostAppearanceStore } from '../client-data/session-host-appearance.ts';
import type { SessionHostIconProps, SidebarSessionHostHoverProps } from './SessionHostIcon.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'sidebar.session.row.trailing': {
            kind: 'list';
            scope: 'root';
            inline: true;
            owner: {
                readonly sessionId: SessionId;
            };
        };
        'sidebar.session.row.hover': {
            kind: 'list';
            scope: 'root';
            owner: {
                readonly sessionId: SessionId;
            };
        };
    }
}
type HostIconComponent = (props: SessionHostIconProps) => import('react').ReactNode;
export declare function registerSessionHostIcons(ctx: ClientContext, appearance: HostAppearanceStore, sidebar: HostIconComponent, header: HostIconComponent, hover: (props: SidebarSessionHostHoverProps) => import('react').ReactNode): void;
export {};
//# sourceMappingURL=session-host-register.d.ts.map