/**
 * dsh-client-ui-toolbox 离线冒烟测试。
 *
 * 用 jsdom + 真实 React 18 把插件的浏览器半边跑起来，页面结构照抄真实情况：
 *   - conversation.input.left  里一个 <button class="scap-trigger">（截图插件）
 *   - conversation.input.right 里一个 <span class="WKhQka_control">
 *       内含 <button class="WKhQka_controlButton"> 和一个 controllerBadge 状态徽标
 *
 * 注意：这个假 DOM 是**照着本机装的那两个第三方插件**搭的（含它们的 CSS 模块哈希前缀），
 * 因为插件的 A1 指纹与 A3 底板补丁本来就是为它们写的。换一套第三方插件时，
 * 这份 fixture 要跟着换——但"收纳"本身的检查与具体插件无关。
 *
 * 前置条件：本机有 DSH 源码 checkout（提供 jsdom / react / react-dom）。
 *   $env:DSH_CHECKOUT = 'G:/Application/ai-apps/Deepseek_harness_v015rc1'   # 需要时覆盖
 *
 * 跑：node tests/smoke.mjs
 */
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const CLIENT = join(here, '..', 'lib', 'client.js')
const CHECKOUT = process.env.DSH_CHECKOUT ?? 'G:/Application/ai-apps/Deepseek_harness_v015rc1'

const missing = [
  ['jsdom', join(CHECKOUT, 'node_modules', 'jsdom', 'lib', 'api.js')],
  ['react', join(CHECKOUT, 'packages', 'client', 'ui-conversation', 'node_modules', 'react', 'index.js')],
  ['react-dom', join(CHECKOUT, 'packages', 'client', 'ui-conversation', 'node_modules', 'react-dom', 'client.js')],
].filter(([, path]) => !existsSync(path)).map(([name]) => name)

if (missing.length > 0) {
  console.error(
    'smoke: 缺少依赖 ' + missing.join(' / ') + '\n'
    + '这些来自 DSH 源码 checkout，当前 CHECKOUT = ' + CHECKOUT + '\n'
    + '请设置 DSH_CHECKOUT 指向你的 DSH 源码根目录后重跑。',
  )
  process.exit(2)
}

const jsdomModule = await import(pathToFileURL(join(CHECKOUT, 'node_modules', 'jsdom', 'lib', 'api.js')).href)
const { JSDOM } = jsdomModule.default ?? jsdomModule

const html = `<!doctype html><html><head><style>
  .card { position: relative; }
  .tools, .trailing { display: flex; gap: 12px; align-items: center; }
  .WKhQka_control { display: inline-flex; position: relative; align-items: center; gap: 6px; }
  .WKhQka_controlButton { border: 0; background: transparent; }
  .WKhQka_controllerBadge { font-size: 11px; }
  .WKhQka_menu { position: absolute; bottom: 34px; right: 0; min-width: 190px; }
  [data-slot] { display: contents; }
</style></head><body>
  <div class="card">
    <div class="row">
      <div class="tools">
        <button class="add" id="plus">+</button>
        <div data-slot="conversation.input.left">
          <button class="scap-trigger" id="scap" title="截取屏幕并识别（QQ 式框选）"><svg width="14" height="14"></svg></button>
        </div>
        <div data-slot="conversation.input.plan"><select id="plan"></select></div>
      </div>
      <div class="trailing">
        <div data-slot="conversation.input.right">
          <span class="WKhQka_control" id="bscope">
            <button class="WKhQka_controlButton" id="bscope-btn" aria-expanded="false">浏览器</button>
            <span class="WKhQka_controllerBadge">尚未选择浏览器工具</span>
          </span>
        </div>
        <div data-slot="conversation.input.model"></div>
        <button class="primary" id="send">send</button>
      </div>
    </div>
  </div>
  <div id="root-host"></div>
</body></html>`

const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' })
const { window } = dom

