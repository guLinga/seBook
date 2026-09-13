import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const booksDir = path.join(rootDir, 'public', 'default-books')
const manifestPath = path.join(booksDir, 'manifest.json')
const annotationsDir = path.join(dataDir, 'annotations')
const progressDir = path.join(dataDir, 'progress')

const upload = multer({ storage: multer.memoryStorage() })
const app = express()
const PORT = 8787

type ManifestItem = {
  id: string
  title: string
  author: string
  file: string
  importedAt: string
}

type BookMeta = {
  id: string
  title: string
  author: string
  filename: string
  importedAt: string
}

type Annotation = {
  id: string
  bookId: string
  type: 'doubt' | 'highlight' | 'thought'
  color: string
  text: string
  note?: string
  startOffset: number
  endOffset: number
  createdAt: string
}

type Progress = {
  bookId: string
  scrollRatio: number
  updatedAt: string
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

async function ensureDirs() {
  await fs.mkdir(booksDir, { recursive: true })
  await fs.mkdir(annotationsDir, { recursive: true })
  await fs.mkdir(progressDir, { recursive: true })
  try {
    await fs.access(manifestPath)
  } catch {
    await fs.writeFile(manifestPath, '[]', 'utf-8')
  }
}

async function readManifest(): Promise<ManifestItem[]> {
  const raw = await fs.readFile(manifestPath, 'utf-8')
  return JSON.parse(raw) as ManifestItem[]
}

async function writeManifest(list: ManifestItem[]) {
  await fs.writeFile(manifestPath, JSON.stringify(list, null, 2), 'utf-8')
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

app.use(cors())
app.use(express.json({ limit: '5mb' }))

app.get('/api/books', async (_req, res) => {
  const list = await readManifest()
  res.json(
    list
      .map(toBookMeta)
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
  )
})

app.get('/api/books/:id', async (req, res) => {
  const list = await readManifest()
  const item = list.find((book) => book.id === req.params.id)
  if (!item) {
    res.status(404).json({ message: '书籍不存在' })
    return
  }
  const content = await fs.readFile(path.join(booksDir, item.file), 'utf-8')
  res.json({ ...toBookMeta(item), content })
})

app.put('/api/books/:id', async (req, res) => {
  const list = await readManifest()
  const index = list.findIndex((book) => book.id === req.params.id)
  if (index === -1) {
    res.status(404).json({ message: '书籍不存在' })
    return
  }

  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  if (!content.trim()) {
    res.status(400).json({ message: '内容不能为空' })
    return
  }

  const item = list[index]
  const { body, data } = parseFrontmatter(content)
  const title = data.title || extractTitle(body, item.title)
  const author = data.author || item.author
  const nextItem: ManifestItem = {
    ...item,
    title,
    author,
  }

  await fs.writeFile(path.join(booksDir, item.file), content, 'utf-8')
  if (nextItem.title !== item.title || nextItem.author !== item.author) {
    list[index] = nextItem
    await writeManifest(list)
  }

  res.json({ ...toBookMeta(nextItem), content })
})

app.post('/api/books/import', upload.array('files'), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined
  if (!files?.length) {
    res.status(400).json({ message: '请选择 Markdown 文件' })
    return
  }

  const list = await readManifest()
  const imported: BookMeta[] = []

  for (const file of files) {
    if (!file.originalname.toLowerCase().endsWith('.md')) continue
    const raw = file.buffer.toString('utf-8')
    const { body, data } = parseFrontmatter(raw)
    const id = randomUUID()
    const filename = `${id}.md`
    const title = data.title || extractTitle(body, stripExtension(file.originalname))
    const author = data.author || '未知作者'
    const importedAt = new Date().toISOString()
    const item: ManifestItem = {
      id,
      title,
      author,
      file: filename,
      importedAt,
    }
    await fs.writeFile(path.join(booksDir, filename), raw, 'utf-8')
    await fs.writeFile(path.join(annotationsDir, `${id}.json`), '[]', 'utf-8')
    await fs.writeFile(
      path.join(progressDir, `${id}.json`),
      JSON.stringify({ bookId: id, scrollRatio: 0, updatedAt: importedAt }, null, 2),
      'utf-8',
    )
    list.push(item)
    imported.push(toBookMeta(item))
  }

  await writeManifest(list)
  res.json(imported)
})

app.delete('/api/books/:id', async (req, res) => {
  const list = await readManifest()
  const book = list.find((item) => item.id === req.params.id)
  if (!book) {
    res.status(404).json({ message: '书籍不存在' })
    return
  }
  const next = list.filter((item) => item.id !== req.params.id)
  await writeManifest(next)
  await fs.rm(path.join(booksDir, book.file), { force: true })
  await fs.rm(path.join(annotationsDir, `${book.id}.json`), { force: true })
  await fs.rm(path.join(progressDir, `${book.id}.json`), { force: true })
  res.json({ ok: true })
})

app.get('/api/books/:id/annotations', async (req, res) => {
  const file = path.join(annotationsDir, `${req.params.id}.json`)
  try {
    const raw = await fs.readFile(file, 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.json([])
  }
})

app.post('/api/books/:id/annotations', async (req, res) => {
  const file = path.join(annotationsDir, `${req.params.id}.json`)
  let list: Annotation[] = []
  try {
    list = JSON.parse(await fs.readFile(file, 'utf-8')) as Annotation[]
  } catch {
    list = []
  }
  const body = req.body as Omit<Annotation, 'id' | 'bookId' | 'createdAt'>
  const item: Annotation = {
    id: randomUUID(),
    bookId: req.params.id,
    type: body.type,
    color: body.color,
    text: body.text,
    note: body.note,
    startOffset: body.startOffset,
    endOffset: body.endOffset,
    createdAt: new Date().toISOString(),
  }
  list.push(item)
  await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf-8')
  res.json(item)
})

app.put('/api/books/:id/annotations/:annotationId', async (req, res) => {
  const file = path.join(annotationsDir, `${req.params.id}.json`)
  let list: Annotation[] = []
  try {
    list = JSON.parse(await fs.readFile(file, 'utf-8')) as Annotation[]
  } catch {
    list = []
  }
  const index = list.findIndex((item) => item.id === req.params.annotationId)
  if (index === -1) {
    res.status(404).json({ message: '标注不存在' })
    return
  }
  const body = req.body as Partial<Pick<Annotation, 'type' | 'color' | 'note'>>
  const current = list[index]
  const nextItem: Annotation = {
    ...current,
    type: body.type || current.type,
    color: body.color || current.color,
    note: body.note !== undefined ? body.note || undefined : current.note,
  }
  list[index] = nextItem
  await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf-8')
  res.json(nextItem)
})

app.delete('/api/books/:id/annotations/:annotationId', async (req, res) => {
  const file = path.join(annotationsDir, `${req.params.id}.json`)
  let list: Annotation[] = []
  try {
    list = JSON.parse(await fs.readFile(file, 'utf-8')) as Annotation[]
  } catch {
    list = []
  }
  const next = list.filter((item) => item.id !== req.params.annotationId)
  await fs.writeFile(file, JSON.stringify(next, null, 2), 'utf-8')
  res.json({ ok: true })
})

app.get('/api/books/:id/progress', async (req, res) => {
  const file = path.join(progressDir, `${req.params.id}.json`)
  try {
    const raw = await fs.readFile(file, 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.json({ bookId: req.params.id, scrollRatio: 0, updatedAt: new Date().toISOString() })
  }
})

app.put('/api/books/:id/progress', async (req, res) => {
  const file = path.join(progressDir, `${req.params.id}.json`)
  const progress: Progress = {
    bookId: req.params.id,
    scrollRatio: Number(req.body.scrollRatio) || 0,
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(file, JSON.stringify(progress, null, 2), 'utf-8')
  res.json(progress)
})

await ensureDirs()
app.listen(PORT, () => {
  console.log(`seRead API http://localhost:${PORT}`)
  console.log(`统一书库目录: ${booksDir}`)
})
