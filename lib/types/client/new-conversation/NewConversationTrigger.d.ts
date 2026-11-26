/**
 * The sidebar's New Session trigger, as the `sidebar.session.action` hoc
 * layer. When the new-conversation feature applies, it REPLACES the native
 * button the sidebar renders as the layer's `children` — that button calls
 * `uiWorkspace.startSession`, which creates a Session at once, and the
 * panel-first flow must open the draft panel instead.
 *
 * When the feature does NOT apply, the layer renders `children` untouched:
 * the native button stays, and nothing about the sidebar changes. "Does not
 * apply" is the wiring's call, published as a live `enabled` source — a
 * browser served by the gateway, or a Zen feature switch that turned the
 * panel off. The hoc slot itself only exists on DSH 0.2.2+, so on older hosts
 * this layer never mounts and the native entry is what users have.
 *
 * Omitting `children` is the documented way a layer replaces what it wraps;
 * rendering it is the documented way a layer passes it through
 * (docs/subsystems/slots.md, Hoc layers). The layer must not create a box of
 * its own in either case, or the sidebar row's layout loses its child: the
 * root is `display: contents` (new-conversation.css.ts). The wide/rail
 * distinction is the owner's `wide` prop, exactly as the native button reads
 * it. `enabled` and `label` are live sources the registration places in the
 * `hooks` compartment, so the component reads the framework-bound
 * `useEnabled` / `useLabel` hooks and owns no subscription.
 */
import type { ReactNode } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
/** A live boolean or string, as an observable source. */
export type TriggerSource<T> = {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
};
/**
 * Props of the trigger: the owner's `wide` and the wrapped native `children`
 * from the hoc share, plus the bound hooks and the open action.
 *
 * `children` is typed optional, though the renderer always passes a hoc
 * layer its wrapped content: the installed 0.2.1 type packages predate the
 * hoc share, so the registration's composed props carry no `children` and a
 * required one could not be assigned there. The component treats a missing
 * `children` as "nothing to restore" and renders nothing, so the type gap
 * cannot become a crash.
 */
export interface NewConversationTriggerProps {
    /** Whether the sidebar renders wide content (false = 56px rail). */
    readonly wide: boolean;
    /** The sidebar's native New Session button; rendered unchanged while the feature does not apply. */
    readonly children?: ReactNode | undefined;
    /** Framework-bound selector over whether the panel-first flow applies here. */
    readonly useEnabled: SnapshotSelectorHook<boolean>;
    /** Framework-bound selector over the localized label. */
    readonly useLabel: SnapshotSelectorHook<string>;
    readonly open: () => void;
}
/**
 * The sidebar New Session trigger for the draft panel, or the native button it wraps.
 * @param props - `wide` and `children` from the sidebar, `useEnabled`, `useLabel` and `open` from the registration.
 * @returns the trigger button, or the native `children`.
 */
export declare function NewConversationTrigger({ wide, children, useEnabled, useLabel, open }: NewConversationTriggerProps): string | number | boolean | import("react").JSX.Element | Iterable<ReactNode> | null;
//# sourceMappingURL=NewConversationTrigger.d.ts.map