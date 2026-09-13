import { Marked } from 'marked'
import TurndownService from 'turndown'

const markdownParser = new Marked({
  gfm: true,
  breaks: false,
})

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
})

turndown.addRule('strikethrough', {
  filter: ['del', 's'] as unknown as TurndownService.Filter,
  replacement(content) {
    return `~~${content}~~`
  },
})

turndown.keep(['u'])

export function markdownToHtml(markdown: string) {
  return markdownParser.parse(markdown || '', { async: false }) as string
}

export function htmlToMarkdown(html: string) {
  return turndown.turndown(html || '')
}

/** 去掉划线 mark，避免写回 Markdown 时带上标注 DOM */
export function unwrapMarkLayers(root: HTMLElement) {
  root.querySelectorAll('.mark-layer').forEach((node) => {
    const parent = node.parentNode
    if (!parent) return
    while (node.firstChild) parent.insertBefore(node.firstChild, node)
    parent.removeChild(node)
    parent.normalize()
  })
}

export function serializeEditableHtml(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement
  unwrapMarkLayers(clone)
  return htmlToMarkdown(clone.innerHTML).trim() + '\n'
}

export function mergeFrontmatter(original: string, bodyMarkdown: string) {
  const match = original.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  const body = bodyMarkdown.replace(/^\uFEFF/, '')
  if (!match) return body
  return `${match[0]}${body.startsWith('\n') ? body.slice(1) : body}`
}
