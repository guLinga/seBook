import type { Annotation, BookDetail, BookMeta, Progress } from '../types'

type ManifestItem = {
  id: string
  title: string
  author: string
  file: string
  importedAt?: string
}

function booksBase() {
  return `${import.meta.env.BASE_URL}default-books/`
}

function annotationsBase() {
  return `${import.meta.env.BASE_URL}annotations/`
}

function toBookMeta(item: ManifestItem): BookMeta {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    filename: item.file,
    importedAt: item.importedAt || '2026-01-01T00:00:00.000Z',
  }
}

async function loadManifest() {
  const res = await fetch(`${booksBase()}manifest.json`)
  if (!res.ok) throw new Error('加载书单失败')
  return (await res.json()) as ManifestItem[]
}

export async function staticFetchBooks(): Promise<BookMeta[]> {
  const list = await loadManifest()
  return list
    .map(toBookMeta)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export async function staticFetchBook(id: string): Promise<BookDetail> {
  const list = await loadManifest()
  const item = list.find((book) => book.id === id)
  if (!item) throw new Error('书籍不存在')
  const res = await fetch(`${booksBase()}${item.file}`)
  if (!res.ok) throw new Error('加载书籍内容失败')
  const content = await res.text()
  return {
    ...toBookMeta(item),
    content,
  }
}

export async function staticFetchAnnotations(bookId: string): Promise<Annotation[]> {
  const res = await fetch(`${annotationsBase()}${bookId}.json`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error('加载标注失败')
  return (await res.json()) as Annotation[]
}

export function staticFetchProgress(bookId: string): Promise<Progress> {
  return Promise.resolve({
    bookId,
    scrollRatio: 0,
    updatedAt: new Date().toISOString(),
  })
}

export function staticSaveProgress(bookId: string, scrollRatio: number): Promise<Progress> {
  return Promise.resolve({
    bookId,
    scrollRatio,
    updatedAt: new Date().toISOString(),
  })
}
