export type BookMeta = {
  id: string
  title: string
  author: string
  filename: string
  importedAt: string
}

export type BookDetail = BookMeta & {
  content: string
}

export type AnnotationType = 'doubt' | 'highlight' | 'thought'

export type Annotation = {
  id: string
  bookId: string
  type: AnnotationType
  color: string
  text: string
  note?: string
  startOffset: number
  endOffset: number
  createdAt: string
}

export type Progress = {
  bookId: string
  scrollRatio: number
  updatedAt: string
}

export type TocItem = {
  id: string
  text: string
  level: number
}

export const HIGHLIGHT_COLORS = [
  { id: 'pink', value: '#f8b4b4' },
  { id: 'purple', value: '#c4b5fd' },
  { id: 'blue', value: '#93c5fd' },
  { id: 'green', value: '#86efac' },
  { id: 'sand', value: '#e7d5b5' },
] as const
