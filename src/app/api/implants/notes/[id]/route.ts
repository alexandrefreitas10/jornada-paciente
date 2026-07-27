import { NextRequest, NextResponse } from 'next/server'
import sql, { initSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DELETE /api/implants/notes/[id] — apaga uma observação
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initSchema()
  const { id } = await params
  await sql`DELETE FROM implant_notes WHERE id = ${Number(id)}`
  return NextResponse.json({ ok: true })
}
