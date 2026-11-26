import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

type InstallModelSelection = (ctx: Context) => void

/** Resolve the public model-switch listener from the active DSH package. */
export async function loadHostModelSelection(agents: object, entrypoint = process.argv[1]): Promise<InstallModelSelection> {
  if (entrypoint === undefined || entrypoint === '') throw new Error('DSH entry point is unavailable')
  const anchor = pathToFileURL(await realpath(entrypoint))
  const entry = createRequire(anchor).resolve('@deepseek-ai/dsh-agent')
  const module: { default?: unknown; AgentModel?: unknown; installModelSelection?: unknown } = await import(pathToFileURL(entry).href)
  const { default: AgentRegistry, AgentModel, installModelSelection } = module
  if (typeof AgentRegistry !== 'function' || !(agents instanceof AgentRegistry)
    || typeof AgentModel !== 'function' || typeof installModelSelection !== 'function' || installModelSelection.length !== 1) {
    throw new Error('The active DSH Agent registry does not expose the current model-selection setup')
  }
  return (ctx) => { installModelSelection(ctx) }
}
