import type { Annotation } from '../types'
import { stripFrontmatter } from './markdown'

export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ContentBlock = {
  /** 在 body（去 frontmatter）中的起止下标 */
  start: number
  end: number
  raw: string
  plain: string
}

export type ReplaceBlockResult = {
  content: string
  /** 被替换块在「渲染纯文本」中的起始偏移 */
  plainStart: number
  oldPlain: string
  newPlain: string
}

function splitFrontmatter(markdown: string) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (!match) return { frontmatter: '', body: markdown }
  return { frontmatter: match[0], body: markdown.slice(match[0].length) }
}

/** 将单块 Markdown 转为接近渲染结果的纯文本 */
export function blockToPlain(raw: string) {
  return raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 按空行切块；标题行单独成块。
 * 用于把选区定位到 Markdown 源中的一块。
 */
export function splitContentBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const lines = body.split(/(?<=\n)/)
  let i = 0
  let offset = 0

  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*$/.test(line)) {
      offset += line.length
      i += 1
      continue
    }

    if (/^#{1,6}\s+\S/.test(line)) {
      const start = offset
      const raw = line.replace(/\n$/, '')
      const end = start + line.length
      blocks.push({ start, end, raw, plain: blockToPlain(raw) })
      offset = end
      i += 1
      continue
    }

    const start = offset
    const chunk: string[] = []
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s+\S/.test(lines[i])) {
      chunk.push(lines[i])
      offset += lines[i].length
      i += 1
    }
    const raw = chunk.join('').replace(/\n$/, '')
    const end = start + chunk.join('').length
    if (raw.trim()) blocks.push({ start, end, raw, plain: blockToPlain(raw) })
  }

  return blocks
}

function formatBlock(text: string, headingLevel: HeadingLevel) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (headingLevel >= 1 && headingLevel <= 6) return `${'#'.repeat(headingLevel)} ${cleaned}`
  return cleaned
}

function ensureBlockSpacing(body: string, start: number, end: number, replacement: string) {
  let before = body.slice(0, start)
  let after = body.slice(end)
  const isHeading = /^#{1,6}\s+/.test(replacement)

  if (isHeading) {
    before = before.replace(/[ \t]*$/, '')
    if (before && !before.endsWith('\n\n')) {
      before = before.replace(/\n?$/, '\n\n')
    }
    after = after.replace(/^[ \t]*/, '')
    if (after && !after.startsWith('\n\n')) {
      after = after.replace(/^\n?/, '\n\n')
    }
  } else {
    before = before.replace(/[ \t]*$/, '')
    if (before && !before.endsWith('\n')) before += '\n'
    if (before && !/\n\n$/.test(before) && /[^\n]$/.test(before.replace(/\n$/, ''))) {
      // keep single newline between paragraphs when possible
    }
    after = after.replace(/^[ \t]*/, '')
    if (after && !after.startsWith('\n')) after = `\n${after}`
  }

  return before + replacement + after
}

/**
 * 用选区纯文本偏移定位块并替换。
 * plainOffset 使用与标注相同的渲染文本偏移（块纯文本顺序拼接）。
 */
export function replaceContentBlock(
  markdown: string,
  plainOffset: number,
  selectedText: string,
  newText: string,
  headingLevel: HeadingLevel,
): ReplaceBlockResult {
  const { frontmatter, body } = splitFrontmatter(markdown)
  const blocks = splitContentBlocks(body)
  if (!blocks.length) throw new Error('未找到可编辑内容')

  let cursor = 0
  let target: ContentBlock | null = null
  let plainStart = 0

  for (const block of blocks) {
    const next = cursor + block.plain.length
    if (plainOffset >= cursor && plainOffset < next) {
      target = block
      plainStart = cursor
      break
    }
    cursor = next
  }

  // 落在全文末尾时命中最后一块
  if (!target && blocks.length && plainOffset >= cursor) {
    target = blocks[blocks.length - 1]
    plainStart = cursor - target.plain.length
  }

  if (!target) {
    // 回退：用选中文本匹配
    const normalized = selectedText.replace(/\s+/g, ' ').trim()
    const matched = blocks.find((block) => block.plain.includes(normalized))
    if (!matched) throw new Error('无法定位要编辑的段落')
    target = matched
    plainStart = 0
    for (const block of blocks) {
      if (block === matched) break
      plainStart += block.plain.length
    }
  }

  const replacement = formatBlock(newText, headingLevel)
  if (!replacement) throw new Error('编辑内容不能为空')

  const nextBody = ensureBlockSpacing(body, target.start, target.end, replacement)
  const content = frontmatter + nextBody

  return {
    content,
    plainStart,
    oldPlain: target.plain,
    newPlain: blockToPlain(replacement),
  }
}

/** 按块替换结果重算标注偏移；无法对齐的相交标注会被移除 */
export function remapAnnotationsAfterEdit(
  annotations: Annotation[],
  plainStart: number,
  oldPlain: string,
  newPlain: string,
): Annotation[] {
  const oldEnd = plainStart + oldPlain.length
  const delta = newPlain.length - oldPlain.length
  const next: Annotation[] = []

  for (const item of annotations) {
    const { startOffset: start, endOffset: end } = item

    // 完全在编辑区之前
    if (end <= plainStart) {
      next.push(item)
      continue
    }

    // 完全在编辑区之后
    if (start >= oldEnd) {
      next.push({
        ...item,
        startOffset: start + delta,
        endOffset: end + delta,
      })
      continue
    }

    // 完全落在被编辑块内：尝试在新文本中保留相对位置
    if (start >= plainStart && end <= oldEnd) {
      const localStart = start - plainStart
      const localEnd = end - plainStart
      const oldSlice = oldPlain.slice(localStart, localEnd)
      const found = newPlain.indexOf(oldSlice)

      if (oldSlice && found !== -1) {
        next.push({
          ...item,
          startOffset: plainStart + found,
          endOffset: plainStart + found + oldSlice.length,
          text: oldSlice,
        })
        continue
      }

      // 文本已改写：若整块仍有内容，缩到整块；否则丢弃
      if (newPlain) {
        next.push({
          ...item,
          startOffset: plainStart,
          endOffset: plainStart + newPlain.length,
          text: newPlain,
        })
      }
      continue
    }

    // 与编辑区部分相交：丢弃，避免错位高亮
  }

  return next
}

export function getBodyPlainLength(markdown: string) {
  const body = stripFrontmatter(markdown)
  return splitContentBlocks(body).reduce((sum, block) => sum + block.plain.length, 0)
}
