import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminAdmission } from './admin-routes.js';
import { type NewConversationRequest } from './new-conversation/index.js';
import type { RelayPool } from './relay-pool.js';
export declare const NEW_CONVERSATION_ROUTE = "/_dsh/zen-remote/new-conversation";
interface Options {
    admit(req: IncomingMessage): AdminAdmission;
    getPool(): RelayPool | undefined;
    getRecentHost(): string;
    saveRecentHost(hostId: string): Promise<void>;
    submitLocal(request: NewConversationRequest): Promise<{
        sessionId: string;
    }>;
    onRemoteCreated(sessionId: string): void;
}
export declare function createNewConversationRoute(options: Options): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export {};
//# sourceMappingURL=new-conversation-routes.d.ts.map