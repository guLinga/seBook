import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

type Pos = { top: number; left: number }

function getDefaultPos(rect: DOMRect): Pos {
  return {
    top: Math.max(12, rect.top - 140),
    left: Math.min(window.innerWidth - 320, Math.max(12, rect.left + rect.width / 2 - 150)),
  }
}

function clampPos(top: number, left: number, width: number, height: number): Pos {
  const maxLeft = Math.max(12, window.innerWidth - width - 12)
  const maxTop = Math.max(12, window.innerHeight - height - 12)
  return {
    top: Math.min(maxTop, Math.max(12, top)),
    left: Math.min(maxLeft, Math.max(12, left)),
  }
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
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originTop: number
    originLeft: number
  } | null>(null)
  const [pos, setPos] = useState<Pos>(() => getDefaultPos(rect))
  const [dragging, setDragging] = useState(false)

  const showNoteBox = pendingType !== null || (mode === 'edit' && activeType !== 'highlight')

  useEffect(() => {
    setPos(getDefaultPos(rect))
    dragRef.current = null
    setDragging(false)
  }, [rect.top, rect.left, rect.width, rect.height])

  function isDragHandleTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    if (target.closest('textarea, input, button, a')) return false
    return true
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDragHandleTarget(event.target)) return
    if (event.button !== 0) return

    const panel = panelRef.current
    if (!panel) return

    event.preventDefault()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originTop: pos.top,
      originLeft: pos.left,
    }
    setDragging(true)
    panel.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || drag.pointerId !== event.pointerId || !panel) return

    const nextTop = drag.originTop + (event.clientY - drag.startY)
    const nextLeft = drag.originLeft + (event.clientX - drag.startX)
    setPos(clampPos(nextTop, nextLeft, panel.offsetWidth, panel.offsetHeight))
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (panelRef.current?.hasPointerCapture(event.pointerId)) {
      panelRef.current.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={panelRef}
      className={`toolbar-annotation${dragging ? ' is-dragging' : ''}${showNoteBox ? ' has-note' : ''}`}
      style={{ top: pos.top, left: pos.left }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="drag-bar" aria-hidden="true">
        <span className="drag-grip" />
      </div>

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
