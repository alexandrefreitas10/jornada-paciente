import { NextRequest } from 'next/server'
import { deleteTerm } from '@/lib/terms'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteTerm(Number(id))
  return Response.json({ ok: true })
}
