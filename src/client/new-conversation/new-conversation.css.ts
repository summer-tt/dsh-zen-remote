/**
 * Styles for the new-conversation panel (`data-zen-remote="new-conversation"`).
 * Injected as one `<style data-plugin="dsh-zen-remote-new-conversation">` tag
 * by register.ts. Every rule is scoped under the panel's own attribute and
 * reaches nothing else on the page.
 *
 * The panel fills whatever main-panel width the frame gives it and centers
 * its content in a readable column, so it adapts to the Web window without a
 * breakpoint of its own: narrow windows get the same column, just shorter
 * labels (the pickers ellipsize). Colors come from `--dsw-*` tokens only.
 */

export const NEW_CONVERSATION_CSS = `
.zr-newc[data-zen-remote="new-conversation"] {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
}
.zr-newc-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px clamp(16px, 4vw, 40px) 0;
}
.zr-newc-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
}
.zr-newc-target {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}
.zr-newc-targetLabel {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.zr-newc-picker[data-zen-remote="new-conversation-picker"] {
  display: inline-flex;
  align-items: center;
  max-width: min(60vw, 280px);
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-subtle);
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 16px;
  cursor: pointer;
}
.zr-newc-picker[data-zen-remote="new-conversation-picker"]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.zr-newc-picker[data-zen-remote="new-conversation-picker"]:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.zr-newc-pickerLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zr-newc-status,
.zr-newc-notice,
.zr-newc-hint,
.zr-newc-failure {
  margin: 0;
  padding: 0 clamp(16px, 4vw, 40px);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.zr-newc-status,
.zr-newc-notice {
  padding-top: 10px;
}
.zr-newc-noticeError {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--dsw-alias-state-danger-fg, var(--dsw-alias-label-primary));
}
.zr-newc-text[data-zen-remote="new-conversation-text"] {
  flex: 1 1 auto;
  box-sizing: border-box;
  width: calc(100% - 2 * clamp(16px, 4vw, 40px));
  min-height: 120px;
  margin: 14px clamp(16px, 4vw, 40px) 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-subtle);
  border-radius: 12px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  resize: none;
}
.zr-newc-text[data-zen-remote="new-conversation-text"]:focus-visible {
  outline: 2px solid var(--dsw-alias-border-strong, var(--dsw-alias-state-business-primary, #4f6ef7));
  outline-offset: -1px;
}
.zr-newc-text[data-zen-remote="new-conversation-text"]:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.zr-newc-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px clamp(16px, 4vw, 40px) 14px;
}
.zr-newc-model {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 1 1 auto;
}
/* The model seat's own trigger, shown only when the wiring mounts no picker
   node. Reads as a quiet chip: it is the way INTO the picker, not a value. */
.zr-newc-modelTrigger[data-zen-remote="new-conversation-model-trigger"] {
  display: inline-flex;
  align-items: center;
  max-width: min(50vw, 240px);
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zr-newc-modelTrigger[data-zen-remote="new-conversation-model-trigger"]:hover:not(:disabled),
.zr-newc-modelTrigger[data-zen-remote="new-conversation-model-trigger"]:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.zr-newc-modelTrigger[data-zen-remote="new-conversation-model-trigger"]:focus-visible {
  outline: 2px solid var(--dsw-alias-border-strong, var(--dsw-alias-state-business-primary, #4f6ef7));
  outline-offset: -1px;
}
.zr-newc-modelTrigger[data-zen-remote="new-conversation-model-trigger"]:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.zr-newc-failure {
  flex: 1 1 auto;
  padding: 0;
  color: var(--dsw-alias-state-danger-fg, var(--dsw-alias-label-primary));
}
.zr-newc-submit[data-zen-remote="new-conversation-submit"] {
  flex: 0 0 auto;
}
.zr-newc-hint {
  padding-top: 0;
  padding-bottom: 14px;
}

/* The sidebar trigger layer. Its root is display: contents so the sidebar
   row keeps the button as its direct layout child (a hoc layer must not add
   a box of its own). The button matches the sidebar's New Session row:
   28px tall, a 16px row gap, and the label masked to a single line. */
.zr-newc-action[data-zen-remote="new-conversation-action"] {
  display: contents;
}
.zr-newc-actionButton[data-zen-remote="new-conversation-action-button"] {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 16px;
  cursor: pointer;
}
.zr-newc-actionButton[data-zen-remote="new-conversation-action-button"]:hover,
.zr-newc-actionButton[data-zen-remote="new-conversation-action-button"]:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
}
.zr-newc-actionButton[data-zen-remote="new-conversation-action-button"]:focus-visible {
  outline: 2px solid var(--dsw-alias-border-strong, var(--dsw-alias-state-business-primary, #4f6ef7));
  outline-offset: -2px;
}
.zr-newc-actionGlyph {
  flex: 0 0 auto;
  width: 16px;
  font-size: 16px;
  line-height: 16px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.zr-newc-actionLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`
