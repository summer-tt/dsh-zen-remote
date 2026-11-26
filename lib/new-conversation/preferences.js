import { isLegalServerId } from '../state-store.js';
/** Persist the last successful target in the current Zen Remote plugin row. */
export async function saveRecentConversationHost(ctx, hostId) {
    if (hostId !== 'local' && (hostId.length !== 8 || !isLegalServerId(hostId)))
        throw new Error('Invalid recent conversation Host ID');
    const entry = ctx.fiber.entry;
    const editor = ctx.reflect?.get('configEditor');
    if (entry === undefined || typeof editor?.edit !== 'function') {
        throw new Error('Recent conversation Host cannot be saved in this profile');
    }
    await editor.edit(entry, current => ({ ...current, recentConversationHost: hostId }));
}
//# sourceMappingURL=preferences.js.map