import type { AnnotationType } from '../types'
import { HIGHLIGHT_COLORS } from '../types'
import './ToolbarAnnotation.less'

type Props = {
  rect: DOMRect
  mode: 'create' | 'edit'
  color: string
  onColorChange: (color: string) => void
  activeType: AnnotationType | null
  pendingType: 'doubt' | 'thought' | null
  noteDraft: string
  onNoteDraftChange: (value: string) => void
  onHighlight: () => void
  onDoubt: () => void
  onThought: () => void
  onConfirmDoubt: () => void
  onConfirmThought: () => void
  onSaveEdit?: () => void
  onDelete?: () => void
  onCancel: () => void
}

function ToolbarAnnotation({
  rect,
  mode,
  color,
  onColorChange,
  activeType,
  pendingType,
  noteDraft,
  onNoteDraftChange,
  onHighlight,
  onDoubt,
  onThought,
  onConfirmDoubt,
  onConfirmThought,
  onSaveEdit,
  onDelete,
  onCancel,
}: Props) {
  const top = Math.max(12, rect.top + window.scrollY - 140)
  const left = Math.min(window.innerWidth - 320, Math.max(12, rect.left + rect.width / 2 - 150))
  const showNoteBox = pendingType !== null || (mode === 'edit' && activeType !== 'highlight')

  return (
    <div
      className="toolbar-annotation"
      style={{ top, left }}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('textarea, input')) return
        e.preventDefault()
      }}
    >
      <div className="colors">
        {HIGHLIGHT_COLORS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`swatch${color === item.value ? ' active' : ''}`}
            style={{ backgroundColor: item.value }}
            onClick={() => onColorChange(item.value)}
            aria-label={item.id}
          />
        ))}
      </div>

      <div className="actions">
        <button
          type="button"
          className={activeType === 'highlight' ? 'active' : ''}
          onClick={onHighlight}
        >
          重点
        </button>
        <button type="button" className={activeType === 'doubt' ? 'active' : ''} onClick={onDoubt}>
          疑问
        </button>
        <button
          type="button"
          className={activeType === 'thought' ? 'active' : ''}
          onClick={onThought}
        >
          写想法
        </button>
      </div>

      {showNoteBox ? (
        <div className="note-box">
          <textarea
            value={noteDraft}
            onChange={(e) => onNoteDraftChange(e.target.value)}
            placeholder={
              (pendingType || activeType) === 'doubt' ? '写下疑问（可选）' : '写下你的想法'
            }
            rows={3}
          />
        </div>
      ) : null}

      <div className="actions">
        {mode === 'create' ? (
          pendingType ? (
            <button
              type="button"
              onClick={pendingType === 'doubt' ? onConfirmDoubt : onConfirmThought}
            >
              保存
            </button>
          ) : null
        ) : (
          <>
            <button type="button" onClick={onSaveEdit}>
              保存修改
            </button>
            <button type="button" className="danger" onClick={onDelete}>
              删除
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

export default ToolbarAnnotation
