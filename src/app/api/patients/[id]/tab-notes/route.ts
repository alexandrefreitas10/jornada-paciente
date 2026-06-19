import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { listTabNotes, createTabNote } from '@/lib/tab-notes'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tab = req.nextUrl.searchParams.get('tab') ?? ''
  const notes = await listTabNotes(Number(id), tab)
  return Response.json(notes)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? 'Desconhecido'
  const { tab, content } = await req.json()
  if (!tab || !content?.trim()) {
    return Response.json({ error: 'Campos obrigatórios' }, { status: 400 })
  }
  const note = await createTabNote(Number(id), tab, content.trim(), createdBy)
  return Response.json(note, { status: 201 })
}
