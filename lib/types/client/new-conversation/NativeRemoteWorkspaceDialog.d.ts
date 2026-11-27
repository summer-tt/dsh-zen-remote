import { type RemoteWorkspaceActions } from './RemoteWorkspaceDialog.tsx';
import type { RenderNativeDirectoryBrowser } from './register.ts';
export declare function NativeRemoteWorkspaceDialog({ host, zh, actions, available, onClose, renderFactorySlot }: {
    host: string;
    zh: boolean;
    actions: RemoteWorkspaceActions;
    available: boolean;
    onClose: () => void;
    renderFactorySlot?: RenderNativeDirectoryBrowser | undefined;
}): import("react").JSX.Element;
//# sourceMappingURL=NativeRemoteWorkspaceDialog.d.ts.map