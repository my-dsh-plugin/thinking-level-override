import { Context } from '@deepseek-ai/cordis'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import type { Config as ConfigShape } from '../src/config.ts'

/** Capabilities of the stub route's models: model id → offered effort ids. */
const DEFAULT_CAPABILITIES: Record<string, readonly string[] | undefined> = {
  'think-a': ['off', 'low', 'high'],
  'think-b': ['off', 'medium', 'max'],
  plain: undefined,
}

/** Adapter that describes fixed per-model reasoning capabilities and never streams. */
class StubAdapter extends LlmAdapter {
  constructor(
    private readonly capabilities: Record<string, readonly string[] | undefined>,
    private readonly rejectLookups: boolean = false,
  ) {
    super()
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (this.rejectLookups) {
      throw new LlmError('stub capability lookup is down', 'CAPABILITY_DOWN')
    }
    const efforts = this.capabilities[model]
    return {
      provider,
      id: model,
      name: model,
      ...efforts === undefined ? {} : {
        reasoning: {
          efforts: efforts.map(id => ({ id: ReasoningEffortId(id), name: id })),
        },
      },
    }
  }

  override async *stream(): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

interface Harness {
  ctx: Context
  fiber: { dispose(): Promise<void> | void }
  dispatch(seed: LlmCallConfig): Promise<LlmCallConfig>
}

/**
 * Mount the real LLM seam with a stub adapter and the plugin under test, then
 * dispatch the `agent/request` waterfall through a scope carrier the way the
 * agent loop does.
 */
async function mount(config: unknown, adapter?: StubAdapter): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['gw'], adapter ?? new StubAdapter(DEFAULT_CAPABILITIES))
  const fiber = await ctx.plugin(plugin, config as ConfigShape)
  const fakeAgent = { id: 'agent-test' } as unknown as Agent
  const carrier = agentCarrier(fakeAgent)
  const dispatch = (seed: LlmCallConfig): Promise<LlmCallConfig> => ctx.waterfall(
    carrier,
    'agent/request',
    { agent: fakeAgent, turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve(seed),
  )
  return { ctx, fiber, dispatch }
}

/** Seeds for the waterfall: provider/model with an optional effort. */
function seed(model: string, effort?: string): LlmCallConfig {
  return {
    provider: 'gw',
    model,
    ...effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) },
  }
}

