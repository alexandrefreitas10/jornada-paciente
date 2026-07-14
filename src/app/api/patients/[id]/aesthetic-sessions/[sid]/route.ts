import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params
  // Anti-IDOR: só apaga se a sessão pertence ao paciente do path
  await sql`DELETE FROM aesthetic_sessions WHERE id = ${Number(sid)} AND patient_id = ${Number(id)}`
  return NextResponse.json({ ok: true })
}
