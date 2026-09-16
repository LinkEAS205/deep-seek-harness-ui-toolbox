/**
 * 版本一致性校验：package.json 的 `version` 必须与 lib/client.js 里的 `VERSION` 相同。
 *
 * 为什么需要它：`__DSH_TOOLBOX__.build` 是页面上唯一能确认"跑的到底是哪一版"的入口，
 * 而它以前是个与版本毫无绑定的手写字符串——改了代码忘了改它、或改了版本忘了改它，
 * 都不会有任何提示。这个脚本把两处钉在一起，`npm run check` 时一并校验。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const clientSource = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const match = /const VERSION = '([^']+)'/.exec(clientSource)
if (match === null) {
  console.error('check-version: lib/client.js 里没有找到 `const VERSION = \'...\'`')
  process.exit(1)
}

const clientVersion = match[1]
if (clientVersion !== pkg.version) {
  console.error(
    'check-version: 版本不一致\n'
    + `  package.json   version = ${pkg.version}\n`
    + `  lib/client.js  VERSION = ${clientVersion}\n`
    + '两处必须相同，否则页面上 __DSH_TOOLBOX__.build 报的版本是假的。',
  )
  process.exit(1)
}

console.log(`check-version: OK (${clientVersion})`)
