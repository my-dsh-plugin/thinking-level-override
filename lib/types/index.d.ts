/**
 * thinking-level-override: a DeepSeek Harness plugin that autonomously
 * overrides and adjusts third-party model thinking levels, fixing missing or
 * mismatched built-in presets.
 *
 * The plugin listens to the `agent/request` waterfall — the documented
 * interception point for the frozen call configuration — and rewrites the
 * resolved `reasoningEffort` before the LLM seam validates it. It registers
 * with `prepend` so the override has the last word over later listeners such
 * as model selection. Rules force, default, or remap levels per provider and
 * model glob; the `onUnsupported` policy decides what happens to an effort
 * the exact model cannot serve: `fail` with stock harness behavior (the
 * default — models ship their own compat layer), `clamp` to the nearest
 * offered level, or `drop` it from the request.
 *
 * Configuration is dynamic: the plugin registers the `thinking-level-override`
 * settings namespace with its `Config` schema and the cordis.yml entry as the
 * composition base, so a user-settings layer edits the rules live from a
 * settings surface — effective on the next request, no restart. Without a
 * mounted settings service the entry config alone drives the plugin.
 *
 * ```yaml
 * - id: thinking-level-override
 *   name: dsh-thinking-level-override
 *   config:
 *     onUnsupported: fail
 *     rules:
 *       - provider: openrouter
 *         models: ['kimi-k2*']
 *         effort: high
 *         map:
 *           max: high
 *       - provider: acme-gateway
 *         default: medium
 *         onUnsupported: drop
 * ```
 *
 * @module dsh-thinking-level-override
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export { Config } from './config.ts';
export type { ThinkingOverrideRule } from './config.ts';
export { clampEffort, decideOverride, EFFORT_LADDER, globToRegExp, matchRule, proposeEffort, ruleMatches, settleProposal, sortOffered } from './override.ts';
export type { CapabilityView, LadderEffort, OverrideOutcome, OverrideRule, Proposal, ProposalAction, RequestView, UnsupportedPolicy, } from './override.ts';
export declare const name = "thinking-level-override";
export declare const inject: string[];
/** Settings namespace this plugin registers for live configuration surfaces. */
export declare const settingsNs: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/**
 * Install the request-time thinking-level override.
 * @param ctx - plugin context; `ctx.llm` is injected and ready.
 * @param config - schema-validated composition configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map