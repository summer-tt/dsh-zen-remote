/**
 * Registration for the plugin-first new-conversation panel. Two slot entries:
 *
 * - a `main` keyed panel (key {@link NEW_CONVERSATION_PANEL_ID}) hosting the
 *   Session-less draft editor. A `main` key receives no Session binding
 *   (ui-layout's SlotMap row), which is what lets the panel own a live
 *   textarea while the native composer is inert for want of a Session;
 * - a `sidebar.session.action` hoc layer that REPLACES the sidebar's native
 *   New Session button where the feature applies, and passes it through
 *   untouched where it does not (see NewConversationTrigger.tsx).
 *
 * JSX-free, with the components as parameters, so a Node test drives it
 * against a fake ctx (the register-settings.ts / register-wizard.ts trick).
 *
 * What goes where follows the renderer's caching: a root entry's inject
 * result is cached for the registration's lifetime, so the panel's LIVE data
 * (target, roster, draft, candidates, model picker node, copy) travels as one
 * observable in the `hooks` compartment, and only stable callbacks travel as
 * plain inject fields. The wiring owns that observable and its publication.
 *
 * `sidebar.session.action` exists on DSH 0.2.2+. The installed devDependency
 * type packages may be older, so the slot row is declared here structurally
 * (the register-wizard.ts precedent for `plugins.bundle.config`); at runtime
 * `slots.inject` simply waits for a declaration that never comes on an older
 * host, where the native entry is what users have.
 */
import type { ReactNode } from 'react';
import type { ClientContext } from '../compat/types.ts';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { NewConversationPanelActions, NewConversationPanelProps, NewConversationViewSource } from './NewConversationPanel.tsx';
import type { NewConversationTriggerProps, TriggerSource } from './NewConversationTrigger.tsx';
/** Navigation extension exposed by DSH builds with native draft slots. */
export interface NativeDraftNavigation {
    registerNewSessionDraft(open: (workspaceId?: string) => boolean): () => void;
    openSessionDraft(): AbortSignal;
}
export type NativeWorkspaceControl = (options: {
    label?: string | undefined;
    selectedId?: string | undefined;
    filterWorkspace: (id: string) => boolean;
    workspaceTitle?: (id: string, title: string) => string;
    allowAddWorkspace: boolean;
    onPick: (id: string) => void;
}) => ReactNode;
type NativePresetTarget = (display: (id: string, name: string) => string | undefined) => ReactNode;
export type DraftSlotProps = NewConversationPanelProps & {
    renderWorkspace?: NativeWorkspaceControl;
    targetSessionId?: string;
    renderNativeTarget?: NativePresetTarget;
    draftAvailable: boolean;
    children?: ReactNode;
    useActive: (select: (active: boolean) => boolean) => boolean;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.hero.draftTarget': {
            kind: 'hoc';
            scope: 'root';
            owner: {
                readonly draftAvailable: boolean;
                readonly renderWorkspace: NativeWorkspaceControl;
                readonly targetSessionId?: string;
                readonly renderNativeTarget?: NativePresetTarget;
            };
        };
        'conversation.hero.draftComposer': {
            kind: 'hoc';
            scope: 'root';
            owner: {
                readonly draftAvailable: boolean;
            };
        };
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * Structural mirror of ui-sidebar 0.2.2's row (it declares this as a
         * child of `sidebar`): a layer around the sidebar's native New Session
         * button, addressed by `id`. Absent from installed type packages older
         * than 0.2.2, which is why it is declared here rather than imported.
         */
        'sidebar.session.action': {
            kind: 'hoc';
            scope: 'root';
            owner: {
                readonly wide: boolean;
            };
        };
    }
}
/**
 * `main` key of the new-conversation panel. The same string is the id its
 * sidebar trigger selects. An opaque layout label, cast once the way the
 * shipped panels do (`'schedules' as MainPanelId` in ui-schedule).
 */
export declare const NEW_CONVERSATION_PANEL_ID: MainPanelId;
/**
 * The sidebar hoc layer's id. DSH 0.2.2 addresses a hoc layer by it, so it
 * is always sent at runtime (see the registration site for how it is typed).
 * One layer, so one id.
 */
export declare const NEW_CONVERSATION_ACTION_ID = "zen-new-conversation";
/** The panel component (a .tsx factory result; parameter for Node). */
export type NewConversationPanelComponent = (props: NewConversationPanelProps) => ReactNode;
/**
 * The sidebar trigger component (a .tsx factory result; parameter for Node).
 *
 * Declared explicitly rather than derived from `ComposedProps`: the
 * installed 0.2.1 type packages predate the hoc share, so their
 * `ComposedProps` carries no `children` for a hoc row (DSH 0.2.2 adds it).
 * The renderer passes `children` to a hoc layer at runtime on both, and this
 * component's contract requires it — a layer always receives what it wraps.
 */
export type NewConversationTriggerComponent = (props: NewConversationTriggerProps) => ReactNode;
/** What the wiring hands the registration: live sources and stable actions. */
export interface NewConversationRegistration {
    /** The panel's one live view source (target, roster, draft, candidates, picker node, copy). */
    readonly view: NewConversationViewSource;
    /** The panel's stable actions. */
    readonly actions: NewConversationPanelActions;
    /** Whether the panel-first flow applies on this page; false keeps the sidebar's native entry. */
    readonly enabled: TriggerSource<boolean>;
    /** The sidebar trigger's localized label, as a live source. */
    readonly label: TriggerSource<string>;
    /**
     * Runs synchronously each time a generic New Conversation entry opens the
     * panel, BEFORE the panel becomes visible. The wiring resets the target to
     * the stored preference here (the Host remembered by a creation since the
     * panel last opened), so the panel is already resolving what it will show
     * rather than flashing the previously selected Host.
     *
     * Omit it to keep the target exactly as it was. It must be synchronous:
     * the navigation that follows does not wait for it.
     */
    readonly onBeforeOpen?: (() => void) | undefined;
    readonly native?: {
        readonly navigation: NativeDraftNavigation;
        readonly active: TriggerSource<boolean>;
        readonly open: (workspaceId?: string) => boolean;
        readonly target: (props: DraftSlotProps) => ReactNode;
        readonly composer: (props: DraftSlotProps) => ReactNode;
    };
}
/**
 * Register the stylesheet, the `main` panel, and the sidebar trigger layer.
 * Every registration rides the caller's fiber: disposal removes all three.
 * @param ctx - client root context.
 * @param panel - the panel component.
 * @param trigger - the sidebar trigger component.
 * @param registration - live sources and stable actions.
 */
export declare function registerNewConversation(ctx: ClientContext, panel: NewConversationPanelComponent, trigger: NewConversationTriggerComponent, registration: NewConversationRegistration): void;
export {};
//# sourceMappingURL=register.d.ts.map