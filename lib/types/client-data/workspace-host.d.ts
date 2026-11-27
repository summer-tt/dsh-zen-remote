export type WorkspaceHostOperation = {
    operation: 'listDirectories';
    hostId: string;
    path?: string;
} | {
    operation: 'createDirectory';
    hostId: string;
    path: string;
    name: string;
} | {
    operation: 'createWorkspace';
    hostId: string;
    path: string;
};
//# sourceMappingURL=workspace-host.d.ts.map