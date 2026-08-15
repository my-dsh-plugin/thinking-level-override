/**
 * Locale dictionaries for the thinking-level-override card.
 *
 * @module dsh-thinking-level-override/client/locales
 */
/** Simplified Chinese product copy. */
export const zh = {
    title: '思考等级覆盖',
    description: '自主覆盖与调整第三方模型的思考等级，修复内置预设缺失或不匹配',
    unavailable: '设置服务不可用，无法编辑该插件配置。',
    globalPolicy: '不可用等级处理',
    globalPolicyHint: '请求的思考等级模型无法提供时的默认处理；单条规则可单独覆盖。',
    'policy.clamp': '就近夹取（clamp）',
    'policy.drop': '移除等级（drop）',
    'policy.fail': '保持报错（fail）',
    rule: '规则',
    provider: '供应商路由（精确匹配）',
    models: '模型通配符（逗号分隔，可留空）',
    effort: '强制等级',
    default: '缺省等级',
    map: '等级重映射（如 max: high）',
    rulePolicy: '本规则策略',
    inherit: '继承全局',
    unset: '不设置',
    addRule: '添加规则',
    removeRule: '删除此规则',
    dirty: '有未保存的修改',
    discard: '还原',
    save: '保存',
    saving: '保存中…',
    saved: '已保存，下个请求生效',
};
/** English copy. */
export const en = {
    title: 'Thinking level override',
    description: 'Autonomously override and adjust third-party model thinking levels',
    unavailable: 'The settings service is unavailable; this plugin cannot be edited here.',
    globalPolicy: 'Unsupported effort handling',
    globalPolicyHint: 'What to do when the exact model cannot serve the requested effort; rules may override.',
    'policy.clamp': 'Clamp to nearest (clamp)',
    'policy.drop': 'Drop the effort (drop)',
    'policy.fail': 'Keep the stock failure (fail)',
    rule: 'Rule',
    provider: 'Provider route (exact)',
    models: 'Model globs (comma-separated, blank = all)',
    effort: 'Forced level',
    default: 'Default level',
    map: 'Level remap (e.g. max: high)',
    rulePolicy: 'Rule policy',
    inherit: 'Inherit global',
    unset: 'Unset',
    addRule: 'Add rule',
    removeRule: 'Remove this rule',
    dirty: 'Unsaved changes',
    discard: 'Discard',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved; effective on the next request',
};
//# sourceMappingURL=locales.js.map