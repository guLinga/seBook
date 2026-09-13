import type { Annotation, BookDetail, BookMeta, Progress } from '../types'

const DB_NAME = 'seread-db'
const DB_VERSION = 1

type BookRecord = BookDetail

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('annotations')) {
        db.createObjectStore('annotations', { keyPath: 'bookId' })
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'bookId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开本地数据库失败'))
  })
}

function storeRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const request = run(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error || new Error('本地存储操作失败'))
      }),
  )
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { body: content, data: {} as Record<string, string> }

  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    data[key] = value
  }
  return { body: content.slice(match[0].length), data }
}

function extractTitle(body: string, fallback: string) {
  const heading = body.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

function stripExtension(name: string) {
  return name.replace(/\.md$/i, '')
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function localFetchBooks() {
  const books = await storeRequest<BookRecord[]>('books', 'readonly', (store) => store.getAll())
  return books
    .map(({ content: _content, ...meta }) => meta)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export async function localFetchBook(id: string) {
  const book = await storeRequest<BookRecord | undefined>('books', 'readonly', (store) => store.get(id))
  if (!book) throw new Error('书籍不存在')
  return book
}

export async function localImportBooks(files: FileList | File[]) {
  const list = Array.from(files)
  const imported: BookMeta[] = []

  for (const file of list) {
    if (!file.name.toLowerCase().endsWith('.md')) continue
    const raw = await file.text()
    const { body, data } = parseFrontmatter(raw)
    const id = createId()
    const title = data.title || extractTitle(body, stripExtension(file.name))
    const author = data.author || '未知作者'
    const meta: BookMeta = {
      id,
      title,
      author,
      filename: `${id}.md`,
      importedAt: new Date().toISOString(),
    }
    const record: BookRecord = { ...meta, content: raw }
    await storeRequest('books', 'readwrite', (store) => store.put(record))
    await storeRequest('annotations', 'readwrite', (store) => store.put({ bookId: id, items: [] }))
    await storeRequest('progress', 'readwrite', (store) =>
      store.put({ bookId: id, scrollRatio: 0, updatedAt: new Date().toISOString() }),
    )
    imported.push(meta)
  }

  return imported
}

export async function localDeleteBook(id: string) {
  await storeRequest('books', 'readwrite', (store) => store.delete(id))
  await storeRequest('annotations', 'readwrite', (store) => store.delete(id))
  await storeRequest('progress', 'readwrite', (store) => store.delete(id))
  return { ok: true }
}

export async function localFetchAnnotations(bookId: string) {
  const row = await storeRequest<{ bookId: string; items: Annotation[] } | undefined>(
    'annotations',
    'readonly',
    (store) => store.get(bookId),
  )
  return row?.items || []
}

export async function localCreateAnnotation(
  bookId: string,
  payload: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>,
) {
  const items = await localFetchAnnotations(bookId)
  const item: Annotation = {
    id: createId(),
    bookId,
    type: payload.type,
    color: payload.color,
    text: payload.text,
    note: payload.note,
    startOffset: payload.startOffset,
    endOffset: payload.endOffset,
    createdAt: new Date().toISOString(),
  }
  items.push(item)
  await storeRequest('annotations', 'readwrite', (store) => store.put({ bookId, items }))
  return item
}

export async function localUpdateAnnotation(
  bookId: string,
  annotationId: string,
  payload: Partial<Pick<Annotation, 'type' | 'color' | 'note'>>,
) {
  const items = await localFetchAnnotations(bookId)
  const index = items.findIndex((item) => item.id === annotationId)
  if (index === -1) throw new Error('标注不存在')
  const current = items[index]
  const next: Annotation = {
    ...current,
    type: payload.type || current.type,
    color: payload.color || current.color,
    note: payload.note !== undefined ? payload.note || undefined : current.note,
  }
  items[index] = next
  await storeRequest('annotations', 'readwrite', (store) => store.put({ bookId, items }))
  return next
}

export async function localDeleteAnnotation(bookId: string, annotationId: string) {
  const items = (await localFetchAnnotations(bookId)).filter((item) => item.id !== annotationId)
  await storeRequest('annotations', 'readwrite', (store) => store.put({ bookId, items }))
  return { ok: true }
}

export async function localFetchProgress(bookId: string) {
  const row = await storeRequest<Progress | undefined>('progress', 'readonly', (store) =>
    store.get(bookId),
  )
  return row || { bookId, scrollRatio: 0, updatedAt: new Date().toISOString() }
}

export async function localSaveProgress(bookId: string, scrollRatio: number) {
  const progress: Progress = {
    bookId,
    scrollRatio,
    updatedAt: new Date().toISOString(),
  }
  await storeRequest('progress', 'readwrite', (store) => store.put(progress))
  return progress
}
