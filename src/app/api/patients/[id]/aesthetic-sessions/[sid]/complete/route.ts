import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params
  const { session_number, observation, measurements } = await req.json()
  const measJson = JSON.stringify(measurements ?? [])
  // Garante que a coluna existe antes de tentar salvar
  await sql.unsafe(`ALTER TABLE aesthetic_session_completions ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '[]'`).catch(() => {})
  try {
    const [row] = await sql`
      INSERT INTO aesthetic_session_completions (aesthetic_session_id, session_number, observation, measurements)
      VALUES (${Number(sid)}, ${Number(session_number)}, ${observation ?? null}, ${measJson}::jsonb)
      ON CONFLICT (aesthetic_session_id, session_number)
      DO UPDATE SET observation = EXCLUDED.observation, measurements = EXCLUDED.measurements
      RETURNING session_number, observation, measurements, completed_at
    `
    return NextResponse.json(row)
  } catch {
    // Fallback: coluna measurements pode não existir ainda em produção
    const [row] = await sql`
      INSERT INTO aesthetic_session_completions (aesthetic_session_id, session_number, observation)
      VALUES (${Number(sid)}, ${Number(session_number)}, ${observation ?? null})
      ON CONFLICT (aesthetic_session_id, session_number)
      DO UPDATE SET observation = EXCLUDED.observation
      RETURNING session_number, observation, completed_at
    `
    return NextResponse.json({ ...row, measurements: [] })
  }
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
