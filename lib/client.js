/**
 * dsh-client-ui-toolbox — 「工具集合器」的浏览器半边。
 *
 * 目标：把输入框工具行左右两侧（`conversation.input.left` / `conversation.input.right`）
 * 里由第三方插件注册的控件收起来，只留一个工具箱入口；点开是一个带搜索框的
 * 单列下拉菜单，一行一个工具。官方自带控件（附件、计划、模型选择器、发送）不在
 * 这两个扩展位里，本插件不碰它们。
 *
 * 为什么这样做（而不是"把按钮搬进菜单"）：
 * 这两个扩展位是 list 槽，槽条目的渲染由各自的插件拥有，React 子树不能跨插件转移。
 * 所以这里的做法是：把扩展位里的条目节点原地"压成 0 尺寸并隐藏"——节点保留在文档里、
 * 事件与弹层都还是活的——然后由菜单行代替用户去点它（element.click()）。这样：
 *   - 工具行里不再有那些按钮（不拥挤了）；
 *   - 第三方插件自己的弹层/浮层照常工作，位置就在它原来所在的位置附近；
 *   - 不改任何第三方代码，也不用 React 私有 API。
 *
 * 收起规则（对机制有影响的细节）：
 *   - 条目本身就是 <button>：压成 0 尺寸 + 透明底板 + overflow:hidden（字形被裁掉）；
 *   - 条目是容器（内含按钮，可能还有自己的弹层）：原地绝对定位到它原来的位置，
 *     压成 0 尺寸，并隐藏"参与排版"的子节点；absolute/fixed 的子节点（弹层）保留，
 *     否则点开第三方菜单会看不到。
 */

