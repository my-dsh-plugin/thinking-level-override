# thinking-level-override

[English](README.md) | 中文

自主覆盖与调整第三方模型的思考等级，修复工具内置预设缺失或不匹配的问题。这是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。

第三方模型经由适配器的内置目录接入 harness，其中的推理预设并不总与事实相符：选择器给出了模型实际不支持的等级、会话在切换模型后继承了旧的思考等级、或者部署方就是想给整条路由固定一个等级。默认情况下，这类请求会在到达供应商之前以 `UNSUPPORTED_REASONING_EFFORT` 失败。本插件拦截请求配置，按规则改写推理等级（reasoning effort），自动修复不可用的等级而不是让请求失败。

## 快速开始

两种用法，可同时使用：

**A. 在 Web 设置页面勾选等级（不用写 YAML）。** 打开 Web GUI → **设置 → 思考等级**（"模型"正下方）。为每个模型勾选它实际能提供的等级，点**保存**。对话的模型选择器从此只显示这些等级——具体选哪个等级仍在对话框里选。页面会替你把每个模型的 `reasoningEfforts` 写进 `settings.yaml` 的 `llm-pi-ai` 段。

**B. 用 YAML 写覆盖规则。** 规则可以按供应商/模型强制、默认或重映射等级，并修复模型提供不了的等级：

```yaml
thinking-level-override:
  rules:
    # openrouter 上的 kimi-k2 系列预设上报有误：一律用 high。
    - provider: openrouter
      models: ['kimi-k2*']
      effort: high
    # acme-gateway 用另一套词表：重命名等级，默认 medium。
    - provider: acme-gateway
      map:
        max: high
        xhigh: high
      default: medium
    # legacy-gw 无法服务继承来的等级：直接移除，而不是报错。
    - provider: legacy-gw
      onUnsupported: drop
```

规则是热加载的：写入 `settings.yaml` 后，下一个请求即生效，无需重启。

## 工作原理

插件监听 `agent/request` 瀑布事件——冻结调用配置的文档化拦截点——在 LLM 服务按模型能力校验之前改写已解析的 `LlmCallConfig`。监听器以 `prepend` 方式注册，位于瀑布最外层，对模型选择等后续监听器拥有最终决定权。循环按常规 `request/header` 路径记录改写后的配置，因此每次覆盖都是持久的，可从会话日志重建。

每个请求的处理流程：

1. 第一条匹配 `provider`（精确匹配）与 `model`（`*` 通配符）的规则生效；后续规则忽略。
2. 提议目标等级：规则的强制 `effort` 最优先，其次是请求自身的等级（若规则声明了 `map` 则先重映射），最后是规则的 `default`。
3. 在 `clamp` 或 `drop` 策略下，插件通过 `ctx.llm.resolveModelInfo()` 读取目标模型的真实能力。模型支持该等级则保留；不支持则按策略修复；模型未声明任何推理能力则移除该等级。能力读取失败时请求原样放行，由 LLM 服务兜底裁决。

## 安装

需要已安装的 `dsh`（开发者预览版）。

**从本目录安装**（以链接方式安装——之后你本地 `pnpm run build` 的改动立即生效）：

```sh
dsh plugin --profile <名称> add ./thinking-level-override
```

将 `<名称>` 换成你的 profile 名，例如 `web`。

**从 git 安装**——pnpm 拉取源码并执行 `prepare` 构建；首次按 pnpm 提示在 profile 的 `pnpm-workspace.yaml` 中允许构建：

```sh
dsh plugin --profile <名称> add github:<you>/thinking-level-override
```

```yaml
allowBuilds:
  dsh-thinking-level-override: true
```

**本地迭代、不安装**，可用 `--patch` 覆盖层直接加载源码（或构建产物）：

```yaml
- insert:
    - id: thinking-level-override
      name: '/absolute/path/to/thinking-level-override/src/index.ts'
      config:
        rules:
          - provider: acme-gateway
            effort: high
```

安装后重启 Web 应用，设置里即出现 **"思考等级"** 条目。

