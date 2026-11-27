import { type HostStyle } from './session-host-appearance.ts';
import type { ClientServerView, SettingsFormOp } from './settings-form.ts';
export interface PairedHostAppearance {
    entryId: string;
    pairingId: string;
    serverUrl: string;
    profile?: string;
    style: HostStyle;
}
export declare function confirmedAppearanceHost(pending: PairedHostAppearance, servers: readonly ClientServerView[], profile?: string): string | undefined;
export declare function hostStyleOps(hostId: string, style: HostStyle, current?: HostStyle): SettingsFormOp[];
export declare function readPendingHostAppearance(): PairedHostAppearance | undefined;
export declare function storePendingHostAppearance(value: PairedHostAppearance | undefined): void;
export declare function storeHostAppearanceNotice(): void;
export declare function takeHostAppearanceNotice(): boolean;
//# sourceMappingURL=paired-host-appearance.d.ts.map