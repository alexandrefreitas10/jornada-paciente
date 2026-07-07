import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params
  const { session_number, observation } = await req.json()
  const [row] = await sql`
    INSERT INTO aesthetic_session_completions (aesthetic_session_id, session_number, observation)
    VALUES (${Number(sid)}, ${Number(session_number)}, ${observation ?? null})
    ON CONFLICT (aesthetic_session_id, session_number)
    DO UPDATE SET observation = EXCLUDED.observation
    RETURNING session_number, observation, completed_at
  `
  return NextResponse.json(row)
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
