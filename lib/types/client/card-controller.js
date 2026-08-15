/**
 * The card's controller over the `thinking-level-override` settings scope:
 * projects the live section into an editable draft shape, validates a draft
 * the way the Host plugin validates its configuration, and routes a saved
 * draft through the scope's queued field writes.
 *
 * @module dsh-thinking-level-override/client/card-controller
 */
/** Settings namespace the Host plugin registers; spelled here because a client package must not import a Host package. */
export const THINKING_OVERRIDE_NS = 'thinking-level-override';
/** Thinking levels the draft offers in escalation order (`''` = unset). */
export const LEVEL_CHOICES = ['', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/** Policy choices the draft offers (`''` in a rule means inheriting the global policy). */
export const POLICY_CHOICES = ['clamp', 'drop', 'fail'];
/** Split a comma-separated list, dropping blank entries. */
function splitList(text) {
    return text.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0);
}
/** Parse `from: to` pairs; a malformed entry yields the offending text. */
function parseMap(text) {
    const entries = splitList(text);
    if (entries.length === 0)
        return {};
    const map = {};
    for (const entry of entries) {
        const separator = entry.indexOf(':');
        const from = separator === -1 ? '' : entry.slice(0, separator).trim();
        const to = separator === -1 ? '' : entry.slice(separator + 1).trim();
        if (from.length === 0 || to.length === 0)
            return { error: entry };
        map[from] = to;
    }
    return { map };
}
/** Serialize a map back to the draft's `from: to, …` text. */
function mapToText(map) {
    if (map === undefined)
        return '';
    return Object.entries(map).map(([from, to]) => `${from}: ${to}`).join(', ');
}
/** Project one wire rule into its editable draft. */
function ruleToDraft(rule) {
    return {
        provider: rule.provider,
        models: (rule.models ?? []).join(', '),
        effort: rule.effort ?? '',
        default: rule.default ?? '',
        map: mapToText(rule.map),
        onUnsupported: rule.onUnsupported ?? '',
    };
}
/** The editable draft of the section the scope currently resolves. */
export function toDraft(section) {
    return {
        onUnsupported: section?.onUnsupported ?? 'clamp',
        rules: (section?.rules ?? []).map(ruleToDraft),
    };
}
/**
 * Validate a draft the way the Host plugin validates its configuration.
 * @param draft - the section about to be saved.
 * @returns a human-readable problem, or `undefined` when the draft may save.
 */
export function validateDraft(draft) {
    for (const [index, rule] of draft.rules.entries()) {
        const where = `#${index + 1}`;
        if (rule.provider.trim().length === 0)
            return `${where}: provider 不能为空`;
        if (splitList(rule.models).some(glob => glob.length === 0))
            return `${where}: 模型通配符不能为空`;
        if (rule.effort.trim().length === 0 && rule.default.trim().length === 0
            && rule.map.trim().length === 0 && rule.onUnsupported.trim().length === 0) {
            return `${where}: 至少设置 effort / default / map / onUnsupported 之一`;
        }
        const parsed = parseMap(rule.map);
        if ('error' in parsed)
            return `${where}: map 条目 "${parsed.error}" 应写作 "请求值: 替换值"`;
    }
    return undefined;
}
/** Serialize one draft rule into its wire shape, omitting blank fields. */
function ruleFromDraft(rule) {
    const models = splitList(rule.models);
    const parsed = parseMap(rule.map);
    return {
        provider: rule.provider.trim(),
        ...models.length === 0 ? {} : { models },
        ...rule.effort.trim().length === 0 ? {} : { effort: rule.effort.trim() },
        ...rule.default.trim().length === 0 ? {} : { default: rule.default.trim() },
        ...('map' in parsed && parsed.map !== undefined ? { map: parsed.map } : {}),
        ...rule.onUnsupported.trim().length === 0 ? {} : { onUnsupported: rule.onUnsupported },
    };
}
/** Bridges the `thinking-level-override` scope onto the card. */
export class ThinkingOverrideCardController {
    scope;
    snapshot;
    listeners = new Set();
    /** Publishes live scope projections; the renderer binds it as the card hook. */
    source;
    /** @param scope - the bound settings scope for the namespace. */
    constructor(scope) {
        this.scope = scope;
        this.snapshot = this.project();
        this.source = {
            getSnapshot: () => this.snapshot,
            subscribe: (listener) => {
                this.listeners.add(listener);
                return () => {
                    this.listeners.delete(listener);
                };
            },
        };
        scope.subscribe(() => {
            this.snapshot = this.project();
            for (const listener of [...this.listeners])
                listener();
        });
    }
    project() {
        const live = this.scope.getSnapshot();
        return {
            status: live.status,
            writable: live.writable,
            section: toDraft(live.value),
        };
    }
    /**
     * Save one draft: validate it client-side first, then queue the section's
     * two field writes in order.
     * @param draft - the edited section.
     * @returns a human-readable failure, or `undefined` once both writes settle.
     */
    async save(draft) {
        const problem = validateDraft(draft);
        if (problem !== undefined)
            return problem;
        try {
            await this.scope.set('onUnsupported', draft.onUnsupported);
            await this.scope.set('rules', draft.rules.map(ruleFromDraft));
            return undefined;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
}
//# sourceMappingURL=card-controller.js.map