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
const progressSrc = path.join(root, 'data', 'progress')
const progressDest = path.join(dist, 'progress')

if (!existsSync(indexHtml)) {
  console.error('dist/index.html 不存在，请先执行构建')
  process.exit(1)
}

// SPA：未知路径回退到前端路由
copyFileSync(indexHtml, notFoundHtml)

// 确保自定义域名写入产物
const domain = 'reSelf.1cor1514.site'
writeFileSync(cnamePath, `${domain}\n`, 'utf-8')

function copyJsonDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  if (!existsSync(src)) return 0
  let count = 0
  for (const name of readdirSync(src)) {
    if (!name.endsWith('.json')) continue
    copyFileSync(path.join(src, name), path.join(dest, name))
    count += 1
  }
  return count
}

// 把本地标注 / 进度同步进 Pages 产物（只读展示）
const annotationCount = copyJsonDir(annotationsSrc, annotationsDest)
const progressCount = copyJsonDir(progressSrc, progressDest)

const cname = readFileSync(cnamePath, 'utf-8').trim()
console.log(
  `GitHub Pages 已准备：404.html + CNAME (${cname}) + annotations (${annotationCount}) + progress (${progressCount})`,
)
