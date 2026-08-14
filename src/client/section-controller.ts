/**
 * The section's controllers: the `thinking-level-override` namespace for the
 * global unsupported-effort policy, and the `llm-pi-ai` namespace for each
 * model's offered thinking levels (`reasoningEfforts`). The per-model options
 * live with the adapter's model entries — that is what the conversation's
 * model-selection dialog renders — so the section edits them there, while the
 * policy stays in this plugin's own namespace.
 *
 * @module dsh-thinking-level-override/client/section-controller
 */

import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'

/** Settings namespace the Host plugin registers; spelled here because a client package must not import a Host package. */
export const THINKING_OVERRIDE_NS = 'thinking-level-override'

/** Settings namespace of the pi-ai adapter, whose model entries own `reasoningEfforts`. */
export const LLM_PI_AI_NS = 'llm-pi-ai'

/** Thinking levels a model may offer, in escalation order. */
export const LEVEL_CHOICES = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** The pi-ai section as this page reads it. */
export interface WirePiAiSection {
  providers?: Record<string, {
    models?: Array<Record<string, unknown>>
    modelOverrides?: Record<string, Record<string, unknown>>
  }>
}

/** The thinking-level-override section as stored. */
export interface WireSection {
  /**
   * Master switch for the per-model wire-spelling mapping editor. When off,
   * the editor is hidden; saved levels and spellings stay in effect.
   */
  enableMappings?: boolean
  /**
   * What to do with an effort the exact model cannot serve, when the matching
   * rule does not say. Kept at `fail` (stock harness behavior: the model
   * errors natively) — models ship their own compat layer, so the page no
   * longer offers the clamp/drop choices.
   */
  onUnsupported: 'clamp' | 'drop' | 'fail'
  rules: unknown[]
}

/** A model's declared offered levels: level → wire spelling (null = send nothing). */
export type ReasoningEfforts = Record<string, string | null>

/** The mappings-editor draft. */
export interface SectionDraft {
  /** Whether the per-model mapping editor is shown. */
  enableMappings: boolean
}

/** One scope's snapshot projection. */
export interface CardSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
  section: T
}

/** Observable source the renderer binds as a snapshot hook. */
export interface CardSource<T> {
  getSnapshot(): CardSnapshot<T>
  subscribe(listener: () => void): () => void
}

/** The editable draft of the section the scope currently resolves. */
export function toDraft(section: WireSection | undefined): SectionDraft {
  return {
    enableMappings: section?.enableMappings ?? false,
  }
}

/** The offered-levels dict of one model entry, when it declares one. */
export function reasoningEffortsOf(entry: Record<string, unknown>): ReasoningEfforts | undefined {
  const value = entry['reasoningEfforts']
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ReasoningEfforts
    : undefined
}

/** An editable model's settings address within the pi-ai section. */
export interface ModelAddress {
  /** Provider route key. */
  provider: string
  /** Model id. */
  model: string
  /** Settings path to the model's `reasoningEfforts` field. */
  path: string[]
  /** Current offered levels, when declared. */
  efforts?: ReasoningEfforts
}

/**
 * The pi-ai model entries this page may edit: every model that appears in a
 * provider's `models` list or `modelOverrides` dict.
 * @param section - the pi-ai section snapshot.
 * @returns editable addresses keyed by `provider\0model`.
 */
export function editableModels(section: WirePiAiSection | undefined): Map<string, ModelAddress> {
  const found = new Map<string, ModelAddress>()
  for (const [provider, profile] of Object.entries(section?.providers ?? {})) {
    for (const [index, entry] of (profile.models ?? []).entries()) {
      const model = String(entry['id'] ?? '')
      if (model.length === 0) continue
      const efforts = reasoningEffortsOf(entry)
      found.set(`${provider}\u0000${model}`, {
        provider,
        model,
        path: ['providers', provider, 'models', String(index), 'reasoningEfforts'],
        ...efforts === undefined ? {} : { efforts },
      })
    }
    for (const [model, entry] of Object.entries(profile.modelOverrides ?? {})) {
      const efforts = reasoningEffortsOf(entry)
      found.set(`${provider}\u0000${model}`, {
        provider,
        model,
        path: ['providers', provider, 'modelOverrides', model, 'reasoningEfforts'],
        ...efforts === undefined ? {} : { efforts },
      })
    }
  }
  return found
}

/** One model's write: the settings path to its `reasoningEfforts`, and its new value. */
export interface ModelWrite {
  path: string[]
  /** New offered-levels dict; absent clears the field back to inheritance. */
  efforts?: ReasoningEfforts
}

/** Bridges the two settings scopes and the write path onto the section. */
export class ThinkingOverrideSectionController {
  /** Publishes the policy scope; the renderer binds it as the policy hook. */
  readonly policySource: CardSource<SectionDraft>
  /** Publishes the pi-ai scope; the renderer binds it as the catalog hook. */
  readonly piAiSource: CardSource<WirePiAiSection | undefined>

