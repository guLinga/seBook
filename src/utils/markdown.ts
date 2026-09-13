import type { TocItem } from '../types'

export function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
}

export function cleanHeadingText(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\{#Id#\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractToc(markdown: string): TocItem[] {
  const source = markdown.replace(/^---[\s\S]*?---\r?\n?/, '')
  const withoutCode = source.replace(/```[\s\S]*?```/g, '')
  const lines = withoutCode.split(/\r?\n/)
  const toc: TocItem[] = []
  const used = new Map<string, number>()

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) continue
    const level = match[1].length
    const text = cleanHeadingText(match[2].replace(/#+\s*$/, ''))
    if (!text) continue
    let id = slugify(text) || `heading-${toc.length}`
    const count = used.get(id) || 0
    used.set(id, count + 1)
    if (count > 0) id = `${id}-${count}`
    toc.push({ id, text, level })
  }

  return toc
}

export function getPlainText(markdown: string) {
  return markdown
    .replace(/^---[\s\S]*?---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---[\s\S]*?---\r?\n?/, '')
}

export function countContentChars(markdown: string) {
  return getPlainText(markdown).replace(/\s+/g, '').length
}

export function formatReadingTime(charCount: number, charsPerHour = 15000) {
  if (charCount <= 0) return '1 分钟'
  const totalMinutes = Math.max(1, Math.ceil((charCount / charsPerHour) * 60))
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

export function getNodeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join('')
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return getNodeText(props?.children)
  }
  return ''
}

/** 计算目标元素相对滚动容器内容顶部的距离 */
export function getOffsetInScroller(scroller: HTMLElement, target: HTMLElement) {
  const scrollerRect = scroller.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  return scroller.scrollTop + targetRect.top - scrollerRect.top
}
