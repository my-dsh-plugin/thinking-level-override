import { describe, expect, it } from 'vitest'
import {
  clampEffort,
  decideOverride,
  EFFORT_LADDER,
  globToRegExp,
  ladderIndexOf,
  matchRule,
  proposeEffort,
  ruleMatches,
  settleProposal,
  sortOffered,
} from '../src/override.ts'
import type { OverrideRule } from '../src/override.ts'

describe('EFFORT_LADDER', () => {
  it('lists the canonical levels in escalation order', () => {
    expect([...EFFORT_LADDER]).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('indexes known levels and refuses unknown ones', () => {
    expect(ladderIndexOf('off')).toBe(0)
    expect(ladderIndexOf('max')).toBe(6)
    expect(ladderIndexOf('ultra')).toBeUndefined()
  })
})

describe('globToRegExp()', () => {
  it('anchors the pattern and treats * as the only wildcard', () => {
    const re = globToRegExp('kimi-k2*')
    expect(re.test('kimi-k2-thinking')).toBe(true)
    expect(re.test('kimi')).toBe(false)
    expect(re.test('xkimi-k2')).toBe(false)
  })

  it('keeps regex metacharacters literal', () => {
    expect(globToRegExp('a.b+c').test('a.b+c')).toBe(true)
    expect(globToRegExp('a.b+c').test('aab+c')).toBe(false)
  })
})

describe('matchRule()', () => {
  const specific: OverrideRule = { provider: 'gw', models: ['think-*'], effort: 'high' }
  const broad: OverrideRule = { provider: 'gw', default: 'low' }
  const other: OverrideRule = { provider: 'other', effort: 'max' }

  it('matches by exact provider and model glob', () => {
    expect(ruleMatches(specific, 'gw', 'think-a')).toBe(true)
    expect(ruleMatches(specific, 'gw', 'plain')).toBe(false)
    expect(ruleMatches(specific, 'other', 'think-a')).toBe(false)
  })

  it('treats an absent or empty models list as every model on the route', () => {
    expect(ruleMatches(broad, 'gw', 'anything')).toBe(true)
    expect(ruleMatches({ provider: 'gw', models: [], effort: 'low' }, 'gw', 'anything')).toBe(true)
  })

  it('returns the first governing rule in configuration order', () => {
    expect(matchRule([specific, broad, other], 'gw', 'think-a')).toBe(specific)
    expect(matchRule([specific, broad, other], 'gw', 'plain')).toBe(broad)
    expect(matchRule([specific, broad, other], 'other', 'think-a')).toBe(other)
    expect(matchRule([specific], 'gw', 'plain')).toBeUndefined()
  })
})

describe('sortOffered()', () => {
  it('orders ladder levels ascending and keeps unknown ids last in reported order', () => {
    expect(sortOffered(['max', 'ultra', 'off', 'custom', 'high'])).toEqual(['off', 'high', 'max', 'ultra', 'custom'])
  })
})

describe('clampEffort()', () => {
  it('returns the nearest offered level by ladder distance', () => {
    expect(clampEffort('xhigh', ['off', 'low', 'high'])).toBe('high')
    expect(clampEffort('minimal', ['medium', 'max'])).toBe('medium')
  })

  it('keeps the lower level on a distance tie', () => {
    expect(clampEffort('medium', ['low', 'high'])).toBe('low')
  })

  it('gives a requested id outside the ladder the highest offered level', () => {
    expect(clampEffort('ultra', ['off', 'high'])).toBe('high')
    expect(clampEffort('ultra', ['custom-b', 'custom-a'])).toBe('custom-a')
  })

  it('answers nothing for an empty offer', () => {
    expect(clampEffort('high', [])).toBeUndefined()
  })
})

describe('proposeEffort()', () => {
  it('forces the rule effort over everything', () => {
    const rule: OverrideRule = { provider: 'gw', effort: 'high', default: 'low' }
    expect(proposeEffort({ provider: 'gw', model: 'm', reasoningEffort: 'max' }, rule))
      .toEqual({ proposed: 'high', action: 'force' })
  })

  it('rewrites the requested effort through the rule map', () => {
    const rule: OverrideRule = { provider: 'gw', map: { max: 'high' } }
    expect(proposeEffort({ provider: 'gw', model: 'm', reasoningEffort: 'max' }, rule))
      .toEqual({ proposed: 'high', action: 'map' })
  })

  it('keeps an unmapped requested effort', () => {
    const rule: OverrideRule = { provider: 'gw', map: { max: 'high' } }
    expect(proposeEffort({ provider: 'gw', model: 'm', reasoningEffort: 'low' }, rule))
      .toEqual({ proposed: 'low', action: 'request' })
  })

  it('fills a missing effort from the rule default', () => {
    const rule: OverrideRule = { provider: 'gw', default: 'medium' }
    expect(proposeEffort({ provider: 'gw', model: 'm' }, rule))
      .toEqual({ proposed: 'medium', action: 'default' })
  })

  it('proposes nothing without a rule knob or a request effort', () => {
    expect(proposeEffort({ provider: 'gw', model: 'm' }, undefined)).toBeUndefined()
    expect(proposeEffort({ provider: 'gw', model: 'm' }, { provider: 'gw' })).toBeUndefined()
  })
})

describe('settleProposal()', () => {
  const capability = { reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }] } }

  it('passes a request-carried effort through under fail', () => {
    expect(settleProposal({ proposed: 'max', action: 'request' }, 'fail', capability)).toBeUndefined()
  })

  it('applies forced and defaulted efforts without validation under fail', () => {
    expect(settleProposal({ proposed: 'max', action: 'force' }, 'fail', 'unknown'))
      .toEqual({ effort: 'max', reason: expect.stringContaining('force') })
    expect(settleProposal({ proposed: 'low', action: 'default' }, 'fail', 'unknown')?.effort).toBe('low')
  })

  it('passes everything through when the capability is unknown', () => {
    expect(settleProposal({ proposed: 'max', action: 'force' }, 'clamp', 'unknown')).toBeUndefined()
  })

  it('removes the effort for a model declaring no reasoning', () => {
    expect(settleProposal({ proposed: 'high', action: 'force' }, 'clamp', {}))
      .toEqual({ effort: null, reason: expect.stringContaining('no reasoning capability') })
    expect(settleProposal({ proposed: 'high', action: 'request' }, 'drop', { reasoning: { efforts: [] } })?.effort)
      .toBeNull()
  })

  it('keeps a serviceable proposal, unchanged for a request-carried one', () => {
    expect(settleProposal({ proposed: 'high', action: 'force' }, 'clamp', capability)?.effort).toBe('high')
    expect(settleProposal({ proposed: 'high', action: 'request' }, 'clamp', capability)).toBeUndefined()
  })

  it('drops an unserviceable level under drop', () => {
    expect(settleProposal({ proposed: 'max', action: 'request' }, 'drop', capability)?.effort).toBeNull()
  })

  it('clamps an unserviceable level to the nearest offered one', () => {
    expect(settleProposal({ proposed: 'max', action: 'request' }, 'clamp', capability)?.effort).toBe('high')
  })
})

describe('decideOverride()', () => {
  it('answers nothing when no knob applies', () => {
    expect(decideOverride({ provider: 'gw', model: 'm' }, undefined, 'clamp', 'unknown')).toBeUndefined()
  })

  it('composes proposal and settlement', () => {
    const rule: OverrideRule = { provider: 'gw', default: 'xhigh' }
    const capability = { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }
    expect(decideOverride({ provider: 'gw', model: 'm' }, rule, 'clamp', capability)?.effort).toBe('high')
  })
})
