import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminAdmission } from './admin-routes.js';
import type { RelayPool } from './relay-pool.js';
export declare const MAGPIE_CONTROLS_PATH = "/api/magpie-session-controls";
export declare const MAGPIE_CONTROLS_METHOD = "magpieControls";
export declare const REMOTE_MODEL_CONTROLS_ROUTE = "/_dsh/zen-remote/model-controls";
export declare const MAGPIE_CONTROLS_MAX_REPLY_BYTES: number;
interface MagpieControlsInput extends Record<string, unknown> {
    sessionId: string;
    provider: string;
    model: string;
}
export interface MagpieControlsRequest {
    method: 'GET' | 'POST';
    input: MagpieControlsInput;
}
export declare function parseMagpieControlsRequest(raw: unknown): MagpieControlsRequest | undefined;
export declare function magpieControlsFetchRequest(request: MagpieControlsRequest, signal: AbortSignal): Request;
export declare function createRemoteModelControlsRoute(options: {
    admit(req: IncomingMessage): AdminAdmission;
    getPool(): RelayPool | undefined;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export {};
//# sourceMappingURL=magpie-controls.d.ts.map