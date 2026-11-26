import type { Context } from '@deepseek-ai/cordis';
type InstallModelSelection = (ctx: Context) => void;
/** Resolve the public model-switch listener from the active DSH package. */
export declare function loadHostModelSelection(agents: object, entrypoint?: string): Promise<InstallModelSelection>;
export {};
//# sourceMappingURL=model-selection.d.ts.map