import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  createAnnotation,
  deleteAnnotation,
  deleteBook,
  fetchAnnotations,
  fetchBook,
  fetchProgress,
  saveAnnotations,
  saveProgress,
  updateAnnotation,
  updateBookContent,
} from '../api/books'
import { useTheme } from '../hooks/useTheme'
import { useAutoSave } from '../hooks/useAutoSave'
import { isStaticReadonly } from '../config'
import type { Annotation, AnnotationType, BookDetail, TocItem } from '../types'
import { HIGHLIGHT_COLORS } from '../types'
import {
  countContentChars,
  formatReadingTime,
  getOffsetInScroller,
  stripFrontmatter,
} from '../utils/markdown'
import {
  markdownToHtml,
  mergeFrontmatter,
  serializeEditableHtml,
} from '../utils/markdown-html'
import { tryApplyMarkdownShortcutOnSpace, tryBreakHeadingOnEnter, tryConvertHeadingToParagraphOnBackspace } from '../utils/markdown-shortcuts'
import {
  decorateAnnotationMarkBounds,
  getOffsetsFromAnnotationMarks,
  getRangeFromOffsets,
  getTextOffsetInRoot,
  groupAnnotationMarks,
  wrapRangeWithMark,
} from '../utils/selection'
import PanelToc from '../components/PanelToc'
import PanelThoughts from '../components/PanelThoughts'
import ToolbarAnnotation from '../components/ToolbarAnnotation'
import ModalConfirm from '../components/ModalConfirm'
import './PageReader.less'

type SelectionState = {
  text: string
  startOffset: number
  endOffset: number
  rect: DOMRect
}

function buildTocFromHeadings(headings: HTMLElement[]) {
  const used = new Map<string, number>()
  return headings.map((heading, index) => {
    const level = Number(heading.tagName.replace('H', '')) || 1
    const text = (heading.textContent || '').replace(/\s+/g, ' ').trim() || `标题 ${index + 1}`
    let id =
      text
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '') || `heading-${index}`
    const count = used.get(id) || 0
    used.set(id, count + 1)
    if (count > 0) id = `${id}-${count}`
    heading.id = id
    heading.dataset.tocIndex = String(index)
    return { id, text, level } satisfies TocItem
  })
}

