# dsh-client-ui-toolbox（工具集合器 / Toolbox）

**语言 / Language：** [中文](#中文) · [English](#english)

---

# 中文

把 DSH Web 输入框工具行里**第三方插件注册的控件**收进一个带搜索框的下拉菜单，只留一个
工具箱入口按钮；官方自带控件（附件、加号、计划、模型选择器、发送）不在收纳范围内，保持原样。

## 收纳范围

只动两个扩展位，其他区域一律不碰：

| 槽 | 会收到什么 | 是否收纳 |
| --- | --- | --- |
| `conversation.input.left` | 第三方插件注册的控件（如截图插件的剪刀按钮） | ✅ |
| `conversation.input.right` | 第三方插件注册的控件（如浏览器面板按钮） | ✅ |
| `conversation.input.plan` / `.model` / 附件 / 发送 | 官方控件 | ❌ 原样不动 |

判定方式是"槽位归属"而不是包名：这两个 list 槽是留给扩展的座位，官方控件走各自的单槽。
因此以后新装的插件只要注册到这里，会自动出现在菜单里（名字优先按已知指纹匹配，匹配不到就用
DOM 上的 `aria-label` / `title` / 文本）。

## 收起是怎么做到的

React 子树不能跨插件转移，所以不做"搬节点"，而是**原节点原地压成 0 尺寸并隐藏**：

- 条目本身是 `<button>`：清空底板 + 0 尺寸 + `overflow:hidden`（字形被裁掉）；
- 条目是容器（内含按钮，还有自己的弹层）：原地绝对定位回它原来的屏幕位置，压成 0 尺寸，
  隐藏参与排版的子节点，但**保留 absolute/fixed 的弹层**——所以点开第三方自己的菜单时，
  弹层照常出现在它原来的位置附近。

菜单行代替用户去点原按钮（`element.click()`），因此第三方插件的原有逻辑、浮层、状态全部照旧，
本插件不复制、不重写任何第三方行为。

> 如果某个第三方按钮没被收进去，多半是它的根节点里没有 `<button>`。见「排障」。

## 目录与两个半边（`lib/index.js` 不能删）

```
lib/index.js       宿主半边 —— 内容只有空的 export function apply() {}，但【必须存在】
lib/client.js      浏览器半边 —— 全部功能都在这里
cordis.patch.yml   向 profile 插一行插件
```

**为什么一个"什么都没干"的文件不能删**：DSH 的 client-modules 是在**宿主 Loader 的插件行**里
去找 `dsh.client` 声明的。`lib/index.js` 存在的唯一意义，就是让这个包作为一行宿主插件被装载，
从而让扫描发现 `package.json` 里的 `dsh.client.platform: 'web'`，进而把 `lib/client.js` 组装进
`window.__DSH_BOOT__`。

删掉它（或删掉 `cordis.patch.yml` 里那一行）之后：**浏览器半边完全不加载，而且不会有任何报错** ——
页面上只是"什么都没发生"。这是本插件最难排查的一种故障，所以它留在这里，也写在这里。

## 安装 / 卸载

本仓库**不需要构建**（`lib/client.js` 与 `lib/index.js` 都是手写源码），放哪个目录都行，
只要 dsh 进程读得到。

```powershell
# 1. 先确认 profile 名 —— profiles 下的目录名就是 profile 名
Get-ChildItem "$env:DSH_HOME\profiles" -Directory | Select-Object -ExpandProperty Name

# 2. 安装：<PROFILE> 换成上面的名字，<PLUGIN_DIR> 换成本仓库所在的绝对路径
#    ⚠️ Windows 下 link: 后面要用正斜杠 /，不要用反斜杠
pnpm dsh plugin --profile <PROFILE> add "link:<PLUGIN_DIR>"
#    例：pnpm dsh plugin --profile web add "link:D:/tools/dsh-client-ui-toolbox"

# 3. 卸载
pnpm dsh plugin --profile <PROFILE> remove dsh-client-ui-toolbox
```

- `$env:DSH_HOME` 没设的话默认就是 `~/.dsh`（Windows：`C:\Users\<你>\.dsh`）。
- profile 不存在时，`dsh plugin --profile <名字> add <包>` 会一并把它建出来。
- `dsh plugin` 会把声明了 `dsh.bundle.patch` 的依赖自动加进 `dsh.profile.bundles`。

**装完必须重启 `dsh web`**（客户端模块图在启动时组装），然后刷新页面。

> 本插件**只作用于输入框工具行里的第三方控件**。一个这类插件都没装时，
> 工具箱入口会显示为「暂无可收纳的工具」——这是正常的，不是装失败。

## 排障

浏览器控制台里：

```js
__DSH_TOOLBOX__.build     // 页面当前跑的是哪一版（改完存盘后用来确认热重载到位）
__DSH_TOOLBOX__.report()  // 当前收了哪些工具（座位 / 名字 / 是否禁用）
__DSH_TOOLBOX__.rescan()  // 重新扫描并返回条目数
```

日志前缀是 `[toolbox]`。若某个第三方按钮没被收进去，多半是它的根节点里没有 `<button>`
（`report()` 里看不到它），此时把它的类名指纹补进 `lib/client.js` 的 `KNOWN` 或者直接看
`[data-tbx-collected]` 标记。

## 可选的第三方适配（源码里的 A 段）

`lib/client.js` 顶部用注释明确分成了两块：**A 段是"为特定第三方插件做的适配"，与"收纳"这个
核心能力无关**；A 段以下才是通用收纳逻辑。想减少耦合、或想把它给别人用，只动 A 段即可：

| 开关 | 关掉之后 |
| --- | --- |
| `KNOWN` 清空成 `[]` | 名字退回读 DOM 上的 `aria-label` / `title`，功能照旧，只是不好看 |
| `ADAPT_BROWSER_SCOPE = false` | 下面 A3 那段只服务 `dsh-browser-scope` 的 CSS 不再注入 |

### A3. 底板对齐工具栏（针对 dsh-browser-scope）

磨砂玻璃主题（`dsh-client-ui-frosted-glass`）把 `--dsw-alias-bg-base` 覆盖成约 **0.36 不透明**的
rgba，而 `dsh-browser-scope` 的底板直接用这个 token、自己又没有 `backdrop-filter` —— 正文会清清楚
楚透上来、也没有工具栏那种磨砂质感。这里把它的底板换成**工具栏同款配方**：

```
background-color: var(--dsw-specific-input-major)   /* 输入框卡片用的同一个表面 token */
backdrop-filter: blur(var(--frosted-blur)) saturate(var(--frosted-saturate))   /* 同一套磨砂参数 */
```

- **作用对象**：右侧栏的浏览器面板，及其内部浮层（扩展弹窗、扩展列表、实况控制面板、确认框、
  错误条）；以及被工具箱收起的那个控制按钮弹出的控制器菜单。
- **不触碰**：全局 token、主题、官方面板与官方控件。
- **调节**：改 `lib/client.js` 里那段 CSS 的 token/模糊参数即可；玻璃主题没装时退回 `18px/160%`。
- 该类名带 CSS 模块哈希前缀（`WKhQka_`）：浏览器插件升级换哈希后本段**自动失效**（不会帮倒忙），
  届时把新前缀抄进选择器即可。

### 第三方弹层"点空白处 / Esc 自动收起"（通用规则，不针对任何具体插件）

有些第三方弹层只有"再点一次按钮"才关（作者没做点外关闭）。本插件复用**它自己的开关**：
按钮的 `aria-expanded === 'true'` 时，在文档级 `pointerdown`（点在任何不属于该弹层的地方）
或 `Esc` 时替用户再点一次那个按钮，走它自己的 `closeMenu()` —— 不复制、不改写它的逻辑。
点在它自己弹层内部的交互一律放过。

- 因此打开我们的工具箱、点输入框、点聊天区，都会顺手把那类弹层收起来。
- 对任何"按钮用 `aria-expanded` 反映弹层开合"的第三方控件都同样生效（通用规则）。

## 开发

```bash
npm run check          # node --check 两个半边 + 校验 client.js 的 VERSION 与 package.json 一致
node tests/smoke.mjs   # jsdom + 真实 React，33 项检查
```

冒烟测试需要本机有一份 DSH 源码 checkout（提供 jsdom / react / react-dom）。用环境变量
`DSH_CHECKOUT` 指向你的 checkout 根目录：

```powershell
$env:DSH_CHECKOUT = '<你的 DSH 源码目录>'; node tests/smoke.mjs
```

没设或路径不对时，测试会直接列出缺了哪些依赖并告诉你该设什么，而不是抛一个看不懂的模块错误。

它覆盖了：收起第三方控件、菜单开关、搜索过滤、点菜单项转发到第三方原按钮、重扫幂等、
A3 底板规则不误伤别的面板、第三方弹层自动收起，以及**空态**（一个第三方控件都没有时
入口仍在并给出解释）。

`lib/client.js` 里的 `VERSION` 必须与 `package.json` 的 `version` 一致——`npm run check` 会校验。
这样页面上 `__DSH_TOOLBOX__.build` 报的版本才是可信的。

## 已知边界

- 依赖第三方控件的 DOM 结构（是否有 `<button>`、弹层是否为 absolute 子节点、开合是否反映在
  `aria-expanded`）。第三方插件大改结构后可能需要跟着调一次。
- 被收起的按钮仍在 DOM 里（只是不可见、不占位），这是"点了还能用"的前提。
- 冒烟测试的假 DOM 是照着作者的插件组合搭的（含它们 CSS 模块的哈希前缀），因为它验证的 A1
  指纹与 A3 底板补丁本来就是为那些插件写的。换一套第三方插件时 fixture 要跟着换——但"收纳"
  本身的检查与具体插件无关。

---

# English

Collects the **controls that third-party plugins register in the DSH Web composer tool row** into a
single searchable dropdown, leaving one toolbox button behind. Shipped controls (attachments, plus,
plan, model selector, send) are out of scope and stay exactly where they are.

## What it collects

Only two extension seats are touched; nothing else is:

| Slot | What lands there | Collected |
| --- | --- | --- |
| `conversation.input.left` | controls registered by third-party plugins (e.g. the screen-capture scissors button) | ✅ |
| `conversation.input.right` | controls registered by third-party plugins (e.g. a browser-panel button) | ✅ |
| `conversation.input.plan` / `.model` / attachments / send | shipped controls | ❌ untouched |

Membership is decided by **which slot a control lives in**, not by package name: those two list
slots are the seats reserved for extensions, while shipped controls use their own single slots.
Any plugin installed later that registers there shows up in the menu automatically. Names are
matched against known fingerprints first and fall back to the DOM's `aria-label` / `title` / text.

## How collapsing works

A React subtree cannot be moved across plugins, so instead of relocating nodes the plugin
**collapses the original node in place to zero size and hides it**:

- A node that *is* a `<button>`: backplate cleared, zero size, `overflow:hidden` (the glyph is clipped).
- A container node (holding a button plus its own popup): absolutely positioned back at its original
  on-screen location and collapsed to zero size. In-flow children are hidden, but **absolute/fixed
  popups are kept** — so opening that plugin's own menu still shows it where it always appeared.

Menu rows click the original button for you (`element.click()`), so the third-party plugin's own
logic, overlays and state all keep working. This plugin copies and rewrites none of it.

> If a third-party button is not collected, its root node most likely contains no `<button>`.
> See Troubleshooting.

## Layout and the two halves (`lib/index.js` must not be deleted)

```
lib/index.js       host half    — an empty `export function apply() {}`, but it MUST exist
lib/client.js      client half  — all functionality lives here
cordis.patch.yml   inserts one plugin row into the profile
```

**Why a file that "does nothing" cannot be deleted**: DSH's client-modules looks for the
`dsh.client` declaration on **rows of the host Loader**. The only purpose of `lib/index.js` is to
make this package load as a host plugin row, so that the scan discovers
`dsh.client.platform: 'web'` in `package.json` and composes `lib/client.js` into
`window.__DSH_BOOT__`.

Delete it (or the row in `cordis.patch.yml`) and **the browser half never loads — with no error at
all**. The page simply does nothing. That is the hardest failure mode in this plugin to diagnose,
which is why it stays here and is documented here.

## Install / Uninstall

There is **no build step** (`lib/client.js` and `lib/index.js` are hand-written source). Put the
directory anywhere the dsh process can read.

```powershell
# 1. Find your profile name — the directory name under profiles/ IS the profile name
Get-ChildItem "$env:DSH_HOME\profiles" -Directory | Select-Object -ExpandProperty Name

# 2. Install: replace <PROFILE> and <PLUGIN_DIR> (absolute path to this repo)
#    WARNING: on Windows the path after `link:` must use forward slashes
pnpm dsh plugin --profile <PROFILE> add "link:<PLUGIN_DIR>"
#    e.g. pnpm dsh plugin --profile web add "link:D:/tools/dsh-client-ui-toolbox"

# 3. Uninstall
pnpm dsh plugin --profile <PROFILE> remove dsh-client-ui-toolbox
```

- If `$env:DSH_HOME` is unset it defaults to `~/.dsh` (on Windows: `C:\Users\<you>\.dsh`).
- A missing profile is created by `dsh plugin --profile <name> add <package>`.
- `dsh plugin` adds any dependency declaring `dsh.bundle.patch` to `dsh.profile.bundles` automatically.

**You must restart `dsh web` afterwards** (the client module graph is assembled at startup), then refresh the page.

> This plugin **only acts on third-party controls in the composer tool row**. With no such plugin
> installed, the toolbox entry shows 「暂无可收纳的工具」 (nothing to collect yet) — that is normal,
> not a failed install.

## Troubleshooting

In the browser console:

```js
__DSH_TOOLBOX__.build     // which build the page is running (confirm hot reload landed)
__DSH_TOOLBOX__.report()  // what is currently collected (seat / name / disabled)
__DSH_TOOLBOX__.rescan()  // rescan and return the item count
```

Log prefix is `[toolbox]`. If a third-party button is not collected, its root node most likely
contains no `<button>` (it won't appear in `report()`); add its class fingerprint to `KNOWN` in
`lib/client.js`, or inspect the `[data-tbx-collected]` marker directly.

## Optional third-party adaptations (section "A" in the source)

The top of `lib/client.js` is split by comment into two parts: **section A holds adaptations for
specific third-party plugins and has nothing to do with collection itself**; everything below it is
the generic logic. To reduce coupling — or to hand this to someone else — only touch section A:

| Switch | Effect when turned off |
| --- | --- |
| empty `KNOWN` (`[]`) | names fall back to the DOM's `aria-label` / `title`; everything still works, it just looks plainer |
| `ADAPT_BROWSER_SCOPE = false` | the CSS below (A3) that only serves `dsh-browser-scope` is no longer injected |

### A3. Aligning a backplate with the toolbar (for dsh-browser-scope)

The frosted-glass theme (`dsh-client-ui-frosted-glass`) overrides `--dsw-alias-bg-base` with an
rgba at roughly **0.36 opacity**, while `dsh-browser-scope`'s backplate consumes that token directly
and has no `backdrop-filter` of its own — body text shows straight through and the frosted look is
missing. This replaces its backplate with **the toolbar's own recipe**:

```
background-color: var(--dsw-specific-input-major)   /* the same surface token the input card uses */
backdrop-filter: blur(var(--frosted-blur)) saturate(var(--frosted-saturate))   /* the same frosted params */
```

- **Applies to**: the browser panel in the right sidebar and its inner overlays (extension popup,
  extension list, live control panel, confirm dialog, error bar), plus the controller menu opened by
  the control button this toolbox collapsed.
- **Does not touch**: global tokens, the theme, shipped panels or shipped controls.
- **Tuning**: edit the tokens / blur values in that CSS block in `lib/client.js`; without the glass
  theme it falls back to `18px/160%`.
- Those class names carry a CSS-module hash prefix (`WKhQka_`): when that plugin upgrades and the
  hash changes, this block **silently stops applying** (it never does harm) — copy the new prefix
  into the selectors then.

### Dismissing third-party popups on outside-click / Esc (generic rule, not tied to any plugin)

Some third-party popups only close when you click their button again. This plugin reuses **the
plugin's own switch**: while a button reports `aria-expanded === 'true'`, a document-level
`pointerdown` (anywhere outside that popup) or `Esc` clicks that button once more on the user's
behalf, driving its own `closeMenu()`. Nothing is copied or rewritten, and interaction inside the
popup itself is passed through untouched.

- So opening our toolbox, clicking the input, or clicking the chat area tidies those popups away.
- Works for any third-party control that reflects its popup state through `aria-expanded`.

## Development

```bash
npm run check          # node --check both halves + verify client.js VERSION matches package.json
node tests/smoke.mjs   # jsdom + real React, 33 checks
```

The smoke test needs a local DSH source checkout (it provides jsdom / react / react-dom). Point
`DSH_CHECKOUT` at your checkout root:

```powershell
$env:DSH_CHECKOUT = '<your DSH source checkout>'; node tests/smoke.mjs
```

If it is unset or wrong, the test lists exactly which dependencies are missing and what to set,
instead of throwing an opaque module error.

It covers: collapsing third-party controls, the menu toggle, search filtering, menu rows
forwarding clicks to the real third-party button, idempotent rescans, the A3 backplate rule not
leaking onto unrelated panels, automatic popup dismissal, and the **empty state** (with nothing to
collect, the entry stays visible and explains itself).

`VERSION` in `lib/client.js` must match `version` in `package.json` — `npm run check` enforces it,
so the version reported by `__DSH_TOOLBOX__.build` in the page can be trusted.

## Known limits

- It depends on third-party DOM structure (whether a root has a `<button>`, whether popups are
  absolute children, whether open/closed state is reflected in `aria-expanded`). A large structural
  change in a third-party plugin may need a follow-up adjustment here.
- Collapsed buttons remain in the DOM (invisible and taking no space) — that is the precondition for
  "clicking it still works".
- The smoke test's fixture DOM mirrors the author's plugin combination (including those CSS-module
  hash prefixes), because the A1 fingerprints and the A3 backplate patch were written for them. A
  different set of third-party plugins means a different fixture — the collection checks themselves
  are plugin-agnostic.
