import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { initSchema } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initSchema()
  const { id } = await params
  const sessions = await sql`
    SELECT
      s.*,
      COALESCE(
        json_agg(c.session_number ORDER BY c.session_number) FILTER (WHERE c.session_number IS NOT NULL),
        '[]'
      ) AS completed_sessions
    FROM aesthetic_sessions s
    LEFT JOIN aesthetic_session_completions c ON c.aesthetic_session_id = s.id
    WHERE s.patient_id = ${Number(id)}
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initSchema()
  const { id } = await params
  const session = await auth()
  const createdBy = session?.user?.name ?? null
  const { procedure_name, total_sessions, sessions_per_week, start_date, end_date, region } = await req.json()
  if (!procedure_name || !total_sessions || !start_date || !end_date) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }
  const [row] = await sql`
    INSERT INTO aesthetic_sessions (patient_id, procedure_name, total_sessions, sessions_per_week, start_date, end_date, region, created_by)
    VALUES (${Number(id)}, ${procedure_name}, ${Number(total_sessions)}, ${Number(sessions_per_week) || 1}, ${start_date}, ${end_date}, ${region ?? null}, ${createdBy})
    RETURNING *
  `
  return NextResponse.json({ ...row, completed_sessions: [] }, { status: 201 })
}
