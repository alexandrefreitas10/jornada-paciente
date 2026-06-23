import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { listTerms, createTerm } from '@/lib/terms'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const terms = await listTerms()
  return Response.json(terms)
}

export async function POST(req: NextRequest) {
  try {
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

    const buffer = Buffer.from(await file.arrayBuffer())

    const term = await createTerm({
      title,
      fileData: buffer,
      fileName: file.name,
      fileMime: file.type,
      fields,
      createdBy,
    })

    return Response.json(term, { status: 201 })
  } catch (err) {
    console.error('[POST /api/terms]', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
