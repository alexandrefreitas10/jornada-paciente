import { NextRequest } from 'next/server'
import { deleteTabNote } from '@/lib/tab-notes'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ nid: string }> }
) {
  const { nid } = await params
  await deleteTabNote(Number(nid))
  return new Response(null, { status: 204 })
}
