export interface DraftCompletionSession {
    readonly id: string;
    readonly label: string;
    readonly cwd?: string;
    readonly updatedAt?: number;
}
export interface DraftFileCandidate {
    readonly path: string;
    readonly kind: 'file' | 'directory';
}
export interface DraftCompletionToken {
    readonly trigger: '@' | '/';
    readonly query: string;
    readonly quoted: boolean;
    readonly position: 'leading' | 'inline';
    readonly span: {
        readonly start: number;
        readonly end: number;
    };
}
/** Use the native @ grammar first, then the native slash word and URL boundaries. */
export declare function detectDraftCompletion(text: string, caret: number): DraftCompletionToken | null;
/** Quote paths with spaces. A directory drill leaves any opening quote live. */
export declare function formatDraftFileMention(candidate: DraftFileCandidate, quoted: boolean, drill?: boolean): string | undefined;
/** Encode the same JSON string and base64url payload as DSH's session URI. */
export declare function formatDraftSessionMention({ id, label }: DraftCompletionSession): string;
/** Keep the suffix outside the native trigger span, including any existing separator. */
export declare function replaceDraftCompletion(text: string, token: DraftCompletionToken, replacement: string, separate?: boolean): {
    text: string;
    caret: number;
};
/** All draft Session rows already share the selected workspace; keep the store's recency order. */
export declare function matchDraftCompletionSessions(sessions: readonly DraftCompletionSession[], query: string): readonly DraftCompletionSession[];
//# sourceMappingURL=completion.d.ts.map