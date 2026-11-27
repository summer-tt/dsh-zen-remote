import { ClientRouteError, requireSessionHostRelay } from './client-routes.js';
import { responseJson, sameOriginPost } from './http.js';
import { RelayError } from './relay-client.js';
import { fromVirtual } from './virtual-id.js';
export const MAGPIE_CONTROLS_PATH = '/api/magpie-session-controls';
export const MAGPIE_CONTROLS_METHOD = 'magpieControls';
export const REMOTE_MODEL_CONTROLS_ROUTE = '/_dsh/zen-remote/model-controls';
const MAX_BODY_BYTES = 4096;
export const MAGPIE_CONTROLS_MAX_REPLY_BYTES = 32 * 1024;
const ADDRESS_KEYS = ['sessionId', 'provider', 'model'];
const validId = (value) => typeof value === 'string' && value.length <= 512
    && value.trim() === value && value !== '' && !/[\p{Cc}]/u.test(value);
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
function validChange(key, value) {
    switch (key) {
        case 'speed': return value === 'standard' || value === 'fast' || value === 'ultrafast';
        case 'contextWindow': return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
        case 'reasoningEffort': return value === null || validId(value);
        default: return false;
    }
}
export function parseMagpieControlsRequest(raw) {
    if (!record(raw) || Object.keys(raw).length !== 2 || (raw.method !== 'GET' && raw.method !== 'POST') || !record(raw.input))
        return undefined;
    const { method, input } = raw;
    const { sessionId, provider, model, ...extra } = input;
    if (!validId(sessionId) || !validId(provider) || !validId(model) ||
        [sessionId, provider, model].some(value => value.startsWith('zr~')))
        return undefined;
    if (method === 'GET') {
        if (Object.keys(extra).length !== 0)
            return undefined;
    }
    else if (Object.hasOwn(extra, 'changes')) {
        const { changes, expectedRevision, allowRunning } = extra;
        if (Object.keys(extra).some(key => !['changes', 'expectedRevision', 'allowRunning'].includes(key)) ||
            !record(changes) || Object.keys(changes).length === 0 || Object.entries(changes).some(([key, value]) => !validChange(key, value)) ||
            (expectedRevision !== undefined && !validId(expectedRevision)) ||
            (allowRunning !== undefined && (allowRunning !== true || expectedRevision === undefined)))
            return undefined;
    }
    else {
        const { field, value } = extra;
        if (Object.keys(extra).length !== 2 || (field !== 'speed' && field !== 'contextWindow') || !validChange(field, value))
            return undefined;
    }
    return { method, input: { sessionId, provider, model, ...extra } };
}
export function magpieControlsFetchRequest(request, signal) {
    const url = new URL(MAGPIE_CONTROLS_PATH, 'http://relay.local');
    if (request.method === 'GET') {
        for (const key of ADDRESS_KEYS)
            url.searchParams.set(key, request.input[key]);
        return new Request(url, { signal });
    }
    return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.input), signal });
}
async function readInput(req, url) {
    if (req.method === 'GET') {
        const params = url.searchParams;
        if ([...params.keys()].some(key => !ADDRESS_KEYS.some(allowed => allowed === key)) ||
            ADDRESS_KEYS.some(key => params.getAll(key).length !== 1))
            return undefined;
        return Object.fromEntries(params);
    }
    if (url.search !== '' || req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
        return undefined;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY_BYTES)
            throw new ClientRouteError(413, 'body-too-large', 'Model controls request is too large');
        chunks.push(bytes);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        return undefined;
    }
}
export function createRemoteModelControlsRoute(options) {
    return async (req, res) => {
        const fail = (status, code) => responseJson(res, status, { ok: false, error: { code } });
        const admission = options.admit(req);
        if ('rejection' in admission || req.headers['x-zen-remote-via'] !== undefined) {
            fail('rejection' in admission ? admission.rejection : 403, 'forbidden');
            return;
        }
        if (req.method !== 'GET' && req.method !== 'POST') {
            fail(405, 'method-not-allowed');
            return;
        }
        if (!sameOriginPost(req)) {
            fail(403, 'origin-rejected');
            return;
        }
        const controller = new AbortController();
        const close = () => { if (!res.writableEnded)
            controller.abort(); };
        res.once('close', close);
        if (res.destroyed)
            close();
        try {
            const input = await readInput(req, new URL(req.url ?? '/', 'http://dsh.internal'));
            if (!record(input) || !validId(input.sessionId) || !validId(input.provider)) {
                fail(400, 'bad-request');
                return;
            }
            const session = fromVirtual(input.sessionId);
            const provider = fromVirtual(input.provider);
            if (session === undefined || provider?.serverId !== session.serverId) {
                fail(400, 'remote-mismatch');
                return;
            }
            const request = parseMagpieControlsRequest({ method: req.method, input: { ...input, sessionId: session.id, provider: provider.id } });
            if (request === undefined) {
                fail(400, 'bad-request');
                return;
            }
            const pool = options.getPool();
            if (pool?.getByServerId(session.serverId)?.identityPending === true) {
                fail(503, 'remote-connecting');
                return;
            }
            const relay = requireSessionHostRelay(pool, session.serverId);
            const credentials = relay.lastHandshakeDigest;
            let interrupted = false;
            const unsubscribe = relay.subscribe(state => { if (state !== 'online')
                interrupted = true; });
            let result;
            try {
                controller.signal.throwIfAborted();
                result = await relay.invoke('session', MAGPIE_CONTROLS_METHOD, { request }, controller.signal);
            }
            finally {
                unsubscribe();
            }
            if (controller.signal.aborted)
                return;
            const current = options.getPool()?.getByServerId(session.serverId);
            if (interrupted || current?.identityPending === true || current?.client !== relay ||
                relay.state !== 'online' || relay.lastHandshakeDigest !== credentials) {
                fail(503, 'remote-binding-changed');
                return;
            }
            if (!record(result) || typeof result.status !== 'number' || !Number.isInteger(result.status) ||
                result.status < 200 || result.status > 599 || typeof result.body !== 'string' || Buffer.byteLength(result.body) > MAGPIE_CONTROLS_MAX_REPLY_BYTES) {
                fail(502, 'invalid-reply');
                return;
            }
            let payload;
            try {
                payload = JSON.parse(result.body);
            }
            catch {
                fail(502, 'invalid-reply');
                return;
            }
            responseJson(res, result.status, payload);
        }
        catch (error) {
            if (res.destroyed || controller.signal.aborted)
                return;
            if (error instanceof RelayError && ['forbidden-method', 'unsupported'].includes(error.code))
                fail(404, 'remote-unsupported');
            else if (error instanceof ClientRouteError || error instanceof RelayError)
                fail(error.status ?? 502, error.code);
            else
                fail(502, 'model-controls-failed');
        }
        finally {
            res.off('close', close);
        }
    };
}
//# sourceMappingURL=magpie-controls.js.map