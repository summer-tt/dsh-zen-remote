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
/** These native actions require an open Session and never run in a draft. */
export declare const SESSION_ONLY_COMMANDS: readonly [{
    readonly name: "compact";
    readonly alias: "压缩";
}, {
    readonly name: "export";
    readonly alias: "导出";
}, {
    readonly name: "rewind";
}, {
    readonly name: "undo";
}];
export declare function bareSessionOnlyCommand(text: string): string | undefined;
/** Use the native @ grammar first, then the native slash word and URL boundaries. */
export declare function detectDraftCompletion(text: string, caret: number): DraftCompletionToken | null;
/** Quote paths with spaces. A directory drill leaves any opening quote live. */
export declare function formatDraftFileMention(candidate: DraftFileCandidate, quoted: boolean, drill?: boolean): string | undefined;
/** Encode the same JSON string and base64url payload as DSH's session URI. */
export declare function formatDraftSessionMention({ id, label }: DraftCompletionSession): string;
/** Make the selected skill match the Host's whitespace-bounded /name grammar. */
export declare function replaceDraftSkill(text: string, token: DraftCompletionToken, name: string): {
    caret: number;
    text: string;
};
export declare function isDraftSkillReserved(name: string): boolean;
/** Keep the suffix outside the native trigger span, including any existing separator. */
export declare function replaceDraftCompletion(text: string, token: DraftCompletionToken, replacement: string, separate?: boolean): {
    text: string;
    caret: number;
};
/** Keep the eligible Session rows in the store's recency order. */
export declare function matchDraftCompletionSessions(sessions: readonly DraftCompletionSession[], query: string): readonly DraftCompletionSession[];
//# sourceMappingURL=completion.d.ts.map