describe('thinking-level-override plugin', () => {
  let harness: Harness | undefined

  beforeEach(() => {
    harness = undefined
  })

  it('forces the rule effort over a downstream selection', async () => {
    harness = await mount({ rules: [{ provider: 'gw', models: ['think-a'], effort: 'high' }] })
    const result = await harness.dispatch(seed('think-a', 'low'))
    expect(result.reasoningEffort).toBe('high')
    // The rewritten config passes the seam's capability validation.
    const prepared = await harness.ctx.llm.prepareCall(result)
    expect(prepared.config.reasoningEffort).toBe('high')
  })

  it('applies the rule default only when the request names no effort', async () => {
    harness = await mount({ rules: [{ provider: 'gw', default: 'medium' }] })
    expect((await harness.dispatch(seed('think-b'))).reasoningEffort).toBe('medium')
    expect((await harness.dispatch(seed('think-b', 'max'))).reasoningEffort).toBe('max')
  })

  it('rewrites requested levels through the rule map', async () => {
    harness = await mount({ rules: [{ provider: 'gw', map: { max: 'high' } }] })
    const result = await harness.dispatch(seed('think-a', 'max'))
    expect(result.reasoningEffort).toBe('high')
  })

  it('clamps an unsupported preset to the nearest offered level with no rules', async () => {
    harness = await mount({ onUnsupported: 'clamp' })
    // xhigh is not offered by think-a; high is the nearest offered level.
    const result = await harness.dispatch(seed('think-a', 'xhigh'))
    expect(result.reasoningEffort).toBe('high')
  })

  it('keeps the lower level on a clamp distance tie', async () => {
    harness = await mount({ onUnsupported: 'clamp' })
    const result = await harness.dispatch(seed('think-b', 'high'))
    // think-b offers off/medium/max; high is one rung from both medium and max.
    expect(result.reasoningEffort).toBe('medium')
  })

  it('gives a requested level outside the ladder the highest offered level', async () => {
    harness = await mount({ onUnsupported: 'clamp' })
    const result = await harness.dispatch(seed('think-a', 'ultra'))
    expect(result.reasoningEffort).toBe('high')
  })

  it('removes the effort for a model declaring no reasoning capability', async () => {
    harness = await mount({ onUnsupported: 'clamp' })
    const result = await harness.dispatch(seed('plain', 'high'))
    expect(result).not.toHaveProperty('reasoningEffort')
    const prepared = await harness.ctx.llm.prepareCall(result)
    expect(prepared.config).not.toHaveProperty('reasoningEffort')
  })

  it('drops an unsupported effort under the drop policy', async () => {
    harness = await mount({ onUnsupported: 'drop' })
    const result = await harness.dispatch(seed('think-a', 'max'))
    expect(result).not.toHaveProperty('reasoningEffort')
  })

  it('preserves the stock refusal under the fail policy', async () => {
    harness = await mount({ onUnsupported: 'fail' })
    const result = await harness.dispatch(seed('think-a', 'xhigh'))
    expect(result.reasoningEffort).toBe('xhigh')
    const error = await harness.ctx.llm.prepareCall(result).then(() => undefined, (thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('UNSUPPORTED_REASONING_EFFORT')
  })

  it('keeps the stock refusal for a non-reasoning model under fail', async () => {
    harness = await mount({ onUnsupported: 'fail' })
    const result = await harness.dispatch(seed('plain', 'high'))
    expect(result.reasoningEffort).toBe('high')
    await expect(harness.ctx.llm.prepareCall(result))
      .rejects.toThrow(/does not support reasoning effort/)
  })

  it('applies a forced effort without a capability lookup under fail', async () => {
    harness = await mount(
      { onUnsupported: 'fail', rules: [{ provider: 'gw', effort: 'high' }] },
      new StubAdapter(DEFAULT_CAPABILITIES, true),
    )
    const result = await harness.dispatch(seed('plain'))
    expect(result.reasoningEffort).toBe('high')
  })

  it('passes the request through when the capability lookup fails', async () => {
    harness = await mount({}, new StubAdapter(DEFAULT_CAPABILITIES, true))
    const input = seed('think-a', 'xhigh')
    const result = await harness.dispatch(input)
    expect(result).toBe(input)
  })

  it('leaves a serviceable request untouched', async () => {
    harness = await mount({})
    const input = seed('think-a', 'high')
    const result = await harness.dispatch(input)
    expect(result).toBe(input)
  })

  it('keeps the last word over later-registered selection listeners', async () => {
    harness = await mount({ rules: [{ provider: 'gw', effort: 'high' }] })
    // Simulate a model-selection listener mounted after the plugin (inner in
    // the waterfall): it swaps the effort, the override still wins.
    const disposeSelection = harness.ctx.on('agent/request', async (_payload, next) => {
      const config = await next()
      return { ...config, reasoningEffort: ReasoningEffortId('low') }
    })
    const result = await harness.dispatch(seed('think-a'))
    expect(result.reasoningEffort).toBe('high')
    disposeSelection()
  })

  it('governs only models matching the rule globs', async () => {
    harness = await mount({
      onUnsupported: 'fail',
      rules: [{ provider: 'gw', models: ['think-*'], effort: 'high' }],
    })
    expect((await harness.dispatch(seed('think-a'))).reasoningEffort).toBe('high')
    const plainResult = await harness.dispatch(seed('plain'))
    expect(plainResult).not.toHaveProperty('reasoningEffort')
  })

  it('applies the first matching rule only', async () => {
    harness = await mount({
      rules: [
        { provider: 'gw', models: ['think-a'], effort: 'high' },
        { provider: 'gw', effort: 'max' },
      ],
    })
    expect((await harness.dispatch(seed('think-a'))).reasoningEffort).toBe('high')
    expect((await harness.dispatch(seed('think-b'))).reasoningEffort).toBe('max')
  })

  it('stops overriding once the plugin fiber is disposed', async () => {
    harness = await mount({ rules: [{ provider: 'gw', effort: 'high' }] })
    const input = seed('think-a')
    expect((await harness.dispatch(input)).reasoningEffort).toBe('high')
    await harness.fiber.dispose()
    expect(await harness.dispatch(input)).toBe(input)
  })

  it('refuses a rule declaring no action at load', async () => {
    await expect(mount({ rules: [{ provider: 'gw' }] })).rejects.toThrow(/declares no action/)
  })

  it('refuses a schema-invalid configuration at load', async () => {
    await expect(mount({ onUnsupported: 'yolo' })).rejects.toThrow()
  })
})