### DeepSeek Harness Desktop(桌面端)一键安装

桌面端用户无需 `dsh` CLI 或 harness checkout。在**普通终端**执行一次(不要在 App 自带的
harness 会话里跑——那里的应用安装目录和 App 数据目录是沙箱/只读的,macOS 尤其如此):

```sh
bash <(curl -Ls https://raw.githubusercontent.com/my-dsh-plugin/thinking-level-override/main/scripts/install-desktop.sh) --restart
```

脚本幂等:从 GitHub 拉取插件(预编译 `lib/`,无需构建);若需要则把
`"thinking-level-override"` 加入内嵌 harness 的 `WEB_SETTINGS_NAMESPACES` 白名单;装入桌面
web profile 并注册 bundle;`--restart` 重启 App。之后设置里出现 **"思考等级"** 条目。
可用环境变量覆盖:`DSH_DESKTOP_APP`、`DSH_DESKTOP_HOME`、`DSH_SKILL_SOURCE_DIR`。

> 使用已发布桌面包的最终用户无需任何手动步骤 —— 升级重启即可;插件已 seed,白名单已在
> 随包 harness 中。

## Web 设置页面

![思考等级设置页](assets/settings-full.png)

本包同时提供浏览器端（`dsh.client` 声明 + `./client` 入口），在 Web 设置导航的 **"模型"** 正下方渲染 **"思考等级"** 条目。

### 勾选可提供的等级

1. 打开 **设置 → 思考等级**。
2. 每个模型右侧有等级选择器，点开后勾选该模型能提供的等级——勾选标记是裸对勾，无边框。`off` 表示"关闭思考"，会单独标注。
3. 点右下角**保存**。对话的模型选择器从此只显示勾选的等级；具体选哪个等级仍在对话框里选。

取消勾选即移除该等级；全部取消则恢复模型继承的默认行为。页面只写 `reasoningEfforts` 字段，模型条目本身（id、名称、上下文窗口等）不会被改动。

### 编辑发送值（思考等级映射）

有些网关使用自己的等级词表。打开**"思考等级映射"**开关（默认关闭）后，每个已勾选的等级旁边会出现内联文本框，填写该等级实际发送的值——默认是等级名，`off` 显示为空白（发送空值）：

```yaml
# 页面写入的内容：off 勾选（留空）、high 勾选并填 "high"、
# max 勾选并填 "ultra"（选择器显示 max，请求发送 ultra）
llm-pi-ai:
  providers:
    qwen-token-plan-cn:
      models:
        - id: qwen3.8-max-preview
          reasoningEfforts:
            off:
            high: high
            max: ultra
```

已有手写拼写会被保留——只有新勾选的等级才写入等级名作为默认拼写，非 off 等级留空时回退为等级名。两个来自适配器 schema 的约束：键必须是七个等级之一（pi-ai 的等级集 `off/minimal/low/medium/high/xhigh/max`——像 `ultra` 这样的键会在写入时被拒绝），且只有 `off` 允许留空值（发送空值）。关闭开关只是隐藏编辑区，已保存的等级与发送值继续生效。`settings.yaml` 仍是权威文档；页面通过同一缝隙写入。

> **仅"思考等级映射"编辑器需要：设置暴露白名单。** Web 客户端只能看到并编辑 harness API 网关明确允许的设置命名空间，`dsh-host-apiproxy` 把该边界硬编码在 `WEB_SETTINGS_NAMESPACES`。等级勾选写入的是 pi-ai 命名空间（属于模型供应商，默认就在边界内），**不打补丁也能用**；只有"思考等级映射"开关和编辑区存放在插件自己的命名空间里——不打补丁时页面优雅降级：开关位置显示一条提示，等级勾选照常工作，规则也仍可通过 `settings.yaml` 热加载编辑。要启用映射编辑器，在 checkout 的 `packages/host/apiproxy/src/api-proxy.ts` 数组中加入 `'thinking-level-override'`，重建并从该 checkout 启动 GUI：

```sh
cd ../deepseek-harness
pnpm run build
pnpm dsh web
```

