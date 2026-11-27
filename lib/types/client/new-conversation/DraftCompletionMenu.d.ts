import { type KeyboardEvent, type RefObject } from 'react';
import type { NewConversationPanelActions, NewConversationView } from './NewConversationPanel.tsx';
export declare function useDraftCompletion(view: NewConversationView, actions: NewConversationPanelActions, editor: RefObject<HTMLTextAreaElement>, disabled: boolean, legacy: boolean): {
    readCaret: (el: HTMLTextAreaElement) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
    onBlur: () => void;
    onCompositionStart: () => void;
    onCompositionEnd: (el: HTMLTextAreaElement) => void;
    listId: string | undefined;
    activeId: string | undefined;
    menu: import("react").JSX.Element | null;
};
//# sourceMappingURL=DraftCompletionMenu.d.ts.map