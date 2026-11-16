import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const htmlPath = join(dist, 'index.html')
let html = readFileSync(htmlPath, 'utf8')

function findAsset(ext) {
  const root = readdirSync(dist).find((f) => f.endsWith(ext) && f.startsWith('index-'))
  if (root) return { file: root, path: join(dist, root), src: `/${root}` }
  const assetsDir = join(dist, 'assets')
  if (existsSync(assetsDir)) {
    const f = readdirSync(assetsDir).find((n) => n.endsWith(ext) && n.startsWith('index-'))
    if (f) return { file: f, path: join(assetsDir, f), src: `/assets/${f}` }
  }
  return null
}

const js = findAsset('.js')
const css = findAsset('.css')
if (!js || !css) {
  console.error('inline-dist: missing bundle files', { js, css })
  process.exit(1)
}

const jsCode = readFileSync(js.path, 'utf8')
const cssCode = readFileSync(css.path, 'utf8')

const jsRe = new RegExp(`<script[^>]*src="${js.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`)
const cssRe = new RegExp(`<link[^>]*href="${css.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`)

const outJs = html.replace(jsRe, () => `<script type="module">${jsCode.replace(/<\/script>/gi, '<\\/script>')}</script>`)
const out = outJs.replace(cssRe, () => `<style>${cssCode}</style>`)

if (out === html) {
  console.error('inline-dist: failed to replace script/style tags', { js: js.src, css: css.src })
  process.exit(1)
}

writeFileSync(htmlPath, out)
unlinkSync(js.path)
unlinkSync(css.path)

const assetsDir = join(dist, 'assets')
if (existsSync(assetsDir)) {
  try {
    const remaining = readdirSync(assetsDir)
    if (remaining.length === 0) rmSync(assetsDir, { recursive: true, force: true })
  } catch {}
}

console.log(`inline-dist: inlined ${js.src} + ${css.src} -> ${(out.length / 1024).toFixed(0)} KB`)
