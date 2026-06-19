import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { listPatientTerms, createPatientTerm } from '@/lib/patient-terms'

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
  const { title, content } = await req.json()
  if (!title?.trim() || !content?.trim()) {
    return Response.json({ error: 'Título e conteúdo obrigatórios' }, { status: 400 })
  }
  const term = await createPatientTerm(Number(id), title.trim(), content.trim(), createdBy)
  return Response.json(term, { status: 201 })
}
