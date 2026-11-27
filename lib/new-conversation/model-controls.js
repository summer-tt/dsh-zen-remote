export const DRAFT_MODEL_CONTROLS_METHOD = 'draftModelControls';
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
        && !value.startsWith('zr~') && !/\p{Cc}/u.test(value);
}
function speed(value) {
    return value === 'standard' || value === 'fast' || value === 'ultrafast';
}
function windowSize(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function parseDraftControlsAddress(input) {
    if (!record(input) || Object.keys(input).some(key => !['provider', 'model', 'agentPreset', 'workspaceId'].includes(key)))
        return undefined;
    const { provider, model, agentPreset, workspaceId } = input;
    if (!identifier(provider) || !identifier(model) || (agentPreset !== undefined && !identifier(agentPreset))
        || (workspaceId !== undefined && !identifier(workspaceId)))
        return undefined;
    return { provider, model, ...(agentPreset === undefined ? {} : { agentPreset }), ...(workspaceId === undefined ? {} : { workspaceId }) };
}
export function parseDraftControlSelection(input) {
    if (!record(input) || Object.keys(input).some(key => key !== 'speed' && key !== 'contextWindow'))
        return undefined;
    const { speed: selectedSpeed, contextWindow } = input;
    if ((selectedSpeed === undefined && contextWindow === undefined) || (selectedSpeed !== undefined && !speed(selectedSpeed))
        || (contextWindow !== undefined && !windowSize(contextWindow)))
        return undefined;
    return { ...(selectedSpeed === undefined ? {} : { speed: selectedSpeed }), ...(contextWindow === undefined ? {} : { contextWindow }) };
}
function choice(input, valid) {
    return record(input) && Array.isArray(input.options) && input.options.length <= 128 && input.options.every(valid)
        && valid(input.value) && input.options.includes(input.value);
}
export function parseDraftModelControls(input) {
    if (!record(input))
        return undefined;
    const { speed: speedChoices, contextWindow, efforts } = input;
    if ((speedChoices !== undefined && !choice(speedChoices, speed)) ||
        (contextWindow !== undefined && !choice(contextWindow, windowSize)) ||
        (efforts !== undefined && (!Array.isArray(efforts) || efforts.length > 128 || !efforts.every(identifier))))
        return undefined;
    return { ...(speedChoices === undefined ? {} : { speed: speedChoices }), ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(efforts === undefined ? {} : { efforts: efforts }) };
}
//# sourceMappingURL=model-controls.js.map