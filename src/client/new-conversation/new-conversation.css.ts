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
  gap: 4px;
  min-width: 0;
  max-width: min(100%, 360px);
  min-height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
}
.zr-newc-picker:hover:not(:disabled), .zr-newc-picker[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.zr-newc-picker:disabled { cursor: default; color: var(--dsw-alias-label-tertiary); }
.zr-newc-picker svg { flex: none; }
.zr-newc-picker svg:last-child { color: var(--dsw-alias-label-caption); }
.zr-newc-pickerLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zr-newc-directoryModal[role="dialog"] { width: min(520px, 100%); max-height: 100%; }
.zr-newc-directoryContent { min-height: 0; overflow: auto; }
.zr-newc-directoryModal > :last-child { flex-shrink: 0; }
.zr-newc-workspaceOption { display: flex; min-width: 0; gap: 4px; }
.zr-newc-workspaceOption > * { overflow: hidden; text-overflow: ellipsis; }
.zr-newc-workspaceOption small { max-width: 65%; flex-shrink: 0; color: var(--dsw-alias-label-secondary); }
.zr-newc-directory, .zr-newc-directory form {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.zr-newc-directoryForm, .zr-newc-directoryCrumbs, .zr-newc-directoryTools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.zr-newc-directoryForm > :first-child { flex: 1; min-width: 0; }
.zr-newc-directoryCrumbs { overflow-x: auto; }
.zr-newc-directoryCrumbs > button { flex-shrink: 0; }
.zr-newc-directoryEntries {
  display: grid;
  align-content: start;
  max-height: min(30vh, 224px);
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
}
.zr-newc-directoryEntries button { justify-content: flex-start; overflow-wrap: anywhere; }
.zr-newc-directoryTools { flex-wrap: wrap; justify-content: space-between; }
.zr-newc-directory p { margin: 0; color: var(--dsw-alias-label-secondary); }
.zr-newc-directory [role="alert"] { color: var(--dsw-alias-state-error-primary); }
.zr-newc-composer { padding: 0 var(--dsh-composer-side-clearance, 16px); min-width: 0; }
.zr-newc[data-zen-remote="new-conversation"] .zr-newc-composer {
  width: min(100%, 720px);
  box-sizing: border-box;
  margin: 0 auto;
}
.zr-newc-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding-top: 8px;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-elevation-soft);
}
.zr-newc-status, .zr-newc-notice, .zr-newc-hint, .zr-newc-failure {
  margin: 6px 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.zr-newc-noticeError {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--dsw-alias-state-danger-fg, var(--dsw-alias-label-primary));
}
.zr-newc-text[data-zen-remote="new-conversation-text"] {
  box-sizing: border-box;
  field-sizing: content;
  width: 100%;
  min-height: 52px;
  max-height: 14lh;
  padding: 4px 14px 0;
  border: 0;
  border-radius: var(--dsw-radius-panel);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  resize: none;
}
.zr-newc-text::placeholder { color: var(--dsw-alias-label-tertiary); }
.zr-newc-text:focus-visible { outline: none; }
@media (pointer: coarse) {
  .zr-newc-text[data-zen-remote="new-conversation-text"] { font-size: max(16px, var(--dsh-content-font-size, 14px)); }
}
.zr-newc-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 2px 8px 6px;
}
.zr-newc-model {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  justify-content: flex-end;
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
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-button-info-fill);
  color: var(--dsw-alias-label-on-color);
  cursor: pointer;
  transform: translateY(-2px);
}
.zr-newc-submit:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.zr-newc-submit:disabled { opacity: 0.4; cursor: default; }
.zr-newc-submit[aria-busy="true"] { opacity: 1; }
@media (prefers-reduced-motion: no-preference) {
  .zr-newc-spinner { animation: zr-newc-spin 700ms linear infinite; }
}
@keyframes zr-newc-spin { to { transform: rotate(360deg); } }

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
