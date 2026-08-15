import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The thinking-level-override settings card: edits the global unsupported
 * policy and the override rule list, staging locally and saving through the
 * controller's scope writes.
 *
 * @module dsh-thinking-level-override/client/card
 */
import { useEffect, useMemo, useState } from 'react';
import css from './card.module.css';
import { LEVEL_CHOICES, POLICY_CHOICES } from "./card-controller.js";
/** One blank rule for the add button. */
function emptyRule() {
    return { provider: '', models: '', effort: '', default: '', map: '', onUnsupported: '' };
}
/** The policy select's options: the three policies, optionally plus inherit. */
function policyOptions(inherit) {
    return inherit ? ['', ...POLICY_CHOICES] : POLICY_CHOICES;
}
/**
 * Render the thinking-level-override card.
 * @param props - locale copy, the live snapshot, and the save callback.
 * @returns the card.
 */
export function ThinkingLevelOverrideCard(props) {
    const { t } = props;
    const live = props.useThinkingOverrideCard(snapshot => snapshot);
    const [draft, setDraft] = useState(live.section);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(undefined);
    // A live section replacement (a save settling, an outside edit) re-seeds the
    // draft; the section reference is stable between changes, so this runs only
    // when the Host state actually moved.
    useEffect(() => {
        setDraft(live.section);
        setNotice(undefined);
    }, [live.section]);
    const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(live.section), [draft, live.section]);
    const editRule = (index, patch) => {
        setDraft(current => ({
            ...current,
            rules: current.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule),
        }));
    };
    const onSave = async () => {
        setSaving(true);
        const problem = await props.saveSection(JSON.parse(JSON.stringify(draft)));
        setSaving(false);
        setNotice(problem === undefined
            ? { kind: 'ok', text: t('saved') }
            : { kind: 'error', text: problem });
    };
    if (live.status === 'unavailable') {
        return _jsx("li", { className: css.card, children: _jsx("p", { className: css.body, children: t('unavailable') }) });
    }
    return (_jsxs("li", { className: css.card, children: [_jsxs("div", { className: css.head, children: [_jsx("span", { className: css.name, children: t('title') }), _jsx("span", { className: css.description, children: t('description') })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('globalPolicy') }), _jsx("select", { className: css.control, disabled: !live.writable, value: draft.onUnsupported, onChange: event => setDraft(current => ({ ...current, onUnsupported: event.target.value })), children: POLICY_CHOICES.map(policy => (_jsx("option", { value: policy, children: t(`policy.${policy}`) }, policy))) }), _jsx("span", { className: css.hint, children: t('globalPolicyHint') })] }), draft.rules.map((rule, index) => (_jsxs("fieldset", { className: css.rule, children: [_jsxs("legend", { className: css.ruleTitle, children: [t('rule'), " #", index + 1] }), _jsxs("div", { className: css.ruleGrid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('provider') }), _jsx("input", { className: css.control, disabled: !live.writable, value: rule.provider, placeholder: "openrouter", onChange: event => editRule(index, { provider: event.target.value }) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('models') }), _jsx("input", { className: css.control, disabled: !live.writable, value: rule.models, placeholder: "kimi-k2*", onChange: event => editRule(index, { models: event.target.value }) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('effort') }), _jsx("select", { className: css.control, disabled: !live.writable, value: rule.effort, onChange: event => editRule(index, { effort: event.target.value }), children: LEVEL_CHOICES.map(level => (_jsx("option", { value: level, children: level === '' ? t('unset') : level }, level))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('default') }), _jsx("select", { className: css.control, disabled: !live.writable, value: rule.default, onChange: event => editRule(index, { default: event.target.value }), children: LEVEL_CHOICES.map(level => (_jsx("option", { value: level, children: level === '' ? t('unset') : level }, level))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('map') }), _jsx("input", { className: css.control, disabled: !live.writable, value: rule.map, placeholder: "max: high, xhigh: high", onChange: event => editRule(index, { map: event.target.value }) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { className: css.label, children: t('rulePolicy') }), _jsx("select", { className: css.control, disabled: !live.writable, value: rule.onUnsupported, onChange: event => editRule(index, { onUnsupported: event.target.value }), children: policyOptions(true).map(policy => (_jsx("option", { value: policy, children: policy === '' ? t('inherit') : t(`policy.${policy}`) }, policy))) })] })] }), _jsx("button", { type: "button", className: css.removeRule, disabled: !live.writable, onClick: () => setDraft(current => ({ ...current, rules: current.rules.filter((_, i) => i !== index) })), children: t('removeRule') })] }, index))), _jsxs("div", { className: css.footer, children: [_jsx("button", { type: "button", className: css.secondaryButton, disabled: !live.writable, onClick: () => setDraft(current => ({ ...current, rules: [...current.rules, emptyRule()] })), children: t('addRule') }), _jsx("span", { className: css.spacer }), notice !== undefined && (_jsx("span", { className: notice.kind === 'ok' ? css.noticeOk : css.noticeError, children: notice.text })), dirty && notice === undefined && _jsx("span", { className: css.noticeDirty, children: t('dirty') }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: !dirty || saving || !live.writable, onClick: () => { setDraft(live.section); setNotice(undefined); }, children: t('discard') }), _jsx("button", { type: "button", className: css.primaryButton, disabled: !dirty || saving || !live.writable, onClick: () => { void onSave(); }, children: saving ? t('saving') : t('save') })] })] }));
}
//# sourceMappingURL=ThinkingLevelOverrideCard.js.map