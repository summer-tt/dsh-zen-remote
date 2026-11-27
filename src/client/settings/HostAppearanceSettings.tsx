import { useId, useState, useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { getRemoteStatusStore } from '../../client-data/remote-status.ts'
import type { SettingsFormOp, ZenRemoteSettingsForm } from '../../client-data/settings-form.ts'
import {
  HOST_APPEARANCE_FIELD, HOST_COLORS, HOST_ICONS,
  hostDisplayName, isSessionHostId, parseHostAppearance, resolveHostStyle, type HostAppearanceStore,
} from '../../client-data/session-host-appearance.ts'
import { NS } from '../locales.ts'
import { HostGlyph } from '../SessionHostIcon.tsx'

export function HostAppearanceSettings({ appearance, form, t }: PropsLocale<typeof NS> & {
  appearance: HostAppearanceStore
  form: ZenRemoteSettingsForm
}) {
  const titleId = useId()
  const config = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot)
  const status = getRemoteStatusStore()
  const { view } = useSyncExternalStore(status.subscribe, status.getSnapshot)
  const [selected, setSelected] = useState('local')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [failedOp, setFailedOp] = useState<SettingsFormOp>()
  const { writable, scopeStatus, saving: formSaving } = form.getSnapshot()
  const canEdit = scopeStatus === 'ready' && writable && !formSaving
  const hostIds = [...new Set(['local', ...Object.keys(view?.servers ?? {}), ...Object.keys(config.hosts)])].filter(isSessionHostId)
  const hostId = hostIds.includes(selected) ? selected : 'local'
  const hostName = (id: string) => hostDisplayName(id, view, t('hostAppearance.local'))
  const style = resolveHostStyle(config, hostId)
  const overrides = parseHostAppearance(form.rowUser()[HOST_APPEARANCE_FIELD]).hosts

  const save = async (op: SettingsFormOp): Promise<void> => {
    if (!canEdit) return
    setSaveState('saving')
    const saved = await form.writeHostAppearance(op)
    setFailedOp(saved ? undefined : op)
    setSaveState(saved ? 'saved' : 'failed')
  }
  const set = (path: string[], value: unknown) => void save({ op: 'set', path, value })
  const unset = (path: string[]) => void save({ op: 'unset', path })
  const disabled = !canEdit || saveState === 'saving'

  return (
    <section className="zr-settings-card zr-settings-host" aria-labelledby={titleId}>
      <h3 id={titleId} className="zr-settings-card-title">{t('hostAppearance.title')}</h3>
      <div className="zr-settings-field">
        <p className="zr-settings-hint">{t('hostAppearance.hint')}</p>
        {(['enabled', 'sidebar', 'header'] as const).map(field => (
          <label key={field} className="zr-settings-check-row">
            <input
              type="checkbox"
              role="switch"
              checked={config[field]}
              disabled={disabled || (field !== 'enabled' && !config.enabled)}
              onChange={event => set([field], event.currentTarget.checked)}
            />
            {t(`hostAppearance.${field}`)}
          </label>
        ))}
      </div>
      <div className="zr-settings-field">
        <label className="zr-settings-host-select">
          {t('hostAppearance.host')}
          <select className="zr-settings-input" value={hostId} disabled={saveState === 'saving'} onChange={event => {
            setSelected(event.currentTarget.value)
            setSaveState('idle')
            setFailedOp(undefined)
          }}>
            {hostIds.map(id => <option key={id} value={id}>{hostName(id)}</option>)}
          </select>
        </label>
        <label className="zr-settings-host-select">
          {t('hostAppearance.color')}
          <select className="zr-settings-input" value={config.hosts[hostId]?.color ?? ''} disabled={disabled} onChange={event => {
            const color = event.currentTarget.value
            if (color === '') unset(['hosts', hostId, 'color'])
            else set(['hosts', hostId, 'color'], color)
          }}>
            <option value="">{t('hostAppearance.automatic')}</option>
            {HOST_COLORS.map(color => <option key={color} value={color}>{t(`hostAppearance.color.${color}`)}</option>)}
          </select>
        </label>
        <label className="zr-settings-host-select">
          {t('hostAppearance.icon')}
          <select className="zr-settings-input" value={config.hosts[hostId]?.icon ?? ''} disabled={disabled} onChange={event => {
            const icon = event.currentTarget.value
            if (icon === '') unset(['hosts', hostId, 'icon'])
            else set(['hosts', hostId, 'icon'], icon)
          }}>
            <option value="">{t('hostAppearance.automatic')}</option>
            {HOST_ICONS.map(icon => <option key={icon} value={icon}>{t(`hostAppearance.icon.${icon}`)}</option>)}
          </select>
        </label>
        <div className="zr-settings-check-row">
          <span>{t('hostAppearance.preview')}</span>
          <HostGlyph {...style} size={16} label={t('hostAppearance.hostLabel', { host: hostName(hostId) })} />
        </div>
        <div className="zr-settings-row">
          <button type="button" className="zr-settings-reset" disabled={disabled || overrides[hostId] === undefined} onClick={() => unset(['hosts', hostId])}>
            {t('hostAppearance.resetHost')}
          </button>
          <button type="button" className="zr-settings-reset" disabled={disabled || !Object.hasOwn(form.rowUser(), HOST_APPEARANCE_FIELD)} onClick={() => unset([])}>
            {t('hostAppearance.resetAll')}
          </button>
        </div>
        {scopeStatus === 'ready' && !writable && <p className="zr-settings-hint">{t('hostAppearance.readOnly')}</p>}
        <p role="status" className="zr-settings-hint" data-invalid={saveState === 'failed'}>
          {saveState === 'idle' ? null : t(`hostAppearance.${saveState}`)}
        </p>
        {saveState === 'failed' && failedOp !== undefined && (
          <button type="button" className="zr-settings-reset" disabled={disabled} onClick={() => void save(failedOp)}>
            {t('hostAppearance.retry')}
          </button>
        )}
      </div>
    </section>
  )
}
