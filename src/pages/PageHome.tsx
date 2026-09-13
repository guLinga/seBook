import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBook, fetchBooks, importBooks } from '../api/books'
import type { BookMeta } from '../types'
import { useTheme } from '../hooks/useTheme'
import ModalConfirm from '../components/ModalConfirm'
import './PageHome.less'

function PageHome() {
  const { theme, toggleTheme } = useTheme()
  const [books, setBooks] = useState<BookMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BookMeta | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadBooks() {
    setLoading(true)
    setError('')
    try {
      const list = await fetchBooks()
      setBooks(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBooks()
  }, [])

  async function handleImport(files: FileList | null) {
    if (!files?.length) return
    setError('')
    try {
      await importBooks(files)
      await loadBooks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError('')
    try {
      await deleteBook(pendingDelete.id)
      setBooks((prev) => prev.filter((book) => book.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="page-home">
      <section className="hero">
        <h1>seRead</h1>
        <p>导入 Markdown，沉浸阅读与标记</p>
        <div className="hero-actions">
          <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
            导入 Markdown
          </button>
          <button type="button" className="btn-ghost" onClick={toggleTheme}>
            {theme === 'light' ? '深色模式' : '浅色模式'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            hidden
            onChange={(e) => void handleImport(e.target.files)}
          />
        </div>
      </section>

      <section className="shelf">
        <div className="shelf-head">
          <h2>我的书架</h2>
          <span>{books.length} 本</span>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {loading ? <p className="muted">加载中...</p> : null}

        {!loading && books.length === 0 ? (
          <div className="empty">
            <p>还没有书籍，点击上方导入 Markdown 文件</p>
          </div>
        ) : null}

        <div className="book-grid">
          {books.map((book) => (
            <article key={book.id} className="book-card">
              <div className="cover-wrap">
                <Link to={`/read/${book.id}`} className="cover">
                  <span>{book.title.slice(0, 1)}</span>
                </Link>
                <button
                  type="button"
                  className="btn-delete"
                  onClick={() => setPendingDelete(book)}
                >
                  删除
                </button>
              </div>
              <div className="meta">
                <Link to={`/read/${book.id}`} className="title">
                  {book.title}
                </Link>
                <p className="author">{book.author}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ModalConfirm
        open={Boolean(pendingDelete)}
        title="确认删除书籍"
        message={`确定删除《${pendingDelete?.title || ''}》吗？删除后书籍内容、标注与阅读进度都会一起清除，且无法恢复。`}
        loading={deleting}
        onCancel={() => {
          if (!deleting) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </main>
  )
}

export default PageHome
