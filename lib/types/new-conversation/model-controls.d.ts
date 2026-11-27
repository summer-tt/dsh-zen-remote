export declare const DRAFT_MODEL_CONTROLS_METHOD = "draftModelControls";
export type DraftSpeed = 'standard' | 'fast' | 'ultrafast';
export interface DraftControlSelection {
    readonly speed?: DraftSpeed;
    readonly contextWindow?: number;
}
interface ControlChoice<Value> {
    readonly options: readonly Value[];
    readonly value: Value;
}
export interface DraftModelControls {
    readonly speed?: ControlChoice<DraftSpeed>;
    readonly contextWindow?: ControlChoice<number>;
    readonly efforts?: readonly string[];
}
export interface DraftControlsAddress {
    readonly provider: string;
    readonly model: string;
    readonly agentPreset?: string;
    readonly workspaceId?: string;
}
export declare function parseDraftControlsAddress(input: unknown): DraftControlsAddress | undefined;
export declare function parseDraftControlSelection(input: unknown): DraftControlSelection | undefined;
export declare function parseDraftModelControls(input: unknown): DraftModelControls | undefined;
export {};
//# sourceMappingURL=model-controls.d.ts.map