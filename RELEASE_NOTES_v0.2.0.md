# dsh-client-ui-toolbox v0.2.0

**语言 / Language：** [中文](#中文) · [English](#english)

---

# 中文

这是工具箱插件的**第一个正式仓库版本**。此前它只有一份源码，直接躺在 `~/.dsh/plugins/dsh-client-ui-toolbox/` —— 既是运行中的安装物，又是唯一的副本，没有版本历史、没有回滚、也没有 LICENSE。本版把它变成一个可以给别人用的东西。

## ✨ 新增

### 空态可见化：装完不再像"没装上"

以前没有任何第三方控件可收纳时，整个组件直接 `return null`——**界面上什么都不多**。而这恰恰是别人第一次试装的典型状态，于是最容易被判定为"装失败了"。

现在入口**永远在**，点开是一句解释：

```
暂无可收纳的工具
输入框工具行里还没有第三方插件注册的控件。装好之后，它们会自动出现在这里。
```

（代码里原本就备了 `.tbx-empty` / `.tbx-notice` 样式，但入口按钮跟着一起消失了，那两段样式永远走不到。）

### 「本机适配」与「通用收纳」在源码里显式拆开

`lib/client.js` 顶部现在明确分出一段 **A（本机适配层）**，与"收纳"这个核心能力无关：

| 开关 | 关掉之后 |
| --- | --- |
| `KNOWN` 清空成 `[]` | 名字退回读 DOM 上的 `aria-label` / `title`，功能照旧，只是不好看 |
| `ADAPT_BROWSER_SCOPE = false` | 只服务 `dsh-browser-scope` 的那段 CSS（`ADAPT_CSS`）不再注入 |

CSS 也随之拆成 `CORE_CSS + ADAPT_CSS`。想减少耦合、或想把它给别人用，只动 A 段即可。

### 版本号与页面上的构建标记钉死

`lib/client.js` 里的 `VERSION` 必须与 `package.json` 的 `version` 一致，`npm run check` 会校验，不一致直接报错。以前 `BUILD` 是个手写字符串，跟版本毫无绑定——页面上跑的到底是哪一版只能靠猜。

### 33 项冒烟测试进仓库

`tests/smoke.mjs` 用 jsdom + 真实 React 18 把浏览器半边跑起来，覆盖：收起第三方控件、菜单开关、搜索过滤、点菜单项转发到第三方原按钮、重扫幂等、A3 底板规则不误伤别的面板、第三方弹层自动收起，以及**空态**（4 项）。

路径已参数化：用 `DSH_CHECKOUT` 指向你的 DSH 源码 checkout；没设时给出人话提示并 `exit 2`，而不是抛一个看不懂的模块错误。

```bash
npm run check          # node --check 两个半边 + 版本一致性校验
DSH_CHECKOUT=<你的checkout> node tests/smoke.mjs
```

## 🩹 修正

- **README 的安装段不再写死作者的绝对路径**，改成 `<PROFILE>` / `<PLUGIN_DIR>` 占位符，并补上两条真会绊人的：Windows 下 `link:` 后面必须用正斜杠、`$env:DSH_HOME` 没设时的默认位置。
- **补了 LICENSE**（MIT），并加进 `package.json` 的 `files`。
- **说明 `lib/index.js` 为什么不能删**：它只有一个空的 `export function apply() {}`，存在的唯一意义是让这个包作为一行宿主插件被装载，从而让 client-modules 发现 `dsh.client` 声明并把浏览器半边组装进 `window.__DSH_BOOT__`。删掉它（或删掉 `cordis.patch.yml` 里那一行）之后，**浏览器半边完全不加载、且没有任何报错**——这是本插件最难排查的故障，所以写进了 README。
- 把「第三方弹层自动收起」正名为**通用规则**：它本来就不针对某个具体插件，之前与 `dsh-browser-scope` 绑在一起描述是失实的。

## ⚠️ 已知边界

- 依赖第三方控件的 DOM 结构（是否有 `<button>`、弹层是否为 absolute 子节点、开合是否反映在 `aria-expanded`）。
- 冒烟测试的假 DOM 是照着作者的插件组合搭的（含它们 CSS 模块的哈希前缀），换一套第三方插件时 fixture 要跟着换——但"收纳"本身的检查与具体插件无关。

---

# English

This is the **first proper repository release** of the toolbox plugin. Until now there was exactly one copy of its source, sitting directly in `~/.dsh/plugins/dsh-client-ui-toolbox/` — serving as both the live installation and the only source, with no history, no rollback and no LICENSE. This release turns it into something you can hand to someone else.

## ✨ Added

### A visible empty state — installing it no longer looks like it failed

With no third-party controls to collect, the component used to `return null`, so **nothing at all appeared in the UI**. That is exactly the state a first-time user lands in, which made "it must have failed to install" the natural conclusion.

The entry is now **always present**, and opening it explains itself:

```
暂无可收纳的工具  (Nothing to collect yet)
输入框工具行里还没有第三方插件注册的控件。装好之后，它们会自动出现在这里。
(No third-party plugin has registered a control in the composer tool row yet.
 Once one does, it will show up here automatically.)
```

(The `.tbx-empty` / `.tbx-notice` styles already existed in the code, but the entry button vanished along with everything else, so those styles were unreachable.)

### "Local adaptations" and "generic collection" are now explicitly separated in the source

The top of `lib/client.js` now clearly delimits a section **A (local adaptation layer)**, unrelated to collection itself:

| Switch | Effect when turned off |
| --- | --- |
| empty `KNOWN` (`[]`) | names fall back to the DOM's `aria-label` / `title`; everything still works, it just looks plainer |
| `ADAPT_BROWSER_SCOPE = false` | the CSS block that only serves `dsh-browser-scope` (`ADAPT_CSS`) is no longer injected |

The CSS is split into `CORE_CSS + ADAPT_CSS` accordingly. To reduce coupling — or to hand this to someone else — only touch section A.

### The version is now pinned to the build marker shown in the page

`VERSION` in `lib/client.js` must match `version` in `package.json`; `npm run check` enforces it and fails loudly on a mismatch. `BUILD` used to be a hand-written string with no link to the version, so which build the page was actually running could only be guessed.

### 33 smoke checks now live in the repository

`tests/smoke.mjs` boots the browser half with jsdom and real React 18, covering: collapsing third-party controls, the menu toggle, search filtering, menu rows forwarding clicks to the real third-party button, idempotent rescans, the A3 backplate rule not leaking onto unrelated panels, automatic popup dismissal, and the **empty state** (4 checks).

Paths are parameterized: point `DSH_CHECKOUT` at your DSH source checkout. If it is unset, the test prints a readable instruction and exits 2 instead of throwing an opaque module error.

```bash
npm run check          # node --check both halves + version consistency
DSH_CHECKOUT=<your checkout> node tests/smoke.mjs
```

## 🩹 Fixed

- **The README install section no longer hardcodes the author's absolute path.** It uses `<PROFILE>` / `<PLUGIN_DIR>` placeholders and documents two genuine trip hazards: on Windows the path after `link:` must use forward slashes, and where `$env:DSH_HOME` defaults to when unset.
- **LICENSE added** (MIT) and included in `package.json`'s `files`.
- **Documented why `lib/index.js` cannot be deleted.** It contains nothing but an empty `export function apply() {}`; its only purpose is to make the package load as a host plugin row, so that client-modules discovers the `dsh.client` declaration and composes the browser half into `window.__DSH_BOOT__`. Delete it (or the row in `cordis.patch.yml`) and **the browser half never loads, with no error at all** — the hardest failure mode in this plugin to diagnose, which is why it is now in the README.
- **"Automatic popup dismissal" is now described as a generic rule.** It was never specific to one plugin; describing it as tied to `dsh-browser-scope` was inaccurate.

## ⚠️ Known limits

- It depends on third-party DOM structure (whether a root has a `<button>`, whether popups are absolute children, whether open/closed state is reflected in `aria-expanded`).
- The smoke test's fixture DOM mirrors the author's plugin combination (including those CSS-module hash prefixes). A different set of third-party plugins means a different fixture — the collection checks themselves are plugin-agnostic.
