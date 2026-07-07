import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST: marcar sessão como concluída / DELETE: desmarcar
export async function POST(req: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params
  const { session_number } = await req.json()
  await sql`
    INSERT INTO aesthetic_session_completions (aesthetic_session_id, session_number)
    VALUES (${Number(sid)}, ${Number(session_number)})
    ON CONFLICT DO NOTHING
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params
  const { session_number } = await req.json()
  await sql`
    DELETE FROM aesthetic_session_completions
    WHERE aesthetic_session_id = ${Number(sid)} AND session_number = ${Number(session_number)}
  `
  return NextResponse.json({ ok: true })
}
