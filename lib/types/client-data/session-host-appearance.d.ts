import type { RemoteStatusView } from './remote-status.ts';
import type { SettingsFormScope } from './settings-form.ts';
export declare const HOST_APPEARANCE_FIELD = "sessionHostAppearance";
export declare const HOST_COLORS: readonly ["gray", "blue", "teal", "violet", "amber", "rose", "indigo", "green"];
export declare const HOST_ICONS: readonly ["monitor", "server", "laptop", "cloud", "terminal"];
export type HostColor = (typeof HOST_COLORS)[number];
export type HostIcon = (typeof HOST_ICONS)[number];
interface HostStyle {
    color?: HostColor;
    icon?: HostIcon;
}
export interface HostAppearance {
    enabled: boolean;
    sidebar: boolean;
    header: boolean;
    hosts: Readonly<Record<string, HostStyle>>;
}
export declare function isSessionHostId(id: string): boolean;
export declare function parseHostAppearance(value: unknown): HostAppearance;
export declare function hostIdOfSession(sessionId: string, surface: 'sidebar' | 'header'): string | undefined;
export declare function resolveHostStyle(config: HostAppearance, hostId: string): Required<HostStyle>;
export declare function hostDisplayName(hostId: string, status: RemoteStatusView | undefined, localName: string): string;
export type HostAppearanceStore = ReturnType<typeof createHostAppearanceStore>;
/** One profile settings source shared by both slots, also in compositions with no settings UI. */
export declare function createHostAppearanceStore(): {
    getSnapshot: () => HostAppearance;
    subscribe(listener: () => void): () => void;
    attach(form: SettingsFormScope): () => void;
};
export {};
//# sourceMappingURL=session-host-appearance.d.ts.map