import type { Annotation } from '../types'
import './PanelThoughts.less'

type Props = {
  items: Annotation[]
  onJump: (item: Annotation) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function PanelThoughts({ items, onJump, onDelete, onClose }: Props) {
  return (
    <aside className="panel-thoughts">
      <div className="head">
        <h2>想法</h2>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      {items.length === 0 ? <p className="empty">还没有想法</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="quote" onClick={() => onJump(item)}>
              “{item.text}”
            </button>
            {item.note ? <p className="note">{item.note}</p> : null}
            <button type="button" className="delete" onClick={() => onDelete(item.id)}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default PanelThoughts
