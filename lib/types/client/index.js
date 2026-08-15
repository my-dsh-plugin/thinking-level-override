/**
 * thinking-level-override settings card, browser half. Registers one card into
 * the shared Plugins configuration section (`settings.plugin.item`), bound to
 * the `thinking-level-override` settings namespace the Host plugin registers.
 *
 * @module dsh-thinking-level-override/client
 */
import { ThinkingLevelOverrideCard } from "./ThinkingLevelOverrideCard.js";
import { THINKING_OVERRIDE_NS, ThinkingOverrideCardController } from "./card-controller.js";
import { en, zh } from "./locales.js";
/** Locale dictionary namespace owned by this card. */
const NS = 'thinking-level-override';
/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope'];
/**
 * Mount the thinking-level-override card into the Plugins settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'thinking-level-override: card dictionaries');
    // Bind the namespace scope on this plugin's lifecycle; the binder reaches
    // the connection and remote services through the caller context.
    void ctx.get('connection');
    const controller = new ThinkingOverrideCardController(ctx.settingsScope.bind({ namespace: THINKING_OVERRIDE_NS }));
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'thinking-level-override',
        order: 30,
        locale: NS,
        inject: () => ({
            hooks: { thinkingOverrideCard: controller.source },
            saveSection: (draft) => controller.save(draft),
        }),
    }, ThinkingLevelOverrideCard));
}
//# sourceMappingURL=index.js.map