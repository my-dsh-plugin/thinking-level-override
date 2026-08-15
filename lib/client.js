window.__ModuleLoader__.load({
	id: "dsh-thinking-level-override",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/section-controller.ts
		/** Settings namespace the Host plugin registers; spelled here because a client package must not import a Host package. */
		const THINKING_OVERRIDE_NS = "thinking-level-override";
		/** Settings namespace of the pi-ai adapter, whose model entries own `reasoningEfforts`. */
		const LLM_PI_AI_NS = "llm-pi-ai";
		/** Thinking levels a model may offer, in escalation order. */
		const LEVEL_CHOICES = [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		];
		/** The editable draft of the section the scope currently resolves. */
		function toDraft(section) {
			return { enableMappings: section?.enableMappings ?? false };
		}
		/** The offered-levels dict of one model entry, when it declares one. */
		function reasoningEffortsOf(entry) {
			const value = entry["reasoningEfforts"];
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		/**
		* The pi-ai model entries this page may edit: every model that appears in a
		* provider's `models` list or `modelOverrides` dict.
		* @param section - the pi-ai section snapshot.
		* @returns editable addresses keyed by `provider\0model`.
		*/
		function editableModels(section) {
			const found = /* @__PURE__ */ new Map();
			for (const [provider, profile] of Object.entries(section?.providers ?? {})) {
				for (const [index, entry] of (profile.models ?? []).entries()) {
					const model = String(entry["id"] ?? "");
					if (model.length === 0) continue;
					const efforts = reasoningEffortsOf(entry);
					found.set(`${provider}\u0000${model}`, {
						provider,
						model,
						path: [
							"providers",
							provider,
							"models",
							String(index),
							"reasoningEfforts"
						],
						...efforts === void 0 ? {} : { efforts }
					});
				}
				for (const [model, entry] of Object.entries(profile.modelOverrides ?? {})) {
					const efforts = reasoningEffortsOf(entry);
					found.set(`${provider}\u0000${model}`, {
						provider,
						model,
						path: [
							"providers",
							provider,
							"modelOverrides",
							model,
							"reasoningEfforts"
						],
						...efforts === void 0 ? {} : { efforts }
					});
				}
			}
			return found;
		}
		/** Bridges the two settings scopes and the write path onto the section. */
		var ThinkingOverrideSectionController = class {
			policyScope;
			piAiScope;
			api;
			/** Publishes the policy scope; the renderer binds it as the policy hook. */
			policySource;
			/** Publishes the pi-ai scope; the renderer binds it as the catalog hook. */
			piAiSource;
			/**
			* @param policyScope - the bound scope for the thinking-level-override namespace.
			* @param piAiScope - the bound scope for the llm-pi-ai namespace.
			* @param api - wire face used for the writes into the pi-ai section.
			*/
			constructor(policyScope, piAiScope, api) {
				this.policyScope = policyScope;
				this.piAiScope = piAiScope;
				this.api = api;
				this.policySource = this.bind(policyScope, (live) => ({
					status: live.status,
					writable: live.writable,
					section: toDraft(live.value)
				}));
				this.piAiSource = this.bind(piAiScope, (live) => ({
					status: live.status,
					writable: live.writable,
					section: live.value
				}));
			}
			bind(scope, project) {
				const listeners = /* @__PURE__ */ new Set();
				let snapshot = project(scope.getSnapshot());
				scope.subscribe(() => {
					snapshot = project(scope.getSnapshot());
					for (const listener of [...listeners]) listener();
				});
				return {
					getSnapshot: () => snapshot,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				};
			}
			/**
			* Persist the mappings-editor switch and the per-model offered-level
			* changes. The switch writes through the plugin's own scope, alongside a
			* fixed `onUnsupported: fail` — the page no longer offers clamp/drop, so
			* saving pins the stock harness behavior (the model errors natively) even
			* when an older user layer set a different policy. Each model's
			* `reasoningEfforts` writes through the settings mutate seam: a
			* `modelOverrides` entry takes a direct object-path write, while a
			* `models`-array entry writes the whole array rebuilt with that one entry's
			* field changed — the mutate path ops cannot address array elements, so no
			* other field of the array is touched.
			* @param enableMappings - whether the mapping editor is shown.
			* @param changes - per editable model (`provider\0model` key): the new
			*   offered-levels dict, or `undefined` to clear the field back to inheritance.
			* @returns a human-readable failure, or `undefined` once every write settles.
			*/
			async save(enableMappings, changes) {
				const section = this.piAiScope.getSnapshot().value;
				const editable = editableModels(section);
				const ops = [];
				const arraysByRoute = /* @__PURE__ */ new Map();
				for (const [key, efforts] of changes) {
					const address = editable.get(key);
					if (address === void 0) continue;
					if (address.path[2] === "models") {
						const route = address.path[1];
						const index = Number(address.path[3]);
						const entries = arraysByRoute.get(route) ?? [];
						entries.push({
							route,
							index,
							efforts
						});
						arraysByRoute.set(route, entries);
					} else {
						const route = address.path[1];
						const model = address.path[3];
						const next = { ...section?.providers?.[route]?.modelOverrides?.[model] ?? {} };
						if (efforts === void 0) delete next["reasoningEfforts"];
						else next["reasoningEfforts"] = efforts;
						ops.push({
							op: "set",
							path: [
								"providers",
								route,
								"modelOverrides",
								model
							],
							value: next
						});
					}
				}
				for (const [route, changed] of arraysByRoute) {
					const models = [...(section?.providers?.[route])?.models ?? []];
					for (const { index, efforts } of changed) {
						if (index >= models.length) continue;
						const next = { ...models[index] };
						if (efforts === void 0) delete next["reasoningEfforts"];
						else next["reasoningEfforts"] = efforts;
						models[index] = next;
					}
					ops.push({
						op: "set",
						path: [
							"providers",
							route,
							"models"
						],
						value: models
					});
				}
				try {
					if (ops.length > 0) {
						const response = await this.api.settings.mutate({
							ns: LLM_PI_AI_NS,
							ops
						});
						if (!response.result.ok) return response.result.error.message;
					}
					if (this.policyScope.getSnapshot().writable) {
						await this.policyScope.set("enableMappings", enableMappings);
						await this.policyScope.set("onUnsupported", "fail");
					}
					return;
				} catch (error) {
					return error instanceof Error ? error.message : String(error);
				}
			}
		};
		//#endregion
		//#region \0dsh-css:/Users/cuizhy/WebstormProjects/my-dsh-plugin/thinking-level-override/src/client/section.module.css.mjs
		const css = ".S3c8cG_section{flex-direction:column;gap:14px;max-width:760px;display:flex}.S3c8cG_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}.S3c8cG_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}.S3c8cG_field{flex-wrap:wrap;align-items:center;gap:4px 10px;max-width:420px;display:flex}.S3c8cG_label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.S3c8cG_toggle{flex-shrink:0;align-items:center;width:36px;height:20px;display:inline-flex;position:relative}.S3c8cG_toggleInput{opacity:0;cursor:pointer;margin:0;position:absolute;inset:0}.S3c8cG_toggleTrack{background:var(--dsw-alias-border-l2);border-radius:999px;width:100%;height:100%;transition:background .12s}.S3c8cG_toggleKnob{background:var(--dsw-alias-label-primary-foreground);border-radius:50%;width:16px;height:16px;transition:transform .12s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}.S3c8cG_toggleOn .S3c8cG_toggleTrack{background:var(--dsw-alias-brand-primary)}.S3c8cG_toggleOn .S3c8cG_toggleKnob{transform:translate(16px)}.S3c8cG_toggleInput:focus-visible+.S3c8cG_toggleTrack{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.S3c8cG_toggleInput:disabled{cursor:default}.S3c8cG_toggleInput:disabled~.S3c8cG_toggleTrack,.S3c8cG_toggleInput:disabled~.S3c8cG_toggleKnob{opacity:.55}.S3c8cG_hint{color:var(--dsw-alias-label-tertiary);flex-basis:100%;font-size:12px;line-height:18px}.S3c8cG_provider{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}.S3c8cG_providerName{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:500;line-height:22px}.S3c8cG_modelList{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}.S3c8cG_modelRow{grid-template-columns:1fr auto;align-items:center;gap:10px 14px;padding:12px 0;display:grid}.S3c8cG_modelRow+.S3c8cG_modelRow{border-top:1px solid var(--dsw-alias-border-l2)}.S3c8cG_modelName{min-width:0;color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-size:14px;line-height:22px;overflow:hidden}.S3c8cG_picker{min-width:200px;position:relative}.S3c8cG_pickerButton{appearance:none;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:14px;line-height:22px;display:inline-flex}.S3c8cG_pickerButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}.S3c8cG_pickerButton:disabled{opacity:.55;cursor:default}.S3c8cG_pickerLabel{text-align:left;white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0;overflow:hidden}.S3c8cG_pickerChevron{background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-position:50%;background-repeat:no-repeat;flex-shrink:0;width:12px;height:12px}.S3c8cG_pickerMenu{z-index:10;box-sizing:border-box;background:var(--dsw-specific-menu);width:100%;box-shadow:var(--dsw-shadow-lv3);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;top:calc(100% + 4px);left:0}.S3c8cG_pickerMenuUp{top:auto;bottom:calc(100% + 4px)}.S3c8cG_pickerItem{color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;align-items:center;gap:8px;padding:8px 10px 8px 34px;font-size:14px;line-height:22px;display:inline-flex;position:relative}.S3c8cG_pickerItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.S3c8cG_pickerInput{opacity:0;cursor:pointer;margin:0;position:absolute;inset:0}.S3c8cG_pickerMark{pointer-events:none;justify-content:center;align-items:center;width:16px;height:16px;display:inline-flex;position:absolute;top:50%;left:10px;transform:translateY(-50%)}.S3c8cG_pickerMarkChecked:after{content:\"\";border-left:2px solid var(--dsw-alias-brand-primary);border-bottom:2px solid var(--dsw-alias-brand-primary);width:10px;height:5px;transform:rotate(-45deg)translateY(-1px)}.S3c8cG_pickerItem:has(input:focus-visible){outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.S3c8cG_pickerItem:has(input:disabled){cursor:default;opacity:.6}.S3c8cG_pickerNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.S3c8cG_mapList{flex-direction:column;grid-column:1/-1;gap:6px;display:flex}.S3c8cG_mapHead{color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:12px;font-weight:500;line-height:18px;display:flex}.S3c8cG_mapHeadLevel{width:96px;padding:0 10px}.S3c8cG_mapHeadWire{width:120px;padding:0 10px}.S3c8cG_mapRow{align-items:center;gap:8px;display:flex}.S3c8cG_mapLevel{width:96px}.S3c8cG_mapWire{width:120px}.S3c8cG_mapArrow{color:var(--dsw-alias-label-tertiary);font-size:12px}.S3c8cG_mapRemove{appearance:none;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:4px;font-size:12px;line-height:18px}.S3c8cG_mapRemove:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}.S3c8cG_mapRemove:disabled{cursor:default;opacity:.5}.S3c8cG_notice{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}.S3c8cG_footer{border-top:1px solid var(--dsw-alias-border-l2);align-items:center;gap:10px;padding-top:12px;display:flex}.S3c8cG_spacer{flex:1}.S3c8cG_noticeOk{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.S3c8cG_noticeError{color:var(--dsw-alias-label-error);max-width:40%;font-size:12px;line-height:18px}.S3c8cG_noticeDirty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}";
		const tagId = "dsh-thinking-level-override/section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-thinking-level-override";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var section_module_css_default = {
			"providerName": "S3c8cG_providerName",
			"pickerMenu": "S3c8cG_pickerMenu",
			"modelList": "S3c8cG_modelList",
			"spacer": "S3c8cG_spacer",
			"modelRow": "S3c8cG_modelRow",
			"toggleOn": "S3c8cG_toggleOn",
			"pickerMark": "S3c8cG_pickerMark",
			"pickerLabel": "S3c8cG_pickerLabel",
			"mapLevel": "S3c8cG_mapLevel",
			"label": "S3c8cG_label",
			"toggle": "S3c8cG_toggle",
			"mapHead": "S3c8cG_mapHead",
			"noticeDirty": "S3c8cG_noticeDirty",
			"toggleInput": "S3c8cG_toggleInput",
			"toggleKnob": "S3c8cG_toggleKnob",
			"pickerNote": "S3c8cG_pickerNote",
			"field": "S3c8cG_field",
			"pickerInput": "S3c8cG_pickerInput",
			"mapRemove": "S3c8cG_mapRemove",
			"provider": "S3c8cG_provider",
			"mapRow": "S3c8cG_mapRow",
			"mapHeadLevel": "S3c8cG_mapHeadLevel",
			"mapHeadWire": "S3c8cG_mapHeadWire",
			"noticeOk": "S3c8cG_noticeOk",
			"pickerMarkChecked": "S3c8cG_pickerMarkChecked",
			"mapList": "S3c8cG_mapList",
			"toggleTrack": "S3c8cG_toggleTrack",
			"pickerButton": "S3c8cG_pickerButton",
			"mapWire": "S3c8cG_mapWire",
			"footer": "S3c8cG_footer",
			"section": "S3c8cG_section",
			"notice": "S3c8cG_notice",
			"modelName": "S3c8cG_modelName",
			"picker": "S3c8cG_picker",
			"pickerItem": "S3c8cG_pickerItem",
			"pickerChevron": "S3c8cG_pickerChevron",
			"hint": "S3c8cG_hint",
			"title": "S3c8cG_title",
			"noticeError": "S3c8cG_noticeError",
			"pickerMenuUp": "S3c8cG_pickerMenuUp",
			"intro": "S3c8cG_intro",
			"mapArrow": "S3c8cG_mapArrow"
		};
		//#endregion
		//#region src/client/section.tsx
		/**
		* The thinking-level-override settings page: per-model offered thinking
		* levels (multi-select) organized by provider, plus the global
		* unsupported-effort policy. The offered levels are what the conversation's
		* model-selection dialog presents — choosing the actual level stays there.
		* Provider configuration beyond the `reasoningEfforts` field is never touched.
		*
		* @module dsh-thinking-level-override/client/section
		*/
		/** Whether two offered-levels dicts differ (undefined and {} both mean inherit). */
		function effortsEqual(left, right) {
			const a = left === void 0 ? {} : left;
			const b = right === void 0 ? {} : right;
			return JSON.stringify(a) === JSON.stringify(b);
		}
		/**
		* Render the thinking-level-override settings page.
		* @param props - locale copy, the live snapshots, the model catalog wire, and the save callback.
		* @returns the section.
		*/
		function ThinkingOverrideSection(props) {
			const { t } = props;
			const policy = props.useThinkingOverridePolicy((snapshot) => snapshot);
			const piAi = props.usePiAiSection((snapshot) => snapshot);
			const [mappingsDraft, setMappingsDraft] = (0, react.useState)(policy.section.enableMappings);
			const [groups, setGroups] = (0, react.useState)([]);
			const [selections, setSelections] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [saving, setSaving] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const [openPicker, setOpenPicker] = (0, react.useState)(void 0);
			const [menuUp, setMenuUp] = (0, react.useState)(false);
			const pickerRefs = (0, react.useRef)(/* @__PURE__ */ new Map());
			const menuRefs = (0, react.useRef)(/* @__PURE__ */ new Map());
			(0, react.useLayoutEffect)(() => {
				if (openPicker === void 0) {
					setMenuUp(false);
					return;
				}
				const holder = pickerRefs.current.get(openPicker);
				const menu = menuRefs.current.get(openPicker);
				if (holder === void 0 || menu === void 0) return;
				const holderRect = holder.getBoundingClientRect();
				const menuHeight = menu.getBoundingClientRect().height;
				const gap = 4;
				let node = holder.parentElement;
				let boundary = {
					top: 0,
					bottom: window.innerHeight
				};
				while (node !== null) {
					const overflowY = getComputedStyle(node).overflowY;
					if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
						const rect = node.getBoundingClientRect();
						boundary = {
							top: rect.top,
							bottom: rect.bottom
						};
						break;
					}
					node = node.parentElement;
				}
				const roomBelow = boundary.bottom - (holderRect.bottom + gap);
				const roomAbove = holderRect.top - gap - boundary.top;
				setMenuUp(roomBelow < menuHeight && roomAbove >= menuHeight);
			}, [openPicker]);
			(0, react.useEffect)(() => {
				if (openPicker === void 0) return;
				const onDown = (event) => {
					const target = event.target;
					const holder = pickerRefs.current.get(openPicker);
					if (target !== null && holder !== void 0 && holder.contains(target)) return;
					setOpenPicker(void 0);
				};
				document.addEventListener("mousedown", onDown);
				return () => {
					document.removeEventListener("mousedown", onDown);
				};
			}, [openPicker]);
			const editable = (0, react.useMemo)(() => editableModels(piAi.section), [piAi.section]);
			(0, react.useEffect)(() => {
				setMappingsDraft(policy.section.enableMappings);
				setNotice(void 0);
			}, [policy.section]);
			(0, react.useEffect)(() => {
				setSelections(new Map([...editable].map(([key, model]) => [key, model.efforts])));
			}, [editable]);
			(0, react.useEffect)(() => {
				let stale = false;
				props.api.llm.models({}).then((response) => {
					if (stale || !response.result.ok) return;
					setGroups(response.result.value.groups);
				});
				return () => {
					stale = true;
				};
			}, [props.api]);
			const mappingsDirty = mappingsDraft !== policy.section.enableMappings;
			const modelsDirty = [...editable].some(([key, model]) => !effortsEqual(selections.get(key), model.efforts));
			const dirty = mappingsDirty || modelsDirty;
			/** Toggle one offered level for one model; clearing the last level restores inheritance. */
			const toggleLevel = (key, level, checked) => {
				setSelections((current) => {
					const next = { ...current.get(key) ?? editable.get(key)?.efforts ?? {} };
					if (checked) {
						if (!(level in next)) next[level] = level === "off" ? null : level;
					} else delete next[level];
					const updated = new Map(current);
					updated.set(key, Object.keys(next).length === 0 ? void 0 : next);
					return updated;
				});
			};
			/** Edit one checked level's wire spelling; a blank value sends nothing on off and the level name elsewhere. */
			const spellLevel = (key, level, text) => {
				setSelections((current) => {
					const base = current.get(key) ?? editable.get(key)?.efforts;
					if (base === void 0 || !(level in base)) return current;
					const trimmed = text.trim();
					const next = {
						...base,
						[level]: trimmed.length === 0 ? level === "off" ? null : level : trimmed
					};
					const updated = new Map(current);
					updated.set(key, next);
					return updated;
				});
			};
			/**
			* Rename one checked level, keeping its wire spelling. A blank, unknown,
			* or already-checked target is refused — the controlled input stays put, so
			* the draft never carries a key the adapter schema would reject.
			*/
			const renameLevel = (key, oldLevel, newLevel) => {
				const trimmed = newLevel.trim();
				if (trimmed === oldLevel || trimmed.length === 0 || trimmed === "off") return;
				if (!LEVEL_CHOICES.includes(trimmed)) return;
				setSelections((current) => {
					const base = current.get(key) ?? editable.get(key)?.efforts;
					if (base === void 0 || !(oldLevel in base) || trimmed in base) return current;
					const next = { ...base };
					const value = next[oldLevel];
					delete next[oldLevel];
					next[trimmed] = value;
					const updated = new Map(current);
					updated.set(key, next);
					return updated;
				});
			};
			const onSave = async () => {
				setSaving(true);
				const changes = /* @__PURE__ */ new Map();
				for (const [key, model] of editable) if (!effortsEqual(selections.get(key), model.efforts)) changes.set(key, selections.get(key));
				const problem = await props.saveSection(policyReady ? mappingsDraft : false, changes);
				setSaving(false);
				setNotice(problem === void 0 ? {
					kind: "ok",
					text: t("saved")
				} : {
					kind: "error",
					text: problem
				});
			};
			if (piAi.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: section_module_css_default.notice,
				children: t("unavailable")
			});
			const policyReady = policy.status !== "unavailable";
			const writable = piAi.writable;
			const mappingsWritable = policyReady && policy.writable && piAi.writable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: section_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: section_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: section_module_css_default.intro,
						children: t("intro")
					}),
					policyReady ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: section_module_css_default.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: section_module_css_default.label,
								children: t("mappingsToggle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: mappingsDraft ? `${section_module_css_default.toggle} ${section_module_css_default.toggleOn}` : section_module_css_default.toggle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: section_module_css_default.toggleInput,
									checked: mappingsDraft,
									disabled: !mappingsWritable,
									"aria-label": t("mappingsToggle"),
									onChange: (event) => {
										setMappingsDraft(event.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: section_module_css_default.toggleTrack,
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: section_module_css_default.toggleKnob,
										"aria-hidden": true
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: section_module_css_default.hint,
								children: t("mappingsHint")
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: section_module_css_default.notice,
						children: t("mappingsUnavailable")
					}),
					groups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: section_module_css_default.notice,
						children: t("noModels")
					}) : null,
					groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: section_module_css_default.provider,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: section_module_css_default.providerName,
							children: group.name
						}), group.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: section_module_css_default.notice,
							children: t("noModels")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: section_module_css_default.modelList,
							children: group.models.map((model) => {
								const key = `${group.id}\u0000${model.id}`;
								if (editable.get(key) === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: section_module_css_default.modelRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: section_module_css_default.modelName,
										title: model.id,
										children: model.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: section_module_css_default.notice,
										children: t("notEditable")
									})]
								}, model.id);
								const efforts = selections.get(key);
								const checkedLevels = efforts === void 0 ? [] : Object.keys(efforts);
								const pickerOpen = openPicker === key;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: section_module_css_default.modelRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: section_module_css_default.modelName,
											title: model.id,
											children: model.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: section_module_css_default.picker,
											ref: (el) => {
												if (el !== null) pickerRefs.current.set(key, el);
												else pickerRefs.current.delete(key);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: section_module_css_default.pickerButton,
												"aria-expanded": pickerOpen,
												"aria-haspopup": "listbox",
												"aria-label": `${t("modelLevel")} ${model.name}`,
												title: checkedLevels.length === 0 ? void 0 : checkedLevels.join(", "),
												disabled: !writable,
												onClick: () => {
													setOpenPicker(pickerOpen ? void 0 : key);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: section_module_css_default.pickerLabel,
													children: checkedLevels.length === 0 ? t("selectLevels") : t("levelsSelected")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: section_module_css_default.pickerChevron,
													"aria-hidden": true
												})]
											}), pickerOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: menuUp ? `${section_module_css_default.pickerMenu} ${section_module_css_default.pickerMenuUp}` : section_module_css_default.pickerMenu,
												role: "listbox",
												"aria-multiselectable": "true",
												ref: (el) => {
													if (el !== null) menuRefs.current.set(key, el);
													else menuRefs.current.delete(key);
												},
												children: LEVEL_CHOICES.map((level) => {
													const checked = efforts !== void 0 && level in efforts;
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														className: section_module_css_default.pickerItem,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "checkbox",
																className: section_module_css_default.pickerInput,
																checked,
																"aria-label": `${t("modelLevel")} ${model.name} ${level}`,
																onChange: (event) => {
																	toggleLevel(key, level, event.target.checked);
																}
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: checked ? `${section_module_css_default.pickerMark} ${section_module_css_default.pickerMarkChecked}` : section_module_css_default.pickerMark,
																"aria-hidden": true
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: level }),
															level === "off" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: section_module_css_default.pickerNote,
																children: t("offNote")
															}) : null
														]
													}, level);
												})
											}) : null]
										}),
										policyReady && mappingsDraft && checkedLevels.some((level) => level !== "off") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: section_module_css_default.mapList,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: section_module_css_default.mapHead,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: section_module_css_default.mapHeadLevel,
														children: t("mapLevel")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: section_module_css_default.mapArrow,
														"aria-hidden": true,
														children: "→"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: section_module_css_default.mapHeadWire,
														children: t("wireSpelling")
													})
												]
											}), checkedLevels.filter((level) => level !== "off").map((level) => {
												const spelling = efforts?.[level];
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: section_module_css_default.mapRow,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
															className: section_module_css_default.mapLevel,
															type: "text",
															value: level,
															"aria-label": `${t("mapLevel")} ${model.name}`,
															disabled: !mappingsWritable,
															onChange: (event) => {
																renameLevel(key, level, event.target.value);
															}
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: section_module_css_default.mapArrow,
															"aria-hidden": true,
															children: "→"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
															className: section_module_css_default.mapWire,
															type: "text",
															value: spelling === void 0 || spelling === null ? "" : spelling,
															placeholder: level === "off" ? t("wireOff") : level,
															"aria-label": `${t("wireSpelling")} ${model.name} ${level}`,
															disabled: !mappingsWritable,
															onChange: (event) => {
																spellLevel(key, level, event.target.value);
															}
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: section_module_css_default.mapRemove,
															"aria-label": t("removeLevel"),
															disabled: !mappingsWritable,
															onClick: () => {
																toggleLevel(key, level, false);
															},
															children: "✕"
														})
													]
												}, level);
											})]
										}) : null
									]
								}, model.id);
							})
						})]
					}, group.id)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: section_module_css_default.footer,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: section_module_css_default.spacer }),
							notice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: notice.kind === "ok" ? section_module_css_default.noticeOk : section_module_css_default.noticeError,
								children: notice.text
							}),
							dirty && notice === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: section_module_css_default.noticeDirty,
								children: t("dirty")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								disabled: !dirty || saving || !writable,
								onClick: () => {
									setMappingsDraft(policy.section.enableMappings);
									setSelections(new Map([...editable].map(([key, model]) => [key, model.efforts])));
									setNotice(void 0);
								},
								children: t("discard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: !dirty || saving || !writable,
								onClick: () => {
									onSave();
								},
								children: saving ? t("saving") : t("save")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Locale dictionaries for the thinking-level-override settings page.
		*
		* @module dsh-thinking-level-override/client/locales
		*/
		/** Simplified Chinese product copy. */
		const zh = {
			nav: "思考等级",
			title: "思考等级",
			intro: "勾选每个模型可提供的思考等级——对话的模型选择器只会显示这些选项，具体选哪个等级也在那里选。打开「思考等级映射」可编辑各等级实际发送的值（off 留空 = 发送空值）。",
			unavailable: "设置服务不可用，无法编辑该插件配置。",
			noModels: "暂无模型目录。",
			notEditable: "该模型不支持自定义思考等级",
			wireSpelling: "发送值",
			wireOff: "留空 = 发送空值",
			mapLevel: "等级",
			removeLevel: "删除该等级",
			mappingsToggle: "思考等级映射",
			mappingsHint: "关闭时仅隐藏发送值编辑区，已保存的等级与发送值仍然生效。",
			mappingsUnavailable: "设置服务未暴露该插件的命名空间，思考等级映射不可用；等级勾选不受影响。",
			modelLevel: "思考级别",
			selectLevels: "选择等级",
			levelsSelected: "已选择",
			offNote: "关闭思考",
			unsetLevel: "不设置",
			dirty: "有未保存的修改",
			discard: "还原",
			save: "保存",
			saving: "保存中…",
			saved: "已保存，下个请求生效"
		};
		/** English copy (the key-set source of truth for this pair). */
		const en = {
			nav: "Thinking levels",
			title: "Thinking levels",
			intro: "Check the thinking levels each model offers — the model picker in a conversation shows exactly these, and choosing one happens there. With Thinking level mappings on, edit the value actually sent for each level (blank off = send nothing).",
			unavailable: "The settings service is unavailable; this plugin cannot be edited here.",
			noModels: "No model catalog available.",
			notEditable: "This model does not support custom thinking levels",
			wireSpelling: "Wire value",
			wireOff: "blank = send nothing",
			mapLevel: "Level",
			removeLevel: "Remove this level",
			mappingsToggle: "Thinking level mappings",
			mappingsHint: "While off, only the spelling editor is hidden; saved levels and spellings stay in effect.",
			mappingsUnavailable: "The settings service does not expose this plugin's namespace, so thinking level mappings are unavailable; level selection still works.",
			modelLevel: "Thinking level",
			selectLevels: "Select levels",
			levelsSelected: "Selected",
			offNote: "disables thinking",
			unsetLevel: "Unset",
			dirty: "Unsaved changes",
			discard: "Discard",
			save: "Save",
			saving: "Saving…",
			saved: "Saved; effective on the next request"
		};
		//#endregion
		//#region src/client/index.ts
		/** Locale dictionary namespace owned by this section. */
		const NS = "thinking-level-override";
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/**
		* Mount the thinking-level-override settings section.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "thinking-level-override: section dictionaries");
			const connection = ctx.get("connection");
			const controller = new ThinkingOverrideSectionController(ctx.settingsScope.bind({ namespace: THINKING_OVERRIDE_NS }), ctx.settingsScope.bind({ namespace: LLM_PI_AI_NS }), connection.api);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "thinking-level-override",
				order: 12,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					hooks: {
						thinkingOverridePolicy: controller.policySource,
						piAiSection: controller.piAiSource
					},
					api: connection.api,
					saveSection: (enableMappings, changes) => controller.save(enableMappings, changes)
				})
			}, ThinkingOverrideSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map