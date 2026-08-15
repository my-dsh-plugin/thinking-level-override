/**
 * The thinking-level-override settings card: edits the global unsupported
 * policy and the override rule list, staging locally and saving through the
 * controller's scope writes.
 *
 * @module dsh-thinking-level-override/client/card
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CardSource, SectionDraft } from './card-controller.ts';
/** The registration-side face the card injects. */
export interface ThinkingOverrideCardFace {
    hooks: {
        /** Live card snapshot bound by the renderer as useThinkingOverrideCard. */
        thinkingOverrideCard: CardSource;
    };
    /** Validate and persist one edited section; answers a problem or nothing. */
    saveSection(draft: SectionDraft): Promise<string | undefined>;
}
/** Props the renderer binds for the card. */
export type ThinkingOverrideCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'thinking-level-override'> & InjectFace<ThinkingOverrideCardFace>;
/**
 * Render the thinking-level-override card.
 * @param props - locale copy, the live snapshot, and the save callback.
 * @returns the card.
 */
export declare function ThinkingLevelOverrideCard(props: ThinkingOverrideCardProps): import("react").JSX.Element;
//# sourceMappingURL=ThinkingLevelOverrideCard.d.ts.map