  /**
   * @param policyScope - the bound scope for the thinking-level-override namespace.
   * @param piAiScope - the bound scope for the llm-pi-ai namespace.
   * @param api - wire face used for the writes into the pi-ai section.
   */
  constructor(
    private readonly policyScope: SettingsScope<WireSection>,
    private readonly piAiScope: SettingsScope<WirePiAiSection>,
    private readonly api: Pick<IApiClient, 'settings'>,
  ) {
    this.policySource = this.bind(policyScope, live => ({
      status: live.status,
      writable: live.writable,
      section: toDraft(live.value),
    }))
    this.piAiSource = this.bind(piAiScope, live => ({
      status: live.status,
      writable: live.writable,
      section: live.value,
    }))
  }

  private bind<S, T>(
    scope: SettingsScope<S>,
    project: (live: SettingsScopeSnapshot<S>) => CardSnapshot<T>,
  ): CardSource<T> {
    const listeners = new Set<() => void>()
    let snapshot = project(scope.getSnapshot())
    scope.subscribe(() => {
      snapshot = project(scope.getSnapshot())
      for (const listener of [...listeners]) listener()
    })
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }

  /**
   * Persist the mappings-editor switch and the per-model offered-level
   * changes. The switch writes through the plugin's own scope, alongside a
   * fixed `onUnsupported: fail` — the page no longer offers clamp/drop, so
   * saving pins the stock harness behavior (the model errors natively) even
   * when an older user layer set a different policy. Each model's
   * `reasoningEfforts` writes through the settings mutate seam: a
   * `modelOverrides` entry takes a direct object-path write, while a
   * `models`-array entry writes the whole array rebuilt with that one entry's
   * field changed — the mutate path ops cannot address array elements, so no
   * other field of the array is touched.
   * @param enableMappings - whether the mapping editor is shown.
   * @param changes - per editable model (`provider\0model` key): the new
   *   offered-levels dict, or `undefined` to clear the field back to inheritance.
   * @returns a human-readable failure, or `undefined` once every write settles.
   */
  async save(
    enableMappings: boolean,
    changes: Map<string, ReasoningEfforts | undefined>,
  ): Promise<string | undefined> {
    const section = this.piAiScope.getSnapshot().value
    const editable = editableModels(section)
    type PathOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }
    const ops: PathOp[] = []
    // Rebuilt `models` arrays per provider route: path ops cannot cross an
    // array, so each route with a changed array entry writes its whole array.
    const arraysByRoute = new Map<string, { route: string; index: number; efforts: ReasoningEfforts | undefined }[]>()
    for (const [key, efforts] of changes) {
      const address = editable.get(key)
      if (address === undefined) continue
      // The address path is one of two fixed shapes:
      //   `providers/<route>/models/<index>/reasoningEfforts`         (array)
      //   `providers/<route>/modelOverrides/<model>/reasoningEfforts` (object)
      // so `path[2]` tells the two apart — `path[3]` is the index for an
      // array entry (a digit) and the model id for an override entry.
      if (address.path[2] === 'models') {
        const route = address.path[1]!
        const index = Number(address.path[3]!)
        const entries = arraysByRoute.get(route) ?? []
        entries.push({ route, index, efforts })
        arraysByRoute.set(route, entries)
      } else {
        const route = address.path[1]!
        const model = address.path[3]!
        const original = section?.providers?.[route]?.modelOverrides?.[model] ?? {}
        const next = { ...original }
        if (efforts === undefined) delete next['reasoningEfforts']
        else next['reasoningEfforts'] = efforts
        ops.push({ op: 'set', path: ['providers', route, 'modelOverrides', model], value: next })
      }
    }
    for (const [route, changed] of arraysByRoute) {
      const profile = section?.providers?.[route]
      const models = [...(profile?.models ?? [])]
      for (const { index, efforts } of changed) {
        if (index >= models.length) continue
        const next = { ...models[index] }
        if (efforts === undefined) delete next['reasoningEfforts']
        else next['reasoningEfforts'] = efforts
        models[index] = next
      }
      ops.push({ op: 'set', path: ['providers', route, 'models'], value: models })
    }
    try {
      if (ops.length > 0) {
        const response = await this.api.settings.mutate({ ns: LLM_PI_AI_NS, ops })
        if (!response.result.ok) return response.result.error.message
      }
      // The plugin namespace may sit outside the gateway's exposure
      // allowlist; the section then degrades to the pi-ai writes only, and
      // the policy fields stay untouched instead of failing the save.
      if (this.policyScope.getSnapshot().writable) {
        await this.policyScope.set('enableMappings', enableMappings)
        await this.policyScope.set('onUnsupported', 'fail')
      }
      return undefined
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}
