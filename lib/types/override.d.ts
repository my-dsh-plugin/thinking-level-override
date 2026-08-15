/**
 * Pure decision engine for thinking-level overrides. No Cordis or harness
 * imports: rule matching, effort proposal, and the clamp/drop/fail policy are
 * functions of their inputs alone, so the plugin module stays a thin listener
 * and every decision is unit-testable.
 *
 * @module dsh-thinking-level-override/override
 */
/**
 * The canonical thinking levels in escalation order. pi-ai's level set is the
 * superset the DeepSeek Harness exposes as opaque reasoning-effort ids
 * (`off`, `high`, `max` on the DeepSeek adapter; all seven on pi-ai routes),
 * so clamp distance is measured on this ladder. Effort ids an adapter exposes
 * outside the ladder stay comparable by position: they sort after every known
 * level, in the order the adapter reported them.
 */
export declare const EFFORT_LADDER: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** One thinking level the ladder orders. */
export type LadderEffort = typeof EFFORT_LADDER[number];
/** What to do with an effort the exact model cannot serve. */
export type UnsupportedPolicy = 'clamp' | 'drop' | 'fail';
/** One override rule as configuration supplies it. */
export interface OverrideRule {
    /** Exact provider route this rule governs. */
    provider: string;
    /** Model-id globs (`*` wildcard); absent or empty governs every model on the route. */
    models?: readonly string[];
    /** Force this level on every matched request, replacing any selection. */
    effort?: string;
    /** Level applied when a matched request names none. */
    default?: string;
    /** Rewrite requested levels before capability validation (requested id → replacement). */
    map?: Readonly<Record<string, string>>;
    /** Per-rule policy override; absent inherits the top-level `onUnsupported`. */
    onUnsupported?: UnsupportedPolicy;
}
/** The request facts the engine decides on. */
export interface RequestView {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** The exact-model capability facts the engine decides on. */
export interface CapabilityView {
    reasoning?: {
        efforts: readonly {
            id: string;
        }[];
    };
}
/** Which knob produced a proposal. */
export type ProposalAction = 'force' | 'map' | 'request' | 'default';
/** One proposed effort and the knob that produced it. */
export interface Proposal {
    proposed: string;
    action: ProposalAction;
}
/**
 * The engine's decision for one request. `effort` is the level to set; `null`
 * removes the effort from the request config; the reason is a diagnostic for
 * logging.
 */
export interface OverrideOutcome {
    effort: string | null;
    reason: string;
}
/**
 * Position of one known level in the escalation ladder.
 * @param effort - candidate level id.
 * @returns the ladder index, or `undefined` for an id outside the ladder.
 */
export declare function ladderIndexOf(effort: string): number | undefined;
/**
 * Compile one `*`-wildcard glob into an anchored matcher. Every other
 * character is literal; `?` is not a wildcard.
 * @param glob - model-id pattern.
 * @returns a regex matching exactly the ids the glob describes.
 */
export declare function globToRegExp(glob: string): RegExp;
/**
 * Whether one rule governs one provider/model pair. Model globs match with
 * `*` as the only wildcard; an absent or empty `models` list governs every
 * model on the route.
 * @param rule - the rule under test.
 * @param provider - exact provider route of the request.
 * @param model - model id of the request.
 * @returns whether the rule applies.
 */
export declare function ruleMatches(rule: OverrideRule, provider: string, model: string): boolean;
/**
 * The first rule governing one provider/model pair, in configuration order.
 * Later matching rules are ignored, so a specific rule placed before a broad
 * one wins; overlapping rules do not merge.
 * @param rules - configured rules in order.
 * @param provider - exact provider route of the request.
 * @param model - model id of the request.
 * @returns the governing rule, or `undefined` when none matches.
 */
export declare function matchRule(rules: readonly OverrideRule[], provider: string, model: string): OverrideRule | undefined;
/**
 * Order offered levels for clamp selection: ladder levels ascending, then ids
 * outside the ladder in the adapter's reported order. Stable sort keeps that
 * reported order intact.
 * @param offered - level ids the exact model offers.
 * @returns the same ids in selection order.
 */
export declare function sortOffered(offered: readonly string[]): string[];
/**
 * The nearest offered level for an unserviceable request. Distance is the
 * ladder index difference; a tie keeps the lower level (the cheaper one). A
 * requested id outside the ladder takes the highest offered level; a model
 * offering only ids outside the ladder takes the last one reported.
 * @param requested - the level the request proposed.
 * @param offered - non-empty level ids the exact model offers.
 * @returns the level to send, or `undefined` when nothing is offered.
 */
export declare function clampEffort(requested: string, offered: readonly string[]): string | undefined;
/**
 * The effort one matched request should carry, before capability validation.
 * Precedence: the rule's forced `effort`, then the request's own level
 * (rewritten by the rule's `map` when one applies), then the rule's
 * `default`. A request with no level and a rule declaring none of the three
 * proposes nothing.
 * @param request - provider, model, and current effort of the request.
 * @param rule - the governing rule, when one matched.
 * @returns the proposal, or `undefined` when the engine has nothing to say.
 */
export declare function proposeEffort(request: RequestView, rule: OverrideRule | undefined): Proposal | undefined;
/**
 * Settle one proposal against the unsupported-effort policy and the exact
 * model capability.
 *
 * `fail` keeps stock harness behavior: a request-carried effort passes
 * through untouched and a forced, mapped, or defaulted effort applies without
 * validation, leaving the refusal to the LLM seam. `clamp` and `drop` need
 * the live capability; `'unknown'` (a lookup failure) passes the request
 * through rather than guessing. Against a known capability, a serviceable
 * proposal applies, a model declaring no reasoning sheds the effort, and an
 * unserviceable level clamps to the nearest offered one or drops.
 * @param proposal - the effort under consideration and the knob that produced it.
 * @param policy - the effective unsupported-effort policy.
 * @param capability - exact model capability, or `'unknown'` when unreadable.
 * @returns the decision, or `undefined` to leave the request unchanged.
 */
export declare function settleProposal(proposal: Proposal, policy: UnsupportedPolicy, capability: CapabilityView | 'unknown'): OverrideOutcome | undefined;
/**
 * The complete engine decision for one request, combining proposal and
 * settlement. Convenience for tests and callers that already hold the
 * capability.
 * @param request - provider, model, and current effort of the request.
 * @param rule - the governing rule, when one matched.
 * @param policy - the effective unsupported-effort policy.
 * @param capability - exact model capability, or `'unknown'` when unreadable.
 * @returns the decision, or `undefined` to leave the request unchanged.
 */
export declare function decideOverride(request: RequestView, rule: OverrideRule | undefined, policy: UnsupportedPolicy, capability: CapabilityView | 'unknown'): OverrideOutcome | undefined;
//# sourceMappingURL=override.d.ts.map