import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
//#region lib/types/config.js
/**
* Configuration schema and load-time validation for the thinking-level
* override plugin.
*
* @module dsh-thinking-level-override/config
*/
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
	onUnsupported: z.union([
		"clamp",
		"drop",
		"fail"
	])
});
/** Runtime schema for {@link Config}. */
const Config = z.object({
	enableMappings: z.boolean().default(false),
	onUnsupported: z.union([
		"clamp",
		"drop",
		"fail"
	]).default("fail"),
	rules: z.array(ruleSchema).default([])
});
/**
* Reject a configuration the schema accepts but the plugin cannot serve. Runs at
* plugin load, so a self-contained misconfiguration fails where it is written.
* @param config - the schema-validated configuration.
* @throws Error naming the offending rule.
*/
function assertValidConfig(config) {
	for (const [index, rule] of config.rules.entries()) {
		const where = `thinking-level-override: rules[${index}]`;
		if (rule.provider.length === 0) throw new Error(`${where} has an empty provider; name the exact provider route to govern`);
		for (const glob of rule.models ?? []) if (glob.length === 0) throw new Error(`${where} (provider "${rule.provider}") lists an empty model glob; remove it or write a pattern`);
		if (rule.effort === "") throw new Error(`${where} (provider "${rule.provider}") sets an empty effort`);
		if (rule.default === "") throw new Error(`${where} (provider "${rule.provider}") sets an empty default`);
		for (const [level, replacement] of Object.entries(rule.map ?? {})) if (level.length === 0 || replacement.length === 0) throw new Error(`${where} (provider "${rule.provider}") has a map entry with an empty level or replacement`);
		const hasMap = rule.map !== void 0 && Object.keys(rule.map).length > 0;
		if (rule.effort === void 0 && rule.default === void 0 && !hasMap && rule.onUnsupported === void 0) throw new Error(`${where} (provider "${rule.provider}") declares no action; set effort, default, map, or onUnsupported`);
	}
}
//#endregion
//#region lib/types/override.js
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
const EFFORT_LADDER = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/**
* Position of one known level in the escalation ladder.
* @param effort - candidate level id.
* @returns the ladder index, or `undefined` for an id outside the ladder.
*/
function ladderIndexOf(effort) {
	const index = EFFORT_LADDER.indexOf(effort);
	return index === -1 ? void 0 : index;
}
/**
* Compile one `*`-wildcard glob into an anchored matcher. Every other
* character is literal; `?` is not a wildcard.
* @param glob - model-id pattern.
* @returns a regex matching exactly the ids the glob describes.
*/
function globToRegExp(glob) {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
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
function ruleMatches(rule, provider, model) {
	if (rule.provider !== provider) return false;
	if (rule.models === void 0 || rule.models.length === 0) return true;
	return rule.models.some((glob) => globToRegExp(glob).test(model));
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
function matchRule(rules, provider, model) {
	return rules.find((rule) => ruleMatches(rule, provider, model));
}
/**
* Order offered levels for clamp selection: ladder levels ascending, then ids
* outside the ladder in the adapter's reported order. Stable sort keeps that
* reported order intact.
* @param offered - level ids the exact model offers.
* @returns the same ids in selection order.
*/
function sortOffered(offered) {
	return [...offered].sort((left, right) => {
		const leftIndex = ladderIndexOf(left);
		const rightIndex = ladderIndexOf(right);
		if (leftIndex !== void 0 && rightIndex !== void 0) return leftIndex - rightIndex;
		if (leftIndex !== void 0) return -1;
		if (rightIndex !== void 0) return 1;
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
function clampEffort(requested, offered) {
	if (offered.length === 0) return void 0;
	const sorted = sortOffered(offered);
	const requestedIndex = ladderIndexOf(requested);
	if (requestedIndex === void 0) return sorted[sorted.length - 1];
	let best;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of sorted) {
		const candidateIndex = ladderIndexOf(candidate);
		if (candidateIndex === void 0) continue;
		const distance = Math.abs(candidateIndex - requestedIndex);
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
function proposeEffort(request, rule) {
	if (rule?.effort !== void 0) return {
		proposed: rule.effort,
		action: "force"
	};
	if (request.reasoningEffort !== void 0) {
		const mapped = rule?.map?.[request.reasoningEffort];
		if (mapped !== void 0) return {
			proposed: mapped,
			action: "map"
		};
		return {
			proposed: request.reasoningEffort,
			action: "request"
		};
	}
	if (rule?.default !== void 0) return {
		proposed: rule.default,
		action: "default"
	};
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
function settleProposal(proposal, policy, capability) {
	const { proposed, action } = proposal;
	if (policy === "fail") {
		if (action === "request") return void 0;
		return {
			effort: proposed,
			reason: `${action} applied without validation (onUnsupported: fail)`
		};
	}
	if (capability === "unknown") return void 0;
	const offered = capability.reasoning?.efforts.map((effort) => effort.id) ?? [];
	if (offered.length === 0) return {
		effort: null,
		reason: `model declares no reasoning capability; ${action} effort "${proposed}" removed`
	};
	if (offered.includes(proposed)) {
		if (action === "request") return void 0;
		return {
			effort: proposed,
			reason: `${action} applied`
		};
	}
	if (policy === "drop") return {
		effort: null,
		reason: `${action} effort "${proposed}" is not offered by the model; removed`
	};
	const clamped = clampEffort(proposed, offered);
	/* v8 ignore next -- clampEffort always answers for a non-empty offer. */
	if (clamped === void 0) return void 0;
	return {
		effort: clamped,
		reason: `${action} effort "${proposed}" is not offered by the model; clamped to "${clamped}"`
	};
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
function decideOverride(request, rule, policy, capability) {
	const proposal = proposeEffort(request, rule);
	if (proposal === void 0) return void 0;
	return settleProposal(proposal, policy, capability);
}
//#endregion
//#region lib/types/index.js
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
const name = "thinking-level-override";
const inject = ["llm"];
/** Settings namespace this plugin registers for live configuration surfaces. */
const settingsNs = settingsNamespace("thinking-level-override");
/** Return the config carrying one effort in place of its previous value. */
function withEffort(config, effort) {
	return {
		...config,
		reasoningEffort: effort
	};
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
function apply(ctx, config) {
	assertValidConfig(config);
	let current = () => config;
	const handleRequest = async (payload, next) => {
		const active = current();
		const resolved = await next();
		const rule = matchRule(active.rules, resolved.provider, resolved.model);
		const policy = rule?.onUnsupported ?? active.onUnsupported;
		const proposal = proposeEffort({
			provider: resolved.provider,
			model: resolved.model,
			...resolved.reasoningEffort === void 0 ? {} : { reasoningEffort: resolved.reasoningEffort }
		}, rule);
		if (proposal === void 0) return resolved;
		let capability = "unknown";
		if (policy !== "fail") try {
			capability = await ctx.llm.resolveModelInfo(resolved.provider, resolved.model, payload.signal);
		} catch (error) {
			ctx.logger.debug(`thinking-level-override: capability lookup failed for "${resolved.provider}" model "${resolved.model}"; passing the request through (${String(error)})`);
			return resolved;
		}
		const outcome = settleProposal(proposal, policy, capability);
		if (outcome === void 0) return resolved;
		const before = resolved.reasoningEffort;
		if (outcome.effort === null) {
			ctx.logger.debug(`thinking-level-override: "${resolved.provider}" model "${resolved.model}" effort ${before === void 0 ? "unset" : `"${before}"`} removed — ${outcome.reason}`);
			return withoutEffort(resolved);
		}
		if (before !== outcome.effort) ctx.logger.debug(`thinking-level-override: "${resolved.provider}" model "${resolved.model}" effort ${before === void 0 ? "unset" : `"${before}"`} overridden to "${outcome.effort}" — ${outcome.reason}`);
		return withEffort(resolved, outcome.effort);
	};
	ctx.on("agent/request", handleRequest, true);
	installSettingsSection(ctx, settingsNs, Config, config, {
		validate: assertValidConfig,
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
}
//#endregion
export { Config, EFFORT_LADDER, apply, clampEffort, decideOverride, globToRegExp, inject, matchRule, name, proposeEffort, ruleMatches, settingsNs, settleProposal, sortOffered };
