import { useId, useState, useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { HOST_APPEARANCE_FIELD, HOST_COLORS, HOST_ICONS, parseHostAppearance, resolveHostStyle, type HostAppearanceStore, type HostColor, type HostIcon, type HostStyle } from '../../client-data/session-host-appearance.ts'
import type { SettingsFormOp, ZenRemoteSettingsForm } from '../../client-data/settings-form.ts'
import { hostStyleOps } from '../../client-data/paired-host-appearance.ts'
import { NS } from '../locales.ts'
import { HostGlyph } from '../SessionHostIcon.tsx'

type Copy = PropsLocale<typeof NS>
type SettingsProps = Copy & { appearance: HostAppearanceStore; form: ZenRemoteSettingsForm; disabled?: boolean }

export function HostAppearanceFields({ style, preview, onChange, disabled, t }: Copy & {
  style: HostStyle
  preview: Required<HostStyle>
  onChange(style: HostStyle): void
  disabled: boolean
}) {
  const id = useId()
  return (
    <div className="zr-wizard-formStack">
      <div className="zr-wizard-field">
        <label className="zr-wizard-label" htmlFor={`${id}-color`}>{t('hostAppearance.color')}</label>
        <select id={`${id}-color`} className="zr-wizard-select" value={style.color ?? ''} disabled={disabled} onChange={event => {
          const next = { ...style }
          const value = event.currentTarget.value
          if (value === '') delete next.color
          else next.color = value as HostColor
          onChange(next)
        }}>
          <option value="">{t('hostAppearance.automatic')}</option>
          {HOST_COLORS.map(color => <option key={color} value={color}>{t(`hostAppearance.color.${color}`)}</option>)}
        </select>
      </div>
      <div className="zr-wizard-field">
        <label className="zr-wizard-label" htmlFor={`${id}-icon`}>{t('hostAppearance.icon')}</label>
        <select id={`${id}-icon`} className="zr-wizard-select" value={style.icon ?? ''} disabled={disabled} onChange={event => {
          const next = { ...style }
          const value = event.currentTarget.value
          if (value === '') delete next.icon
          else next.icon = value as HostIcon
          onChange(next)
        }}>
          <option value="">{t('hostAppearance.automatic')}</option>
          {HOST_ICONS.map(icon => <option key={icon} value={icon}>{t(`hostAppearance.icon.${icon}`)}</option>)}
        </select>
      </div>
      <div className="zr-wizard-labelRow">
        <HostGlyph {...preview} size={16} label={t('hostAppearance.preview')} />
        <span className="zr-wizard-label" aria-hidden="true">{t('hostAppearance.preview')}</span>
      </div>
    </div>
  )
}

function useAppearanceSave(form: ZenRemoteSettingsForm, disabled = false) {
  const snapshot = useSyncExternalStore(cb => form.subscribe(cb), () => form.getSnapshot())
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [failedOps, setFailedOps] = useState<readonly SettingsFormOp[]>()
  const blocked = disabled || !snapshot.writable || snapshot.scopeStatus !== 'ready' || snapshot.saving || status === 'saving'
  const save = async (ops: readonly SettingsFormOp[]) => {
    if (blocked) return false
    setStatus('saving')
    const saved = await form.writeHostAppearanceFields(ops)
    setFailedOps(saved ? undefined : ops)
    setStatus(saved ? 'saved' : 'failed')
    return saved
  }
  return { blocked, save, status, failedOps, writable: snapshot.writable }
}

export function HostAppearanceEditor({ appearance, form, hostId, title, disabled, t }: SettingsProps & { hostId: string; title?: string }) {
  const config = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot)
  const current = config.hosts[hostId] ?? {}
  const [draft, setDraft] = useState<HostStyle>()
  const { blocked, save, status, failedOps, writable } = useAppearanceSave(form, disabled)
  const style = draft ?? current
  const preview = { ...resolveHostStyle(parseHostAppearance(undefined), hostId), ...style }
  const changes = hostStyleOps(hostId, style, current)
  const saveEditor = async (ops: readonly SettingsFormOp[]) => {
    if (await save(ops)) setDraft(undefined)
  }
  return (
    <details className="zr-wizard-hostAppearance" onToggle={event => { if (!event.currentTarget.open) setDraft(undefined) }}>
      <summary className="zr-wizard-label">{title ?? t('hostAppearance.edit')}</summary>
      <HostAppearanceFields style={style} preview={preview} disabled={blocked} onChange={setDraft} t={t} />
      <div className="zr-wizard-deviceActions">
        <button type="button" className="zr-wizard-btn" disabled={blocked || changes.length === 0} onClick={() => void saveEditor(changes)}>
          {t('settings.save')}
        </button>
        <button type="button" className="zr-wizard-linkBtn" disabled={blocked || !Object.hasOwn(parseHostAppearance(form.rowUser()[HOST_APPEARANCE_FIELD]).hosts, hostId)} onClick={() => {
          void saveEditor([{ op: 'unset', path: ['hosts', hostId] }])
        }}>{t('hostAppearance.resetHost')}</button>
      </div>
      {!writable && <p className="zr-wizard-hint">{t('hostAppearance.readOnly')}</p>}
      {failedOps !== undefined && <button type="button" className="zr-wizard-linkBtn" disabled={blocked} onClick={() => void saveEditor(failedOps)}>{t('hostAppearance.retry')}</button>}
      <p role="status" className="zr-wizard-hint">{status === 'idle' ? null : t(`hostAppearance.${status}`)}</p>
    </details>
  )
}

export function LocalHostAppearance({ appearance, form, t }: SettingsProps) {
  const config = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot)
  const { blocked, save, status, failedOps, writable } = useAppearanceSave(form)
  return (
    <div className="zr-wizard-formStack">
      <p className="zr-wizard-hint">{t('hostAppearance.hint')}</p>
      {(['enabled', 'sidebar', 'header'] as const).map(field => (
        <label key={field} className="zr-wizard-checkRow">
          <input type="checkbox" checked={config[field]} disabled={blocked || (field !== 'enabled' && !config.enabled)} onChange={event => {
            void save([{ op: 'set', path: [field], value: event.currentTarget.checked }])
          }} />
          <span>{t(`hostAppearance.${field}`)}</span>
        </label>
      ))}
      <HostAppearanceEditor appearance={appearance} form={form} hostId="local" title={t('hostAppearance.localEdit')} t={t} />
      <div className="zr-wizard-deviceActions">
        <button type="button" className="zr-wizard-linkBtn" disabled={blocked || !Object.hasOwn(form.rowUser(), HOST_APPEARANCE_FIELD)} onClick={() => void save([{ op: 'unset', path: [] }])}>
          {t('hostAppearance.resetAll')}
        </button>
      </div>
      {!writable && <p className="zr-wizard-hint">{t('hostAppearance.readOnly')}</p>}
      {failedOps !== undefined && <button type="button" className="zr-wizard-linkBtn" disabled={blocked} onClick={() => void save(failedOps)}>{t('hostAppearance.retry')}</button>}
      <p role="status" className="zr-wizard-hint">{status === 'idle' ? null : t(`hostAppearance.${status}`)}</p>
    </div>
  )
}
