import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { listTerms, createTerm } from '@/lib/terms'
import { uploadFile } from '@/lib/s3'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const terms = await listTerms()
  return Response.json(terms)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const createdBy = session?.user?.name ?? 'Desconhecido'

  const formData = await req.formData()
  const title = (formData.get('title') as string | null)?.trim()
  const content = (formData.get('content') as string | null)?.trim()
  const file = formData.get('file') as File | null
  const fieldsRaw = formData.get('fields') as string | null
  const fields: string[] = fieldsRaw ? JSON.parse(fieldsRaw) : []

  if (!title) {
    return Response.json({ error: 'Título obrigatório' }, { status: 400 })
  }

  // Text-based
  if (content && !file) {
    const term = await createTerm({
      title,
      content,
      fields,
      createdBy,
    })
    return Response.json(term, { status: 201 })
  }

  if (!file) {
    return Response.json({ error: 'Arquivo ou texto obrigatório' }, { status: 400 })
  }

  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
  if (!allowed.includes(file.type)) {
    return Response.json({ error: 'Apenas PDF ou Word são aceitos' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'pdf'
  const s3Key = `terms/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadFile(s3Key, buffer, file.type as never)

  const term = await createTerm({
    title,
    fileS3Key: s3Key,
    fileName: file.name,
    fileMime: file.type,
    fields,
    createdBy,
  })

  return Response.json(term, { status: 201 })
}
