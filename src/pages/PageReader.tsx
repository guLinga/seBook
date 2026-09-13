import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
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
  saveProgress,
  updateAnnotation,
} from '../api/books'
import { useTheme } from '../hooks/useTheme'
import type { Annotation, AnnotationType, BookDetail, TocItem } from '../types'
import { HIGHLIGHT_COLORS } from '../types'
import {
  countContentChars,
  formatReadingTime,
  getOffsetInScroller,
  stripFrontmatter,
} from '../utils/markdown'
import { getRangeFromOffsets, getTextOffsetInRoot } from '../utils/selection'
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

function PageReader() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)
  const saveTimer = useRef<number | null>(null)

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

  const markdown = useMemo(() => (book ? stripFrontmatter(book.content) : ''), [book])
  const charCount = useMemo(() => countContentChars(markdown), [markdown])
  const readingTime = useMemo(() => formatReadingTime(charCount), [charCount])
  const thoughts = useMemo(
    () => annotations.filter((item) => item.type === 'thought'),
    [annotations],
  )
  const showToolbar = Boolean(toolbarRect && (selection || editingId))
  const toolbarMode = editingId ? 'edit' : 'create'

  function getHeadingElements() {
    return Array.from(contentRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') || []) as HTMLElement[]
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

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError('')
      restoredRef.current = false
      clearToolbar()
      try {
        const [bookData, annotationData, progressData] = await Promise.all([
          fetchBook(id),
          fetchAnnotations(id),
          fetchProgress(id),
        ])
        if (cancelled) return
        setBook(bookData)
        setAnnotations(annotationData)
        setToc([])

        requestAnimationFrame(() => {
          const el = scrollRef.current
          if (!el) return
          const max = el.scrollHeight - el.clientHeight
          el.scrollTop = Math.max(0, max * (progressData.scrollRatio || 0))
          restoredRef.current = true
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  useLayoutEffect(() => {
    const headings = getHeadingElements()
    if (!markdown) {
      setToc([])
      return
    }

    const used = new Map<string, number>()
    const nextToc = headings.map((heading, index) => {
      const level = Number(heading.tagName.replace('H', '')) || 1
      const text = (heading.textContent || '').replace(/\s+/g, ' ').trim() || `标题 ${index + 1}`
      let id = text
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]/g, '') || `heading-${index}`
      const count = used.get(id) || 0
      used.set(id, count + 1)
      if (count > 0) id = `${id}-${count}`
      heading.id = id
      heading.dataset.tocIndex = String(index)
      return { id, text, level }
    })

    setToc((prev) => {
      if (
        prev.length === nextToc.length &&
        prev.every((item, index) => item.id === nextToc[index].id && item.text === nextToc[index].text)
      ) {
        return prev
      }
      return nextToc
    })
  }, [markdown])

  useLayoutEffect(() => {
    const root = contentRef.current
    if (!root) return

    root.querySelectorAll('.mark-layer').forEach((node) => {
      const parent = node.parentNode
      if (!parent) return
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
      parent.normalize()
    })

    // 标注改写 DOM 后，重新同步标题 id，避免跳转失效
    getHeadingElements().forEach((heading, index) => {
      const tocId = toc[index]?.id
      if (tocId) {
        heading.id = tocId
        heading.dataset.tocIndex = String(index)
      }
    })

    if (!annotations.length) return

    const sorted = [...annotations].sort((a, b) => b.startOffset - a.startOffset)
    for (const item of sorted) {
      const range = getRangeFromOffsets(root, item.startOffset, item.endOffset)
      if (!range) continue
      try {
        const mark = document.createElement('mark')
        mark.className = `mark-layer mark-${item.type}`
        mark.style.backgroundColor = `${item.color}88`
        mark.dataset.annotationId = item.id
        if (item.type === 'doubt') mark.classList.add('is-doubt')
        if (item.type === 'thought') mark.classList.add('is-thought')
        if (editingId === item.id) mark.classList.add('is-editing')
        range.surroundContents(mark)
      } catch {
        // overlapping ranges may fail; skip safely
      }
    }
  }, [annotations, markdown, editingId, toc])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onScroll() {
      const target = scrollRef.current
      if (!target) return
      const max = target.scrollHeight - target.clientHeight
      const ratio = max > 0 ? target.scrollTop / max : 0

      if (restoredRef.current) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          void saveProgress(id, ratio)
        }, 400)
      }

      const headings = getHeadingElements()
      let current = ''
      for (const heading of headings) {
        const top = getOffsetInScroller(target, heading) - target.scrollTop
        if (top <= 8) current = heading.id
        else break
      }
      if (current) setActiveHeading(current)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [id, markdown])

  useEffect(() => {
    if (!showToolbar) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') clearToolbar()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showToolbar])

  function handleMouseUp(event: MouseEvent<HTMLElement>) {
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

    const text = sel.toString().trim()
    if (!text) {
      clearToolbar()
      return
    }

    const startOffset = getTextOffsetInRoot(root, range.startContainer, range.startOffset)
    const endOffset = getTextOffsetInRoot(root, range.endContainer, range.endOffset)
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

    // 将对应标题对齐到阅读区顶部
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
      <div className="reader-top">
        <div className="reader-top-left">
          <Link to="/" className="back-link">
            书架
          </Link>
          <div className="reader-title-block">
            <h1>{book.title}</h1>
            <p className="reader-stats">
              共 {charCount.toLocaleString()} 字 · 预计 {readingTime}读完
            </p>
          </div>
        </div>
        <div className="reader-top-right">
          <button type="button" className="btn-ghost" onClick={() => setShowThoughts((v) => !v)}>
            想法
          </button>
          <button type="button" className="btn-ghost" onClick={toggleTheme}>
            {theme === 'light' ? '深色' : '浅色'}
          </button>
          <button
            type="button"
            className="btn-ghost btn-danger-text"
            onClick={() => setShowDeleteBookModal(true)}
          >
            删除书籍
          </button>
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
          <article className="reader-content" ref={contentRef} onMouseUp={handleMouseUp}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </article>
        </div>

        {showThoughts ? (
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
    </main>
  )
}

export default PageReader