globalThis.window = window
globalThis.document = window.document
globalThis.Node = window.Node
globalThis.MutationObserver = window.MutationObserver
// jsdom 没实现 oninput 属性，react-dom 会因此判定"input 事件不可用"而走 IE 兼容分支
// （attachEvent），在 jsdom 里直接抛错、onChange 永远到不了。补上属性让 React 走标准
// 的 input 事件路径。仅测试环境需要。
window.document.oninput = null

const React = (await import(pathToFileURL(join(CHECKOUT, 'packages/client/ui-conversation/node_modules/react/index.js')).href)).default
const ReactDOMClient = (await import(pathToFileURL(join(CHECKOUT, 'packages/client/ui-conversation/node_modules/react-dom/client.js')).href)).default

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  — ' + detail}`)
}

// ---- 装载插件 ------------------------------------------------------------------------------
let registration = null
window.__ModuleLoader__ = {
  mode: 'queue',
  load(reg) { registration = reg },
}
await import(pathToFileURL(CLIENT).href + '?smoke=' + Date.now())
check('bundle registers through __ModuleLoader__.load', registration !== null && registration.id === 'dsh-client-ui-toolbox', registration?.id)

const plugin = registration.factory((spec) => {
  if (spec === 'react') return React
  throw new Error('unexpected require: ' + spec)
})
check('exports.apply / exports.inject present', typeof plugin.apply === 'function' && Array.isArray(plugin.inject) && plugin.inject[0] === 'slots', JSON.stringify(plugin.inject))

// ---- 假 ctx：捕获槽注册 ---------------------------------------------------------------------
let registered = null
const disposers = []
const ctx = {
  get: (key) => (key === 'slots' ? slots : undefined),
  effect: (callback) => { const dispose = callback(); disposers.push(dispose); return dispose },
}
const slots = {
  inject: (key, callback) => { const dispose = callback(); disposers.push(dispose); return dispose },
  register: (options, component) => { registered = { options, component }; return () => {} },
}
plugin.apply(ctx)
check('registers launcher into conversation.input.left',
  registered !== null && registered.options.name === 'conversation.input.left' && registered.options.id === 'ui-toolbox',
  registered === null ? 'no registration' : JSON.stringify(registered.options))
check('style tag injected once', window.document.querySelectorAll('#dsh-client-ui-toolbox\\/styles').length === 1)

// ---- 渲染入口（真实 React）------------------------------------------------------------------
const scand = window.document.getElementById('scap')
const bscope = window.document.getElementById('bscope')
const bscopeBtn = window.document.getElementById('bscope-btn')
let scapClicks = 0
let bscopeClicks = 0
scand.addEventListener('click', () => { scapClicks += 1 })
// 照抄 BrowserControl 的开关语义：onClick = menu ? closeMenu() : setMenu(true)，
// 且按钮的 aria-expanded 就是 menu 的值。插件要靠这个属性判断"它的弹层开着没有"。
let bscopeMenu = false
bscopeBtn.setAttribute('aria-expanded', 'false')
bscopeBtn.addEventListener('click', () => {
  bscopeClicks += 1
  bscopeMenu = !bscopeMenu
  bscopeBtn.setAttribute('aria-expanded', bscopeMenu ? 'true' : 'false')
})

const host = window.document.getElementById('root-host')
const root = ReactDOMClient.createRoot(host)
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

root.render(React.createElement(registered.component, { sessionId: 'smoke-session' }))
await settle()

// 1) 第三方控件被收起
const scapCollapsed = scand.getAttribute('data-tbx-collected') === '1' && scand.style.width === '0px'
const bscopeCollapsed = bscope.getAttribute('data-tbx-collected') === '1'
const badge = bscope.querySelector('.WKhQka_controllerBadge')
check('screen-snap button collapsed (0 size, marked)', scapCollapsed, `mark=${scand.getAttribute('data-tbx-collected')} w=${scand.style.width}`)
check('browser control collapsed (marked)', bscopeCollapsed)
check('browser badge hidden (in-flow child)', badge.style.display === 'none', `display=${badge.style.display}`)
check('browser inner button hidden', bscopeBtn.style.display === 'none', `display=${bscopeBtn.style.display}`)
check('official controls untouched', window.document.getElementById('plus').getAttribute('data-tbx-collected') === null && window.document.getElementById('send').style.width === '')

