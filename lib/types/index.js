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
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { assertValidConfig, Config } from "./config.js";
import { matchRule, proposeEffort, settleProposal } from "./override.js";
export { Config } from "./config.js";
export { clampEffort, decideOverride, EFFORT_LADDER, globToRegExp, matchRule, proposeEffort, ruleMatches, settleProposal, sortOffered } from "./override.js";
export const name = 'thinking-level-override';
export const inject = ['llm'];
/** Settings namespace this plugin registers for live configuration surfaces. */
export const settingsNs = settingsNamespace('thinking-level-override');
/** Return the config carrying one effort in place of its previous value. */
function withEffort(config, effort) {
    return { ...config, reasoningEffort: effort };
}
/** Return the config with its effort omitted, restoring provider-default behavior. */
function withoutEffort(config) {
    const { reasoningEffort: _dropped, ...rest } = config;
    return rest;
}
/**
 * Install the request-time thinking-level override.
 * @param ctx - plugin context; `ctx.llm` is injected and ready.
 * @param config - schema-validated composition configuration.
 */
export function apply(ctx, config) {
    assertValidConfig(config);
    // The settings seam supplies the merged section once mounted; until then —
    // or in a composition without one — the entry config alone drives the
    // plugin. Every request reads the current section once, before its first
    // await.
    let current = () => config;
    const handleRequest = async (payload, next) => {
        const active = current();
        const resolved = await next();
        const rule = matchRule(active.rules, resolved.provider, resolved.model);
        const policy = rule?.onUnsupported ?? active.onUnsupported;
        const proposal = proposeEffort({
            provider: resolved.provider,
            model: resolved.model,
            ...resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort },
        }, rule);
        if (proposal === undefined)
            return resolved;
        let capability = 'unknown';
        if (policy !== 'fail') {
            // clamp and drop decide against the live exact-model capability; a
            // lookup failure passes the request through rather than guessing, and
            // the LLM seam's prepareCall stays the authority.
            try {
                capability = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model, payload.signal);
            }
            catch (error) {
                ctx.logger.debug(`thinking-level-override: capability lookup failed for "${resolved.provider}" model "${resolved.model}"; passing the request through (${String(error)})`);
                return resolved;
            }
        }
        const outcome = settleProposal(proposal, policy, capability);
        if (outcome === undefined)
            return resolved;
        const before = resolved.reasoningEffort;
        if (outcome.effort === null) {
            ctx.logger.debug(`thinking-level-override: "${resolved.provider}" model "${resolved.model}" effort ${before === undefined ? 'unset' : `"${before}"`} removed — ${outcome.reason}`);
            return withoutEffort(resolved);
        }
        if (before !== outcome.effort) {
            ctx.logger.debug(`thinking-level-override: "${resolved.provider}" model "${resolved.model}" effort ${before === undefined ? 'unset' : `"${before}"`} overridden to "${outcome.effort}" — ${outcome.reason}`);
        }
        return withEffort(resolved, outcome.effort);
    };
    // Prepend keeps the override outermost in the waterfall — the last
    // transform on the composed config — even when a hot reload re-registers
    // the listener after later-mounted model-selection listeners.
    ctx.on('agent/request', handleRequest, true);
    installSettingsSection(ctx, settingsNs, Config, config, {
        // Refuse an unserviceable section where it is written: a settings surface
        // learns at the write instead of storing rules the plugin must ignore.
        validate: assertValidConfig,
        setSource: (source) => {
            current = source;
        },
        // Rules are matched per request against the current section, so a changed
        // section has nothing derived to rebuild.
        onChange: () => { },
    });
}
//# sourceMappingURL=index.js.map