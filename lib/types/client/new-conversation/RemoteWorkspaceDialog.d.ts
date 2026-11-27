export interface RemoteDirectoryListing {
    readonly path: string;
    readonly home: string;
    readonly crumbs: readonly {
        name: string;
        path: string;
        hidden: boolean;
    }[];
    readonly entries: readonly {
        name: string;
        path: string;
        hidden: boolean;
    }[];
    readonly truncated: boolean;
}
export interface RemoteWorkspaceActions {
    list(path?: string, signal?: AbortSignal): Promise<RemoteDirectoryListing>;
    createDirectory(path: string, name: string): Promise<string>;
    add(path: string): Promise<void>;
}
export declare function remoteWorkspaceCopy(zh: boolean): {
    add: string;
    menuAdd: string;
    title: string;
    path: string;
    browse: string;
    folder: string;
    folderName: string;
    create: string;
    cancel: string;
    close: string;
    loading: string;
    working: string;
    empty: string;
    hidden: string;
    truncated: string;
    retry: string;
    unavailable: string;
    unsupported: string;
    exists: string;
    timedOut: string;
    invalidPath: string;
    listFailed: string;
    addFailed: string;
    createFailed: string;
};
type OperationFailure = 'listFailed' | 'createFailed' | 'addFailed';
export declare function remoteWorkspaceError(error: unknown, operation: OperationFailure, zh: boolean): string;
export declare function RemoteWorkspaceDialog({ host, zh, actions, available, onClose }: {
    host: string;
    zh: boolean;
    actions: RemoteWorkspaceActions;
    available: boolean;
    onClose: () => void;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=RemoteWorkspaceDialog.d.ts.map