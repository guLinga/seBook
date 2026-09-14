import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const indexHtml = path.join(dist, 'index.html')
const notFoundHtml = path.join(dist, '404.html')
const cnamePath = path.join(dist, 'CNAME')
const annotationsSrc = path.join(root, 'data', 'annotations')
const annotationsDest = path.join(dist, 'annotations')

if (!existsSync(indexHtml)) {
  console.error('dist/index.html 不存在，请先执行构建')
  process.exit(1)
}

// SPA：未知路径回退到前端路由
copyFileSync(indexHtml, notFoundHtml)

// 确保自定义域名写入产物
const domain = 'reSelf.1cor1514.site'
writeFileSync(cnamePath, `${domain}\n`, 'utf-8')

// 把本地标注同步进 Pages 产物（只读展示）
mkdirSync(annotationsDest, { recursive: true })
if (existsSync(annotationsSrc)) {
  for (const name of readdirSync(annotationsSrc)) {
    if (!name.endsWith('.json')) continue
    copyFileSync(path.join(annotationsSrc, name), path.join(annotationsDest, name))
  }
}

const cname = readFileSync(cnamePath, 'utf-8').trim()
const annotationCount = existsSync(annotationsDest)
  ? readdirSync(annotationsDest).filter((name) => name.endsWith('.json')).length
  : 0
console.log(`GitHub Pages 已准备：404.html + CNAME (${cname}) + annotations (${annotationCount})`)
