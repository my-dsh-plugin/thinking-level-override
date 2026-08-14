import { describe, expect, it, vi } from 'vitest'
import { editableModels, ThinkingOverrideSectionController } from '../src/client/section-controller.ts'
import type { WirePiAiSection } from '../src/client/section-controller.ts'

/**
 * The save path's branch bug: a `models`-array entry's address path is
 * `providers/<route>/models/<index>/reasoningEfforts`, so the array/object
 * choice must read `path[2]` — reading `path[3]` (the index digit) sent every
 * array model to `modelOverrides["<index>"]`, which pi-ai rejects
 * (`sets modelOverrides for "0" beside a models list`).
 */

/** A pi-ai section with one array route and one override entry. */
const section: WirePiAiSection = {
  providers: {
    qwen: {
      models: [{ id: 'm1', name: 'M1' }, { id: 'm2', name: 'M2' }],
      modelOverrides: { extra: { name: 'Extra' } },
    },
  },
}

/** Build the controller against mocked scopes and wire. */
function harness(): {
  controller: ThinkingOverrideSectionController
  mutate: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
} {
  const set = vi.fn(async () => {})
  const policyScope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: undefined }),
    subscribe: () => () => {},
    set,
  }
  const piAiScope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: section }),
    subscribe: () => () => {},
  }
  const mutate = vi.fn(async () => ({ result: { ok: true, value: {} } }))
  const controller = new ThinkingOverrideSectionController(
    policyScope as never,
    piAiScope as never,
    { settings: { mutate } } as never,
  )
  return { controller, mutate, set }
}

describe('editableModels()', () => {
  it('addresses array entries with the index and override entries with the model id', () => {
    const editable = editableModels(section)
    expect(editable.get('qwen\u0000m1')?.path).toEqual(
      ['providers', 'qwen', 'models', '0', 'reasoningEfforts'],
    )
    expect(editable.get('qwen\u0000m2')?.path).toEqual(
      ['providers', 'qwen', 'models', '1', 'reasoningEfforts'],
    )
    expect(editable.get('qwen\u0000extra')?.path).toEqual(
      ['providers', 'qwen', 'modelOverrides', 'extra', 'reasoningEfforts'],
    )
  })
})

describe('ThinkingOverrideSectionController.save()', () => {
  it('writes array models back into the models array, not modelOverrides', async () => {
    const { controller, mutate, set } = harness()
    const changes = new Map([['qwen\u0000m1', { high: 'high' }]])
    expect(await controller.save(true, changes)).toBeUndefined()

    expect(mutate).toHaveBeenCalledTimes(1)
    const { ns, ops } = mutate.mock.calls[0]![0] as { ns: string; ops: Array<{ op: string; path: string[]; value?: unknown }> }
    expect(ns).toBe('llm-pi-ai')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ op: 'set', path: ['providers', 'qwen', 'models'] })
    const models = (ops[0]!.value as Array<Record<string, unknown>>)
    expect(models).toHaveLength(2)
    expect(models[0]).toEqual({ id: 'm1', name: 'M1', reasoningEfforts: { high: 'high' } })
    // The untouched sibling keeps every field and gains no reasoningEfforts.
    expect(models[1]).toEqual({ id: 'm2', name: 'M2' })
    expect(set).toHaveBeenCalledWith('enableMappings', true)
    expect(set).toHaveBeenCalledWith('onUnsupported', 'fail')
  })

  it('writes override entries as object-path sets preserving their other fields', async () => {
    const { controller, mutate } = harness()
    const changes = new Map([['qwen\u0000extra', { max: 'ultra' }]])
    expect(await controller.save(false, changes)).toBeUndefined()

    const { ops } = mutate.mock.calls[0]![0] as { ops: Array<{ op: string; path: string[]; value?: unknown }> }
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      op: 'set',
      path: ['providers', 'qwen', 'modelOverrides', 'extra'],
    })
    expect(ops[0]!.value).toEqual({ name: 'Extra', reasoningEfforts: { max: 'ultra' } })
  })

  it('handles array and override changes in one save', async () => {
    const { controller, mutate } = harness()
    const changes = new Map<string, unknown>([
      ['qwen\u0000m1', { high: 'high' }],
      ['qwen\u0000extra', { max: 'ultra' }],
    ])
    expect(await controller.save(true, changes as never)).toBeUndefined()

    const { ops } = mutate.mock.calls[0]![0] as { ops: Array<{ op: string; path: string[]; value?: unknown }> }
    expect(ops).toHaveLength(2)
    expect(ops.map(op => op.path.join('/'))).toEqual([
      'providers/qwen/modelOverrides/extra',
      'providers/qwen/models',
    ])
  })

  it('clears reasoningEfforts from an array entry when the level set empties', async () => {
    const { controller, mutate } = harness()
    const changes = new Map([['qwen\u0000m1', undefined]])
    expect(await controller.save(false, changes)).toBeUndefined()

    const { ops } = mutate.mock.calls[0]![0] as { ops: Array<{ op: string; path: string[]; value?: unknown }> }
    const models = (ops[0]!.value as Array<Record<string, unknown>>)
    expect(models[0]).toEqual({ id: 'm1', name: 'M1' })
  })

  it('reports a refused mutate instead of throwing', async () => {
    const set = vi.fn(async () => {})
    const policyScope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: undefined }),
      subscribe: () => () => {},
      set,
    }
    const piAiScope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: section }),
      subscribe: () => () => {},
    }
    const mutate = vi.fn(async () => ({
      result: { ok: false, error: { message: 'settings-not-exposed' } },
    }))
    const controller = new ThinkingOverrideSectionController(
      policyScope as never,
      piAiScope as never,
      { settings: { mutate } } as never,
    )
    const changes = new Map([['qwen\u0000m1', { high: 'high' }]])
    expect(await controller.save(true, changes)).toBe('settings-not-exposed')
    expect(set).not.toHaveBeenCalled()
  })

  it('skips the policy writes when the plugin namespace is not writable', async () => {
    const set = vi.fn(async () => {})
    const policyScope = {
      // Unwritable: the namespace sits outside the gateway's exposure
      // allowlist — the save must degrade to the pi-ai writes only.
      getSnapshot: () => ({ status: 'unavailable', writable: false, value: undefined }),
      subscribe: () => () => {},
      set,
    }
    const piAiScope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: section }),
      subscribe: () => () => {},
    }
    const mutate = vi.fn(async () => ({ result: { ok: true, value: {} } }))
    const controller = new ThinkingOverrideSectionController(
      policyScope as never,
      piAiScope as never,
      { settings: { mutate } } as never,
    )
    const changes = new Map([['qwen\u0000m1', { high: 'high' }]])
    expect(await controller.save(true, changes)).toBeUndefined()

    // The pi-ai write still lands; the policy fields are left untouched.
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(set).not.toHaveBeenCalled()
  })
})
