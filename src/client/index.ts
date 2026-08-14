/**
 * thinking-level-override settings page, browser half. Registers one section
 * in the Settings nav (right below Models), bound to the
 * `thinking-level-override` policy namespace and the `llm-pi-ai` model
 * entries the Host plugins register.
 *
 * @module dsh-thinking-level-override/client
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge and the settings.section SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ReasoningEfforts } from './section-controller.ts'
import { LLM_PI_AI_NS, THINKING_OVERRIDE_NS, ThinkingOverrideSectionController } from './section-controller.ts'
import { ThinkingOverrideSection } from './section.tsx'
import { en, zh } from './locales.ts'
import type { Dictionary } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The thinking-level-override settings page copy. */
    'thinking-level-override': Dictionary
  }
}

/** Locale dictionary namespace owned by this section. */
const NS = 'thinking-level-override'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Mount the thinking-level-override settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'thinking-level-override: section dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new ThinkingOverrideSectionController(
    ctx.settingsScope.bind({ namespace: THINKING_OVERRIDE_NS }),
    ctx.settingsScope.bind({ namespace: LLM_PI_AI_NS }),
    connection.api,
  )

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    // Directly below the Models entry (order 10) and above Plugins (15).
    id: 'thinking-level-override',
    order: 12,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({
      hooks: {
        thinkingOverridePolicy: controller.policySource,
        piAiSection: controller.piAiSource,
      },
      api: connection.api,
      saveSection: (enableMappings: boolean, changes: Map<string, ReasoningEfforts | undefined>) =>
        controller.save(enableMappings, changes),
    }),
  }, ThinkingOverrideSection))
}
