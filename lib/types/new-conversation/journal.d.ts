/** Identify the IDs reserved for the new-conversation submission flow. */
export declare function isManagedConversation(id: unknown): boolean;
export type Reservation = {
    readonly sessionId: string;
    readonly fingerprint: string;
    readonly agentPreset?: string;
};
export declare function digest(value: unknown): string;
/** A reservation and each milestone can only be published once. */
export declare class ConversationJournal {
    private readonly base;
    constructor(directory: string, key: string);
    reservation(): Promise<Reservation | undefined>;
    reserve(fingerprint: string, agentPreset: string | undefined): Promise<Reservation>;
    has(milestone: 'prompt' | 'sharing' | 'shared'): Promise<boolean>;
    mark(milestone: 'prompt' | 'sharing' | 'shared'): Promise<boolean>;
    private publish;
}
//# sourceMappingURL=journal.d.ts.map