import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import { afterEach, describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import type { Config as ConfigShape } from '../src/config.ts'

/** Adapter whose models all offer off/low/high. */
class StubAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: (['off', 'low', 'high'] as const).map(id => ({ id: ReasoningEffortId(id), name: id })),
      },
    }
  }

  override async *stream(): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const cleanups: Array<() => Promise<void> | void> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

/** Boot the seam, a file-backed settings provider, and the plugin under test. */
async function boot(entryConfig: unknown): Promise<{
  ctx: Context
  dispatch(seed: LlmCallConfig): Promise<LlmCallConfig>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tlo-settings-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['gw'], new StubAdapter())
  await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), watch: false })
  await ctx.plugin(plugin, entryConfig as ConfigShape)
  const fakeAgent = { id: 'agent-test' } as unknown as Agent
  const carrier = agentCarrier(fakeAgent)
  const dispatch = (seed: LlmCallConfig): Promise<LlmCallConfig> => ctx.waterfall(
    carrier,
    'agent/request',
    { agent: fakeAgent, turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve(seed),
  )
  return { ctx, dispatch }
}

function seed(effort?: string): LlmCallConfig {
  return {
    provider: 'gw',
    model: 'think-a',
    ...effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) },
  }
}

describe('settings integration', () => {
  it('serves rules from the user settings layer on the next request', async () => {
    const { ctx, dispatch } = await boot({})
    // Entry config alone: no rules, and the global policy defaults to fail —
    // the stock harness behavior, so the request passes through untouched.
    expect((await dispatch(seed('xhigh'))).reasoningEffort).toBe('xhigh')
    expect(await dispatch(seed())).not.toHaveProperty('reasoningEffort')
    // A user-layer rule arrives through the settings seam, no restart.
    await ctx.settings.update(plugin.settingsNs, { rules: [{ provider: 'gw', effort: 'low' }] })
    expect((await dispatch(seed())).reasoningEffort).toBe('low')
    expect((await dispatch(seed('xhigh'))).reasoningEffort).toBe('low')
  })

  it('merges the user layer over the composition entry', async () => {
    const { ctx, dispatch } = await boot({ rules: [{ provider: 'gw', effort: 'high' }] })
    expect((await dispatch(seed())).reasoningEffort).toBe('high')
    await ctx.settings.update(plugin.settingsNs, { rules: [{ provider: 'gw', effort: 'low' }] })
    expect((await dispatch(seed())).reasoningEffort).toBe('low')
  })

  it('returns to the composition entry when the user layer resets', async () => {
    const { ctx, dispatch } = await boot({ rules: [{ provider: 'gw', effort: 'high' }] })
    await ctx.settings.update(plugin.settingsNs, { rules: [{ provider: 'gw', effort: 'low' }] })
    expect((await dispatch(seed())).reasoningEffort).toBe('low')
    await ctx.settings.replace(plugin.settingsNs, {})
    expect((await dispatch(seed())).reasoningEffort).toBe('high')
  })

  it('refuses an unserviceable section where it is written', async () => {
    const { ctx, dispatch } = await boot({})
    await expect(ctx.settings.update(plugin.settingsNs, { rules: [{ provider: 'gw' }] }))
      .rejects.toThrow(/declares no action/)
    // The refused write keeps the previous section serving.
    expect(await dispatch(seed())).not.toHaveProperty('reasoningEffort')
  })

  it('keeps working without a mounted settings service', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['gw'], new StubAdapter())
    await ctx.plugin(plugin, { rules: [{ provider: 'gw', effort: 'low' }] } as ConfigShape)
    const fakeAgent = { id: 'agent-test' } as unknown as Agent
    const result = await ctx.waterfall(
      agentCarrier(fakeAgent),
      'agent/request',
      { agent: fakeAgent, turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve(seed()),
    )
    expect(result.reasoningEffort).toBe('low')
  })
})
