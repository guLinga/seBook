import { useEffect } from 'react'
import './ModalConfirm.less'

type Props = {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ModalConfirm({
  open,
  title = '确认删除',
  message,
  confirmText = '删除',
  cancelText = '取消',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onCancel()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="modal-confirm-mask" onClick={() => !loading && onCancel()}>
      <div
        className="modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="modal-confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-confirm-actions">
          <button type="button" className="btn-cancel" disabled={loading} onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className="btn-confirm" disabled={loading} onClick={onConfirm}>
            {loading ? '删除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalConfirm
