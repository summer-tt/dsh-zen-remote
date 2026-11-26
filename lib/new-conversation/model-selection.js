import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
/** Resolve the public model-switch listener from the active DSH package. */
export async function loadHostModelSelection(agents, entrypoint = process.argv[1]) {
    if (entrypoint === undefined || entrypoint === '')
        throw new Error('DSH entry point is unavailable');
    const anchor = pathToFileURL(await realpath(entrypoint));
    const entry = createRequire(anchor).resolve('@deepseek-ai/dsh-agent');
    const module = await import(pathToFileURL(entry).href);
    const { default: AgentRegistry, AgentModel, installModelSelection } = module;
    if (typeof AgentRegistry !== 'function' || !(agents instanceof AgentRegistry)
        || typeof AgentModel !== 'function' || typeof installModelSelection !== 'function' || installModelSelection.length !== 1) {
        throw new Error('The active DSH Agent registry does not expose the current model-selection setup');
    }
    return (ctx) => { installModelSelection(ctx); };
}
//# sourceMappingURL=model-selection.js.map