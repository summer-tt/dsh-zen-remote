export interface NewConversationPreferencesContext {
    readonly fiber: {
        readonly entry?: object;
    };
    readonly reflect?: {
        get(name: string): unknown;
    };
}
/** Persist the last successful target in the current Zen Remote plugin row. */
export declare function saveRecentConversationHost(ctx: NewConversationPreferencesContext, hostId: string): Promise<void>;
//# sourceMappingURL=preferences.d.ts.map