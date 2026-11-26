import { isLegalServerId } from '../state-store.js'

export interface NewConversationPreferencesContext {
  readonly fiber: { readonly entry?: object }
  readonly reflect?: { get(name: string): unknown }
}

/** Persist the last successful target in the current Zen Remote plugin row. */
export async function saveRecentConversationHost(ctx: NewConversationPreferencesContext, hostId: string): Promise<void> {
  if (hostId !== 'local' && (hostId.length !== 8 || !isLegalServerId(hostId))) throw new Error('Invalid recent conversation Host ID')
  const entry = ctx.fiber.entry
  const editor = ctx.reflect?.get('configEditor') as {
    edit(entry: object, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>
  } | undefined
  if (entry === undefined || typeof editor?.edit !== 'function') {
    throw new Error('Recent conversation Host cannot be saved in this profile')
  }
  await editor.edit(entry, current => ({ ...current, recentConversationHost: hostId }))
}
