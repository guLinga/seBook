/** 将 Range 边界（可能是元素节点）转为 root 内的纯文本偏移 */
export function getTextOffsetInRoot(root: HTMLElement, node: Node, offset: number) {
  if (!root.contains(node) && root !== node) return 0

  if (node.nodeType === Node.TEXT_NODE) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let total = 0
    let current = walker.nextNode()
    while (current) {
      if (current === node) return total + clamp(offset, 0, current.textContent?.length || 0)
      total += current.textContent?.length || 0
      current = walker.nextNode()
    }
    return total
  }

  // 元素节点：offset 是 childNodes 下标，表示落在该子节点之前
  const parent = node as Element
  const boundary = offset < parent.childNodes.length ? parent.childNodes[offset] : null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current = walker.nextNode() as Text | null

  while (current) {
    if (boundary) {
      if (isAtOrAfterBoundary(current, boundary)) return total
    } else if (!parent.contains(current)) {
      // offset === childNodes.length：停在 parent 内容之后
      return total
    }

    total += current.textContent?.length || 0
    current = walker.nextNode() as Text | null
  }

  return total
}

export function getRangeFromOffsets(root: HTMLElement, start: number, end: number) {
  if (end < start) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null
  let total = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0

  while (current) {
    const length = current.textContent?.length || 0
    const nextTotal = total + length

    if (!startNode && start <= nextTotal) {
      startNode = current
      startOffset = start - total
    }

    if (!endNode && end <= nextTotal) {
      endNode = current
      endOffset = end - total
      break
    }

    total = nextTotal
    current = walker.nextNode() as Text | null
  }

  if (!startNode) return null
  if (!endNode) {
    const last = getLastTextNode(root)
    if (!last) return null
    endNode = last
    endOffset = last.textContent?.length || 0
  }

  const range = document.createRange()
  range.setStart(startNode, clamp(startOffset, 0, startNode.textContent?.length || 0))
  range.setEnd(endNode, clamp(endOffset, 0, endNode.textContent?.length || 0))
  return range
}

type TextSlice = {
  node: Text
  start: number
  end: number
}

/** 按文本节点切片包裹，支持整段/跨段落选区（surroundContents 跨块会失败） */
export function wrapRangeWithMark(range: Range, createMark: () => HTMLElement) {
  const slices = getTextSlicesInRange(range)
  if (!slices.length) return []

  const marks: HTMLElement[] = []

  // 从后往前包，避免前面改 DOM 影响后面的节点引用
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const slice = slices[i]
    if (slice.start >= slice.end) continue

    const mark = createMark()
    const sub = document.createRange()
    sub.setStart(slice.node, slice.start)
    sub.setEnd(slice.node, slice.end)

    try {
      sub.surroundContents(mark)
      marks.push(mark)
    } catch {
      const contents = sub.extractContents()
      mark.appendChild(contents)
      sub.insertNode(mark)
      marks.push(mark)
    }
  }

  return marks
}

function getTextSlicesInRange(range: Range): TextSlice[] {
  const ancestor = range.commonAncestorContainer
  const container =
    ancestor.nodeType === Node.ELEMENT_NODE
      ? (ancestor as HTMLElement)
      : ancestor.parentElement
  if (!container) return []

  const slices: TextSlice[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null

  while (current) {
    if (range.intersectsNode(current)) {
      const length = current.textContent?.length || 0
      const start =
        current === range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startOffset
          : 0
      const end =
        current === range.endContainer && range.endContainer.nodeType === Node.TEXT_NODE
          ? range.endOffset
          : length
      const safeStart = clamp(start, 0, length)
      const safeEnd = clamp(end, 0, length)
      if (safeEnd > safeStart && current.textContent!.slice(safeStart, safeEnd).trim()) {
        slices.push({ node: current, start: safeStart, end: safeEnd })
      }
    }
    current = walker.nextNode() as Text | null
  }

  return slices
}

function isAtOrAfterBoundary(textNode: Text, boundary: Node) {
  if (boundary === textNode) return true
  if (boundary.nodeType === Node.ELEMENT_NODE && (boundary as Element).contains(textNode)) {
    return true
  }
  return (boundary.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function getLastTextNode(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null
  let last: Text | null = null
  while (current) {
    last = current
    current = walker.nextNode() as Text | null
  }
  return last
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
