import type { Context } from '@deepseek-ai/cordis';
export { isManagedConversation } from './journal.js';
export { saveRecentConversationHost } from './preferences.js';
export interface ConversationModel {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
}
export interface NewConversationRequest {
    readonly workspaceId: string;
    readonly creationRequestId: string;
    readonly requestId: string;
    readonly model: ConversationModel;
    readonly text: string;
    readonly agentPreset?: string;
    readonly clientTimeZone?: string;
}
export declare class NewConversationError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string, options?: ErrorOptions);
}
/** Parse the complete text-only request before invoking any Host operations. */
export declare function parseNewConversationRequest(input: unknown): NewConversationRequest;
export type ShareState = 'initial' | 'recovering' | 'confirmed';
export interface NewConversationOptions {
    /** Revalidate access to the selected Workspace using the request's authenticated origin. */
    readonly authorize?: () => void | Promise<void>;
    /** Persist the link to the Session, or validate a preceding share without reopening a revoked one. */
    readonly confirmShare?: (sessionId: string, state: ShareState) => void | Promise<void>;
}
export interface NewConversationHostOptions {
    /** Resolve public DSH services from the plugin scope. */
    readonly get: (name: string) => unknown;
    readonly journalDirectory: string;
    readonly installModelSelection?: (ctx: Context) => void;
}
/** Own new-conversation submission until DSH has durably accepted its first prompt. */
export declare class NewConversationHost {
    private readonly submissions;
    private readonly services;
    constructor(services: NewConversationHostOptions);
    isManaged(sessionId: unknown): boolean;
    /** `scope` is supplied by the authenticated server call site, independently of the wire request. */
    submit(scope: string, input: NewConversationRequest, options?: NewConversationOptions): Promise<{
        sessionId: string;
    }>;
    private process;
    private admit;
    private observed;
    private validateSession;
    private workspace;
    private validateModel;
    private flush;
    private presets;
    private service;
}
//# sourceMappingURL=index.d.ts.map