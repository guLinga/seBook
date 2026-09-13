import { useCallback, useEffect, useRef, useState } from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type Options = {
  delay?: number
  enabled?: boolean
  onSave: (value: string) => Promise<void>
}

export function useAutoSave(value: string, { delay = 600, enabled = true, onSave }: Options) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(value)
  const lastSaved = useRef<string | null>(null)
  const timer = useRef<number | null>(null)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    latest.current = value
  }, [value])

  const flush = useCallback(async () => {
    if (!enabled) return
    const next = latest.current
    if (next === lastSaved.current) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    setError(null)
    try {
      await onSaveRef.current(next)
      // 仅当保存期间没有更新的内容时，才标记该版本已落盘
      if (latest.current === next) {
        lastSaved.current = next
        setStatus('saved')
      } else {
        setStatus('saving')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (lastSaved.current === null) {
      lastSaved.current = value
      setStatus('saved')
      return
    }
    if (value === lastSaved.current) return

    setStatus('saving')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void flush()
    }, delay)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [value, delay, enabled, flush])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (timer.current) window.clearTimeout(timer.current)
        void flush()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flush])

  const markSynced = useCallback((content: string) => {
    lastSaved.current = content
    latest.current = content
    setStatus('saved')
    setError(null)
  }, [])

  return { status, error, flush, markSynced }
}
