/**
 * Locale dictionaries for the thinking-level-override settings page.
 *
 * @module dsh-thinking-level-override/client/locales
 */

/** Simplified Chinese product copy. */
export const zh: { [Key in Dictionary]: string } = {
  nav: '思考等级',
  title: '思考等级',
  intro: '勾选每个模型可提供的思考等级——对话的模型选择器只会显示这些选项，具体选哪个等级也在那里选。打开「思考等级映射」可编辑各等级实际发送的值（off 留空 = 发送空值）。',
  unavailable: '设置服务不可用，无法编辑该插件配置。',
  noModels: '暂无模型目录。',
  notEditable: '该模型不支持自定义思考等级',
  wireSpelling: '发送值',
  wireOff: '留空 = 发送空值',
  mapLevel: '等级',
  removeLevel: '删除该等级',
  mappingsToggle: '思考等级映射',
  mappingsHint: '关闭时仅隐藏发送值编辑区，已保存的等级与发送值仍然生效。',
  mappingsUnavailable: '设置服务未暴露该插件的命名空间，思考等级映射不可用；等级勾选不受影响。',
  modelLevel: '思考级别',
  selectLevels: '选择等级',
  levelsSelected: '已选择',
  offNote: '关闭思考',
  unsetLevel: '不设置',
  dirty: '有未保存的修改',
  discard: '还原',
  save: '保存',
  saving: '保存中…',
  saved: '已保存，下个请求生效',
}

/** English copy (the key-set source of truth for this pair). */
export const en = {
  nav: 'Thinking levels',
  title: 'Thinking levels',
  intro: 'Check the thinking levels each model offers — the model picker in a conversation shows exactly these, and choosing one happens there. With Thinking level mappings on, edit the value actually sent for each level (blank off = send nothing).',
  unavailable: 'The settings service is unavailable; this plugin cannot be edited here.',
  noModels: 'No model catalog available.',
  notEditable: 'This model does not support custom thinking levels',
  wireSpelling: 'Wire value',
  wireOff: 'blank = send nothing',
  mapLevel: 'Level',
  removeLevel: 'Remove this level',
  mappingsToggle: 'Thinking level mappings',
  mappingsHint: 'While off, only the spelling editor is hidden; saved levels and spellings stay in effect.',
  mappingsUnavailable: 'The settings service does not expose this plugin\'s namespace, so thinking level mappings are unavailable; level selection still works.',
  modelLevel: 'Thinking level',
  selectLevels: 'Select levels',
  levelsSelected: 'Selected',
  offNote: 'disables thinking',
  unsetLevel: 'Unset',
  dirty: 'Unsaved changes',
  discard: 'Discard',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved; effective on the next request',
}

/** Keys of the {@link en} dictionary, the locale-typed face of this pair. */
export type Dictionary = keyof typeof en
