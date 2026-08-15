/**
 * Configuration schema and load-time validation for the thinking-level
 * override plugin.
 *
 * @module dsh-thinking-level-override/config
 */
import z from '@deepseek-ai/schemastery';
/**
 * Schemastery's object schema types its validated data with mutable arrays
 * and nullable fields, which the readonly rule shape does not re-accept
 * under `exactOptionalPropertyTypes`; the assertion narrows it the way the
 * harness adapters do for their own dict schemas.
 */
const ruleSchema = z.object({
    provider: z.string().required(),
    models: z.array(z.string()),
    effort: z.string(),
    default: z.string(),
    map: z.dict(z.string()),
    onUnsupported: z.union(['clamp', 'drop', 'fail']),
});
/** Runtime schema for {@link Config}. */
export const Config = z.object({
    enableMappings: z.boolean().default(false),
    onUnsupported: z.union(['clamp', 'drop', 'fail']).default('fail'),
    rules: z.array(ruleSchema).default([]),
});
/**
 * Reject a configuration the schema accepts but the plugin cannot serve. Runs at
 * plugin load, so a self-contained misconfiguration fails where it is written.
 * @param config - the schema-validated configuration.
 * @throws Error naming the offending rule.
 */
export function assertValidConfig(config) {
    for (const [index, rule] of config.rules.entries()) {
        const where = `thinking-level-override: rules[${index}]`;
        if (rule.provider.length === 0) {
            throw new Error(`${where} has an empty provider; name the exact provider route to govern`);
        }
        for (const glob of rule.models ?? []) {
            if (glob.length === 0) {
                throw new Error(`${where} (provider "${rule.provider}") lists an empty model glob; remove it or write a pattern`);
            }
        }
        if (rule.effort === '') {
            throw new Error(`${where} (provider "${rule.provider}") sets an empty effort`);
        }
        if (rule.default === '') {
            throw new Error(`${where} (provider "${rule.provider}") sets an empty default`);
        }
        for (const [level, replacement] of Object.entries(rule.map ?? {})) {
            if (level.length === 0 || replacement.length === 0) {
                throw new Error(`${where} (provider "${rule.provider}") has a map entry with an empty level or replacement`);
            }
        }
        const hasMap = rule.map !== undefined && Object.keys(rule.map).length > 0;
        if (rule.effort === undefined && rule.default === undefined && !hasMap && rule.onUnsupported === undefined) {
            throw new Error(`${where} (provider "${rule.provider}") declares no action; set effort, default, map, or onUnsupported`);
        }
    }
}
//# sourceMappingURL=config.js.map