window.__ModuleLoader__.load({
  id: 'dsh-client-ui-toolbox',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const INJECT = ['slots']
    const LAUNCHER_ID = 'ui-toolbox'
    const STYLE_ID = 'dsh-client-ui-toolbox/styles'
    const OWN_ATTR = 'data-tbx-own'
    const MARK_ATTR = 'data-tbx-collected'

    /**
     * 版本号：必须与 package.json 的 `version` 一致——`npm run check` 会校验，不一致直接报错。
     * 以前这里只有一个手写的 BUILD 字符串，跟版本毫无绑定，页面上跑的到底是哪一版只能靠猜。
     */
    const VERSION = '0.2.0'

    /**
     * 构建标记：`__DSH_TOOLBOX__.build` 读它，用来一眼确认"存盘后的热重载到底有没有到位"
     * （热重载没到位时它还是旧值）。改这个文件时把括号里那句话改一下即可。
     */
    const BUILD = VERSION + ' (split adapt layer, visible empty state)'

    /**
     * 工具行里属于"扩展位"的两个槽。官方控件走各自的单槽
     * （conversation.input.plan / .model）或外壳本身，不落在这两个 list 里，
     * 所以这里收到的就是第三方插件的按钮。
     */
    const SEATS = ['conversation.input.left', 'conversation.input.right']

    // ═══════════════════════════════════════════════════════════════════════════
    //  A. 本机适配层（可选，与"收纳"这个核心能力无关）
    //
    //  下面两块都是"为特定第三方插件做的适配"，都不影响收纳本身：
    //    · KNOWN 清空成 []        → 名字退回读 DOM 上的 aria-label / title，功能照旧；
    //    · ADAPT_BROWSER_SCOPE 置 false → 只服务 dsh-browser-scope 的那段 CSS 不再注入。
    //  想把它给别人用、或想减少耦合，只动这两处即可，不用碰下半部分的收纳逻辑。
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * A1. 已知工具的展示信息，按 DOM 指纹匹配（CSS 模块的类名带哈希前缀，用子串匹配）。
     * 匹配不到就退回 DOM 上能读到的名字——所以这里缺项只是"名字不好看"，不是故障。
     */
    const KNOWN = [
      {
        seat: 'conversation.input.left',
        fingerprint: 'scap-trigger',
        name: '截图识别',
        hint: '框选屏幕区域，把截图送进会话识别',
        icon: 'crop',
      },
      {
        seat: 'conversation.input.right',
        fingerprint: 'controlButton',
        name: '浏览器面板',
        hint: '浏览器控制器、实况画面与诊断',
        icon: 'globe',
      },
    ]

    /**
     * A2. 是否给 dsh-browser-scope 打底板补丁（那段 CSS 见文件下方的 ADAPT_CSS）。
     * 它写死了该插件 CSS 模块的哈希前缀 WKhQka_，对方换版本就会自动失效。
     * 没装这个插件、或不需要这个效果时，置 false 即可。
     */
    const ADAPT_BROWSER_SCOPE = true

    // ---- 通用样式：入口按钮 + 下拉菜单 + 空态（与任何具体第三方插件无关）----------
    const CORE_CSS = [
      '.tbx-wrap{position:relative;display:inline-flex;align-items:center;flex:none}',
      // 入口按钮：与官方 .add（附件/加号）同款配方——28px 圆底板 + selector 填充。
      '.tbx-trigger{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;',
      'border:none;border-radius:999px;corner-shape:round;',
      'background:var(--dsw-specific-selector,rgba(255,255,255,.12));',
      'color:var(--dsw-alias-label-primary,rgba(255,255,255,.92));',
      'cursor:pointer;user-select:none;-webkit-user-select:none;',
      'transition:background .15s ease,opacity .15s ease}',
      '.tbx-trigger:hover,.tbx-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(255,255,255,.18))}',
      '.tbx-trigger:active{opacity:.55}',
      '.tbx-trigger:focus-visible{outline:2px solid var(--dsw-alias-interactive-bg-hover-accent,rgba(76,154,255,.7));outline-offset:2px}',
      // 面板：单列、贴着入口按钮向上弹，配色/圆角/投影取产品同款 token。
      '.tbx-panel{position:absolute;left:0;bottom:calc(100% + 10px);z-index:60;box-sizing:border-box;',
      'width:252px;max-height:min(360px,60vh);display:flex;flex-direction:column;gap:4px;padding:6px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:12px;',
      'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base,#1b1b1f));',
      'box-shadow:var(--dsw-elevation-panel,0 8px 28px rgba(0,0,0,.45));',
      'color:var(--dsw-alias-label-primary,rgba(255,255,255,.92));',
      'font-family:var(--dsw-font-family,inherit);font-size:13px;line-height:20px;text-align:left}',
      '.tbx-search{display:flex;align-items:center;gap:6px;flex:none;height:30px;padding:0 8px;border-radius:8px;',
      'background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));',
      'color:var(--dsw-alias-label-secondary,rgba(255,255,255,.6))}',
      '.tbx-input{flex:1;min-width:0;height:100%;padding:0;border:0;outline:0;background:transparent;',
      'color:var(--dsw-alias-label-primary,rgba(255,255,255,.92));font:inherit}',
      '.tbx-input::placeholder{color:var(--dsw-alias-label-secondary,rgba(255,255,255,.6))}',
      '.tbx-list{display:flex;flex-direction:column;gap:2px;min-height:0;overflow-y:auto}',
      '.tbx-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:8px;',
      'background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.tbx-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.tbx-item:disabled{opacity:.45;cursor:default}',
      '.tbx-item:focus-visible{outline:2px solid var(--dsw-alias-interactive-bg-hover-accent,rgba(76,154,255,.7));outline-offset:-2px}',
      '.tbx-icon{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:6px;',
      'background:var(--dsw-specific-selector,rgba(255,255,255,.12))}',
      '.tbx-text{display:flex;flex-direction:column;min-width:0}',
      '.tbx-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tbx-hint{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'color:var(--dsw-alias-label-secondary,rgba(255,255,255,.6));font-size:11px;line-height:16px}',
      '.tbx-empty,.tbx-notice{padding:4px 8px;color:var(--dsw-alias-label-secondary,rgba(255,255,255,.6));font-size:12px}',
      // 空态：一个第三方控件都没有时，面板里显示的解释（见下方 Toolbox 组件）
      '.tbx-blank{padding:10px 8px;display:flex;flex-direction:column;gap:4px}',
      '.tbx-blank-title{color:var(--dsw-alias-label-primary,rgba(255,255,255,.92));font-size:13px;line-height:20px}',
      '.tbx-blank-hint{color:var(--dsw-alias-label-secondary,rgba(255,255,255,.6));font-size:12px;line-height:17px}',
    ].join('')

    // ---- A3. 只服务 dsh-browser-scope 的底板修正（可选，见上方 A 段说明）----------
    // 根因：磨砂玻璃主题把 --dsw-alias-bg-base 覆盖成约 0.36 不透明度的 rgba，而
    // BrowserScope 的底板直接吃这个 token、自己又没有 backdrop-filter —— 正文会清清楚
    // 楚透上来，也没有工具栏那种"磨砂质感"。
    // 做法：换成工具栏同款配方 —— 输入框卡片用的同一个表面 token
    // (--dsw-specific-input-major) + 同一套磨砂参数 (--frosted-blur / --frosted-saturate，
    // 主题没装时退回 18px/160%)。
    //   · 只作用于浏览器插件自己的类名（CSS 模块哈希前缀 WKhQka_），不碰全局 token、
    //     不碰主题、不碰官方面板；该插件升级换哈希后本段自动失效（不会帮倒忙）。
    const ADAPT_CSS = ADAPT_BROWSER_SCOPE ? [
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_panel,',
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_extensionPopupWindow,',
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_extensionMenu,',
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_liveControlPanel,',
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_extensionConfirmDialog,',
      '[data-slot="sidebar.right.pane.tab"] .WKhQka_errorMessage,',
      '[data-tbx-collected] .WKhQka_menu,',
      '[data-tbx-collected] .WKhQka_controllerToolsMenu{',
      'background-color:var(--dsw-specific-input-major,var(--dsw-alias-bg-base));',
      'background-image:none;',
      'backdrop-filter:blur(var(--frosted-blur,18px)) saturate(var(--frosted-saturate,160%));',
      '-webkit-backdrop-filter:blur(var(--frosted-blur,18px)) saturate(var(--frosted-saturate,160%))}',
    ].join('') : ''

    const CSS = CORE_CSS + ADAPT_CSS

    function log() {
      try {
        console.log.apply(console, ['[toolbox]'].concat(Array.prototype.slice.call(arguments)))
      } catch (_) {}
    }

    // ---- DOM 层：找到扩展位、收起第三方控件 ------------------------------------------------

    /** 槽渲染点：官方给动态样式留的稳定锚点。同名槽理论上只挂一个，按数组处理更稳。 */
    function anchorsOf(seat) {
      return Array.prototype.slice.call(document.querySelectorAll('[data-slot="' + seat + '"]'))
    }

    function buttonOf(el) {
      if (el.tagName === 'BUTTON') return el
      return el.querySelector('button')
    }

    function classText(el) {
      return String(el.getAttribute('class') || '')
    }

    /** 识别一个扩展位条目：返回展示信息；不是可点的控件就返回 null（跳过）。 */
    function classify(el, seat) {
      const button = buttonOf(el)
      if (button === null) return null
      const text = classText(el) + ' ' + classText(button)
      for (const known of KNOWN) {
        if (known.seat === seat && text.indexOf(known.fingerprint) >= 0) {
          return { name: known.name, hint: known.hint, icon: known.icon }
        }
      }
      const label = button.getAttribute('aria-label')
        || button.getAttribute('title')
        || String(button.textContent || '').trim()
      return {
        name: label === '' ? '未命名工具' : label.slice(0, 24),
        hint: '来自 ' + seat,
        icon: 'wrench',
      }
    }

    /**
     * 收起一个扩展位条目：从工具行的排版里去掉，但节点、事件、弹层全部保留。
     * 幂等——每次扫描都重新施加一遍，防止第三方组件重渲染后样式被顶掉。
     */
    function collapse(el) {
      el.setAttribute(MARK_ATTR, '1')
      const style = el.style
      const important = 'important'
      if (el.tagName === 'BUTTON') {
        // 条目本身就是按钮：底板清空 + 压成 0 尺寸 + 裁掉字形。
        style.setProperty('width', '0', important)
        style.setProperty('height', '0', important)
        style.setProperty('min-width', '0', important)
        style.setProperty('padding', '0', important)
        style.setProperty('margin', '0', important)
        style.setProperty('border', '0', important)
        style.setProperty('background', 'transparent', important)
        style.setProperty('box-shadow', 'none', important)
        style.setProperty('overflow', 'hidden', important)
        return
      }
      // 容器型条目：原地绝对定位（保持它原来的屏幕位置，第三方弹层才会弹在老地方）
      // 并压成 0 尺寸；参与排版的子节点隐藏，absolute/fixed 的弹层留着。
      const left = el.offsetLeft
      const top = el.offsetTop
      style.setProperty('position', 'absolute', important)
      style.setProperty('left', String(left) + 'px', important)
      style.setProperty('top', String(top) + 'px', important)
      style.setProperty('width', '0', important)
      style.setProperty('height', '0', important)
      style.setProperty('min-width', '0', important)
      style.setProperty('margin', '0', important)
      style.setProperty('padding', '0', important)
      style.setProperty('border', '0', important)
      style.setProperty('background', 'transparent', important)
      style.setProperty('overflow', 'visible', important)
      const children = Array.from(el.children)
      for (const child of children) {
        const position = window.getComputedStyle(child).position
        if (position === 'absolute' || position === 'fixed') continue
        child.style.setProperty('display', 'none', important)
      }
    }

    /** 扫描两个扩展位，收起其中的控件，返回菜单条目。 */
    function scan() {
      const items = []
      for (const seat of SEATS) {
        for (const anchor of anchorsOf(seat)) {
          const children = Array.from(anchor.children)
          for (const el of children) {
            if (el.hasAttribute(OWN_ATTR)) continue
            let meta = null
            try {
              meta = classify(el, seat)
            } catch (error) {
              log('classify failed', String(error && error.message))
            }
            if (meta === null) continue
            collapse(el)
            const button = buttonOf(el)
            items.push({
              key: seat + '#' + items.length,
              seat: seat,
              name: meta.name,
              hint: meta.hint,
              icon: meta.icon,
              disabled: button !== null && button.disabled === true,
              // 下面两个引用给"点空白处自动收起"用：原按钮的 aria-expanded 就是它自己弹层的
              // 开关，rootElement 用来判断"这一下点在它的弹层里面还是外面"。
              button: button,
              rootElement: el,
              activate: (() => {
                const target = button
                return () => {
                  if (target === null || target.isConnected !== true || target.disabled === true) return false
                  target.click()
                  return true
                }
              })(),
            })
          }
        }
      }
      return items
    }

    // ---- 图标（自己画的 SVG，尺寸与官方 14/16px 图标一致）-----------------------------------

    function svg(size, children) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block', flexShrink: 0 },
        },
        children,
      )
    }

    /** 工具箱：箱体 + 提手 + 锁扣，14px 下保持可辨识。 */
    function toolboxGlyph(size) {
      return svg(size, [
        React.createElement('path', { key: 'body', d: 'M1.9 6.2h12.2v6.1a1.3 1.3 0 0 1-1.3 1.3H3.2a1.3 1.3 0 0 1-1.3-1.3V6.2Z' }),
        React.createElement('path', { key: 'handle', d: 'M5.7 6.2V4.3a1.4 1.4 0 0 1 1.4-1.4h1.8a1.4 1.4 0 0 1 1.4 1.4v1.9' }),
        React.createElement('path', { key: 'line', d: 'M1.9 9.4h12.2' }),
        React.createElement('path', { key: 'latch', d: 'M6.7 9.4h2.6v1.5H6.7z' }),
      ])
    }

    function itemGlyph(kind, size) {
      if (kind === 'crop') {
        return svg(size, [
          React.createElement('path', { key: 'a', d: 'M4.6 1.6v9.8h9.8' }),
          React.createElement('path', { key: 'b', d: 'M1.6 4.6h9.8v9.8' }),
        ])
      }
      if (kind === 'globe') {
        return svg(size, [
          React.createElement('circle', { key: 'c', cx: 8, cy: 8, r: 6.2 }),
          React.createElement('path', { key: 'e', d: 'M1.8 8h12.4' }),
          React.createElement('path', { key: 'm', d: 'M8 1.8c1.9 1.9 2.8 4 2.8 6.2S9.9 12.3 8 14.2C6.1 12.3 5.2 10.2 5.2 8S6.1 3.7 8 1.8Z' }),
        ])
      }
      if (kind === 'search') {
        return svg(size, [
          React.createElement('circle', { key: 'c', cx: 7.2, cy: 7.2, r: 4.6 }),
          React.createElement('path', { key: 'l', d: 'M10.6 10.6 14 14' }),
        ])
      }
      return svg(size, [
        React.createElement('path', { key: 'w', d: 'M10.9 2.1a4 4 0 0 0-3.6 5.9L3 12.3a1.3 1.3 0 0 0 1.9 1.8l4.2-4.3a4 4 0 0 0 4.9-4.9L11.6 7l-2.1-.5-.5-2.1 1.9-2.3Z' }),
      ])
    }

    // ---- React：入口按钮 + 下拉菜单 ---------------------------------------------------------

    function Toolbox(props) {
      const wrapRef = React.useRef(null)
      const inputRef = React.useRef(null)
      const signatureRef = React.useRef('')
      const frameRef = React.useRef(0)
      // 最新一次扫描的结果（含 DOM 引用）。state 只在"条目签名"变化时更新，
      // 但引用每次扫描都刷新——否则第三方组件重挂后我们会握着已经脱离文档的旧节点。
      const itemsRef = React.useRef([])
      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [items, setItems] = React.useState([])
      const [notice, setNotice] = React.useState('')

      const refresh = React.useCallback(() => {
        let next = []
        try {
          next = scan()
        } catch (error) {
          log('scan failed', String(error && error.message))
        }
        itemsRef.current = next
        const signature = next
          .map((item) => item.seat + '|' + item.name + '|' + (item.disabled ? '1' : '0'))
          .join(';')
        if (signature === signatureRef.current) return
        signatureRef.current = signature
        setItems(next)
      }, [])

      // 工具行随时可能被 React 重渲染（换会话、装新插件、第三方组件内部状态变化），
      // 所以盯住两个扩展位的宿主节点，一有变化就重新扫描；扫描本身按签名去重，
      // 不会因为"自己渲染自己"打转。用 layout effect：第一次扫描发生在浏览器绘制之前，
      // 避免刚切会话时闪一下第三方按钮。
      React.useLayoutEffect(() => {
        refresh()
        if (typeof MutationObserver !== 'function') return undefined
        const schedule = () => {
          if (frameRef.current !== 0) return
          frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = 0
            refresh()
          })
        }
        const observers = []
        const hosts = new Set()
        for (const seat of SEATS) {
          for (const anchor of anchorsOf(seat)) {
            const host = anchor.parentElement
            if (host === null || hosts.has(host)) continue
            hosts.add(host)
            const observer = new MutationObserver(schedule)
            observer.observe(host, { childList: true, subtree: true })
            observers.push(observer)
          }
        }
        return () => {
          for (const observer of observers) observer.disconnect()
          if (frameRef.current !== 0) {
            window.cancelAnimationFrame(frameRef.current)
            frameRef.current = 0
          }
        }
      }, [refresh])

      // 打开时聚焦搜索框；点面板外面或按 Esc 关闭。
      React.useEffect(() => {
        if (!open) return undefined
        refresh()
        setNotice('')
        const input = inputRef.current
        if (input !== null) input.focus()
        const onPointerDown = (event) => {
          const wrap = wrapRef.current
          if (wrap !== null && event.target instanceof Node && wrap.contains(event.target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open, refresh])

      // 第三方弹层自动收起：点空白处 / 按 Esc 关掉。
      // 这些弹层（例如浏览器插件的控制器菜单）原作者只做了"再点一次按钮"才关；这里复用它
      // 自己的开关——按钮的 aria-expanded 为 true 时替用户再点一次按钮，走的是它自己的
      // closeMenu()，不复制、不改写它的任何逻辑。点在它自己弹层内部的交互一律放过。
      React.useEffect(() => {
        const dismiss = (event) => {
          for (const item of itemsRef.current) {
            const button = item.button
            if (button === null || button.isConnected !== true) continue
            if (button.getAttribute('aria-expanded') !== 'true') continue
            if (event !== null && event.target instanceof Node && item.rootElement.contains(event.target)) continue
            button.click()
          }
        }
        const onPointerDown = (event) => dismiss(event)
        const onKeyDown = (event) => { if (event.key === 'Escape') dismiss(null) }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [])

      const pick = (item) => {
        // 取最新一次扫描里的同一个条目：第三方组件可能已经把它重挂过。
        const fresh = itemsRef.current.find((entry) => entry.key === item.key) || item
        if (fresh.activate() === true) {
          setOpen(false)
          setQuery('')
          return
        }
        setNotice('「' + fresh.name + '」当前不可用（按钮已禁用或已卸载）')
      }

      // 一个第三方控件都没有时【入口也要露出来】。刚装好的人如果看到界面上什么都没多，
      // 会以为装失败了——这正是本插件最容易被误判的地方。所以空态不是"不渲染"，
      // 而是渲染一个把状况说清楚的面板。
      const empty = items.length === 0

      const needle = query.trim().toLowerCase()
      const shown = needle === ''
        ? items
        : items.filter((item) => (item.name + ' ' + item.hint).toLowerCase().indexOf(needle) >= 0)

      const rows = shown.length === 0
        ? [React.createElement('div', { className: 'tbx-empty', key: 'empty' }, '没有匹配的工具')]
        : shown.map((item) => React.createElement(
          'button',
          {
            key: item.key,
            type: 'button',
            role: 'menuitem',
            className: 'tbx-item',
            title: item.hint,
            disabled: item.disabled,
            onClick: () => pick(item),
          },
          React.createElement('span', { className: 'tbx-icon' }, itemGlyph(item.icon, 14)),
          React.createElement(
            'span',
            { className: 'tbx-text' },
            React.createElement('span', { className: 'tbx-name' }, item.name),
            React.createElement('span', { className: 'tbx-hint' }, item.hint),
          ),
        ))

      const panelChildren = empty
        ? [
          React.createElement(
            'div',
            { className: 'tbx-blank', key: 'blank' },
            React.createElement('div', { className: 'tbx-blank-title' }, '暂无可收纳的工具'),
            React.createElement(
              'div',
              { className: 'tbx-blank-hint' },
              '输入框工具行里还没有第三方插件注册的控件。装好之后，它们会自动出现在这里。',
            ),
          ),
        ]
        : [
          React.createElement(
            'div',
            { className: 'tbx-search', key: 'search' },
            itemGlyph('search', 13),
            React.createElement('input', {
              ref: inputRef,
              className: 'tbx-input',
              type: 'text',
              value: query,
              placeholder: '搜索工具…',
              'aria-label': '搜索工具',
              onChange: (event) => { setQuery(event.target.value) },
              onKeyDown: (event) => {
                if (event.key === 'Escape') setOpen(false)
                if (event.key === 'Enter' && shown.length === 1) pick(shown[0])
              },
            }),
          ),
          React.createElement('div', { className: 'tbx-list', key: 'list' }, rows),
          notice === '' ? null : React.createElement('div', { className: 'tbx-notice', key: 'notice' }, notice),
        ]

      return React.createElement(
        'span',
        { className: 'tbx-wrap', ref: wrapRef, 'data-tbx-own': '1' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'tbx-trigger',
            title: empty ? '工具集合器（暂无可收纳的工具）' : '工具集合器',
            'aria-label': '工具集合器',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            // 与官方工具按钮一致：按下时不把焦点从输入框抢走。
            onMouseDown: (event) => { event.preventDefault() },
            onClick: () => {
              setOpen(!open)
              setQuery('')
            },
          },
          toolboxGlyph(14),
        ),
        open
          ? React.createElement(
            'div',
            { className: 'tbx-panel', role: 'menu', 'aria-label': '工具集合器' },
            panelChildren,
          )
          : null,
      )
    }

    // ---- 样式与生命周期 ---------------------------------------------------------------------

    function installStyles() {
      const existing = document.getElementById(STYLE_ID)
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
      }
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) {
        log('slots service missing — toolbox not mounted')
        return
      }

      // 同一个槽位里同 id + 同 priority 二次注册会被槽核心直接判冲突，所以
      // 这里用一个进程内标记把"重复 apply"挡掉（卸载时自动放开，HMR 仍可重新挂上）。
      if (window.__DSH_TOOLBOX_APPLIED__ === true) {
        log('already applied — skipping duplicate mount')
        return
      }
      window.__DSH_TOOLBOX_APPLIED__ = true
      ctx.effect(() => () => { window.__DSH_TOOLBOX_APPLIED__ = false })

      ctx.effect(() => installStyles())

      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: LAUNCHER_ID, order: 20, label: '工具集合器' },
        Toolbox,
      ))

      // 排障手柄：控制台里 __DSH_TOOLBOX__.report() 可以看到当前收了哪些工具，
      // __DSH_TOOLBOX__.build 用来确认页面里跑的是不是最新一版（改完存盘后热重载是否到位）。
      try {
        window.__DSH_TOOLBOX__ = {
          build: BUILD,
          report: () => scan().map((item) => ({ seat: item.seat, name: item.name, disabled: item.disabled })),
          rescan: () => scan().length,
        }
      } catch (_) {}

      log('mounted', BUILD)
    }

    exports.inject = INJECT
    exports.apply = apply
    return module.exports
  },
})
