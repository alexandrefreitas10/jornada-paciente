import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { listPatientTerms, createPatientTerm } from '@/lib/patient-terms'
import { uploadFile } from '@/lib/s3'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const terms = await listPatientTerms(Number(id))
  return Response.json(terms)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? 'Desconhecido'

  const formData = await req.formData()
  const title = (formData.get('title') as string | null)?.trim()
  const file = formData.get('file') as File | null

  if (!title || !file) {
    return Response.json({ error: 'Título e arquivo obrigatórios' }, { status: 400 })
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
  const s3Key = `patients/${id}/terms/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadFile(s3Key, buffer, file.type as never)

  const term = await createPatientTerm(Number(id), title, createdBy, s3Key, file.name, file.type)
  return Response.json(term, { status: 201 })
}
