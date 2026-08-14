import { describe, expect, it } from 'vitest'
import { assertValidConfig, Config } from '../src/config.ts'
import type { Config as ConfigShape } from '../src/config.ts'

/** Run the exported schema the way the Cordis loader does. */
function parse(input: unknown): { ok: true; value: ConfigShape } | { ok: false; message: string } {
  const result = Config['~standard'].validate(input)
  if ('value' in result) return { ok: true, value: result.value as ConfigShape }
  return { ok: false, message: result.issues.map(issue => issue.message).join('; ') }
}

describe('Config schema', () => {
  it('fills defaults for an empty configuration', () => {
    expect(parse({})).toEqual({ ok: true, value: { enableMappings: false, onUnsupported: 'fail', rules: [] } })
  })

  it('accepts a complete rule', () => {
    const parsed = parse({
      onUnsupported: 'drop',
      rules: [{
        provider: 'gw',
        models: ['think-*'],
        effort: 'high',
        default: 'medium',
        map: { max: 'high' },
        onUnsupported: 'fail',
      }],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.onUnsupported).toBe('drop')
    expect(parsed.value.rules).toHaveLength(1)
  })

  it('rejects an unknown policy value', () => {
    const parsed = parse({ onUnsupported: 'yolo' })
    expect(parsed.ok).toBe(false)
  })

  it('rejects a rule without a provider', () => {
    const parsed = parse({ rules: [{ effort: 'high' }] })
    expect(parsed.ok).toBe(false)
  })
})

describe('assertValidConfig()', () => {
  it('accepts an empty configuration', () => {
    expect(() => assertValidConfig({ onUnsupported: 'clamp', rules: [] })).not.toThrow()
  })

  it('rejects a rule declaring no action', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw' }],
    })).toThrow(/declares no action/)
  })

  it('treats onUnsupported alone as an action', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', onUnsupported: 'drop' }],
    })).not.toThrow()
  })

  it('rejects an empty provider', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: '', effort: 'high' }],
    })).toThrow(/empty provider/)
  })

  it('rejects empty model globs', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', models: ['think-*', ''], effort: 'high' }],
    })).toThrow(/empty model glob/)
  })

  it('rejects empty effort and default values', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', effort: '' }],
    })).toThrow(/empty effort/)
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', default: '' }],
    })).toThrow(/empty default/)
  })

  it('rejects map entries with an empty side', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', map: { max: '' } }],
    })).toThrow(/empty level or replacement/)
  })

  it('names the offending rule index', () => {
    expect(() => assertValidConfig({
      onUnsupported: 'clamp',
      rules: [{ provider: 'gw', effort: 'high' }, { provider: 'gw' }],
    })).toThrow(/rules\[1\]/)
  })
})
