/**
 * The thinking-level-override settings page: per-model offered thinking
 * levels (multi-select) organized by provider, plus the global
 * unsupported-effort policy. The offered levels are what the conversation's
 * model-selection dialog presents — choosing the actual level stays there.
 * Provider configuration beyond the `reasoningEfforts` field is never touched.
 *
 * @module dsh-thinking-level-override/client/section
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import css from './section.module.css'
import type { CardSource, ReasoningEfforts, SectionDraft, WirePiAiSection } from './section-controller.ts'
import { editableModels, LEVEL_CHOICES } from './section-controller.ts'

/** The registration-side face the section injects. */
export interface ThinkingOverrideSectionFace {
  hooks: {
    /** Live policy snapshot bound by the renderer as useThinkingOverridePolicy. */
    thinkingOverridePolicy: CardSource<SectionDraft>
    /** Live pi-ai section snapshot bound by the renderer as usePiAiSection. */
    piAiSection: CardSource<WirePiAiSection | undefined>
  }
  /** Wire face used to read the model catalog. */
  api: Pick<IApiClient, 'llm'>
  /** Persist the mappings-editor switch and the per-model offered-level changes. */
  saveSection(enableMappings: boolean, changes: Map<string, ReasoningEfforts | undefined>): Promise<string | undefined>
}

/** Props the renderer binds for the section. */
export type ThinkingOverrideSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'thinking-level-override'>
  & InjectFace<ThinkingOverrideSectionFace>

