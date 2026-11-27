/**
 * Detect the native Electron shell before enabling browser-only UI.
 *
 * The official desktop app is an Electron shell whose preload exposes a
 * `dshDesktop` bridge on `window` before any page script runs
 * (apps/desktop preload-app.ts, `contextBridge.exposeInMainWorld`), which is
 * the same marker official ui-settings gates desktop-only UI on. The check
 * is therefore synchronous and stable for the whole page lifetime.
 *
 * @param host - host object to probe.
 * @returns whether the official desktop preload is present.
 */
export function isDesktopShell(host: object = globalThis): boolean {
  return 'dshDesktop' in host
}

/**
 * Select the desktop UI independently of window width. The gateway's explicit
 * device choice takes precedence over the browser's primary pointer.
 * @param host - browser capabilities and the optional gateway device marker.
 * @returns whether to leave the desktop UI to DSH.
 */
export function usesNativeDesktopUi(host: Pick<Window, 'matchMedia' | 'document'> = window): boolean {
  if (isDesktopShell(host)) return true
  const kind = host.document.documentElement.dataset.lanDevice
  if (kind === 'desktop') return true
  if (kind === 'phone') return false
  return host.matchMedia('(hover: hover) and (pointer: fine)').matches
}
