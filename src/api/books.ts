import type { Annotation, BookDetail, BookMeta, Progress } from '../types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: '请求失败' }))
    throw new Error(data.message || '请求失败')
  }
  return res.json() as Promise<T>
}

export function fetchBooks() {
  return request<BookMeta[]>('/api/books')
}

export function fetchBook(id: string) {
  return request<BookDetail>(`/api/books/${id}`)
}

export async function importBooks(files: FileList | File[]) {
  const form = new FormData()
  Array.from(files).forEach((file) => form.append('files', file))
  return request<BookMeta[]>('/api/books/import', {
    method: 'POST',
    body: form,
  })
}

export function deleteBook(id: string) {
  return request<{ ok: boolean }>(`/api/books/${id}`, { method: 'DELETE' })
}

export function fetchAnnotations(bookId: string) {
  return request<Annotation[]>(`/api/books/${bookId}/annotations`)
}

export function createAnnotation(
  bookId: string,
  payload: Omit<Annotation, 'id' | 'bookId' | 'createdAt'>,
) {
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
  return request<Annotation>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteAnnotation(bookId: string, annotationId: string) {
  return request<{ ok: boolean }>(`/api/books/${bookId}/annotations/${annotationId}`, {
    method: 'DELETE',
  })
}

export function fetchProgress(bookId: string) {
  return request<Progress>(`/api/books/${bookId}/progress`)
}

export function saveProgress(bookId: string, scrollRatio: number) {
  return request<Progress>(`/api/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scrollRatio }),
  })
}
