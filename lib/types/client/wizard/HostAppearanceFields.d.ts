import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { type HostAppearanceStore, type HostStyle } from '../../client-data/session-host-appearance.ts';
import type { ZenRemoteSettingsForm } from '../../client-data/settings-form.ts';
import { NS } from '../locales.ts';
type Copy = PropsLocale<typeof NS>;
type SettingsProps = Copy & {
    appearance: HostAppearanceStore;
    form: ZenRemoteSettingsForm;
    disabled?: boolean;
};
export declare function HostAppearanceFields({ style, preview, onChange, disabled, t }: Copy & {
    style: HostStyle;
    preview: Required<HostStyle>;
    onChange(style: HostStyle): void;
    disabled: boolean;
}): import("react").JSX.Element;
export declare function HostAppearanceEditor({ appearance, form, hostId, title, disabled, t }: SettingsProps & {
    hostId: string;
    title?: string;
}): import("react").JSX.Element;
export declare function LocalHostAppearance({ appearance, form, t }: SettingsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=HostAppearanceFields.d.ts.map