// 2) 入口按钮
const trigger = host.querySelector('.tbx-trigger')
check('toolbox launcher rendered', trigger !== null && trigger.getAttribute('aria-label') === '工具集合器')
check('launcher reports collapsed count', (window.__DSH_TOOLBOX__?.report() ?? []).length === 2, JSON.stringify(window.__DSH_TOOLBOX__?.report()))

// 3) 打开菜单
trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await settle()
const panel = host.querySelector('.tbx-panel')
const items = panel === null ? [] : Array.from(panel.querySelectorAll('.tbx-item'))
check('panel opens as single-column list', panel !== null && items.length === 2, `items=${items.length}`)
check('items carry names', items.map((i) => i.querySelector('.tbx-name').textContent).join(' / ') === '截图识别 / 浏览器面板',
  items.map((i) => i.querySelector('.tbx-name').textContent).join(' / '))
check('search box present', panel.querySelector('.tbx-input') !== null)

// 4) 搜索过滤
const input = panel.querySelector('.tbx-input')
const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
valueSetter.call(input, '浏览')
input.dispatchEvent(new window.Event('input', { bubbles: true }))
await settle()
const filtered = Array.from((host.querySelector('.tbx-panel') ?? host).querySelectorAll('.tbx-item'))
check('typing filters the list', filtered.length === 1 && filtered[0].querySelector('.tbx-name').textContent === '浏览器面板',
  filtered.map((i) => i.querySelector('.tbx-name').textContent).join(' / '))

