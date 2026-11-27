export interface DraftCompletionSession {
  readonly id: string
  readonly label: string
  readonly cwd?: string
  readonly updatedAt?: number
}

export interface DraftFileCandidate {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

export interface DraftCompletionToken {
  readonly trigger: '@' | '/'
  readonly query: string
  readonly quoted: boolean
  readonly position: 'leading' | 'inline'
  readonly span: { readonly start: number; readonly end: number }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u
const WHITESPACE = /\s/u

/** These native actions require an open Session and never run in a draft. */
export const SESSION_ONLY_COMMANDS = [
  { name: 'compact', alias: '压缩' }, { name: 'export', alias: '导出' }, { name: 'rewind' }, { name: 'undo' },
] as const

export function bareSessionOnlyCommand(text: string): string | undefined {
  const token = /^\/([^\s]+)$/u.exec(text.trim())?.[1]
  return token !== undefined && SESSION_ONLY_COMMANDS.some(command => command.name === token || ('alias' in command && command.alias === token))
    ? token : undefined
}

/** Use the native @ grammar first, then the native slash word and URL boundaries. */
export function detectDraftCompletion(text: string, caret: number): DraftCompletionToken | null {
  if (!Number.isInteger(caret) || caret < 1 || caret > text.length) return null
  const before = text.slice(0, caret)
  const leading = before.search(/\S/u)
  const quoted = /(?:^|\s)(@"([^"]*))$/u.exec(before)
  const at = quoted ?? /(?:^|\s)(@([^\s]*))$/u.exec(before)
  if (at?.[1] !== undefined && at[2] !== undefined) {
    // A completed quoted path or a canonical Session mention is already an
    // insertion, even when placed by paste instead of by this menu.
    const start = caret - at[1].length
    if (quoted === null && (at[2].startsWith('"') || /^@\[(?:\\.|[^\\\]])*\]\(dsh-session:[A-Za-z0-9_-]+\)/u.test(text.slice(start)))) return null
    const tail = text.slice(caret)
    const suffix = quoted === null
      ? (/^\S*/u.exec(tail)?.[0] ?? '').replace(/[.,;:!?，。；：！？]+$/u, '').length
      : /^([^"\n]*")/u.exec(tail)?.[0].length ?? 0
    return { trigger: '@', query: at[2], quoted: quoted !== null, position: start === leading ? 'leading' : 'inline', span: { start, end: caret + suffix } }
  }
  for (let start = caret - 1; start >= 0; start--) {
    const char = before.charAt(start)
    if (WHITESPACE.test(char)) return null
    if (char !== '/') continue
    const prev = before.charAt(start - 1)
    if (WORD_CHAR.test(prev) || prev === '/') continue
    if (prev === ':' && start >= 2 && !WHITESPACE.test(before.charAt(start - 2))) continue
    const actionToken = /^\/(?:model|file)(?=$|\s)/u.exec(text.slice(start))?.[0]
    const end = actionToken === undefined ? caret : Math.max(caret, start + actionToken.length)
    return { trigger: '/', query: before.slice(start + 1), quoted: false, position: start === leading ? 'leading' : 'inline', span: { start, end } }
  }
  return null
}

/** Quote paths with spaces. A directory drill leaves any opening quote live. */
export function formatDraftFileMention(candidate: DraftFileCandidate, quoted: boolean, drill = false): string | undefined {
  const path = candidate.kind === 'directory' ? `${candidate.path}/` : candidate.path
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return undefined
  if (!quoted && !WHITESPACE.test(path)) return `@${path}`
  return drill && candidate.kind === 'directory' ? `@"${path}` : `@"${path}"`
}

/** Encode the same JSON string and base64url payload as DSH's session URI. */
export function formatDraftSessionMention({ id, label }: DraftCompletionSession): string {
  const bytes = new TextEncoder().encode(JSON.stringify(id))
  const payload = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  return `@[${label.replace(/[\\\]]/gu, '\\$&')}](dsh-session:${payload})`
}

/** Keep the suffix outside the native trigger span, including any existing separator. */
export function replaceDraftCompletion(text: string, token: DraftCompletionToken, replacement: string, separate = false) {
  const { start, end } = token.span
  const tail = text.slice(end)
  const insertion = separate && !/^[\s.,;:!?，。；：！？]/u.test(tail) ? `${replacement} ` : replacement
  return { text: text.slice(0, start) + insertion + tail, caret: start + insertion.length }
}

/** Keep the eligible Session rows in the store's recency order. */
export function matchDraftCompletionSessions(sessions: readonly DraftCompletionSession[], query: string): readonly DraftCompletionSession[] {
  const needle = query.toLocaleLowerCase()
  return sessions.filter(({ id, label, cwd }) => id.toLocaleLowerCase().includes(needle)
    || label.toLocaleLowerCase().includes(needle) || cwd?.toLocaleLowerCase().includes(needle) === true).slice(0, 50)
}
