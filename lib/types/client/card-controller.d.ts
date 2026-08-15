/**
 * The card's controller over the `thinking-level-override` settings scope:
 * projects the live section into an editable draft shape, validates a draft
 * the way the Host plugin validates its configuration, and routes a saved
 * draft through the scope's queued field writes.
 *
 * @module dsh-thinking-level-override/client/card-controller
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
/** Settings namespace the Host plugin registers; spelled here because a client package must not import a Host package. */
export declare const THINKING_OVERRIDE_NS = "thinking-level-override";
/** Thinking levels the draft offers in escalation order (`''` = unset). */
export declare const LEVEL_CHOICES: readonly ["", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** Policy choices the draft offers (`''` in a rule means inheriting the global policy). */
export declare const POLICY_CHOICES: readonly ["clamp", "drop", "fail"];
/** One rule as the wire section stores it. */
export interface WireRule {
    provider: string;
    models?: string[];
    effort?: string;
    default?: string;
    map?: Record<string, string>;
    onUnsupported?: 'clamp' | 'drop' | 'fail';
}
/** The section as the wire stores it. */
export interface WireSection {
    onUnsupported: 'clamp' | 'drop' | 'fail';
    rules: WireRule[];
}
/** One rule as the card edits it: lists and dicts flatten to text inputs. */
export interface RuleDraft {
    provider: string;
    /** Comma-separated model globs; blank governs every model on the route. */
    models: string;
    /** Forced level; blank forces nothing. */
    effort: string;
    /** Level applied when a request names none; blank fills nothing. */
    default: string;
    /** `requested: replacement` pairs, comma-separated. */
    map: string;
    /** Per-rule policy; blank inherits the global policy. */
    onUnsupported: string;
}
/** The whole editable section. */
export interface SectionDraft {
    onUnsupported: string;
    rules: RuleDraft[];
}
/** What the card renders from the live scope. */
export interface CardSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
    writable: boolean;
    section: SectionDraft;
}
/** Observable source the renderer binds as the card's snapshot hook. */
export interface CardSource {
    getSnapshot(): CardSnapshot;
    subscribe(listener: () => void): () => void;
}
/** The editable draft of the section the scope currently resolves. */
export declare function toDraft(section: WireSection | undefined): SectionDraft;
/**
 * Validate a draft the way the Host plugin validates its configuration.
 * @param draft - the section about to be saved.
 * @returns a human-readable problem, or `undefined` when the draft may save.
 */
export declare function validateDraft(draft: SectionDraft): string | undefined;
/** Bridges the `thinking-level-override` scope onto the card. */
export declare class ThinkingOverrideCardController {
    private readonly scope;
    private snapshot;
    private readonly listeners;
    /** Publishes live scope projections; the renderer binds it as the card hook. */
    readonly source: CardSource;
    /** @param scope - the bound settings scope for the namespace. */
    constructor(scope: SettingsScope<WireSection>);
    private project;
    /**
     * Save one draft: validate it client-side first, then queue the section's
     * two field writes in order.
     * @param draft - the edited section.
     * @returns a human-readable failure, or `undefined` once both writes settle.
     */
    save(draft: SectionDraft): Promise<string | undefined>;
}
//# sourceMappingURL=card-controller.d.ts.map