function PageReader() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { themeLabel, nextThemeLabel, toggleTheme } = useTheme()
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)
  const targetScrollRatioRef = useRef(0)
  const restoreDoneRef = useRef(false)
  const applyingRestoreRef = useRef(false)
  const lastAppliedTopRef = useRef(0)
  const latestRatioRef = useRef(0)
  const saveTimer = useRef<number | null>(null)
  const contentEpochRef = useRef('')
  const skipBootstrapRef = useRef(false)
  const bookRef = useRef<BookDetail | null>(null)
  const annotationsRef = useRef<Annotation[]>([])
  const annotationSaveTimer = useRef<number | null>(null)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [pendingType, setPendingType] = useState<'doubt' | 'thought' | null>(null)
  const [activeType, setActiveType] = useState<AnnotationType | null>(null)
  const [color, setColor] = useState<string>(HIGHLIGHT_COLORS[2].value)
  const [toolbarRect, setToolbarRect] = useState<DOMRect | null>(null)
  const [error, setError] = useState('')
  const [showThoughts, setShowThoughts] = useState(false)
  const [showDeleteBookModal, setShowDeleteBookModal] = useState(false)
  const [deletingBook, setDeletingBook] = useState(false)
  const [readProgress, setReadProgress] = useState(0)
  const [liveMarkdown, setLiveMarkdown] = useState('')
  const [contentRevision, setContentRevision] = useState(0)

  bookRef.current = book
  annotationsRef.current = annotations

  const markdown = useMemo(
    () => (isStaticReadonly && book ? stripFrontmatter(book.content) : liveMarkdown),
    [book, liveMarkdown],
  )
  const charCount = useMemo(() => countContentChars(markdown), [markdown])
  const readingTime = useMemo(() => formatReadingTime(charCount), [charCount])
  const thoughts = useMemo(
    () => annotations.filter((item) => item.type === 'thought'),
    [annotations],
  )
  const showToolbar = !isStaticReadonly && Boolean(toolbarRect && (selection || editingId))
  const toolbarMode = editingId ? 'edit' : 'create'
  const canEdit = !isStaticReadonly

  const persistContent = useCallback(
    async (fullContent: string) => {
      const updated = await updateBookContent(id, fullContent)
      setBook((prev) => {
        if (!prev) return updated
        // 保存期间若正文又变了，保留本地新内容，避免旧请求把 ## 段落写回界面
        if (prev.content !== fullContent) {
          return {
            ...updated,
            content: prev.content,
          }
        }
        skipBootstrapRef.current = true
        return updated
      })
    },
    [id],
  )

  const {
    status: saveStatus,
    error: saveError,
    markSynced,
    flush: flushContentSave,
  } = useAutoSave(book?.content || '', {
    delay: 700,
    enabled: canEdit && Boolean(book),
    onSave: persistContent,
  })

  function getHeadingElements() {
    return Array.from(contentRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') || []) as HTMLElement[]
  }

  function syncTocFromDom() {
    const nextToc = buildTocFromHeadings(getHeadingElements())
    setToc((prev) => {
      if (
        prev.length === nextToc.length &&
        prev.every((item, index) => item.id === nextToc[index].id && item.text === nextToc[index].text)
      ) {
        return prev
      }
      return nextToc
    })
  }

  function clearToolbar() {
    setSelection(null)
    setEditingId(null)
    setPendingType(null)
    setActiveType(null)
    setNoteDraft('')
    setToolbarRect(null)
  }

  function openEditAnnotation(item: Annotation, rect: DOMRect) {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setEditingId(item.id)
    setActiveType(item.type)
    setPendingType(item.type === 'highlight' ? null : item.type)
    setColor(item.color)
    setNoteDraft(item.note || '')
    setToolbarRect(rect)
  }

  function persistAnnotationOffsets(next: Annotation[]) {
    if (annotationSaveTimer.current) window.clearTimeout(annotationSaveTimer.current)
    annotationSaveTimer.current = window.setTimeout(() => {
      void saveAnnotations(id, next).catch(() => {
        // 偏移同步失败不打断正文编辑；下次编辑或刷新会再试
      })
    }, 700)
  }

  /** 正文插入/删除后，按仍挂在 DOM 上的划线重算偏移，避免重点/疑问/想法错位 */
  function syncAnnotationOffsetsFromDom(root: HTMLElement) {
    const current = annotationsRef.current
    if (!current.length) return

    const byId = groupAnnotationMarks(root)
    let changed = false
    const next = current.map((item) => {
      const marks = byId.get(item.id)
      if (!marks?.length) return item

      const offsets = getOffsetsFromAnnotationMarks(root, marks)
      if (!offsets) return item
      if (
        offsets.startOffset === item.startOffset &&
        offsets.endOffset === item.endOffset &&
        offsets.text === item.text
      ) {
        return item
      }

      changed = true
      return {
        ...item,
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        text: offsets.text || item.text,
      }
    })

    if (!changed) return
    annotationsRef.current = next
    setAnnotations(next)
    persistAnnotationOffsets(next)
  }

  function scheduleContentSaveFromDom() {
    const root = contentRef.current
    const current = bookRef.current
    if (!root || !current || !canEdit) return

    // 必须在可能触发划线重绘之前同步偏移（仍以 DOM mark 为准）
    syncAnnotationOffsetsFromDom(root)

    const body = serializeEditableHtml(root)
    const full = mergeFrontmatter(current.content, body)
    setLiveMarkdown(stripFrontmatter(full))
    syncTocFromDom()
    // 触发自动保存：只更新 content 字段，避免整页重挂载
    setBook((prev) => (prev ? { ...prev, content: full } : prev))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError('')
      restoredRef.current = false
      restoreDoneRef.current = false
      lastAppliedTopRef.current = 0
      targetScrollRatioRef.current = 0
      contentEpochRef.current = ''
      skipBootstrapRef.current = false
      setReadProgress(0)
      setLiveMarkdown('')
      clearToolbar()
      try {
        const [bookData, annotationData, progressData] = await Promise.all([
          fetchBook(id),
          fetchAnnotations(id),
          fetchProgress(id),
        ])
        if (cancelled) return
        const ratio = progressData.scrollRatio ?? 0
        targetScrollRatioRef.current = ratio
        latestRatioRef.current = ratio
        setReadProgress(ratio)
        setLiveMarkdown(stripFrontmatter(bookData.content))
        markSynced(bookData.content)
        setBook(bookData)
        setAnnotations(annotationData)
        setToc([])
        setContentRevision((value) => value + 1)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      }
    }

    void load()
    return () => {
      cancelled = true
      if (annotationSaveTimer.current) {
        window.clearTimeout(annotationSaveTimer.current)
        annotationSaveTimer.current = null
      }
    }
  }, [id, markSynced])

  // 本地可编辑：用 HTML 引导正文，之后由 contentEditable 接管
  useLayoutEffect(() => {
    if (!canEdit || !book) return
    const root = contentRef.current
    if (!root) return

    const epoch = `${book.id}::${contentRevision}`
    if (skipBootstrapRef.current) {
      skipBootstrapRef.current = false
      contentEpochRef.current = epoch
      return
    }
    if (contentEpochRef.current === epoch) return

    root.innerHTML = markdownToHtml(stripFrontmatter(book.content))
    contentEpochRef.current = epoch
    setLiveMarkdown(stripFrontmatter(book.content))
    syncTocFromDom()
  }, [book, canEdit, contentRevision])

  // 静态只读：仍从 ReactMarkdown 生成目录
  useLayoutEffect(() => {
    if (canEdit) return
    if (!markdown) {
      setToc([])
      return
    }
    syncTocFromDom()
  }, [canEdit, markdown])

  useLayoutEffect(() => {
    const root = contentRef.current
    if (!root) return

    getHeadingElements().forEach((heading, index) => {
      const tocId = toc[index]?.id
      if (tocId) {
        heading.id = tocId
        heading.dataset.tocIndex = String(index)
      }
    })

    const visible = annotations.filter((item) => item.endOffset > item.startOffset)
    const byId = groupAnnotationMarks(root)
    const sameIds =
      byId.size === visible.length && visible.every((item) => byId.has(item.id))

    // DOM 已有完整划线：原地改样式并校准偏移，避免 unwrap 后用旧偏移重绘错位
    if (sameIds) {
      let offsetsChanged = false
      const next = annotations.map((item) => {
        const marks = byId.get(item.id)
        if (!marks?.length) return item

        for (const mark of marks) {
          mark.className = `mark-layer mark-${item.type}`
          mark.style.backgroundColor = `${item.color}88`
          mark.style.setProperty('--mark-accent', item.color)
          mark.dataset.annotationId = item.id
          mark.dataset.color = item.color
          mark.contentEditable = 'false'
          mark.classList.toggle('is-doubt', item.type === 'doubt')
          mark.classList.toggle('is-thought', item.type === 'thought')
          mark.classList.toggle('is-editing', editingId === item.id)
        }
        decorateAnnotationMarkBounds(marks)

        const offsets = getOffsetsFromAnnotationMarks(root, marks)
        if (
          !offsets ||
          (offsets.startOffset === item.startOffset &&
            offsets.endOffset === item.endOffset &&
            (!offsets.text || offsets.text === item.text))
        ) {
          return item
        }

        offsetsChanged = true
        return {
          ...item,
          startOffset: offsets.startOffset,
          endOffset: offsets.endOffset,
          text: offsets.text || item.text,
        }
      })

      if (offsetsChanged) {
        annotationsRef.current = next
        setAnnotations(next)
        persistAnnotationOffsets(next)
      }
      return
    }

    root.querySelectorAll('.mark-layer').forEach((node) => {
      const parent = node.parentNode
      if (!parent) return
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
      parent.normalize()
    })

    if (!annotations.length) return

    const sorted = [...annotations].sort((a, b) => b.startOffset - a.startOffset)
    for (const item of sorted) {
      if (item.endOffset <= item.startOffset) continue
      const range = getRangeFromOffsets(root, item.startOffset, item.endOffset)
      if (!range || range.collapsed) continue
      wrapRangeWithMark(range, () => {
        const mark = document.createElement('mark')
        mark.className = `mark-layer mark-${item.type}`
        mark.style.backgroundColor = `${item.color}88`
        mark.style.setProperty('--mark-accent', item.color)
        mark.dataset.annotationId = item.id
        mark.dataset.color = item.color
        mark.contentEditable = 'false'
        if (item.type === 'doubt') mark.classList.add('is-doubt')
        if (item.type === 'thought') mark.classList.add('is-thought')
        if (editingId === item.id) mark.classList.add('is-editing')
        return mark
      })
      const created = root.querySelectorAll<HTMLElement>(
        `.mark-layer[data-annotation-id="${item.id}"]`,
      )
      decorateAnnotationMarkBounds([...created])
    }
  }, [annotations, editingId, toc, contentRevision])

  useLayoutEffect(() => {
    if (!book || restoreDoneRef.current) return

    const el = scrollRef.current
    if (!el) return

    const ratio = targetScrollRatioRef.current
    let alive = true
    let lastHeight = -1
    let stableFrames = 0

    function applyRestore() {
      if (!alive || !scrollRef.current || restoreDoneRef.current) return
      const target = scrollRef.current
      const max = target.scrollHeight - target.clientHeight

      // 高度未就绪时继续等，不写入错误进度
      if (ratio > 0 && max <= 0) return

      const nextTop = Math.max(0, max * ratio)
      applyingRestoreRef.current = true
      if (Math.abs(target.scrollTop - nextTop) > 1) target.scrollTop = nextTop
      lastAppliedTopRef.current = nextTop
      applyingRestoreRef.current = false
      latestRatioRef.current = ratio
      restoredRef.current = true
      setReadProgress(ratio)

      const height = target.scrollHeight
      if (height === lastHeight) stableFrames += 1
      else {
        stableFrames = 0
        lastHeight = height
      }

      // 连续几帧高度不变，认为布局稳定，结束校正
      if (ratio === 0 || stableFrames >= 3) restoreDoneRef.current = true
    }

    function onUserScrollIntent() {
      if (!restoredRef.current || applyingRestoreRef.current) return
      restoreDoneRef.current = true
    }

    applyRestore()
    requestAnimationFrame(applyRestore)

    const observer = new ResizeObserver(() => {
      applyRestore()
    })
    observer.observe(el)
    if (contentRef.current) observer.observe(contentRef.current)

    el.addEventListener('wheel', onUserScrollIntent, { passive: true })
    el.addEventListener('touchstart', onUserScrollIntent, { passive: true })
    el.addEventListener('pointerdown', onUserScrollIntent)

    const doneTimer = window.setTimeout(() => {
      applyRestore()
      restoreDoneRef.current = true
      observer.disconnect()
    }, 2000)

    return () => {
      alive = false
      window.clearTimeout(doneTimer)
      observer.disconnect()
      el.removeEventListener('wheel', onUserScrollIntent)
      el.removeEventListener('touchstart', onUserScrollIntent)
      el.removeEventListener('pointerdown', onUserScrollIntent)
    }
  }, [book, annotations, toc, contentRevision])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function flushProgress() {
      // 恢复未完成前不落盘，避免把中间错误比例写进去
      if (!restoreDoneRef.current) return
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      void saveProgress(id, latestRatioRef.current)
    }

    function onScroll() {
      const target = scrollRef.current
      if (!target) return
      const max = target.scrollHeight - target.clientHeight
      const ratio = max > 0 ? target.scrollTop / max : 0

      if (!applyingRestoreRef.current) {
        latestRatioRef.current = ratio
        setReadProgress(ratio)
      }

      if (!restoreDoneRef.current) return

      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void saveProgress(id, latestRatioRef.current)
      }, 400)

      const headings = getHeadingElements()
      let current = ''
      for (const heading of headings) {
        const top = getOffsetInScroller(target, heading) - target.scrollTop
        if (top <= 8) current = heading.id
        else break
      }
      if (current) setActiveHeading(current)
    }

    function onPageHide() {
      flushProgress()
      if (canEdit) {
        void flushContentSave()
        if (annotationSaveTimer.current) {
          window.clearTimeout(annotationSaveTimer.current)
          annotationSaveTimer.current = null
          void saveAnnotations(id, annotationsRef.current).catch(() => {})
        }
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushProgress()
        if (canEdit) {
          void flushContentSave()
          if (annotationSaveTimer.current) {
            window.clearTimeout(annotationSaveTimer.current)
            annotationSaveTimer.current = null
            void saveAnnotations(id, annotationsRef.current).catch(() => {})
          }
        }
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flushProgress()
      if (canEdit) void flushContentSave()
    }
  }, [id, markdown, canEdit, flushContentSave])

  useEffect(() => {
    if (!showToolbar) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') clearToolbar()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showToolbar])

  function handleContentInput(_event: FormEvent<HTMLElement>) {
    if (!canEdit) return
    scheduleContentSaveFromDom()
  }

  function handleContentKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!canEdit) return
    const root = contentRef.current
    if (!root) return

    if (tryConvertHeadingToParagraphOnBackspace(root, event.nativeEvent)) {
      scheduleContentSaveFromDom()
      return
    }

    if (tryBreakHeadingOnEnter(root, event.nativeEvent)) {
      scheduleContentSaveFromDom()
      return
    }

    if (tryApplyMarkdownShortcutOnSpace(root, event.nativeEvent)) {
      scheduleContentSaveFromDom()
    }
  }

  function handleMouseUp(event: MouseEvent<HTMLElement>) {
    if (isStaticReadonly) return

    const root = contentRef.current
    if (!root) return

    const mark = (event.target as HTMLElement).closest('.mark-layer') as HTMLElement | null
    if (mark?.dataset.annotationId) {
      const item = annotations.find((annotation) => annotation.id === mark.dataset.annotationId)
      if (item) {
        openEditAnnotation(item, mark.getBoundingClientRect())
        return
      }
    }

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (!editingId) clearToolbar()
      return
    }

    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) {
      clearToolbar()
      return
    }

    const text = sel.toString().replace(/\s+/g, ' ').trim()
    if (!text) {
      clearToolbar()
      return
    }

    let startOffset = getTextOffsetInRoot(root, range.startContainer, range.startOffset)
    let endOffset = getTextOffsetInRoot(root, range.endContainer, range.endOffset)
    if (startOffset > endOffset) {
      const swap = startOffset
      startOffset = endOffset
      endOffset = swap
    }
    if (endOffset <= startOffset) {
      clearToolbar()
      return
    }

    const rect = range.getBoundingClientRect()
    setEditingId(null)
    setSelection({ text, startOffset, endOffset, rect })
    setToolbarRect(rect)
    setPendingType(null)
    setActiveType(null)
    setNoteDraft('')
  }

  async function submitAnnotation(type: AnnotationType, note?: string) {
    if (!selection) return
    const root = contentRef.current
    if (root) syncAnnotationOffsetsFromDom(root)

    const item = await createAnnotation(id, {
      type,
      color,
      text: selection.text,
      note: note?.trim() || undefined,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
    })
    setAnnotations((prev) => [...prev, item])
    clearToolbar()
    window.getSelection()?.removeAllRanges()
  }

  async function handleSaveEdit() {
    if (!editingId || !activeType) return
    const note =
      activeType === 'highlight' ? undefined : noteDraft.trim() || undefined
    const item = await updateAnnotation(id, editingId, {
      type: activeType,
      color,
      note: activeType === 'highlight' ? '' : note || '',
    })
    setAnnotations((prev) => prev.map((annotation) => (annotation.id === item.id ? item : annotation)))
    clearToolbar()
  }

  async function handleDeleteAnnotation(annotationId: string) {
    await deleteAnnotation(id, annotationId)
    setAnnotations((prev) => prev.filter((item) => item.id !== annotationId))
    if (editingId === annotationId) clearToolbar()
  }

  async function handleDeleteBook() {
    if (!book) return
    setDeletingBook(true)
    try {
      await deleteBook(book.id)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
      setShowDeleteBookModal(false)
    } finally {
      setDeletingBook(false)
    }
  }

  function jumpToHeading(headingId: string, index: number) {
    const scroller = scrollRef.current
    if (!scroller) return

    const headings = getHeadingElements()
    const el =
      headings[index] ||
      headings.find((heading) => heading.id === headingId) ||
      null
    if (!el) return

    const top = Math.max(0, getOffsetInScroller(scroller, el))
    scroller.scrollTo({ top, behavior: 'auto' })
    setActiveHeading(el.id || headingId)
  }

  function jumpToAnnotation(item: Annotation) {
    const mark = contentRef.current?.querySelector(`[data-annotation-id="${item.id}"]`)
    const scroller = scrollRef.current
    if (!mark || !scroller) return
    const top = Math.max(0, getOffsetInScroller(scroller, mark as HTMLElement) - 80)
    scroller.scrollTo({ top, behavior: 'smooth' })
    openEditAnnotation(item, (mark as HTMLElement).getBoundingClientRect())
  }

  const saveLabel =
    saveStatus === 'saving'
      ? '保存中…'
      : saveStatus === 'error'
        ? saveError || '保存失败'
        : saveStatus === 'saved'
          ? '已保存'
          : ''

  if (error) {
    return (
      <main className="page-reader error-state">
        <p>{error}</p>
        <Link to="/">返回书架</Link>
      </main>
    )
  }

  if (!book) {
    return (
      <main className="page-reader">
        <p className="loading">加载中...</p>
      </main>
    )
  }

  return (
    <main className="page-reader">
      <div
        className="reader-progress"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(readProgress * 100)}
      >
        <div className="reader-progress-bar" style={{ width: `${readProgress * 100}%` }} />
      </div>

      <div className="reader-top">
        <div className="reader-top-left">
          <Link to="/" className="back-link">
            书架
          </Link>
          <div className="reader-title-block">
            <h1>{book.title}</h1>
            <p className="reader-stats">
              共 {charCount.toLocaleString()} 字 · 预计 {readingTime}读完 · 已读{' '}
              {Math.round(readProgress * 100)}%
              {canEdit && saveLabel ? (
                <span className={saveStatus === 'error' ? 'reader-save-error' : 'reader-save-status'}>
                  {' '}
                  · {saveLabel}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="reader-top-right">
          {isStaticReadonly ? null : (
            <button type="button" className="btn-ghost" onClick={() => setShowThoughts((v) => !v)}>
              想法
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={toggleTheme}
            title={`切换到${nextThemeLabel}模式`}
          >
            {themeLabel}
          </button>
          {isStaticReadonly ? null : (
            <button
              type="button"
              className="btn-ghost btn-danger-text"
              onClick={() => setShowDeleteBookModal(true)}
            >
              删除书籍
            </button>
          )}
        </div>
      </div>

      <div className="reader-body">
        <PanelToc
          items={toc}
          activeId={activeHeading}
          onSelect={jumpToHeading}
          charCount={charCount}
          readingTime={readingTime}
        />

        <div className="reader-scroll" ref={scrollRef}>
          {canEdit ? (
            <article
              className="reader-content is-editable"
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={handleContentInput}
              onKeyDown={handleContentKeyDown}
              onMouseUp={handleMouseUp}
            />
          ) : (
            <article className="reader-content" ref={contentRef} onMouseUp={handleMouseUp}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </article>
          )}
        </div>

        {showThoughts && !isStaticReadonly ? (
          <PanelThoughts
            items={thoughts}
            onJump={jumpToAnnotation}
            onDelete={(annotationId) => void handleDeleteAnnotation(annotationId)}
            onClose={() => setShowThoughts(false)}
          />
        ) : null}
      </div>

      {showToolbar && toolbarRect ? (
        <ToolbarAnnotation
          rect={toolbarRect}
          mode={toolbarMode}
          color={color}
          onColorChange={setColor}
          activeType={activeType}
          pendingType={pendingType}
          noteDraft={noteDraft}
          onNoteDraftChange={setNoteDraft}
          onHighlight={() => {
            setActiveType('highlight')
            setPendingType(null)
            if (!editingId) void submitAnnotation('highlight')
          }}
          onDoubt={() => {
            setActiveType('doubt')
            setPendingType('doubt')
          }}
          onThought={() => {
            setActiveType('thought')
            setPendingType('thought')
          }}
          onConfirmDoubt={() => void submitAnnotation('doubt', noteDraft)}
          onConfirmThought={() => void submitAnnotation('thought', noteDraft)}
          onSaveEdit={() => void handleSaveEdit()}
          onDelete={() => {
            if (editingId) void handleDeleteAnnotation(editingId)
          }}
          onCancel={clearToolbar}
        />
      ) : null}

      {isStaticReadonly ? null : (
        <ModalConfirm
          open={showDeleteBookModal}
          title="确认删除书籍"
          message={`确定删除《${book.title}》吗？删除后书籍内容、标注与阅读进度都会一起清除，且无法恢复。`}
          loading={deletingBook}
          onCancel={() => {
            if (!deletingBook) setShowDeleteBookModal(false)
          }}
          onConfirm={() => void handleDeleteBook()}
        />
      )}
    </main>
  )
}

export default PageReader
