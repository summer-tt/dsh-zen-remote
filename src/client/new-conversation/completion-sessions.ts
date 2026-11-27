import { fromVirtual } from '../../virtual-id.ts'

interface SessionRow {
  readonly id: string
  readonly displayTitle?: string | undefined
  readonly title?: string | undefined
  readonly cwd?: string | undefined
  readonly blank?: boolean | undefined
  readonly origin?: string | undefined
  readonly updatedAt: number
}

/** Local drafts can cite sessions already visible in the selected workspace. */
export function draftCompletionSessions(target: { hostId: string; workspaceId: string | undefined },
  workspaces: readonly { workspaceId: string; sessionIds: readonly string[] }[],
  sessions: Readonly<Record<string, SessionRow | undefined>>, archivedIds: readonly string[],
) {
  if (target.hostId !== 'local' || target.workspaceId === undefined) return []
  const workspace = workspaces.find(row => row.workspaceId === target.workspaceId)
  if (workspace === undefined) return []
  const archived = new Set(archivedIds)
  return workspace.sessionIds.flatMap(id => {
    if (fromVirtual(id) !== undefined || archived.has(id)) return []
    const row = sessions[id]
    if (row === undefined || row.id !== id || row.blank === true || row.origin === 'subagent') return []
    return [{ id, label: row.displayTitle?.trim() || row.title?.trim() || id, ...(row.cwd === undefined ? {} : { cwd: row.cwd }), updatedAt: row.updatedAt }]
  }).sort((left, right) => right.updatedAt - left.updatedAt)
}
