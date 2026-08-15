/**
 * Configuration schema and load-time validation for the thinking-level
 * override plugin.
 *
 * @module dsh-thinking-level-override/config
 */
import z from '@deepseek-ai/schemastery';
import type { OverrideRule, UnsupportedPolicy } from './override.ts';
/** One configured override rule; re-exported under the config-facing name. */
export type ThinkingOverrideRule = OverrideRule;
/** Plugin configuration. */
export interface Config {
    /**
     * Master switch for the per-model wire-spelling mapping editor shown on the
     * settings page. Off by default: the editor stays hidden while saved levels
     * and spellings keep working.
     */
    enableMappings: boolean;
    /**
     * What to do with an effort the exact model cannot serve, when the matching
     * rule does not say. Defaults to `fail` — the stock harness behavior (the
     * LLM seam refuses the request) — because models ship their own compat
     * layer and the settings page no longer offers the other choices. `clamp`
     * replaces it with the nearest offered level, `drop` removes it from the
     * request.
     */
    onUnsupported: UnsupportedPolicy;
    /** Override rules in precedence order; the first rule matching a request governs it. */
    rules: ThinkingOverrideRule[];
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/**
 * Reject a configuration the schema accepts but the plugin cannot serve. Runs at
 * plugin load, so a self-contained misconfiguration fails where it is written.
 * @param config - the schema-validated configuration.
 * @throws Error naming the offending rule.
 */
export declare function assertValidConfig(config: Config): void;
//# sourceMappingURL=config.d.ts.map