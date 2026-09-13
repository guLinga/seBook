export function getTextOffsetInRoot(root: HTMLElement, node: Node, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current = walker.nextNode()

  while (current) {
    if (current === node) return total + offset
    total += current.textContent?.length || 0
    current = walker.nextNode()
  }

  return total
}

export function getRangeFromOffsets(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  let total = 0
  let startNode: Node | null = null
  let endNode: Node | null = null
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
    current = walker.nextNode()
  }

  if (!startNode || !endNode) return null

  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}
