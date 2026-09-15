const BLOCK_SELECTOR = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote'

function getBlockElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.matches(BLOCK_SELECTOR)) return current
    current = current.parentNode
  }
  return null
}

function placeCaretAtStart(el: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function placeCaretAtEnd(el: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getPrefix(block: HTMLElement, range: Range) {
  const prefixRange = document.createRange()
  prefixRange.selectNodeContents(block)
  prefixRange.setEnd(range.startContainer, range.startOffset)
  return prefixRange.toString()
}

/**
 * 在空格 keydown 时同步转换（此时空格尚未插入），避免先存成段落里的 ## 再被 turndown 转义
 */
export function tryApplyMarkdownShortcutOnSpace(root: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey) return false

  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return false

  const block = getBlockElement(range.startContainer, root)
  if (!block || block.closest('.mark-layer')) return false
  if (!/^(P|DIV)$/i.test(block.tagName)) return false

  const prefix = getPrefix(block, range)

  const headingMatch = /^(#{1,6})$/.exec(prefix)
  if (headingMatch) {
    event.preventDefault()
    convertBlock(block, `h${headingMatch[1].length}`, headingMatch[0].length)
    return true
  }

  const quoteMatch = /^>$/.exec(prefix)
  if (quoteMatch) {
    event.preventDefault()
    convertBlock(block, 'blockquote', quoteMatch[0].length)
    return true
  }

  const ulMatch = /^[-*+]$/.exec(prefix)
  if (ulMatch) {
    event.preventDefault()
    convertToList(block, 'ul', ulMatch[0].length)
    return true
  }

  const olMatch = /^(\d+)\.$/.exec(prefix)
  if (olMatch) {
    event.preventDefault()
    convertToList(block, 'ol', olMatch[0].length)
    return true
  }

  return false
}

function convertBlock(block: HTMLElement, tagName: string, markerLength: number) {
  const rest = (block.textContent || '').slice(markerLength)
  const next = document.createElement(tagName)
  if (tagName === 'blockquote') {
    const p = document.createElement('p')
    if (rest) p.textContent = rest
    else p.appendChild(document.createElement('br'))
    next.appendChild(p)
    block.replaceWith(next)
    placeCaretAtStart(p)
    return
  }

  if (rest) next.textContent = rest
  else next.appendChild(document.createElement('br'))
  block.replaceWith(next)
  if (rest) placeCaretAtEnd(next)
  else placeCaretAtStart(next)
}

function convertToList(block: HTMLElement, listTag: 'ul' | 'ol', markerLength: number) {
  const rest = (block.textContent || '').slice(markerLength)
  const list = document.createElement(listTag)
  const li = document.createElement('li')
  if (rest) li.textContent = rest
  else li.appendChild(document.createElement('br'))
  list.appendChild(li)
  block.replaceWith(list)
  if (rest) placeCaretAtEnd(li)
  else placeCaretAtStart(li)
}

/** 标题开头按 Backspace：降为正文段落 */
export function tryConvertHeadingToParagraphOnBackspace(
  root: HTMLElement,
  event: KeyboardEvent,
): boolean {
  if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey) return false

  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return false

  const block = getBlockElement(range.startContainer, root)
  if (!block || !/^H[1-6]$/i.test(block.tagName)) return false
  if (block.closest('.mark-layer')) return false

  // 光标必须在标题最开头
  if (getPrefix(block, range).length > 0) return false

  event.preventDefault()

  const p = document.createElement('p')
  while (block.firstChild) p.appendChild(block.firstChild)
  if (!(p.textContent || '').trim()) {
    p.textContent = ''
    p.appendChild(document.createElement('br'))
  }
  block.replaceWith(p)
  placeCaretAtStart(p)
  return true
}

/** 标题中回车：拆出新段落，避免继续生成同级标题 */
export function tryBreakHeadingOnEnter(root: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false

  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return false

  const block = getBlockElement(range.startContainer, root)
  if (!block || !/^H[1-6]$/i.test(block.tagName)) return false

  event.preventDefault()

  // 空标题回车：直接变成正文，避免留下空标题
  if (!(block.textContent || '').trim()) {
    const p = document.createElement('p')
    p.appendChild(document.createElement('br'))
    block.replaceWith(p)
    placeCaretAtStart(p)
    return true
  }

  const afterRange = document.createRange()
  afterRange.selectNodeContents(block)
  afterRange.setStart(range.startContainer, range.startOffset)
  const afterText = afterRange.toString()
  afterRange.deleteContents()

  const p = document.createElement('p')
  if (afterText) p.textContent = afterText
  else p.appendChild(document.createElement('br'))
  block.after(p)
  placeCaretAtStart(p)
  return true
}
