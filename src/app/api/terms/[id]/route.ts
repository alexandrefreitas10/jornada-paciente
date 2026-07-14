import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { deleteTerm } from '@/lib/terms'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  await deleteTerm(Number(id))
  return Response.json({ ok: true })
}