如果 GUI 由 `npx @deepseek-ai/dsh` 启动，则需在 npx 安装的构建产物里做同样的修改：

```
~/.npm/_npx/<hash>/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js
```

找到 `WEB_SETTINGS_NAMESPACES = [` 数组，加入 `"thinking-level-override",`，保存后重启 GUI。注意 npm 重新拉取包缓存会还原此修改。

## 配置

| 字段 | 含义 | 默认值 |
|---|---|---|
| `enableMappings` | Web 设置页"思考等级映射"编辑器的总开关 | `false` |
| `onUnsupported` | 模型无法提供该等级时的处理：`fail` 保持 harness 原有行为（默认——模型自带兼容层）、`clamp` 就近取可用等级、`drop` 从请求中移除 | `fail` |
| `rules` | 按优先级排列的覆盖规则 | `[]` |

每条规则：

| 字段 | 含义 |
|---|---|
| `provider` | 规则管辖的精确供应商路由（必填） |
| `models` | 模型 id 通配符（`*`）；缺省或为空表示管辖该路由的全部模型 |
| `effort` | 对每个匹配请求强制使用该等级，替换任何已有选择 |
| `default` | 请求未指定等级时使用该等级 |
| `map` | 在能力校验前重写请求的等级（`请求值: 替换值`） |
| `onUnsupported` | 覆盖全局策略的单规则策略 |

规则必须至少声明 `effort`、`default`、`map`、`onUnsupported` 之一，否则插件加载失败。

### 配置示例

对预设上报能力有误的模型系列强制固定等级：

```yaml
thinking-level-override:
  rules:
    - provider: openrouter
      models: ['kimi-k2*']
      effort: high
```

重命名网关词表不接受的等级，并给新对话默认 medium：

```yaml
thinking-level-override:
  rules:
    - provider: acme-gateway
      map:
        max: high
        xhigh: high
      default: medium
```

绝不让继承来的等级破坏某条路由的请求：

```yaml
thinking-level-override:
  rules:
    - provider: legacy-gw
      onUnsupported: drop
```

## 动态配置（settings）

插件注册了 `thinking-level-override` 设置命名空间，schema 用其 `Config`，以 `cordis.yml` 条目为组合基线——与 `dsh-llm-pi-ai` 使用同一缝隙。用户设置层因此可以热编辑规则，无需重启：把段写入 `settings.yaml`（即 Web UI 编辑的设置文档），下一个请求即生效。

```yaml
thinking-level-override:
  onUnsupported: clamp
  rules:
    - provider: qwen-token-plan-cn
      models: ['qwen3.8-max-preview']
      effort: xhigh
```

被 schema 或规则校验拒绝的写入会在写入处报错，上一次的合法段继续服务。未挂载设置服务时，仅由入口配置驱动插件，行为不变。

## 卸载

1. **从 profile 移除插件：**

```sh
dsh plugin --profile <名称> remove dsh-thinking-level-override
```

2. **清理设置文档。** 打开 `settings.yaml`，删除 `thinking-level-override:` 段（插件移除后其中规则自然失效，但留着既无害也易混淆）。可选：如果想把模型恢复为继承的等级预设，同时删除设置页在 `llm-pi-ai.providers.<路由>.models` 下写入的 `reasoningEfforts` 块。

3. **如果当初用 `--patch` 覆盖层安装**，从 patch 文件中删除对应 `insert` 条目即可，跳过第 1–2 步。

4. **重启 Web 应用。** 设置里的 **"思考等级"** 条目消失。

