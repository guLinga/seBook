import type { Annotation, BookDetail, BookMeta, Progress } from '../types'
import {
  localCreateAnnotation,
  localDeleteAnnotation,
  localDeleteBook,
  localFetchAnnotations,
  localFetchBook,
  localFetchBooks,
  localFetchProgress,
  localImportBooks,
  localSaveProgress,
  localUpdateAnnotation,
  seedDefaultBooksIfNeeded,
} from '../storage/browser-store'

const useLocalStorage = import.meta.env.VITE_STORAGE_MODE === 'local'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error(data.message || '请求失败')
  }
  return res.json() as Promise<T>
}

export async function fetchBooks() {
  if (useLocalStorage) {
    await seedDefaultBooksIfNeeded()
    return localFetchBooks()
  }
  return request<BookMeta[]>('/api/books')
}

export function fetchBook(id: string) {
  if (useLocalStorage) return localFetchBook(id)
  return request<BookDetail>(`/api/books/${id}`)
}

export async function importBooks(files: FileList | File[]) {
  if (useLocalStorage) return localImportBooks(files)
  const form = new FormData()
  Array.from(files).forEach((file) => form.append('files', file))
  return request<BookMeta[]>('/api/books/import', {
    method: 'POST',
    body: form,
  })
}

export function deleteBook(id: string) {
  if (useLocalStorage) return localDeleteBook(id)
  return request<{ ok: boolean }>(`/api/books/${id}`, { method: 'DELETE' })
}

export function fetchAnnotations(bookId: string) {
  if (useLocalStorage) return localFetchAnnotations(bookId)
  return request<Annotation[]>(`/api/books/${bookId}/annotations`)
}

export function createAnnotation(
  bookId: string,
  payload: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>,
) {
  if (useLocalStorage) return localCreateAnnotation(bookId, payload)
  return request<Annotation>(`/api/books/${bookId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function updateAnnotation(
  bookId: string,
  annotationId: string,
  payload: Partial<Pick<Annotation, 'type' | 'color' | 'note'>>,
) {
  if (useLocalStorage) return localUpdateAnnotation(bookId, annotationId, payload)
  return request<Annotation>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteAnnotation(bookId: string, annotationId: string) {
  if (useLocalStorage) return localDeleteAnnotation(bookId, annotationId)
  return request<{ ok: boolean }>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'DELETE',
  })
}

export function fetchProgress(bookId: string) {
  if (useLocalStorage) return localFetchProgress(bookId)
  return request<Progress>(`/api/books/${bookId}/progress`)
}

export function saveProgress(bookId: string, scrollRatio: number) {
  if (useLocalStorage) return localSaveProgress(bookId, scrollRatio)
  return request<Progress>(`/api/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scrollRatio }),
  })
}
