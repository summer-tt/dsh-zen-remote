interface SessionRow {
    readonly id: string;
    readonly displayTitle?: string | undefined;
    readonly title?: string | undefined;
    readonly cwd?: string | undefined;
    readonly blank?: boolean | undefined;
    readonly origin?: string | undefined;
    readonly updatedAt: number;
}
/** Local drafts cite visible sessions. A selected workspace narrows the menu. */
export declare function draftCompletionSessions(target: {
    hostId: string;
    workspaceId: string | undefined;
}, workspaces: readonly {
    workspaceId: string;
    sessionIds: readonly string[];
}[], sessions: Readonly<Record<string, SessionRow | undefined>>, archivedIds: readonly string[]): {
    updatedAt: number;
    cwd?: string;
    id: string;
    label: string;
}[];
export {};
//# sourceMappingURL=completion-sessions.d.ts.map