5. **可选：** 如果只为这个插件改过 harness 的 `WEB_SETTINGS_NAMESPACES`（见 [Web 设置页面](#web-设置页面)），可还原该修改。

## 常见问题

**对话报 `UNSUPPORTED_REASONING_EFFORT`。** 目标模型无法提供请求的等级。要么在 **设置 → 思考等级** 里取消勾选该模型的对应等级，要么加一条规则：强制一个支持的等级（`effort`）、把不支持的等级重映射掉（`map`）、或直接移除（`onUnsupported: drop`）。

**`llm-pi-ai: provider "X" sets modelOverrides for "Y" beside a models list`。** pi-ai 拒绝一个供应商同时声明 `models` 列表和 `modelOverrides` 字典——声明了 `models` 列表时，所有字段必须写在列表条目自身上。把覆盖条目里的字段合并进对应的 `models` 条目，然后删除 `modelOverrides` 块。

**设置页显示"设置服务不可用"。** 页面在插件命名空间未暴露时会降级：等级勾选照常可用，只有"思考等级映射"开关位置显示不可用提示（白名单默认放行 llm-pi-ai 等模型供应商命名空间）。要使用映射编辑器，按 [Web 设置页面](#web-设置页面) 的说明打补丁；打补丁前直接编辑 `settings.yaml` 即可，规则两种方式都热加载。

**勾选并保存了，但对话的选择器里没有等级选项。** 先确认页面提示"已保存"，再检查 `settings.yaml` 里 `llm-pi-ai.providers.<路由>.models.<id>` 下是否有 `reasoningEfforts` 块——它写在该模型自己的条目里，而不是 `modelOverrides` 块。然后重启 Web 应用让目录重新加载。

**git 安装时提示 `allowBuilds`。** pnpm 会拦截 git 安装包的 `prepare` 构建；把提示的键加进 profile 的 `pnpm-workspace.yaml` 后重新安装。

## 就近夹取（clamp）

夹取距离按标准升级阶梯度量：`off < minimal < low < medium < high < xhigh < max`（pi-ai 的等级集合，是 DeepSeek 适配器 `off`/`high`/`max` 的超集）。距离相同时取较低等级。请求的等级不在阶梯内时取模型提供的最高等级；适配器提供的阶梯外等级排在所有已知等级之后，保持适配器上报顺序。

## 范围与限制

- 只管辖经 agent 循环 `agent/request` 瀑布分发的会话请求（含子代理）。自带配置直接调用 `ctx.llm.stream()` 的场景（会话标题、压缩）不受影响。
- 无法赋予适配器未声明的推理能力：目录条目不含推理元数据的模型，在 `clamp`/`drop` 下会被移除一切等级，在 `fail` 下照常失败。wire 层的预设修复（可选等级及其拼写）属于适配器自身的配置——对 `@deepseek-ai/dsh-llm-pi-ai` 而言是其 settings 段的 `modelOverrides` 与 `reasoningEfforts` 字段。
- 第一条匹配的规则生效；重叠规则不合并。
- `onUnsupported: fail` 下，强制/映射/默认等级不做能力校验直接应用，配置错误会在 LLM 服务处响亮失败。
- 设置段可通过 settings 文档编辑（`settings.yaml` 中的 `thinking-level-override:` 键）并可通过 `settings.describe` 发现。页内编辑器还需 [Web 设置页面](#web-设置页面) 一节所述的白名单补丁；不打补丁时通过 `settings.yaml` 编辑依然完全可用、热加载生效。

## 开发

本仓库依赖同级目录的 `deepseek-harness` checkout（../deepseek-harness），且该 checkout 需完成源码运行路径（`pnpm install`）。类型检查通过工程引用将 harness 包解析到该 checkout 的源码；测试使用真实的 `LlmRuntime` 服务与桩适配器，并按 agent 循环的方式通过作用域载体分发 `agent/request`。

```sh
pnpm install
pnpm test        # vitest：引擎、schema、控制器与插件集成四组测试
pnpm typecheck   # tsc -b，基于 harness checkout 校验 src + tests
pnpm build       # tsc 声明 + tsdown 打包到 lib/
```

`prepare` 脚本为 git 安装自包含地构建 `src/`，不依赖 harness checkout，也不做类型检查。

### AI 辅助开发

本项目的代码主要由 AI 编码助手生成——具体是运行在 DeepSeek Harness 中的 DeepSeek V4 Flash。维护者负责产品方向、需求与测试验证；所有改动在发布前均经过审查，并由测试套件覆盖。

## 许可证

[Apache-2.0](LICENSE)
