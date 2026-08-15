/**
 * thinking-level-override settings card, browser half. Registers one card into
 * the shared Plugins configuration section (`settings.plugin.item`), bound to
 * the `thinking-level-override` settings namespace the Host plugin registers.
 *
 * @module dsh-thinking-level-override/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the thinking-level-override card into the Plugins settings section.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map