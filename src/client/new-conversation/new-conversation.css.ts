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
  position: relative;
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
.zr-newc-text[data-zen-remote="new-conversation-text"]::placeholder { color: var(--dsw-alias-label-tertiary); }
.zr-newc-text[data-zen-remote="new-conversation-text"]:focus-visible { outline: none; }
@media (pointer: coarse) {
  .zr-newc-text[data-zen-remote="new-conversation-text"] { font-size: max(16px, var(--dsh-content-font-size, 14px)); }
}

.zr-newc-completion[data-zen-remote="new-conversation-completion"] {
  position: absolute;
  bottom: calc(100% + 4px);
  inset-inline: 0;
  z-index: 100;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 4px;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
}
.zr-newc-completion[data-placement="below"] {
  top: calc(100% + 4px);
  bottom: auto;
}
.zr-newc-completionScroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.zr-newc-completionCaption {
  padding: 5px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.zr-newc-completionLine {
  position: relative;
  display: flex;
  align-items: center;
}
.zr-newc-completionOption, .zr-newc-completionDrill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.zr-newc-completionOption {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  text-align: start;
}
.zr-newc-completionLine:has([aria-selected="true"]), .zr-newc-completionDrill:hover {
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}
.zr-newc-completionOption svg, .zr-newc-completionDrill svg {
  flex: none;
  color: var(--dsw-alias-menu-icon);
}
.zr-newc-completionLabel, .zr-newc-completionDetail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zr-newc-completionDetail {
  margin-inline-start: auto;
  max-width: 50%;
  text-align: end;
}
.zr-newc-completionDetail, .zr-newc-completionAlias { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.zr-newc-completionDrill kbd {
  visibility: hidden;
  color: var(--dsw-alias-label-caption);
  font-family: inherit;
  font-size: 10px;
}
.zr-newc-completionLine:has([aria-selected="true"]) kbd { visibility: visible; }
@media (pointer: coarse) {
  .zr-newc-completionDrill kbd { display: none; }
}

/* The draft's images, laid out like the native composer's attachment rail
   (ui-attachment AttachmentRail + ComposerAttachments): 64px rounded
   thumbnails with a remove control at the top-right corner that shows on
   hover and stays on touch, edge arrows that page an overflow, and no
   scrollbar. The card's flex gap (12px) separates every row pair; the
   thumbnails sit closer to the draft text than the other rows, so pull back
   6 here, as the native rail does. */
.zr-newc-images[data-zen-remote="new-conversation-images"] {
  position: relative;
  min-width: 0;
  margin: 0 10px;
  margin-bottom: -6px;
}
.zr-newc-imageRail {
  display: flex;
  align-items: stretch;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  /* Edge arrows page the overflow; the scrollbar stays hidden (both engines). */
  scrollbar-width: none;
}
.zr-newc-imageRail::-webkit-scrollbar { display: none; }
.zr-newc-image {
  position: relative;
  flex: none;
  width: 64px;
  height: 64px;
}
.zr-newc-imagePreview[data-zen-remote="new-conversation-image-preview"] {
  width: 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l2-darkmode-thin, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-interactive-bg-hover);
  cursor: zoom-in;
}
.zr-newc-imagePreview[data-zen-remote="new-conversation-image-preview"]:focus-visible {
  outline: 2px solid var(--dsw-alias-border-strong, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.zr-newc-imagePreview[data-zen-remote="new-conversation-image-preview"] img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"] {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-button-contrast-fill, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-label-primary));
  font: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}
.zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"]:focus-visible { opacity: 1; }
.zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"]:disabled { cursor: default; opacity: 0; }
@media (hover: hover) {
  .zr-newc-image:hover .zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"]:not(:disabled) { opacity: 1; }
}
/* Touch surfaces have no hover to reveal the control. */
@media (hover: none), (pointer: coarse) {
  .zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"]:not(:disabled) { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .zr-newc-imageRemove[data-zen-remote="new-conversation-image-remove"] { transition: none; }
}
.zr-newc-imageArrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2-darkmode-thin, var(--dsw-alias-border-l2));
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  box-shadow: var(--dsw-elevation-panel);
  font: inherit;
  cursor: pointer;
  transform: translateY(-50%);
}
.zr-newc-imageArrowLeft { left: 4px; }
.zr-newc-imageArrowRight { right: 4px; }
@media (hover: hover) {
  .zr-newc-imageArrow:hover { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover)); }
}
.zr-newc-imageArrow:focus-visible {
  outline: 2px solid var(--dsw-alias-border-strong, var(--dsw-alias-state-business-primary));
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
