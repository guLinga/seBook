import { useEffect, useMemo, useState } from 'react'
import type { TocItem } from '../types'
import './PanelToc.less'

type Props = {
  items: TocItem[]
  activeId: string
  onSelect: (id: string, index: number) => void
  charCount?: number
  readingTime?: string
}

type TocNode = TocItem & {
  index: number
  hasChildren: boolean
  ancestorIndexes: number[]
}

function buildTocNodes(items: TocItem[]): TocNode[] {
  const ancestorStack: number[] = []

  return items.map((item, index) => {
    while (ancestorStack.length > 0) {
      const parentIndex = ancestorStack[ancestorStack.length - 1]
      if (items[parentIndex].level < item.level) break
      ancestorStack.pop()
    }

    const ancestorIndexes = [...ancestorStack]
    let hasChildren = false
    for (let i = index + 1; i < items.length; i += 1) {
      if (items[i].level <= item.level) break
      hasChildren = true
      break
    }

    ancestorStack.push(index)
    return {
      ...item,
      index,
      hasChildren,
      ancestorIndexes,
    }
  })
}

function PanelToc({ items, activeId, onSelect, charCount, readingTime }: Props) {
  const nodes = useMemo(() => buildTocNodes(items), [items])
  const collapsibleIndexes = useMemo(
    () => nodes.filter((node) => node.hasChildren).map((node) => node.index),
    [nodes],
  )
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    setCollapsed((prev) => {
      const valid = new Set(collapsibleIndexes)
      const next = new Set<number>()
      let changed = false
      for (const index of prev) {
        if (valid.has(index)) next.add(index)
        else changed = true
      }
      if (next.size !== prev.size) changed = true
      return changed ? next : prev
    })
  }, [collapsibleIndexes])

  const allCollapsed =
    collapsibleIndexes.length > 0 && collapsibleIndexes.every((index) => collapsed.has(index))

  function toggleItem(index: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    if (allCollapsed) setCollapsed(new Set())
    else setCollapsed(new Set(collapsibleIndexes))
  }

  function isVisible(node: TocNode) {
    return node.ancestorIndexes.every((index) => !collapsed.has(index))
  }

  return (
    <aside className="panel-toc">
      <div className="toc-head">
        <h2>目录</h2>
        {collapsibleIndexes.length > 0 ? (
          <button type="button" className="toc-global-toggle" onClick={toggleAll}>
            {allCollapsed ? '展开全部' : '收起全部'}
          </button>
        ) : null}
      </div>
      {charCount !== undefined && readingTime ? (
        <p className="toc-stats">
          {charCount.toLocaleString()} 字 · 预计 {readingTime}读完
        </p>
      ) : null}
      {items.length === 0 ? <p className="empty">暂无标题</p> : null}
      <nav>
        {nodes.map((item) => {
          if (!isVisible(item)) return null
          return (
            <div
              key={`${item.id}-${item.index}`}
              className={`toc-row level-${item.level}${activeId === item.id ? ' active' : ''}`}
            >
              {item.hasChildren ? (
                <button
                  type="button"
                  className={`toc-twist${collapsed.has(item.index) ? ' is-collapsed' : ''}`}
                  aria-label={collapsed.has(item.index) ? '展开子目录' : '收起子目录'}
                  aria-expanded={!collapsed.has(item.index)}
                  onClick={() => toggleItem(item.index)}
                >
                  <span className="toc-twist-icon" aria-hidden="true" />
                </button>
              ) : (
                <span className="toc-twist-spacer" aria-hidden="true" />
              )}
              <button
                type="button"
                className="toc-item"
                onClick={() => onSelect(item.id, item.index)}
              >
                {item.text}
              </button>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

export default PanelToc
