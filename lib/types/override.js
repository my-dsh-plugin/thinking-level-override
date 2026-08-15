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
export const EFFORT_LADDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/**
 * Position of one known level in the escalation ladder.
 * @param effort - candidate level id.
 * @returns the ladder index, or `undefined` for an id outside the ladder.
 */
export function ladderIndexOf(effort) {
    const index = EFFORT_LADDER.indexOf(effort);
    return index === -1 ? undefined : index;
}
/**
 * Compile one `*`-wildcard glob into an anchored matcher. Every other
 * character is literal; `?` is not a wildcard.
 * @param glob - model-id pattern.
 * @returns a regex matching exactly the ids the glob describes.
 */
export function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}
/**
 * Whether one rule governs one provider/model pair. Model globs match with
 * `*` as the only wildcard; an absent or empty `models` list governs every
 * model on the route.
 * @param rule - the rule under test.
 * @param provider - exact provider route of the request.
 * @param model - model id of the request.
 * @returns whether the rule applies.
 */
export function ruleMatches(rule, provider, model) {
    if (rule.provider !== provider)
        return false;
    if (rule.models === undefined || rule.models.length === 0)
        return true;
    return rule.models.some(glob => globToRegExp(glob).test(model));
}
/**
 * The first rule governing one provider/model pair, in configuration order.
 * Later matching rules are ignored, so a specific rule placed before a broad
 * one wins; overlapping rules do not merge.
 * @param rules - configured rules in order.
 * @param provider - exact provider route of the request.
 * @param model - model id of the request.
 * @returns the governing rule, or `undefined` when none matches.
 */
export function matchRule(rules, provider, model) {
    return rules.find(rule => ruleMatches(rule, provider, model));
}
/**
 * Order offered levels for clamp selection: ladder levels ascending, then ids
 * outside the ladder in the adapter's reported order. Stable sort keeps that
 * reported order intact.
 * @param offered - level ids the exact model offers.
 * @returns the same ids in selection order.
 */
export function sortOffered(offered) {
    return [...offered].sort((left, right) => {
        const leftIndex = ladderIndexOf(left);
        const rightIndex = ladderIndexOf(right);
        if (leftIndex !== undefined && rightIndex !== undefined)
            return leftIndex - rightIndex;
        if (leftIndex !== undefined)
            return -1;
        if (rightIndex !== undefined)
            return 1;
        return 0;
    });
}
/**
 * The nearest offered level for an unserviceable request. Distance is the
 * ladder index difference; a tie keeps the lower level (the cheaper one). A
 * requested id outside the ladder takes the highest offered level; a model
 * offering only ids outside the ladder takes the last one reported.
 * @param requested - the level the request proposed.
 * @param offered - non-empty level ids the exact model offers.
 * @returns the level to send, or `undefined` when nothing is offered.
 */
export function clampEffort(requested, offered) {
    if (offered.length === 0)
        return undefined;
    const sorted = sortOffered(offered);
    const requestedIndex = ladderIndexOf(requested);
    if (requestedIndex === undefined)
        return sorted[sorted.length - 1];
    let best;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of sorted) {
        const candidateIndex = ladderIndexOf(candidate);
        if (candidateIndex === undefined)
            continue;
        const distance = Math.abs(candidateIndex - requestedIndex);
        // Strict comparison: iteration ascends the ladder, so the first (lower)
        // candidate at a given distance wins the tie.
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best ?? sorted[sorted.length - 1];
}
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
export function proposeEffort(request, rule) {
    if (rule?.effort !== undefined)
        return { proposed: rule.effort, action: 'force' };
    if (request.reasoningEffort !== undefined) {
        const mapped = rule?.map?.[request.reasoningEffort];
        if (mapped !== undefined)
            return { proposed: mapped, action: 'map' };
        return { proposed: request.reasoningEffort, action: 'request' };
    }
    if (rule?.default !== undefined)
        return { proposed: rule.default, action: 'default' };
    return undefined;
}
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
export function settleProposal(proposal, policy, capability) {
    const { proposed, action } = proposal;
    if (policy === 'fail') {
        if (action === 'request')
            return undefined;
        return { effort: proposed, reason: `${action} applied without validation (onUnsupported: fail)` };
    }
    if (capability === 'unknown')
        return undefined;
    const offered = capability.reasoning?.efforts.map(effort => effort.id) ?? [];
    if (offered.length === 0) {
        return {
            effort: null,
            reason: `model declares no reasoning capability; ${action} effort "${proposed}" removed`,
        };
    }
    if (offered.includes(proposed)) {
        if (action === 'request')
            return undefined;
        return { effort: proposed, reason: `${action} applied` };
    }
    if (policy === 'drop') {
        return { effort: null, reason: `${action} effort "${proposed}" is not offered by the model; removed` };
    }
    const clamped = clampEffort(proposed, offered);
    /* v8 ignore next -- clampEffort always answers for a non-empty offer. */
    if (clamped === undefined)
        return undefined;
    return { effort: clamped, reason: `${action} effort "${proposed}" is not offered by the model; clamped to "${clamped}"` };
}
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
export function decideOverride(request, rule, policy, capability) {
    const proposal = proposeEffort(request, rule);
    if (proposal === undefined)
        return undefined;
    return settleProposal(proposal, policy, capability);
}
//# sourceMappingURL=override.js.map