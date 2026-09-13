import type { Annotation, BookDetail, BookMeta, Progress } from '../types'
import { isStaticReadonly } from '../config'
import {
  staticFetchAnnotations,
  staticFetchBook,
  staticFetchBooks,
  staticFetchProgress,
  staticSaveProgress,
} from '../storage/static-books'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error(data.message || '请求失败')
  }
  return res.json() as Promise<T>
}

export function fetchBooks() {
  if (isStaticReadonly) return staticFetchBooks()
  return request<BookMeta[]>('/api/books')
}

export function fetchBook(id: string) {
  if (isStaticReadonly) return staticFetchBook(id)
  return request<BookDetail>(`/api/books/${id}`)
}

export async function importBooks(files: FileList | File[]) {
  if (isStaticReadonly) throw new Error('线上为只读模式，不支持导入')
  const form = new FormData()
  Array.from(files).forEach((file) => form.append('files', file))
  return request<BookMeta[]>('/api/books/import', {
    method: 'POST',
    body: form,
  })
}

export function deleteBook(id: string) {
  if (isStaticReadonly) return Promise.reject(new Error('线上为只读模式，不支持删除'))
  return request<{ ok: boolean }>(`/api/books/${id}`, { method: 'DELETE' })
}

export function updateBookContent(id: string, content: string) {
  if (isStaticReadonly) return Promise.reject(new Error('线上为只读模式，不支持编辑'))
  return request<BookDetail>(`/api/books/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

export function fetchAnnotations(bookId: string) {
  if (isStaticReadonly) return staticFetchAnnotations(bookId)
  return request<Annotation[]>(`/api/books/${bookId}/annotations`)
}

export function createAnnotation(
  bookId: string,
  payload: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>,
) {
  if (isStaticReadonly) return Promise.reject(new Error('线上为只读模式，不支持标记'))
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
  if (isStaticReadonly) return Promise.reject(new Error('线上为只读模式，不支持标记'))
  return request<Annotation>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteAnnotation(bookId: string, annotationId: string) {
  if (isStaticReadonly) return Promise.reject(new Error('线上为只读模式，不支持标记'))
  return request<{ ok: boolean }>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'DELETE',
  })
}

export function fetchProgress(bookId: string) {
  if (isStaticReadonly) return staticFetchProgress(bookId)
  return request<Progress>(`/api/books/${bookId}/progress`)
}

export function saveProgress(bookId: string, scrollRatio: number) {
  if (isStaticReadonly) return staticSaveProgress(bookId, scrollRatio)
  return request<Progress>(`/api/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scrollRatio }),
  })
}