// 5) 点菜单项 = 点到第三方原按钮
filtered[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await settle()
check('menu item forwards the click to the real third-party button', bscopeClicks === 1, `bscopeClicks=${bscopeClicks}`)
check('panel closes after a pick', host.querySelector('.tbx-panel') === null)

// 6) 再开一次点截图项
host.querySelector('.tbx-trigger').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await settle()
const again = Array.from(host.querySelectorAll('.tbx-item'))
const scapItem = again.find((i) => i.querySelector('.tbx-name').textContent === '截图识别')
scapItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await settle()
check('screenshot item forwards to its button', scapClicks === 1, `scapClicks=${scapClicks}`)

// 7) 重扫幂等
const before = JSON.stringify(window.__DSH_TOOLBOX__.report())
window.__DSH_TOOLBOX__.rescan()
await settle()
check('rescan is idempotent', JSON.stringify(window.__DSH_TOOLBOX__.report()) === before)

// 8) 底板配方：能解析、且选择器真能命中目标、不误伤别的面板，配方本身是"工具栏同款"
const styleTag = window.document.getElementById('dsh-client-ui-toolbox/styles')
const styleText = styleTag === null ? '' : String(styleTag.textContent)
const sheetRules = styleTag !== null && styleTag.sheet !== null
  ? Array.from(styleTag.sheet.cssRules).map((rule) => rule.selectorText ?? '')
  : []
const plateRule = sheetRules.find((selector) => selector.includes('WKhQka_panel')) ?? ''
check('plate rule parsed into the stylesheet', plateRule.includes('.WKhQka_menu') && plateRule.includes('WKhQka_extensionPopupWindow'),
  plateRule === '' ? 'rule missing' : plateRule.slice(0, 90) + '…')
check('plate recipe is the toolbar one (input surface + frosted blur)',
  styleText.includes('background-color:var(--dsw-specific-input-major') && styleText.includes('backdrop-filter:blur(var(--frosted-blur'),
  styleText.includes('frosted-blur') ? 'frosted blur present' : 'frosted blur missing')

const probe = window.document.createElement('div')
probe.innerHTML = [
  '<div data-slot="sidebar.right.pane.tab">',
  '  <div class="WKhQka_panel"><span class="WKhQka_tabBar">x</span></div>',
  '</div>',
  '<div data-slot="sidebar.right.pane.tab"><div class="unrelated-panel">y</div></div>',
  '<span data-tbx-collected="1">',
  '  <span class="WKhQka_menu"></span>',
  '  <span class="WKhQka_controllerToolsMenu"></span>',
  '</span>',
].join('')
window.document.body.appendChild(probe)
check('browser panel selector hits the right-side panel',
  probe.querySelectorAll('[data-slot="sidebar.right.pane.tab"] .WKhQka_panel').length === 1)
check('collected-seat selectors hit the control popups',
  probe.querySelectorAll('[data-tbx-collected] .WKhQka_menu, [data-tbx-collected] .WKhQka_controllerToolsMenu').length === 2)
// 真问题：把插件那条底板规则的选择器，逐个拿去匹配"别的面板"，必须一个都不中。
const plateSelectors = plateRule.split(',').map((s) => s.trim()).filter((s) => s !== '')
const unrelatedHits = plateSelectors.filter((selector) => {
  try {
    return probe.querySelector('.unrelated-panel').matches(selector)
  } catch (error) {
    return true // 选择器非法也算失败
  }
})
check('the plate rule does not leak onto an unrelated panel', unrelatedHits.length === 0, unrelatedHits.join(' | '))

// 9) 第三方弹层自动收起：点空白处 / Esc（复用第三方自己的按钮开关）
const pointerDown = () => new window.MouseEvent('pointerdown', { bubbles: true })
// 显式把它的菜单设成想要的状态，避免依赖前一步留下的状态（否则断言会空过）
const setBscopeMenu = async (want) => {
  const isOpen = bscopeBtn.getAttribute('aria-expanded') === 'true'
  if (isOpen !== want) {
    bscopeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await settle()
  }
}

await setBscopeMenu(true)
check('third-party popup opened (aria-expanded=true)', bscopeBtn.getAttribute('aria-expanded') === 'true')

window.document.body.dispatchEvent(pointerDown())
await settle()
check('clicking blank space closes the third-party popup',
  bscopeBtn.getAttribute('aria-expanded') === 'false', `aria-expanded=${bscopeBtn.getAttribute('aria-expanded')}`)

await setBscopeMenu(true)
bscope.querySelector('.WKhQka_controllerBadge').dispatchEvent(pointerDown())
await settle()
check('a click inside the popup does NOT close it', bscopeBtn.getAttribute('aria-expanded') === 'true')

window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await settle()
check('Escape closes the third-party popup', bscopeBtn.getAttribute('aria-expanded') === 'false')

// 我们自己的菜单里点一下（属于"外面"），也应该顺手收起第三方弹层
await setBscopeMenu(true)
host.querySelector('.tbx-trigger').dispatchEvent(pointerDown())
await settle()
check('opening the toolbox also dismisses an open third-party popup',
  bscopeBtn.getAttribute('aria-expanded') === 'false')

// 10) 空态：第三方控件全部消失后，入口必须留着，面板要说明状况而不是什么都不渲染。
//     这是"别人装完却以为没装上"的那个坑的回归检查。
scand.remove()
bscope.remove()
await settle()
await settle()
check('zero tools: launcher stays visible', host.querySelector('.tbx-trigger') !== null)
check('zero tools: report() is empty', (window.__DSH_TOOLBOX__?.report() ?? []).length === 0,
  JSON.stringify(window.__DSH_TOOLBOX__?.report()))
host.querySelector('.tbx-trigger').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await settle()
const blank = host.querySelector('.tbx-blank')
check('zero tools: panel explains itself',
  blank !== null && host.querySelector('.tbx-blank-title')?.textContent === '暂无可收纳的工具'
    && host.querySelector('.tbx-blank-hint') !== null,
  blank === null ? 'no .tbx-blank rendered' : host.querySelector('.tbx-blank-title')?.textContent)
check('zero tools: no search box when there is nothing to search',
  host.querySelector('.tbx-panel')?.querySelector('.tbx-input') == null)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
