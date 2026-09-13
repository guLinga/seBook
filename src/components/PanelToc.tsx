import type { TocItem } from '../types'
import './PanelToc.less'

type Props = {
  items: TocItem[]
  activeId: string
  onSelect: (id: string, index: number) => void
  charCount?: number
  readingTime?: string
}

function PanelToc({ items, activeId, onSelect, charCount, readingTime }: Props) {
  return (
    <aside className="panel-toc">
      <h2>目录</h2>
      {charCount !== undefined && readingTime ? (
        <p className="toc-stats">
          {charCount.toLocaleString()} 字 · 预计 {readingTime}读完
        </p>
      ) : null}
      {items.length === 0 ? <p className="empty">暂无标题</p> : null}
      <nav>
        {items.map((item, index) => (
          <button
            key={`${item.id}-${index}`}
            type="button"
            className={`toc-item level-${item.level}${activeId === item.id ? ' active' : ''}`}
            onClick={() => onSelect(item.id, index)}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default PanelToc
