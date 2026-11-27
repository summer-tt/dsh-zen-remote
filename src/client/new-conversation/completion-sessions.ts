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

/** Local drafts cite visible sessions. A selected workspace narrows the menu. */
export function draftCompletionSessions(target: { hostId: string; workspaceId: string | undefined },
  workspaces: readonly { workspaceId: string; sessionIds: readonly string[] }[],
  sessions: Readonly<Record<string, SessionRow | undefined>>, archivedIds: readonly string[],
) {
  if (target.hostId !== 'local') return []
  const ids = target.workspaceId === undefined
    ? Object.keys(sessions)
    : workspaces.find(row => row.workspaceId === target.workspaceId)?.sessionIds ?? []
  const archived = new Set(archivedIds)
  return ids.flatMap(id => {
    if (fromVirtual(id) !== undefined || archived.has(id)) return []
    const row = sessions[id]
    if (row === undefined || row.id !== id || row.blank === true || row.origin === 'subagent') return []
    return [{ id, label: row.displayTitle?.trim() || row.title?.trim() || id, ...(row.cwd === undefined ? {} : { cwd: row.cwd }), updatedAt: row.updatedAt }]
  }).sort((left, right) => right.updatedAt - left.updatedAt)
}