/** Whether two offered-levels dicts differ (undefined and {} both mean inherit). */
function effortsEqual(left: ReasoningEfforts | undefined, right: ReasoningEfforts | undefined): boolean {
  const a = left === undefined ? {} : left
  const b = right === undefined ? {} : right
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Render the thinking-level-override settings page.
 * @param props - locale copy, the live snapshots, the model catalog wire, and the save callback.
 * @returns the section.
 */
export function ThinkingOverrideSection(props: ThinkingOverrideSectionProps): React.ReactElement | null {
  const { t } = props
  const policy = props.useThinkingOverridePolicy(snapshot => snapshot)
  const piAi = props.usePiAiSection(snapshot => snapshot)
  const [mappingsDraft, setMappingsDraft] = useState<boolean>(policy.section.enableMappings)
  const [groups, setGroups] = useState<readonly ModelProviderGroup[]>([])
  // Staged offered levels per editable model: key = `provider\0model`,
  // value = the new dict, or undefined to clear back to inheritance.
  const [selections, setSelections] = useState<Map<string, ReasoningEfforts | undefined>>(new Map())
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  // The one model whose level picker is open; `provider\0model` or undefined.
  const [openPicker, setOpenPicker] = useState<string | undefined>(undefined)
  // Whether the open menu renders above its trigger: the menu must not push
  // past the scroll container's visible area (that would raise a scrollbar),
  // so it flips up when the room below the trigger is short.
  const [menuUp, setMenuUp] = useState(false)
  const pickerRefs = useRef(new Map<string, HTMLDivElement>())
  const menuRefs = useRef(new Map<string, HTMLDivElement>())

  // Decide the menu direction on open, synchronously before paint (so the
  // flip never flashes). The menu renders downward first; the measurement
  // compares its actual height against the room below the trigger inside the
  // nearest scroll container — not the window, whose bottom sits far below a
  // scrollable settings panel. Down wins when it fits; otherwise the menu
  // flips up, provided there is room above; with room on neither side it
  // stays down (the container scrolls instead of clipping).
  useLayoutEffect(() => {
    if (openPicker === undefined) {
      setMenuUp(false)
      return
    }
    const holder = pickerRefs.current.get(openPicker)
    const menu = menuRefs.current.get(openPicker)
    if (holder === undefined || menu === undefined) return
    const holderRect = holder.getBoundingClientRect()
    const menuHeight = menu.getBoundingClientRect().height
    const gap = 4
    // The visible area of the nearest scrollable ancestor, or the window.
    let node: HTMLElement | null = holder.parentElement
    let boundary = { top: 0, bottom: window.innerHeight }
    while (node !== null) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        const rect = node.getBoundingClientRect()
        boundary = { top: rect.top, bottom: rect.bottom }
        break
      }
      node = node.parentElement
    }
    const roomBelow = boundary.bottom - (holderRect.bottom + gap)
    const roomAbove = holderRect.top - gap - boundary.top
    setMenuUp(roomBelow < menuHeight && roomAbove >= menuHeight)
  }, [openPicker])

  // Clicking anywhere outside the open picker closes it.
  useEffect(() => {
    if (openPicker === undefined) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      const holder = pickerRefs.current.get(openPicker)
      if (target !== null && holder !== undefined && holder.contains(target)) return
      setOpenPicker(undefined)
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [openPicker])

  const editable = useMemo(() => editableModels(piAi.section), [piAi.section])

  // A live replacement re-seeds the draft; the section references are stable
  // between changes, so this runs only when the Host state actually moved.
  useEffect(() => {
    setMappingsDraft(policy.section.enableMappings)
    setNotice(undefined)
  }, [policy.section])

  useEffect(() => {
    setSelections(new Map([...editable].map(([key, model]) => [key, model.efforts])))
  }, [editable])

  // The model catalog is read once per page open; it changes only when the
  // user edits provider settings elsewhere, which re-opens this page anyway.
  useEffect(() => {
    let stale = false
    void props.api.llm.models({}).then((response) => {
      if (stale || !response.result.ok) return
      setGroups(response.result.value.groups)
    })
    return () => { stale = true }
  }, [props.api])

  const mappingsDirty = mappingsDraft !== policy.section.enableMappings
  const modelsDirty = [...editable].some(([key, model]) =>
    !effortsEqual(selections.get(key), model.efforts))
  const dirty = mappingsDirty || modelsDirty

  /** Toggle one offered level for one model; clearing the last level restores inheritance. */
  const toggleLevel = (key: string, level: string, checked: boolean): void => {
    setSelections(current => {
      const base = current.get(key) ?? editable.get(key)?.efforts
      const next: ReasoningEfforts = { ...(base ?? {}) }
      if (checked) {
        if (!(level in next)) next[level] = level === 'off' ? null : level
      } else {
        delete next[level]
      }
      const updated = new Map(current)
      updated.set(key, Object.keys(next).length === 0 ? undefined : next)
      return updated
    })
  }

  /** Edit one checked level's wire spelling; a blank value sends nothing on off and the level name elsewhere. */
  const spellLevel = (key: string, level: string, text: string): void => {
    setSelections(current => {
      const base = current.get(key) ?? editable.get(key)?.efforts
      if (base === undefined || !(level in base)) return current
      const trimmed = text.trim()
      const next: ReasoningEfforts = {
        ...base,
        [level]: trimmed.length === 0 ? (level === 'off' ? null : level) : trimmed,
      }
      const updated = new Map(current)
      updated.set(key, next)
      return updated
    })
  }

  /**
   * Rename one checked level, keeping its wire spelling. A blank, unknown,
   * or already-checked target is refused — the controlled input stays put, so
   * the draft never carries a key the adapter schema would reject.
   */
  const renameLevel = (key: string, oldLevel: string, newLevel: string): void => {
    const trimmed = newLevel.trim()
    if (trimmed === oldLevel || trimmed.length === 0 || trimmed === 'off') return
    if (!(LEVEL_CHOICES as readonly string[]).includes(trimmed)) return
    setSelections(current => {
      const base = current.get(key) ?? editable.get(key)?.efforts
      if (base === undefined || !(oldLevel in base) || trimmed in base) return current
      const next: ReasoningEfforts = { ...base }
      // `oldLevel in base` above guarantees the key carries a value.
      const value = next[oldLevel]!
      delete next[oldLevel]
      next[trimmed] = value
      const updated = new Map(current)
      updated.set(key, next)
      return updated
    })
  }

  const onSave = async (): Promise<void> => {
    setSaving(true)
    const changes = new Map<string, ReasoningEfforts | undefined>()
    for (const [key, model] of editable) {
      if (!effortsEqual(selections.get(key), model.efforts)) changes.set(key, selections.get(key))
    }
    const problem = await props.saveSection(policyReady ? mappingsDraft : false, changes)
    setSaving(false)
    setNotice(problem === undefined
      ? { kind: 'ok', text: t('saved') }
      : { kind: 'error', text: problem })
  }

  if (piAi.status === 'unavailable') {
    return <p className={css.notice}>{t('unavailable')}</p>
  }
  // The plugin's own namespace may sit outside the gateway's settings-exposure
  // allowlist (no harness patch): the page then degrades to the core feature —
  // offered-level selection writes into the pi-ai namespace, which is always
  // exposed — and only the mappings switch and editor are unavailable.
  const policyReady = policy.status !== 'unavailable'
  const writable = piAi.writable
  const mappingsWritable = policyReady && policy.writable && piAi.writable

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {policyReady
        ? (
          <label className={css.field}>
            <span className={css.label}>{t('mappingsToggle')}</span>
            <span className={mappingsDraft ? `${css.toggle} ${css.toggleOn}` : css.toggle}>
              <input
                type="checkbox"
                className={css.toggleInput}
                checked={mappingsDraft}
                disabled={!mappingsWritable}
                aria-label={t('mappingsToggle')}
                onChange={event => { setMappingsDraft(event.target.checked) }}
              />
              <span className={css.toggleTrack} aria-hidden>
                <span className={css.toggleKnob} aria-hidden />
              </span>
            </span>
            <span className={css.hint}>{t('mappingsHint')}</span>
          </label>
        )
        : <p className={css.notice}>{t('mappingsUnavailable')}</p>}

      {groups.length === 0 ? <p className={css.notice}>{t('noModels')}</p> : null}
      {groups.map(group => (
        <section key={group.id} className={css.provider}>
          <h3 className={css.providerName}>{group.name}</h3>
          {group.models.length === 0
            ? <p className={css.notice}>{t('noModels')}</p>
            : (
              <ul className={css.modelList}>
                {group.models.map(model => {
                  const key = `${group.id}\u0000${model.id}`
                  const editableEntry = editable.get(key)
                  if (editableEntry === undefined) {
                    return (
                      <li key={model.id} className={css.modelRow}>
                        <span className={css.modelName} title={model.id}>{model.name}</span>
                        <span className={css.notice}>{t('notEditable')}</span>
                      </li>
                    )
                  }
                  const efforts = selections.get(key)
                  const checkedLevels = efforts === undefined ? [] : Object.keys(efforts)
                  const pickerOpen = openPicker === key
                  return (
                    <li key={model.id} className={css.modelRow}>
                      <span className={css.modelName} title={model.id}>{model.name}</span>
                      <div
                        className={css.picker}
                        ref={el => {
                          if (el !== null) pickerRefs.current.set(key, el)
                          else pickerRefs.current.delete(key)
                        }}
                      >
                        <button
                          type="button"
                          className={css.pickerButton}
                          aria-expanded={pickerOpen}
                          aria-haspopup="listbox"
                          aria-label={`${t('modelLevel')} ${model.name}`}
                          title={checkedLevels.length === 0 ? undefined : checkedLevels.join(', ')}
                          disabled={!writable}
                          onClick={() => { setOpenPicker(pickerOpen ? undefined : key) }}
                        >
                          <span className={css.pickerLabel}>
                            {checkedLevels.length === 0 ? t('selectLevels') : t('levelsSelected')}
                          </span>
                          <span className={css.pickerChevron} aria-hidden />
                        </button>
                        {pickerOpen
                          ? (
                            <div
                              className={menuUp ? `${css.pickerMenu} ${css.pickerMenuUp}` : css.pickerMenu}
                              role="listbox"
                              aria-multiselectable="true"
                              ref={el => {
                                if (el !== null) menuRefs.current.set(key, el)
                                else menuRefs.current.delete(key)
                              }}
                            >
                              {LEVEL_CHOICES.map(level => {
                                const checked = efforts !== undefined && level in efforts
                                return (
                                  <label key={level} className={css.pickerItem}>
                                    <input
                                      type="checkbox"
                                      className={css.pickerInput}
                                      checked={checked}
                                      aria-label={`${t('modelLevel')} ${model.name} ${level}`}
                                      onChange={event => { toggleLevel(key, level, event.target.checked) }}
                                    />
                                    <span
                                      className={checked ? `${css.pickerMark} ${css.pickerMarkChecked}` : css.pickerMark}
                                      aria-hidden
                                    />
                                    <span>{level}</span>
                                    {level === 'off' ? <span className={css.pickerNote}>{t('offNote')}</span> : null}
                                  </label>
                                )
                              })}
                            </div>
                          )
                          : null}
                      </div>
                      {/* off means "thinking disabled" and carries no mapping row:
                          checking it always sends nothing. The mapping editor
                          renders only while the master switch is on — and only
                          when the plugin namespace is exposed. */}
                      {policyReady && mappingsDraft && checkedLevels.some(level => level !== 'off')
                        ? (
                          <div className={css.mapList}>
                            <div className={css.mapHead}>
                              <span className={css.mapHeadLevel}>{t('mapLevel')}</span>
                              <span className={css.mapArrow} aria-hidden>→</span>
                              <span className={css.mapHeadWire}>{t('wireSpelling')}</span>
                            </div>
                            {checkedLevels.filter(level => level !== 'off').map(level => {
                              const spelling = efforts?.[level]
                              return (
                                <span key={level} className={css.mapRow}>
                                  <Input
                                    className={css.mapLevel as string}
                                    type="text"
                                    value={level}
                                    aria-label={`${t('mapLevel')} ${model.name}`}
                                    disabled={!mappingsWritable}
                                    onChange={event => { renameLevel(key, level, event.target.value) }}
                                  />
                                  <span className={css.mapArrow} aria-hidden>→</span>
                                  <Input
                                    className={css.mapWire as string}
                                    type="text"
                                    value={spelling === undefined || spelling === null ? '' : spelling}
                                    placeholder={level === 'off' ? t('wireOff') : level}
                                    aria-label={`${t('wireSpelling')} ${model.name} ${level}`}
                                    disabled={!mappingsWritable}
                                    onChange={event => { spellLevel(key, level, event.target.value) }}
                                  />
                                  <button
                                    type="button"
                                    className={css.mapRemove}
                                    aria-label={t('removeLevel')}
                                    disabled={!mappingsWritable}
                                    onClick={() => { toggleLevel(key, level, false) }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        )
                        : null}
                    </li>
                  )
                })}
              </ul>
            )}
        </section>
      ))}

      <div className={css.footer}>
        <span className={css.spacer} />
        {notice !== undefined && (
          <span className={notice.kind === 'ok' ? css.noticeOk : css.noticeError}>{notice.text}</span>
        )}
        {dirty && notice === undefined && <span className={css.noticeDirty}>{t('dirty')}</span>}
        <Button
          variant="outline"
          disabled={!dirty || saving || !writable}
          onClick={() => {
            setMappingsDraft(policy.section.enableMappings)
            setSelections(new Map([...editable].map(([key, model]) => [key, model.efforts])))
            setNotice(undefined)
          }}
        >
          {t('discard')}
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || saving || !writable}
          onClick={() => { void onSave() }}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}
